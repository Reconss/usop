#!/usr/bin/env bash
# USOP 启动入口（非容器）
# -----------------------------------------------------------------------------
# 基础设施（PG/Redis/ES/Kafka/Flink）跑在 Docker，应用（Flask+React）原生运行。
# 所有组件连接信息在 deploy/.env.native（模板 deploy/.env.native.example）。
# 参数原样透传给 start_native.sh；常用：
#   ./start.sh                 # 起基础设施 + 后端(:5001) + 前端(:9000)
#   ./start.sh --no-infra      # 基础设施已在别处，仅起应用
#   ./start.sh --build         # 前端生产构建并托管在 :3266
#   ./start.sh --stop          # 停止
#   ./start.sh --help
exec "$(cd "$(dirname "$0")" && pwd)/start_native.sh" "$@"
