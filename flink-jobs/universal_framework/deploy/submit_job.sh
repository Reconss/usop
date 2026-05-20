#!/bin/bash
#
# Flink Job Submit Script
# 用法: ./submit_job.sh --pipeline-id 1 --job-name "nginx-log-parser"
#

set -e

# 默认配置
FLINK_REST_URL="${FLINK_REST_URL:-http://flink:8081}"
PIPELINE_ID=""
JOB_NAME=""
PARALLELISM=4
MEMORY="1024m"

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --pipeline-id)
            PIPELINE_ID="$2"
            shift 2
            ;;
        --job-name)
            JOB_NAME="$2"
            shift 2
            ;;
        --parallelism)
            PARALLELISM="$2"
            shift 2
            ;;
        --memory)
            MEMORY="$2"
            shift 2
            ;;
        --flink-url)
            FLINK_REST_URL="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# 验证参数
if [ -z "$PIPELINE_ID" ]; then
    echo "Error: --pipeline-id is required"
    echo "Usage: $0 --pipeline-id <id> [--job-name <name>] [--parallelism <num>] [--memory <size>]"
    exit 1
fi

# 设置默认值
if [ -z "$JOB_NAME" ]; then
    JOB_NAME="pipeline-${PIPELINE_ID}"
fi

echo "=========================================="
echo "Submitting Flink Job"
echo "=========================================="
echo "Pipeline ID: $PIPELINE_ID"
echo "Job Name: $JOB_NAME"
echo "Parallelism: $PARALLELISM"
echo "Memory: $MEMORY"
echo "Flink URL: $FLINK_REST_URL"
echo "=========================================="

# 构建请求
PAYLOAD="{\"pipeline_id\": $PIPELINE_ID, \"job_name\": \"$JOB_NAME\", \"parallelism\": $PARALLELISM, \"memory\": \"$MEMORY\"}"

# 提交作业
RESPONSE=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    "${FLINK_REST_URL}/jobs" 2>/dev/null || echo '{"success": false, "error": "Flink API not available"}')

echo "Response: $RESPONSE"

# 解析结果
if echo "$RESPONSE" | grep -q '"success":true'; then
    JOB_ID=$(echo "$RESPONSE" | grep -o '"job_id":"[^"]*"' | cut -d'"' -f4)
    echo ""
    echo "✅ Job submitted successfully!"
    echo "   Job ID: $JOB_ID"
    echo "   View at: ${FLINK_REST_URL}/#/job/$JOB_ID"
else
    echo ""
    echo "❌ Job submission failed"
    echo "$RESPONSE"
    exit 1
fi
