"""
告警白名单系统 — 支持多种匹配方式
"""
import json, logging, re, ipaddress
from typing import List, Dict, Optional, Any

logger = logging.getLogger(__name__)

DEFAULT_RULES = [
    {"name": "内网扫描", "conditions": [{"field":"attack_type","op":"eq","value":"scan"},{"field":"severity","op":"eq","value":"low"}], "reason": "内部扫描活动"},
    {"name": "DNS查询", "conditions": [{"field":"attack_type","op":"eq","value":"dns"},{"field":"severity","op":"eq","value":"low"}], "reason": "正常DNS查询"},
    {"name": "已知扫描器", "conditions": [{"field":"src_ip","op":"in","value":"10.0.0.1,192.168.1.100"}], "reason": "授权扫描器"},
    {"name": "内网IP低危", "conditions": [{"field":"severity","op":"eq","value":"low"},{"field":"src_ip","op":"cidr","value":"10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"}], "reason": "内网低危活动"},
]

def get_rules() -> List[dict]:
    try:
        from app.models import SystemConfig
        config = SystemConfig.query.filter_by(key='alert_whitelist_rules').first()
        if config and config.value:
            return json.loads(config.value)
    except: pass
    return DEFAULT_RULES

def save_rules(rules: List[dict]) -> bool:
    try:
        from app.models import SystemConfig, db
        config = SystemConfig.query.filter_by(key='alert_whitelist_rules').first()
        if not config:
            config = SystemConfig(key='alert_whitelist_rules', value='[]', category='ai_config')
            db.session.add(config)
        config.value = json.dumps(rules, ensure_ascii=False)
        db.session.commit()
        return True
    except Exception as e:
        logger.error(f"保存白名单失败: {e}")
        return False

def match_alert(alert: dict) -> Optional[dict]:
    """匹配告警是否命中白名单，支持多重条件(AND)"""
    for rule in get_rules():
        raw_conditions = rule.get("conditions", [])
        # 兼容旧格式 {"field":"value"}
        if isinstance(raw_conditions, dict):
            raw_conditions = [{"field":k,"op":"eq","value":v} for k,v in raw_conditions.items()]
        elif isinstance(raw_conditions, list) and raw_conditions and isinstance(raw_conditions[0], str):
            raw_conditions = [{"field":c,"op":"eq","value":True} for c in raw_conditions]
        
        all_matched = True
        for cond in raw_conditions:
            field = cond.get("field","")
            op = cond.get("op","eq")
            value = cond.get("value","")
            alert_val = _get_alert_value(alert, field)
            
            if not _evaluate_condition(alert_val, op, value):
                all_matched = False
                break
        
        if all_matched:
            return {"rule": rule.get("name","未知规则"), "reason": rule.get("reason", "白名单匹配")}
    return None

def _get_alert_value(alert: dict, field: str) -> Any:
    """从告警中获取字段值，支持嵌套字段 (extra_data.parsed.xxx)"""
    if '.' in field:
        parts = field.split('.')
        val = alert
        for p in parts:
            if isinstance(val, dict):
                val = val.get(p, "")
            else:
                return ""
        return val
    return alert.get(field, "")

def _evaluate_condition(alert_val: Any, op: str, condition_val: Any) -> bool:
    """评估单条条件"""
    if alert_val is None:
        alert_val = ""
    
    str_val = str(alert_val).lower()
    str_cond = str(condition_val).lower() if condition_val is not None else ""
    
    if op == "eq":
        return str_val == str_cond
    elif op == "ne":
        return str_val != str_cond
    elif op == "contains":
        return str_cond in str_val
    elif op == "not_contains":
        return str_cond not in str_val
    elif op == "prefix":
        return str_val.startswith(str_cond)
    elif op == "suffix":
        return str_val.endswith(str_cond)
    elif op == "regex":
        try: return bool(re.search(str_cond, str_val))
        except: return False
    elif op == "in":
        items = [x.strip().lower() for x in str_cond.split(",") if x.strip()]
        return str_val in items
    elif op == "cidr":
        try:
            ip = ipaddress.ip_address(str_val)
            for cidr_str in str_cond.split(","):
                cidr_str = cidr_str.strip()
                if cidr_str and ip in ipaddress.ip_network(cidr_str, strict=False):
                    return True
            return False
        except: return False
    elif op == "gt":
        try: return float(alert_val) > float(condition_val)
        except: return str_val > str_cond
    elif op == "lt":
        try: return float(alert_val) < float(condition_val)
        except: return str_val < str_cond
    elif op == "range":
        try:
            parts = str_cond.split(",")
            if len(parts) == 2:
                low, high = parts
                n = float(alert_val)
                low_f = float(low) if low else float('-inf')
                high_f = float(high) if high else float('inf')
                return low_f <= n <= high_f
        except: pass
        return False
    return False

def _is_private_ip(ip: str) -> bool:
    try:
        return ipaddress.ip_address(ip).is_private
    except: return False

def batch_process(alerts: List[dict]) -> List[dict]:
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
