#!/bin/bash
# 测试 OpenObserve 日志采集

BASE_URL="http://localhost:5001/api/openobserve"

echo "=== 1. 健康检查 ==="
curl -s "${BASE_URL}/health" | python3 -m json.tool 2>/dev/null || echo "服务未启动"

echo ""
echo "=== 2. 写入单条日志 ==="
curl -s -X POST "${BASE_URL}/logs/ingest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test" \
  -d '{
    "logs": [{"message": "test log", "src_ip": "192.168.1.100", "level": "info"}],
    "stream": "test_logs"
  }' | python3 -m json.tool 2>/dev/null || echo "请求失败"

echo ""
echo "=== 3. HTTP 直接采集测试 ==="
curl -s -X POST "${BASE_URL}/ingest/http" \
  -H "Content-Type: application/json" \
  -d '{"message": "ssh login failed", "src_ip": "10.0.0.1", "hostname": "web-server-01"}' | python3 -m json.tool 2>/dev/null

echo ""
echo "=== 4. 批量写入测试 ==="
curl -s -X POST "${BASE_URL}/ingest/batch" \
  -H "Content-Type: application/json" \
  -d '[
    {"message": "login success", "user": "admin", "src_ip": "192.168.1.1"},
    {"message": "login failed", "user": "root", "src_ip": "10.0.0.50"},
    {"message": "file created", "path": "/etc/passwd", "action": "create"}
  ]' | python3 -m json.tool 2>/dev/null

echo ""
echo "=== 5. 搜索日志 ==="
curl -s -X POST "${BASE_URL}/logs/search" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test" \
  -d '{
    "query": "login",
    "stream": "test_logs",
    "limit": 10
  }' | python3 -m json.tool 2>/dev/null

echo ""
echo "=== 6. 列出日志流 ==="
curl -s "${BASE_URL}/streams" \
  -H "Authorization: Bearer test" | python3 -m json.tool 2>/dev/null
