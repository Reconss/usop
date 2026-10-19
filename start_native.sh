#!/usr/bin/env bash
# =============================================================================
# USOP 非容器启动器
# -----------------------------------------------------------------------------
# 设计：基础设施（PostgreSQL / Redis / Elasticsearch / Kafka / Flink）跑在 Docker，
#       应用（Flask 后端 + React 前端）在宿主机原生运行 —— 便于本地调试、热重载。
#       组件连接信息全部来自 deploy/.env.native（模板见 deploy/.env.native.example）。
#
# 用法：
#   ./start_native.sh                 # 起基础设施 + 后端(5001) + 前端(9000)
#   ./start_native.sh --no-infra      # 基础设施已在别处，仅起应用（按 .env 连远端）
#   ./start_native.sh --build         # 前端改用生产构建并静态托管在 3266
#   ./start_native.sh --skip-web      # 只起后端
#   ./start_native.sh --skip-migrate  # 跳过数据库迁移
#   ./start_native.sh --env my.env    # 指定连接配置文件
#   ./start_native.sh --stop          # 停止基础设施并杀掉应用进程
#   ./start_native.sh --status        # 查看组件 / 应用就绪情况
#   ./start_native.sh --logs [服务]    # 跟踪基础设施日志（应用日志落本地文件）
#   ./start_native.sh -h | --help
#
# 退出：Ctrl-C 或 ./start_native.sh --stop
# =============================================================================
set -Euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT="$SCRIPT_DIR"
INFRA_COMPOSE="$ROOT/docker-compose.infra.yml"
ENV_DEFAULT="$ROOT/deploy/.env.native"
ENV_FILE="$ENV_DEFAULT"
PIDFILE="$ROOT/.usop_native.pids"
BACKEND_LOG="$ROOT/.usop_native_backend.log"
WEB_LOG="$ROOT/.usop_native_web.log"

NO_INFRA=0
SKIP_WEB=0
SKIP_MIGRATE=0
DO_BUILD=0
CMD="up"

if [ -t 1 ]; then
  C_B=$'\033[1;34m'; C_G=$'\033[1;32m'; C_Y=$'\033[1;33m'; C_R=$'\033[1;31m'; C_0=$'\033[0m'
else
  C_B=""; C_G=""; C_Y=""; C_R=""; C_0=""
fi
log()  { printf '%s==>%s %s\n' "$C_B" "$C_0" "$*"; }
ok()   { printf '%s  ✓%s %s\n' "$C_G" "$C_0" "$*"; }
warn() { printf '%s  !%s %s\n' "$C_Y" "$C_0" "$*"; }
err()  { printf '%s  ✗%s %s\n' "$C_R" "$C_0" "$*" >&2; }
die()  { err "$*"; exit 1; }

usage() {
  sed -n '3,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

# ------------------------------------------------------------------ 参数解析
EXTRA_LOGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --no-infra)     NO_INFRA=1 ;;
    --skip-web)     SKIP_WEB=1 ;;
    --skip-migrate) SKIP_MIGRATE=1 ;;
    --build)        DO_BUILD=1 ;;
    --env)          shift; ENV_FILE="${1:-}" ;;
    --stop)         CMD="stop" ;;
    --status)       CMD="status" ;;
    --logs)         CMD="logs"; shift; while [ $# -gt 0 ]; do EXTRA_LOGS+=("$1"); shift; done; break ;;
    -h|--help)      usage; exit 0 ;;
    -*)             die "未知选项: $1（-h 查看帮助）" ;;
    *)              die "未知参数: $1" ;;
  esac
  shift
done

# ------------------------------------------------------------------ 工具
tcp_ok() { (exec 3<>"/dev/tcp/$1/$2") >/dev/null 2>&1; }
have_docker() { command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; }

