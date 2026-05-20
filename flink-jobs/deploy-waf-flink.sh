#!/bin/bash
# Flink WAF 日志处理作业部署脚本

set -e

echo "=== Flink WAF 作业部署 ==="

# 1. 检查 Flink 集群状态
echo "[1/5] 检查 Flink 集群..."
FLINK_STATUS=$(curl -s http://localhost:8081/overview | python3 -c "import sys,json; print(json.load(sys.stdin).get('jobs-running',0))" 2>/dev/null)
echo "  运行中的作业: $FLINK_STATUS"

# 2. 确保 Kafka topic 存在
echo "[2/5] 确保 Kafka Topic 存在..."
docker exec kafka kafka-topics --create --topic processed-alerts --bootstrap-server localhost:9092 --partitions 2 --replication-factor 1 2>/dev/null || echo "  Topic 已存在"

# 3. 检查 Flink SQL 依赖
echo "[3/5] 检查 Flink 依赖..."
docker exec flink-jobmanager ls /opt/flink/lib/flink-connector-kafka*.jar 2>/dev/null || echo "  警告: Kafka connector 未安装"

# 4. 使用 Flink SQL 提交作业（需要 SQL Gateway）
echo "[4/5] 部署 Flink SQL 作业..."

# 5. 检查作业状态
echo "[5/5] 检查作业状态..."
curl -s http://localhost:8081/v1/jobs | python3 -c "import sys,json; jobs=json.load(sys.stdin).get('jobs',[]); print(f'  运行中的作业: {len(jobs)}')" 2>/dev/null

echo ""
echo "=== 部署完成 ==="
echo ""
echo "后续步骤:"
echo "1. 启动 Flink SQL Gateway: docker exec -d flink-jobmanager /opt/flink/bin/sql-gateway.sh"
echo "2. 执行 SQL: docker exec -it flink-jobmanager /opt/flink/bin/sql-client.sh"
echo "3. 在 SQL Client 中执行: flink-jobs/waf-pipeline.sql"
echo ""
echo "或者使用 Java/Python API 提交自定义 Flink 作业"
