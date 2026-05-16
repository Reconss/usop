#!/usr/bin/env python3
"""
USOP 全表测试数据生成脚本
运行: cd /app && python seed_data.py
"""

import random
import json
from datetime import datetime, timedelta
from app import create_app
from app.database import db
from app.models import (
    User, Event, Alert, Asset, ScanTask, Rule,
    Playbook, AuditLog, Notification, HuntingQuery,
    AIModel, AITask, DataSource, LogType, Product,
    Pipeline, DataFormat, AlertLog, SystemConfig,
    FormatTemplate, DataTable, LogClassifier, ClassifierRule,
    DataSourceConfig, AlertFieldDefinition,
)
from app.models.extensions import (
    Vulnerability, AssetVulnerability, ScanProfile, ScanAgent,
    HuntingResult, AIInsight, AIChatSession, AIChatMessage,
    AIAgent, Role, AssetPort, ScanResult, DetectionRuleExtended,
    PlaybookExecution,
)
from app.models.pipeline_field_mapping import PipelineFieldMapping, PipelineConfig
from app.models.event_action import EventAction
from app.utils import hash_password
from app.routes.events import generate_event_code
from app.routes.alerts import generate_alert_code
from app.routes.storage_tables import StorageTable
from app.timescaledb import get_tsdb, create_alerts_hypertable


def random_date(days_back=30):
    return datetime.utcnow() - timedelta(
        days=random.randint(0, days_back),
        hours=random.randint(0, 23),
        minutes=random.randint(0, 59)
    )


def random_ip():
    return f'{random.randint(10,192)}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}'


def generate_users():
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
                username=data['username'], email=data['email'],
                password_hash=hash_password('password123'),
                role=data['role'], status=data['status'],
                created_at=random_date(90)
            )
            db.session.add(user)
            users.append(user)
            print(f"  + 用户: {data['username']}")
    db.session.commit()
    return User.query.all()


def generate_roles():
    roles_data = [
        {'id': 'admin', 'name': '管理员', 'description': '系统管理员，拥有所有权限', 'is_system': True,
         'permissions': ['*']},
        {'id': 'analyst', 'name': '安全分析师', 'description': '安全事件分析与处置', 'is_system': True,
         'permissions': ['events.*', 'alerts.*', 'assets.read', 'rules.read', 'playbooks.read']},
        {'id': 'operator', 'name': '运维人员', 'description': '日常运维操作', 'is_system': True,
         'permissions': ['assets.*', 'scans.*', 'events.read', 'alerts.read']},
        {'id': 'auditor', 'name': '审计员', 'description': '审计与报表查看', 'is_system': True,
         'permissions': ['audit-logs.*', 'reports.*', 'events.read', 'alerts.read']},
    ]
    count = 0
    for data in roles_data:
        if not Role.query.get(data['id']):
            role = Role(id=data['id'], name=data['name'], description=data['description'],
                        permissions=data['permissions'], is_system=data['is_system'])
            db.session.add(role)
            count += 1
    print(f"  + 生成 {count} 条角色")
    db.session.commit()


def generate_products():
    products_data = [
        {'name': '飞塔防火墙', 'code': 'FORTIGATE', 'category': 'network', 'vendor': 'Fortinet',
         'description': 'Fortinet 下一代防火墙日志', 'default_severity': 3},
        {'name': '深信服AF', 'code': 'SANGFOR_AF', 'category': 'network', 'vendor': '深信服',
         'description': '深信服下一代防火墙日志', 'default_severity': 3},
        {'name': 'Snort IDS', 'code': 'SNORT', 'category': 'security', 'vendor': 'Cisco',
         'description': 'Snort 入侵检测系统日志', 'default_severity': 4},
        {'name': 'CrowdStrike', 'code': 'CS', 'category': 'security', 'vendor': 'CrowdStrike',
         'description': 'CrowdStrike EDR 终端日志', 'default_severity': 4},
        {'name': 'ModSecurity WAF', 'code': 'MODSEC', 'category': 'application', 'vendor': 'SpiderLabs',
         'description': 'ModSecurity Web 应用防火墙日志', 'default_severity': 3},
    ]
    count = 0
    for data in products_data:
        product = Product(name=data['name'], code=data['code'], category=data['category'],
                          vendor=data['vendor'], description=data['description'],
                          default_severity=data['default_severity'], status='active')
        db.session.add(product)
        count += 1
    print(f"  + 生成 {count} 条安全产品")
    db.session.commit()
    return Product.query.all()


def generate_log_types():
    types_data = [
        {'id': 'fw_logs', 'name': '防火墙日志', 'code': 'FW', 'category': 'network',
         'description': '网络防火墙日志，记录进出流量和访问控制策略',
         'icon': 'FirewallOutlined', 'color': '#1890ff', 'default_severity': 3, 'retention_days': 90},
        {'id': 'ids_logs', 'name': '入侵检测日志', 'code': 'IDS', 'category': 'security',
         'description': '入侵检测系统日志，检测网络攻击和异常行为',
         'icon': 'SecurityScanOutlined', 'color': '#fa541c', 'default_severity': 4, 'retention_days': 90},
        {'id': 'edr_logs', 'name': '终端安全日志', 'code': 'EDR', 'category': 'security',
         'description': '终端检测与响应日志，记录主机安全事件',
         'icon': 'DesktopOutlined', 'color': '#722ed1', 'default_severity': 4, 'retention_days': 90},
        {'id': 'waf_logs', 'name': 'WAF日志', 'code': 'WAF', 'category': 'application',
         'description': 'Web应用防火墙日志，记录Web攻击防护事件',
         'icon': 'GlobalOutlined', 'color': '#fa8c16', 'default_severity': 3, 'retention_days': 90},
        {'id': 'auth_logs', 'name': '认证日志', 'code': 'AUTH', 'category': 'audit',
         'description': '身份认证日志，记录用户登录和权限变更',
         'icon': 'KeyOutlined', 'color': '#52c41a', 'default_severity': 2, 'retention_days': 180},
    ]
    count = 0
    for data in types_data:
        if not LogType.query.get(data['id']):
            lt = LogType(id=data['id'], name=data['name'], code=data['code'],
                         description=data['description'], category=data['category'],
                         icon=data['icon'], color=data['color'],
                         default_severity=data['default_severity'],
                         retention_days=data['retention_days'], status='active')
            db.session.add(lt)
            count += 1
            print(f"  + 日志类型: {data['name']}")
    db.session.commit()
    return LogType.query.all()


def generate_data_sources(products, log_types):
    sources_data = [
        {'name': '核心防火墙', 'protocol': 'syslog', 'host': '192.168.1.100', 'port': 514, 'product': products[0],
         'log_type': 'fw_logs'},
        {'name': '边界IDS', 'protocol': 'syslog', 'host': '192.168.1.101', 'port': 514, 'product': products[2],
         'log_type': 'ids_logs'},
        {'name': '终端EDR集群', 'protocol': 'api', 'host': '10.0.1.50', 'port': 443, 'product': products[3],
         'log_type': 'edr_logs'},
        {'name': 'Web防护网关', 'protocol': 'syslog', 'host': '192.168.1.102', 'port': 514, 'product': products[4],
         'log_type': 'waf_logs'},
        {'name': '认证服务器', 'protocol': 'filebeat', 'host': '10.0.1.60', 'port': 5044, 'product': products[1],
         'log_type': 'auth_logs'},
    ]
    count = 0
    for data in sources_data:
        ds = DataSource(name=data['name'], protocol=data['protocol'],
                        source_type=data['product'].code, host=data['host'], port=data['port'],
                        username='log_reader', password='enc_****',
                        status='active', product_id=data['product'].id,
                        log_type_id=data['log_type'],
                        config={'protocol': 'tcp', 'ssl': True, 'batch_size': 100},
                        created_at=random_date(180))
        db.session.add(ds)
        count += 1
    print(f"  + 生成 {count} 条数据源")
    db.session.commit()
    return DataSource.query.all()


