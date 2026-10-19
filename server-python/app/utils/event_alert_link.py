"""告警 ↔ 事件 状态联动 —— 唯一实现

背景：告警唯一真相源在 ES（alerts-valid），事件持久化在 PostgreSQL。
一条告警被聚合 / 规则命中 / AI 研判转成事件后，其状态必须跟着事件生命周期走，
否则会反复出现在「待分析」队列里被重复研判。

联动语义（事件状态 → 关联告警状态）：
  - closed          → closed（事件完成处置，告警随之关闭，不再参与自动研判）
  - resolved        → resolved
  - false_positive  → false_positive
  - investigating / acknowledged / new（重开或推进）→ investigating
  - pending_approval / approval_rejected → 不动（审批中，非处置进展）

防误伤：一条告警可能被多个事件关联（event_ids 记录在告警 ES 文档上）。
把告警推向 closed/resolved 等终态前，检查它挂着的其它事件：
只要还有任一事件处于未终态（new/acknowledged/investigating/pending_approval/
approval_rejected），就不降级关闭该告警。
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

# 事件终态（与 events_api.TERMINAL_STATUSES 一致；此处独立声明避免循环 import）
EVENT_TERMINAL_STATUSES = {'closed', 'false_positive'}
# 事件活跃态：仍需告警保持「处置中」
EVENT_ACTIVE_STATUSES = {'new', 'acknowledged', 'investigating',
                         'pending_approval', 'approval_rejected'}

# 事件状态 → 告警状态（None = 不联动）
EVENT_TO_ALERT_STATUS = {
    'closed': 'closed',
    'resolved': 'resolved',
    'false_positive': 'false_positive',
    'new': 'investigating',
    'acknowledged': 'investigating',
    'investigating': 'investigating',
    'pending_approval': None,
    'approval_rejected': None,
}


def link_alerts_to_event(alert_ids, event_code: str, status: str = 'investigating') -> dict:
    """告警关联事件：回写状态 + 把 event_code 追加进告警 event_ids。

    返回 {'status_updated': n, 'linked': n}。失败不抛异常（联动失败不阻断主流程）。
    """
    from app.utils import es_alerts

    ids = [str(a) for a in (alert_ids or []) if a]
    if not ids or not event_code:
        return {'status_updated': 0, 'linked': 0}

    status_updated = linked = 0
    for aid in ids:
        doc = es_alerts.get_alert(aid)
        if not doc:
            continue
        fields: dict = {}
        # 状态：只把「未终态」的告警推向联动状态，不覆盖人工已关闭的告警
        cur = (doc.get('status') or 'new')
        if status and cur not in ('closed', 'false_positive', 'resolved') and cur != status:
            fields['status'] = status
        # event_ids：去重追加
        ev = list(doc.get('event_ids') or [])
        if event_code not in ev:
            ev.append(event_code)
            fields['event_ids'] = ev
        if fields and es_alerts.update_alert(aid, fields, index=doc.get('_index')):
            linked += 1
            if 'status' in fields:
                status_updated += 1
        elif not fields:
            linked += 1
    if linked:
        logger.info(f"事件 {event_code} 已联动 {linked} 条告警"
                    f"（状态→{status or '不变'}）")
    return {'status_updated': status_updated, 'linked': linked}


def _other_events_block_close(event_codes: list, exclude_event_code: str = None) -> bool:
    """告警挂着的其它事件里是否还有未终态的（有则不应把告警推向终态）。"""
    from app.models import Event
    codes = [c for c in (event_codes or []) if c and c != exclude_event_code]
    if not codes:
        return False
    rows = (Event.query.with_entities(Event.event_code, Event.status)
            .filter(Event.event_code.in_(codes)).all())
    for _, st in rows:
        if st not in EVENT_TERMINAL_STATUSES:
            return True
    return False


def sync_alerts_on_event_status(alert_ids, event_status: str,
                                event_code: str = None) -> int:
    """事件状态变化 → 同步关联告警状态（ES）。

    - closed/resolved/false_positive：告警推向对应终态；若告警还挂在其它
      未终态事件上，则保持现状（防误关）。
    - investigating/acknowledged/new（事件重开/推进）：告警回到 investigating，
      除非告警已因其它事件关闭（其它事件处于终态且当前告警为 closed）。
    - pending_approval/approval_rejected：不联动。

    返回成功更新的告警条数。
    """
    from app.utils import es_alerts

    target = EVENT_TO_ALERT_STATUS.get(event_status)
    ids = [str(a) for a in (alert_ids or []) if a]
    if not target or not ids:
        return 0

    updated = 0
    for aid in ids:
        doc = es_alerts.get_alert(aid)
        if not doc:
            continue
        cur = doc.get('status') or 'new'
        if cur == target:
            continue

        if target in ('closed', 'resolved', 'false_positive'):
            # 防误关：其它未终态事件还挂着 → 不动
            if _other_events_block_close(doc.get('event_ids'), event_code):
                logger.info(f"告警 {aid} 仍挂在其它未终态事件上，保持状态 {cur}")
                continue
        else:  # 回到 investigating
            # 已被其它终态事件关闭的告警，不因本事件重开而被拉起
            if cur == 'closed':
                others = [c for c in (doc.get('event_ids') or [])
                          if c and c != event_code]
                if others:
                    from app.models import Event
                    rows = (Event.query.with_entities(Event.status)
                            .filter(Event.event_code.in_(others)).all())
                    if any(st in EVENT_TERMINAL_STATUSES for (st,) in rows):
                        continue

        if es_alerts.set_status(aid, target, index=doc.get('_index')):
            updated += 1

    if updated:
        logger.info(f"事件 {event_code or '?'} 状态 → {event_status}，"
                    f"同步 {updated}/{len(ids)} 条关联告警为 {target}")
    return updated


def collect_event_alert_ids(event) -> list:
    """从事件上取关联告警 id（extra_data.alert_ids，兼容缺失）。"""
    extra = getattr(event, 'extra_data', None) or {}
    return [str(a) for a in (extra.get('alert_ids') or []) if a]
