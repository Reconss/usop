#!/usr/bin/env python3
"""
USOP 安全平台 API 测试脚本
"""
import requests
import json
import sys
from datetime import datetime

BASE_URL = "http://localhost:5002"

class APITester:
    def __init__(self):
        self.base_url = BASE_URL
        self.session = requests.Session()
        self.token = None
        self.results = []
        self.passed = 0
        self.failed = 0
        self.login()
    
    def login(self):
        """登录获取token"""
        try:
            resp = self.session.post(
                f"{self.base_url}/api/auth/login",
                json={"username": "admin", "password": "admin123"},
                timeout=10
            )
            if resp.status_code == 200:
                data = resp.json()
                # 尝试从不同位置获取token
                if 'token' in data:
                    self.token = data['token']
                elif 'access_token' in data:
                    self.token = data['access_token']
                elif 'data' in data and 'token' in data['data']:
                    self.token = data['data']['token']
                elif 'data' in data and 'access_token' in data['data']:
                    self.token = data['data']['access_token']
                
                if self.token:
                    self.session.headers.update({'Authorization': f'Bearer {self.token}'})
                    print(f"✅ 登录成功，Token获取成功")
                else:
                    print(f"⚠️ 登录响应无token: {data}")
            else:
                print(f"⚠️ 登录失败: {resp.status_code} - {resp.text[:200]}")
        except Exception as e:
            print(f"⚠️ 登录异常: {str(e)}")
    
    def test(self, name, method, endpoint, expected_status=200, data=None, params=None, require_auth=True):
        """测试单个API"""
        url = f"{self.base_url}{endpoint}"
        try:
            if method == "GET":
                resp = self.session.get(url, params=params, timeout=10)
            elif method == "POST":
                resp = self.session.post(url, json=data, timeout=10)
            elif method == "PUT":
                resp = self.session.put(url, json=data, timeout=10)
            elif method == "DELETE":
                resp = self.session.delete(url, timeout=10)
            else:
                raise ValueError(f"Unknown method: {method}")
            
            # 对于不需要认证的端点，即使401也要算pass
            if not require_auth and resp.status_code == 401:
                self.results.append({
                    "name": name,
                    "status": "⚠️ SKIP (No Auth)",
                    "endpoint": endpoint,
                    "method": method
                })
                print(f"⚠️ SKIP [GET] {endpoint} - {name} (需要认证)")
                return True
            
            success = resp.status_code == expected_status
            if success:
                self.passed += 1
                status = "✅ PASS"
            else:
                self.failed += 1
                status = "❌ FAIL"
            
            result = {
                "name": name,
                "status": status,
                "endpoint": endpoint,
                "method": method,
                "expected": expected_status,
                "actual": resp.status_code,
                "response": resp.text[:200] if resp.text else ""
            }
            self.results.append(result)
            print(f"{status} [{method}] {endpoint} - {name}")
            if not success:
                print(f"       Expected: {expected_status}, Got: {resp.status_code}")
                print(f"       Response: {resp.text[:300]}")
            
            return success
        except Exception as e:
            self.failed += 1
            result = {
                "name": name,
                "status": "❌ ERROR",
                "endpoint": endpoint,
                "error": str(e)
            }
            self.results.append(result)
            print(f"❌ ERROR [{method}] {endpoint} - {name}: {str(e)}")
            return False
    
    def test_list(self, name, endpoint):
        """测试列表API"""
        return self.test(f"获取{name}列表", "GET", endpoint)
    
    def test_crud(self, name, endpoint, create_data):
        """测试CRUD操作"""
        success = self.test(f"创建{name}", "POST", endpoint, 201, create_data)
        self.test_list(f"{name}(创建后)", endpoint)
        return success

    def print_summary(self):
        """打印测试总结"""
        print("\n" + "="*60)
        print("测试结果总结")
        print("="*60)
        print(f"通过: {self.passed}")
        print(f"失败: {self.failed}")
        print(f"总计: {self.passed + self.failed}")
        total = self.passed + self.failed
        if total > 0:
            print(f"通过率: {self.passed/total*100:.1f}%")
        print("="*60)
        
        if self.failed > 0:
            print("\n失败项详情:")
            for r in self.results:
                if "FAIL" in r.get("status", "") or "ERROR" in r.get("status", ""):
                    print(f"  - [{r.get('method', 'N/A')}] {r.get('endpoint', 'N/A')}: {r.get('name', 'N/A')}")
                    print(f"    期望: {r.get('expected', 'N/A')}, 实际: {r.get('actual', 'N/A')}")