def generate_format_templates(log_types):
    templates = [
        {'id': 'syslog_std', 'name': 'Syslog标准格式', 'log_type_id': 'fw_logs', 'type': 'syslog',
         'sample': '<14>1 2024-01-15T10:30:00Z fw01 firewall - - src=192.168.1.10 dst=10.0.0.1 sport=12345 dport=80 proto=tcp action=allow',
         'fields': [{'name': 'src_ip', 'type': 'string'}, {'name': 'dst_ip', 'type': 'string'},
                    {'name': 'src_port', 'type': 'number'}, {'name': 'dst_port', 'type': 'number'},
                    {'name': 'protocol', 'type': 'string'}, {'name': 'action', 'type': 'string'}]},
        {'id': 'json_std', 'name': 'JSON标准格式', 'log_type_id': 'edr_logs', 'type': 'json',
         'sample': '{"timestamp":"2024-01-15T10:30:00Z","hostname":"host01","event_type":"process_create","user":"admin","pid":1234,"cmdline":"/bin/bash -c whoami"}',
         'fields': [{'name': 'hostname', 'type': 'string'}, {'name': 'event_type', 'type': 'string'},
                    {'name': 'user', 'type': 'string'}, {'name': 'pid', 'type': 'number'},
                    {'name': 'cmdline', 'type': 'string'}]},
        {'id': 'grok_std', 'name': 'Grok解析模版', 'log_type_id': 'waf_logs', 'type': 'grok',
         'sample': '192.168.1.10 - - [15/Jan/2024:10:30:00 +0800] "POST /api/login HTTP/1.1" 403 234 "-" "Mozilla/5.0"',
         'fields': [{'name': 'src_ip', 'type': 'string'}, {'name': 'method', 'type': 'string'},
                    {'name': 'path', 'type': 'string'}, {'name': 'status_code', 'type': 'number'}]},
    ]
    count = 0
    for data in templates:
        ft = FormatTemplate(id=data['id'], name=data['name'], description=f'{data["type"]} 格式模板',
                            log_type_id=data['log_type_id'], type=data['type'],
                            sample=data['sample'], fields=data['fields'], is_system=True,
                            is_custom=False, used_by_count=0)
        db.session.add(ft)
        count += 1
    print(f"  + 生成 {count} 条格式模板")
    db.session.commit()


def generate_pipelines(products, log_types):
    pipelines_data = [
        {'name': '防火墙日志解析管道', 'product': products[0], 'log_type': 'fw_logs',
         'input_format': 'syslog', 'status': 'active', 'priority': 10},
        {'name': 'IDS告警解析管道', 'product': products[2], 'log_type': 'ids_logs',
         'input_format': 'syslog', 'status': 'active', 'priority': 8},
        {'name': 'EDR事件解析管道', 'product': products[3], 'log_type': 'edr_logs',
         'input_format': 'json', 'status': 'active', 'priority': 9},
        {'name': 'WAF日志解析管道', 'product': products[4], 'log_type': 'waf_logs',
         'input_format': 'grok', 'status': 'inactive', 'priority': 5},
    ]
    count = 0
    for data in pipelines_data:
        pipeline = Pipeline(name=data['name'], description=f'{data["name"]} - 自动解析与字段映射',
                            product_id=data['product'].id, log_type_id=data['log_type'],
                            input_format=data['input_format'], status=data['status'],
                            priority=data['priority'],
                            batch_size=1000, parallel_workers=2,
                            match_conditions={'source_type': data['product'].code},
                            field_mapping={'source_ip': 'src_ip', 'dest_ip': 'dst_ip'},
                            created_at=random_date(90))
        db.session.add(pipeline)
        count += 1
    print(f"  + 生成 {count} 条解析管道")
    db.session.commit()
    return Pipeline.query.all()


def generate_pipeline_configs(pipelines):
    count = 0
    for p in pipelines:
        pc = PipelineConfig(pipeline_id=p.id, parser_type=p.input_format,
                            parser_config={'timestamp_format': 'auto', 'timezone': 'UTC'},
                            sample_log='sample log data', filter_rules=[],
                            transform_rules=[{'field': 'src_ip', 'action': 'trim'}],
                            created_at=random_date(30))
        db.session.add(pc)
        count += 1
    print(f"  + 生成 {count} 条管道配置")
    db.session.commit()


def generate_pipeline_mappings(pipelines):
    field_map = [
        {'target': 'src_ip', 'source': 'source_ip', 'type': 'string', 'required': True},
        {'target': 'dst_ip', 'source': 'dest_ip', 'type': 'string', 'required': True},
        {'target': 'src_port', 'source': 'source_port', 'type': 'number', 'required': False},
        {'target': 'dst_port', 'source': 'dest_port', 'type': 'number', 'required': False},
        {'target': 'protocol', 'source': 'proto', 'type': 'string', 'required': True},
    ]
    count = 0
    for p in pipelines:
        for m in field_map:
            mapping = PipelineFieldMapping(pipeline_id=p.id, target_field=m['target'],
                                           source_field=m['source'], field_type=m['type'],
                                           is_required=m['required'], sort_order=field_map.index(m))
            db.session.add(mapping)
            count += 1
    print(f"  + 生成 {count} 条字段映射")
    db.session.commit()


def generate_events(users):
    ips = ['192.168.1.{}'.format(i) for i in range(10, 200)] + \
          ['10.0.0.{}'.format(i) for i in range(1, 50)]
    categories = ['入侵检测', '异常行为', '配置变更', '网络攻击', '权限变更', '数据访问', '服务异常']
    severities = ['critical', 'high', 'medium', 'low']
    statuses = ['new', 'investigating', 'resolved', 'false_positive']

    templates = [
        {'title': '暴力破解攻击', 'category': '网络攻击', 'severity': 'high'},
        {'title': '异常登录行为', 'category': '异常行为', 'severity': 'medium'},
        {'title': '敏感数据访问', 'category': '数据访问', 'severity': 'critical'},
        {'title': '权限提升尝试', 'category': '权限变更', 'severity': 'critical'},
        {'title': '恶意流量检测', 'category': '入侵检测', 'severity': 'high'},
        {'title': '横向移动检测', 'category': '入侵检测', 'severity': 'critical'},
        {'title': '数据外泄告警', 'category': '数据访问', 'severity': 'critical'},
        {'title': '后门程序检测', 'category': '入侵检测', 'severity': 'critical'},
        {'title': '服务异常告警', 'category': '服务异常', 'severity': 'low'},
        {'title': '配置变更告警', 'category': '配置变更', 'severity': 'medium'},
        {'title': '挖矿木马告警', 'category': '入侵检测', 'severity': 'critical'},
        {'title': 'DNS隧道检测', 'category': '网络攻击', 'severity': 'high'},
    ]
    count = 0
    for i in range(120):
        t = random.choice(templates)
        event = Event(
            event_code=generate_event_code(),
            title=t['title'], description=f'{t["title"]} - 来自 {random.choice(ips)}',
            severity=t['severity'], category=t['category'],
            source=random.choice(['IDS', '防火墙', '主机监控', 'WAF', 'EDR']),
            status=random.choice(statuses),
            raw_log=f'{{"timestamp":"{datetime.now().isoformat()}","src_ip":"{random.choice(ips)}","event_type":"{t["category"]}"}}',
            timestamp=random_date(30), created_at=random_date(30)
        )
        db.session.add(event)
        count += 1
    print(f"  + 生成 {count} 条安全事件")
    db.session.commit()
    return Event.query.all()


