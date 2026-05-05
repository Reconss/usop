#!/bin/bash
# ==========================================
# USOP 安全平台 - 一键启动脚本
# ==========================================
# 数据库端口:
#   PostgreSQL (业务数据): localhost:5432
#   TimescaleDB (告警时序): localhost:5433
#   Redis (缓存):          localhost:6379
# ==========================================

set -e

echo "=========================================="
echo " USOP 安全平台 - 启动中..."
echo "=========================================="

# 1. 启动 Docker 容器 (PostgreSQL + TimescaleDB + Redis)
echo "[1/3] 启动数据库容器..."
cd "$(dirname "$0")"
docker compose up -d postgres timescale redis 2>/dev/null || docker-compose up -d postgres timescale redis
echo "  ✓ PostgreSQL  → localhost:5432  (用户: usop / usop_password / usop_security)"
echo "  ✓ TimescaleDB → localhost:5433  (用户: postgres / postgres / postgres)"
echo "  ✓ Redis       → localhost:6379"

# 等待数据库就绪
echo "  等待数据库就绪..."
sleep 5

# 2. 启动 Flask 后端 (端口 5001)
echo "[2/3] 启动 Flask 后端..."
cd server-python
export SKIP_BIGDATA_CHECK=1
export FLASK_PORT=5001
export DATABASE_URL="postgresql://usop:usop_password@localhost:5432/usop_security"
export TSDB_HOST=localhost
export TSDB_PORT=5433
export TSDB_USER=postgres
export TSDB_PASSWORD=postgres
export TSDB_NAME=postgres

python3 run.py &
FLASK_PID=$!
echo "  ✓ Flask 后端 → localhost:5001 (PID: $FLASK_PID)"

# 3. 启动 Web 前端 (端口 3266)
echo "[3/3] 启动 Web 前端..."
cd ../web
npm run dev &
WEB_PID=$!
echo "  ✓ Web 前端 → localhost:3266 (PID: $WEB_PID)"

echo ""
echo "=========================================="
echo " 启动完成!"
echo "  Web 端:      http://localhost:3266"
echo "  API 后端:    http://localhost:5001"
echo "  默认账号:    admin / admin123"
echo "=========================================="
echo ""
echo "停止: kill $FLASK_PID $WEB_PID"
echo "或:   pkill -f 'python.*run.py' && pkill -f 'webpack'"
echo ""
wait
