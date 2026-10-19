"""
统一告警解析器 — 将各安全产品的日志解析为标准 alert 格式

支持产品:
  - Suricata (NIDS): eve.json → alert
  - Wazuh (HIDS/SIEM): alerts.json
  - Imperva SecureSphere (WAF): LEEF 格式
  - CrowdStrike Falcon (EDR): Streaming API JSON
  - ModSecurity (WAF): Apache error log

所有解析器输出统一格式的 dict，直接写入 PostgreSQL alerts 表。
"""

import json
import re
import logging
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

logger = logging.getLogger(__name__)

# 东八区
CST = timezone(timedelta(hours=8))


def _generate_alert_code(prefix: str, raw: dict) -> str:
    """生成唯一告警编号"""
    h = hashlib.md5(json.dumps(raw, sort_keys=True, default=str).encode()).hexdigest()[:8]
    return f"{prefix}-{h}"


def _parse_iso_time(ts: str) -> datetime:
    """解析 ISO 时间字符串，统一转为 UTC naive datetime"""
    if not ts:
        return datetime.utcnow()
    try:
        # 处理带时区的 ISO 格式
        ts = ts.strip()
        # 替换常见格式
        for fmt in (
            '%Y-%m-%dT%H:%M:%S.%f%z',
            '%Y-%m-%dT%H:%M:%S%z',
            '%Y-%m-%dT%H:%M:%S.%f',
            '%Y-%m-%dT%H:%M:%S',
            '%Y-%m-%d %H:%M:%S.%f',
            '%Y-%m-%d %H:%M:%S',
        ):
            try:
                dt = datetime.strptime(ts, fmt)
                if dt.tzinfo is None:
                    # 无时区的默认视为 CST
                    dt = dt.replace(tzinfo=CST)
                return dt.astimezone(timezone.utc).replace(tzinfo=None)
            except ValueError:
                continue
        # 最后尝试 fromisoformat
        dt = datetime.fromisoformat(ts)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=CST)
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    except Exception:
        return datetime.utcnow()


def _severity_from_level(level: Any, mapping: dict = None) -> str:
    """通用严重程度映射"""
    if mapping:
        return mapping.get(str(level), mapping.get(level, 'medium'))
    if isinstance(level, int):
        if level <= 1 or level >= 10:
            return 'critical'
        if level <= 3 or level >= 7:
            return 'high'
        if level <= 5:
            return 'medium'
        return 'low'
    if isinstance(level, str):
        l = level.lower()
        if l in ('critical', '严重'):
            return 'critical'
        if l in ('high', '高', '高危'):
            return 'high'
        if l in ('medium', '中'):
            return 'medium'
        if l in ('low', '信息', 'info'):
            return 'low'
    return 'medium'


# ============================================================
# 1. Suricata 解析器 (NIDS)
# ============================================================

def parse_suricata(raw: dict) -> Optional[dict]:
    """
    Suricata eve.json alert 事件
    Topic: suricata-alert
    """
    alert = raw.get('alert', {})
    http = raw.get('http', {})
    dns = raw.get('dns', {})
    tls = raw.get('tls', {})

    severity_num = alert.get('severity', 2)
    if severity_num <= 1:
        severity = 'critical'
    elif severity_num == 2:
        severity = 'high'
    elif severity_num == 3:
        severity = 'medium'
    else:
        severity = 'low'

    src_ip = raw.get('src_ip', '')
    dst_ip = raw.get('dest_ip', '')

    # 从 http 块提取额外信息
    parsed = {
        'signature_id': alert.get('signature_id'),
        'gid': alert.get('gid'),
        'rev': alert.get('rev'),
        'category': alert.get('category', ''),
        'action': alert.get('action', ''),
    }
    if http:
        parsed.update({
            'hostname': http.get('hostname', ''),
            'url': http.get('url', ''),
            'http_method': http.get('http_method', ''),
            'user_agent': http.get('http_user_agent', ''),
            'content_type': http.get('http_content_type', ''),
            'status': http.get('status'),
        })
    if dns:
        parsed['dns_query'] = dns.get('rrname', '')
    if tls:
        parsed['tls_subject'] = tls.get('subject', '')
        parsed['tls_issuer'] = tls.get('issuerdn', '')

    return {
        'alert_code': _generate_alert_code('SRT', raw),
        'title': alert.get('signature', 'Suricata 告警'),
        'description': f"[{alert.get('category', '')}] {alert.get('signature', '')}",
        'severity': severity,
        'status': 'new',
        'source': 'NIDS',
        'source_product': 'Suricata',
        'source_type': 'network',
        'category': alert.get('category', '网络入侵'),
        'confidence': 90.0,
        'src_ip': src_ip,
        'src_port': raw.get('src_port'),
        'dst_ip': dst_ip,
        'dst_port': raw.get('dest_port'),
        'protocol': raw.get('proto', ''),
        'hostname': http.get('hostname', '') or raw.get('host', ''),
        'first_seen': _parse_iso_time(raw.get('timestamp', '')),
        'last_seen': _parse_iso_time(raw.get('timestamp', '')),
        'raw_log': json.dumps(raw, ensure_ascii=False),
        'parsed_data': parsed,
        'extra_data': {
            'flow_id': raw.get('flow_id'),
            'pcap_cnt': raw.get('pcap_cnt'),
            'app_proto': raw.get('app_proto'),
        },
        'tags': [alert.get('category', ''), 'suricata', 'nids'],
    }