def generate_event_actions(events, users):
    actions = ['create', 'investigate', 'escalate', 'resolve', 'close', 'comment', 'assign']
    count = 0
    for event in random.sample(events, min(30, len(events))):
        for _ in range(random.randint(1, 3)):
            user = random.choice(users)
            ea = EventAction(
                event_id=str(event.id), action=random.choice(actions),
                content=f'事件处置操作记录', user_id=user.id, user_name=user.username,
                assignee=random.choice(users).username, created_at=random_date(14)
            )
            db.session.add(ea)
            count += 1
    print(f"  + 生成 {count} 条事件处置记录")
    db.session.commit()


def generate_alerts_pg():
    severities = ['critical', 'high', 'medium', 'low']
    statuses = ['open', 'acknowledged', 'resolved', 'false_positive']
    ips = ['192.168.1.{}'.format(i) for i in range(10, 50)]
    titles = [
        ('紧急: 发现恶意软件活动', 'critical'), ('警告: 检测到数据泄露风险', 'high'),
        ('注意: 异常登录模式', 'medium'), ('提醒: 系统配置变更', 'low'),
        ('紧急: 零日漏洞利用', 'critical'), ('警告: 内部威胁告警', 'high'),
        ('注意: 网络扫描活动', 'medium'), ('提醒: 证书即将过期', 'low'),
        ('紧急: 勒索软件加密行为', 'critical'), ('警告: 可疑Powershell执行', 'high'),
    ]
    count = 0
    for i in range(60):
        title, sev = random.choice(titles)
        alert = Alert(
            title=title, description=f'{title} - 需要安全团队关注处理',
            severity=str(random.randint(1, 5)), status=random.choice(statuses),
            source=random.choice(['IDS', '防火墙', 'SIEM', 'EDR', 'WAF']),
            alert_code=f'ALT-{datetime.utcnow().strftime("%Y%m%d")}-{i+1:04d}',
            event_ids=[random.randint(1, 100) for _ in range(random.randint(1, 5))],
            extra_data={
                'src_ip': random.choice(ips), 'dst_ip': random.choice(ips),
                'rule_id': random.randint(1, 10), 'event_count': random.randint(1, 50),
                'tags': random.sample(['network', 'malware', 'phishing', 'ransomware', 'apt', 'insider'], random.randint(1, 3)),
                'confidence': random.randint(50, 100),
                'mitre_tactic': random.choice(['TA0001', 'TA0002', 'TA0003']),
                'first_seen': random_date(14).isoformat(),
                'last_seen': random_date(1).isoformat()
            })
        db.session.add(alert)
        count += 1
    print(f"  + 生成 {count} 条告警(PostgreSQL)")
    db.session.commit()


def generate_alerts_tsdb():
    """Seed TimescaleDB alerts hypertable"""
    from app.timescaledb import get_tsdb
    tsdb = get_tsdb()
    session = tsdb.get_session()
    severity_list = ['critical', 'high', 'medium', 'low']
    status_list = ['new', 'active', 'resolved', 'false_positive']
    sources = ['FORTIGATE', 'SNORT', 'CROWDSTRIKE', 'MODSEC', 'WAF', 'EDR']
    ips = ['192.168.1.{}'.format(i) for i in range(10, 50)] + ['10.0.0.{}'.format(i) for i in range(1, 20)]
    hosts = ['web-01', 'db-01', 'app-01', 'gw-01', 'dc-01', 'mail-01', 'file-01']
    alert_codes_seen = set()
    try:
        create_alerts_hypertable(session)
        count = 0
        for i in range(80):
            src = random.choice(ips)
            dst = random.choice(ips)
            sev = random.choice(severity_list)
            code = f'ALERT-{datetime.utcnow().strftime("%Y")}-{random.randint(1000, 9999):04d}'
            while code in alert_codes_seen:
                code = f'ALERT-{datetime.utcnow().strftime("%Y")}-{random.randint(1000, 9999):04d}'
            alert_codes_seen.add(code)
            ts = random_date(14)
            session.execute(db.text("""
                INSERT INTO alerts (alert_code, title, description, severity, status, source,
                    src_ip, dst_ip, src_port, dst_port, protocol, hostname, raw_log, tags, first_seen, last_seen)
                VALUES (:code, :title, :desc, :sev, :stat, :src, :sip, :dip, :sport, :dport,
                    :proto, :host, :raw, :tags, :fs, :ls)
            """), {
                'code': code,
                'title': random.choice([
                    '防火墙阻断攻击流量', 'IDS检测到SQL注入', '终端异常进程创建',
                    'Web应用攻击尝试', '暴力破解SSH服务', 'DNS查询异常域名',
                    'SMB远程执行攻击', '异常计划任务创建', '系统账号创建告警'
                ]),
                'desc': f'源 {src}:{random.randint(1024,65535)} -> 目标 {dst}:{random.randint(1,65535)} 协议: {random.choice(["TCP","UDP","ICMP"])}',
                'sev': sev, 'stat': random.choice(status_list),
                'src': random.choice(sources),
                'sip': src, 'dip': dst,
                'sport': random.randint(1024, 65535), 'dport': random.choice([22, 80, 443, 3306, 3389, 6379, 8080, 9090]),
                'proto': random.choice(['TCP', 'UDP', 'ICMP', 'HTTP', 'HTTPS']),
                'host': random.choice(hosts),
                'raw': json.dumps({'event_id': i, 'rule': 'rule-{}'.format(random.randint(1, 20))}),
                'tags': json.dumps(random.sample(['network', 'attack', 'malware', 'scan', 'bruteforce', 'web', 'apt'], random.randint(1, 4))),
                'fs': ts, 'ls': ts + timedelta(minutes=random.randint(1, 120))
            })
            count += 1
        session.commit()
        print(f"  + 生成 {count} 条告警(TimescaleDB)")
    except Exception as e:
        session.rollback()
        print(f"  ! TimescaleDB 告警生成失败: {e}")
    finally:
        session.close()


