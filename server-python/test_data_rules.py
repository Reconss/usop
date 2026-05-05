#!/usr/bin/env python3
"""
检测规则和告警聚合功能测试数据
用于验证规则CRUD、规则测试、告警聚合等功能
运行: python test_data_rules.py
"""

import random
from datetime import datetime, timedelta
from app import create_app
from app.database import db
from app.models import Rule, Alert, Playbook, DataSource, Event, Asset
from app.routes.events import generate_event_code
from app.routes.alerts import generate_alert_code

def random_date(days_back=30):
    """生成随机日期"""
    return datetime.utcnow() - timedelta(
        days=random.randint(0, days_back),
        hours=random.randint(0, 23),
        minutes=random.randint(0, 59)
    )

def generate_test_events():
    """生成测试事件数据"""
    print("\n[5/6] 生成测试事件数据...")
    
    events_data = [
        {
            'id': 3001,
            'title': '测试-暴力破解攻击事件',
            'description': '检测到来自 192.168.2.100 的暴力破解尝试事件，包含5条关联告警',
            'severity': 'high',
            'category': '网络入侵',
            'source': '测试-认证日志',
            'status': 'new'
        },
        {
            'id': 3002,
            'title': '测试-可疑端口连接事件',
            'description': '主机 192.168.1.30 检测到到可疑端口 4444 的网络连接事件',
            'severity': 'critical',
            'category': '网络入侵',
            'source': '测试-防火墙日志',
            'status': 'investigating'
        },
        {
            'id': 3003,
            'title': '测试-横向移动事件',
            'description': '检测到内网横向移动行为事件: 192.168.1.50 -> 192.168.1.60',
            'severity': 'critical',
            'category': '横向移动',
            'source': '测试-防火墙日志',
            'status': 'new'
        },
        {
            'id': 3004,
            'title': '测试-高危命令执行事件',
            'description': '主机 192.168.1.100 执行了危险命令事件',
            'severity': 'critical',
            'category': '命令执行',
            'source': '测试-主机日志',
            'status': 'investigating'
        },
        {
            'id': 3005,
            'title': '测试-数据外泄风险事件',
            'description': '检测到大量数据外传事件，从 192.168.1.20 外传超过 500MB 数据',
            'severity': 'critical',
            'category': '数据泄露',
            'source': '测试-Web日志',
            'status': 'new'
        },
        {
            'id': 3006,
            'title': '测试-SQL注入攻击事件',
            'description': 'Web服务器检测到来自 203.0.113.50 的SQL注入尝试事件',
            'severity': 'high',
            'category': 'Web攻击',
            'source': '测试-Web日志',
            'status': 'resolved'
        },
        {
            'id': 3007,
            'title': '测试-异常登录时间事件',
            'description': '用户 admin 在凌晨 03:30 从 192.168.2.50 登录系统的事件',
            'severity': 'medium',
            'category': '登录异常',
            'source': '测试-认证日志',
            'status': 'closed'
        },
        {
            'id': 3008,
            'title': '测试-敏感文件访问事件',
            'description': '用户 test_user 尝试访问 /etc/shadow 文件的事件',
            'severity': 'high',
            'category': '权限异常',
            'source': '测试-主机日志',
            'status': 'investigating'
        }
    ]
    
    count = 0
    for data in events_data:
        existing = db.session.get(Event, data['id'])
        if not existing:
            event = Event(
                id=data['id'],
                event_code=f'EVT-{datetime.utcnow().year}-{data["id"]}',
                title=data['title'],
                description=data['description'],
                severity=data['severity'],
                category=data['category'],
                source=data['source'],
                status=data['status'],
                extra_data={
                    'affected_assets': random.randint(1, 5),
                    'confidence': random.randint(60, 100),
                    'test_data': True
                },
                timestamp=random_date(14),
                created_at=random_date(14),
                updated_at=random_date(3)
            )
            db.session.add(event)
            count += 1
            print(f"  + 事件: {data['title']} (ID: {data['id']}, 状态: {data['status']})")
    
    db.session.commit()
    print(f"  -> 共生成 {count} 条测试事件")
    return events_data


