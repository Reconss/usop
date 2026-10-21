"""
Dashboard API 路由 - 仪表盘数据接口
使用真实数据库数据

说明：告警已统一持久化到 Elasticsearch（alerts-valid），仪表盘的告警类指标
（总数/今日/趋势/分类/攻击源/最近告警）全部从 ES 读取；事件、资产、规则、
扫描任务等业务对象仍在 PostgreSQL。
"""
from flask import Blueprint, jsonify, request
from app.routes.auth import login_required
from app.models import Event, Asset, ScanTask, DetectionRuleExtended
from app.utils import es_alerts
from datetime import datetime, timedelta

dashboard_api_bp = Blueprint('dashboard_api', __name__)


def _iso(dt):
    return dt.replace(microsecond=0).isoformat() + 'Z'


def _es_count(start=None, end=None, filters=None):
    """按时间范围 + 字段条件统计告警条数（ES）。"""
    try:
        return es_alerts.search_alerts(
            filters=filters or {}, start=start, end=end,
            page=1, page_size=1)['total']
    except Exception:
        return 0


def _es_terms(field, size=10, start=None, end=None):
    """告警字段 TopN（ES terms 聚合），返回 [(key, count)]。"""
    try:
        res = es_alerts.quick_values(field=field, start=start, end=end, size=size)
        return [(b['key'], b['count']) for b in res.get('buckets', [])
                if b.get('key') not in (None, '')]
    except Exception:
        return []


def _es_hourly_severity(hours=24):
    """最近 N 小时按小时 × severity 的分桶统计（单次 ES 查询）。"""
    start = _iso(datetime.utcnow() - timedelta(hours=hours))
    body = {
        'size': 0,
        'query': {'range': {'first_seen': {'gte': start}}},
        'aggs': {'per_hour': {
            'date_histogram': {'field': 'first_seen', 'fixed_interval': '1h',
                               'min_doc_count': 0},
            'aggs': {'by_sev': {'terms': {'field': 'severity', 'size': 10}}},
        }},
    }
    try:
        resp = es_alerts.client().search(index=es_alerts.INDEX_VALID, body=body)
    except Exception:
        return {}
    buckets = ((resp.get('aggregations') or {}).get('per_hour') or {}).get('buckets') or []
    out = {}
    for b in buckets:
        key = (b.get('key_as_string') or '')[:13]      # '2026-10-17T02'
        out[key] = {x['key']: x['doc_count'] for x in (b.get('by_sev') or {}).get('buckets', [])}
    return out

@dashboard_api_bp.route('/metrics', methods=['GET'])
@login_required
def get_metrics():
    """获取仪表盘指标数据"""
    today = datetime.utcnow().date()
    day_start = _iso(datetime.combine(today, datetime.min.time()))
    day_end = _iso(datetime.combine(today, datetime.max.time()))
    y_start = _iso(datetime.combine(today - timedelta(days=1), datetime.min.time()))
    y_end = _iso(datetime.combine(today - timedelta(days=1), datetime.max.time()))

    # 告警指标（ES alerts-valid）
    total_alerts = _es_count()
    today_alerts = _es_count(start=day_start, end=day_end)

    # 待处理事件
    pending_events = Event.query.filter(
        Event.status.in_(['new', 'investigating'])
    ).count()

    # 高危资产数（与前端「Top 5 风险资产」列表同口径：risk_score >= 70）
    high_risk_assets = Asset.query.filter(
        Asset.risk_score >= 70
    ).count()

    # 资产总数
    total_assets = Asset.query.count()

    # 趋势计算 (基于真实数据对比昨天)
    yesterday_alerts = _es_count(start=y_start, end=y_end)

    if yesterday_alerts > 0:
        alerts_trend = round((today_alerts - yesterday_alerts) / yesterday_alerts * 100, 1)
    else:
        alerts_trend = 0 if today_alerts == 0 else 100
    
    return jsonify({
        'success': True,
        'data': {
            'todayAlerts': today_alerts,
            'totalAlerts': total_alerts,
            'pendingEvents': pending_events,
            'totalAssets': total_assets,
            'highRiskAssets': high_risk_assets,
            'alertsTrend': alerts_trend,
            'pendingTrend': 0,
            'assetsTrend': 0,
            'healthTrend': 0
        }
    })

@dashboard_api_bp.route('/event-trend', methods=['GET'])
@login_required
def get_event_trend():
    """获取告警趋势数据 (最近24小时，按小时 × severity，单次 ES 聚合)"""
    now = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
    start_hour = now - timedelta(hours=23)

    buckets = _es_hourly_severity(24)

    timestamps, critical, high, medium, low = [], [], [], [], []
    for i in range(24):
        hour = start_hour + timedelta(hours=i)
        key = hour.strftime('%Y-%m-%dT%H')
        sev = buckets.get(key, {})
        timestamps.append(hour.strftime('%H:00'))
        critical.append(sev.get('critical', 0))
        high.append(sev.get('high', 0))
        medium.append(sev.get('medium', 0))
        low.append(sev.get('low', 0))
    
    return jsonify({
        'success': True,
        'data': {
            'timestamps': timestamps,
            'critical': critical,
            'high': high,
            'medium': medium,
            'low': low
        }
    })