def generate_assets():
    assets_data = [
        {'name': 'Web Server 01', 'type': 'web', 'ip': '192.168.1.10', 'risk': 25, 'tags': ['web', 'nginx', 'production']},
        {'name': 'Web Server 02', 'type': 'web', 'ip': '192.168.1.11', 'risk': 30, 'tags': ['web', 'apache', 'production']},
        {'name': 'Database Primary', 'type': 'database', 'ip': '192.168.1.20', 'risk': 60, 'tags': ['mysql', '核心数据']},
        {'name': 'Database Replica', 'type': 'database', 'ip': '192.168.1.21', 'risk': 40, 'tags': ['mysql', 'replica']},
        {'name': 'App Server 01', 'type': 'server', 'ip': '192.168.1.30', 'risk': 35, 'tags': ['java', 'backend']},
        {'name': 'Load Balancer', 'type': 'network', 'ip': '192.168.1.5', 'risk': 20, 'tags': ['nginx', 'lb']},
        {'name': '防火墙主备', 'type': 'network', 'ip': '192.168.1.1', 'risk': 15, 'tags': ['pfsense', 'edge']},
        {'name': '缓存服务器', 'type': 'server', 'ip': '192.168.1.40', 'risk': 25, 'tags': ['redis']},
        {'name': '消息队列', 'type': 'server', 'ip': '192.168.1.41', 'risk': 20, 'tags': ['rabbitmq']},
        {'name': 'K8s Master', 'type': 'container', 'ip': '10.0.1.1', 'risk': 55, 'tags': ['k8s', 'master']},
        {'name': '存储服务器', 'type': 'server', 'ip': '192.168.1.50', 'risk': 40, 'tags': ['nfs', 'storage']},
        {'name': '备份服务器', 'type': 'server', 'ip': '192.168.1.51', 'risk': 30, 'tags': ['backup']},
        {'name': '监控服务器', 'type': 'server', 'ip': '192.168.1.60', 'risk': 15, 'tags': ['prometheus', 'monitor']},
        {'name': '运维堡垒机', 'type': 'server', 'ip': '192.168.1.70', 'risk': 70, 'tags': ['jumpserver', 'critical']},
        {'name': 'AD域控制器', 'type': 'server', 'ip': '192.168.1.8', 'risk': 75, 'tags': ['ad', 'domain', 'critical']},
    ]
    count = 0
    for data in assets_data:
        if not Asset.query.filter_by(name=data['name']).first():
            asset = Asset(name=data['name'], type=data['type'], ip=data['ip'],
                          status=random.choice(['online', 'online', 'online', 'offline']),
                          risk_score=data['risk'], tags=data['tags'],
                          extra_data={'os': random.choice(['CentOS 7', 'Ubuntu 22.04', 'Windows Server 2019']),
                                      'cpu': random.randint(2, 32), 'memory': random.randint(4, 128)},
                          created_at=random_date(180), updated_at=random_date(7))
            db.session.add(asset)
            count += 1
    print(f"  + 生成 {count} 条资产")
    db.session.commit()
    return Asset.query.all()


def generate_asset_ports(assets):
    services = [('22', 'SSH', 'OpenSSH'), ('80', 'HTTP', 'nginx'), ('443', 'HTTPS', 'nginx'),
                ('3306', 'MySQL', 'MySQL 8.0'), ('6379', 'Redis', 'Redis 6.2'),
                ('5432', 'PostgreSQL', 'PG 15'), ('3389', 'RDP', 'Windows RDP'),
                ('8080', 'HTTP-Proxy', 'Tomcat'), ('9090', 'HTTP-Alt', 'Grafana')]
    count = 0
    for asset in assets:
        for _ in range(random.randint(2, 5)):
            port, svc, ver = random.choice(services)
            ap = AssetPort(asset_id=asset.id, port=int(port), protocol='tcp',
                           service=svc, version=ver, state='open',
                           discovered_at=random_date(60))
            db.session.add(ap)
            count += 1
    print(f"  + 生成 {count} 条资产端口")
    db.session.commit()


def generate_vulnerabilities():
    vulns = [
        ('CVE-2024-21626', 'runc 容器逃逸漏洞', 8.6, 'critical', 'containerd'),
        ('CVE-2024-3094', 'XZ Utils 后门漏洞', 10.0, 'critical', 'liblzma'),
        ('CVE-2023-44487', 'HTTP/2 快速重置攻击', 7.5, 'high', 'nginx'),
        ('CVE-2023-46604', 'Apache ActiveMQ RCE', 9.8, 'critical', 'activemq'),
        ('CVE-2024-27198', 'JetBrains TeamCity 认证绕过', 9.8, 'critical', 'teamcity'),
    ]
    count = 0
    for cve, name, cvss, sev, product in vulns:
        vuln = Vulnerability(id=f'VULN-{cve}', name=name, cve_id=cve,
                             cvss_score=cvss, severity=sev, description=f'{name} 影响 {product} 组件',
                             solution=f'升级 {product} 到最新安全版本',
                             category=random.choice(['remote', 'local', 'dos', 'rce']),
                             affected_product=product)
        db.session.add(vuln)
        count += 1
    print(f"  + 生成 {count} 条漏洞")
    db.session.commit()
    return Vulnerability.query.all()


def generate_asset_vulnerabilities(assets, vulns):
    count = 0
    for asset in random.sample(assets, min(8, len(assets))):
        for v in random.sample(vulns, random.randint(1, 3)):
            av = AssetVulnerability(asset_id=asset.id, vuln_id=v.id,
                                    severity=v.severity, cvss_score=v.cvss_score,
                                    assessed_score=round(v.cvss_score * random.uniform(0.8, 1.0), 1),
                                    status=random.choice(['open', 'in_progress', 'fixed']),
                                    evidence=f'Detected on port {random.choice([22,80,443,3306,6379])}',
                                    discovered_at=random_date(60), assignee=random.choice(['analyst01', 'analyst02', 'operator01']))
            db.session.add(av)
            count += 1
    print(f"  + 生成 {count} 条资产漏洞关联")
    db.session.commit()


def generate_scan_tasks():
    types = ['port_scan', 'vulnerability_scan', 'web_scan', 'config_audit', 'service_detection']
    statuses = ['pending', 'running', 'completed', 'failed']
    templates = [
        ('内网全端口扫描', 'port_scan', '192.168.0.0/16'),
        ('Web服务深度扫描', 'web_scan', '192.168.1.10,192.168.1.11'),
        ('高危漏洞扫描', 'vulnerability_scan', '192.168.1.0/24'),
        ('基线配置核查', 'config_audit', '192.168.1.0/24'),
        ('外网资产发现', 'port_scan', '203.0.113.0/24'),
        ('数据库安全评估', 'vulnerability_scan', '192.168.1.20,192.168.1.21'),
        ('容器安全扫描', 'vulnerability_scan', '10.0.1.0/24'),
    ]
    count = 0
    for name, typ, target in templates:
        for i in range(2):
            st = random.choice(statuses)
            progress = 100 if st == 'completed' else (random.randint(10, 90) if st == 'running' else 0)
            scan = ScanTask(name=f'{name} #{i+1}', type=typ, status=st, target=target,
                            progress=progress,
                            results={'hosts_scanned': random.randint(10, 200),
                                     'open_ports': random.randint(50, 500),
                                     'vulnerabilities': random.randint(0, 20)},
                            created_at=random_date(30), started_at=random_date(14) if st != 'pending' else None,
                            completed_at=random_date(7) if st == 'completed' else None)
            db.session.add(scan)
            count += 1
    print(f"  + 生成 {count} 条扫描任务")
    db.session.commit()
    return ScanTask.query.all()


