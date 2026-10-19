"""事件富化工具：把一批告警聚合成「有信息量」的事件内容。

事件（PG events）本身只存标题/描述/扩展数据，历史上由告警生成事件时只写了
用户手填的一句话，导致事件详情里看不到攻击侧 IP、时间跨度、告警构成等关键信息。
本模块统一负责：

1. `build_related_alerts` —— 生成事件 extra_data.related_alerts（前端关联告警列表）
2. `summarize_alerts`     —— 生成结构化统计（extra_data.summary）
3. `pick_primary_src_ip`  —— 选出事件的「主责源 IP」（写入 events.src_ip 列）
4. `render_description`   —— 生成多行可读的事件描述

所有由告警生成事件的入口（人工聚合 / AI 研判 / 剧本 create_event 动作 / 规则引擎）
都应走这里，保证事件描述口径一致。
"""

from collections import Counter
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional

# 严重级别排序：用于「取最高危告警」与统计展示顺序
SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info']
SEVERITY_LABEL = {
    'critical': '危急', 'high': '高危', 'medium': '中危',
    'low': '低危', 'info': '信息',
}

_EMPTY = {'', None, 'N/A', 'unknown', '-'}


def _clean(value: Any) -> str:
    if value is None:
        return ''
    text = str(value).strip()
    return '' if text in _EMPTY else text


def _severity_rank(sev: str) -> int:
    try:
        return SEVERITY_ORDER.index(str(sev or '').lower())
    except ValueError:
        return len(SEVERITY_ORDER)


def _parse_time(value: Any) -> Optional[datetime]:
    text = _clean(value)
    if not text:
        return None
    # ES 日期常见格式：2026-10-18T09:12:03 / 2026-10-18 09:12:03 / 带 Z
    for fmt in ('%Y-%m-%dT%H:%M:%S', '%Y-%m-%d %H:%M:%S',
                '%Y-%m-%dT%H:%M:%S.%f', '%Y-%m-%d %H:%M:%S.%f'):
        try:
            return datetime.strptime(text.replace('Z', '')[:26], fmt)
        except ValueError:
            continue
    return None


def _fmt_time(value: Any) -> str:
    dt = _parse_time(value)
    return dt.strftime('%Y-%m-%d %H:%M:%S') if dt else _clean(value)


def _duration_text(start: Optional[datetime], end: Optional[datetime]) -> str:
    if not start or not end or end <= start:
        return ''
    seconds = int((end - start).total_seconds())
    if seconds < 60:
        return f'{seconds} 秒'
    if seconds < 3600:
        return f'{seconds // 60} 分钟'
    if seconds < 86400:
        return f'{seconds // 3600} 小时 {(seconds % 3600) // 60} 分钟'
    return f'{seconds // 86400} 天 {(seconds % 86400) // 3600} 小时'


# =============================================
# 关联告警列表
# =============================================

def build_related_alerts(alert_docs: Dict[str, dict]) -> List[dict]:
    """把 {alert_id: doc} 转成事件 extra_data.related_alerts（按严重级别+时间排序）。"""
    items = []
    for aid, doc in (alert_docs or {}).items():
        doc = doc or {}
        items.append({
            'id': str(aid),
            'alert_code': doc.get('alert_code') or str(aid),
            'title': doc.get('title') or '',
            'severity': doc.get('severity') or 'medium',
            'category': doc.get('category') or '',
            'src_ip': doc.get('src_ip') or '',
            'dst_ip': doc.get('dst_ip') or '',
            'hostname': doc.get('hostname') or '',
            'source_product': doc.get('source_product') or doc.get('source') or '',
            'first_seen': doc.get('first_seen') or '',
        })
    items.sort(key=lambda x: (_severity_rank(x['severity']), str(x['first_seen'])),
               reverse=False)
    return items


# =============================================
# 统计摘要
# =============================================

def summarize_alerts(alert_docs: Dict[str, dict]) -> dict:
    """统计一批告警，返回可写入 extra_data.summary 的结构化摘要。"""
    docs = [d or {} for d in (alert_docs or {}).values()]
    if not docs:
        return {'alert_count': 0}

    src_counter: Counter = Counter()
    dst_counter: Counter = Counter()
    sev_counter: Counter = Counter()
    cat_counter: Counter = Counter()
    name_counter: Counter = Counter()
    product_counter: Counter = Counter()
    asset_counter: Counter = Counter()

    times = []
    for doc in docs:
        src = _clean(doc.get('src_ip'))
        dst = _clean(doc.get('dst_ip'))
        if src:
            src_counter[src] += 1
        if dst:
            dst_counter[dst] += 1
        sev = _clean(doc.get('severity')) or 'medium'
        sev_counter[sev] += 1
        cat = _clean(doc.get('category'))
        if cat:
            cat_counter[cat] += 1
        name = _clean(doc.get('title'))
        if name:
            name_counter[name] += 1
        product = _clean(doc.get('source_product') or doc.get('source')
                         or doc.get('source_type'))
        if product:
            product_counter[product] += 1
        asset = _clean(doc.get('hostname'))
        if asset:
            asset_counter[asset] += 1
        for key in ('first_seen', 'last_seen'):
            dt = _parse_time(doc.get(key))
            if dt:
                times.append(dt)

    first_seen = min(times) if times else None
    last_seen = max(times) if times else None

    return {
        'alert_count': len(docs),
        'src_ips': [ip for ip, _ in src_counter.most_common(10)],
        'src_ip_top': [{'ip': ip, 'count': c} for ip, c in src_counter.most_common(5)],
        'dst_ips': [ip for ip, _ in dst_counter.most_common(10)],
        'assets': [h for h, _ in asset_counter.most_common(10)],
        'source_products': [p for p, _ in product_counter.most_common(10)],
        'severity_distribution': dict(sorted(
            sev_counter.items(), key=lambda kv: _severity_rank(kv[0]))),
        'category_top': [{'name': n, 'count': c} for n, c in cat_counter.most_common(5)],
        'alert_name_top': [{'name': n, 'count': c} for n, c in name_counter.most_common(5)],
        'first_seen': first_seen.strftime('%Y-%m-%d %H:%M:%S') if first_seen else '',
        'last_seen': last_seen.strftime('%Y-%m-%d %H:%M:%S') if last_seen else '',
        'duration': _duration_text(first_seen, last_seen),
    }


