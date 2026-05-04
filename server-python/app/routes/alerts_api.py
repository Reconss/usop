"""
安全告警 API 路由
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import Alert, Event, AuditLog
from datetime import datetime
from sqlalchemy import or_

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
    
    query = Alert.query
    
    if severity:
        query = query.filter(Alert.severity == severity)
    if status:
        query = query.filter(Alert.status == status)
    if search:
        query = query.filter(
            or_(
                Alert.title.ilike(f'%{search}%'),
                Alert.alert_code.ilike(f'%{search}%')
            )
        )
    
    query = query.order_by(Alert.created_at.desc())
    pagination = query.paginate(page=page, per_page=page_size, error_out=False)
    
    return jsonify({
        'success': True,
        'data': {
            'items': [a.to_dict() for a in pagination.items],
            'total': pagination.total,
            'page': page,
            'page_size': page_size,
            'pages': pagination.pages
        }
    })


@alerts_api_bp.route('/alerts/<alert_id>', methods=['GET'])
@login_required
def get_alert(alert_id):
    """获取告警详情"""
    # 支持数字ID和alert_code
    if alert_id.isdigit():
        alert = Alert.query.get(int(alert_id))
    else:
        alert = Alert.query.filter_by(alert_code=alert_id).first()
    
    if not alert:
        return jsonify({'success': False, 'error': '告警不存在'}), 404
    
    return jsonify({
        'success': True,
        'data': alert.to_dict()
    })


@alerts_api_bp.route('/alerts/<alert_id>/status', methods=['PUT'])
@login_required
def update_alert_status(alert_id):
    """更新告警状态"""
    data = request.get_json()
    new_status = data.get('status')
    
    if not new_status:
        return jsonify({'success': False, 'error': '缺少状态参数'}), 400
    
    alert = Alert.query.filter_by(alert_code=alert_id).first()
    if not alert:
        return jsonify({'success': False, 'error': '告警不存在'}), 404
    
    alert.status = new_status
    alert.updated_at = datetime.utcnow()
    db.session.commit()
    
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
        'data': alert.to_dict()
    })


@alerts_api_bp.route('/alerts/batch/status', methods=['PUT'])
@login_required
def batch_update_status():
    """批量更新告警状态"""
    data = request.get_json()
    alert_ids = data.get('alert_ids', [])
    new_status = data.get('status')
    
    if not alert_ids or not new_status:
        return jsonify({'success': False, 'error': '缺少必要参数'}), 400
    
    updated = Alert.query.filter(Alert.alert_code.in_(alert_ids)).update({
        'status': new_status,
        'updated_at': datetime.utcnow()
    }, synchronize_session=False)
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': {
            'updated_count': updated
        }
    })


@alerts_api_bp.route('/alerts/<alert_id>', methods=['DELETE'])
@login_required
def delete_alert(alert_id):
    """删除告警"""
    alert = Alert.query.filter_by(alert_code=alert_id).first()
    if not alert:
        return jsonify({'success': False, 'error': '告警不存在'}), 404
    
    db.session.delete(alert)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': '告警已删除'
    })


@alerts_api_bp.route('/alerts/batch', methods=['DELETE'])
@login_required
def batch_delete():
    """批量删除告警"""
    data = request.get_json()
    alert_ids = data.get('alert_ids', [])
    
    if not alert_ids:
        return jsonify({'success': False, 'error': '缺少告警ID列表'}), 400
    
    deleted = Alert.query.filter(Alert.alert_code.in_(alert_ids)).delete(
        synchronize_session=False
    )
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': {
            'deleted_count': deleted
        }
    })


@alerts_api_bp.route('/alerts/stats', methods=['GET'])
@login_required
def get_stats():
    """获取告警统计"""
    today = datetime.utcnow().date()
    
    stats = {
        'total': Alert.query.count(),
        'today_new': Alert.query.filter(
            db.func.date(Alert.created_at) == today
        ).count(),
        'by_severity': {
            'critical': Alert.query.filter(Alert.severity == 'critical').count(),
            'high': Alert.query.filter(Alert.severity == 'high').count(),
            'medium': Alert.query.filter(Alert.severity == 'medium').count(),
            'low': Alert.query.filter(Alert.severity == 'low').count()
        },
        'by_status': {
            'new': Alert.query.filter(Alert.status == 'new').count(),
            'investigating': Alert.query.filter(Alert.status == 'investigating').count(),
            'closed': Alert.query.filter(Alert.status == 'closed').count(),
            'false_positive': Alert.query.filter(Alert.status == 'false_positive').count()
        }
    }
    
    return jsonify({
        'success': True,
        'data': stats
    })


@alerts_api_bp.route('/alerts/export', methods=['GET'])
@login_required
def export_alerts():
    """导出告警"""
    severity = request.args.get('severity')
    status = request.args.get('status')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    query = Alert.query
    
    if severity:
        query = query.filter(Alert.severity == severity)
    if status:
        query = query.filter(Alert.status == status)
    
    alerts = query.order_by(Alert.created_at.desc()).all()
    
    export_data = []
    for alert in alerts:
        export_data.append({
            'alert_code': alert.alert_code,
            'title': alert.title,
            'severity': alert.severity,
            'status': alert.status,
            'source': alert.source,
            'created_at': alert.created_at.isoformat() if alert.created_at else None
        })
    
    return jsonify({
        'success': True,
        'data': export_data
    })


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
    
    year = datetime.utcnow().year
    last_alert = Alert.query.filter(
        Alert.alert_code.like(f'ALERT-{year}-%')
    ).order_by(Alert.id.desc()).first()
    
    if last_alert:
        last_num = int(last_alert.alert_code.split('-')[-1])
        new_num = last_num + 1
    else:
        new_num = 1
    
    alert_code = f"ALERT-{year}-{new_num:03d}"
    
    alert = Alert(
        alert_code=alert_code,
        title=data.get('title', ''),
        description=data.get('description', ''),
        severity=data.get('severity', 'medium'),
        status=data.get('status', 'new'),
        source=data.get('source', 'manual'),
        extra_data=data.get('extra_data', {})
    )
    
    db.session.add(alert)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': alert.to_dict()
    }), 201
