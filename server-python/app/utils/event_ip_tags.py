# ========================================
# 事件 IP 黑白名单标签
# 对比「资源管理 / IT 资源」中的 IP 组（ip_groups，usage=whitelist/blacklist），
# 给事件的源/目的 IP 打对应标签，供事件详情/列表展示与处置参考。
#   命中 whitelist → 'ip:whitelist'（展示「白名单IP」：可信资产，封禁动作须拦截）
#   命中 blacklist → 'ip:blacklist'（展示「黑名单IP」：高危，应重点关注）
# 依赖 app.utils.resource_match.match_ip（带 60s TTL 缓存）。
# ========================================

from app.models import Event

IP_TAG_WHITELIST = 'ip:whitelist'
IP_TAG_BLACKLIST = 'ip:blacklist'

# 标签 → 展示名（前端据此渲染中文徽标）
TAG_LABELS = {
    IP_TAG_WHITELIST: '白名单IP',
    IP_TAG_BLACKLIST: '黑名单IP',
}


def _ip_tag_from_match(ip):
    """返回单个 IP 命中的黑白名单标签（一 IP 可能命中多组，优先级 whitelist > blacklist）。"""
    if not ip:
        return None
    from app.utils import resource_match
    try:
        info = resource_match.match_ip(str(ip))
    except Exception:
        return None
    if not info.get('matched'):
        return None
    usages = {h.get('usage') for h in info.get('hits', [])}
    if 'whitelist' in usages:
        return IP_TAG_WHITELIST
    if 'blacklist' in usages:
        return IP_TAG_BLACKLIST
    return None


def enrich_event_ip_tags(event, commit: bool = False):
    """给单个事件按 src_ip（主责源 IP）+ extra_data.summary.dst_ips（关联聚合目标 IP）打黑白名单标签。

    - 保留事件原有（非 ip: 前缀）标签，清除旧 ip: 标签后补新，避免堆积；
    - commit=False 时不自行提交（由调用方统一 commit，避免额外事务/递归）；
    返回本次新增或变更的标签列表。
    """
    if event is None:
        return []
    # 事件主责源 IP（src_ip）+ 关联告警聚合出的目标 IP（extra_data.summary.dst_ips）
    ips = []
    if getattr(event, 'src_ip', None):
        ips.append(event.src_ip)
    extra = getattr(event, 'extra_data', None) or {}
    dst = (extra.get('summary') or {}).get('dst_ips') or []
    if isinstance(dst, list):
        ips.extend([str(x) for x in dst if x])
    new_tags = set()
    for ip in ips:
        tag = _ip_tag_from_match(ip)
        if tag:
            new_tags.add(tag)

    old = list(event.tags or [])
    kept = [t for t in old if not (isinstance(t, str) and t.startswith('ip:'))]
    merged = kept + sorted(new_tags)
    added = [t for t in merged if t not in old]
    event.tags = merged

    if commit:
        from app.database import db
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()
            raise
    return added


def rebuild_all_event_ip_tags(batch: int = 500):
    """遍历全部事件补打黑白名单标签。

    用于存量事件与 Flink 关联作业经 JDBC sink 直写 PG（不经 Python enrich）的事件。
    返回 {scanned, updated}。
    """
    from app.database import db

    scanned = 0
    updated = 0
    offset = 0
    while True:
        rows = (Event.query.order_by(Event.id)
                .offset(offset).limit(batch).all())
        if not rows:
            break
        for ev in rows:
            before = list(ev.tags or [])
            enrich_event_ip_tags(ev, commit=False)
            if list(ev.tags or []) != before:
                updated += 1
        db.session.commit()
        scanned += len(rows)
        offset += batch
        if len(rows) < batch:
            break
    return {'scanned': scanned, 'updated': updated}