# ============================================================
# 2. Wazuh 解析器 (HIDS/SIEM)
# ============================================================

def parse_wazuh(raw: dict) -> Optional[dict]:
    """
    Wazuh alerts.json 告警
    Topic: wazuh-alert
    """
    rule = raw.get('rule', {})
    agent = raw.get('agent', {})
    data = raw.get('data', {})
    decoder = raw.get('decoder', {})

    level = rule.get('level', 5)
    severity = _severity_from_level(level, {
        '15': 'critical', '14': 'critical', '13': 'critical',
        '12': 'high', '11': 'high', '10': 'high',
        '8': 'medium', '7': 'medium',
        '5': 'low', '4': 'low', '3': 'low', '2': 'low', '1': 'low',
        '0': 'low',
    })

    mitre = rule.get('mitre', {})
    mitre_ids = mitre.get('id', [])
    mitre_tactics = mitre.get('tactic', [])
    mitre_techniques = mitre.get('technique', [])

    # srcip 是真实的远程来源（如暴力破解来源）；缺失时留空。
    # 受控主机(agent.ip)是告警目标而非来源，不得回退进 src_ip——否则面板上
    # 受害主机会被当成攻击源显示。
    src_ip = data.get('srcip', '') or ''
    dst_ip = data.get('dstip', '') or agent.get('ip', '')

    return {
        'alert_code': _generate_alert_code('WZH', raw),
        'title': rule.get('description', 'Wazuh 告警'),
        'description': raw.get('full_log', rule.get('description', '')),
        'severity': severity,
        'status': 'new',
        'source': 'HIDS',
        'source_product': 'Wazuh',
        'source_type': 'host',
        'category': ', '.join(rule.get('groups', [])[:3]) if rule.get('groups') else '主机安全',
        'confidence': 85.0,
        'src_ip': src_ip,
        'src_port': int(data.get('srcport', 0)) if data.get('srcport') else None,
        'dst_ip': dst_ip,
        'dst_port': int(data.get('dstport', 0)) if data.get('dstport') else None,
        'protocol': 'SSH' if 'sshd' in str(rule.get('groups', [])) else '',
        'hostname': agent.get('name', ''),
        'first_seen': _parse_iso_time(raw.get('timestamp', '')),
        'last_seen': _parse_iso_time(raw.get('timestamp', '')),
        'raw_log': raw.get('full_log', json.dumps(raw, ensure_ascii=False)),
        'parsed_data': {
            'rule_id': rule.get('id'),
            'rule_level': level,
            'groups': rule.get('groups', []),
            'mitre_id': mitre_ids,
            'mitre_tactic': mitre_tactics,
            'mitre_technique': mitre_techniques,
            'agent_id': agent.get('id'),
            'agent_name': agent.get('name'),
            'decoder_name': decoder.get('name', ''),
            'dstuser': data.get('dstuser', ''),
            'srcuser': data.get('srcuser', ''),
        },
        'extra_data': {
            'predecoder': raw.get('predecoder', {}),
            'decoder': decoder,
            'data': data,
        },
        'tags': mitre_tactics[:2] + ['wazuh', 'hids'],
    }


# ============================================================
# 3. Imperva SecureSphere 解析器 (WAF)
# ============================================================

