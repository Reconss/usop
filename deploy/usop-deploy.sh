#!/usr/bin/env bash
# =============================================================================
# USOP 一键部署脚本
#
#   单机全栈        ./deploy/usop-deploy.sh all-in-one
#   应用节点        ./deploy/usop-deploy.sh app --data-host 10.0.0.12 --es-host 10.0.0.13
#   数据节点        ./deploy/usop-deploy.sh data
#   检索节点        ./deploy/usop-deploy.sh es
#
#   其它：init | verify | status | logs | restart | stop | upgrade | backup
#
# 特性：首次运行自动生成配置（随机密码、按内存自动分配 JVM 堆）、幂等可重复执行、
#       部署完自动做健康检查与初始化。
# =============================================================================
set -Eeuo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"
ENV_FILE="${USOP_ENV_FILE:-$SCRIPT_DIR/usop.env}"
ENV_EXAMPLE="$SCRIPT_DIR/usop.env.example"
FLINK_CONF_SRC="$ROOT_DIR/flink-conf/flink-conf.yaml"
FLINK_CONF_DST="$SCRIPT_DIR/conf/flink-conf.yaml"

PROFILE=""
NO_BUILD=0
SKIP_INIT=0
FOLLOW=0
DATA_HOST=""
ES_HOST=""
EXTRA_ARGS=()
FIRST_RUN=0

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
  cat <<'EOF'
USOP 一键部署

用法:
  usop-deploy.sh <命令> [选项]

命令:
  all-in-one          单机部署全栈（应用 + 数据库 + Kafka/Flink + ES）
  app                 应用节点（usop + postgres + redis）
  data                数据节点（kafka + flink）
  es                  检索节点（elasticsearch）
  init                只跑初始化（迁移 / 管道 / 封禁剧本）
  verify              健康检查与能力自检
  status              查看容器状态与访问地址
  logs [服务]         查看日志（默认最近 120 行）
  restart             重启本机已部署的服务
  stop                停止并移除本机容器（数据保留）
  upgrade             重新构建镜像并滚动更新（不清库）
  backup              备份 PostgreSQL 与上传附件

选项:
  --data-host <IP>    数据节点地址（部署 app 时必填，首次写进 usop.env）
  --es-host <IP>      检索节点地址（部署 app 时必填）
  --no-build          跳过镜像构建（用现有镜像）
  --skip-init         跳过初始化（迁移/管道/剧本）
  --follow, -f        logs 时持续跟随
  --env <文件>        指定配置文件（默认 deploy/usop.env）
  -h, --help          显示帮助

示例:
  # 3 台机器：10.0.0.11 应用 / 10.0.0.12 数据 / 10.0.0.13 检索
  ./deploy/usop-deploy.sh es                 # 在 10.0.0.13 执行
  ./deploy/usop-deploy.sh data               # 在 10.0.0.12 执行
  ./deploy/usop-deploy.sh app --data-host 10.0.0.12 --es-host 10.0.0.13
EOF
}

# ------------------------------------------------------------------ 参数解析
while [ $# -gt 0 ]; do
  case "$1" in
    all-in-one|app|data|es|init|verify|status|logs|restart|stop|upgrade|backup|help)
      CMD="${CMD:-$1}"
      ;;
    --data-host) shift; DATA_HOST="${1:-}" ;;
    --es-host)   shift; ES_HOST="${1:-}" ;;
    --env)       shift; ENV_FILE="${1:-}" ;;
    --no-build)  NO_BUILD=1 ;;
    --skip-init) SKIP_INIT=1 ;;
    --follow|-f) FOLLOW=1 ;;
    -h|--help)   usage; exit 0 ;;
    -*)          die "未知选项: $1（-h 查看帮助）" ;;
    *)
      if [ -z "${CMD:-}" ]; then
        usage >&2
        die "未知命令: $1"
      fi
      EXTRA_ARGS+=("$1")
      ;;
  esac
  shift
done

CMD="${CMD:-all-in-one}"

case "$CMD" in
  all-in-one) PROFILE="allinone" ;;
  app)        PROFILE="app" ;;
  data)       PROFILE="data" ;;
  es)         PROFILE="search" ;;
  *)          PROFILE="" ;;
