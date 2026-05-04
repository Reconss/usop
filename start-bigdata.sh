#!/bin/bash
# 大数据组件启动脚本

set -e

echo "=========================================="
echo "  USOP 日志平台 - 大数据组件管理"
echo "=========================================="
echo ""

# 检查 Docker 是否运行
if ! docker info > /dev/null 2>&1; then
    echo "错误: Docker 未运行，请先启动 Docker"
    exit 1
fi

# 检查 docker-compose 是否安装
if ! command -v docker-compose &> /dev/null; then
    echo "提示: 使用 docker compose"
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

# 解析参数
COMMAND=${1:-"up"}

wait_for_service() {
    local service=$1
    local port=$2
    local name=$3
    echo "等待 $name 启动..."
    local max_attempts=30
    local attempt=1
    while [ $attempt -le $max_attempts ]; do
        if docker exec $service echo "ok" > /dev/null 2>&1 || nc -z localhost $port > /dev/null 2>&1; then
            echo "  ✓ $name 已启动"
            return 0
        fi
        sleep 2
        attempt=$((attempt + 1))
    done
    echo "  ✗ $name 启动超时"
    return 1
}

case $COMMAND in
    up|start)
        echo "启动大数据组件..."
        $COMPOSE_CMD -f docker-compose.yml up -d
        
        echo ""
        echo "等待服务启动..."
        sleep 15
        
        # 等待关键服务
        wait_for_service zookeeper 2181 "Zookeeper"
        wait_for_service kafka 9092 "Kafka"
        wait_for_service redis 6379 "Redis"
        
        echo ""
        echo "初始化 Kafka Topics..."
        bash scripts/init-kafka-topics.sh
        
        echo ""
        echo "初始化 TimescaleDB 表..."
        docker exec -i timescale psql -U postgres -d timescale < postgres/init.d/01-init-timescale.sql 2>/dev/null || echo "  (表可能已存在)"
        
        echo ""
        echo "=========================================="
        echo "  服务启动完成！"
        echo "=========================================="
        echo ""
        echo "服务访问地址:"
        echo "  - Kafka:         localhost:9092"
        echo "  - Kafka UI:      http://localhost:8080"
        echo "  - Flink UI:      http://localhost:8081"
        echo "  - TimescaleDB:   localhost:5432"
        echo "  - Redis:         localhost:6379"
        echo ""
        echo "快速命令:"
        echo "  $0 status          - 查看服务状态"
        echo "  $0 flink-submit    - 提交 Flink Jobs"
        echo "  $0 logs            - 查看日志"
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
        echo ""
        $COMPOSE_CMD -f docker-compose.yml ps
        
        echo ""
        echo "健康检查:"
        echo ""
        
        # 检查 TimescaleDB
        if docker exec timescale pg_isready -U postgres > /dev/null 2>&1; then
            echo "  ✓ TimescaleDB 运行中"
        else
            echo "  ✗ TimescaleDB 未运行"
        fi
        
        # 检查 Kafka
        if nc -z localhost 9092 > /dev/null 2>&1; then
            echo "  ✓ Kafka 运行中"
            docker exec kafka kafka-topics --list --bootstrap-server localhost:9092 2>/dev/null | head -5 | sed 's/^/    /'
        else
            echo "  ✗ Kafka 未运行"
        fi
        
        # 检查 Flink
        if curl -s http://localhost:8081/healthz > /dev/null 2>&1; then
            echo "  ✓ Flink JobManager 运行中"
            echo "    Jobs: $(curl -s http://localhost:8081/jobs 2>/dev/null | grep -o '"jobs":[0-9]*' | head -1 || echo 'N/A')"
        else
            echo "  ✗ Flink JobManager 未运行"
        fi
        
        # 检查 Redis
        if nc -z localhost 6379 > /dev/null 2>&1; then
            echo "  ✓ Redis 运行中"
        else
            echo "  ✗ Redis 未运行"
        fi
        echo ""
        ;;
        
    flink-submit)
        echo "提交 Flink Jobs..."
        echo ""
        
        # 等待 Flink 就绪
        echo "等待 Flink JobManager 就绪..."
        until curl -s http://localhost:8081/available-job-depth > /dev/null 2>&1; do
            sleep 2
        done
        echo "  ✓ Flink JobManager 就绪"
        
        # 检查 Job 列表
        JOBS=$(curl -s http://localhost:8081/jobs 2>/dev/null | grep -o '"id":"[^"]*"' | wc -l)
        echo "  当前运行 Jobs: $JOBS"
        
        if [ -d "flink-jobs" ]; then
            echo ""
            echo "可用的 Flink Jobs:"
            ls -1 flink-jobs/*.py 2>/dev/null || ls -1 flink-jobs/*.jar 2>/dev/null || echo "  (无 Jobs 文件)"
            echo ""
            echo "手动提交 Job:"
            echo "  docker exec flink-jobmanager flink run -d /opt/flink/jobs/<job-file>"
        else
            echo "  Flink Jobs 目录不存在"
        fi
        echo ""
        ;;
        
    init-topics)
        echo "初始化 Kafka Topics..."
        bash scripts/init-kafka-topics.sh
        ;;
        
    init-db)
        echo "初始化 TimescaleDB 表..."
        docker exec -i timescale psql -U postgres -d timescale < postgres/init.d/01-init-timescale.sql
        echo "完成!"
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
        
    test)
        echo "测试日志摄入..."
        echo '{"source":"test","message":"Test log message","timestamp":"'$(date -Iseconds)'"}' | \
        docker exec -i kafka kafka-console-producer --broker-list localhost:9092 --topic raw-logs
        echo ""
        echo "检查消费:"
        docker exec kafka kafka-console-consumer --topic raw-logs --from-beginning --bootstrap-server localhost:9092 --max-messages 1
        ;;
        
    help|*)
        echo "用法: $0 [命令]"
        echo ""
        echo "命令:"
        echo "  up|start        启动所有服务"
        echo "  down|stop       停止所有服务"
        echo "  restart         重启所有服务"
        echo "  logs [服务]     查看日志"
        echo "  status          查看服务状态"
        echo "  flink-submit    提交 Flink Jobs"
        echo "  init-topics     初始化 Kafka Topics"
        echo "  init-db         初始化 TimescaleDB 表"
        echo "  test            测试日志摄入"
        echo "  clean           清理所有数据"
        echo "  help            显示帮助"
        echo ""
        ;;
esac