# 加载连接配置：首次运行从模板复制；随后 export 全部变量供子进程继承
load_env() {
  if [ "$ENV_FILE" = "$ENV_DEFAULT" ] && [ ! -f "$ENV_FILE" ]; then
    mkdir -p "$(dirname "$ENV_FILE")"
    cp "$ROOT/deploy/.env.native.example" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    log "已生成连接配置 $ENV_FILE（按需编辑组件地址）"
  fi
  [ -f "$ENV_FILE" ] || die "找不到连接配置: $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  # 后端读取的作业目录必须是宿主机真实绝对路径（容器内默认 /app/flink-jobs 不适用）
  export FLINK_JOBS_DIR="$ROOT/flink-jobs"
  export SKIP_BIGDATA_CHECK="${SKIP_BIGDATA_CHECK:-1}"
  export FLASK_PORT="${FLASK_PORT:-5001}"
}

# ------------------------------------------------------------------ Python / 依赖
PY=""
ensure_python() {
  if [ -x "$ROOT/server-python/.venv/bin/python" ]; then
    PY="$ROOT/server-python/.venv/bin/python"
  elif python3 -c "import flask,sqlalchemy" >/dev/null 2>&1; then
    PY=python3
  else
    warn "未检测到 Flask 依赖，尝试创建虚拟环境并安装 requirements.txt"
    if [ ! -x "$ROOT/server-python/.venv/bin/python" ]; then
      python3 -m venv "$ROOT/server-python/.venv" \
        || die "创建虚拟环境失败：请手动 pip install -r server-python/requirements.txt"
    fi
    "$ROOT/server-python/.venv/bin/pip" install -r "$ROOT/server-python/requirements.txt" \
      || die "依赖安装失败：请检查网络或手动安装"
    PY="$ROOT/server-python/.venv/bin/python"
  fi
  ok "Python 运行环境就绪: $PY"
}

# ------------------------------------------------------------------ 基础设施
start_infra() {
  have_docker || die "需要 Docker 来运行基础设施（或改用 --no-infra 连接已有组件）"
  command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 \
    || die "缺少 docker compose（v2+）"

  # 本机 5432 被占用（如 macOS Homebrew PostgreSQL）时，自动改用 5433
  local pg_host_port=5432
  if tcp_ok localhost 5432; then
    pg_host_port=5433
    warn "本机 5432 已被占用，PostgreSQL 改用宿主机端口 5433（应用侧 DATABASE_URL 同步）"
    export PG_HOST_PORT=5433
    # 同步改写 DATABASE_URL 端口，避免应用连错
    export DATABASE_URL="${DATABASE_URL/":5432/"/":5433/"}"
  fi

  log "启动基础设施（docker compose -f docker-compose.infra.yml）"
  docker compose -f "$INFRA_COMPOSE" up -d \
    || die "基础设施启动失败，检查 docker-compose.infra.yml 与端口占用"
}

wait_svc() {  # wait_svc label check_cmd timeout
  local label="$1" cmd="$2" timeout="$3" i=0
  while [ "$i" -lt "$timeout" ]; do
    if eval "$cmd" >/dev/null 2>&1; then ok "$label 就绪"; return 0; fi
    i=$((i + 3)); sleep 3
  done
  warn "$label 在 ${timeout}s 内未就绪（可继续，但相关功能可能不可用）"
  return 1
}

wait_infra() {
  log "等待基础设施就绪"
  wait_svc "PostgreSQL(:${PG_HOST_PORT:-5432})" \
    "docker exec usop_infra_pg pg_isready -U ${PG_USER:-usop} -d ${PG_DB:-usop_security}" 120
  wait_svc "Redis(:6379)" "docker exec usop_infra_redis redis-cli ping" 60
  wait_svc "Elasticsearch(:9200)" "curl -fs http://localhost:9200/_cluster/health" 120
  wait_svc "Kafka(:9092)" "docker exec usop_infra_kafka kafka-broker-api-versions --bootstrap-server localhost:9092" 120
  wait_svc "Flink JobManager(:8081)" "curl -fs http://localhost:8081/overview" 90
  wait_svc "Flink SQL Gateway(:8083)" "curl -fs http://localhost:8083/v1/info" 90
}

