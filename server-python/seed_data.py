#!/usr/bin/env python3
"""
测试数据生成脚本
运行: python seed_data.py
"""

import random
from datetime import datetime, timedelta
from app import create_app
from app.database import db
from app.models import (
    User, Event, Alert, Asset, ScanTask, Rule, 
    Playbook, AuditLog, Notification, HuntingQuery,
    AIModel, AITask, DataSource, LogType
)
from app.utils import hash_password
from app.routes.events import generate_event_code
from app.routes.alerts import generate_alert_code

def random_date(days_back=30):
    """生成随机日期"""
    return datetime.utcnow() - timedelta(
        days=random.randint(0, days_back),
        hours=random.randint(0, 23),
        minutes=random.randint(0, 59)
    )

def generate_users():
    """生成用户数据"""
    users_data = [
        {'username': 'admin', 'email': 'admin@usop.local', 'role': 'admin', 'status': 'active'},
        {'username': 'analyst01', 'email': 'analyst01@usop.local', 'role': 'analyst', 'status': 'active'},
        {'username': 'analyst02', 'email': 'analyst02@usop.local', 'role': 'analyst', 'status': 'active'},
        {'username': 'operator01', 'email': 'operator01@usop.local', 'role': 'operator', 'status': 'active'},
        {'username': 'operator02', 'email': 'operator02@usop.local', 'role': 'operator', 'status': 'inactive'},
        {'username': 'auditor01', 'email': 'auditor01@usop.local', 'role': 'auditor', 'status': 'active'},
    ]
    
    users = []
    for data in users_data:
        if not User.query.filter_by(username=data['username']).first():
            user = User(
                username=data['username'],
                email=data['email'],
                password_hash=hash_password('password123'),
                role=data['role'],
                status=data['status'],
                created_at=random_date(90)
            )
            db.session.add(user)
            users.append(user)
            print(f"  + 用户: {data['username']}")
    
    db.session.commit()
    return User.query.all()

def generate_events(users):
    """生成安全事件数据"""
    categories = ['入侵检测', '异常行为', '配置变更', '网络攻击', '权限变更', '数据访问', '服务异常']
    severities = ['critical', 'high', 'medium', 'low']
    statuses = ['new', 'investigating', 'closed', 'false_positive']
    
    event_templates = [
        {'title': '暴力破解攻击', 'category': '网络攻击', 'severity': 'high', 'description': '检测到来自 {ip} 的暴力破解尝试，尝试次数: {count}'},
        {'title': '异常登录行为', 'category': '异常行为', 'severity': 'medium', 'description': '用户 {user} 在异常时间登录，IP: {ip}'},
        {'title': '敏感数据访问', 'category': '数据访问', 'severity': 'critical', 'description': '检测到对敏感数据库 {db} 的异常访问'},
        {'title': '权限提升尝试', 'category': '权限变更', 'severity': 'critical', 'description': '用户 {user} 尝试提升权限'},
        {'title': '配置变更告警', 'category': '配置变更', 'severity': 'medium', 'description': '系统配置被修改: {config}'},
        {'title': '恶意流量检测', 'category': '入侵检测', 'severity': 'high', 'description': '检测到可疑网络流量 from {ip} to {ip2}'},
        {'title': '服务异常告警', 'category': '服务异常', 'severity': 'low', 'description': '服务 {service} 响应超时'},
        {'title': '横向移动检测', 'category': '入侵检测', 'severity': 'critical', 'description': '检测到内网横向移动: {ip} -> {ip2}'},
        {'title': '数据外泄告警', 'category': '数据访问', 'severity': 'critical', 'description': '检测到大量数据外传'},
        {'title': '后门程序检测', 'category': '入侵检测', 'severity': 'critical', 'description': '发现可疑后门程序: {file}'},
    ]
    
    ips = ['192.168.1.{}'.format(i) for i in range(10, 200)] + \
          ['10.0.0.{}'.format(i) for i in range(1, 50)] + \
          ['172.16.0.{}'.format(i) for i in range(1, 30)]
    
    count = 0
    for i in range(100):
        template = random.choice(event_templates)
        event = Event(
            event_code=generate_event_code(),
            title=template['title'],
            description=template['description'].format(
                ip=random.choice(ips),
                ip2=random.choice(ips),
                user=random.choice(users).username,
                count=random.randint(10, 500),
                db=random.choice(['customer_db', 'order_db', 'user_db', 'finance_db']),
                config=random.choice(['防火墙规则', '安全策略', '用户权限', '网络配置']),
                service=random.choice(['nginx', 'mysql', 'redis', 'apache']),
                file='/tmp/backdoor_{}.bin'.format(random.randint(1000, 9999))
            ),
            severity=random.choice(severities),
            category=template['category'],
            source=random.choice(['IDS', '防火墙', '主机监控', '应用日志', 'WAF', 'EDR']),
            status=random.choice(statuses),
            raw_log=f'{{"timestamp": "{datetime.now().isoformat()}", "src_ip": "{random.choice(ips)}", "event_type": "{template["category"]}"}}',
            timestamp=random_date(30),
            created_at=random_date(30)
        )
        db.session.add(event)
        count += 1
    
    print(f"  + 生成 {count} 条安全事件")
    db.session.commit()