esac

# ------------------------------------------------------------------ 工具函数
rand_pw() {
  local n="${1:-24}" s=""
  if command -v openssl >/dev/null 2>&1; then
    s=$(openssl rand -hex 64)
  else
    s=$(od -An -tx1 -N 64 /dev/urandom | tr -d ' \n')
  fi
  printf '%s' "${s:0:$n}"
}

detect_ip() {
  local ip=""
  ip=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}' || true)
  [ -z "$ip" ] && ip=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
  [ -z "$ip" ] && ip=$(ipconfig getifaddr en0 2>/dev/null || true)
  printf '%s' "${ip:-127.0.0.1}"
}

mem_mb() {
  if [ -r /proc/meminfo ]; then
    awk '/MemTotal/{print int($2/1024); exit}' /proc/meminfo
  elif command -v sysctl >/dev/null 2>&1; then
    sysctl -n hw.memsize 2>/dev/null | awk '{print int($1/1048576)}'
  else
    echo 0
  fi
}

get_kv() {
  [ -f "$ENV_FILE" ] || return 0
  awk -F= -v k="$1" '$1==k{sub(/^[^=]*=/,""); print; exit}' "$ENV_FILE"
}

set_kv() {
  local key="$1" val="$2" tmp
  tmp=$(mktemp)
  awk -v k="$key" -v v="$val" '
    $0 ~ "^"k"=" { print k"="v; done=1; next }
    { print }
    END { if (!done) print k"="v }
  ' "$ENV_FILE" >"$tmp"
  mv "$tmp" "$ENV_FILE"
}

load_env() {
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
}

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" --profile "$PROFILE" "$@"
}

tcp_ok() {  # tcp_ok host port
  (exec 3<>"/dev/tcp/$1/$2") >/dev/null 2>&1
}

hostport() {
  local u="$1"
  u="${u#http://}"; u="${u#https://}"
  printf '%s' "${u%%/*}"
}

chown_quiet() {  # chown_quiet path owner
  local p="$1" o="$2"
  [ -d "$p" ] || return 0
  if [ "$(id -u)" = 0 ]; then
    chown -R "$o" "$p"
  elif sudo -n true 2>/dev/null; then
    sudo -n chown -R "$o" "$p"
  else
    warn "无法修改 $p 属主为 ${o}（需要 root）：若 ES/Flink 报 permission denied，请手工 sudo chown -R $o $p"
  fi
}

# ------------------------------------------------------------------ 配置准备
apply_autotune() {
  local mem; mem=$(mem_mb)
  [ "$mem" -le 0 ] && return 0
  local es kafka jm tm slots pg
  if   [ "$mem" -ge 60000 ]; then es=16g; kafka="-Xms4g -Xmx4g"; jm=2048m; tm=8192m; slots=8; pg=4GB
  elif [ "$mem" -ge 30000 ]; then es=8g;  kafka="-Xms2g -Xmx2g"; jm=1600m; tm=4096m; slots=4; pg=2GB
  elif [ "$mem" -ge 15000 ]; then es=4g;  kafka="-Xms1g -Xmx1g"; jm=1024m; tm=2048m; slots=4; pg=1GB
  else                            es=2g;  kafka="-Xms512m -Xmx512m"; jm=1024m; tm=1536m; slots=2; pg=512MB
  fi
  set_kv ES_JAVA_HEAP "$es"
  set_kv KAFKA_HEAP_OPTS "\"$kafka\""
  set_kv FLINK_JM_MEM "$jm"
  set_kv FLINK_TM_MEM "$tm"
  set_kv FLINK_TM_SLOTS "$slots"
  set_kv PG_SHARED_BUFFERS "$pg"
  log "按本机内存 ${mem}MB 自动分配：ES 堆 $es / Kafka $kafka / Flink JM $jm TM $tm"
}