def generate_test_assets():
    """生成测试资产数据"""
    print("\n[6/6] 生成测试资产数据...")
    
    assets_data = [
        {
            'id': 201,
            'name': '测试-web-server-01.company.com',
            'type': 'server',
            'ip': '192.168.1.10',
            'status': 'online',
            'risk_score': 85
        },
        {
            'id': 202,
            'name': '测试-db-server-01.company.com',
            'type': 'database',
            'ip': '192.168.1.20',
            'status': 'online',
            'risk_score': 72
        },
        {
            'id': 203,
            'name': '测试-api-gateway.company.com',
            'type': 'server',
            'ip': '192.168.1.30',
            'status': 'online',
            'risk_score': 65
        },
        {
            'id': 204,
            'name': '测试-workstation-01',
            'type': 'workstation',
            'ip': '192.168.1.50',
            'status': 'online',
            'risk_score': 45
        },
        {
            'id': 205,
            'name': '测试-firewall-primary',
            'type': 'firewall',
            'ip': '192.168.0.1',
            'status': 'online',
            'risk_score': 30
        },
        {
            'id': 206,
            'name': '测试-mail-server.company.com',
            'type': 'server',
            'ip': '192.168.1.40',
            'status': 'online',
            'risk_score': 55
        },
        {
            'id': 207,
            'name': '测试-dns-server.company.com',
            'type': 'dns',
            'ip': '192.168.0.10',
            'status': 'online',
            'risk_score': 20
        },
        {
            'id': 208,
            'name': '测试-vpn-gateway.company.com',
            'type': 'vpn',
            'ip': '203.0.113.1',
            'status': 'online',
            'risk_score': 78
        },
        {
            'id': 209,
            'name': '测试-backup-server.company.com',
            'type': 'storage',
            'ip': '192.168.1.60',
            'status': 'offline',
            'risk_score': 40
        },
        {
            'id': 210,
            'name': '测试-load-balancer.company.com',
            'type': 'loadbalancer',
            'ip': '192.168.0.5',
            'status': 'online',
            'risk_score': 25
        }
    ]
    
    count = 0
    for data in assets_data:
        existing = db.session.get(Asset, data['id'])
        if not existing:
            asset = Asset(
                id=data['id'],
                name=data['name'],
                type=data['type'],
                ip=data['ip'],
                status=data['status'],
                risk_score=data['risk_score'],
                tags=['测试资产', '生产环境'],
                extra_data={
                    'os': 'Linux/CentOS 7.9',
                    'cpu': '8 cores',
                    'memory': '16GB',
                    'test_data': True
                },
                created_at=random_date(180),
                updated_at=random_date(7)
            )
            db.session.add(asset)
            count += 1
            print(f"  + 资产: {data['name']} (IP: {data['ip']}, 风险: {data['risk_score']})")
    
    db.session.commit()
    print(f"  -> 共生成 {count} 条测试资产")
    return assets_data