def generate_alerts():
    """生成告警数据"""
    severities = ['critical', 'high', 'medium', 'low']
    statuses = ['new', 'resolved', 'false_positive']
    
    alert_templates = [
        {'title': '紧急: 发现恶意软件活动', 'severity': 'critical', 'description': '多台主机检测到恶意软件活动，需要立即处理'},
        {'title': '警告: 检测到数据泄露风险', 'severity': 'high', 'description': '检测到大量敏感数据外传行为'},
        {'title': '注意: 异常登录模式', 'severity': 'medium', 'description': '检测到异常的登录模式，可能存在账号被盗用'},
        {'title': '提醒: 系统配置变更', 'severity': 'low', 'description': '系统安全配置发生变更'},
        {'title': '紧急: 零日漏洞利用', 'severity': 'critical', 'description': '检测到可能的零日漏洞利用行为'},
        {'title': '警告: 内部威胁告警', 'severity': 'high', 'description': '检测到内部人员可疑行为'},
        {'title': '注意: 网络扫描活动', 'severity': 'medium', 'description': '检测到来自内网的网络扫描活动'},
        {'title': '提醒: 证书即将过期', 'severity': 'low', 'description': '系统证书将在7天内过期'},
    ]
    
    count = 0
    for i in range(50):
        template = random.choice(alert_templates)
        alert = Alert(
            alert_code=generate_alert_code(),
            title=template['title'],
            description=template['description'],
            severity=template['severity'],
            status=random.choice(statuses),
            source=random.choice(['IDS', '防火墙', 'SIEM', 'EDR', 'WAF', '主机监控']),
            assigned_to=random.randint(1, 6),
            event_ids=[random.randint(1, 100) for _ in range(random.randint(1, 5))],
            extra_data={
                'affected_assets': random.randint(1, 20),
                'first_seen': random_date(7).isoformat(),
                'last_seen': random_date(1).isoformat(),
                'confidence': random.randint(50, 100)
            },
            created_at=random_date(30),
            updated_at=random_date(7)
        )
        db.session.add(alert)
        count += 1
    
    print(f"  + 生成 {count} 条告警")
    db.session.commit()

