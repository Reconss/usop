from flask import Blueprint, request, jsonify
from app.database import db
from app.models import Notification, AuditLog
from app.routes.auth import login_required

notifications_bp = Blueprint('notifications', __name__)


@notifications_bp.route('/', methods=['GET'])
@login_required
def list_notifications():
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 10, type=int)
    notification_type = request.args.get('type')

    query = Notification.query
    if notification_type:
        query = query.filter(Notification.type == notification_type)

    total = query.count()
    notifications = query.order_by(Notification.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return jsonify({
        'success': True,
        'data': {
            'items': [n.to_dict() for n in notifications],
            'total': total,
            'page': page,
            'limit': limit
        }
    })


@notifications_bp.route('/unread-count', methods=['GET'])
@login_required
def get_unread_count():
    count = Notification.query.filter(Notification.read == False).count()
    return jsonify({
        'success': True,
        'data': {'count': count}
    })


@notifications_bp.route('/<int:notification_id>/read', methods=['PATCH'])
@login_required
def mark_as_read(notification_id):
    notification = Notification.query.get(notification_id)
    if not notification:
        return jsonify({'success': False, 'error': '通知不存在'}), 404

    notification.read = True
    db.session.commit()

    return jsonify({
        'success': True,
        'data': notification.to_dict()
    })


@notifications_bp.route('/mark-all-read', methods=['POST'])
@login_required
def mark_all_as_read():
    user_id = request.current_user['user_id']
    Notification.query.filter_by(user_id=user_id, read=False).update({'read': True})
    db.session.commit()

    return jsonify({
        'success': True,
        'message': '全部标记已读'
    })


@notifications_bp.route('/<int:notification_id>', methods=['DELETE'])
@login_required
def delete_notification(notification_id):
    notification = Notification.query.get(notification_id)
    if not notification:
        return jsonify({'success': False, 'error': '通知不存在'}), 404

    db.session.delete(notification)
    db.session.commit()

    return jsonify({'success': True, 'message': '删除成功'})