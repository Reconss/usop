#!/usr/bin/env bash
# 一键部署入口（生产 / 全容器）。
# 旧的开发用法仍然可用：在仓库根目录直接 docker compose up -d。
# 参数与子命令见 ./deploy/usop-deploy.sh --help
#
#   ./deploy.sh                      单机全栈
#   ./deploy.sh app --data-host <IP> --es-host <IP>
#   ./deploy.sh verify | status | logs | upgrade | backup | stop
#
# 非容器部署（基础设施 Docker + 应用原生，便于开发）见 ./start_native.sh
exec "$(cd "$(dirname "$0")" && pwd)/deploy/usop-deploy.sh" "$@"