def generate_test_data_sources():
    """生成测试数据源"""
    print("\n[1/4] 生成测试数据源...")
    
    sources_data = [
        {
            'id': 101,
            'name': '测试-防火墙日志',
            'protocol': 'syslog',
            'source_type': 'push',
            'host': '192.168.100.10',
            'port': 514,
            'status': 'active',
            'message_count': 1500000,
            'description': '测试用防火墙日志数据源'
        },
        {
            'id': 102,
            'name': '测试-IDS日志',
            'protocol': 'syslog',
            'source_type': 'push',
            'host': '192.168.100.11',
            'port': 514,
            'status': 'active',
            'message_count': 850000,
            'description': '测试用入侵检测系统日志'
        },
        {
            'id': 103,
            'name': '测试-认证日志',
            'protocol': 'filebeat',
            'source_type': 'push',
            'host': '10.10.10.50',
            'port': 5044,
            'status': 'active',
            'message_count': 3200000,
            'description': '测试用认证系统日志'
        },
        {
            'id': 104,
            'name': '测试-Web日志',
            'protocol': 'api',
            'source_type': 'pull',
            'host': 'elk.test.local',
            'port': 9200,
            'status': 'connected',
            'message_count': 5200000,
            'description': '测试用Web应用日志'
        },
        {
            'id': 105,
            'name': '测试-主机日志',
            'protocol': 'filebeat',
            'source_type': 'push',
            'host': '10.10.10.100',
            'port': 5044,
            'status': 'connected',
            'message_count': 980000,
            'description': '测试用主机安全日志'
        }
    ]
    
    count = 0
    for data in sources_data:
        existing = db.session.get(DataSource, data['id'])
        if not existing:
            source = DataSource(
                id=data['id'],
                name=data['name'],
                protocol=data['protocol'],
                source_type=data['source_type'],
                host=data['host'],
                port=data['port'],
                status=data['status'],
                message_count=data['message_count'],
                description=data['description'],
                config={'protocol': 'tcp', 'ssl': False},
                created_at=random_date(180)
            )
            db.session.add(source)
            count += 1
            print(f"  + 数据源: {data['name']} (ID: {data['id']})")
    
    db.session.commit()
    print(f"  -> 共生成 {count} 条测试数据源")
    return sources_data


def generate_test_rules():
    """生成测试检测规则"""
    print("\n[2/4] 生成测试检测规则...")
    
    rules_data = [
        {
            'id': 1001,
            'name': '测试-暴力破解检测',
            'type': 'single',
            'content': 'event_type="login" AND status="failed" AND count(5m) >= 5',
            'severity': 'high',
            'status': 'active',
            'tags': ['暴力破解', '登录安全', '测试规则']
        },
        {
            'id': 1002,
            'name': '测试-异常登录时间',
            'type': 'single',
            'content': 'event_type="login" AND time NOT BETWEEN "08:00" AND "18:00"',
            'severity': 'medium',
            'status': 'active',
            'tags': ['异常登录', '登录安全', '测试规则']
        },
        {
            'id': 1003,
            'name': '测试-可疑网络连接',
            'type': 'single',
            'content': 'network_connection AND dst_port IN [4444, 5555, 6666, 7777] AND suspicious_process',
            'severity': 'critical',
            'status': 'active',
            'tags': ['后门', '网络攻击', '测试规则']
        },
        {
            'id': 1004,
            'name': '测试-敏感文件访问',
            'type': 'correlation',
            'content': 'sequence: file_access(path="/etc/shadow") -> privilege_check -> failed',
            'severity': 'high',
            'status': 'active',
            'tags': ['权限提升', '文件安全', '测试规则']
        },
        {
            'id': 1005,
            'name': '测试-数据外泄检测',
            'type': 'sequence',
            'content': 'sequence: large_upload(>100MB) -> external_destination -> process_termination',
            'severity': 'critical',
            'status': 'inactive',
            'tags': ['数据泄露', '数据安全', '测试规则']
        },
        {
            'id': 1006,
            'name': '测试-SQL注入检测',
            'type': 'single',
            'content': 'http_request AND sql_keywords AND error_response',
            'severity': 'high',
            'status': 'active',
            'tags': ['Web安全', 'SQL注入', '测试规则']
        },
        {
            'id': 1007,
            'name': '测试-横向移动检测',
            'type': 'correlation',
            'content': 'event_type="lateral_movement" AND internal_ip_scan',
            'severity': 'critical',
            'status': 'active',
            'tags': ['横向移动', 'APT', '测试规则']
        },
        {
            'id': 1008,
            'name': '测试-高危命令执行',
            'type': 'single',
            'content': 'command IN ["rm -rf /", "mkfs", ":(){ :|: & };:", "nc -e /bin/sh"]',
            'severity': 'critical',
            'status': 'active',
            'tags': ['命令注入', '应急响应', '测试规则']
        }
    ]
    
    count = 0
    for data in rules_data:
        existing = db.session.get(Rule, data['id'])
        if not existing:
            rule = Rule(
                id=data['id'],
                name=data['name'],
                type=data['type'],
                content=data['content'],
                severity=data['severity'],
                status=data['status'],
                tags=data['tags'],
                created_at=random_date(60),
                updated_at=random_date(7)
            )
            db.session.add(rule)
            count += 1
            print(f"  + 规则: {data['name']} (ID: {data['id']}, 类型: {data['type']})")
    
    db.session.commit()
    print(f"  -> 共生成 {count} 条测试规则")
    return rules_data