ensure_env() {
  if [ ! -f "$ENV_FILE" ]; then
    mkdir -p "$(dirname "$ENV_FILE")" 2>/dev/null || die "无法创建配置目录: $(dirname "$ENV_FILE")"
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    FIRST_RUN=1
    log "已生成配置文件 $ENV_FILE"
  fi

  load_env

  local need_save=0
  if [ -z "${HOST_IP:-}" ]; then
    set_kv HOST_IP "$(detect_ip)"; need_save=1
  fi
  if [ -z "${PG_PASSWORD:-}" ]; then
    set_kv PG_PASSWORD "$(rand_pw 24)"; need_save=1
  fi
  if [ -z "${JWT_SECRET:-}" ]; then
    set_kv JWT_SECRET "$(rand_pw 48)"; need_save=1
  fi
  if [ -z "${SECRET_KEY:-}" ]; then
    set_kv SECRET_KEY "$(rand_pw 48)"; need_save=1
  fi
  if [ "$FIRST_RUN" = 1 ]; then
    apply_autotune
    need_save=1
  fi
  if [ "$need_save" = 1 ]; then
    load_env
  fi

  [ -n "$DATA_HOST" ] && {
    set_kv KAFKA_BOOTSTRAP_SERVERS "${DATA_HOST}:9092"
    set_kv FLINK_JOBMANAGER_URL "http://${DATA_HOST}:8081"
    set_kv FLINK_REST_API "http://${DATA_HOST}:8081"
    set_kv FLINK_SQL_GATEWAY_URL "http://${DATA_HOST}:8083"
    load_env
  }
  [ -n "$ES_HOST" ] && {
    set_kv ES_HOSTS "http://${ES_HOST}:9200"
    set_kv ES_URL "http://${ES_HOST}:9200"
    load_env
  }

  # Kafka 对外通告地址：必须是采集器/应用可达的真实 IP
  if [ -z "${KAFKA_ADVERTISED_LISTENERS:-}" ]; then
    set_kv KAFKA_ADVERTISED_LISTENERS "PLAINTEXT://${HOST_IP}:9092,PLAINTEXT_INTERNAL://kafka:29092"
    load_env
  fi
  if [ -z "${ES_URL:-}" ]; then
    set_kv ES_URL "${ES_HOSTS:-http://elasticsearch:9200}"
    load_env
  fi

  # 分机部署：Flink 关联作业的 JDBC 串取自 DATABASE_URL，数据节点必须能解析到 PG。
  # 单机用容器名 postgres，分机改成应用节点真实 IP（PG 已发布到宿主机 5432）。
  if [ "$PROFILE" = "app" ] && [ "${PG_HOST:-postgres}" = "postgres" ]; then
    set_kv PG_HOST "$HOST_IP"
    load_env
    log "应用节点：PG_HOST 使用 ${HOST_IP}（数据节点的 Flink 作业需回写 PG）"
  fi

  USOP_DATA_DIR="${USOP_DATA_DIR:-/data/usop}"
  export USOP_DATA_DIR
  fill_defaults
}

# 关键变量兜底：env 文件被手工删行时不至于把编排打成空值
fill_defaults() {
  local changed=0
  _def() {
    local k="$1" d="$2" cur=""
    eval "cur=\${$k:-}"
    if [ -z "$cur" ]; then
      set_kv "$k" "$d"
      changed=1
    fi
  }
  _def USOP_PORT 3266
  _def API_PORT 5001
  _def USOP_IMAGE usop-platform:1.0.0
  _def PG_HOST postgres
  _def PG_PORT 5432
  _def PG_DB usop_security
  _def PG_USER usop
  _def REDIS_HOST redis
  _def REDIS_PORT 6379
  _def ES_INDEX_PREFIX usop-alerts
  _def ES_HOSTS http://elasticsearch:9200
  _def ES_JAVA_HEAP 4g
  _def KAFKA_CLUSTER_ID TUMghNssTfuY70MTwaCWkQ
  _def KAFKA_HEAP_OPTS '"-Xms1g -Xmx1g"'
  _def KAFKA_LOG_RETENTION_HOURS 48
  _def FLINK_JM_MEM 1600m
  _def FLINK_TM_MEM 4096m
  _def FLINK_TM_SLOTS 4
  [ "$changed" = 1 ] && load_env
  return 0
}

