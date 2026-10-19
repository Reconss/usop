"""
IP 名单匹配工具 — 借鉴 EFF-Monitoring core/lists.py。
支持单 IP / CIDR / 完整范围 / IPv4 简写范围（如 192.168.1.1-100）的命中判断。
"""
from ipaddress import AddressValueError, ip_address, ip_network


def _range_bounds(value: str):
    start_text, end_text = [part.strip() for part in value.split("-", 1)]
    start_ip = ip_address(start_text)
    if "." in start_text and "." not in end_text and ":" not in end_text:
        # IPv4 简写处理：192.168.1.1-100
        prefix = start_text.rsplit(".", 1)[0]
        end_text = f"{prefix}.{end_text}"
    elif ":" in start_text and ":" not in end_text and "." not in end_text:
        prefix = start_text.rsplit(":", 1)[0]
        end_text = f"{prefix}:{end_text}"
    end_ip = ip_address(end_text)
    return start_ip, end_ip


def detect_value_type(value: str):
    """识别名单项类型：single / cidr / range / None"""
    v = (value or "").strip()
    if not v:
        return None
    if "/" in v:
        return "cidr"
    if "-" in v:
        return "range"
    return "single"


def is_ip_in_list(ip: str, values) -> bool:
    """检查单个 IP 是否命中名单项集合（支持单IP/CIDR/范围/简写）。"""
    try:
        target = ip_address((ip or "").strip())
    except (ValueError, AddressValueError):
        return False

    for item in values:
        value = (item or "").strip() if isinstance(item, str) else (item.get("value") if isinstance(item, dict) else "")
        if not value:
            continue
        try:
            if "/" in value:
                if target in ip_network(value, strict=False):
                    return True
            elif "-" in value:
                start_ip, end_ip = _range_bounds(value)
                if start_ip.__class__ is target.__class__ and start_ip <= target <= end_ip:
                    return True
            else:
                if target == ip_address(value):
                    return True
        except (ValueError, AddressValueError):
            continue
    return False