def generate_test_playbooks():
    """生成测试剧本"""
    print("\n[3/4] 生成测试剧本...")
    
    playbooks_data = [
        {
            'id': 1001,
            'name': '测试-恶意IP自动封堵',
            'description': '检测到恶意IP时自动在防火墙上封堵',
            'status': 'published',
            'nodes': [
                {'id': '1', 'type': 'trigger', 'label': '触发器', 'config': {'event_type': 'malicious_ip_detected'}},
                {'id': '2', 'type': 'condition', 'label': '威胁等级验证', 'config': {'threat_level': '> 70'}},
                {'id': '3', 'type': 'action', 'label': '获取IP信息', 'config': {'action': 'enrich_ip'}},
                {'id': '4', 'type': 'action', 'label': '封堵IP', 'config': {'action': 'block_ip'}},
                {'id': '5', 'type': 'action', 'label': '发送通知', 'config': {'channel': 'email'}},
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
            'id': 1002,
            'name': '测试-暴力破解响应',
            'description': '检测到暴力破解攻击时的自动响应',
            'status': 'published',
            'nodes': [
                {'id': '1', 'type': 'trigger', 'label': '触发器', 'config': {'event_type': 'brute_force_detected'}},
                {'id': '2', 'type': 'action', 'label': '封堵源IP', 'config': {'action': 'block_ip'}},
                {'id': '3', 'type': 'action', 'label': '通知管理员', 'config': {'action': 'notify'}},
                {'id': '4', 'type': 'action', 'label': '创建工单', 'config': {'action': 'create_ticket'}},
                {'id': '5', 'type': 'end', 'label': '结束'}
            ],
            'edges': [
                {'from': '1', 'to': '2'},
                {'from': '2', 'to': '3'},
                {'from': '3', 'to': '4'},
                {'from': '4', 'to': '5'}
            ]
        },
        {
            'id': 1003,
            'name': '测试-数据泄露应急',
            'description': '检测到数据泄露时的应急响应流程',
            'status': 'published',
            'nodes': [
                {'id': '1', 'type': 'trigger', 'label': '触发器', 'config': {'event_type': 'data_exfiltration'}},
                {'id': '2', 'type': 'condition', 'label': '确认泄露', 'config': {'confidence': '> 80'}},
                {'id': '3', 'type': 'action', 'label': '阻断传输', 'config': {'action': 'block_transfer'}},
                {'id': '4', 'type': 'action', 'label': '通知安全团队', 'config': {'action': 'notify_team'}},
                {'id': '5', 'type': 'end', 'label': '结束'}
            ],
            'edges': [
                {'from': '1', 'to': '2'},
                {'from': '2', 'to': '3'},
                {'from': '2', 'to': '5', 'label': '误报'},
                {'from': '3', 'to': '4'},
                {'from': '4', 'to': '5'}
            ]
        },
        {
            'id': 1004,
            'name': '测试-主机隔离响应',
            'description': '主机被入侵时的隔离和响应',
            'status': 'published',
            'nodes': [
                {'id': '1', 'type': 'trigger', 'label': '触发器', 'config': {'event_type': 'host_compromised'}},
                {'id': '2', 'type': 'action', 'label': '收集证据', 'config': {'action': 'collect_evidence'}},
                {'id': '3', 'type': 'action', 'label': '隔离主机', 'config': {'action': 'isolate_host'}},
                {'id': '4', 'type': 'action', 'label': '创建工单', 'config': {'action': 'create_ticket'}},
                {'id': '5', 'type': 'end', 'label': '结束'}
            ],
            'edges': [
                {'from': '1', 'to': '2'},
                {'from': '2', 'to': '3'},
                {'from': '3', 'to': '4'},
                {'from': '4', 'to': '5'}
            ]
        }
    ]
    
    count = 0
    for data in playbooks_data:
        existing = db.session.get(Playbook, data['id'])
        if not existing:
            playbook = Playbook(
                id=data['id'],
                name=data['name'],
                description=data['description'],
                nodes=data['nodes'],
                edges=data['edges'],
                status=data['status'],
                version='1.0',
                created_at=random_date(60),
                updated_at=random_date(7)
            )
            db.session.add(playbook)
            count += 1
            print(f"  + 剧本: {data['name']} (ID: {data['id']})")
    
    db.session.commit()
    print(f"  -> 共生成 {count} 条测试剧本")
    return playbooks_data


def generate_test_alerts():
    """生成测试告警数据"""
    print("\n[4/4] 生成测试告警数据...")
    
    severities = ['critical', 'high', 'medium', 'low']
    statuses = ['new', 'investigating', 'resolved', 'false_positive']
    
    alert_templates = [
        {
            'id': 2001,
            'title': '测试-暴力破解攻击告警',
            'description': '检测到来自 192.168.2.100 的暴力破解尝试，5分钟内失败登录 15 次',
            'severity': 'high',
            'source': '测试-认证日志',
            'event_ids': [1, 2, 3, 4, 5]
        },
        {
            'id': 2002,
            'title': '测试-异常登录时间告警',
            'description': '用户 admin 在凌晨 03:30 从 192.168.2.50 登录系统',
            'severity': 'medium',
            'source': '测试-认证日志',
            'event_ids': [6, 7]
        },
        {
            'id': 2003,
            'title': '测试-可疑端口连接告警',
            'description': '主机 192.168.1.30 检测到到可疑端口 4444 的网络连接',
            'severity': 'critical',
            'source': '测试-防火墙日志',
            'event_ids': [8, 9, 10]
        },
        {
            'id': 2004,
            'title': '测试-敏感文件访问告警',
            'description': '用户 test_user 尝试访问 /etc/shadow 文件',
            'severity': 'high',
            'source': '测试-主机日志',
            'event_ids': [11, 12]
        },
        {
            'id': 2005,
            'title': '测试-SQL注入告警',
            'description': 'Web服务器检测到来自 203.0.113.50 的SQL注入尝试',
            'severity': 'high',
            'source': '测试-Web日志',
            'event_ids': [13, 14, 15, 16, 17]
        },
        {
            'id': 2006,
            'title': '测试-横向移动告警',
            'description': '检测到内网横向移动行为: 192.168.1.50 -> 192.168.1.60',
            'severity': 'critical',
            'source': '测试-防火墙日志',
            'event_ids': [18, 19, 20]
        },
        {
            'id': 2007,
            'title': '测试-高危命令执行告警',
            'description': '主机 192.168.1.100 执行了危险命令: rm -rf /tmp/test*',
            'severity': 'critical',
            'source': '测试-主机日志',
            'event_ids': [21]
        },
        {
            'id': 2008,
            'title': '测试-数据外泄风险告警',
            'description': '检测到大量数据外传，从 192.168.1.20 外传超过 500MB 数据',
            'severity': 'critical',
            'source': '测试-Web日志',
            'event_ids': [22, 23, 24, 25]
        },
        {
            'id': 2009,
            'title': '测试-Web扫描告警',
            'description': '检测到来自 198.51.100.25 的Web目录扫描行为',
            'severity': 'medium',
            'source': '测试-Web日志',
            'event_ids': [26, 27, 28]
        },
        {
            'id': 2010,
            'title': '测试-权限变更告警',
            'description': '用户 operator01 被提升为管理员权限',
            'severity': 'medium',
            'source': '测试-认证日志',
            'event_ids': [29, 30]
        },
        {
            'id': 2011,
            'title': '测试-可疑进程告警',
            'description': '主机 192.168.1.80 检测到可疑进程正在运行',
            'severity': 'high',
            'source': '测试-主机日志',
            'event_ids': [31, 32]
        },
        {
            'id': 2012,
            'title': '测试-账户锁定告警',
            'description': '账户 admin 因连续登录失败被临时锁定',
            'severity': 'low',
            'source': '测试-认证日志',
            'event_ids': [33]
        }
    ]
    
    count = 0
    for data in alert_templates:
        existing = db.session.get(Alert, data['id'])
        if not existing:
            alert = Alert(
                id=data['id'],
                alert_code=generate_alert_code(),
                title=data['title'],
                description=data['description'],
                severity=data['severity'],
                status=random.choice(statuses),
                source=data['source'],
                assigned_to=1,  # 只使用已存在的admin用户
                event_ids=data['event_ids'],
                extra_data={
                    'affected_assets': random.randint(1, 5),
                    'first_seen': random_date(7).isoformat(),
                    'last_seen': random_date(1).isoformat(),
                    'confidence': random.randint(60, 100),
                    'test_data': True  # 标记为测试数据
                },
                created_at=random_date(14),
                updated_at=random_date(3)
            )
            db.session.add(alert)
            count += 1
            print(f"  + 告警: {data['title']} (ID: {data['id']}, 严重度: {data['severity']})")
    
    db.session.commit()
    print(f"  -> 共生成 {count} 条测试告警")
    return alert_templates


def main():
    print("=" * 60)
    print("检测规则和告警聚合功能 - 测试数据生成器")
    print("=" * 60)
    
    app = create_app()
    
    with app.app_context():
        print("\n" + "-" * 60)
        print("开始生成测试数据...")
        print("-" * 60)
        
        generate_test_data_sources()
        generate_test_rules()
        generate_test_playbooks()
        generate_test_alerts()
        generate_test_events()
        generate_test_assets()
        
        print("\n" + "=" * 60)
        print("测试数据生成完成!")
        print("=" * 60)
        print("\n【测试数据说明】")
        print("\n1. 检测规则 (8条)")
        print("   - 规则ID: 1001-1008")
        print("   - 包含单事件、关联、时序三种类型")
        print("   - 可用于测试规则创建、编辑、删除、测试功能")
        print("\n2. 数据源 (5条)")
        print("   - 数据源ID: 101-105")
        print("   - 可关联到检测规则进行数据监控")
        print("\n3. 剧本 (4条)")
        print("   - 剧本ID: 1001-1004")
        print("   - 状态为 'published'，可直接关联到规则")
        print("\n4. 告警 (12条)")
        print("   - 告警ID: 2001-2012")
        print("   - 可用于测试告警聚合功能")
        print("\n5. 事件 (8条)")
        print("   - 事件ID: 3001-3008")
        print("   - 状态包括: new, investigating, resolved, closed")
        print("   - 可用于测试事件工作台功能")
        print("\n6. 资产 (10条)")
        print("   - 资产ID: 201-210")
        print("   - 包含服务器、数据库、防火墙等类型")
        print("   - 风险分数: 20-85")
        print("\n【功能测试指南】")
        print("\n1. 测试规则CRUD:")
        print("   - 创建: 新建规则 -> 填写信息 -> 保存")
        print("   - 编辑: 点击编辑 -> 修改信息 -> 保存")
        print("   - 删除: 点击删除 -> 确认")
        print("\n2. 测试规则测试:")
        print("   - 选择规则 -> 点击测试按钮 -> 查看匹配结果")
        print("\n3. 测试告警聚合:")
        print("   - 选择多个告警 -> 点击'聚合生成事件'")
        print("   - 填写事件信息 -> 提交 -> 跳转事件工作台")
        print("\n" + "=" * 60)

if __name__ == '__main__':
    main()