validate_for_profile() {
  case "$PROFILE" in
    app)
      case "${KAFKA_BOOTSTRAP_SERVERS:-}" in
        *"kafka:29092"*) die "应用节点未配置数据节点：请加 --data-host <数据节点IP> 或编辑 $ENV_FILE" ;;
      esac
      case "${ES_HOSTS:-}" in
        *"elasticsearch:9200"*) die "应用节点未配置检索节点：请加 --es-host <检索节点IP> 或编辑 $ENV_FILE" ;;
      esac
      ;;
  esac
}

preflight() {
  command -v docker >/dev/null 2>&1 || die "未安装 docker"
  docker compose version >/dev/null 2>&1 || die "缺少 docker compose（需要 v2+）"
  docker info >/dev/null 2>&1 || die "无法连接 docker daemon（服务未启动或无权限）"

  local df_avail
  df_avail=$(df -Pk "$(dirname "$USOP_DATA_DIR")" 2>/dev/null | awk 'NR==2{print int($4/1048576)}' || true)
  if [ -n "${df_avail:-}" ] && [ "$df_avail" -lt 20 ]; then
    warn "数据盘剩余 ${df_avail}GB，低于 20GB；日志量按每天几十 GB 增长，建议先扩盘"
  fi

  if [ "$PROFILE" = "search" ] || [ "$PROFILE" = "allinone" ]; then
    local cur
    cur=$(sysctl -n vm.max_map_count 2>/dev/null || echo 0)
    if [ "${cur:-0}" -lt 262144 ]; then
      if [ "$(id -u)" = 0 ]; then
        sysctl -w vm.max_map_count=262144 >/dev/null && ok "已设置 vm.max_map_count=262144"
      elif sudo -n true 2>/dev/null; then
        sudo -n sysctl -w vm.max_map_count=262144 >/dev/null && ok "已设置 vm.max_map_count=262144"
      else
        warn "vm.max_map_count=${cur}（需 ≥262144，否则 ES 起不来）：sudo sysctl -w vm.max_map_count=262144"
      fi
    fi
  fi

  if [ "$PROFILE" = "app" ]; then
    local ka; ka=$(hostport "${KAFKA_BOOTSTRAP_SERVERS:-}")
    local kh="${ka%%:*}" kp="${ka##*:}"
    tcp_ok "$kh" "${kp:-9092}" || warn "连不上数据节点 $kh:${kp:-9092}（对端未部署或防火墙未放通）"
    local eh; eh=$(hostport "${ES_HOSTS:-}"); eh="${eh%%:*}"
    tcp_ok "$eh" 9200 || warn "连不上检索节点 $eh:9200"
  fi
}

ensure_dirs() {
  local d
  for d in postgres redis kafka elasticsearch flink uploads flink-jobs; do
    local target="$USOP_DATA_DIR/$d"
    if ! mkdir -p "$target" 2>/dev/null; then
      if sudo -n true 2>/dev/null; then
        sudo -n mkdir -p "$target"
        sudo -n chown -R "$(id -u):$(id -g)" "$USOP_DATA_DIR"
      else
        die "无法创建 ${target}（需要 root）：sudo mkdir -p $target && sudo chown -R $(id -u) $USOP_DATA_DIR"
      fi
    fi
  done
  # ES 镜像以 uid 1000 运行，Flink 以 uid 9999 运行，bind mount 目录必须可写
  chown_quiet "$USOP_DATA_DIR/elasticsearch" 1000:1000
  chown_quiet "$USOP_DATA_DIR/flink" 9999:9999
  ok "数据目录就绪: $USOP_DATA_DIR"
}

