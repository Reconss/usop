"""
安全告警 API 路由 - 使用 TimescaleDB
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import Event, AuditLog
from app.timescaledb import (
    get_tsdb,
    create_alerts_hypertable,
    query_alerts,
    insert_alert,
    update_alert_status as tsdb_update_alert_status,
    get_alert_stats,
    aggregate_alerts,
    get_alert_trend
)
from datetime import datetime

alerts_api_bp = Blueprint('alerts_api', __name__)


@alerts_api_bp.route('/alerts', methods=['GET'])
@login_required
def get_alerts():
    """获取告警列表"""
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 20, type=int)
    severity = request.args.get('severity')
    status = request.args.get('status')
    search = request.args.get('search')
    start_time = request.args.get('start_time')
    end_time = request.args.get('end_time')
    source = request.args.get('source')
    src_ip = request.args.get('src_ip')
    dst_ip = request.args.get('dst_ip')

    tsdb = get_tsdb()
    session = tsdb.get_session()

    try:
        # 确保 hypertable 存在
        create_alerts_hypertable(session)

        # 计算分页偏移
        offset = (page - 1) * page_size

        # 查询告警
        result = query_alerts(
            session=session,
            start_time=start_time,
            end_time=end_time,
            severity=severity,
            status=status,
            source=source,
            src_ip=src_ip,
            dst_ip=dst_ip,
            search=search,
            limit=page_size,
            offset=offset
        )

        return jsonify({
            'success': True,
            'data': {
                'items': result['items'],
                'total': result['total'],
                'page': page,
                'page_size': page_size,
                'pages': (result['total'] + page_size - 1) // page_size
            }
        })
    finally:
        tsdb.close_session(session)


@alerts_api_bp.route('/alerts/<alert_id>', methods=['GET'])
@login_required
def get_alert(alert_id):
    """获取告警详情"""
    tsdb = get_tsdb()
    session = tsdb.get_session()

    try:
        from sqlalchemy import text

        if alert_id.isdigit():
            query = text("SELECT * FROM alerts WHERE id = :id")
        else:
            query = text("SELECT * FROM alerts WHERE alert_code = :id")

        result = session.execute(query, {'id': alert_id})
        row = result.fetchone()

        if not row:
            return jsonify({'success': False, 'error': '告警不存在'}), 404

        alert = dict(row._mapping)

        return jsonify({
            'success': True,
            'data': alert
        })
    finally:
        tsdb.close_session(session)


@alerts_api_bp.route('/alerts/<alert_id>/status', methods=['PUT'])
@login_required
def update_alert_status(alert_id):
    """更新告警状态"""
    data = request.get_json()
    new_status = data.get('status')

    if not new_status:
        return jsonify({'success': False, 'error': '缺少状态参数'}), 400

    tsdb = get_tsdb()
    session = tsdb.get_session()

    try:
        # 查找告警
        from sqlalchemy import text

        if alert_id.isdigit():
            query = text("SELECT id FROM alerts WHERE id = :id")
        else:
            query = text("SELECT id FROM alerts WHERE alert_code = :id")

        result = session.execute(query, {'id': alert_id})
        row = result.fetchone()

        if not row:
            return jsonify({'success': False, 'error': '告警不存在'}), 404

        alert_row_id = row._mapping['id'] if hasattr(row, '_mapping') else row[0]

        # 更新状态
        success = tsdb_update_alert_status(session, alert_row_id, new_status)

        if not success:
            return jsonify({'success': False, 'error': '更新失败'}), 500

        # 记录审计日志
        audit = AuditLog(
            user_id=getattr(request, 'user_id', 1),
            username=getattr(request, 'username', 'system'),
            action='更新告警状态',
            module='alerts',
            target=alert_id,
            details={'status': new_status},
            ip=request.remote_addr
        )
        db.session.add(audit)
        db.session.commit()

        return jsonify({
            'success': True,
            'data': {'id': alert_row_id, 'status': new_status}
        })
    finally:
        tsdb.close_session(session)


@alerts_api_bp.route('/alerts/batch/status', methods=['PUT'])
@login_required
def batch_update_status():
    """批量更新告警状态"""
    data = request.get_json()
    alert_ids = data.get('alert_ids', [])
    new_status = data.get('status')

    if not alert_ids or not new_status:
        return jsonify({'success': False, 'error': '缺少必要参数'}), 400

    tsdb = get_tsdb()
    session = tsdb.get_session()

    try:
        from sqlalchemy import text

        # 批量更新
        query = text("""
            UPDATE alerts
            SET status = :status, updated_at = NOW()
            WHERE id = ANY(:alert_ids)
        """)

        result = session.execute(query, {
            'status': new_status,
            'alert_ids': alert_ids
        })
        session.commit()

        return jsonify({
            'success': True,
            'data': {
                'updated_count': result.rowcount
            }
        })
    finally:
        tsdb.close_session(session)


@alerts_api_bp.route('/alerts/<alert_id>', methods=['DELETE'])
@login_required
def delete_alert(alert_id):
    """删除告警"""
    tsdb = get_tsdb()
    session = tsdb.get_session()

    try:
        from sqlalchemy import text

        if alert_id.isdigit():
            query = text("DELETE FROM alerts WHERE id = :id RETURNING id")
        else:
            query = text("DELETE FROM alerts WHERE alert_code = :id RETURNING id")

        result = session.execute(query, {'id': alert_id})
        deleted = result.fetchone()
        session.commit()

        if not deleted:
            return jsonify({'success': False, 'error': '告警不存在'}), 404

        return jsonify({
            'success': True,
            'message': '告警已删除'
        })
    finally:
        tsdb.close_session(session)


@alerts_api_bp.route('/alerts/batch', methods=['DELETE'])
@login_required
def batch_delete():
    """批量删除告警"""
    data = request.get_json()
    alert_ids = data.get('alert_ids', [])

    if not alert_ids:
        return jsonify({'success': False, 'error': '缺少告警ID列表'}), 400

    tsdb = get_tsdb()
    session = tsdb.get_session()

    try:
        from sqlalchemy import text

        query = text("DELETE FROM alerts WHERE id = ANY(:alert_ids)")
        result = session.execute(query, {'alert_ids': alert_ids})
        session.commit()

        return jsonify({
            'success': True,
            'data': {
                'deleted_count': result.rowcount
            }
        })
    finally:
        tsdb.close_session(session)


@alerts_api_bp.route('/alerts/stats', methods=['GET'])
@login_required
def get_stats():
    """获取告警统计"""
    start_time = request.args.get('start_time')
    end_time = request.args.get('end_time')

    tsdb = get_tsdb()
    session = tsdb.get_session()

    try:
        stats = get_alert_stats(session, start_time, end_time)

        return jsonify({
            'success': True,
            'data': stats
        })
    finally:
        tsdb.close_session(session)


@alerts_api_bp.route('/alerts/trend', methods=['GET'])
@login_required
def get_trend():
    """获取告警趋势"""
    bucket = request.args.get('bucket', '1 hour')
    start_time = request.args.get('start_time')
    end_time = request.args.get('end_time')

    tsdb = get_tsdb()
    session = tsdb.get_session()

    try:
        trend = get_alert_trend(session, bucket, start_time, end_time)

        return jsonify({
            'success': True,
            'data': trend
        })
    finally:
        tsdb.close_session(session)


@alerts_api_bp.route('/alerts/export', methods=['GET'])
@login_required
def export_alerts():
    """导出告警"""
    severity = request.args.get('severity')
    status = request.args.get('status')
    start_time = request.args.get('start_time')
    end_time = request.args.get('end_time')

    tsdb = get_tsdb()
    session = tsdb.get_session()

    try:
        result = query_alerts(
            session=session,
            start_time=start_time,
            end_time=end_time,
            severity=severity,
            status=status,
            limit=10000,
            offset=0
        )

        export_data = [{
            'alert_code': a.get('alert_code'),
            'title': a.get('title'),
            'severity': a.get('severity'),
            'status': a.get('status'),
            'source': a.get('source'),
            'first_seen': a.get('first_seen'),
            'last_seen': a.get('last_seen')
        } for a in result['items']]

        return jsonify({
            'success': True,
            'data': export_data
        })
    finally:
        tsdb.close_session(session)


@alerts_api_bp.route('/alerts', methods=['POST'])
@login_required
def create_alert():
    """创建告警"""
    data = request.get_json()

    if not data:
        return jsonify({'success': False, 'error': '请求数据不能为空'}), 400

    title = data.get('title')
    if not title:
        return jsonify({'success': False, 'error': '告警标题不能为空'}), 400

    tsdb = get_tsdb()
    session = tsdb.get_session()

    try:
        # 生成告警编号
        year = datetime.utcnow().year
        from sqlalchemy import text

        last_query = text("""
            SELECT alert_code FROM alerts
            WHERE alert_code LIKE :pattern
            ORDER BY id DESC LIMIT 1
        """)
        last_result = session.execute(last_query, {'pattern': f'ALERT-{year}-%'})
        last_row = last_result.fetchone()

        if last_row:
            # Row 对象需要转换为字典
            row_dict = dict(last_row._mapping) if hasattr(last_row, '_mapping') else {'alert_code': last_row[0]}
            last_num = int(row_dict['alert_code'].split('-')[-1])
            new_num = last_num + 1
        else:
            new_num = 1

        alert_code = f"ALERT-{year}-{new_num:04d}"

        # 准备告警数据
        now = datetime.utcnow()
        alert_data = {
            'alert_code': alert_code,
            'title': data.get('title', ''),
            'description': data.get('description', ''),
            'severity': data.get('severity', 'medium'),
            'status': data.get('status', 'new'),
            'source': data.get('source', 'manual'),
            'source_product': data.get('source_product'),
            'source_type': data.get('source_type'),
            'category': data.get('category'),
            'confidence': data.get('confidence', 100.0),
            'src_ip': data.get('src_ip'),
            'src_port': data.get('src_port'),
            'dst_ip': data.get('dst_ip'),
            'dst_port': data.get('dst_port'),
            'protocol': data.get('protocol'),
            'asset_id': data.get('asset_id'),
            'asset_name': data.get('asset_name'),
            'hostname': data.get('hostname'),
            'affected_assets': data.get('affected_assets', []),
            'raw_log': data.get('raw_log'),
            'parsed_data': data.get('parsed_data', {}),
            'extra_data': data.get('extra_data', {}),
            'first_seen': data.get('first_seen', now),
            'last_seen': data.get('last_seen', now),
            'tags': data.get('tags', [])
        }

        alert_id = insert_alert(session, alert_data)

        return jsonify({
            'success': True,
            'data': {
                'id': alert_id,
                'alert_code': alert_code,
                **alert_data
            }
        }), 201
    finally:
        tsdb.close_session(session)


@alerts_api_bp.route('/alerts/aggregate', methods=['POST'])
@login_required
def aggregate_alerts_endpoint():
    """聚合告警生成事件"""
    data = request.get_json()

    alert_ids = data.get('alert_ids', [])
    title = data.get('title')
    severity = data.get('severity')
    category = data.get('category', '其他')
    description = data.get('description', '')

    if not alert_ids:
        return jsonify({'success': False, 'error': '缺少告警ID列表'}), 400

    if not title:
        return jsonify({'success': False, 'error': '缺少事件标题'}), 400

    # 转为整数ID
    try:
        int_ids = [int(i) for i in alert_ids]
    except (ValueError, TypeError):
        int_ids = alert_ids

    tsdb = get_tsdb()
    session = tsdb.get_session()

    try:
        # 聚合告警信息
        agg_result = aggregate_alerts(session, int_ids, title, severity, description)

        if not agg_result:
            return jsonify({'success': False, 'error': '未找到指定的告警'}), 404

        # 生成事件编号
        year = datetime.utcnow().year
        today = datetime.utcnow().date()
        last_event = Event.query.filter(
            Event.event_code.like(f'EVT-{year}%')
        ).order_by(Event.id.desc()).first()

        if last_event:
            last_num = int(last_event.event_code.split('-')[-1])
            new_num = last_num + 1
        else:
            new_num = 1

        event_code = f"EVT-{year}{today.strftime('%m%d')}-{new_num:03d}"

        # 创建事件
        event = Event(
            event_code=event_code,
            title=title,
            description=description or f"聚合了 {len(alert_ids)} 条告警",
            severity=agg_result['severity'],
            category=category,
            status='new',
            source='aggregation',
            raw_log=f"来源: {', '.join(agg_result['sources'])}",
            extra_data={
                'aggregated_alerts': [a.get('alert_code') for a in agg_result['alerts']],
                'aggregated_count': len(alert_ids),
                'src_ips': agg_result['src_ips'],
                'dst_ips': agg_result['dst_ips'],
                'first_seen': str(agg_result['first_seen']),
                'last_seen': str(agg_result['last_seen'])
            }
        )

        db.session.add(event)
        db.session.flush()

        # 更新 TimescaleDB 中的告警状态
        from sqlalchemy import text
        import json as json_module

        # 获取当前 event_ids 并添加新事件ID
        select_query = text("SELECT id, event_ids FROM alerts WHERE id = ANY(:alert_ids)")
        result = session.execute(select_query, {'alert_ids': int_ids})
        for row in result:
            current_ids = row._mapping['event_ids'] or []
            if isinstance(current_ids, list):
                current_ids.append(event.id)
            else:
                current_ids = [event.id]

            # 直接执行原生 SQL，使用 Python 格式化
            update_query = text(f"""
                UPDATE alerts
                SET status = 'investigating',
                    event_ids = :event_ids,
                    updated_at = NOW()
                WHERE id = :id
            """)
            session.execute(update_query, {
                'id': row._mapping['id'],
                'event_ids': json_module.dumps(current_ids)
            })
        session.commit()

        # 记录审计日志
        audit = AuditLog(
            user_id=getattr(request, 'user_id', 1),
            username=getattr(request, 'username', 'system'),
            action='聚合告警生成事件',
            module='alerts',
            target=event_code,
            details={
                'alert_count': len(alert_ids),
                'alert_ids': alert_ids
            },
            ip=request.remote_addr
        )
        db.session.add(audit)
        db.session.commit()

        return jsonify({
            'success': True,
            'data': {
                'event': event.to_dict(),
                'aggregated_count': len(alert_ids)
            }
        }), 201
    finally:
        tsdb.close_session(session)


@alerts_api_bp.route('/alerts/init-hypertable', methods=['POST'])
@login_required
def init_hypertable():
    """初始化 alerts hypertable"""
    tsdb = get_tsdb()
    session = tsdb.get_session()

    try:
        success = create_alerts_hypertable(session)

        if success:
            return jsonify({
                'success': True,
                'message': 'Hypertable 初始化成功'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Hypertable 初始化失败'
            }), 500
    finally:
        tsdb.close_session(session)
