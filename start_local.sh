#!/bin/bash
echo "🛡️  USOP 安全运营平台启动中..."

# 启动 Docker 容器
echo "[1/3] 启动数据库容器..."
cd /Users/codes/usop
docker compose up -d postgres timescale redis 2>/dev/null || docker-compose up -d postgres timescale redis

# 启动后端
echo "[2/3] 启动后端服务..."
cd /Users/codes/usop/server-python
source .venv/bin/activate
export SKIP_BIGDATA_CHECK=1
export FLASK_PORT=5001
python run.py &

# 启动前端
echo "[3/3] 启动前端服务..."
cd /Users/codes/usop/web
pnpm dev &

echo ""
echo "✅ 启动完成!"
echo "   前端: http://localhost:3266"
echo "   后端: http://localhost:5001"
echo "   账号: admin / admin123"
wait