gen_flink_conf() {
  [ -f "$FLINK_CONF_SRC" ] || die "缺少 $FLINK_CONF_SRC"
  mkdir -p "$(dirname "$FLINK_CONF_DST")"
  # 只覆盖内存与 slot，其余沿用仓库配置（含 jobmanager.rpc.address 等）
  sed -e "s|^jobmanager.memory.process.size:.*|jobmanager.memory.process.size: ${FLINK_JM_MEM:-1600m}|" \
      -e "s|^taskmanager.memory.process.size:.*|taskmanager.memory.process.size: ${FLINK_TM_MEM:-4096m}|" \
      -e "s|^taskmanager.numberOfTaskSlots:.*|taskmanager.numberOfTaskSlots: ${FLINK_TM_SLOTS:-4}|" \
      "$FLINK_CONF_SRC" >"$FLINK_CONF_DST"
  ok "Flink 配置已生成（JM ${FLINK_JM_MEM:-1600m} / TM ${FLINK_TM_MEM:-4096m} / slots ${FLINK_TM_SLOTS:-4}）"
}

# ------------------------------------------------------------------ 等待就绪
wait_http() {  # wait_http url timeout label
  local url="$1" timeout="$2" label="$3" i=0
  while [ "$i" -lt "$timeout" ]; do
    if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
      ok "$label 就绪"; return 0
    fi
    i=$((i + 3)); sleep 3
  done
  err "$label 在 ${timeout}s 内未就绪: $url"
  return 1
}

wait_container_health() {  # wait_container_health name timeout
  local name="$1" timeout="$2" i=0 status=""
  while [ "$i" -lt "$timeout" ]; do
    status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$name" 2>/dev/null || echo missing)
    case "$status" in
      healthy|running) ok "$name $status"; return 0 ;;
      missing) err "容器 $name 未创建"; return 1 ;;
    esac
    i=$((i + 3)); sleep 3
  done
  err "容器 $name 状态异常: ${status}（logs: docker logs --tail=80 ${name}）"
  return 1
}

wait_ready() {
  local failed=0
  case "$PROFILE" in
    allinone|app)
      wait_container_health usop_pg 120 || failed=1
      wait_container_health usop_cache 60 || failed=1
      wait_container_health usop_app 240 || failed=1
      wait_http "http://127.0.0.1:${USOP_PORT:-3266}/" 60 "前端 3266" || failed=1
      ;;
  esac
  case "$PROFILE" in
    allinone|search)
      wait_container_health usop_es 180 || failed=1
      ;;
  esac
  case "$PROFILE" in
    allinone|data)
      wait_container_health usop_kafka 180 || failed=1
      wait_container_health usop_flink_jm 120 || failed=1
      wait_http "http://127.0.0.1:8081/overview" 90 "Flink JobManager 8081" || failed=1
      ;;
  esac
  return "$failed"
}

# ------------------------------------------------------------------ 初始化
do_init() {
  case "$PROFILE" in allinone|app) ;; *) return 0 ;; esac
  if [ "$SKIP_INIT" = 1 ]; then warn "已跳过初始化"; return 0; fi
  log "初始化数据库结构与业务配置"
  docker exec usop_app sh -c 'cd /app && PYTHONPATH=/app python3 migrations/add_vuln_fields.py' \
    && ok "表结构/字段迁移完成" || warn "迁移脚本返回非零（已执行过可忽略）"

  if docker exec usop_app test -f /opt/usop-scripts/pipeline_setup.py; then
    docker exec usop_app python3 /opt/usop-scripts/pipeline_setup.py \
      && ok "告警管道配置完成" \
      || warn "管道配置失败，可手工执行: docker exec usop_app python3 /opt/usop-scripts/pipeline_setup.py"
    docker exec usop_app python3 /opt/usop-scripts/setup_block_playbooks.py \
      && ok "封禁剧本初始化完成" || warn "封禁剧本初始化失败（非必需，可跳过）"
  else
    warn "未挂载 scripts 目录，跳过管道/剧本初始化（可手工执行或检查 compose 挂载）"
  fi
}

# ------------------------------------------------------------------ 自检
VERIFY_FAIL=0
vcheck() {  # vcheck label command...
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then ok "$label"; else err "$label"; VERIFY_FAIL=$((VERIFY_FAIL + 1)); fi
}

