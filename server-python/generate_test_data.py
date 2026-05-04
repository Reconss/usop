#!/usr/bin/env python3
"""
测试数据生成脚本
为 USOP 安全平台生成符合逻辑的测试数据
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from app.database import db
from app.models import (
    User, Event, Alert, Asset, ScanTask, DetectionRuleExtended, Playbook,
    AuditLog, HuntingQuery, HuntingResult, AIModel, AIAgent, AIInsight,
    Role, AssetPort, AssetVulnerability, Vulnerability, ScanAgent,
    ScanProfile, ScanResult, Product, Pipeline, DataSource
)
from app.utils import hash_password
from datetime import datetime, timedelta
import random
import json

def generate_test_data():
    """生成测试数据"""
    app = create_app()
    
    with app.app_context():
        print("开始生成测试数据...")
        
        # 检查数据是否已存在
        if User.query.count() > 10:
            print("\n数据已存在，跳过生成。如需重新生成，请先清空数据库。")
            print("\n统计信息:")
            print(f"  - 用户: {User.query.count()}")
            print(f"  - 资产: {Asset.query.count()}")
            print(f"  - 告警: {Alert.query.count()}")
            print(f"  - 事件: {Event.query.count()}")
            print(f"  - 检测规则: {DetectionRuleExtended.query.count()}")
            print(f"  - 扫描任务: {ScanTask.query.count()}")
            print(f"  - 狩猎查询: {HuntingQuery.query.count()}")
            print(f"  - AI模型: {AIModel.query.count()}")
            print(f"  - AI Agent: {AIAgent.query.count()}")
            print(f"  - AI洞察: {AIInsight.query.count()}")
            print(f"  - 剧本: {Playbook.query.count()}")
            print(f"  - 审计日志: {AuditLog.query.count()}")
            return
        
        # 1. 生成角色
        print("生成角色...")
        roles_data = [
            {'id': 'admin', 'name': '超级管理员', 'description': '系统最高权限', 'permissions': ['*'], 'is_system': True},
            {'id': 'analyst', 'name': '安全分析师', 'description': '安全分析和响应', 'permissions': ['read', 'analyze', 'respond'], 'is_system': True},
            {'id': 'operator', 'name': '运营人员', 'description': '日常运营操作', 'permissions': ['read', 'operate'], 'is_system': True},
            {'id': 'auditor', 'name': '审计员', 'description': '合规审计', 'permissions': ['read', 'audit'], 'is_system': True},
            {'id': 'guest', 'name': '访客', 'description': '只读访客', 'permissions': ['read'], 'is_system': True},
        ]
        
        for role_data in roles_data:
            if not Role.query.get(role_data['id']):
                role = Role(**role_data)
                db.session.add(role)
        
        # 2. 生成用户
        print("生成用户...")
        users_data = [
            {'username': 'admin', 'email': 'admin@usop.local', 'password_hash': hash_password('admin123'), 'role': 'admin', 'status': 'active'},
            {'username': 'analyst01', 'email': 'analyst01@usop.local', 'password_hash': hash_password('Password123!'), 'role': 'analyst', 'status': 'active'},
            {'username': 'analyst02', 'email': 'analyst02@usop.local', 'password_hash': hash_password('Password123!'), 'role': 'analyst', 'status': 'active'},
            {'username': 'operator01', 'email': 'operator01@usop.local', 'password_hash': hash_password('Password123!'), 'role': 'operator', 'status': 'active'},
            {'username': 'auditor01', 'email': 'auditor01@usop.local', 'password_hash': hash_password('Password123!'), 'role': 'auditor', 'status': 'active'},
        ]
        
        for i, user_data in enumerate(users_data, 1):
            if not User.query.filter_by(username=user_data['username']).first():
                user = User(**user_data)
                db.session.add(user)
        
        db.session.commit()
        admin_user = User.query.filter_by(username='admin').first()
        
        # 3. 生成资产
        print("生成资产...")
        assets_data = [
            {'name': 'web-server-01.company.com', 'type': 'domain', 'ip': '192.168.1.10', 'status': 'online', 'risk_score': 85, 'tags': ['production', 'web', 'critical']},
            {'name': 'web-server-02.company.com', 'type': 'domain', 'ip': '192.168.1.11', 'status': 'online', 'risk_score': 72, 'tags': ['production', 'web']},
            {'name': 'db-server-01.company.com', 'type': 'domain', 'ip': '192.168.1.20', 'status': 'online', 'risk_score': 68, 'tags': ['production', 'database']},
            {'name': 'api-gateway.company.com', 'type': 'domain', 'ip': '192.168.1.30', 'status': 'online', 'risk_score': 55, 'tags': ['production', 'api']},
            {'name': '192.168.1.50', 'type': 'ip', 'ip': '192.168.1.50', 'status': 'online', 'risk_score': 45, 'tags': ['workstation']},
            {'name': '192.168.1.51', 'type': 'ip', 'ip': '192.168.1.51', 'status': 'online', 'risk_score': 38, 'tags': ['workstation']},
            {'name': '192.168.1.100', 'type': 'ip', 'ip': '192.168.1.100', 'status': 'online', 'risk_score': 92, 'tags': ['server', 'critical']},
            {'name': 'vpn-gateway.company.com', 'type': 'domain', 'ip': '10.0.0.1', 'status': 'online', 'risk_score': 42, 'tags': ['vpn', 'gateway']},
            {'name': 'mail-server.company.com', 'type': 'domain', 'ip': '192.168.1.60', 'status': 'online', 'risk_score': 35, 'tags': ['mail']},
            {'name': 'file-server.company.com', 'type': 'domain', 'ip': '192.168.1.70', 'status': 'offline', 'risk_score': 28, 'tags': ['file']},
        ]
        
        created_assets = []
        for asset_data in assets_data:
            asset = Asset(**asset_data)
            db.session.add(asset)
            db.session.flush()
            created_assets.append(asset)
        
        db.session.commit()
        
        # 4. 为资产添加端口
        print("生成资产端口信息...")
        for asset in created_assets[:5]:
            ports = [
                {'asset_id': asset.id, 'port': 22, 'protocol': 'tcp', 'service': 'SSH', 'version': 'OpenSSH 8.2', 'state': 'open'},
                {'asset_id': asset.id, 'port': 80, 'protocol': 'tcp', 'service': 'HTTP', 'version': 'nginx 1.20', 'state': 'open'},
                {'asset_id': asset.id, 'port': 443, 'protocol': 'tcp', 'service': 'HTTPS', 'version': 'nginx 1.20', 'state': 'open'},
            ]
            if 'db' in asset.name:
                ports.append({'asset_id': asset.id, 'port': 3306, 'protocol': 'tcp', 'service': 'MySQL', 'version': '8.0.32', 'state': 'open'})
            
            for port_data in ports:
                port = AssetPort(**port_data)
                db.session.add(port)
        
        db.session.commit()
        
        # 5. 生成漏洞数据
        print("生成漏洞数据...")
        vulnerabilities_data = [
            {'id': 'CVE-2024-0001', 'name': 'OpenSSL 缓冲区溢出漏洞', 'cvss_score': 9.8, 'severity': 'critical', 'category': '应用安全'},
            {'id': 'CVE-2024-0002', 'name': 'SQL注入漏洞', 'cvss_score': 8.5, 'severity': 'high', 'category': '应用安全'},
            {'id': 'CVE-2024-0003', 'name': '弱密码策略', 'cvss_score': 5.3, 'severity': 'medium', 'category': '配置问题'},
            {'id': 'CVE-2024-0004', 'name': '跨站脚本(XSS)漏洞', 'cvss_score': 6.1, 'severity': 'medium', 'category': '应用安全'},
            {'id': 'CVE-2024-0005', 'name': '敏感信息泄露', 'cvss_score': 4.2, 'severity': 'low', 'category': '信息泄露'},
        ]
        
        created_vulns = []
        for vuln_data in vulnerabilities_data:
            if not Vulnerability.query.get(vuln_data['id']):
                vuln = Vulnerability(**vuln_data)
                db.session.add(vuln)
                db.session.flush()
                created_vulns.append(vuln)
            else:
                created_vulns.append(Vulnerability.query.get(vuln_data['id']))
        
        db.session.commit()
        
        # 6. 生成资产漏洞关联
        print("生成资产漏洞关联...")
        for asset in created_assets[:5]:
            for vuln in random.sample(created_vulns, min(2, len(created_vulns))):
                status = random.choice(['open', 'open', 'fixed', 'in_progress'])
                asset_vuln = AssetVulnerability(
                    asset_id=asset.id,
                    vuln_id=vuln.id,
                    status=status,
                    severity=vuln.severity,
                    cvss_score=vuln.cvss_score,
                    assessed_score=vuln.cvss_score * random.uniform(0.8, 1.2)
                )
                if status == 'fixed':
                    asset_vuln.fixed_at = datetime.utcnow() - timedelta(days=random.randint(1, 30))
                db.session.add(asset_vuln)
        
        db.session.commit()
        
        # 7. 生成告警
        print("生成告警...")
        alert_templates = [
            {'title': '检测到可疑出站连接', 'severity': 'high', 'source': '边界防火墙'},
            {'title': 'SQL注入攻击尝试', 'severity': 'critical', 'source': '入侵检测系统'},
            {'title': '恶意软件检测', 'severity': 'critical', 'source': '终端安全EDR'},
            {'title': '暴力破解攻击', 'severity': 'high', 'source': 'Web应用防火墙'},
            {'title': '数据外泄风险', 'severity': 'medium', 'source': '数据防泄漏'},
            {'title': '异常登录行为', 'severity': 'medium', 'source': '身份认证系统'},
            {'title': '权限提升尝试', 'severity': 'high', 'source': '终端安全EDR'},
            {'title': '横向移动检测', 'severity': 'high', 'source': '网络流量分析'},
        ]
        
        for i in range(50):
            template = random.choice(alert_templates)
            year = datetime.utcnow().year
            alert_code = f"ALERT-{year}-{i+1:03d}"
            
            # 检查是否已存在
            if Alert.query.filter_by(alert_code=alert_code).first():
                continue
                
            alert = Alert(
                alert_code=alert_code,
                title=template['title'],
                description=f"系统检测到{template['title']}事件，请及时处理。",
                severity=template['severity'],
                status=random.choice(['new', 'new', 'investigating', 'closed', 'false_positive']),
                source=template['source'],
                extra_data={'confidence': random.randint(60, 99)}
            )
            alert.created_at = datetime.utcnow() - timedelta(hours=random.randint(0, 72))
            db.session.add(alert)
        
        db.session.commit()
        
        # 8. 生成事件
        print("生成安全事件...")
        event_templates = [
            {'title': '网络入侵事件', 'severity': 'critical', 'category': '网络入侵'},
            {'title': '恶意软件感染', 'severity': 'critical', 'category': '恶意软件'},
            {'title': '数据泄露事件', 'severity': 'high', 'category': '数据安全'},
            {'title': '权限异常访问', 'severity': 'medium', 'category': '权限异常'},
            {'title': '配置变更告警', 'severity': 'low', 'category': '配置变更'},
        ]
        
        for i in range(30):
            template = random.choice(event_templates)
            year = datetime.utcnow().year
            event_code = f"EVT-{year}-{i+1:03d}"
            
            # 检查是否已存在
            if Event.query.filter_by(event_code=event_code).first():
                continue
                
            event = Event(
                event_code=event_code,
                title=template['title'],
                description=f"检测到{template['title']}，需要进一步调查。",
                severity=template['severity'],
                category=template['category'],
                source=random.choice(['防火墙', 'IDS', 'EDR', 'WAF']),
                status=random.choice(['new', 'investigating', 'closed'])
            )
            event.timestamp = datetime.utcnow() - timedelta(hours=random.randint(0, 168))
            event.created_at = event.timestamp
            db.session.add(event)
        
        db.session.commit()
        
        # 9. 生成检测规则
        print("生成检测规则...")
        rules_data = [
            {'id': 'RULE-2024-001', 'name': '暴力破解检测', 'type': 'single', 'severity': 'high', 'status': 'enabled', 'hit_count': 156},
            {'id': 'RULE-2024-002', 'name': '横向移动检测', 'type': 'correlation', 'severity': 'critical', 'status': 'enabled', 'hit_count': 23},
            {'id': 'RULE-2024-003', 'name': '数据外泄检测', 'type': 'sequence', 'severity': 'high', 'status': 'enabled', 'hit_count': 8},
            {'id': 'RULE-2024-004', 'name': '异常登录时间', 'type': 'single', 'severity': 'medium', 'status': 'disabled', 'hit_count': 45},
            {'id': 'RULE-2024-005', 'name': '高危命令执行', 'type': 'single', 'severity': 'high', 'status': 'enabled', 'hit_count': 12},
            {'id': 'RULE-2024-006', 'name': 'webshell检测', 'type': 'single', 'severity': 'critical', 'status': 'enabled', 'hit_count': 3},
            {'id': 'RULE-2024-007', 'name': '端口扫描检测', 'type': 'single', 'severity': 'medium', 'status': 'enabled', 'hit_count': 89},
        ]
        
        for rule_data in rules_data:
            if not DetectionRuleExtended.query.get(rule_data['id']):
                rule = DetectionRuleExtended(**rule_data)
                rule.rule_content = f"# {rule_data['name']} 规则\ncondition: true"
                rule.rule_language = 'sigma'
                rule.data_source_ids = ['ds-001', 'ds-002']
                rule.last_hit_time = datetime.utcnow() - timedelta(hours=random.randint(1, 48))
                db.session.add(rule)
        
        db.session.commit()
        
        # 10. 生成扫描任务
        print("生成扫描任务...")
        scan_types = ['port', 'vuln', 'web', 'service']
        targets = ['192.168.1.0/24', '10.0.0.0/16', 'web-server-01.company.com', 'api-gateway.company.com']
        
        for i in range(10):
            task_name = f"扫描任务-{datetime.utcnow().strftime('%Y%m%d')}-{i+1}"
            
            # 检查是否已存在
            if ScanTask.query.filter_by(name=task_name).first():
                continue
                
            task = ScanTask(
                name=task_name,
                type=random.choice(scan_types),
                target=random.choice(targets),
                status=random.choice(['completed', 'completed', 'running', 'queued', 'failed']),
                progress=random.randint(0, 100) if random.random() > 0.5 else 0
            )
            task.created_at = datetime.utcnow() - timedelta(days=random.randint(0, 7))
            if task.status == 'completed':
                task.started_at = task.created_at + timedelta(minutes=5)
                task.completed_at = task.started_at + timedelta(minutes=random.randint(10, 60))
                task.results = {
                    'hosts_discovered': random.randint(5, 50),
                    'ports_found': random.randint(20, 200),
                    'vulnerabilities': random.randint(0, 15)
                }
            db.session.add(task)
        
        db.session.commit()
        
        # 11. 生成扫描代理
        print("生成扫描代理...")
        agents_data = [
            {'id': 'agent-beijing-01', 'name': '北京节点-01', 'ip': '10.10.1.10', 'status': 'online', 'location': '北京'},
            {'id': 'agent-beijing-02', 'name': '北京节点-02', 'ip': '10.10.1.11', 'status': 'online', 'location': '北京'},
            {'id': 'agent-shanghai-01', 'name': '上海节点-01', 'ip': '10.10.2.10', 'status': 'online', 'location': '上海'},
            {'id': 'agent-shanghai-02', 'name': '上海节点-02', 'ip': '10.10.2.11', 'status': 'offline', 'location': '上海'},
            {'id': 'agent-guangzhou-01', 'name': '广州节点-01', 'ip': '10.10.3.10', 'status': 'busy', 'location': '广州'},
        ]
        
        for agent_data in agents_data:
            if not ScanAgent.query.get(agent_data['id']):
                agent = ScanAgent(**agent_data)
                agent.cpu_usage = random.uniform(10, 80)
                agent.memory_usage = random.uniform(20, 70)
                agent.capabilities = ['port_scan', 'vuln_scan', 'web_scan']
                agent.last_heartbeat = datetime.utcnow() - timedelta(minutes=random.randint(1, 30))
                db.session.add(agent)
        
        db.session.commit()
        
        # 12. 生成狩猎查询
        print("生成威胁狩猎查询...")
        queries_data = [
            {'name': '异常登录行为检测', 'query': 'source="auth" AND (hour < 8 OR hour > 20) AND country != "CN"', 'description': '检测非工作时间、异常地理位置的登录行为'},
            {'name': '横向移动检测', 'query': 'source="network" AND dest_port IN (445,135,139) AND src_ip != dest_ip', 'description': '检测内网主机间的异常访问模式'},
            {'name': '数据外泄检测', 'query': 'source="dlp" AND transfer_size > 100MB AND dest NOT IN (internal_ips)', 'description': '检测敏感数据的大量传输行为'},
            {'name': '恶意软件行为检测', 'query': 'source="edr" AND (process_name IN (suspicious_list) OR file_op = "encrypt")', 'description': '检测可疑的进程行为和文件操作'},
            {'name': '特权账户滥用检测', 'query': 'source="auth" AND account_type = "privileged" AND command IN (sensitive_cmds)', 'description': '检测特权账户的异常使用行为'},
        ]
        
        result_counter = 1
        for query_data in queries_data:
            # 检查是否已存在同名查询
            existing = db.session.query(HuntingQuery).filter_by(name=query_data['name']).first()
            if existing:
                continue
            hunting_query = HuntingQuery(**query_data)
            hunting_query.created_at = datetime.utcnow() - timedelta(days=random.randint(1, 30))
            db.session.add(hunting_query)
            db.session.flush()
            query = hunting_query
            
            # 为每个查询生成一些结果
            for j in range(random.randint(0, 5)):
                result = HuntingResult(
                    id=f"HR-{datetime.utcnow().year}-{result_counter:05d}",
                    query_id=query.id,
                    title=f"{query_data['name']} - 发现项 {j+1}",
                    description=f"基于查询 '{query_data['name']}' 发现的可疑行为。",
                    severity=random.choice(['critical', 'high', 'medium', 'low']),
                    indicators=['192.168.1.100', 'admin', 'US'],
                    affected_assets=['workstation-01', 'server-01']
                )
                result.created_at = datetime.utcnow() - timedelta(hours=random.randint(1, 72))
                db.session.add(result)
                result_counter += 1
        
        db.session.commit()
        
        # 13. 生成 AI 模型配置
        print("生成 AI 模型配置...")
        models_data = [
            {'name': 'GPT-4', 'type': 'chat', 'provider': 'OpenAI', 'status': 'active', 'config': {'model': 'gpt-4', 'temperature': 0.7, 'max_tokens': 2000}},
            {'name': 'GPT-3.5-Turbo', 'type': 'chat', 'provider': 'OpenAI', 'status': 'active', 'config': {'model': 'gpt-3.5-turbo', 'temperature': 0.7, 'max_tokens': 2000}},
            {'name': 'Claude-3', 'type': 'chat', 'provider': 'Anthropic', 'status': 'active', 'config': {'model': 'claude-3', 'temperature': 0.7, 'max_tokens': 2000}},
        ]
        
        for model_data in models_data:
            model = AIModel(**model_data)
            db.session.add(model)
        
        db.session.commit()
        
        # 14. 生成 AI Agent
        print("生成 AI Agent...")
        agents_ai_data = [
            {'id': 'agent-threat-analysis', 'name': '威胁分析助手', 'agent_type': 'threat_analysis', 'status': 'active', 'capabilities': ['事件分析', '威胁情报', '攻击链重建']},
            {'id': 'agent-log-parser', 'name': '日志解析专家', 'agent_type': 'log_parser', 'status': 'idle', 'capabilities': ['日志解析', '异常检测', '模式识别']},
            {'id': 'agent-investigator', 'name': '调查协作者', 'agent_type': 'investigator', 'status': 'idle', 'capabilities': ['关联分析', '证据收集', '报告生成']},
            {'id': 'agent-compliance', 'name': '合规检查员', 'agent_type': 'compliance', 'status': 'active', 'capabilities': ['合规检查', '策略审计', '风险评估']},
        ]
        
        gpt_model = AIModel.query.filter_by(name='GPT-4').first()
        for agent_data in agents_ai_data:
            if not AIAgent.query.get(agent_data['id']):
                agent = AIAgent(**agent_data)
                agent.description = f"{agent_data['name']} - {', '.join(agent_data['capabilities'])}"
                agent.icon = 'bot'
                agent.model_id = gpt_model.id if gpt_model else None
                agent.last_active = datetime.utcnow() - timedelta(hours=random.randint(1, 24))
                db.session.add(agent)
        
        db.session.commit()
        
        # 15. 生成 AI 洞察
        print("生成 AI 洞察...")
        insights_data = [
            {'id': 'INS-2024-001', 'title': '检测到APT攻击模式', 'severity': 'critical', 'category': '威胁情报', 'confidence': 92},
            {'id': 'INS-2024-002', 'title': '内部威胁风险预警', 'severity': 'high', 'category': '用户行为', 'confidence': 85},
            {'id': 'INS-2024-003', 'title': '配置漂移检测', 'severity': 'medium', 'category': '合规管理', 'confidence': 78},
            {'id': 'INS-2024-004', 'title': '零日漏洞利用迹象', 'severity': 'critical', 'category': '漏洞利用', 'confidence': 88},
        ]
        
        for insight_data in insights_data:
            if not AIInsight.query.get(insight_data['id']):
                insight = AIInsight(**insight_data)
                insight.description = f"AI分析发现: {insight_data['title']}，建议立即调查。"
                insight.related_events = [f'EVT-2024-{random.randint(1, 30):03d}']
                insight.recommendations = '1. 立即进行深度调查\n2. 检查相关日志\n3. 隔离可疑资产'
                insight.created_at = datetime.utcnow() - timedelta(hours=random.randint(1, 72))
                db.session.add(insight)
        
        db.session.commit()
        
        # 16. 生成剧本
        print("生成剧本...")
        playbooks_data = [
            {'name': '自动封堵恶意IP', 'description': '当检测到恶意IP时自动封堵', 'status': 'enabled', 'nodes': [], 'edges': []},
            {'name': '高危事件工单创建', 'description': '高危事件自动创建ITSM工单', 'status': 'enabled', 'nodes': [], 'edges': []},
            {'name': '每日安全报告', 'description': '定时生成并发送安全日报', 'status': 'disabled', 'nodes': [], 'edges': []},
        ]
        
        for pb_data in playbooks_data:
            # 检查是否已存在同名剧本
            if Playbook.query.filter_by(name=pb_data['name']).first():
                continue
            playbook = Playbook(**pb_data)
            playbook.created_at = datetime.utcnow() - timedelta(days=random.randint(1, 30))
            db.session.add(playbook)
        
        db.session.commit()
        
        # 17. 生成审计日志
        print("生成审计日志...")
        actions = ['用户登录', '事件确认', '规则更新', '资产扫描', '用户创建', '配置修改', '告警处理']
        for i in range(50):
            audit = AuditLog(
                user_id=random.choice([u.id for u in User.query.all()]),
                username=random.choice(['admin', 'analyst01', 'operator01']),
                action=random.choice(actions),
                module=random.choice(['auth', 'alerts', 'rules', 'assets', 'users']),
                target=f'target-{i}',
                details={'info': f'操作详情 {i}'},
                ip=f'192.168.1.{random.randint(10, 200)}'
            )
            audit.timestamp = datetime.utcnow() - timedelta(hours=random.randint(0, 168))
            db.session.add(audit)
        
        db.session.commit()
        
        # 18. 生成产品配置
        print("生成安全产品配置...")
        products_data = [
            {'name': '边界防火墙', 'code': 'firewall', 'category': '网络安全', 'vendor': 'Fortinet'},
            {'name': 'WAF', 'code': 'waf', 'category': '应用安全', 'vendor': 'Imperva'},
            {'name': 'IDS/IPS', 'code': 'ids', 'category': '网络安全', 'vendor': 'Suricata'},
            {'name': 'EDR', 'code': 'edr', 'category': '终端安全', 'vendor': 'CrowdStrike'},
            {'name': '邮件安全', 'code': 'email_security', 'category': '邮件安全', 'vendor': 'Symantec'},
        ]
        
        for product_data in products_data:
            if not Product.query.filter_by(code=product_data['code']).first():
                product = Product(**product_data)
                product.icon = product_data['code']
                product.default_severity = 3
                db.session.add(product)
        
        db.session.commit()
        
        print("\n" + "="*50)
        print("测试数据生成完成!")
        print("="*50)
        print("\n统计信息:")
        print(f"  - 用户: {User.query.count()}")
        print(f"  - 资产: {Asset.query.count()}")
        print(f"  - 告警: {Alert.query.count()}")
        print(f"  - 事件: {Event.query.count()}")
        print(f"  - 检测规则: {DetectionRuleExtended.query.count()}")
        print(f"  - 扫描任务: {ScanTask.query.count()}")
        print(f"  - 狩猎查询: {db.session.query(HuntingQuery).count()}")
        print(f"  - AI模型: {AIModel.query.count()}")
        print(f"  - AI Agent: {AIAgent.query.count()}")
        print(f"  - AI洞察: {AIInsight.query.count()}")
        print(f"  - 剧本: {Playbook.query.count()}")
        print(f"  - 审计日志: {AuditLog.query.count()}")
        print("="*50)

if __name__ == '__main__':
    generate_test_data()
