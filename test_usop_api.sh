#!/bin/bash

echo "=========================================="
echo "USOP平台API功能测试报告"
echo "=========================================="
echo ""

BASE_URL="http://localhost:5001/api"

# 测试计数器
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# 测试函数
test_api() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo "测试 $TOTAL_TESTS: $name"
    echo "  方法: $method"
    echo "  端点: $endpoint"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$BASE_URL$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    echo "  HTTP状态码: $http_code"
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
        echo "  结果: ✅ 通过"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo "  结果: ❌ 失败"
        echo "  响应: $body"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    echo ""
}

echo "=========================================="
echo "1. 基础服务测试"
echo "=========================================="
test_api "健康检查" "GET" "/health"
test_api "仪表盘数据" "GET" "/dashboard/overview"
test_api "仪表盘统计" "GET" "/dashboard/stats"

echo "=========================================="
echo "2. 事件管理测试"
echo "=========================================="
test_api "获取事件列表" "GET" "/events?page=1&page_size=10"
test_api "获取事件统计" "GET" "/events/stats"

echo "=========================================="
echo "3. 告警管理测试"
echo "=========================================="
test_api "获取告警列表" "GET" "/alerts?page=1&page_size=10"
test_api "获取告警统计" "GET" "/alerts/stats"

echo "=========================================="
echo "4. 资产管理测试"
echo "=========================================="
test_api "获取资产列表" "GET" "/assets?page=1&page_size=10"
test_api "获取资产统计" "GET" "/assets/stats"

echo "=========================================="
echo "5. 规则管理测试"
echo "=========================================="
test_api "获取检测规则列表" "GET" "/rules?page=1&page_size=10"

echo "=========================================="
echo "6. 剧本管理测试"
echo "=========================================="
test_api "获取剧本列表" "GET" "/playbooks?page=1&page_size=10"

echo "=========================================="
echo "7. 用户管理测试"
echo "=========================================="
test_api "获取用户列表" "GET" "/users?page=1&page_size=10"

echo "=========================================="
echo "8. 数据源管理测试"
echo "=========================================="
test_api "获取数据源列表" "GET" "/datasources?page=1&page_size=10"

echo "=========================================="
echo "9. 审计日志测试"
echo "=========================================="
test_api "获取审计日志" "GET" "/audit-logs?page=1&page_size=10"

echo "=========================================="
echo "10. AI中心测试"
echo "=========================================="
test_api "获取AI洞察" "GET" "/ai/insights?page=1&page_size=10"

echo "=========================================="
echo "测试总结"
echo "=========================================="
echo "总测试数: $TOTAL_TESTS"
echo "通过: $PASSED_TESTS"
echo "失败: $FAILED_TESTS"
echo "成功率: $(echo "scale=2; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc)%"
echo "=========================================="