def parse_imperva(raw: Any) -> Optional[dict]:
    """
    Imperva SecureSphere LEEF 格式
    Topic: imperva-alert
    LEEF:1.0|Imperva|SecureSphere|10.0.0|Firewall None|Alert ID=912905|...
    """
    if isinstance(raw, dict):
        # 如果已经是 JSON 格式，直接取字段
        text = raw.get('raw', '') or raw.get('message', '') or json.dumps(raw)
    else:
        text = str(raw)

    # 解析 LEEF 键值对
    fields = {}
    # LEEF 格式: 先用 | 分隔前缀，最后部分是 KVP
    parts = text.split('|')
    if len(parts) >= 6:
        # 前5个是 LEEF 头，后面是 KVP
        kvp_str = '|'.join(parts[5:])
    else:
        kvp_str = text

    # 解析 Key=Value 对
    for match in re.finditer(r'(\w[\w\s]*?)=([^|]*?)(?=\||$)', kvp_str):
        key = match.group(1).strip()
        val = match.group(2).strip()
        fields[key] = val

    severity_str = fields.get('Severity', 'Medium')
    severity = _severity_from_level(severity_str)

    src_ip = fields.get('src', '')
    dst_ip = fields.get('dst', '')

    return {
        'alert_code': _generate_alert_code('IMP', raw),
        'title': f"[Imperva] {fields.get('Alert type', 'WAF 告警')} - {fields.get('Alert Description', '')}",
        'description': fields.get('Alert Description', ''),
        'severity': severity,
        'status': 'new',
        'source': 'WAF',
        'source_product': 'Imperva SecureSphere',
        'source_type': 'network',
        'category': fields.get('Alert type', 'Web攻击'),
        'confidence': 90.0,
        'src_ip': src_ip,
        'src_port': None,
        'dst_ip': dst_ip,
        'dst_port': int(fields.get('dp', 0)) if fields.get('dp') else None,
        'protocol': 'TCP',
        'hostname': fields.get('Application name', '') or fields.get('Server Group', ''),
        'first_seen': _parse_iso_time(fields.get('devTime', '')),
        'last_seen': _parse_iso_time(fields.get('devTime', '')),
        'raw_log': text,
        'parsed_data': {
            'alert_id': fields.get('Alert ID'),
            'alert_type': fields.get('Alert type'),
            'event_id': fields.get('Event ID'),
            'user_name': fields.get('usrName'),
            'service_name': fields.get('Service name'),
            'simulation_mode': fields.get('Simulation Mode'),
            'immediate_action': fields.get('Immediate Action'),
        },
        'extra_data': {'leef_fields': fields},
        'tags': [fields.get('Alert type', 'WAF'), 'imperva', 'waf'],
    }


# ============================================================
# 4. CrowdStrike Falcon 解析器 (EDR)
# ============================================================

def parse_crowdstrike(raw: dict) -> Optional[dict]:
    """
    CrowdStrike Falcon DetectionSummaryEvent
    Topic: crowdstrike-alert
    """
    event = raw.get('event', {})
    metadata = raw.get('metadata', {})

    detect_name = event.get('DetectName', 'CrowdStrike 告警')
    detect_desc = event.get('DetectDescription', '')
    filename = event.get('FileName', '')
    cmdline = event.get('CommandLine', '')

    # 从 PatternDispositionFlags 判断严重程度
    disposition = event.get('PatternDispositionFlags', {})
    is_quarantine = disposition.get('QuarantineFile', False)
    is_kill = disposition.get('KillProcess', False)

    if is_kill or is_quarantine:
        severity = 'critical'
    else:
        severity = 'high'

    # Falcon DetectionSummaryEvent 只有受控端本机 IP（LocalIP/SensorIP），
    # 它是告警目标而非攻击来源——放进 dst_ip，src_ip 留空，
    # 避免面板把受害主机显示成红色「源地址」。
    local_ip = event.get('LocalIP', '') or event.get('SensorIP', '')

    parsed = {
        'detect_name': detect_name,
        'detect_description': detect_desc,
        'filename': filename,
        'filepath': event.get('FilePath', ''),
        'command_line': cmdline,
        'parent_command_line': event.get('ParentCommandLine', ''),
        'parent_filename': event.get('ParentImageFileName', ''),
        'falcon_host_link': event.get('FalconHostLink', ''),
    }

    # PatternDispositionFlags
    if disposition:
        parsed['disposition'] = {
            'detect': disposition.get('Detect', False),
            'quarantine_file': disposition.get('QuarantineFile', False),
            'kill_process': disposition.get('KillProcess', False),
            'containment': disposition.get('Containment', False),
        }

    return {
        'alert_code': _generate_alert_code('CRW', raw),
        'title': f"[EDR] {detect_name}",
        'description': detect_desc,
        'severity': severity,
        'status': 'new',
        'source': 'EDR',
        'source_product': 'CrowdStrike Falcon',
        'source_type': 'endpoint',
        'category': '终端威胁',
        'confidence': 95.0,
        'src_ip': '',
        'src_port': None,
        'dst_ip': local_ip,
        'dst_port': None,
        'protocol': '',
        'hostname': event.get('ComputerName', '') or event.get('Hostname', ''),
        'first_seen': _parse_iso_time(event.get('Timestamp', '') or raw.get('timestamp', '')),
        'last_seen': _parse_iso_time(event.get('Timestamp', '') or raw.get('timestamp', '')),
        'raw_log': json.dumps(raw, ensure_ascii=False),
        'parsed_data': parsed,
        'extra_data': {
            'customer_id': metadata.get('customerIDString'),
            'event_type': metadata.get('eventType'),
            'offset': metadata.get('offset'),
            'technique': event.get('Technique', ''),
            'tactic': event.get('Tactic', ''),
        },
        'tags': ['crowdstrike', 'edr', 'endpoint'],
    }


