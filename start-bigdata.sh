#!/bin/bash
# 大数据组件启动脚本

set -e

echo "=========================================="
echo "  日志分析平台 - 大数据组件启动"
echo "=========================================="
echo ""

# 检查 Docker 是否运行
if ! docker info > /dev/null 2>&1; then
    echo "错误: Docker 未运行，请先启动 Docker"
    exit 1
fi

# 检查 docker-compose 是否安装
if ! command -v docker-compose &> /dev/null; then
    echo "警告: docker-compose 未安装，尝试使用 docker compose"
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

# 解析参数
COMMAND=${1:-"up"}

case $COMMAND in
    up|start)
        echo "启动大数据组件..."
        $COMPOSE_CMD -f docker-compose.yml up -d
        
        echo ""
        echo "等待服务启动..."
        sleep 10
        
        # 检查服务状态
        echo ""
        echo "检查服务状态..."
        $COMPOSE_CMD -f docker-compose.yml ps
        
        echo ""
        echo "=========================================="
        echo "  服务启动完成！"
        echo "=========================================="
        echo ""
        echo "服务访问地址:"
        echo "  - Kafka:         localhost:9092"
        echo "  - Kafka UI:      http://localhost:8080"
        echo "  - Flink UI:     http://localhost:8081"
        echo "  - TimescaleDB:  localhost:5432"
        echo "  - Redis:        localhost:6379"
        echo ""
        ;;
        
    down|stop)
        echo "停止大数据组件..."
        $COMPOSE_CMD -f docker-compose.yml down
        echo "服务已停止"
        ;;
        
    restart)
        echo "重启大数据组件..."
        $COMPOSE_CMD -f docker-compose.yml restart
        echo "服务已重启"
        ;;
        
    logs)
        SERVICE=${2:-""}
        if [ -z "$SERVICE" ]; then
            $COMPOSE_CMD -f docker-compose.yml logs -f
        else
            $COMPOSE_CMD -f docker-compose.yml logs -f $SERVICE
        fi
        ;;
        
    status)
        echo "检查服务状态..."
        $COMPOSE_CMD -f docker-compose.yml ps
        
        echo ""
        echo "健康检查..."
        
        # 检查 Kafka
        if docker exec kafka kafka-broker-id --verify --zookeeper zookeeper:2181 > /dev/null 2>&1; then
            echo "  ✓ Kafka 运行中"
        else
            echo "  ✗ Kafka 未运行"
        fi
        
        # 检查 Flink
        if curl -s http://localhost:8081/healthz > /dev/null 2>&1; then
            echo "  ✓ Flink JobManager 运行中"
        else
            echo "  ✗ Flink JobManager 未运行"
        fi
        
        # 检查 Redis
        if docker exec redis redis-cli ping > /dev/null 2>&1; then
            echo "  ✓ Redis 运行中"
        else
            echo "  ✗ Redis 未运行"
        fi
        ;;
        
    init-topics)
        echo "初始化 Kafka Topics..."
        bash scripts/init-kafka-topics.sh
        ;;
        
    clean)
        echo "清理所有数据（包含 Volumes）..."
        read -p "确定要删除所有数据吗? (y/N): " confirm
        if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
            $COMPOSE_CMD -f docker-compose.yml down -v
            echo "已清理所有数据和 Volumes"
        else
            echo "取消清理"
        fi
        ;;
        
    help|*)
        echo "用法: $0 [命令]"
        echo ""
        echo "命令:"
        echo "  up|start      启动所有服务"
        echo "  down|stop     停止所有服务"
        echo "  restart       重启所有服务"
        echo "  logs [服务]    查看日志（可选指定服务）"
        echo "  status        查看服务状态"
        echo "  init-topics    初始化 Kafka Topics"
        echo "  clean          清理所有数据"
        echo "  help           显示帮助"
        ;;
esac
