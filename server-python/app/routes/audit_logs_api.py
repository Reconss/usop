"""
审计日志 API 路由 (新版)
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import AuditLog
from sqlalchemy import func

audit_logs_api_bp = Blueprint('audit_logs_api', __name__)


@audit_logs_api_bp.route('/logs', methods=['GET'])
@login_required
def list_logs():
    """获取审计日志列表"""
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 10, type=int)
    action = request.args.get('action')
    module = request.args.get('module')
    user_id = request.args.get('user_id', type=int)

    query = AuditLog.query
    if action:
        query = query.filter(AuditLog.action == action)
    if module:
        query = query.filter(AuditLog.module == module)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)

    total = query.count()
    logs = query.order_by(AuditLog.timestamp.desc()).offset((page - 1) * limit).limit(limit).all()

    return jsonify({
        'success': True,
        'data': {
            'items': [log.to_dict() for log in logs],
            'total': total,
            'page': page,
            'limit': limit
        }
    })


@audit_logs_api_bp.route('/logs/<int:log_id>', methods=['GET'])
@login_required
def get_log(log_id):
    """获取审计日志详情"""
    log = AuditLog.query.get(log_id)
    if not log:
        return jsonify({'success': False, 'error': '日志不存在'}), 404

    return jsonify({
        'success': True,
        'data': log.to_dict()
    })


@audit_logs_api_bp.route('/stats/summary', methods=['GET'])
@login_required
def get_stats_summary():
    """获取审计统计摘要"""
    total = AuditLog.query.count()

    action_counts = db.session.query(
        AuditLog.action,
        func.count(AuditLog.id)
    ).group_by(AuditLog.action).all()

    module_counts = db.session.query(
        AuditLog.module,
        func.count(AuditLog.id)
    ).group_by(AuditLog.module).all()

    user_activity = db.session.query(
        AuditLog.username,
        func.count(AuditLog.id).label('count')
    ).group_by(AuditLog.username).order_by(func.count(AuditLog.id).desc()).limit(5).all()

    return jsonify({
        'success': True,
        'data': {
            'total': total,
            'by_action': {a[0]: a[1] for a in action_counts},
            'by_module': {m[0]: m[1] for m in module_counts},
            'recent_users': [{'username': u[0], 'count': u[1]} for u in user_activity]
        }
    })