@dashboard_api_bp.route('/event-types', methods=['GET'])
@login_required
def get_event_types():
    """获取告警分类分布（ES terms 聚合）"""
    category_stats = _es_terms('category', size=10)
    
    colors = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6', '#F59E0B', '#6366F1']
    
    event_types = []
    for i, (category, cnt) in enumerate(category_stats):
        event_types.append({
            'name': category or '未知',
            'value': cnt,
            'color': colors[i % len(colors)]
        })
    
    if not event_types:
        event_types = [{'name': '无数据', 'value': 1, 'color': '#6366F1'}]
    
    return jsonify({'success': True, 'data': event_types})

@dashboard_api_bp.route('/attack-sources', methods=['GET'])
@login_required
def get_attack_sources():
    """Top N 攻击源 IP：ES alerts-valid 按 src_ip 聚合（默认最近 24 小时）。

    前端「Top 5 攻击源 IP」模块专用。原实现走 _es_terms（对 ip 类型字段
    聚合失败）→ 恒空 → 回落硬编码假数据 192.168.1.100；且按首段十进制
    猜「海外/内网」也是假地理信息。改为 ES terms 聚合 + 24h 时间窗，
    不编造国家/地区字段（无 GeoIP 数据源时不返回）。
    """
    hours = request.args.get('hours', 24, type=int)
    limit = request.args.get('limit', 5, type=int)
    start = _iso(datetime.utcnow() - timedelta(hours=hours))
    body = {
        'size': 0,
        'query': {'range': {'first_seen': {'gte': start}}},
        'aggs': {'by_src': {
            'terms': {'field': 'src_ip', 'size': max(1, limit), 'min_doc_count': 1},
            'aggs': {
                'last_seen': {'max': {'field': 'first_seen'}},
                'top_sev': {'terms': {'field': 'severity', 'size': 1}},
            },
        }},
    }
    try:
        resp = es_alerts.client().search(index=es_alerts.INDEX_VALID, body=body)
    except Exception:
        return jsonify({'success': True, 'data': []})
    buckets = ((resp.get('aggregations') or {}).get('by_src') or {}).get('buckets') or []
    data = [{
        'ip': b['key'],
        'count': b['doc_count'],
        'last_seen': (b.get('last_seen') or {}).get('value_as_string'),
        'top_severity': next(
            (x['key'] for x in (b.get('top_sev') or {}).get('buckets', [])), None),
    } for b in buckets]
    return jsonify({'success': True, 'data': data})

@dashboard_api_bp.route('/risk-assets', methods=['GET'])
@login_required
def get_risk_assets():
    """高风险资产 Top N（risk_score >= 70，与指标卡「高危资产」同口径）。

    原实现阈值 risk_score > 0（把 30/40 分资产也当高风险）且空数据时
    回落「无风险资产数据」假条目。现在：>= 70 真实阈值，无数据返回空数组。
    """
    limit = request.args.get('limit', 5, type=int)
    assets = Asset.query.filter(
        Asset.risk_score.isnot(None),
        Asset.risk_score >= 70
    ).order_by(
        Asset.risk_score.desc()
    ).limit(max(1, limit)).all()

    data = []
    for asset in assets:
        data.append({
            'id': str(asset.id),
            'name': asset.name or asset.hostname or asset.ip or '未知',
            'type': asset.type or 'unknown',
            'riskScore': asset.risk_score or 0,
            'lastSeen': asset.updated_at.isoformat() if asset.updated_at else None
        })

    return jsonify({'success': True, 'data': data})


@dashboard_api_bp.route('/recent-alerts', methods=['GET'])
@login_required
def get_recent_alerts():
    """获取最近告警（ES alerts-valid，按 first_seen 倒序）"""
    limit = request.args.get('limit', 10, type=int)
    
    res = es_alerts.search_alerts(page=1, page_size=limit,
                                  sort_field='first_seen', sort_order='desc')
    data = []
    for alert in res['items']:
        data.append({
            'id': alert.get('alert_code') or alert.get('id'),
            'title': alert.get('title'),
            'severity': alert.get('severity'),
            'status': alert.get('status'),
            'source': alert.get('source'),
            'category': alert.get('category'),
            'src_ip': alert.get('src_ip'),
            'created_at': alert.get('created_at') or alert.get('first_seen')
        })
    
    return jsonify({'success': True, 'data': data})

@dashboard_api_bp.route('/summary', methods=['GET'])
@login_required
def get_summary():
    """获取仪表盘汇总数据"""
    total_events = Event.query.count()
    total_alerts = _es_count()
    open_alerts = _es_count(filters={'status': 'new'})
    total_assets = Asset.query.count()
    total_rules = DetectionRuleExtended.query.filter(
        DetectionRuleExtended.status == 'enabled'
    ).count()
    running_tasks = ScanTask.query.filter(
        ScanTask.status == 'running'
    ).count()
    
    return jsonify({
        'success': True,
        'data': {
            'totalEvents': total_events,
            'totalAlerts': total_alerts,
            'openAlerts': open_alerts,
            'totalAssets': total_assets,
            'activeRules': total_rules,
            'runningTasks': running_tasks,
            'timestamp': datetime.utcnow().isoformat()
        }
    })
