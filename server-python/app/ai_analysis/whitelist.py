"""
告警白名单系统
用于自动将匹配规则的告警标记为误报
"""
import json, logging, re
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

# 内置白名单规则
DEFAULT_RULES = [
    {"name": "内网扫描", "conditions": {"attack_type": "scan", "severity": "low"}, "reason": "内部扫描活动"},
    {"name": "DNS查询", "conditions": {"attack_type": "dns", "severity": "low"}, "reason": "正常DNS查询"},
    {"name": "已知扫描器", "conditions": {"src_ip": ["10.0.0.1", "192.168.1.100"]}, "reason": "授权扫描器"},
    {"name": "内网IP", "conditions": {"is_internal": True, "severity": "low"}, "reason": "内部网络活动"},
]

def get_rules() -> List[dict]:
    """从数据库获取白名单规则"""
    try:
        from app.models import SystemConfig
        config = SystemConfig.query.filter_by(key='alert_whitelist_rules').first()
        if config and config.value:
            return json.loads(config.value)
    except: pass
    return DEFAULT_RULES

def save_rules(rules: List[dict]) -> bool:
    """保存白名单规则"""
    try:
        from app.models import SystemConfig, db
        config = SystemConfig.query.filter_by(key='alert_whitelist_rules').first()
        if not config:
            config = SystemConfig(key='alert_whitelist_rules', value=json.dumps(rules), category='ai_config')
            db.session.add(config)
        else:
            config.value = json.dumps(rules)
        db.session.commit()
        return True
    except Exception as e:
        logger.error(f"保存白名单失败: {e}")
        return False

def match_alert(alert: dict) -> Optional[dict]:
    """匹配告警是否命中白名单"""
    for rule in get_rules():
        conditions = rule.get("conditions", {})
        matched = True
        for key, value in conditions.items():
            alert_val = alert.get(key, "")
            if isinstance(value, list):
                if alert_val not in value:
                    matched = False
                    break
            elif key == "is_internal" and value == True:
                # 判断是否为内网IP
                ip = alert.get("src_ip", "")
                if not _is_private_ip(ip):
                    matched = False
                    break
            else:
                if str(alert_val).lower() != str(value).lower():
                    matched = False
                    break
        if matched:
            return {"rule": rule["name"], "reason": rule.get("reason", "白名单匹配")}
    return None

def _is_private_ip(ip: str) -> bool:
    """判断是否为内网IP"""
    import ipaddress
    try:
        ip_obj = ipaddress.ip_address(ip)
        return ip_obj.is_private
    except:
        return False

def batch_process(alerts: List[dict]) -> List[dict]:
    """批量处理：白名单匹配 → 标记误报"""
    results = []
    for alert in alerts:
        match = match_alert(alert)
        if match:
            results.append({
                "alert_code": alert.get("alert_code", ""),
                "matched": True,
                "rule": match["rule"],
                "reason": match["reason"],
            })
    return results
