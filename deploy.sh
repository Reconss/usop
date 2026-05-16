#!/bin/bash
# USOP 部署脚本 - 构建并重启容器

set -e

echo "=========================================="
echo "  USOP 部署脚本"
echo "=========================================="

# 切换到项目根目录
cd "$(dirname "$0")"

# 1. 停止并移除旧容器
echo "[1/4] 停止旧容器..."
docker-compose down

# 2. 重新构建镜像
echo "[2/4] 重新构建镜像..."
docker-compose build --no-cache

# 3. 启动服务
echo "[3/4] 启动服务..."
docker-compose up -d

# 4. 等待服务就绪
echo "[4/4] 等待服务就绪..."
sleep 10

# 显示状态
echo ""
echo "=========================================="
echo "  部署完成!"
echo "=========================================="
docker-compose ps

echo ""
echo "访问地址:"
echo "  前端: http://localhost:3266"
echo "  后端: http://localhost:5001"
echo "  账号: admin / admin123"