def generate_assets():
    """生成资产数据"""
    types = ['server', 'workstation', 'network', 'database', 'web', 'container']
    statuses = ['online', 'offline', 'maintenance']
    
    assets_data = [
        {'name': 'Web Server 01', 'type': 'web', 'ip': '192.168.1.10', 'risk': 25, 'tags': ['web', 'nginx', 'production']},
        {'name': 'Web Server 02', 'type': 'web', 'ip': '192.168.1.11', 'risk': 30, 'tags': ['web', 'apache', 'production']},
        {'name': 'Database Primary', 'type': 'database', 'ip': '192.168.1.20', 'risk': 60, 'tags': ['mysql', '核心数据', 'production']},
        {'name': 'Database Replica', 'type': 'database', 'ip': '192.168.1.21', 'risk': 40, 'tags': ['mysql', 'replica', 'production']},
        {'name': 'App Server 01', 'type': 'server', 'ip': '192.168.1.30', 'risk': 35, 'tags': ['java', 'backend', 'production']},
        {'name': 'App Server 02', 'type': 'server', 'ip': '192.168.1.31', 'risk': 35, 'tags': ['java', 'backend', 'production']},
        {'name': 'Load Balancer', 'type': 'network', 'ip': '192.168.1.5', 'risk': 20, 'tags': ['nginx', 'lb', 'production']},
        {'name': 'Firewall Primary', 'type': 'network', 'ip': '192.168.1.1', 'risk': 15, 'tags': ['pfsense', 'edge', 'production']},
        {'name': 'Cache Server', 'type': 'server', 'ip': '192.168.1.40', 'risk': 25, 'tags': ['redis', 'cache']},
        {'name': 'Message Queue', 'type': 'server', 'ip': '192.168.1.41', 'risk': 20, 'tags': ['rabbitmq', 'mq']},
        {'name': 'Worker Node 01', 'type': 'container', 'ip': '10.0.1.10', 'risk': 45, 'tags': ['k8s', 'worker']},
        {'name': 'Worker Node 02', 'type': 'container', 'ip': '10.0.1.11', 'risk': 45, 'tags': ['k8s', 'worker']},
        {'name': 'K8s Master', 'type': 'container', 'ip': '10.0.1.1', 'risk': 55, 'tags': ['k8s', 'master']},
        {'name': 'Storage Server', 'type': 'server', 'ip': '192.168.1.50', 'risk': 40, 'tags': ['nfs', 'storage']},
        {'name': 'Backup Server', 'type': 'server', 'ip': '192.168.1.51', 'risk': 30, 'tags': ['backup']},
        {'name': 'Monitor Server', 'type': 'server', 'ip': '192.168.1.60', 'risk': 15, 'tags': ['prometheus', 'grafana']},
        {'name': 'Log Server', 'type': 'server', 'ip': '192.168.1.61', 'risk': 20, 'tags': ['elasticsearch', 'logging']},
        {'name': 'Developer PC 01', 'type': 'workstation', 'ip': '192.168.2.101', 'risk': 50, 'tags': ['dev', 'windows']},
        {'name': 'Developer PC 02', 'type': 'workstation', 'ip': '192.168.2.102', 'risk': 55, 'tags': ['dev', 'macos']},
        {'name': 'Admin Workstation', 'type': 'workstation', 'ip': '192.168.2.1', 'risk': 70, 'tags': ['admin', 'critical']},
    ]
    
    count = 0
    for data in assets_data:
        if not Asset.query.filter_by(name=data['name']).first():
            asset = Asset(
                name=data['name'],
                type=data['type'],
                ip=data['ip'],
                status=random.choice(statuses),
                risk_score=data['risk'],
                tags=data['tags'],
                extra_data={
                    'os': random.choice(['CentOS 7', 'Ubuntu 22.04', 'Windows Server 2019', 'Debian 11']),
                    'cpu': random.randint(2, 32),
                    'memory': random.randint(4, 128),
                    'last_scan': random_date(7).isoformat(),
                    'vulnerabilities': random.randint(0, 15),
                    'open_ports': random.randint(3, 50)
                },
                created_at=random_date(180),
                updated_at=random_date(7)
            )
            db.session.add(asset)
            count += 1
    
    print(f"  + 生成 {count} 条资产")
    db.session.commit()

