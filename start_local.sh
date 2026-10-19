#!/usr/bin/env bash
# 本地快速启动（非容器）—— 直接复用 start_native.sh。
# 默认会拉起基础设施（Docker）并原生启动后端 + 前端。
# 若基础设施已在别处运行，用:  ./start_local.sh --no-infra
exec "$(cd "$(dirname "$0")" && pwd)/start_native.sh" "$@"
