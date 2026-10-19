"""站内通知（通知中心）

注意：Notification 模型字段是 `read` / `message`（不是 is_read / content），
历史上此文件曾误用 is_read 导致所有接口 AttributeError 500（2026-10-17 修复）。

所有接口按当前登录用户隔离（个人收件箱语义）。
"""
from flask import Blueprint, request, jsonify
from app.database import db
from app.models import Notification
from app.routes.auth import login_required

notifications_bp = Blueprint('notifications', __name__)


def _current_uid() -> int:
    """login_required 注入 request.current_user（JWT payload dict）。"""
    return (request.current_user or {}).get('user_id')


def _current_uname() -> str:
    return (request.current_user or {}).get('username', 'admin')


def _is_admin() -> bool:
    from app.models import User
    u = User.query.get(_current_uid())
    return bool(u and u.role == 'admin')


@notifications_bp.route('', methods=['GET'], strict_slashes=False)
@notifications_bp.route('/', methods=['GET'], strict_slashes=False)
@login_required
def list_notifications():
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 10, type=int)
    notification_type = request.args.get('type')

    query = Notification.query.filter(Notification.user_id == _current_uid())
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
    count = Notification.query.filter(
        Notification.user_id == _current_uid(),
        Notification.read == False
    ).count()
    return jsonify({
        'success': True,
        'data': {'count': count}
    })


@notifications_bp.route('/<int:notification_id>/read', methods=['PATCH'])
@login_required
def mark_as_read(notification_id: int):
    notification = Notification.query.get(notification_id)
    if not notification:
        return jsonify({'success': False, 'error': '通知不存在'}), 404
    if notification.user_id != _current_uid() and not _is_admin():
        return jsonify({'success': False, 'error': '无权操作该通知'}), 403

    notification.read = True
    db.session.commit()

    return jsonify({
        'success': True,
        'data': notification.to_dict()
    })


@notifications_bp.route('/mark-all-read', methods=['POST'])
@login_required
def mark_all_as_read():
    Notification.query.filter_by(user_id=_current_uid(), read=False).update({'read': True})
    db.session.commit()

    return jsonify({
        'success': True,
        'message': '全部标记已读'
    })


@notifications_bp.route('/<int:notification_id>', methods=['DELETE'])
@login_required
def delete_notification(notification_id: int):
    notification = Notification.query.get(notification_id)
    if not notification:
        return jsonify({'success': False, 'error': '通知不存在'}), 404
    if notification.user_id != _current_uid() and not _is_admin():
        return jsonify({'success': False, 'error': '无权操作该通知'}), 403

    db.session.delete(notification)
    db.session.commit()

    return jsonify({'success': True, 'message': '删除成功'})


# ========== 审批相关 API（剧本人工审批） ==========

@notifications_bp.route('/approvals', methods=['GET'])
@login_required
def list_approvals():
    """获取待审批列表"""
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 10, type=int)
    status = request.args.get('status', 'pending')

    from app.models import PlaybookApproval
    query = PlaybookApproval.query
    if status:
        query = query.filter(PlaybookApproval.status == status)

    total = query.count()
    approvals = query.order_by(PlaybookApproval.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return jsonify({
        'success': True,
        'data': {
            'items': [a.to_dict() for a in approvals],
            'total': total,
            'page': page,
            'limit': limit
        }
    })


@notifications_bp.route('/approvals/<approval_id>', methods=['POST'])
@login_required
def process_approval(approval_id):
    """审批操作"""
    data = request.get_json() or {}
    approved = data.get('approved', False)

    result = None
    from app.engine.playbook_engine import process_approval_result
    result = process_approval_result(approval_id, approved, _current_uid(), _current_uname())

    if isinstance(result, dict) and result.get('success') is False:
        return jsonify({'success': False, 'error': result.get('error', '审批失败')}), 404

    return jsonify({
        'success': True,
        'data': result
    })


@notifications_bp.route('/approvals/<approval_id>', methods=['GET'])
@login_required
def get_approval(approval_id):
    """获取审批详情"""
    from app.models import PlaybookApproval
    approval = PlaybookApproval.query.get(approval_id)
    if not approval:
        return jsonify({'success': False, 'error': '审批不存在'}), 404

    return jsonify({
        'success': True,
        'data': approval.to_dict()
    })
