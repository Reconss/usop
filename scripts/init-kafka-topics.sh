#!/bin/bash
# Kafka Topics 初始化脚本
# 自动创建 USOP 平台所需的所有 Topics

set -e

echo "=========================================="
echo "  Kafka Topics 初始化"
echo "=========================================="
echo ""

# Kafka 连接配置
KAFKA_BROKER="${KAFKA_BROKER:-localhost:9092}"
DOCKER_EXEC="${DOCKER_EXEC:-docker exec kafka}"

# 检查 Kafka 是否可用
echo "检查 Kafka 连接..."
if ! nc -z localhost 9092 > /dev/null 2>&1; then
    echo "警告: Kafka 未在 localhost:9092 监听"
    echo "尝试使用 docker exec..."
fi

# 创建 Topics 的函数
create_topic() {
    local topic_name=$1
    local partitions=${2:-6}
    local replication=${3:-1}
    local config=${4:-""}
    
    echo -n "  创建 Topic: $topic_name ... "
    
    if $DOCKER_EXEC kafka-topics --create \
        --if-not-exists \
        --bootstrap-server $KAFKA_BROKER \
        --replication-factor $replication \
        --partitions $partitions \
        --topic "$topic_name" \
        $config 2>/dev/null; then
        echo "✓"
    else
        echo "已存在或创建失败 (可能已存在)"
    fi
}

echo "开始创建 Topics..."
echo ""

# ==========================================
# 核心数据 Topics
# ==========================================

# 原始日志 Topic
create_topic "raw-logs" 6 1 "--config retention.ms=604800000 --config cleanup.policy=delete"

# 解析后日志 Topic
create_topic "parsed-logs" 6 1 "--config retention.ms=604800000 --config cleanup.policy=delete"

# 告警 Topic
create_topic "alerts" 3 1 "--config retention.ms=2592000000 --config cleanup.policy=delete"

# 指标数据 Topic
create_topic "metrics" 3 1 "--config retention.ms=2592000000 --config cleanup.policy=delete"

# ==========================================
# 系统 Topics
# ==========================================

# 死信队列
create_topic "dlq-logs" 3 1 "--config retention.ms=604800000 --config cleanup.policy=compact"

# 规则变更通知
create_topic "rule-updates" 1 1 "--config retention.ms=86400000 --config cleanup.policy=delete"

# 处理状态
create_topic "processing-status" 1 1 "--config retention.ms=86400000 --config cleanup.policy=delete"

# ==========================================
# 内部处理 Topics
# ==========================================

# 解析完成确认
create_topic "parsed-logs-ack" 1 1 "--config retention.ms=3600000 --config cleanup.policy=delete"

# 告警确认
create_topic "alert-acks" 1 1 "--config retention.ms=86400000 --config cleanup.policy=delete"

# ==========================================
# 备份 Topics (可选)
# ==========================================

# 日志备份
create_topic "logs-backup" 3 1 "--config retention.ms=6048000000 --config cleanup.policy=delete"

echo ""
echo "=========================================="
echo "  Topics 列表"
echo "=========================================="
$DOCKER_EXEC kafka-topics --list --bootstrap-server $KAFKA_BROKER 2>/dev/null | grep -v "^_" | sort

echo ""
echo "=========================================="
echo "  Topic 详情"
echo "=========================================="
$DOCKER_EXEC kafka-topics --describe --bootstrap-server $KAFKA_BROKER 2>/dev/null

echo ""
echo "Kafka Topics 初始化完成!"