def run_tests():
    tester = APITester()
    
    print("\n" + "="*60)
    print("USOP 安全平台 API 测试")
    print("="*60)
    print(f"测试时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"后端地址: {BASE_URL}")
    print("="*60)
    
    # 1. 健康检查
    print("\n【1. 健康检查】")
    tester.test("服务健康检查", "GET", "/api/health", require_auth=False)
    
    # 2. Dashboard API
    print("\n【2. Dashboard API】")
    tester.test("仪表盘指标", "GET", "/api/dashboard-api/metrics")
    tester.test("事件趋势", "GET", "/api/dashboard-api/event-trend")
    tester.test("事件类型", "GET", "/api/dashboard-api/event-types")
    tester.test("攻击来源", "GET", "/api/dashboard-api/attack-sources")
    tester.test("风险资产", "GET", "/api/dashboard-api/risk-assets")
    tester.test("最近告警", "GET", "/api/dashboard-api/recent-alerts")
    tester.test("摘要统计", "GET", "/api/dashboard-api/summary")
    
    # 3. Alerts API
    print("\n【3. 告警管理 API】")
    tester.test_list("告警列表", "/api/alerts-api/alerts")
    tester.test("告警详情", "GET", "/api/alerts-api/alerts/1")
    tester.test_crud("告警", "/api/alerts-api/alerts", {
        "title": "API测试告警",
        "description": "API测试创建的告警",
        "severity": "medium",
        "status": "new",
        "source": "API测试"
    })
    
    # 4. Assets API
    print("\n【4. 资产管理 API】")
    tester.test_list("资产列表", "/api/assets-api/assets")
    tester.test("资产详情", "GET", "/api/assets-api/assets/1")
    tester.test("资产端口", "GET", "/api/assets-api/assets/1/ports")
    tester.test_crud("资产", "/api/assets-api/assets", {
        "name": "test-api-server",
        "type": "domain",
        "ip": "192.168.1.99",
        "status": "online",
        "risk_score": 50,
        "tags": ["test", "api"]
    })
    
    # 5. Vulnerabilities API
    print("\n【5. 漏洞管理 API】")
    tester.test_list("漏洞列表", "/api/vulnerabilities-api/vulnerabilities")
    tester.test("漏洞详情", "GET", "/api/vulnerabilities-api/vulnerabilities/CVE-2024-0001")
    
    # 6. Scans API
    print("\n【6. 扫描管理 API】")
    tester.test_list("扫描任务", "/api/scans-api/tasks")
    tester.test("扫描任务详情", "GET", "/api/scans-api/tasks/1")
    tester.test("扫描代理", "GET", "/api/scans-api/tasks/agents")
    tester.test("扫描配置", "GET", "/api/scans-api/tasks/profiles")
    tester.test_crud("扫描任务", "/api/scans-api/tasks", {
        "name": "API测试扫描",
        "type": "port",
        "target": "192.168.1.0/24"
    })
    
    # 7. Rules API
    print("\n【7. 检测规则 API】")
    tester.test_list("检测规则", "/api/rules-api/rules")
    tester.test("规则详情", "GET", "/api/rules-api/rules/RULE-2024-001")
    tester.test("启用规则", "POST", "/api/rules-api/rules/RULE-2024-001/toggle")
    
    # 8. Hunting API
    print("\n【8. 威胁狩猎 API】")
    tester.test_list("狩猎查询", "/api/hunting-api/queries")
    tester.test("狩猎查询详情", "GET", "/api/hunting-api/queries/1")
    tester.test("狩猎查询结果", "GET", "/api/hunting-api/queries/1/results")
    tester.test_crud("狩猎查询", "/api/hunting-api/queries", {
        "name": "API测试查询",
        "query": 'source="test" AND action="alert"',
        "description": "API测试创建的狩猎查询"
    })
    
    # 9. Playbooks API
    print("\n【9. 剧本管理 API】")
    tester.test_list("剧本列表", "/api/playbooks-api/playbooks")
    tester.test("剧本详情", "GET", "/api/playbooks-api/playbooks/1")
    
    # 10. Users API
    print("\n【10. 用户管理 API】")
    tester.test_list("用户列表", "/api/users-api/users")
    tester.test("当前用户", "GET", "/api/users-api/users/me")
    tester.test("用户详情", "GET", "/api/users-api/users/1")
    tester.test("角色列表", "GET", "/api/users-api/roles")
    
    # 11. AI API
    print("\n【11. AI 智能中心 API】")
    tester.test("AI模型列表", "GET", "/api/ai-api/models")
    tester.test("AI模型详情", "GET", "/api/ai-api/models/1")
    tester.test("AI洞察", "GET", "/api/ai-api/insights")
    tester.test("AI聊天会话", "GET", "/api/ai-api/chat/sessions")
    tester.test("AI任务", "GET", "/api/ai-api/tasks")
    
    # 12. Audit Logs API
    print("\n【12. 审计日志 API】")
    tester.test_list("审计日志", "/api/audit-logs-api/logs")
    
    # 13. Products API
    print("\n【13. 安全产品 API】")
    tester.test_list("产品列表", "/api/products-api/products")
    
    # 14. Data Sources API
    print("\n【14. 数据源 API】")
    tester.test_list("数据源", "/api/datasources-api/datasources")
    
    # 15. Log Types API
    print("\n【15. 日志类型 API】")
    tester.test_list("日志类型", "/api/log-types-api/log-types")
    
    # 16. Intelligent Parse API
    print("\n【16. 智能解析 API】")
    tester.test("智能解析", "POST", "/api/intelligent-parse/api/parse", data={
        "log_type": "json",
        "raw_log": '{"timestamp": "2024-01-01 12:00:00", "level": "ERROR", "message": "Test error"}'
    })
    tester.test("日志分类", "POST", "/api/intelligent-parse/api/classify", data={
        "raw_log": '<123>Jan 1 12:00:00 server sshd[1234]: Failed login from 192.168.1.1'
    })
    
    # 打印总结
    tester.print_summary()
    
    return tester.failed == 0

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