# ============================================================
# 5. ModSecurity 解析器 (WAF)
# ============================================================

_MODSEC_PATTERN = re.compile(
    r'\[(?P<timestamp>[^\]]+)\].*?'
    r'\[client\s+(?P<src_ip>[^\]]+)\].*?'
    r'ModSecurity:\s*(?P<action>.*?)\s*with code\s+(?P<status_code>\d+)\s*\(phase\s+\d+\)\.\s*'
    r'(?:Match of\s+"[^"]*"\s+against\s+"(?P<target>[^"]*)"\s+required\.\s*)?'
    r'(?:\[id\s+"(?P<rule_id>[^"]*)"\]\s*)?'
    r'(?:\[msg\s+"(?P<msg>[^"]*)"\]\s*)?'
    r'(?:\[severity\s+"(?P<severity>[^"]*)"\]\s*)?'
    r'(?:\[uri\s+"(?P<uri>[^"]*)"\]\s*)?'
    r'(?:\[unique_id\s+"(?P<unique_id>[^"]*)"\]\s*)?',
    re.DOTALL
)


def parse_modsecurity(raw: Any) -> Optional[dict]:
    """
    ModSecurity Apache error log
    Topic: modsecurity-alert
    """
    if isinstance(raw, dict):
        text = raw.get('raw', '') or raw.get('message', '') or json.dumps(raw)
    else:
        text = str(raw)

    m = _MODSEC_PATTERN.search(text)

    if m:
        src_ip = m.group('src_ip') or ''
        rule_id = m.group('rule_id') or ''
        msg = m.group('msg') or ''
        severity_str = m.group('severity') or 'WARNING'
        uri = m.group('uri') or ''
        status_code = m.group('status_code') or ''
        action = m.group('action') or ''
        target = m.group('target') or ''
        unique_id = m.group('unique_id') or ''
        timestamp = m.group('timestamp') or ''
    else:
        # 降级：尝试提取关键信息
        src_match = re.search(r'\[client\s+([\d.]+)\]', text)
        msg_match = re.search(r'\[msg\s+"([^"]+)"\]', text)
        sev_match = re.search(r'\[severity\s+"([^"]+)"\]', text)
        id_match = re.search(r'\[id\s+"([^"]+)"\]', text)
        uri_match = re.search(r'\[uri\s+"([^"]+)"\]', text)

        src_ip = src_match.group(1) if src_match else ''
        rule_id = id_match.group(1) if id_match else ''
        msg = msg_match.group(1) if msg_match else 'ModSecurity 告警'
        severity_str = sev_match.group(1) if sev_match else 'WARNING'
        uri = uri_match.group(1) if uri_match else ''
        status_code = ''
        action = ''
        target = ''
        unique_id = ''
        timestamp = ''

    severity = _severity_from_level(severity_str, {
        'CRITICAL': 'critical', 'ERROR': 'high', 'WARNING': 'medium', 'NOTICE': 'low', 'INFO': 'low',
    })

    return {
        'alert_code': _generate_alert_code('MOD', raw),
        'title': f"[ModSecurity] {msg}",
        'description': msg,
        'severity': severity,
        'status': 'new',
        'source': 'WAF',
        'source_product': 'ModSecurity',
        'source_type': 'network',
        'category': 'Web攻击',
        'confidence': 88.0,
        'src_ip': src_ip,
        'src_port': None,
        'dst_ip': '',
        'dst_port': None,
        'protocol': 'HTTP',
        'hostname': '',
        'first_seen': _parse_iso_time(timestamp),
        'last_seen': _parse_iso_time(timestamp),
        'raw_log': text,
        'parsed_data': {
            'rule_id': rule_id,
            'severity_str': severity_str,
            'uri': uri,
            'status_code': status_code,
            'action': action,
            'target': target,
            'unique_id': unique_id,
        },
        'extra_data': {},
        'tags': ['modsecurity', 'waf', 'web'],
    }


# ============================================================
# 解析器注册表
# ============================================================

PARSER_REGISTRY = {
    'suricata-alert': parse_suricata,
    'wazuh-alert': parse_wazuh,
    'waf-alert': parse_imperva,     # 原有 WAF topic 指向 Imperva
    'imperva-alert': parse_imperva,
    'crowdstrike-alert': parse_crowdstrike,
    'modsecurity-alert': parse_modsecurity,
}

PRODUCT_TOPICS = {
    'suricata-alert': 'Suricata (NIDS)',
    'wazuh-alert': 'Wazuh (HIDS)',
    'imperva-alert': 'Imperva SecureSphere (WAF)',
    'crowdstrike-alert': 'CrowdStrike Falcon (EDR)',
    'modsecurity-alert': 'ModSecurity (WAF)',
}