def generate_scan_tasks():
    """生成扫描任务数据"""
    types = ['port_scan', 'service_detection', 'vulnerability_scan', 'web_scan', 'config_audit']
    statuses = ['pending', 'running', 'completed', 'failed', 'cancelled']
    
    scan_templates = [
        {'name': '内网端口扫描', 'type': 'port_scan', 'target': '192.168.1.0/24'},
        {'name': 'Web服务扫描', 'type': 'web_scan', 'target': '192.168.1.10'},
        {'name': '漏洞全面扫描', 'type': 'vulnerability_scan', 'target': '192.168.1.20'},
        {'name': '服务识别扫描', 'type': 'service_detection', 'target': '10.0.0.0/16'},
        {'name': '配置合规审计', 'type': 'config_audit', 'target': '192.168.1.0/24'},
        {'name': '外网暴露面扫描', 'type': 'port_scan', 'target': '203.0.113.0/24'},
        {'name': '数据库安全扫描', 'type': 'vulnerability_scan', 'target': '192.168.1.20'},
        {'name': 'API接口扫描', 'type': 'web_scan', 'target': 'api.internal.local'},
    ]
    
    count = 0
    for template in scan_templates:
        for i in range(3):
            status = random.choice(statuses)
            progress = 100 if status == 'completed' else (random.randint(10, 90) if status == 'running' else 0)
            
            scan = ScanTask(
                name=f"{template['name']} #{i+1}",
                type=template['type'],
                status=status,
                target=template['target'],
                progress=progress,
                results={
                    'hosts_scanned': random.randint(10, 200) if status == 'completed' else 0,
                    'open_ports': random.randint(50, 500) if status == 'completed' else 0,
                    'vulnerabilities': random.randint(0, 20) if status == 'completed' else 0,
                    'findings': random.randint(5, 50) if status == 'completed' else 0
                },
                created_at=random_date(30),
                started_at=random_date(14) if status != 'pending' else None,
                completed_at=random_date(7) if status == 'completed' else None
            )
            db.session.add(scan)
            count += 1
    
    print(f"  + 生成 {count} 条扫描任务")
    db.session.commit()

def generate_rules():
    """生成检测规则数据"""
    rules_data = [
        {'name': '暴力破解检测', 'type': 'single', 'severity': 'high', 'content': 'event_type="login" AND fail_count > 5 IN 5m', 'tags': ['登录安全', '暴力破解']},
        {'name': '横向移动检测', 'type': 'correlation', 'severity': 'critical', 'content': 'event_type="lateral_movement" DETECTED', 'tags': ['横向移动', 'APT']},
        {'name': '数据外泄检测', 'type': 'sequence', 'severity': 'critical', 'content': 'sequence: large_data_transfer -> external_ip -> process_termination', 'tags': ['数据安全', '外泄']},
        {'name': '异常登录时间', 'type': 'single', 'severity': 'medium', 'content': 'event_type="login" AND time NOT BETWEEN "08:00" AND "18:00"', 'tags': ['登录安全', '异常行为']},
        {'name': '高危命令执行', 'type': 'single', 'severity': 'high', 'content': 'event_type="command" AND command IN ["rm -rf", "mkfs", ":(){:|:&};:", "nc -e"]', 'tags': ['命令安全', '应急响应']},
        {'name': '权限提升检测', 'type': 'correlation', 'severity': 'critical', 'content': 'sequence: privilege_escalation_attempt -> sudo_use -> suspicious_process', 'tags': ['权限安全', '提权']},
        {'name': '后门通信检测', 'type': 'single', 'severity': 'critical', 'content': 'network_connection AND suspicious_domain AND uncommon_port', 'tags': ['后门', '网络']},
        {'name': '敏感文件访问', 'type': 'single', 'severity': 'medium', 'content': 'event_type="file_access" AND path CONTAINS ["/etc/passwd", "/etc/shadow", "/root/.ssh"]', 'tags': ['文件安全', '敏感数据']},
        {'name': '异常网络流量', 'type': 'correlation', 'severity': 'high', 'content': 'network_anomaly AND traffic_volume > threshold AND duration > 5m', 'tags': ['网络流量', '异常']},
        {'name': '密码策略绕过', 'type': 'single', 'severity': 'medium', 'content': 'event_type="config_change" AND target="password_policy" AND old_value.strength > new_value.strength', 'tags': ['配置安全', '密码']},
    ]
    
    count = 0
    for data in rules_data:
        rule = Rule(
            name=data['name'],
            type=data['type'],
            content=data['content'],
            status='active' if random.random() > 0.2 else 'inactive',
            severity=data['severity'],
            tags=data['tags'],
            created_at=random_date(90),
            updated_at=random_date(7)
        )
        db.session.add(rule)
        count += 1
    
    print(f"  + 生成 {count} 条检测规则")
    db.session.commit()

