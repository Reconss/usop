"""
安全告警 API 路由 - PostgreSQL 版本（替代 ES 依赖）
保持与前端 API 签名完全兼容。
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import Alert, Event, AuditLog
from datetime import datetime, timedelta
from sqlalchemy import or_, and_, func, desc, asc
import re
import logging

logger = logging.getLogger(__name__)

alerts_api_bp = Blueprint('alerts_api', __name__)


# =============================================
# 辅助函数
# =============================================

def _time_range_from_request():
    start = request.args.get('start_time') or request.args.get('start')
    end = request.args.get('end_time') or request.args.get('end')
    return start, end


def _alert_to_response(a):
    """Alert model → 前端兼容格式"""
    return a.to_dict()


def _parse_query_string(query_string, base_query):
    """简单解析 query_string → SQLAlchemy filters"""
    if not query_string:
        return base_query

    q = query_string.strip()
    conditions = []

    # 解析 field:value 模式
    parts = re.split(r'\s+AND\s+', q, flags=re.IGNORECASE)
    for part in parts:
        part = part.strip()
        if not part:
            continue

        # NOT field:value
        not_match = re.match(r'NOT\s+(\w+):(.+)', part, re.IGNORECASE)
        if not_match:
            field, value = not_match.group(1), not_match.group(2).strip('"')
            col = getattr(Alert, field, None)
            if col:
                conditions.append(col != value)
            continue

        # field:value
        match = re.match(r'(\w+):(.+)', part)
        if match:
            field, value = match.group(1), match.group(2).strip('"')
            col = getattr(Alert, field, None)
            if col is None:
                continue
            if '*' in value:
                conditions.append(col.like(value.replace('*', '%')))
            else:
                conditions.append(col == value)
            continue

        # 全文搜索 - 在 title/description 中模糊匹配
        conditions.append(or_(
            Alert.title.ilike(f'%{part}%'),
            Alert.description.ilike(f'%{part}%'),
        ))

    if conditions:
        return base_query.filter(and_(*conditions))
    return base_query


# =============================================
# 告警列表 / 搜索
# =============================================

@alerts_api_bp.route('/alerts', methods=['GET'])
@login_required
def get_alerts():
    """获取告警列表"""
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 20, type=int)
    sort_field = request.args.get('sort_field', 'first_seen')
    sort_order = request.args.get('sort_order', 'desc')

    query_string = request.args.get('query', '') or request.args.get('search', '')

    # 基础查询
    base = Alert.query

    # query_string 过滤
    base = _parse_query_string(query_string, base)

    # 传统筛选
    severity = request.args.get('severity')
    status = request.args.get('status')
    source = request.args.get('source')
    src_ip = request.args.get('src_ip')
    dst_ip = request.args.get('dst_ip')

    if severity:
        base = base.filter(Alert.severity == severity)
    if status:
        if ',' in status:
            base = base.filter(Alert.status.in_(status.split(',')))
        else:
            base = base.filter(Alert.status == status)
    if source:
        base = base.filter(Alert.source == source)
    if src_ip:
        base = base.filter(Alert.src_ip == src_ip)
    if dst_ip:
        base = base.filter(Alert.dst_ip == dst_ip)

    # 时间范围
    start_time, end_time = _time_range_from_request()
    if start_time:
        try:
            base = base.filter(Alert.first_seen >= datetime.fromisoformat(start_time.replace('Z', '+00:00')))
        except Exception:
            pass
    if end_time:
        try:
            base = base.filter(Alert.first_seen <= datetime.fromisoformat(end_time.replace('Z', '+00:00')))
        except Exception:
            pass

    # 排序
    sort_col = getattr(Alert, sort_field, Alert.first_seen)
    base = base.order_by(desc(sort_col) if sort_order == 'desc' else asc(sort_col))

    # 分页
    total = base.count()
    pages = (total + page_size - 1) // page_size if page_size > 0 else 1
    items = base.offset((page - 1) * page_size).limit(page_size).all()

    return jsonify({
        'success': True,
        'data': {
            'items': [_alert_to_response(a) for a in items],
            'total': total,
            'page': page,
            'page_size': page_size,
            'pages': pages,
        },
        'took_ms': 0,
    })


@alerts_api_bp.route('/alerts/search', methods=['GET', 'POST'])
@login_required
def search_alerts():
    """搜索告警（兼容 Graylog 风格）"""
    if request.method == 'POST':
        body = request.get_json() or {}
    else:
        body = request.args.to_dict()

    query_string = body.get('query', '') or body.get('q', '')
    page = int(body.get('page', 1))
    page_size = int(body.get('page_size', 20))

    base = Alert.query
    base = _parse_query_string(query_string, base)

    start_time, end_time = _time_range_from_request()
    if start_time:
        try:
            base = base.filter(Alert.first_seen >= datetime.fromisoformat(start_time.replace('Z', '+00:00')))
        except Exception:
            pass
    if end_time:
        try:
            base = base.filter(Alert.first_seen <= datetime.fromisoformat(end_time.replace('Z', '+00:00')))
        except Exception:
            pass

    total = base.count()
    items = base.order_by(desc(Alert.first_seen)).offset((page - 1) * page_size).limit(page_size).all()

    # 聚合
    aggregations = body.get('aggregations', [])
    agg_result = {}
    if 'date_histogram' in aggregations or 'timeline' in aggregations:
        buckets = db.session.query(
            func.date_trunc('hour', Alert.first_seen).label('bucket'),
            func.count().label('cnt')
        ).group_by('bucket').order_by('bucket').all()
        agg_result['timeline'] = {
            'buckets': [{'key_as_string': str(b.bucket), 'key': b.bucket.isoformat() if b.bucket else '', 'doc_count': b.cnt} for b in buckets]
        }

    return jsonify({
        'success': True,
        'data': {
            'items': [_alert_to_response(a) for a in items],
            'total': total,
            'page': page,
            'page_size': page_size,
            'took_ms': 0,
            'aggregations': agg_result,
        }
    })


# =============================================
# 告警详情
# =============================================

@alerts_api_bp.route('/alerts/<int:alert_id>', methods=['GET'])
@login_required
def get_alert(alert_id):
    a = Alert.query.get(alert_id)
    if not a:
        return jsonify({'success': False, 'error': '告警不存在'}), 404
    return jsonify({'success': True, 'data': _alert_to_response(a)})


# =============================================
# 更新告警
# =============================================

@alerts_api_bp.route('/alerts/<int:alert_id>', methods=['PUT'])
@login_required
def update_alert(alert_id):
    a = Alert.query.get(alert_id)
    if not a:
        return jsonify({'success': False, 'error': '告警不存在'}), 404
    data = request.get_json() or {}
    for key in ('title', 'description', 'severity', 'status', 'source', 'source_product',
                'category', 'src_ip', 'dst_ip', 'src_port', 'dst_port', 'protocol',
                'hostname', 'tags', 'extra_data', 'parsed_data', 'raw_log'):
        if key in data:
            setattr(a, key, data[key])
    a.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'success': True, 'message': '更新成功'})


@alerts_api_bp.route('/alerts/<int:alert_id>/status', methods=['PUT'])
@login_required
def update_alert_status(alert_id):
    a = Alert.query.get(alert_id)
    if not a:
        return jsonify({'success': False, 'error': '告警不存在'}), 404
    data = request.get_json() or {}
    new_status = data.get('status')
    if not new_status:
        return jsonify({'success': False, 'error': '缺少状态参数'}), 400
    a.status = new_status
    a.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'success': True, 'data': {'id': alert_id, 'status': new_status}})


@alerts_api_bp.route('/alerts/batch/status', methods=['PUT'])
@login_required
def batch_update_status():
    data = request.get_json() or {}
    alert_ids = data.get('alert_ids', [])
    new_status = data.get('status')
    if not alert_ids or not new_status:
        return jsonify({'success': False, 'error': '缺少参数'}), 400
    count = Alert.query.filter(Alert.id.in_(alert_ids)).update(
        {'status': new_status, 'updated_at': datetime.utcnow()}, synchronize_session=False)
    db.session.commit()
    return jsonify({'success': True, 'data': {'updated': count, 'total': len(alert_ids)}})


# =============================================
# 删除告警
# =============================================

@alerts_api_bp.route('/alerts/<int:alert_id>', methods=['DELETE'])
@login_required
def delete_alert(alert_id):
    a = Alert.query.get(alert_id)
    if not a:
        return jsonify({'success': False, 'error': '告警不存在'}), 404
    db.session.delete(a)
    db.session.commit()
    return jsonify({'success': True, 'message': '删除成功'})


@alerts_api_bp.route('/alerts/batch', methods=['DELETE'])
@login_required
def batch_delete():
    data = request.get_json() or {}
    alert_ids = data.get('alert_ids', [])
    count = Alert.query.filter(Alert.id.in_(alert_ids)).delete(synchronize_session=False)
    db.session.commit()
    return jsonify({'success': True, 'data': {'deleted': count, 'total': len(alert_ids)}})


# =============================================
# 告警统计
# =============================================

@alerts_api_bp.route('/alerts/stats', methods=['GET'])
@login_required
def get_alert_stats():
    total = Alert.query.count()
    by_severity = dict(db.session.query(Alert.severity, func.count()).group_by(Alert.severity).all())
    by_status = dict(db.session.query(Alert.status, func.count()).group_by(Alert.status).all())
    return jsonify({
        'success': True,
        'data': {
            'total': total,
            'by_severity': by_severity,
            'by_status': by_status,
        }
    })


@alerts_api_bp.route('/alerts/trend', methods=['GET'])
@login_required
def get_alert_trend():
    days = request.args.get('days', 7, type=int)
    since = datetime.utcnow() - timedelta(days=days)
    buckets = db.session.query(
        func.date_trunc('day', Alert.created_at).label('day'),
        func.count().label('cnt')
    ).filter(Alert.created_at >= since).group_by('day').order_by('day').all()
    return jsonify({
        'success': True,
        'data': [{'date': str(b.day)[:10], 'count': b.cnt} for b in buckets]
    })


# =============================================
# Quick Values（字段值分布）
# =============================================

@alerts_api_bp.route('/alerts/quick-values', methods=['GET'])
@login_required
def quick_values():
    field = request.args.get('field', 'severity')
    col = getattr(Alert, field, None)
    if col is None:
        return jsonify({'success': False, 'error': f'字段 {field} 不存在'}), 400

    # 应用时间过滤
    base = Alert.query
    start_time, end_time = _time_range_from_request()
    if start_time:
        try:
            base = base.filter(Alert.first_seen >= datetime.fromisoformat(start_time.replace('Z', '+00:00')))
        except Exception:
            pass
    if end_time:
        try:
            base = base.filter(Alert.first_seen <= datetime.fromisoformat(end_time.replace('Z', '+00:00')))
        except Exception:
            pass

    total = base.count()
    buckets = base.with_entities(col, func.count().label('cnt')).group_by(col).order_by(desc('cnt')).limit(10).all()
    return jsonify({
        'success': True,
        'data': [
            {'key': b[0] or 'N/A', 'count': b[1], 'percentage': round(b[1] / total * 100, 1) if total > 0 else 0}
            for b in buckets
        ]
    })


@alerts_api_bp.route('/alerts/field-stats', methods=['GET'])
@login_required
def field_stats():
    field = request.args.get('field', 'severity')
    col = getattr(Alert, field, None)
    if col is None:
        return jsonify({'success': False, 'error': f'字段 {field} 不存在'}), 400
    total = Alert.query.count()
    distinct = db.session.query(func.count(func.distinct(col))).scalar()
    return jsonify({
        'success': True,
        'data': {'field': field, 'total': total, 'distinct': distinct}
    })


# =============================================
# 聚合生成事件
# =============================================

@alerts_api_bp.route('/alerts/aggregate', methods=['POST'])
@login_required
def aggregate_alerts():
    data = request.get_json() or {}
    alert_ids = data.get('alert_ids', [])
    title = data.get('title', '')
    severity = data.get('severity', 'medium')
    category = data.get('category', '其他')
    description = data.get('description', '')
    mark_status = data.get('mark_status', 'investigating')

    if not alert_ids or not title:
        return jsonify({'success': False, 'error': '缺少参数'}), 400

    # 自动关联相关告警（同一 src_ip 的未处理告警）
    if data.get('include_related'):
        src_ips = set()
        existing_alerts = Alert.query.filter(Alert.id.in_(alert_ids)).all()
        for a in existing_alerts:
            if a.src_ip:
                src_ips.add(a.src_ip)
        if src_ips:
            related = Alert.query.filter(
                Alert.src_ip.in_(list(src_ips)),
                Alert.status.in_(['new', 'investigating']),
                Alert.id.notin_(alert_ids)
            ).limit(50).all()
            for r in related:
                if str(r.id) not in [str(x) for x in alert_ids]:
                    alert_ids.append(r.id)

    event_code = f"EVT-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    event = Event(
        event_code=event_code,
        title=title,
        description=description,
        severity=severity,
        status='open',
        category=category,
        extra_data={'alert_ids': alert_ids, 'include_related': data.get('include_related', False)},
    )
    db.session.add(event)
    db.session.flush()

    # 更新关联告警状态
    if mark_status:
        count = Alert.query.filter(Alert.id.in_(alert_ids)).update(
            {'status': mark_status, 'updated_at': datetime.utcnow()},
            synchronize_session=False
        )
    else:
        count = len(alert_ids)

    db.session.commit()

    return jsonify({
        'success': True,
        'data': {
            'id': event.id,
            'event_code': event_code,
            'alerts_count': count,
        }
    })


# =============================================
# 导出告警
# =============================================

@alerts_api_bp.route('/alerts/export', methods=['GET'])
@login_required
def export_alerts():
    import csv
    import io
    from flask import Response

    base = Alert.query
    severity = request.args.get('severity')
    status = request.args.get('status')
    if severity:
        base = base.filter(Alert.severity == severity)
    if status:
        base = base.filter(Alert.status == status)

    items = base.order_by(desc(Alert.first_seen)).limit(10000).all()
    output_format = request.args.get('format', 'csv')

    if output_format == 'json':
        return jsonify({'success': True, 'data': [_alert_to_response(a) for a in items]})

    si = io.StringIO()
    fields = ['id', 'title', 'severity', 'status', 'source', 'src_ip', 'dst_ip',
              'category', 'first_seen', 'last_seen', 'description']
    writer = csv.DictWriter(si, fieldnames=fields, extrasaction='ignore')
    writer.writeheader()
    for a in items:
        writer.writerow(_alert_to_response(a))

    return Response(
        si.getvalue(), mimetype='text/csv',
        headers={'Content-Disposition': f'attachment; filename=alerts_export.csv',
                 'Content-Type': 'text/csv; charset=utf-8-sig'})


# =============================================
# ES 健康检查（改为 PG 健康检查）
# =============================================

@alerts_api_bp.route('/alerts/es-health', methods=['GET'])
@login_required
def es_health():
    try:
        db.session.execute(db.text('SELECT 1'))
        return jsonify({
            'success': True,
            'data': {'connected': True, 'version': 'PostgreSQL', 'cluster': 'pg'}
        })
    except Exception as e:
        return jsonify({'success': True, 'data': {'connected': False, 'error': str(e)}})


# =============================================
# 邻接消息查询
# =============================================

@alerts_api_bp.route('/alerts/<int:alert_id>/related', methods=['GET'])
@login_required
def related_alerts(alert_id):
    a = Alert.query.get(alert_id)
    if not a:
        return jsonify({'success': True, 'data': []})

    limit = request.args.get('limit', 20, type=int)
    conditions = []

    # 同源IP（不同告警）
    if a.src_ip:
        conditions.append(and_(Alert.src_ip == a.src_ip, Alert.id != a.id))
    # 同目标IP
    if a.dst_ip:
        conditions.append(and_(Alert.dst_ip == a.dst_ip, Alert.id != a.id))
    # 同主机名
    if a.hostname:
        conditions.append(and_(Alert.hostname == a.hostname, Alert.id != a.id))
    # 同安全产品 + 同分类
    if a.source_product and a.category:
        conditions.append(and_(Alert.source_product == a.source_product, Alert.category == a.category, Alert.id != a.id))

    if not conditions:
        return jsonify({'success': True, 'data': []})

    related = Alert.query.filter(or_(*conditions)).order_by(desc(Alert.first_seen)).limit(limit).all()
    return jsonify({'success': True, 'data': [_alert_to_response(r) for r in related]})


# =============================================
# Saved Search CRUD（简化：内存存储）
# =============================================

_saved_searches: dict[int, dict] = []
_ss_counter = [0]


@alerts_api_bp.route('/alerts/saved-searches', methods=['GET'])
@login_required
def list_saved_searches():
    return jsonify({'success': True, 'data': _saved_searches})


@alerts_api_bp.route('/alerts/saved-searches', methods=['POST'])
@login_required
def create_saved_search_endpoint():
    data = request.get_json() or {}
    if not data.get('title'):
        return jsonify({'success': False, 'error': '缺少搜索名称'}), 400
    _ss_counter[0] += 1
    entry = {
        'id': str(_ss_counter[0]),
        'title': data['title'],
        'query_string': data.get('query_string', ''),
        'query': data.get('query', ''),
        'created_at': datetime.utcnow().isoformat(),
    }
    _saved_searches.append(entry)
    return jsonify({'success': True, 'data': {'id': entry['id']}}), 201


@alerts_api_bp.route('/alerts/saved-searches/<search_id>', methods=['DELETE'])
@login_required
def delete_saved_search(search_id):
    global _saved_searches
    _saved_searches = [s for s in _saved_searches if s['id'] != search_id]
    return jsonify({'success': True})


# =============================================
# Streams CRUD（兼容旧前端，返回空）
# =============================================

@alerts_api_bp.route('/alerts/streams', methods=['GET'])
@login_required
def list_streams():
    return jsonify({'success': True, 'data': []})


@alerts_api_bp.route('/alerts/streams', methods=['POST'])
@login_required
def create_stream_endpoint():
    return jsonify({'success': False, 'error': 'Streams 功能已移除'}), 410


@alerts_api_bp.route('/alerts/streams/<stream_id>', methods=['GET'])
@login_required
def get_stream(stream_id):
    return jsonify({'success': False, 'error': 'Stream 不存在'}), 404


@alerts_api_bp.route('/alerts/streams/<stream_id>', methods=['PUT'])
@login_required
def update_stream(stream_id):
    return jsonify({'success': False, 'error': 'Streams 功能已移除'}), 410


@alerts_api_bp.route('/alerts/streams/<stream_id>', methods=['DELETE'])
@login_required
def delete_stream(stream_id):
    return jsonify({'success': False, 'error': 'Streams 功能已移除'}), 410


# =============================================
# 初始化（兼容旧前端）
# =============================================

@alerts_api_bp.route('/alerts/init-hypertable', methods=['POST'])
@login_required
def init_es_index():
    return jsonify({'success': True, 'message': 'PostgreSQL 模式，无需初始化'})