def generate_scan_results(tasks):
    types = ['port', 'vulnerability', 'service', 'config']
    count = 0
    for task in tasks[:10]:
        for _ in range(random.randint(3, 8)):
            sr = ScanResult(task_id=task.id, target=f'192.168.1.{random.randint(1,254)}',
                            result_type=random.choice(types),
                            result_data={'finding': random.choice(['Open port', 'Weak cipher', 'Default creds', 'Outdated version']),
                                         'detail': 'Automated scan finding', 'severity': random.choice(['low', 'medium', 'high', 'critical'])},
                            severity=random.choice(['low', 'medium', 'high', 'critical']),
                            created_at=random_date(14))
            db.session.add(sr)
            count += 1
    print(f"  + 生成 {count} 条扫描结果")
    db.session.commit()


def generate_scan_profiles():
    profiles = [
        {'name': '快速端口扫描', 'type': 'port_scan', 'config': {'ports': '1-1024', 'speed': 'fast'}, 'is_default': True},
        {'name': '全面漏洞扫描', 'type': 'vulnerability_scan', 'config': {'depth': 'full', 'plugins': 'all'}, 'is_default': False},
        {'name': 'PCI合规扫描', 'type': 'config_audit', 'config': {'standard': 'PCI-DSS v4.0'}, 'is_default': False},
    ]
    count = 0
    for p in profiles:
        sp = ScanProfile(id=f'sp-{p["type"]}', name=p['name'], type=p['type'],
                         description=f'{p["name"]} 配置', config=p['config'], is_default=p['is_default'])
        db.session.add(sp)
        count += 1
    print(f"  + 生成 {count} 条扫描配置")
    db.session.commit()


def generate_scan_agents():
    agents = [
        {'name': '扫描节点-北京', 'ip': '10.0.0.10', 'status': 'online', 'location': '北京数据中心'},
        {'name': '扫描节点-上海', 'ip': '10.0.0.11', 'status': 'online', 'location': '上海数据中心'},
        {'name': '扫描节点-广州', 'ip': '10.0.0.12', 'status': 'offline', 'location': '广州数据中心'},
    ]
    count = 0
    for a in agents:
        sa = ScanAgent(id=f'ag-{a["name"].split("-")[-1]}', name=a['name'], ip=a['ip'],
                       status=a['status'], location=a['location'],
                       cpu_usage=random.uniform(5, 95), memory_usage=random.uniform(10, 80),
                       capabilities=[{'type': 'port_scan'}, {'type': 'vuln_scan'}],
                       last_heartbeat=random_date(1))
        db.session.add(sa)
        count += 1
    print(f"  + 生成 {count} 条扫描节点")
    db.session.commit()


def generate_rules():
    rules_data = [
        {'name': '暴力破解检测', 'type': 'single', 'severity': 'high', 'content': 'fail_count > 5 IN 5m', 'tags': ['登录安全', '暴力破解']},
        {'name': '横向移动检测', 'type': 'correlation', 'severity': 'critical', 'content': 'lateral_movement DETECTED', 'tags': ['横向移动', 'APT']},
        {'name': '数据外泄检测', 'type': 'sequence', 'severity': 'critical', 'content': 'large_data_transfer -> external_ip', 'tags': ['数据安全', '外泄']},
        {'name': '异常登录时间', 'type': 'single', 'severity': 'medium', 'content': 'login NOT BETWEEN 08:00 AND 18:00', 'tags': ['登录安全', '异常行为']},
        {'name': '高危命令执行', 'type': 'single', 'severity': 'high', 'content': 'command IN [rm -rf, mkfs, nc -e]', 'tags': ['命令安全', '应急']},
        {'name': '后门通信检测', 'type': 'single', 'severity': 'critical', 'content': 'suspicious_domain AND uncommon_port', 'tags': ['后门', 'C2']},
        {'name': 'DNS隧道检测', 'type': 'correlation', 'severity': 'high', 'content': 'dns_query_count > 1000 AND unusual_domains', 'tags': ['DNS', '隧道']},
        {'name': '挖矿行为检测', 'type': 'single', 'severity': 'critical', 'content': 'process IN [xmrig, miner, cryptonight]', 'tags': ['挖矿', '加密货币']},
    ]
    count = 0
    for data in rules_data:
        rule = Rule(name=data['name'], type=data['type'], content=data['content'],
                    status=random.choice(['active', 'active', 'active', 'inactive']),
                    severity=data['severity'], tags=data['tags'],
                    created_at=random_date(90), updated_at=random_date(7))
        db.session.add(rule)
        count += 1
    print(f"  + 生成 {count} 条检测规则")
    db.session.commit()
    return Rule.query.all()


def generate_detection_rules():
    rules_data = [
        {'name': 'WebShell检测', 'type': 'yara', 'severity': 'critical', 'language': 'yara',
         'content': 'rule webshell { strings: $a = "eval(" condition: $a }'},
        {'name': 'SMB漏洞扫描', 'type': 'sigma', 'severity': 'critical', 'language': 'sigma',
         'content': 'title: SMB Vulnerability Detection'},
        {'name': 'Mimikatz检测', 'type': 'yara', 'severity': 'critical', 'language': 'yara',
         'content': 'rule mimikatz { strings: $a = "mimikatz" condition: $a }'},
        {'name': '异常RDP连接', 'type': 'sigma', 'severity': 'high', 'language': 'sigma',
         'content': 'title: Abnormal RDP Connection Detection'},
    ]
    count = 0
    for data in rules_data:
        dr = DetectionRuleExtended(
            id=f'dr-{data["name"].lower().replace(" ","-")}',
            name=data['name'], type=data['type'], severity=data['severity'],
            rule_content=data['content'], rule_language=data['language'],
            status='active', data_source_ids=json.dumps([1, 2]),
            tags=json.dumps([data['type'], data['severity']]),
            author='安全团队', version='1.0', hit_count=random.randint(0, 100),
            created_at=random_date(90))
        db.session.add(dr)
        count += 1
    print(f"  + 生成 {count} 条扩展检测规则")
    db.session.commit()


def generate_playbooks():
    playbooks_data = [
        {'name': '自动封堵恶意IP', 'description': '检测到恶意IP时自动在防火墙上下发包堵规则',
         'nodes': [{'id': '1', 'type': 'trigger', 'label': '恶意IP检测', 'config': {'event_type': 'malicious_ip'}},
                   {'id': '2', 'type': 'condition', 'label': '威胁等级验证', 'config': {'threat_level': '> 70'}},
                   {'id': '3', 'type': 'action', 'label': '封堵IP', 'config': {'action': 'block_ip', 'target': 'firewall'}},
                   {'id': '4', 'type': 'action', 'label': '通知安全团队', 'config': {'channel': 'slack,email'}},
                   {'id': '5', 'type': 'end', 'label': '结束'}],
         'edges': [{'from': '1', 'to': '2'}, {'from': '2', 'to': '3'}, {'from': '2', 'to': '5', 'label': '低风险'}, {'from': '3', 'to': '4'}, {'from': '4', 'to': '5'}]},
        {'name': '主机入侵响应', 'description': '主机被入侵时自动隔离和取证',
         'nodes': [{'id': '1', 'type': 'trigger', 'label': '入侵告警', 'config': {'event_type': 'host_compromised'}},
                   {'id': '2', 'type': 'action', 'label': '隔离主机', 'config': {'action': 'isolate_host'}},
                   {'id': '3', 'type': 'action', 'label': '收集证据', 'config': {'action': 'collect_evidence'}},
                   {'id': '4', 'type': 'action', 'label': '创建工单', 'config': {'action': 'create_ticket'}},
                   {'id': '5', 'type': 'end', 'label': '结束'}],
         'edges': [{'from': '1', 'to': '2'}, {'from': '2', 'to': '3'}, {'from': '3', 'to': '4'}, {'from': '4', 'to': '5'}]},
        {'name': '钓鱼邮件处置', 'description': '自动隔离和分析钓鱼邮件',
         'nodes': [{'id': '1', 'type': 'trigger', 'label': '钓鱼邮件', 'config': {'event_type': 'phishing'}},
                   {'id': '2', 'type': 'action', 'label': '隔离邮件', 'config': {'action': 'quarantine'}},
                   {'id': '3', 'type': 'action', 'label': '提取IoC', 'config': {'action': 'extract_ioc'}},
                   {'id': '4', 'type': 'action', 'label': '通知收件人', 'config': {'action': 'notify_recipients'}},
                   {'id': '5', 'type': 'end', 'label': '结束'}],
         'edges': [{'from': '1', 'to': '2'}, {'from': '2', 'to': '3'}, {'from': '3', 'to': '4'}, {'from': '4', 'to': '5'}]},
    ]
    count = 0
    for data in playbooks_data:
        pb = Playbook(name=data['name'], description=data['description'],
                      nodes=data['nodes'], edges=data['edges'],
                      status=random.choice(['active', 'active', 'draft']),
                      version='1.0', created_at=random_date(60), updated_at=random_date(7))
        db.session.add(pb)
        count += 1
    print(f"  + 生成 {count} 条剧本")
    db.session.commit()
    return Playbook.query.all()