do_verify() {
  VERIFY_FAIL=0
  log "运行健康检查"
  case "$PROFILE" in
    allinone|app)
      vcheck "PostgreSQL 5432" docker exec usop_pg pg_isready -U "${PG_USER:-usop}" -d "${PG_DB:-usop_security}"
      vcheck "Redis 6379" docker exec usop_cache redis-cli ping
      vcheck "后端 API /api/health" curl -fsS --max-time 5 "http://127.0.0.1:${API_PORT:-5001}/api/health"
      vcheck "前端页面 :${USOP_PORT:-3266}" curl -fsS --max-time 5 "http://127.0.0.1:${USOP_PORT:-3266}/"
      ;;
  esac
  case "$PROFILE" in
    allinone|data)
      vcheck "Kafka 9092" docker exec usop_kafka kafka-broker-api-versions --bootstrap-server localhost:9092
      vcheck "Flink JobManager :8081" curl -fsS --max-time 5 "http://127.0.0.1:8081/overview"
      vcheck "Flink SQL Gateway :8083" curl -fsS --max-time 5 "http://127.0.0.1:8083/v1/info"
      ;;
  esac
  case "$PROFILE" in
    allinone|search)
      vcheck "Elasticsearch :9200" curl -fsS --max-time 5 "http://127.0.0.1:9200/_cluster/health"
      # 索引由应用启动时创建，首次部署可能还没有 → 只提示不算失败
      if curl -fsS --max-time 5 "http://127.0.0.1:9200/_cat/indices/alerts-valid" >/dev/null 2>&1; then
        ok "ES 索引 alerts-valid 存在"
      else
        warn "ES 索引 alerts-valid 尚未创建（应用启动/首条告警入库后自动建）"
      fi
      ;;
  esac
  case "$PROFILE" in
    app)
      local eh; eh=$(hostport "${ES_HOSTS:-}"); eh="${eh%%:*}"
      vcheck "检索节点 $eh:9200 可达" curl -fsS --max-time 5 "${ES_HOSTS%/}/_cluster/health"
      local ka; ka=$(hostport "${KAFKA_BOOTSTRAP_SERVERS:-}")
      vcheck "数据节点 ${ka} 可达" tcp_ok "${ka%%:*}" "${ka##*:}"
      ;;
  esac

  if [ "$VERIFY_FAIL" -eq 0 ]; then
    ok "全部检查通过"
  else
    err "$VERIFY_FAIL 项检查未通过（见上）"
    return 1
  fi
}

# ------------------------------------------------------------------ 摘要
print_summary() {
  local ip="${HOST_IP:-127.0.0.1}"
  echo
  printf '%s============================================================%s\n' "$C_G" "$C_0"
  printf '%s  USOP 部署完成（角色: %s）%s\n' "$C_G" "$CMD" "$C_0"
  printf '%s============================================================%s\n' "$C_G" "$C_0"
  case "$PROFILE" in
    allinone)
      echo "  控制台      http://${ip}:${USOP_PORT:-3266}   账号 admin / admin123（首次登录请立即改密）"
      echo "  API         http://${ip}:${API_PORT:-5001}/api/health"
      echo "  Kafka       ${ip}:9092                      （采集器/设备接入）"
      echo "  Flink UI    http://${ip}:8081               SQL Gateway ${ip}:8083"
      echo "  ES          http://${ip}:9200"
      ;;
    app)
      echo "  控制台      http://${ip}:${USOP_PORT:-3266}   账号 admin / admin123（首次登录请立即改密）"
      echo "  数据节点    ${KAFKA_BOOTSTRAP_SERVERS}"
      echo "  检索节点    ${ES_HOSTS}"
      ;;
    data)
      echo "  Kafka       ${ip}:9092                      （采集器/设备接入）"
      echo "  Flink UI    http://${ip}:8081               SQL Gateway ${ip}:8083"
      ;;
    search)
      echo "  ES          http://${ip}:9200               （仅应用节点与运维访问）"
      ;;
  esac
  echo "  数据目录    ${USOP_DATA_DIR}"
  echo "  配置文件    ${ENV_FILE}"
  echo "  常用命令    $0 status | logs | verify | upgrade | backup"
  echo
}

