from flask import Blueprint, request, jsonify
from app.database import db
from app.models import Alert, AuditLog
from app.routes.auth import login_required
from datetime import datetime
from sqlalchemy import func

alerts_bp = Blueprint('alerts', __name__)


def generate_alert_code():
    """生成告警ID，格式为：年月日+三位序号（如：20250115001）"""
    today = datetime.utcnow().strftime('%Y%m%d')
    
    # 查找今天已存在的最大序号
    max_code = db.session.query(func.max(Alert.alert_code)).filter(
        Alert.alert_code.like(f'{today}%')
    ).scalar()
    
    if max_code:
        # 提取序号部分并加1
        try:
            last_seq = int(max_code[-3:])
            new_seq = last_seq + 1
        except ValueError:
            new_seq = 1
    else:
        new_seq = 1
    
    return f"{today}{new_seq:03d}"


@alerts_bp.route('/', methods=['GET'])
@login_required
def list_alerts():
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 10, type=int)
    severity = request.args.get('severity')
    status = request.args.get('status')
    search = request.args.get('search', '')

    query = Alert.query
    if severity:
        query = query.filter(Alert.severity == severity)
    if status:
        query = query.filter(Alert.status == status)
    if search:
        query = query.filter(Alert.title.contains(search))

    total = query.count()
    alerts = query.order_by(Alert.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return jsonify({
        'success': True,
        'data': {
            'items': [a.to_dict() for a in alerts],
            'total': total,
            'page': page,
            'limit': limit
        }
    })


@alerts_bp.route('/<int:alert_id>', methods=['GET'])
@login_required
def get_alert(alert_id):
    alert = Alert.query.get(alert_id)
    if not alert:
        return jsonify({'success': False, 'error': '告警不存在'}), 404

    return jsonify({
        'success': True,
        'data': alert.to_dict()
    })


@alerts_bp.route('/<int:alert_id>/status', methods=['PATCH'])
@login_required
def update_alert_status(alert_id):
    alert = Alert.query.get(alert_id)
    if not alert:
        return jsonify({'success': False, 'error': '告警不存在'}), 404

    data = request.get_json()
    status = data.get('status')
    valid_statuses = ['pending', 'investigating', 'resolved', 'false_positive', 'closed']
    if status and status not in valid_statuses:
        return jsonify({'success': False, 'error': '无效的状态'}), 400

    if status:
        alert.status = status
    alert.updated_at = datetime.utcnow()
    db.session.commit()

    return jsonify({
        'success': True,
        'data': alert.to_dict()
    })


@alerts_bp.route('/<int:alert_id>/assign', methods=['POST'])
@login_required
def assign_alert(alert_id):
    alert = Alert.query.get(alert_id)
    if not alert:
        return jsonify({'success': False, 'error': '告警不存在'}), 404

    data = request.get_json()
    assigned_to = data.get('assigned_to')

    alert.assigned_to = assigned_to
    alert.updated_at = datetime.utcnow()
    db.session.commit()

    return jsonify({
        'success': True,
        'data': alert.to_dict()
    })


@alerts_bp.route('/merge', methods=['POST'])
@login_required
def merge_alerts():
    data = request.get_json()
    alert_ids = data.get('alert_ids', [])
    title = data.get('title', 'Merged Alert')

    if len(alert_ids) < 2:
        return jsonify({'success': False, 'error': '至少需要选择两个告警'}), 400

    first_alert = Alert.query.get(alert_ids[0])
    if not first_alert:
        return jsonify({'success': False, 'error': '告警不存在'}), 404

    merged_alert = Alert(
        alert_code=generate_alert_code(),
        title=title,
        description=f"Merged {len(alert_ids)} alerts",
        severity=first_alert.severity,
        status='new',
        event_ids=alert_ids,
        extra_data={'merged_from': alert_ids}
    )
    db.session.add(merged_alert)

    for alert_id in alert_ids:
        alert = Alert.query.get(alert_id)
        if alert:
            alert.status = 'merged'
            alert.extra_data = alert.extra_data or {}
            alert.extra_data['merged_into'] = merged_alert.id

    db.session.commit()

    return jsonify({
        'success': True,
        'data': merged_alert.to_dict()
    }), 201


@alerts_bp.route('/stats/summary', methods=['GET'])
@login_required
def get_stats_summary():
    total = Alert.query.count()
    pending = Alert.query.filter(Alert.status == 'pending').count()
    investigating = Alert.query.filter(Alert.status == 'investigating').count()
    resolved = Alert.query.filter(Alert.status == 'resolved').count()

    high_severity = Alert.query.filter(Alert.severity == 'critical').count()
    medium_severity = Alert.query.filter(Alert.severity == 'high').count()
    low_severity = Alert.query.filter(Alert.severity.in_(['medium', 'low'])).count()

    return jsonify({
        'success': True,
        'data': {
            'total': total,
            'pending': pending,
            'investigating': investigating,
            'resolved': resolved,
            'by_severity': {
                'critical': high_severity,
                'high': medium_severity,
                'medium_low': low_severity
            }
        }
    })


@alerts_bp.route('/<int:alert_id>', methods=['DELETE'])
@login_required
def delete_alert(alert_id):
    alert = Alert.query.get(alert_id)
    if not alert:
        return jsonify({'success': False, 'error': '告警不存在'}), 404

    db.session.delete(alert)
    db.session.commit()

    return jsonify({'success': True, 'message': '删除成功'})