def generate_playbooks():
    """生成剧本数据"""
    playbooks_data = [
        {
            'name': '自动封堵恶意IP',
            'description': '当检测到恶意IP时，自动在防火墙上下发封堵规则',
            'nodes': [
                {'id': '1', 'type': 'trigger', 'label': '触发器', 'config': {'event_type': 'malicious_ip_detected'}},
                {'id': '2', 'type': 'condition', 'label': '验证IP', 'config': {'threat_level': '> 70'}},
                {'id': '3', 'type': 'action', 'label': '获取IP信息', 'config': {'action': 'enrich_ip'}},
                {'id': '4', 'type': 'action', 'label': '封堵IP', 'config': {'action': 'block_ip', 'target': 'firewall'}},
                {'id': '5', 'type': 'action', 'label': '发送通知', 'config': {'channel': 'email,slack'}},
                {'id': '6', 'type': 'end', 'label': '结束'}
            ],
            'edges': [
                {'from': '1', 'to': '2'},
                {'from': '2', 'to': '3'},
                {'from': '2', 'to': '6', 'label': '不满足条件'},
                {'from': '3', 'to': '4'},
                {'from': '4', 'to': '5'},
                {'from': '5', 'to': '6'}
            ]
        },
        {
            'name': '主机入侵响应',
            'description': '当主机被入侵时，自动进行隔离和取证',
            'nodes': [
                {'id': '1', 'type': 'trigger', 'label': '触发器', 'config': {'event_type': 'host_compromised'}},
                {'id': '2', 'type': 'action', 'label': '收集证据', 'config': {'action': 'collect_evidence'}},
                {'id': '3', 'type': 'action', 'label': '隔离主机', 'config': {'action': 'isolate_host'}},
                {'id': '4', 'type': 'action', 'label': '阻断进程', 'config': {'action': 'kill_suspicious_process'}},
                {'id': '5', 'type': 'action', 'label': '创建工单', 'config': {'action': 'create_ticket'}},
                {'id': '6', 'type': 'end', 'label': '结束'}
            ],
            'edges': [
                {'from': '1', 'to': '2'},
                {'from': '2', 'to': '3'},
                {'from': '3', 'to': '4'},
                {'from': '4', 'to': '5'},
                {'from': '5', 'to': '6'}
            ]
        },
        {
            'name': '数据泄露应急',
            'description': '检测到数据泄露时的应急响应流程',
            'nodes': [
                {'id': '1', 'type': 'trigger', 'label': '触发器', 'config': {'event_type': 'data_exfiltration'}},
                {'id': '2', 'type': 'condition', 'label': '确认泄露', 'config': {'confidence': '> 80'}},
                {'id': '3', 'type': 'action', 'label': '阻断传输', 'config': {'action': 'block_transfer'}},
                {'id': '4', 'type': 'action', 'label': '通知安全团队', 'config': {'action': 'notify_team'}},
                {'id': '5', 'type': 'action', 'label': '启动调查', 'config': {'action': 'start_investigation'}},
                {'id': '6', 'type': 'end', 'label': '结束'}
            ],
            'edges': [
                {'from': '1', 'to': '2'},
                {'from': '2', 'to': '3'},
                {'from': '2', 'to': '6', 'label': '误报'},
                {'from': '3', 'to': '4'},
                {'from': '4', 'to': '5'},
                {'from': '5', 'to': '6'}
            ]
        },
        {
            'name': '弱密码检测响应',
            'description': '检测到弱密码时的自动响应',
            'nodes': [
                {'id': '1', 'type': 'trigger', 'label': '触发器', 'config': {'event_type': 'weak_password_detected'}},
                {'id': '2', 'type': 'action', 'label': '强制修改密码', 'config': {'action': 'force_password_change'}},
                {'id': '3', 'type': 'action', 'label': '发送通知', 'config': {'action': 'notify_user'}},
                {'id': '4', 'type': 'end', 'label': '结束'}
            ],
            'edges': [
                {'from': '1', 'to': '2'},
                {'from': '2', 'to': '3'},
                {'from': '3', 'to': '4'}
            ]
        },
        {
            'name': '钓鱼邮件处理',
            'description': '自动处理和响应钓鱼邮件',
            'nodes': [
                {'id': '1', 'type': 'trigger', 'label': '触发器', 'config': {'event_type': 'phishing_email_detected'}},
                {'id': '2', 'type': 'action', 'label': '隔离邮件', 'config': {'action': 'quarantine_email'}},
                {'id': '3', 'type': 'action', 'label': '提取IoC', 'config': {'action': 'extract_ioc'}},
                {'id': '4', 'type': 'action', 'label': '搜索相关邮件', 'config': {'action': 'search_similar_emails'}},
                {'id': '5', 'type': 'action', 'label': '通知收件人', 'config': {'action': 'notify_recipients'}},
                {'id': '6', 'type': 'end', 'label': '结束'}
            ],
            'edges': [
                {'from': '1', 'to': '2'},
                {'from': '2', 'to': '3'},
                {'from': '3', 'to': '4'},
                {'from': '4', 'to': '5'},
                {'from': '5', 'to': '6'}
            ]
        }
    ]
    
    count = 0
    for data in playbooks_data:
        playbook = Playbook(
            name=data['name'],
            description=data['description'],
            nodes=data['nodes'],
            edges=data['edges'],
            status='active' if random.random() > 0.3 else 'draft',
            version='1.0',
            created_at=random_date(60),
            updated_at=random_date(7)
        )
        db.session.add(playbook)
        count += 1
    
    print(f"  + 生成 {count} 条剧本")
    db.session.commit()