# ------------------------------------------------------------------ 主流程
deploy_stack() {
  ensure_env
  set_kv DEPLOY_ROLE "$PROFILE"
  load_env
  validate_for_profile
  preflight
  ensure_dirs
  case "$PROFILE" in
    allinone|data) gen_flink_conf ;;
  esac

  load_env
  compose config -q || die "编排文件校验失败: $COMPOSE_FILE"

  if [ "$NO_BUILD" = 0 ] && { [ "$PROFILE" = "allinone" ] || [ "$PROFILE" = "app" ]; }; then
    log "构建应用镜像（首次约 10~20 分钟，取决于网络）"
    compose build usop
  else
    case "$PROFILE" in
      allinone|app) warn "跳过镜像构建，使用 ${USOP_IMAGE:-usop-platform:1.0.0}" ;;
    esac
  fi

  log "启动服务（profile: ${PROFILE}）"
  compose up -d

  wait_ready || warn "部分服务未在预期时间内就绪，继续执行后续步骤（可用 $0 logs 排查）"
  do_init
  echo
  do_verify || true
  print_summary

  case "$PROFILE" in
    data)
      warn "关联分析作业不会随宿主机重启自动重提：重启后请到控制台「关联分析」点部署，或 POST /api/pipeline/correlation/deploy"
      ;;
  esac
}

cmd_status() {
  ensure_env 2>/dev/null || true
  load_env
  PROFILE="${PROFILE:-${DEPLOY_ROLE:-allinone}}"
  log "容器状态"
  compose ps -a || true
  echo
  printf '数据目录: %s\n' "${USOP_DATA_DIR:-/data/usop}"
}

cmd_logs() {
  ensure_env 2>/dev/null || true
  load_env
  PROFILE="${PROFILE:-${DEPLOY_ROLE:-allinone}}"
  if [ "$FOLLOW" = 1 ]; then
    compose logs --tail=120 --follow ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}
  else
    compose logs --tail=120 ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}
  fi
}

cmd_stop() {
  ensure_env
  load_env
  PROFILE="${PROFILE:-${DEPLOY_ROLE:-allinone}}"
  log "停止本机容器（数据目录 $USOP_DATA_DIR 保留）"
  compose down
  ok "已停止"
}

cmd_restart() {
  ensure_env
  load_env
  PROFILE="${PROFILE:-${DEPLOY_ROLE:-allinone}}"
  compose restart
  wait_ready || true
}

cmd_backup() {
  ensure_env
  load_env
  PROFILE="${PROFILE:-app}"
  local ts dir
  ts=$(date +%Y%m%d-%H%M%S)
  dir="$SCRIPT_DIR/backups/$ts"
  mkdir -p "$dir"
  log "备份到 $dir"
  docker exec usop_pg pg_dump -U "${PG_USER:-usop}" -d "${PG_DB:-usop_security}" \
    | gzip >"$dir/postgres-$ts.sql.gz"
  ok "PostgreSQL 已备份: $(du -h "$dir/postgres-$ts.sql.gz" | awk '{print $1}')"
  if [ -d "$USOP_DATA_DIR/uploads" ]; then
    tar -czf "$dir/uploads-$ts.tar.gz" -C "$USOP_DATA_DIR" uploads
    ok "附件已备份: $(du -h "$dir/uploads-$ts.tar.gz" | awk '{print $1}')"
  fi
  warn "ES 数据未做快照（需预先配置 path.repo），依赖索引副本或定期重建"
}

main() {
  case "$CMD" in
    help) usage; return 0 ;;
    init)
      ensure_env; load_env
      PROFILE="${PROFILE:-${DEPLOY_ROLE:-allinone}}"
      validate_for_profile
      do_init
      ;;
    verify)
      ensure_env; load_env
      PROFILE="${PROFILE:-${DEPLOY_ROLE:-allinone}}"
      do_verify
      ;;
    status)   cmd_status ;;
    logs)     cmd_logs ;;
    stop)     cmd_stop ;;
    restart)  cmd_restart ;;
    backup)   cmd_backup ;;
    upgrade)
      ensure_env; load_env
      PROFILE="${PROFILE:-${DEPLOY_ROLE:-allinone}}"
      deploy_stack
      ;;
    all-in-one|app|data|es) deploy_stack ;;
    *)        usage; die "未知命令: $CMD" ;;
  esac
}

main "$@"