def generate_playbook_executions(playbooks):
    triggers = ['manual', 'alert', 'event', 'schedule']
    statuses = ['running', 'completed', 'failed']
    count = 0
    for pb in playbooks:
        for _ in range(random.randint(2, 5)):
            st = random.choice(statuses)
            started = random_date(14)
            duration = random.randint(10, 300) if st == 'completed' else None
            completed = started + timedelta(seconds=duration) if duration else None
            pe = PlaybookExecution(
                id=f'exec-{pb.id}-{random.randint(1000,9999)}',
                playbook_id=pb.id, trigger_type=random.choice(triggers),
                trigger_data={'source': 'analyst01'}, status=st,
                started_at=started, completed_at=completed, duration=duration,
                executor='system',
                result_summary={'actions_executed': random.randint(1, 5), 'success': st == 'completed'},
                error_message=None if st != 'failed' else 'Step 3 failed: timeout')
            db.session.add(pe)
            count += 1
    print(f"  + 生成 {count} 条剧本执行记录")
    db.session.commit()


def generate_alert_logs():
    count = 0
    for i in range(40):
        al = AlertLog(
            source_id=random.randint(1, 5), product_id=random.randint(1, 5),
            product_code=random.choice(['FORTIGATE', 'SNORT', 'CS', 'MODSEC', 'WAF']),
            alert_name=random.choice(['SQL注入', 'XSS攻击', '命令执行', '文件包含', '越权访问']),
            alert_type=random.choice(['exploit', 'malware', 'scan', 'dos', 'policy']),
            severity=random.randint(1, 5), status=random.choice(['new', 'verified', 'false_positive']),
            src_ip=random_ip(), dst_ip=random_ip(), src_port=random.randint(1024, 65535),
            dst_port=random.choice([80, 443, 22, 3306, 3389]), protocol=random.choice(['TCP', 'UDP']),
            hostname=f'host-{random.randint(1,50):02d}',
            raw_log='{"event":"test","src":"'+random_ip()+'"}',
            details={'attack_type': 'injection', 'cve': 'CVE-2024-XXXX'},
            recommendation='升级到最新版本', rule_id=random.randint(1, 10),
            attack_chain=random.choice(['initial_access', 'execution', 'persistence']),
            ioc_type=random.choice(['ip', 'domain', 'hash']),
            ioc_value=random.choice(['malware.example.com', random_ip(), 'a"*3ff23e"]']),
            event_count=random.randint(1, 100), time=random_date(14))
        db.session.add(al)
        count += 1
    print(f"  + 生成 {count} 条告警日志")
    db.session.commit()


def generate_hunting_queries():
    queries = [
        {'name': '异常登录模式分析', 'query': 'index=auth | stats count by user,src_ip | where count > 10',
         'description': '检测异常登录模式'},
        {'name': '横向移动特征', 'query': 'index=network | search psexec OR wmi OR smb',
         'description': '查找横向移动特征'},
        {'name': '数据外泄检测', 'query': 'index=network dst_port=443 | stats sum(bytes) by src_ip | where total_bytes > 100MB',
         'description': '检测大量数据外传'},
        {'name': '恶意域名访问', 'query': 'index=dns query=*.tk OR *.ml OR *.ga',
         'description': '检测可疑域名访问'},
        {'name': '特权账户活动', 'query': 'index=auth user=root | stats count by src_ip,command',
         'description': '监控root账户活动'},
    ]
    count = 0
    for data in queries:
        hq = HuntingQuery(name=data['name'], query=data['query'], description=data['description'])
        db.session.add(hq)
        count += 1
    print(f"  + 生成 {count} 条威胁狩猎查询")
    db.session.commit()
    return db.session.query(HuntingQuery).all()


def generate_hunting_results(queries):
    count = 0
    for q in queries:
        for _ in range(random.randint(2, 4)):
            hr = HuntingResult(
                id=f'hr-{q.id}-{random.randint(100,999)}', query_id=q.id,
                title=f'{q.name} - 发现结果', description='发现可疑活动',
                severity=random.choice(['low', 'medium', 'high', 'critical']),
                indicators=[{'type': 'ip', 'value': random_ip()},
                            {'type': 'domain', 'value': f'suspicious{random.randint(1,999)}.xyz'}],
                affected_assets=[{'name': random.choice(['web-01', 'db-01', 'app-01']), 'ip': random_ip()}],
                raw_data={'matches': random.randint(1, 50)},
                status=random.choice(['new', 'investigating', 'resolved']),
                created_at=random_date(14))
            db.session.add(hr)
            count += 1
    print(f"  + 生成 {count} 条狩猎结果")
    db.session.commit()


def generate_notifications():
    msgs = [
        ('新的安全告警', '检测到新的安全告警，请及时处理', 'warning'),
        ('扫描任务完成', '内网端口扫描已完成，发现5个高危漏洞', 'info'),
        ('剧本执行成功', '自动封堵恶意IP剧本执行成功', 'success'),
        ('系统维护通知', '系统将于今晚23:00进行维护', 'info'),
        ('权限变更提醒', '用户权限已变更', 'warning'),
        ('告警阈值更新', '暴力破解检测阈值已调整', 'info'),
        ('新设备上线', '新的资产已自动发现并加入清单', 'success'),
        ('许可证到期', '系统许可证将在30天后到期', 'error'),
    ]
    users = User.query.all()
    if not users:
        return
    count = 0
    for i in range(60):
        title, msg, typ = random.choice(msgs)
        notif = Notification(user_id=random.choice(users).id, title=title, message=msg,
                             type=typ, read=random.random() > 0.3, created_at=random_date(14))
        db.session.add(notif)
        count += 1
    print(f"  + 生成 {count} 条通知")
    db.session.commit()


