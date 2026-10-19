#!/usr/bin/env bash
# 一键部署入口（生产）。
# 旧的开发用法仍然可用：在仓库根目录直接 docker compose up -d。
# 参数与子命令见 ./deploy/usop-deploy.sh --help
#
#   ./deploy.sh                      单机全栈
#   ./deploy.sh app --data-host <IP> --es-host <IP>
#   ./deploy.sh verify | status | logs | upgrade | backup | stop
exec "$(cd "$(dirname "$0")" && pwd)/deploy/usop-deploy.sh" "$@"
