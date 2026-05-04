#!/bin/bash
# Kafka Topics 初始化脚本

# 等待 Kafka 启动
echo "等待 Kafka 启动..."
sleep 15

# Kafka 容器名称
KAFKA_CONTAINER="kafka"

# 创建日志相关主题
echo "创建 Kafka Topics..."

# 原始日志主题
docker exec $KAFKA_CONTAINER kafka-topics --create \
  --if-not-exists \
  --bootstrap-server localhost:9092 \
  --replication-factor 1 \
  --partitions 6 \
  --topic raw-logs

# 解析后日志主题
docker exec $KAFKA_CONTAINER kafka-topics --create \
  --if-not-exists \
  --bootstrap-server localhost:9092 \
  --replication-factor 1 \
  --partitions 6 \
  --topic parsed-logs

# 告警主题
docker exec $KAFKA_CONTAINER kafka-topics --create \
  --if-not-exists \
  --bootstrap-server localhost:9092 \
  --replication-factor 1 \
  --partitions 3 \
  --topic alerts

# 指标主题
docker exec $KAFKA_CONTAINER kafka-topics --create \
  --if-not-exists \
  --bootstrap-server localhost:9092 \
  --replication-factor 1 \
  --partitions 3 \
  --topic metrics

# 死信队列
docker exec $KAFKA_CONTAINER kafka-topics --create \
  --if-not-exists \
  --bootstrap-server localhost:9092 \
  --replication-factor 1 \
  --partitions 3 \
  --topic dlq-logs

# 查看所有主题
echo ""
echo "当前所有主题:"
docker exec $KAFKA_CONTAINER kafka-topics --list --bootstrap-server localhost:9092

echo ""
echo "Topic 创建完成！"