def generate_audit_logs():
    action_tpl = [
        ('login', '认证'), ('logout', '认证'), ('create', '事件'), ('update', '事件'),
        ('acknowledge', '告警'), ('resolve', '告警'), ('create', '资产'), ('update', '资产'),
        ('start', '扫描'), ('stop', '扫描'), ('create', '规则'), ('update', '规则'),
        ('toggle', '规则'), ('create', '剧本'), ('execute', '剧本'), ('create', '用户'),
        ('update', '配置'), ('export', '报表'), ('delete', '数据源'), ('create', '管道'),
    ]
    ips = ['192.168.1.{}'.format(i) for i in range(10, 50)]
    users = User.query.all()
    if not users:
        return
    count = 0
    for i in range(200):
        action, module = random.choice(action_tpl)
        user = random.choice(users)
        log = AuditLog(user_id=user.id, username=user.username, action=action,
                       module=module, target=f'{module}-{random.randint(1000, 9999)}',
                       details={'info': 'auto generated'}, ip=random.choice(ips),
                       timestamp=random_date(30))
        db.session.add(log)
        count += 1
    print(f"  + 生成 {count} 条审计日志")
    db.session.commit()


def generate_ai_models():
    models = [
        {'name': 'DeepSeek Chat', 'type': 'llm', 'provider': 'deepseek', 'config': {'model': 'deepseek-chat', 'temperature': 0.7}},
        {'name': '安全分析模型', 'type': 'classifier', 'provider': 'custom', 'config': {'version': '2.1', 'accuracy': 0.95}},
        {'name': '恶意软件分类器', 'type': 'classifier', 'provider': 'custom', 'config': {'version': '1.5', 'accuracy': 0.92}},
        {'name': '异常检测模型', 'type': 'anomaly', 'provider': 'custom', 'config': {'algorithm': 'isolation_forest'}},
    ]
    count = 0
    for data in models:
        model = AIModel(name=data['name'], type=data['type'], provider=data['provider'],
                        status='active', config=data['config'])
        db.session.add(model)
        count += 1
    print(f"  + 生成 {count} 条AI模型")
    db.session.commit()
    return AIModel.query.all()


def generate_ai_agents(models):
    agents = [
        {'id': 'agent-sec-analysis', 'name': '安全分析助手', 'agent_type': 'chat', 'capabilities': ['威胁分析', '事件研判']},
        {'id': 'agent-log-analysis', 'name': '日志分析助手', 'agent_type': 'analysis', 'capabilities': ['日志解析', '模式识别']},
    ]
    count = 0
    for data in agents:
        agent = AIAgent(id=data['id'], name=data['name'], agent_type=data['agent_type'],
                        description=f'{data["name"]} - AI辅助安全运营',
                        status='active', capabilities=data['capabilities'],
                        model_id=random.choice(models).id if models else None,
                        system_prompt='你是一个专业的安全运营助手，请帮助分析安全事件。')
        db.session.add(agent)
        count += 1
    print(f"  + 生成 {count} 条AI助手")
    db.session.commit()


def generate_ai_insights():
    severities = ['low', 'medium', 'high', 'critical']
    categories = ['威胁情报', '异常检测', '事件关联', '行为分析']
    count = 0
    for i in range(15):
        insight = AIInsight(
            id=f'insight-{random.randint(10000,99999)}',
            title=random.choice(['异常流量模式分析', '用户行为画像更新', '威胁情报关联分析',
                                 '蜜罐攻击数据分析', '横向移动路径识别']),
            description='AI自动生成的深度安全分析见解',
            severity=random.choice(severities), category=random.choice(categories),
            confidence=random.uniform(0.6, 0.99),
            recommendations='建议进一步调查此异常活动',
            status=random.choice(['new', 'acknowledged', 'resolved']))
        db.session.add(insight)
        count += 1
    print(f"  + 生成 {count} 条AI安全见解")
    db.session.commit()


def generate_ai_sessions(models):
    count = 0
    for i in range(5):
        session = AIChatSession(
            id=f'session-{random.randint(10000,99999)}',
            title=random.choice(['威胁分析会话', '日志排查会话', '事件研判', '安全咨询', '报表生成']),
            user_id=1, model_id=random.choice(models).id if models else None,
            context={'type': 'analysis'}, status='active')
        db.session.add(session)
        count += 1
    print(f"  + 生成 {count} 条AI会话")
    db.session.commit()


def generate_ai_tasks(models):
    count = 0
    for i in range(10):
        task = AITask(name=random.choice(['威胁分类', '日志聚类', '异常检测', '事件关联', 'IOC提取']),
                      model_id=random.choice(models).id if models else None,
                      type=random.choice(['classification', 'clustering', 'detection']),
                      input_data={'source': 'alerts', 'count': random.randint(10, 1000)},
                      output_data={'result': 'completed', 'findings': random.randint(0, 20)},
                      status=random.choice(['pending', 'running', 'completed', 'failed']),
                      created_at=random_date(14))
        db.session.add(task)
        count += 1
    print(f"  + 生成 {count} 条AI任务")
    db.session.commit()


def generate_storage_tables():
    tables = [
        {'name': 'fw_logs_storage', 'display_name': '防火墙日志存储', 'data_source': '核心防火墙',
         'log_type': 'fw_logs', 'retention_days': 90, 'row_count': 1250000, 'size': '2.3 GB'},
        {'name': 'ids_alert_storage', 'display_name': 'IDS告警存储', 'data_source': '边界IDS',
         'log_type': 'ids_logs', 'retention_days': 90, 'row_count': 890000, 'size': '1.7 GB'},
        {'name': 'edr_event_storage', 'display_name': 'EDR事件存储', 'data_source': '终端EDR集群',
         'log_type': 'edr_logs', 'retention_days': 90, 'row_count': 2100000, 'size': '4.1 GB'},
    ]
    count = 0
    for data in tables:
        st = StorageTable(name=data['name'], display_name=data['display_name'],
                          data_source=data['data_source'], log_type=data['log_type'],
                          retention_days=data['retention_days'], partition_interval='1天',
                          indexes=[{'field': 'timestamp', 'type': 'btree'}],
                          columns=[{'name': 'timestamp', 'type': 'timestamptz'},
                                   {'name': 'src_ip', 'type': 'inet'},
                                   {'name': 'dst_ip', 'type': 'inet'},
                                   {'name': 'event_type', 'type': 'text'}],
                          row_count=data['row_count'], size=data['size'],
                          compression=True, auto_created=False)
        db.session.add(st)
        count += 1
    print(f"  + 生成 {count} 条存储表")
    db.session.commit()


def generate_system_config():
    configs = [
        {'key': 'alert_retention_days', 'value': '90', 'category': '告警'},
        {'key': 'log_retention_days', 'value': '180', 'category': '日志'},
        {'key': 'scan_interval_hours', 'value': '24', 'category': '扫描'},
        {'key': 'auto_resolve_hours', 'value': '72', 'category': '告警'},
        {'key': 'max_login_attempts', 'value': '5', 'category': '安全'},
        {'key': 'session_timeout_minutes', 'value': '60', 'category': '安全'},
        {'key': 'smtp_server', 'value': 'smtp.company.com', 'category': '通知'},
        {'key': 'slack_webhook', 'value': 'https://hooks.slack.com/services/xxx', 'category': '通知'},
    ]
    count = 0
    for data in configs:
        if not SystemConfig.query.filter_by(key=data['key']).first():
            sc = SystemConfig(key=data['key'], value=data['value'], category=data['category'])
            db.session.add(sc)
            count += 1
    print(f"  + 生成 {count} 条系统配置")
    db.session.commit()


