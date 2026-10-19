#!/usr/bin/env bash
# =============================================================================
# USOP 基础设施管理脚本（对应 docker-compose.infra.yml）
# -----------------------------------------------------------------------------
# 仅管理大数据 / 存储组件：PostgreSQL / Redis / Elasticsearch / Kafka / Flink。
# 应用本身请用 start_native.sh 原生启动。
#
# 用法:
#   ./start-bigdata.sh up                # 启动全部基础设施（后台）
#   ./start-bigdata.sh down              # 停止并移除容器（数据保留在 data/infra）
#   ./start-bigdata.sh restart           # 重启
#   ./start-bigdata.sh status            # 查看状态与健康检查
#   ./start-bigdata.sh logs [服务]        # 跟踪日志
#   ./start-bigdata.sh init-topics       # 初始化 Kafka topics
#   ./start-bigdata.sh help              # 帮助
# =============================================================================
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.infra.yml"
CMD="${1:-up}"

if [ -t 1 ]; then C_G=$'\033[1;32m'; C_R=$'\033[1;31m'; C_Y=$'\033[1;33m'; C_0=$'\033[0m'; else C_G=""; C_R=""; C_Y=""; C_0=""; fi
log(){ printf '%s==>%s %s\n' "$C_G" "$C_0" "$*"; }
warn(){ printf '%s  !%s %s\n' "$C_Y" "$C_0" "$*"; }
die(){ printf '%s  ✗%s %s\n' "$C_R" "$C_0" "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "未安装 docker"
docker compose version >/dev/null 2>&1 || die "缺少 docker compose（v2+）"
docker info >/dev/null 2>&1 || die "无法连接 docker daemon"

case "$CMD" in
  up|start)
    log "启动基础设施（docker-compose.infra.yml）"
    docker compose -f "$COMPOSE_FILE" up -d
    log "等待就绪..."
    sleep 8
    "$0" status
    ;;
  down|stop)
    log "停止基础设施（数据保留在 data/infra）"
    docker compose -f "$COMPOSE_FILE" down
    ;;
  restart)
    docker compose -f "$COMPOSE_FILE" restart
    "$0" status
    ;;
  status)
    docker compose -f "$COMPOSE_FILE" ps -a
    echo
    for svc in usop_infra_pg usop_infra_redis usop_infra_es usop_infra_kafka usop_infra_flink_jm; do
      st=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$svc" 2>/dev/null || echo missing)
      printf '  %-20s %s\n' "$svc" "$st"
    done
    ;;
  logs)
    shift
    docker compose -f "$COMPOSE_FILE" logs --tail=120 -f "$@"
    ;;
  init-topics)
    log "初始化 Kafka topics"
    [ -f "$SCRIPT_DIR/scripts/init-kafka-topics.sh" ] || die "缺少 scripts/init-kafka-topics.sh"
    # 确保 kafka 已起
    docker compose -f "$COMPOSE_FILE" ps usop_infra_kafka | grep -q "running" || docker compose -f "$COMPOSE_FILE" up -d kafka
    bash "$SCRIPT_DIR/scripts/init-kafka-topics.sh"
    ;;
  help|-h|--help)
    sed -n '3,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    ;;
  *)
    die "未知命令: $CMD（help 查看用法）"
    ;;
esac
