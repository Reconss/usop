# ========================================
# 资源组匹配工具 — 供告警过滤规则、白名单、研判等模块调用
# 组数据带 60s TTL 缓存；无 Flask 上下文时使用最后一次缓存（流水线线程
# 在 _load_filter_rules 等持有 app_context 的位置会触发 refresh）。
# ========================================

import logging
import time

logger = logging.getLogger('resource_match')

_TTL = 60.0
_cache = {'at': 0.0, 'ip': {}, 'domain': {}, 'ip_usage': {}}


def refresh_cache():
    """强制刷新组缓存（需在 app_context 内调用）。"""
    try:
        from app.models.resource_groups import IpGroup, DomainGroup
        ip_map = {}
        ip_usage = {}
        for g in IpGroup.query.all():
            ip_map[g.name] = [i.entry.strip() for i in g.items if i.entry.strip()]
            ip_usage[g.name] = g.usage or 'general'
        domain_map = {}
        for g in DomainGroup.query.all():
            domain_map[g.name] = [i.domain.strip().lower() for i in g.items if i.domain.strip()]
        _cache['ip'] = ip_map
        _cache['ip_usage'] = ip_usage
        _cache['domain'] = domain_map
        _cache['at'] = time.time()
    except Exception as e:
        logger.error(f"刷新资源组缓存失败: {e}")


def _ensure_fresh():
    if time.time() - _cache['at'] > _TTL:
        try:
            from flask import has_app_context
            if has_app_context():
                refresh_cache()
        except Exception:
            pass


def _entry_matches_ip(entry: str, ip: str) -> bool:
    """单条目匹配：单 IP / CIDR / 范围（a-b，含 192.168.1.1-100 简写）。

    委托 ip_match.is_ip_in_list（旧黑白名单同源逻辑），保证迁移数据兼容。
    """
    from app.utils.ip_match import is_ip_in_list
    return is_ip_in_list(str(ip), [entry])


def ip_in_group(group_name: str, ip: str) -> bool:
    """判断 IP 是否属于指定名称的 IP 组。"""
    if not ip or not group_name:
        return False
    _ensure_fresh()
    for entry in _cache['ip'].get(group_name, []):
        if _entry_matches_ip(entry, str(ip)):
            return True
    return False


def domain_in_group(group_name: str, domain: str) -> bool:
    """判断域名是否属于指定名称的域名组（支持 .example.com / *.example.com 通配后缀）。"""
    if not domain or not group_name:
        return False
    _ensure_fresh()
    d = str(domain).lower().rstrip('.')
    for entry in _cache['domain'].get(group_name, []):
        # 通配语义：'.example.com' 或 '*.example.com' → 后缀匹配；否则精确匹配
        if entry.startswith('*.'):
            base = entry[1:]                     # '.example.com'
            if d == base[1:] or d.endswith(base):
                return True
        elif entry.startswith('.'):
            if d == entry[1:] or d.endswith(entry):
                return True
        else:
            if d == entry.rstrip('.'):
                return True
    return False


def list_group_names(kind: str = 'ip') -> list:
    """返回全部组名（kind: ip|domain），供前端/规则校验。"""
    _ensure_fresh()
    return sorted((_cache['ip'] if kind == 'ip' else _cache['domain']).keys())


def match_ip(ip: str) -> dict:
    """查询 IP 命中的全部 IP 组（含用途），供告警详情徽标/研判展示。

    返回 {ip, matched, hits: [{groupName, usage, items: [命中的条目原文]}]}。
    """
    ip = str(ip or '').strip()
    result = {'ip': ip, 'matched': False, 'hits': []}
    if not ip:
        return result
    _ensure_fresh()
    for name, entries in _cache['ip'].items():
        hit_items = [e for e in entries if _entry_matches_ip(e, ip)]
        if hit_items:
            result['matched'] = True
            result['hits'].append({
                'groupName': name,
                'usage': _cache.get('ip_usage', {}).get(name, 'general'),
                'items': hit_items,
            })
    # 黑名单优先展示
    result['hits'].sort(key=lambda h: 0 if h['usage'] == 'blacklist' else (1 if h['usage'] == 'whitelist' else 2))
    return result
