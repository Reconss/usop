#!/bin/bash

# TimescaleDB 容器启动脚本

# 配置参数
CONTAINER_NAME="timescale"
POSTGRES_PASSWORD="yourpassword"
POSTGRES_USER="postgres"
POSTGRES_DB="timescale"
HOST_PORT="5432"
CONTAINER_PORT="5432"

echo "==================================="
echo "TimescaleDB 容器创建脚本"
echo "==================================="

# 检查 Docker 是否运行
if ! docker info > /dev/null 2>&1; then
    echo "错误: Docker 未运行或无权限访问"
    exit 1
fi

# 检查是否已存在同名容器
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "警告: 容器 '${CONTAINER_NAME}' 已存在"
    read -p "是否删除旧容器并重新创建? (y/n): " confirm
    if [ "$confirm" = "y" ]; then
        echo "删除旧容器..."
        docker stop ${CONTAINER_NAME} 2>/dev/null
        docker rm ${CONTAINER_NAME} 2>/dev/null
    else
        echo "使用现有容器"
        exit 0
    fi
fi

echo "正在拉取 TimescaleDB 镜像..."
if ! docker pull timescale/timescaledb:latest-pg16; then
    echo "错误: 镜像拉取失败"
    echo "可能原因:"
    echo "1. 网络连接问题"
    echo "2. Docker Hub 访问超时"
    echo "3. 镜像加速器配置问题"
    echo ""
    echo "解决方案:"
    echo "1. 检查网络连接"
    echo "2. 配置或更换镜像加速器"
    echo "3. 使用代理"
    echo "4. 或使用 docker-compose up -d 稍后重试"
    exit 1
fi

echo "正在创建容器..."
docker run -d \
  --name ${CONTAINER_NAME} \
  -e POSTGRES_PASSWORD=${POSTGRES_PASSWORD} \
  -e POSTGRES_USER=${POSTGRES_USER} \
  -e POSTGRES_DB=${POSTGRES_DB} \
  -p ${HOST_PORT}:${CONTAINER_PORT} \
  -v timescale_data:/var/lib/postgresql/data \
  - restart unless-stopped \
  timescale/timescaledb:latest-pg16

if [ $? -eq 0 ]; then
    echo ""
    echo "==================================="
    echo "✓ TimescaleDB 容器创建成功!"
    echo "==================================="
    echo ""
    echo "连接信息:"
    echo "  主机: localhost"
    echo "  端口: ${HOST_PORT}"
    echo "  用户: ${POSTGRES_USER}"
    echo "  密码: ${POSTGRES_PASSWORD}"
    echo "  数据库: ${POSTGRES_DB}"
    echo ""
    echo "连接命令:"
    echo "  psql -h localhost -p ${HOST_PORT} -U ${POSTGRES_USER} -d ${POSTGRES_DB}"
    echo ""
    echo "常用命令:"
    echo "  查看容器状态: docker ps | grep ${CONTAINER_NAME}"
    echo "  查看日志: docker logs ${CONTAINER_NAME}"
    echo "  停止容器: docker stop ${CONTAINER_NAME}"
    echo "  启动容器: docker start ${CONTAINER_NAME}"
    echo "  删除容器: docker rm -f ${CONTAINER_NAME}"
else
    echo "错误: 容器创建失败"
    exit 1
fi