def generate_audit_logs():
    """生成审计日志数据"""
    actions = [
        {'action': 'login', 'module': '认证', 'details': {'method': 'password'}},
        {'action': 'logout', 'module': '认证', 'details': {}},
        {'action': 'create', 'module': '事件', 'details': {'event_id': 'auto'}},
        {'action': 'update', 'module': '事件', 'details': {'field': 'status'}},
        {'action': 'acknowledge', 'module': '告警', 'details': {'alert_id': 'auto'}},
        {'action': 'resolve', 'module': '告警', 'details': {'alert_id': 'auto'}},
        {'action': 'create', 'module': '资产', 'details': {'asset_name': 'auto'}},
        {'action': 'update', 'module': '资产', 'details': {'field': 'risk_score'}},
        {'action': 'start', 'module': '扫描', 'details': {'scan_id': 'auto'}},
        {'action': 'stop', 'module': '扫描', 'details': {'scan_id': 'auto'}},
        {'action': 'create', 'module': '规则', 'details': {'rule_id': 'auto'}},
        {'action': 'update', 'module': '规则', 'details': {'rule_id': 'auto'}},
        {'action': 'toggle', 'module': '规则', 'details': {'rule_id': 'auto'}},
        {'action': 'create', 'module': '剧本', 'details': {'playbook_id': 'auto'}},
        {'action': 'execute', 'module': '剧本', 'details': {'playbook_id': 'auto'}},
        {'action': 'create', 'module': '用户', 'details': {'username': 'auto'}},
        {'action': 'update', 'module': '用户', 'details': {'username': 'auto'}},
        {'action': 'delete', 'module': '用户', 'details': {'username': 'auto'}},
        {'action': 'update', 'module': '配置', 'details': {'key': 'auto'}},
        {'action': 'export', 'module': '报表', 'details': {'report_type': 'daily'}},
    ]
    
    ips = ['192.168.1.{}'.format(i) for i in range(10, 50)] + ['10.0.0.{}'.format(i) for i in range(1, 20)]
    users = User.query.all()
    if not users:
        return
    
    count = 0
    for i in range(200):
        action_data = random.choice(actions)
        log = AuditLog(
            user_id=random.choice(users).id,
            username=random.choice(users).username,
            action=action_data['action'],
            module=action_data['module'],
            target=f"{action_data['module']}-{random.randint(1000, 9999)}",
            details=action_data['details'],
            ip=random.choice(ips),
            timestamp=random_date(30)
        )
        db.session.add(log)
        count += 1
    
    print(f"  + 生成 {count} 条审计日志")
    db.session.commit()