# ------------------------------------------------------------------ 迁移
run_migrate() {
  [ "$SKIP_MIGRATE" = 1 ] && { warn "已跳过数据库迁移"; return 0; }
  log "执行数据库迁移（add_vuln_fields 等）"
  ( cd "$ROOT/server-python" && PYTHONPATH="$ROOT/server-python" "$PY" migrations/add_vuln_fields.py ) \
    && ok "迁移完成" || warn "迁移返回非零（已执行过可忽略）；表结构由应用启动时 create_all 自动建"
}

# ------------------------------------------------------------------ 应用
start_backend() {
  log "启动 Flask 后端（端口 ${FLASK_PORT}）"
  cd "$ROOT/server-python"
  nohup env "$PY" run.py >"$BACKEND_LOG" 2>&1 &
  local pid=$!
  echo "backend=$pid" >>"$PIDFILE"
  # 等端口起来
  local i=0
  while [ "$i" -lt 60 ]; do
    tcp_ok localhost "${FLASK_PORT}" && { ok "后端已监听 :${FLASK_PORT}"; return 0; }
    # 进程是否还活着
    kill -0 "$pid" 2>/dev/null || { err "后端进程退出，查看 $BACKEND_LOG"; tail -n 30 "$BACKEND_LOG" >&2; return 1; }
    i=$((i + 2)); sleep 2
  done
  warn "后端端口 ${FLASK_PORT} 未在预期内监听，查看 $BACKEND_LOG"
}

start_web() {
  local web_cmd
  if command -v pnpm >/dev/null 2>&1 && [ -f "$ROOT/web/pnpm-lock.yaml" ]; then
    web_cmd="pnpm dev"
  else
    web_cmd="npm run dev"
  fi

  if [ "$DO_BUILD" = 1 ]; then
    log "构建前端（生产）并静态托管在 3266"
    ( cd "$ROOT/web" && (pnpm build 2>/dev/null || npm run build) ) \
      || die "前端构建失败"
    start_static_3266
    return 0
  fi

  log "启动前端开发服务器（webpack，端口 9000，/api 代理到 :${FLASK_PORT}）"
  cd "$ROOT/web"
  nohup bash -c "$web_cmd" >"$WEB_LOG" 2>&1 &
  local pid=$!
  echo "web=$pid" >>"$PIDFILE"
  local i=0
  while [ "$i" -lt 60 ]; do
    tcp_ok localhost 9000 && { ok "前端已监听 :9000"; return 0; }
    kill -0 "$pid" 2>/dev/null || { err "前端进程退出，查看 $WEB_LOG"; tail -n 30 "$WEB_LOG" >&2; return 1; }
    i=$((i + 2)); sleep 2
  done
  warn "前端端口 9000 未在预期内监听，查看 $WEB_LOG"
}

# 最小 SPA 静态服务器（--build）：带 historyApiFallback
start_static_3266() {
  local server_py="$ROOT/.usop_static_server.py"
  cat >"$server_py" <<'PY'
import sys, os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 3266

class SPA(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)
    def do_GET(self):
        path = self.translate_path(self.path)
        if not os.path.exists(path) and not os.path.isdir(path):
            self.path = "/index.html"
        return super().do_GET()

if __name__ == "__main__":
    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), SPA)
    print(f"Serving {ROOT} on :{PORT}")
    httpd.serve_forever()
PY
  cd "$ROOT"
  nohup "$PY" "$server_py" "$ROOT/web/dist" 3266 >"$WEB_LOG" 2>&1 &
  local pid=$!
  echo "web=$pid" >>"$PIDFILE"
  local i=0
  while [ "$i" -lt 30 ]; do
    tcp_ok localhost 3266 && { ok "前端构建产物已托管在 :3266"; return 0; }
    kill -0 "$pid" 2>/dev/null || { err "静态服务器退出，查看 $WEB_LOG"; return 1; }
    i=$((i + 2)); sleep 2
  done
}