def pick_primary_src_ip(alert_docs: Dict[str, dict], fallback: str = '') -> str:
    """主责源 IP = 最高危告警中出现次数最多的源 IP（同级别取告警数最多者）。"""
    docs = [d or {} for d in (alert_docs or {}).values()]
    if not docs:
        return _clean(fallback)

    docs_sorted = sorted(docs, key=lambda d: _severity_rank(d.get('severity')))
    top_rank = _severity_rank(docs_sorted[0].get('severity'))
    counter: Counter = Counter()
    for doc in docs_sorted:
        if _severity_rank(doc.get('severity')) != top_rank:
            break
        src = _clean(doc.get('src_ip'))
        if src:
            counter[src] += 1
    if counter:
        return counter.most_common(1)[0][0]

    # 该级别告警都没有源 IP → 退到任意告警的第一个非空源 IP
    for doc in docs_sorted:
        src = _clean(doc.get('src_ip'))
        if src:
            return src
    return _clean(fallback)


# =============================================
# 描述渲染
# =============================================

def _join_named(counter_list: List[dict], limit: int = 5) -> str:
    return '、'.join(f"{x['name']}({x['count']})" for x in counter_list[:limit])


def render_description(summary: dict,
                       related_alerts: Optional[List[dict]] = None,
                       origin: str = '告警聚合',
                       user_description: str = '',
                       detail_limit: int = 5) -> str:
    """渲染多行事件描述。

    origin          事件来源说明（如「人工聚合」「AI 研判」「剧本自动生成」）
    user_description 用户手填描述，非空时作为「人工补充」附在末尾
    """
    summary = summary or {}
    related_alerts = related_alerts or []
    lines: List[str] = []

    count = summary.get('alert_count', len(related_alerts))
    lines.append(f"由 {count} 条告警聚合生成（{origin}）")

    first_seen = summary.get('first_seen') or ''
    last_seen = summary.get('last_seen') or ''
    if first_seen and last_seen and first_seen != last_seen:
        span = f"，跨度 {summary['duration']}" if summary.get('duration') else ''
        lines.append(f"时间范围：{first_seen} ~ {last_seen}{span}")
    elif first_seen:
        lines.append(f"发生时间：{first_seen}")

    src_top = summary.get('src_ip_top') or []
    if src_top:
        lines.append('主要源 IP：' + '、'.join(
            f"{x['ip']}({x['count']} 条)" for x in src_top))
    dst_ips = summary.get('dst_ips') or []
    if dst_ips:
        lines.append('目标 IP：' + '、'.join(dst_ips[:5]) +
                     (f" 等 {len(dst_ips)} 个" if len(dst_ips) > 5 else ''))

    assets = summary.get('assets') or []
    if assets:
        lines.append('涉及资产：' + '、'.join(assets[:5]) +
                     (f" 等 {len(assets)} 台" if len(assets) > 5 else ''))

    sev_dist = summary.get('severity_distribution') or {}
    if sev_dist:
        lines.append('严重级别分布：' + ' / '.join(
            f"{SEVERITY_LABEL.get(k, k)} {v} 条" for k, v in sev_dist.items()))

    cat_top = summary.get('category_top') or []
    if cat_top:
        lines.append('告警类型：' + _join_named(cat_top))

    name_top = summary.get('alert_name_top') or []
    if name_top:
        lines.append('告警名称：' + _join_named(name_top))

    products = summary.get('source_products') or []
    if products:
        lines.append('来源产品：' + '、'.join(products))

    if related_alerts:
        lines.append(f"告警明细（前 {min(detail_limit, len(related_alerts))} 条）：")
        for idx, item in enumerate(related_alerts[:detail_limit], 1):
            sev = SEVERITY_LABEL.get(item.get('severity'), item.get('severity') or '')
            target = item.get('dst_ip') or ''
            arrow = f" → {target}" if target else ''
            when = _fmt_time(item.get('first_seen'))
            lines.append(f"  {idx}. [{sev}] {item.get('title') or item.get('alert_code')}"
                         f"（{item.get('src_ip') or '-'}{arrow}）{when}"
                         f" {item.get('alert_code') or ''}".rstrip())

    extra = (user_description or '').strip()
    if extra:
        lines.append(f"补充说明：{extra}")

    return '\n'.join(lines)


def build_event_content(alert_docs: Dict[str, dict],
                        origin: str = '告警聚合',
                        user_description: str = '',
                        detail_limit: int = 5) -> dict:
    """一次性产出事件所需的全部富化内容。

    返回 {'related_alerts', 'summary', 'src_ip', 'description'}。
    """
    alert_docs = alert_docs or {}
    related_alerts = build_related_alerts(alert_docs)
    summary = summarize_alerts(alert_docs)
    return {
        'related_alerts': related_alerts,
        'summary': summary,
        'src_ip': pick_primary_src_ip(alert_docs),
        'description': render_description(summary, related_alerts,
                                          origin=origin,
                                          user_description=user_description,
                                          detail_limit=detail_limit),
    }
