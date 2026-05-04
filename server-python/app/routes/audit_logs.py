from flask import Blueprint, request, jsonify
from app.database import db
from app.models import AuditLog
from app.routes.auth import login_required
from sqlalchemy import func

audit_logs_bp = Blueprint('audit_logs', __name__)


@audit_logs_bp.route('/', methods=['GET'])
@login_required
def list_logs():
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 10, type=int)
    action = request.args.get('action')
    module = request.args.get('module')
    user_id = request.args.get('user_id', type=int)
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

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


@audit_logs_bp.route('/<int:log_id>', methods=['GET'])
@login_required
def get_log(log_id):
    log = AuditLog.query.get(log_id)
    if not log:
        return jsonify({'success': False, 'error': '日志不存在'}), 404

    return jsonify({
        'success': True,
        'data': log.to_dict()
    })


@audit_logs_bp.route('/stats/summary', methods=['GET'])
@login_required
def get_stats_summary():
    total = AuditLog.query.count()

    # Count by action
    action_counts = db.session.query(
        AuditLog.action,
        func.count(AuditLog.id)
    ).group_by(AuditLog.action).all()

    # Count by module
    module_counts = db.session.query(
        AuditLog.module,
        func.count(AuditLog.id)
    ).group_by(AuditLog.module).all()

    # Recent activity by user
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


@audit_logs_bp.route('/actions/list', methods=['GET'])
@login_required
def list_actions():
    return jsonify({
        'success': True,
        'data': [
            {'id': 'login', 'name': '登录'},
            {'id': 'logout', 'name': '登出'},
            {'id': 'create', 'name': '创建'},
            {'id': 'update', 'name': '更新'},
            {'id': 'delete', 'name': '删除'},
            {'id': 'execute', 'name': '执行'},
            {'id': 'change_password', 'name': '修改密码'}
        ]
    })


@audit_logs_bp.route('/modules/list', methods=['GET'])
@login_required
def list_modules():
    return jsonify({
        'success': True,
        'data': [
            {'id': 'auth', 'name': '认证'},
            {'id': 'users', 'name': '用户管理'},
            {'id': 'events', 'name': '事件管理'},
            {'id': 'alerts', 'name': '告警管理'},
            {'id': 'assets', 'name': '资产管理'},
            {'id': 'scans', 'name': '扫描任务'},
            {'id': 'rules', 'name': '规则管理'},
            {'id': 'playbooks', 'name': '剧本编排'}
        ]
    })