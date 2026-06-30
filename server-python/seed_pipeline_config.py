"""
种子脚本：为 5 个安全产品创建完整的日志配置链
LogType → FormatTemplate → Pipeline → DataSource
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

import uuid
from app import create_app
from app.database import db
from app.models import LogType, FormatTemplate, Pipeline, DataSource

app = create_app()

def make_id(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:8]}"

# ============================================================
# 1. LogType 定义
# ============================================================
log_types = [
    {
        'id': 'lt_suricata',
        'name': 'Suricata 网络告警',
        'code': 'suricata_alert',
        'description': 'Suricata NIDS 产生的网络入侵检测告警 (eve.json)',
        'category': 'security',
        'default_severity': 3,
        'retention_days': 365,
        'patterns': ['{"event_type":"alert"}'],
        'tags': ['nids', 'network', 'suricata'],
    },
    {
        'id': 'lt_wazuh',
        'name': 'Wazuh 主机告警',
        'code': 'wazuh_alert',
        'description': 'Wazuh HIDS/SIEM 产生的主机安全告警 (alerts.json)',
        'category': 'security',
        'default_severity': 3,
        'retention_days': 365,
        'patterns': ['"rule":{"level"'],
        'tags': ['hids', 'host', 'wazuh', 'siem'],
    },
    {
        'id': 'lt_imperva',
        'name': 'Imperva WAF 告警',
        'code': 'imperva_alert',
        'description': 'Imperva SecureSphere WAF/防火墙告警 (LEEF)',
        'category': 'security',
        'default_severity': 3,
        'retention_days': 365,
        'patterns': ['LEEF:1.0|Imperva'],
        'tags': ['waf', 'firewall', 'imperva'],
    },
    {
        'id': 'lt_crowdstrike',
        'name': 'CrowdStrike 终端告警',
        'code': 'crowdstrike_alert',
        'description': 'CrowdStrike Falcon EDR 终端检测告警',
        'category': 'security',
        'default_severity': 2,
        'retention_days': 365,
        'patterns': ['"eventType":"DetectionSummaryEvent"'],
        'tags': ['edr', 'endpoint', 'crowdstrike'],
    },
    {
        'id': 'lt_modsecurity',
        'name': 'ModSecurity WAF 告警',
        'code': 'modsecurity_alert',
        'description': 'ModSecurity 开源 WAF 告警 (Apache error log)',
        'category': 'security',
        'default_severity': 3,
        'retention_days': 365,
        'patterns': ['ModSecurity:'],
        'tags': ['waf', 'apache', 'modsecurity'],
    },
]

# ============================================================
# 2. FormatTemplate 定义
# ============================================================
format_templates = [
    {
        'id': 'fmt_suricata',
        'name': 'Suricata eve.json 解析模板',
        'description': '解析 Suricata alert 事件 (JSON)',
        'log_type_id': 'lt_suricata',
        'type': 'json',
        'priority': 100,
        'fields': [
            {'name': 'src_ip', 'type': 'ip', 'source': 'src_ip'},
            {'name': 'src_port', 'type': 'integer', 'source': 'src_port'},
            {'name': 'dst_ip', 'type': 'ip', 'source': 'dest_ip'},
            {'name': 'dst_port', 'type': 'integer', 'source': 'dest_port'},
            {'name': 'protocol', 'type': 'keyword', 'source': 'proto'},
            {'name': 'hostname', 'type': 'keyword', 'source': 'http.hostname'},
            {'name': 'title', 'type': 'text', 'source': 'alert.signature'},
            {'name': 'category', 'type': 'keyword', 'source': 'alert.category'},
            {'name': 'severity', 'type': 'integer', 'source': 'alert.severity'},
            {'name': 'action', 'type': 'keyword', 'source': 'alert.action'},
            {'name': 'signature_id', 'type': 'integer', 'source': 'alert.signature_id'},
        ],
        'is_system': True,
        'is_custom': False,
    },
    {
        'id': 'fmt_wazuh',
        'name': 'Wazuh alerts.json 解析模板',
        'description': '解析 Wazuh 告警 (JSON)',
        'log_type_id': 'lt_wazuh',
        'type': 'json',
        'priority': 100,
        'fields': [
            {'name': 'src_ip', 'type': 'ip', 'source': 'data.srcip'},
            {'name': 'src_port', 'type': 'integer', 'source': 'data.srcport'},
            {'name': 'title', 'type': 'text', 'source': 'rule.description'},
            {'name': 'severity', 'type': 'integer', 'source': 'rule.level'},
            {'name': 'rule_id', 'type': 'keyword', 'source': 'rule.id'},
            {'name': 'groups', 'type': 'keyword', 'source': 'rule.groups'},
            {'name': 'mitre_id', 'type': 'keyword', 'source': 'rule.mitre.id'},
            {'name': 'mitre_tactic', 'type': 'keyword', 'source': 'rule.mitre.tactic'},
            {'name': 'agent_id', 'type': 'keyword', 'source': 'agent.id'},
            {'name': 'agent_name', 'type': 'keyword', 'source': 'agent.name'},
            {'name': 'hostname', 'type': 'keyword', 'source': 'agent.name'},
            {'name': 'full_log', 'type': 'text', 'source': 'full_log'},
        ],
        'is_system': True,
        'is_custom': False,
    },
    {
        'id': 'fmt_imperva',
        'name': 'Imperva LEEF 解析模板',
        'description': '解析 Imperva SecureSphere LEEF 格式',
        'log_type_id': 'lt_imperva',
        'type': 'leef',
        'priority': 100,
        'fields': [
            {'name': 'src_ip', 'type': 'ip', 'source': 'src'},
            {'name': 'dst_ip', 'type': 'ip', 'source': 'dst'},
            {'name': 'dst_port', 'type': 'integer', 'source': 'dp'},
            {'name': 'title', 'type': 'text', 'source': 'Alert Description'},
            {'name': 'severity', 'type': 'keyword', 'source': 'Severity'},
            {'name': 'alert_type', 'type': 'keyword', 'source': 'Alert type'},
            {'name': 'event_id', 'type': 'keyword', 'source': 'Event ID'},
            {'name': 'alert_id', 'type': 'keyword', 'source': 'Alert ID'},
            {'name': 'user_name', 'type': 'keyword', 'source': 'usrName'},
            {'name': 'app_name', 'type': 'keyword', 'source': 'Application name'},
        ],
        'is_system': True,
        'is_custom': False,
    },
    {
        'id': 'fmt_crowdstrike',
        'name': 'CrowdStrike Falcon 解析模板',
        'description': '解析 CrowdStrike DetectionSummaryEvent (JSON)',
        'log_type_id': 'lt_crowdstrike',
        'type': 'json',
        'priority': 100,
        'fields': [
            {'name': 'title', 'type': 'text', 'source': 'event.DetectName'},
            {'name': 'description', 'type': 'text', 'source': 'event.DetectDescription'},
            {'name': 'filename', 'type': 'keyword', 'source': 'event.FileName'},
            {'name': 'command_line', 'type': 'text', 'source': 'event.CommandLine'},
            {'name': 'parent_filename', 'type': 'keyword', 'source': 'event.ParentImageFileName'},
            {'name': 'hostname', 'type': 'keyword', 'source': 'event.ComputerName'},
            {'name': 'quarantine', 'type': 'boolean', 'source': 'event.PatternDispositionFlags.QuarantineFile'},
            {'name': 'kill_process', 'type': 'boolean', 'source': 'event.PatternDispositionFlags.KillProcess'},
            {'name': 'falcon_link', 'type': 'keyword', 'source': 'event.FalconHostLink'},
        ],
        'is_system': True,
        'is_custom': False,
    },
    {
        'id': 'fmt_modsecurity',
        'name': 'ModSecurity 日志解析模板',
        'description': '解析 ModSecurity Apache error log (正则)',
        'log_type_id': 'lt_modsecurity',
        'type': 'regex',
        'priority': 100,
        'regex_pattern': r'\[client\s+(?P<src_ip>[^\]]+)\].*?ModSecurity:.*?with code\s+(?P<status_code>\d+).*?\[id\s+"(?P<rule_id>[^"]+)"\]\s*\[msg\s+"(?P<msg>[^"]+)"\]\s*\[severity\s+"(?P<severity>[^"]+)"\]\s*\[uri\s+"(?P<uri>[^"]+)"\]',
        'fields': [
            {'name': 'src_ip', 'type': 'ip', 'source': 'src_ip'},
            {'name': 'status_code', 'type': 'integer', 'source': 'status_code'},
            {'name': 'rule_id', 'type': 'keyword', 'source': 'rule_id'},
            {'name': 'msg', 'type': 'text', 'source': 'msg'},
            {'name': 'severity', 'type': 'keyword', 'source': 'severity'},
            {'name': 'uri', 'type': 'keyword', 'source': 'uri'},
        ],
        'is_system': True,
        'is_custom': False,
    },
]

# ============================================================
# 3. Pipeline 定义
# ============================================================
pipelines = [
    {
        'id': 1,
        'name': 'Suricata NIDS 解析管道',
        'description': '从 Kafka suricata-alert 消费 → JSON 解析 → 写入 alerts 表',
        'log_type_id': 'lt_suricata',
        'format_id': 'fmt_suricata',
        'input_format': 'json',
        'input_config': {'topic': 'suricata-alert', 'source_field_map': {
            'src_ip': 'src_ip', 'src_port': 'src_port',
            'dst_ip': 'dest_ip', 'dst_port': 'dest_port',
            'protocol': 'proto', 'hostname': 'http.hostname',
            'title': 'alert.signature', 'category': 'alert.category',
        }},
        'output_target': 'alerts',
        'field_mapping': {
            'alert_code': 'suricata-{flow_id}',
            'source': 'NIDS', 'source_product': 'Suricata',
            'source_type': 'network', 'confidence': 90.0,
            'tags': ['suricata', 'nids'],
        },
        'status': 'active',
        'priority': 100,
    },
    {
        'id': 2,
        'name': 'Wazuh HIDS 解析管道',
        'description': '从 Kafka wazuh-alert 消费 → JSON 解析 → 写入 alerts 表',
        'log_type_id': 'lt_wazuh',
        'format_id': 'fmt_wazuh',
        'input_format': 'json',
        'input_config': {'topic': 'wazuh-alert', 'source_field_map': {
            'src_ip': 'data.srcip', 'src_port': 'data.srcport',
            'title': 'rule.description', 'severity': 'rule.level',
        }},
        'output_target': 'alerts',
        'field_mapping': {
            'source': 'HIDS', 'source_product': 'Wazuh',
            'source_type': 'host', 'confidence': 85.0,
            'tags': ['wazuh', 'hids'],
        },
        'status': 'active',
        'priority': 100,
    },
    {
        'id': 3,
        'name': 'Imperva WAF 解析管道',
        'description': '从 Kafka imperva-alert 消费 → LEEF 解析 → 写入 alerts 表',
        'log_type_id': 'lt_imperva',
        'format_id': 'fmt_imperva',
        'input_format': 'leef',
        'input_config': {'topic': 'imperva-alert', 'delimiter': '|'},
        'output_target': 'alerts',
        'field_mapping': {
            'source': 'WAF', 'source_product': 'Imperva SecureSphere',
            'source_type': 'network', 'confidence': 90.0,
            'tags': ['imperva', 'waf'],
        },
        'status': 'active',
        'priority': 100,
    },
    {
        'id': 4,
        'name': 'CrowdStrike EDR 解析管道',
        'description': '从 Kafka crowdstrike-alert 消费 → JSON 解析 → 写入 alerts 表',
        'log_type_id': 'lt_crowdstrike',
        'format_id': 'fmt_crowdstrike',
        'input_format': 'json',
        'input_config': {'topic': 'crowdstrike-alert', 'source_field_map': {
            'title': 'event.DetectName', 'description': 'event.DetectDescription',
            'hostname': 'event.ComputerName',
        }},
        'output_target': 'alerts',
        'field_mapping': {
            'source': 'EDR', 'source_product': 'CrowdStrike Falcon',
            'source_type': 'endpoint', 'confidence': 95.0,
            'tags': ['crowdstrike', 'edr'],
        },
        'status': 'active',
        'priority': 100,
    },
    {
        'id': 5,
        'name': 'ModSecurity WAF 解析管道',
        'description': '从 Kafka modsecurity-alert 消费 → 正则解析 → 写入 alerts 表',
        'log_type_id': 'lt_modsecurity',
        'format_id': 'fmt_modsecurity',
        'input_format': 'regex',
        'input_config': {'topic': 'modsecurity-alert'},
        'output_target': 'alerts',
        'field_mapping': {
            'source': 'WAF', 'source_product': 'ModSecurity',
            'source_type': 'network', 'confidence': 88.0,
            'tags': ['modsecurity', 'waf'],
        },
        'status': 'active',
        'priority': 100,
    },
]

with app.app_context():
    # --- LogTypes ---
    existing_lt = {lt.id for lt in LogType.query.all()}
    created_lt = 0
    for lt in log_types:
        if lt['id'] not in existing_lt:
            db.session.add(LogType(**lt))
            created_lt += 1
    if created_lt:
        db.session.commit()
        print(f"✅ 创建 {created_lt} 个日志类型")

    # --- FormatTemplates ---
    existing_ft = {ft.id for ft in FormatTemplate.query.all()}
    created_ft = 0
    for ft in format_templates:
        if ft['id'] not in existing_ft:
            db.session.add(FormatTemplate(**ft))
            created_ft += 1
    if created_ft:
        db.session.commit()
        print(f"✅ 创建 {created_ft} 个格式模板")

    # --- Pipelines ---
    existing_p = {p.id for p in Pipeline.query.all()}
    created_p = 0
    for p in pipelines:
        if p['id'] not in existing_p:
            db.session.add(Pipeline(**p))
            created_p += 1
    if created_p:
        db.session.commit()
        print(f"✅ 创建 {created_p} 个解析管道")

    # --- 关联 DataSource → Pipeline ---
    product_pipeline_map = {
        'suricata': 1, 'wazuh': 2, 'imperva': 3,
        'crowdstrike': 4, 'modsecurity': 5,
    }
    updated = 0
    for ds in DataSource.query.filter(DataSource.product_type.isnot(None)).all():
        pipeline_id = product_pipeline_map.get(ds.product_type)
        if pipeline_id and (not ds.pipeline_ids or pipeline_id not in ds.pipeline_ids):
            ds.pipeline_ids = [pipeline_id]
            updated += 1
    if updated:
        db.session.commit()
        print(f"✅ 关联 {updated} 个数据源到解析管道")

    # 汇总
    print("\n=== 配置汇总 ===")
    for p in Pipeline.query.filter(Pipeline.id <= 5).all():
        ft = FormatTemplate.query.get(p.format_id) if p.format_id else None
        lt = LogType.query.get(p.log_type_id) if p.log_type_id else None
        print(f"  Pipeline {p.id}: {p.name}")
        print(f"    日志类型: {lt.name if lt else 'N/A'} | 格式: {ft.type if ft else p.input_format} | 模板: {ft.name if ft else 'N/A'}")
        print(f"    Topic: {p.input_config.get('topic', 'N/A')} | 输出: {p.output_target}")
