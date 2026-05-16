#!/bin/bash

echo "=========================================="
echo "USOP平台API功能测试报告 (修正版)"
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
    local endpoint="$2"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo "测试 $TOTAL_TESTS: $name"
    echo "  端点: $endpoint"
    
    response=$(curl -s -w "\n%{http_code}" "$BASE_URL$endpoint")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    echo "  HTTP状态码: $http_code"
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
        echo "  结果: ✅ 通过"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo "  结果: ❌ 失败"
        echo "  响应: $body" | head -5
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    echo ""
}

echo "=========================================="
echo "1. 基础服务测试"
echo "=========================================="
test_api "健康检查" "/health"

echo "=========================================="
echo "2. 仪表盘测试"
echo "=========================================="
test_api "仪表盘概览" "/dashboard-api/overview"
test_api "仪表盘统计" "/dashboard-api/stats"

echo "=========================================="
echo "3. 事件管理测试"
echo "=========================================="
test_api "获取事件列表" "/events?page=1&page_size=10"
test_api "获取事件统计" "/events/stats"

echo "=========================================="
echo "4. 告警管理测试"
echo "=========================================="
test_api "获取告警列表" "/alerts?page=1&page_size=10"
test_api "获取告警统计" "/alerts/stats"

echo "=========================================="
echo "5. 资产管理测试"
echo "=========================================="
test_api "获取资产列表" "/assets?page=1&page_size=10"
test_api "获取资产统计" "/assets-api/stats"

echo "=========================================="
echo "6. 规则管理测试"
echo "=========================================="
test_api "获取检测规则列表" "/rules?page=1&page_size=10"

echo "=========================================="
echo "7. 剧本管理测试"
echo "=========================================="
test_api "获取剧本列表" "/playbooks?page=1&page_size=10"

echo "=========================================="
echo "8. 用户管理测试"
echo "=========================================="
test_api "获取用户列表" "/users?page=1&page_size=10"

echo "=========================================="
echo "9. 数据源管理测试"
echo "=========================================="
test_api "获取数据源列表" "/data-sources?page=1&page_size=10"

echo "=========================================="
echo "10. 审计日志测试"
echo "=========================================="
test_api "获取审计日志" "/audit-logs?page=1&page_size=10"

echo "=========================================="
echo "11. AI中心测试"
echo "=========================================="
test_api "获取AI洞察" "/ai/insights?page=1&page_size=10"

echo "=========================================="
echo "12. 威胁狩猎测试"
echo "=========================================="
test_api "获取威胁狩猎结果" "/hunting/results?page=1&page_size=10"

echo "=========================================="
echo "13. 漏洞管理测试"
echo "=========================================="
test_api "获取漏洞列表" "/vulnerabilities-api/list?page=1&page_size=10"

echo "=========================================="
echo "14. 产品管理测试"
echo "=========================================="
test_api "获取产品列表" "/products?page=1&page_size=10"

echo "=========================================="
echo "15. 管道管理测试"
echo "=========================================="
test_api "获取管道列表" "/pipelines?page=1&page_size=10"

echo "=========================================="
echo "测试总结"
echo "=========================================="
echo "总测试数: $TOTAL_TESTS"
echo "通过: $PASSED_TESTS"
echo "失败: $FAILED_TESTS"
if [ $TOTAL_TESTS -gt 0 ]; then
    echo "成功率: $(echo "scale=2; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc)%"
fi
echo "=========================================="