def generate_notifications():
    """生成通知数据"""
    notifications_data = [
        {'title': '新的安全告警', 'message': '检测到新的安全告警，请及时处理', 'type': 'warning'},
        {'title': '扫描任务完成', 'message': '内网端口扫描已完成，发现5个高危漏洞', 'type': 'info'},
        {'title': '剧本执行成功', 'message': '自动封堵恶意IP剧本执行成功', 'type': 'success'},
        {'title': '系统维护通知', 'message': '系统将于今晚23:00进行维护', 'type': 'info'},
        {'title': '权限变更提醒', 'message': '用户 analyst01 的权限已变更', 'type': 'warning'},
    ]
    
    users = User.query.all()
    if not users:
        return
    
    count = 0
    for i in range(50):
        data = random.choice(notifications_data)
        notification = Notification(
            user_id=random.choice(users).id,
            title=data['title'],
            message=data['message'],
            type=data['type'],
            read=random.random() > 0.3,
            created_at=random_date(14)
        )
        db.session.add(notification)
        count += 1
    
    print(f"  + 生成 {count} 条通知")
    db.session.commit()

def generate_hunting_queries():
    """生成威胁狩猎查询"""
    queries_data = [
        {'name': '异常登录模式', 'query': 'index=auth | stats count by user,src_ip | where count > 10', 'description': '检测异常登录模式'},
        {'name': '横向移动特征', 'query': 'index=network | rex field=pattern "(?i)(psexec|wmi|smb|rdp)" | stats count by src_ip,dest_ip', 'description': '查找横向移动特征'},
        {'name': '数据外泄检测', 'query': 'index=network dst_port=443 | stats sum(bytes) as total_bytes by src_ip | where total_bytes > 100000000', 'description': '检测大量数据外传'},
        {'name': '恶意域名访问', 'query': 'index=dns query=*.(tk|ml|ga|cf|gq)| stats count by query', 'description': '检测可疑域名访问'},
        {'name': '特权账户活动', 'query': 'index=auth user=root | stats count by src_ip,command', 'description': '监控root账户活动'},
    ]
    
    count = 0
    for data in queries_data:
        query = HuntingQuery(
            name=data['name'],
            query=data['query'],
            description=data['description'],
            created_at=random_date(90)
        )
        db.session.add(query)
        count += 1
    
    print(f"  + 生成 {count} 条威胁狩猎查询")
    db.session.commit()

def generate_ai_models():
    """生成AI模型配置"""
    models_data = [
        {'name': 'GPT-4', 'type': 'llm', 'provider': 'openai', 'status': 'active', 'config': {'model': 'gpt-4', 'temperature': 0.7}},
        {'name': 'Claude-3', 'type': 'llm', 'provider': 'anthropic', 'status': 'active', 'config': {'model': 'claude-3-opus', 'temperature': 0.7}},
        {'name': '威胁分析模型', 'type': 'classifier', 'provider': 'custom', 'status': 'active', 'config': {'version': '2.1', 'accuracy': 0.95}},
        {'name': '恶意软件检测', 'type': 'classifier', 'provider': 'custom', 'status': 'active', 'config': {'version': '1.5', 'accuracy': 0.92}},
    ]
    
    count = 0
    for data in models_data:
        model = AIModel(
            name=data['name'],
            type=data['type'],
            provider=data['provider'],
            status=data['status'],
            config=data['config'],
            created_at=random_date(60)
        )
        db.session.add(model)
        count += 1
    
    print(f"  + 生成 {count} 条AI模型")
    db.session.commit()