# ------------------------------------------------------------------ 进程管理
save_pids_reset() { : >"$PIDFILE"; }
kill_saved() {
  [ -f "$PIDFILE" ] || return 0
  while IFS= read -r line; do
    pid="${line#*=}"
    [ -n "${pid:-}" ] && kill "$pid" 2>/dev/null && ok "已停止进程 $pid"
  done <"$PIDFILE"
  rm -f "$PIDFILE"
}

cleanup() {
  echo
  log "正在停止应用进程..."
  kill_saved 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# ------------------------------------------------------------------ 子命令
cmd_stop() {
  load_env 2>/dev/null || true
  if [ "$NO_INFRA" = 0 ] && have_docker; then
    log "停止基础设施"
    docker compose -f "$INFRA_COMPOSE" down || true
  fi
  kill_saved
  ok "已停止（数据目录 data/infra 保留）"
}

cmd_status() {
  load_env 2>/dev/null || true
  if [ "$NO_INFRA" = 0 ] && have_docker; then
    docker compose -f "$INFRA_COMPOSE" ps -a || true
  fi
  echo
  tcp_ok localhost "${FLASK_PORT:-5001}" && ok "后端 :${FLASK_PORT:-5001} 可达" || warn "后端 :${FLASK_PORT:-5001} 未运行"
  tcp_ok localhost 9000 && ok "前端 :9000 可达" || warn "前端 :9000 未运行（若用 --build 则为 3266）"
  tcp_ok localhost 3266 && ok "前端构建 :3266 可达" || true
}

cmd_logs() {
  load_env 2>/dev/null || true
  if [ "$NO_INFRA" = 0 ] && have_docker; then
    docker compose -f "$INFRA_COMPOSE" logs --tail=120 -f ${EXTRA_LOGS[@]+"${EXTRA_LOGS[@]}"}
  else
    warn "非容器模式（--no-infra）无基础设施日志；应用日志："
    echo "  后端: $BACKEND_LOG"
    echo "  前端: $WEB_LOG"
  fi
}

# ------------------------------------------------------------------ 主流程
main() {
  case "$CMD" in
    stop)    cmd_stop; return 0 ;;
    status)  cmd_status; return 0 ;;
    logs)    cmd_logs; return 0 ;;
  esac

  load_env
  ensure_python

  if [ "$NO_INFRA" = 0 ]; then
    start_infra
    wait_infra
  else
    warn "已跳过基础设施（--no-infra）：请确保 .env.native 中的组件地址指向可达的远端"
  fi

  save_pids_reset
  start_backend || true
  # 后端启动时会 create_all 建表，建好后再跑迁移补列，避免全新库上迁移失败
  [ "$SKIP_MIGRATE" = 1 ] || run_migrate || true
  [ "$SKIP_WEB" = 1 ] || start_web || true

  echo
  printf '%s============================================================%s\n' "$C_G" "$C_0"
  printf '%s  USOP 非容器模式已启动（基础设施: %s）%s\n' "$C_G" "$C_0" "$([ "$NO_INFRA" = 1 ] && echo 外部 || echo Docker)"
  printf '%s============================================================%s\n' "$C_G" "$C_0"
  if [ "$DO_BUILD" = 1 ]; then
    echo "  前端(构建)  http://localhost:3266"
  else
    echo "  前端(开发)  http://localhost:9000"
  fi
  echo "  后端 API    http://localhost:${FLASK_PORT:-5001}/api/health"
  echo "  PostgreSQL  localhost:${PG_HOST_PORT:-5432}   Redis localhost:6379"
  echo "  ES          http://localhost:9200   Kafka localhost:9092"
  echo "  Flink UI    http://localhost:8081   SQL Gateway http://localhost:8083"
  echo "  后端日志    $BACKEND_LOG"
  echo "  前端日志    $WEB_LOG"
  echo "  停止        ./start_native.sh --stop   或  Ctrl-C"
  echo
  log "按 Ctrl-C 停止所有进程"
  # 前台挂起，等待信号触发 cleanup
  while true; do sleep 3600; done
}

main "$@"
