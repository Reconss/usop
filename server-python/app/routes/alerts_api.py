"""
安全告警 API —— Elasticsearch 版本（valid 索引为唯一数据源）

数据来源：ES `alerts-valid`（由流水线存储任务写入；被过滤/重复的告警在
`alerts-invalid` 隔离）。告警不再写 PostgreSQL。前端 API 签名保持不变，
唯一变化是告警 id 由整型变成字符串（ES 文档 _id = alert_id）。

检索能力由 app/utils/es_alerts.py 提供：
  - query_string 语法检索（severity:critical AND (status:new OR status:investigating)）
  - 结构化筛选（severity/status/source/src_ip/dst_ip/时间范围）
  - 聚合（quick-values / field-stats / date histogram / stats / trend）
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import Event, SystemConfig
from app.utils import es_alerts, event_enrichment
from datetime import datetime
import logging
import json

logger = logging.getLogger(__name__)

alerts_api_bp = Blueprint('alerts_api', __name__)

# 告警 id 允许的字符（ES 文档 _id：ALT-xxxx / 历史编号等）
import re as _re
_ALERT_ID_RE = _re.compile(r'^[A-Za-z0-9._:-]{1,160}$')


# =============================================
# 辅助函数
# =============================================

def _time_range_from_request():
    start = request.args.get('start_time') or request.args.get('start')
    end = request.args.get('end_time') or request.args.get('end')
    return start, end


def _int_arg(name, default, minimum=0):
    try:
        return max(minimum, int(request.args.get(name, default)))
    except (TypeError, ValueError):
        return default


def _filters_from_args():
    """传统筛选参数 → ES filter dict。"""
    f = {}
    severity = request.args.get('severity')
    status = request.args.get('status')
    source = request.args.get('source')
    src_ip = request.args.get('src_ip')
    dst_ip = request.args.get('dst_ip')
    source_product = request.args.get('source_product')
    hostname = request.args.get('hostname')

    if severity:
        f['severity'] = severity.split(',') if ',' in severity else severity
    if status:
        f['status'] = status.split(',') if ',' in status else status
    if source:
        f['source'] = source
    if source_product:
        f['source_product'] = source_product
    if hostname:
        f['hostname'] = hostname
    if src_ip:
        f['src_ip'] = src_ip
    if dst_ip:
        f['dst_ip'] = dst_ip
    return f


def _alert_or_404(alert_id):
    """取单条告警（不存在返回 (None, 响应)）。"""
    if not _ALERT_ID_RE.match(str(alert_id or '')):
        return None, (jsonify({'success': False, 'error': '告警 ID 不合法'}), 400)
    doc = es_alerts.get_alert(alert_id)
    if not doc:
        return None, (jsonify({'success': False, 'error': '告警不存在'}), 404)
    return doc, None


# =============================================
# 告警列表
# =============================================

@alerts_api_bp.route('/alerts', methods=['GET'])
@login_required
def get_alerts():
    """告警列表（ES alerts-valid，支持 query_string + 结构化筛选 + 分页）。"""
    page = _int_arg('page', 1, 1)
    page_size = _int_arg('page_size', 20, 0) or 20
    sort_field = request.args.get('sort_field', 'first_seen')
    sort_order = request.args.get('sort_order', 'desc')
    query_string = request.args.get('query', '') or request.args.get('search', '')
    start_time, end_time = _time_range_from_request()

    res = es_alerts.search_alerts(
        query_string=query_string, filters=_filters_from_args(),
        start=start_time, end=end_time, page=page, page_size=page_size,
        sort_field=sort_field, sort_order=sort_order)

    return jsonify({
        'success': True,
        'data': {
            'items': res['items'],
            'total': res['total'],
            'page': res['page'],
            'page_size': res['page_size'],
            'pages': res['pages'],
        },
        'took_ms': res['took_ms'],
    })


@alerts_api_bp.route('/alerts/search', methods=['GET', 'POST'])
@login_required
def search_alerts():
    """搜索告警（兼容 Graylog 风格 query_string + 可选聚合）。"""
    if request.method == 'POST':
        body = request.get_json() or {}
    else:
        body = request.args.to_dict()
        if request.args.getlist('aggregations'):
            body['aggregations'] = request.args.getlist('aggregations')

    query_string = body.get('query', '') or body.get('q', '')
    try:
        page = max(1, int(body.get('page', 1) or 1))
        page_size = max(0, int(body.get('page_size', 20) or 0))
    except (TypeError, ValueError):
        page, page_size = 1, 20

    start_time, end_time = _time_range_from_request()
    filters = _filters_from_args()

    res = es_alerts.search_alerts(
        query_string=query_string, filters=filters, start=start_time, end=end_time,
        page=page, page_size=page_size)

    aggregations = body.get('aggregations') or []
    if isinstance(aggregations, str):
        aggregations = [aggregations]
    agg_result = {}
    if 'date_histogram' in aggregations or 'timeline' in aggregations:
        hist = es_alerts.histogram(
            query_string=query_string, filters=filters, start=start_time, end=end_time,
            interval=body.get('histogram_interval') or 'auto')
        agg_result['timeline'] = {'buckets': hist.get('buckets', [])}
        agg_result['date_histogram'] = {'buckets': hist.get('buckets', [])}
    if 'quick_values' in aggregations:
        agg_result['quick_values'] = es_alerts.quick_values(
            field=body.get('agg_field') or 'severity', query_string=query_string,
            filters=filters, start=start_time, end=end_time)

    return jsonify({
        'success': True,
        'data': {
            'items': res['items'],
            'total': res['total'],
            'page': res['page'],
            'page_size': res['page_size'],
            'took_ms': res['took_ms'],
            'aggregations': agg_result,
        }
    })


# =============================================
# 告警详情
# =============================================

@alerts_api_bp.route('/alerts/<alert_id>', methods=['GET'])
@login_required
def get_alert(alert_id):
    if alert_id in ('stats', 'trend', 'quick-values', 'field-stats', 'export',
                    'es-health', 'search', 'batch', 'aggregate', 'streams',
                    'saved-searches', 'init-hypertable'):
        return jsonify({'success': False, 'error': '未知端点'}), 404
    doc, err = _alert_or_404(alert_id)
    if err:
        return err
    return jsonify({'success': True, 'data': doc})


# =============================================
# 更新告警
# =============================================

@alerts_api_bp.route('/alerts/<alert_id>', methods=['PUT'])
@login_required
def update_alert(alert_id):
    doc, err = _alert_or_404(alert_id)
    if err:
        return err
    data = request.get_json() or {}
    allowed = ('title', 'description', 'severity', 'status', 'source', 'source_product',
               'category', 'src_ip', 'dst_ip', 'src_port', 'dst_port', 'protocol',
               'hostname', 'tags', 'extra_data', 'parsed_data', 'raw_log',
               'assigned_to', 'event_ids')
    fields = {k: data[k] for k in allowed if k in data}
    if not fields:
        return jsonify({'success': False, 'error': '没有可更新的字段'}), 400
    ok = es_alerts.update_alert(alert_id, fields, index=doc.get('_index'))
    if not ok:
        return jsonify({'success': False, 'error': 'ES 更新失败'}), 500
    return jsonify({'success': True, 'message': '更新成功'})


@alerts_api_bp.route('/alerts/<alert_id>/status', methods=['PUT'])
@login_required
def update_alert_status(alert_id):
    doc, err = _alert_or_404(alert_id)
    if err:
        return err
    new_status = (request.get_json() or {}).get('status')
    if not new_status:
        return jsonify({'success': False, 'error': '缺少状态参数'}), 400
    ok = es_alerts.set_status(alert_id, new_status, index=doc.get('_index'))
    if not ok:
        return jsonify({'success': False, 'error': 'ES 更新失败'}), 500
    return jsonify({'success': True, 'data': {'id': alert_id, 'status': new_status}})


@alerts_api_bp.route('/alerts/batch/status', methods=['PUT'])
@login_required
def batch_update_status():
    data = request.get_json() or {}
    alert_ids = data.get('alert_ids', [])
    new_status = data.get('status')
    if not alert_ids or not new_status:
        return jsonify({'success': False, 'error': '缺少参数'}), 400
    count = es_alerts.bulk_set_status([str(a) for a in alert_ids], new_status)
    return jsonify({'success': True,
                    'data': {'updated': count, 'total': len(alert_ids)}})


# =============================================
# 删除告警
# =============================================

@alerts_api_bp.route('/alerts/<alert_id>', methods=['DELETE'])
@login_required
def delete_alert(alert_id):
    doc, err = _alert_or_404(alert_id)
    if err:
        return err
    ok = es_alerts.delete_alert(alert_id, index=doc.get('_index'))
    if not ok:
        return jsonify({'success': False, 'error': 'ES 删除失败'}), 500
    return jsonify({'success': True, 'message': '删除成功'})


@alerts_api_bp.route('/alerts/batch', methods=['DELETE'])
@login_required
def batch_delete():
    data = request.get_json() or {}
    alert_ids = data.get('alert_ids', [])
    if not alert_ids:
        return jsonify({'success': False, 'error': '缺少 alert_ids'}), 400
    count = es_alerts.bulk_delete([str(a) for a in alert_ids])
    return jsonify({'success': True,
                    'data': {'deleted': count, 'total': len(alert_ids)}})


# =============================================
# 告警统计
# =============================================

@alerts_api_bp.route('/alerts/stats', methods=['GET'])
@login_required
def get_alert_stats():
    start_time, end_time = _time_range_from_request()
    stats = es_alerts.get_stats(start=start_time, end=end_time)
    return jsonify({
        'success': True,
        'data': {
            'total': stats['total'],
            'by_severity': stats['by_severity'],
            'by_status': stats['by_status'],
        }
    })


@alerts_api_bp.route('/alerts/trend', methods=['GET'])
@login_required
def get_alert_trend():
    days = _int_arg('days', 7, 1)
    return jsonify({'success': True, 'data': es_alerts.get_trend(days=days)})


# =============================================
# Quick Values（字段值分布）
# =============================================

@alerts_api_bp.route('/alerts/quick-values', methods=['GET'])
@login_required
def quick_values():
    field = request.args.get('field', 'severity')
    start_time, end_time = _time_range_from_request()
    query_string = request.args.get('query', '') or request.args.get('q', '')
    res = es_alerts.quick_values(field=field, query_string=query_string,
                                 start=start_time, end=end_time)
    if res.get('error'):
        return jsonify({'success': False, 'error': f'聚合失败: {res["error"]}'}), 400
    data = [{'key': b['key'] if b['key'] not in (None, '') else 'N/A',
             'count': b['count'], 'percentage': b['percentage']}
            for b in res['buckets']]
    return jsonify({'success': True, 'data': data})


@alerts_api_bp.route('/alerts/field-stats', methods=['GET'])
@login_required
def field_stats():
    field = request.args.get('field', 'severity')
    start_time, end_time = _time_range_from_request()
    res = es_alerts.field_stats(field=field, start=start_time, end=end_time)
    if res.get('error'):
        return jsonify({'success': False, 'error': f'统计失败: {res["error"]}'}), 400
    return jsonify({'success': True, 'data': res})


# =============================================
# 聚合生成事件（事件仍持久化在 PostgreSQL）
# =============================================

@alerts_api_bp.route('/alerts/aggregate', methods=['POST'])
@login_required
def aggregate_alerts():
    data = request.get_json() or {}
    alert_ids = [str(a) for a in (data.get('alert_ids') or [])]
    title = data.get('title', '')
    severity = data.get('severity', 'medium')
    category = data.get('category', '其他')
    description = data.get('description', '')
    mark_status = data.get('mark_status', 'investigating')

    if not alert_ids or not title:
        return jsonify({'success': False, 'error': '缺少参数'}), 400

    # 自动关联相关告警（同一 src_ip 的未处理告警）
    alert_docs = {}
    for aid in alert_ids:
        doc = es_alerts.get_alert(aid)
        if doc:
            alert_docs[aid] = doc
    if data.get('include_related'):
        src_ips = {doc.get('src_ip') for doc in alert_docs.values() if doc.get('src_ip')}
        if src_ips:
            related = es_alerts.search_alerts(
                filters={'src_ip': sorted(src_ips), 'status': ['new', 'investigating']},
                page=1, page_size=50)
            for r in related['items']:
                rid = str(r['id'])
                if rid not in alert_ids:
                    alert_ids.append(rid)
                    alert_docs[rid] = r

    # 关联告警详情 + 统计摘要 + 主责源 IP + 自动描述（统一走事件富化工具）
    content = event_enrichment.build_event_content(
        alert_docs, origin='人工聚合', user_description=description)

    event_code = f"EVT-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    event = Event(
        event_code=event_code,
        title=title,
        description=content['description'],
        severity=severity,
        src_ip=content['src_ip'] or None,
        source='alert_aggregate',
        # 事件状态机合法状态（events_api.STATUS_TRANSITIONS）：关联告警默认已转
        # investigating，事件直接落在「调查中」，避免使用非法的 'open' 标识
        status='investigating',
        category=category,
        extra_data={'alert_ids': alert_ids,
                    'related_alerts': content['related_alerts'],
                    'summary': content['summary'],
                    'alert_count': len(alert_ids),
                    'include_related': data.get('include_related', False)},
    )
    db.session.add(event)
    db.session.flush()
    event_id = event.id
    # 对比资源管理 IT 资源（IP 黑白名单）给事件打标签
    from app.utils import event_ip_tags
    event_ip_tags.enrich_event_ip_tags(event)
    db.session.commit()

    # 统一联动：告警状态置 mark_status + event_ids 回写（事件处置完成时
    # 告警会随事件状态自动闭环，见 event_alert_link）
    count = 0
    if mark_status:
        try:
            from app.utils import event_alert_link
            link = event_alert_link.link_alerts_to_event(
                alert_ids, event_code, mark_status)
            count = link.get('linked', 0)
        except Exception:
            count = es_alerts.bulk_set_status(alert_ids, mark_status)
    else:
        count = len(alert_ids)

    return jsonify({
        'success': True,
        'data': {'id': event_id, 'event_code': event_code, 'alerts_count': count}
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

    start_time, end_time = _time_range_from_request()
    items = es_alerts.search_all(
        query_string=request.args.get('query', '') or request.args.get('search', ''),
        filters=_filters_from_args(), start=start_time, end=end_time,
        limit=_int_arg('limit', 10000, 1))
    output_format = request.args.get('format', 'csv')

    if output_format == 'json':
        return jsonify({'success': True, 'data': items})

    fields = ['id', 'alert_code', 'title', 'severity', 'status', 'source', 'src_ip',
              'dst_ip', 'category', 'first_seen', 'last_seen', 'description']
    si = io.StringIO()
    writer = csv.DictWriter(si, fieldnames=fields, extrasaction='ignore')
    writer.writeheader()
    for a in items:
        writer.writerow({k: a.get(k, '') for k in fields})

    return Response(
        si.getvalue(), mimetype='text/csv',
        headers={'Content-Disposition': 'attachment; filename=alerts_export.csv',
                 'Content-Type': 'text/csv; charset=utf-8-sig'})


# =============================================
# ES 健康检查
# =============================================

@alerts_api_bp.route('/alerts/es-health', methods=['GET'])
@login_required
def es_health():
    try:
        es = es_alerts.client()
        info = es.info()
        return jsonify({
            'success': True,
            'data': {
                'connected': True,
                'version': (info.get('version') or {}).get('number'),
                'cluster': info.get('cluster_name'),
                'index': es_alerts.INDEX_VALID,
                'docs': es_alerts.count(es_alerts.INDEX_VALID),
            }
        })
    except Exception as e:
        return jsonify({'success': True, 'data': {'connected': False, 'error': str(e)}})


# =============================================
# 邻接消息查询
# =============================================

@alerts_api_bp.route('/alerts/<alert_id>/related', methods=['GET'])
@login_required
def related_alerts(alert_id):
    limit = _int_arg('limit', 20, 1)
    return jsonify({'success': True, 'data': es_alerts.related_alerts(alert_id, limit=limit)})


# =============================================
# Saved Search CRUD（持久化到 system_config，按用户隔离）
# =============================================

_saved_searches: dict[int, dict] = []  # 兼容旧进程内存数据（重启即弃）
_ss_counter = [0]


def _ss_config_key(user_id) -> str:
    return f'alert_saved_searches_{user_id}'


def _ss_normalize_query(data: dict) -> str:
    """query 字段统一归一化为字符串（前端可能传字符串或 {query_string} 对象）"""
    q = data.get('query_string')
    if isinstance(q, str) and q:
        return q
    q = data.get('query')
    if isinstance(q, dict):
        return q.get('query_string') or ''
    return q if isinstance(q, str) else ''


def _ss_load(user_id) -> list:
    """加载当前用户的已保存搜索（system_config 持久化，无则空）"""
    try:
        cfg = SystemConfig.query.filter_by(key=_ss_config_key(user_id)).first()
        if cfg and cfg.value:
            rows = json.loads(cfg.value)
            if isinstance(rows, list):
                return rows
    except Exception as e:
        logger.warning(f'load saved searches failed: {e}')
    return []


def _ss_save(user_id, rows: list):
    cfg = SystemConfig.query.filter_by(key=_ss_config_key(user_id)).first()
    if cfg:
        cfg.value = json.dumps(rows, ensure_ascii=False)
    else:
        cfg = SystemConfig(key=_ss_config_key(user_id),
                          value=json.dumps(rows, ensure_ascii=False),
                          category='alerts')
        db.session.add(cfg)
    db.session.commit()


@alerts_api_bp.route('/alerts/saved-searches', methods=['GET'])
@login_required
def list_saved_searches():
    rows = _ss_load(request.current_user['user_id'])
    return jsonify({'success': True, 'data': rows})


@alerts_api_bp.route('/alerts/saved-searches', methods=['POST'])
@login_required
def create_saved_search_endpoint():
    data = request.get_json() or {}
    if not data.get('title'):
        return jsonify({'success': False, 'error': '缺少搜索名称'}), 400
    user_id = request.current_user['user_id']
    rows = _ss_load(user_id)
    new_id = max([int(r.get('id') or 0) for r in rows] + [_ss_counter[0]]) + 1
    _ss_counter[0] = new_id
    entry = {
        'id': str(new_id),
        'title': data['title'],
        'query': _ss_normalize_query(data),
        'query_string': _ss_normalize_query(data),
        'created_at': datetime.utcnow().isoformat(),
    }
    rows.append(entry)
    _ss_save(user_id, rows)
    return jsonify({'success': True, 'data': {'id': entry['id']}}), 201


@alerts_api_bp.route('/alerts/saved-searches/<search_id>', methods=['DELETE'])
@login_required
def delete_saved_search(search_id):
    user_id = request.current_user['user_id']
    rows = _ss_load(user_id)
    remaining = [s for s in rows if str(s.get('id')) != str(search_id)]
    if len(rows) == len(remaining):
        return jsonify({'success': False, 'error': '不存在'}), 404
    _ss_save(user_id, remaining)
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
    ok = es_alerts.ensure_indices()
    return jsonify({'success': True,
                    'message': 'Elasticsearch 模式：索引已确保存在' if ok else '索引初始化失败'})
