from flask import Blueprint, request, jsonify
from app.database import db
from app.models import User, AuditLog
from app.utils import hash_password
from app.routes.auth import login_required
from datetime import datetime

users_bp = Blueprint('users', __name__)


@users_bp.route('/', methods=['GET'])
@login_required
def list_users():
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 10, type=int)
    search = request.args.get('search', '')

    query = User.query
    if search:
        query = query.filter(
            (User.username.contains(search)) |
            (User.email.contains(search))
        )

    total = query.count()
    users = query.offset((page - 1) * limit).limit(limit).all()

    return jsonify({
        'success': True,
        'data': {
            'items': [u.to_dict() for u in users],
            'total': total,
            'page': page,
            'limit': limit
        }
    })


@users_bp.route('/<int:user_id>', methods=['GET'])
@login_required
def get_user(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({'success': False, 'error': '用户不存在'}), 404

    return jsonify({
        'success': True,
        'data': user.to_dict()
    })


@users_bp.route('/', methods=['POST'])
@login_required
def create_user():
    data = request.get_json()
    username = data.get('username')
    email = data.get('email')
    password = data.get('password', 'password123')
    role = data.get('role', 'analyst')

    if not username or not email:
        return jsonify({'success': False, 'error': '用户名和邮箱不能为空'}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({'success': False, 'error': '用户名已存在'}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({'success': False, 'error': '邮箱已存在'}), 400

    user = User(
        username=username,
        email=email,
        password_hash=hash_password(password),
        role=role,
        status='active'
    )
    db.session.add(user)
    db.session.commit()

    # Log the creation
    log = AuditLog(
        user_id=request.current_user['user_id'],
        username=request.current_user['username'],
        action='create',
        module='users',
        target=f'user:{user.id}',
        details={'username': username},
        ip=request.remote_addr
    )
    db.session.add(log)
    db.session.commit()

    return jsonify({
        'success': True,
        'data': user.to_dict()
    }), 201


@users_bp.route('/<int:user_id>', methods=['PUT'])
@login_required
def update_user(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({'success': False, 'error': '用户不存在'}), 404

    data = request.get_json()
    if 'email' in data:
        user.email = data['email']
    if 'role' in data:
        user.role = data['role']

    db.session.commit()

    return jsonify({
        'success': True,
        'data': user.to_dict()
    })


@users_bp.route('/<int:user_id>', methods=['DELETE'])
@login_required
def delete_user(user_id):
    if user_id == request.current_user['user_id']:
        return jsonify({'success': False, 'error': '不能删除自己'}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({'success': False, 'error': '用户不存在'}), 404

    db.session.delete(user)
    db.session.commit()

    return jsonify({'success': True, 'message': '删除成功'})


@users_bp.route('/<int:user_id>/status', methods=['PATCH'])
@login_required
def update_user_status(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({'success': False, 'error': '用户不存在'}), 404

    data = request.get_json()
    status = data.get('status')
    if status not in ['active', 'inactive', 'disabled']:
        return jsonify({'success': False, 'error': '无效的状态'}), 400

    user.status = status
    db.session.commit()

    return jsonify({
        'success': True,
        'data': user.to_dict()
    })


@users_bp.route('/roles/list', methods=['GET'])
@login_required
def list_roles():
    return jsonify({
        'success': True,
        'data': [
            {'id': 'admin', 'name': '管理员'},
            {'id': 'analyst', 'name': '分析师'},
            {'id': 'viewer', 'name': '只读用户'}
        ]
    })