def generate_log_types():
    """生成日志类型配置"""
    log_types_data = [
        {
            'id': 'fw_logs',
            'name': '防火墙日志',
            'code': 'FW',
            'description': '网络防火墙日志，记录进出流量和访问控制策略',
            'category': 'network',
            'icon': 'FirewallOutlined',
            'color': '#1890ff',
            'default_severity': 3,
            'retention_days': 90,
            'tags': ['fw_', 'firewall', 'network', 'security']
        },
        {
            'id': 'ids_logs',
            'name': '入侵检测',
            'code': 'IDS',
            'description': '入侵检测系统日志，检测网络攻击和异常行为',
            'category': 'security',
            'icon': 'SecurityScanOutlined',
            'color': '#fa541c',
            'default_severity': 4,
            'retention_days': 90,
            'tags': ['ids_', 'snort', 'intrusion', 'detection']
        },
        {
            'id': 'edr_logs',
            'name': '终端日志',
            'code': 'EDR',
            'description': '终端检测与响应日志，记录主机安全事件',
            'category': 'security',
            'icon': 'DesktopOutlined',
            'color': '#722ed1',
            'default_severity': 4,
            'retention_days': 90,
            'tags': ['edr_', 'crowdstrike', 'endpoint', 'host']
        },
        {
            'id': 'waf_logs',
            'name': 'Web应用防火墙',
            'code': 'WAF',
            'description': 'Web应用防火墙日志，记录Web攻击防护事件',
            'category': 'application',
            'icon': 'GlobalOutlined',
            'color': '#fa8c16',
            'default_severity': 3,
            'retention_days': 90,
            'tags': ['waf_', 'modsecurity', 'web', 'application']
        },
        {
            'id': 'auth_logs',
            'name': '认证日志',
            'code': 'AUTH',
            'description': '身份认证日志，记录用户登录和权限变更',
            'category': 'audit',
            'icon': 'KeyOutlined',
            'color': '#52c41a',
            'default_severity': 2,
            'retention_days': 180,
            'tags': ['auth_', 'login', 'authentication', 'identity']
        },
    ]
    
    count = 0
    for data in log_types_data:
        if not LogType.query.get(data['id']):
            log_type = LogType(
                id=data['id'],
                name=data['name'],
                code=data['code'],
                description=data['description'],
                category=data['category'],
                icon=data['icon'],
                color=data['color'],
                default_severity=data['default_severity'],
                retention_days=data['retention_days'],
                status='active',
                tags=data['tags'],
                created_at=random_date(180)
            )
            db.session.add(log_type)
            count += 1
            print(f"  + 日志类型: {data['name']} ({data['code']})")
    
    db.session.commit()
    return count

def generate_data_sources():
    """生成数据源配置"""
    sources_data = [
        {'name': '防火墙日志', 'protocol': 'syslog', 'host': '192.168.1.100', 'port': 514, 'status': 'active'},
        {'name': 'IDS/IPS日志', 'protocol': 'syslog', 'host': '192.168.1.101', 'port': 514, 'status': 'active'},
        {'name': '主机日志', 'protocol': 'filebeat', 'host': '10.0.1.0', 'port': 5044, 'status': 'active'},
        {'name': '应用日志', 'protocol': 'api', 'host': 'elk.internal.local', 'port': 9200, 'status': 'active'},
        {'name': '云平台日志', 'protocol': 'api', 'host': 'api.cloud.provider.com', 'port': 443, 'status': 'active'},
    ]
    
    count = 0
    for data in sources_data:
        source = DataSource(
            name=data['name'],
            protocol=data['protocol'],
            host=data['host'],
            port=data['port'],
            username='log_reader',
            password='encrypted_password',
            config={'protocol': 'tcp', 'ssl': True},
            status=data['status'],
            created_at=random_date(180)
        )
        db.session.add(source)
        count += 1
    
    print(f"  + 生成 {count} 条数据源")
    db.session.commit()

def main():
    print("=" * 50)
    print("USOP 测试数据生成器")
    print("=" * 50)
    
    app = create_app()
    
    with app.app_context():
        print("\n[1/10] 生成用户数据...")
        users = generate_users()
        
        print("\n[2/10] 生成安全事件...")
        generate_events(users)
        
        print("\n[3/10] 生成告警数据...")
        generate_alerts()
        
        print("\n[4/10] 生成资产数据...")
        generate_assets()
        
        print("\n[5/10] 生成扫描任务...")
        generate_scan_tasks()
        
        print("\n[6/10] 生成检测规则...")
        generate_rules()
        
        print("\n[7/10] 生成剧本...")
        generate_playbooks()
        
        print("\n[8/10] 生成审计日志...")
        generate_audit_logs()
        
        print("\n[9/10] 生成通知...")
        generate_notifications()
        
        print("\n[10/10] 生成其他数据...")
        generate_hunting_queries()
        generate_ai_models()
        generate_data_sources()
        
        print("\n[11/11] 生成日志类型...")
        log_type_count = generate_log_types()
        if log_type_count > 0:
            print(f"  + 已添加 {log_type_count} 种日志类型")
    
    print("\n" + "=" * 50)
    print("测试数据生成完成!")
    print("=" * 50)
    print("\n默认账号:")
    print("  - admin / password123 (管理员)")
    print("  - analyst01 / password123 (分析师)")
    print("  - operator01 / password123 (运营人员)")

if __name__ == '__main__':
    main()