def generate_log_classifiers():
    classifiers = [
        {'id': 'cls-fw', 'name': '防火墙日志分类器', 'match_mode': 'regex', 'priority': 10,
         'description': '根据syslog特征识别防火墙日志'},
        {'id': 'cls-edr', 'name': 'EDR日志分类器', 'match_mode': 'json', 'priority': 8,
         'description': '根据JSON字段识别EDR日志'},
    ]
    count = 0
    for data in classifiers:
        lc = LogClassifier(id=data['id'], name=data['name'], description=data['description'],
                           match_mode=data['match_mode'], priority=data['priority'],
                           status='active')
        db.session.add(lc)
        count += 1
    print(f"  + 生成 {count} 条日志分类器")
    db.session.commit()


def generate_data_tables():
    tables = [
        {'id': 'dt-fw-001', 'name': '防火墙日志分析表', 'code': 'DT_FW_001',
         'log_type_id': 'fw_logs', 'retention_days': 90, 'partition_by': 'day'},
        {'id': 'dt-ids-001', 'name': '入侵检测分析表', 'code': 'DT_IDS_001',
         'log_type_id': 'ids_logs', 'retention_days': 90, 'partition_by': 'day'},
    ]
    count = 0
    for data in tables:
        dt = DataTable(id=data['id'], name=data['name'], code=data['code'],
                       log_type_id=data['log_type_id'], retention_days=data['retention_days'],
                       partition_by=data['partition_by'], status='active',
                       columns=[{'name': 'timestamp', 'type': 'timestamptz'},
                                {'name': 'src_ip', 'type': 'text'},
                                {'name': 'event_data', 'type': 'jsonb'}],
                       record_count=random.randint(10000, 999999),
                       data_size_mb=round(random.uniform(100, 5000), 2))
        db.session.add(dt)
        count += 1
    print(f"  + 生成 {count} 条数据表")
    db.session.commit()


def generate_vulnerabilities():
    vulns = [
        ('CVE-2024-21626', 'runc 容器逃逸漏洞', 8.6, 'critical', 'containerd', '升级 containerd 到最新版'),
        ('CVE-2024-3094', 'XZ Utils 后门漏洞', 10.0, 'critical', 'liblzma', '更新 XZ Utils 到 5.6.0+'),
        ('CVE-2023-44487', 'HTTP/2 快速重置攻击', 7.5, 'high', 'nginx', '启用 HTTP/2 连接限制'),
        ('CVE-2024-27198', 'TeamCity 认证绕过', 9.8, 'critical', 'teamcity', '升级到 TeamCity 2023.11.4'),
        ('CVE-2024-0204', 'GoAnywhere 认证绕过', 9.8, 'critical', 'goanywhere', '升级到 7.1.2'),
    ]
    count = 0
    for cve, name, cvss, sev, product, solution in vulns:
        if not Vulnerability.query.get(f'VULN-{cve}'):
            v = Vulnerability(id=f'VULN-{cve}', name=name, cve_id=cve, cvss_score=cvss,
                              severity=sev, description=f'{name} 影响 {product} 组件',
                              solution=solution, category=random.choice(['remote', 'rce', 'dos']),
                              affected_product=product)
            db.session.add(v)
            count += 1
    print(f"  + 生成 {count} 条漏洞")
    db.session.commit()


def generate_data_formats():
    formats = [
        {'id': 'fmt-syslog', 'name': 'Syslog标准格式', 'type': 'syslog',
         'sample': '<14>1 2024-01-15T10:30:00Z host01 app - - [msg] test log'},
        {'id': 'fmt-json', 'name': 'JSON标准格式', 'type': 'json',
         'sample': '{"timestamp":"2024-01-15T10:30:00Z","event":"test"}'},
        {'id': 'fmt-csv', 'name': 'CSV标准格式', 'type': 'csv',
         'sample': 'timestamp,src_ip,dst_ip,action\\n2024-01-15,192.168.1.1,10.0.0.1,allow'},
    ]
    count = 0
    for data in formats:
        df = DataFormat(id=data['id'], name=data['name'], type=data['type'],
                        description=f'{data["name"]} 用于日志解析',
                        sample=data['sample'], status='active',
                        fields=[{'name': 'timestamp', 'type': 'datetime', 'required': True},
                                {'name': 'src_ip', 'type': 'string', 'required': True}])
        db.session.add(df)
        count += 1
    print(f"  + 生成 {count} 条数据格式")
    db.session.commit()


def generate_ai_tasks_tbl():
    """Additional AI tasks"""
    pass  # already in generate_ai_tasks()


def main():
    print("=" * 55)
    print("  USOP 全表测试数据生成器")
    print("=" * 55)

    app = create_app()

    with app.app_context():
        print("\n[1/20] 用户...")
        users = generate_users()

        print("\n[2/20] 角色...")
        generate_roles()

        print("\n[3/20] 安全产品...")
        products = generate_products()

        print("\n[4/20] 日志类型...")
        log_types = generate_log_types()

        print("\n[5/20] 数据源...")
        data_sources = generate_data_sources(products, log_types)

        print("\n[6/20] 格式模板...")
        generate_format_templates(log_types)

        print("\n[7/20] 数据格式...")
        generate_data_formats()

        print("\n[8/20] 解析管道...")
        pipelines = generate_pipelines(products, log_types)
        if pipelines:
            generate_pipeline_configs(pipelines)
            generate_pipeline_mappings(pipelines)

        print("\n[9/20] 安全事件...")
        events = generate_events(users)
        if events:
            generate_event_actions(events, users)

        print("\n[10/20] 告警(PostgreSQL)...")
        generate_alerts_pg()

        print("\n[11/20] 告警(TimescaleDB)...")
        generate_alerts_tsdb()

        print("\n[12/20] 资产...")
        assets = generate_assets()
        if assets:
            generate_asset_ports(assets)

        print("\n[13/20] 漏洞...")
        generate_vulnerabilities()

        print("\n[14/20] 扫描任务...")
        tasks = generate_scan_tasks()
        if tasks:
            generate_scan_results(tasks)
        generate_scan_profiles()
        generate_scan_agents()

        print("\n[15/20] 检测规则...")
        generate_rules()
        generate_detection_rules()

        print("\n[16/20] 剧本...")
        playbooks = generate_playbooks()
        if playbooks:
            generate_playbook_executions(playbooks)

        print("\n[17/20] 告警日志...")
        generate_alert_logs()

        print("\n[18/20] 威胁狩猎...")
        queries = generate_hunting_queries()
        if queries:
            generate_hunting_results(queries)

        print("\n[19/20] 通知 & 审计日志...")
        generate_notifications()
        generate_audit_logs()

        print("\n[20/20] AI & 系统配置...")
        models = generate_ai_models()
        if models:
            generate_ai_agents(models)
            generate_ai_insights()
            generate_ai_sessions(models)
            generate_ai_tasks(models)
        generate_storage_tables()
        generate_system_config()
        generate_log_classifiers()
        generate_data_tables()

    print("\n" + "=" * 55)
    print("  ✅ 测试数据生成完成!")
    print("=" * 55)
    print("\n默认账号 (密码均为 password123):")
    print("  - admin       (管理员)")
    print("  - analyst01   (安全分析师)")
    print("  - operator01  (运维人员)")
    print("  - auditor01   (审计员)")


if __name__ == '__main__':
    main()
