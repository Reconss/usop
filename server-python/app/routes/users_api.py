"""
用户管理 API 路由
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import User, Role, AuditLog
from app.utils import hash_password, verify_password
from datetime import datetime

users_api_bp = Blueprint('users_api', __name__)


@users_api_bp.route('/users', methods=['GET'])
@login_required
def get_users():
    """获取用户列表"""
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 20, type=int)
    role = request.args.get('role')
    status = request.args.get('status')
    search = request.args.get('search')
    
    query = User.query
    
    if role:
        query = query.filter(User.role == role)
    if status:
        query = query.filter(User.status == status)
    if search:
        query = query.filter(
            db.or_(
                User.username.ilike(f'%{search}%'),
                User.email.ilike(f'%{search}%')
            )
        )
    
    query = query.order_by(User.created_at.desc())
    pagination = query.paginate(page=page, per_page=page_size, error_out=False)
    
    return jsonify({
        'success': True,
        'data': {
            'items': [u.to_dict() for u in pagination.items],
            'total': pagination.total,
            'page': page,
            'page_size': page_size,
            'pages': pagination.pages
        }
    })


@users_api_bp.route('/users', methods=['POST'])
@login_required
def create_user():
    """创建用户"""
    data = request.get_json()
    
    # 检查用户名和邮箱是否已存在
    if User.query.filter_by(username=data.get('username')).first():
        return jsonify({'success': False, 'error': '用户名已存在'}), 400
    if User.query.filter_by(email=data.get('email')).first():
        return jsonify({'success': False, 'error': '邮箱已被使用'}), 400
    
    user = User(
        username=data.get('username'),
        email=data.get('email'),
        password_hash=hash_password(data.get('password', 'Password123!')),
        role=data.get('role', 'analyst'),
        status='active'
    )
    
    db.session.add(user)
    db.session.commit()
    
    # 记录审计日志
    audit = AuditLog(
        user_id=getattr(request, 'user_id', 1),
        username=getattr(request, 'username', 'system'),
        action='创建用户',
        module='users',
        target=user.username,
        details={'user_id': user.id, 'role': user.role},
        ip=request.remote_addr
    )
    db.session.add(audit)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': user.to_dict()
    }), 201


@users_api_bp.route('/users/<int:user_id>', methods=['GET'])
@login_required
def get_user(user_id):
    """获取用户详情"""
    user = User.query.get(user_id)
    if not user:
        return jsonify({'success': False, 'error': '用户不存在'}), 404
    
    return jsonify({
        'success': True,
        'data': user.to_dict()
    })


@users_api_bp.route('/users/<int:user_id>', methods=['PUT'])
@login_required
def update_user(user_id):
    """更新用户"""
    data = request.get_json()
    
    user = User.query.get(user_id)
    if not user:
        return jsonify({'success': False, 'error': '用户不存在'}), 404
    
    if 'username' in data and data['username'] != user.username:
        if User.query.filter_by(username=data['username']).first():
            return jsonify({'success': False, 'error': '用户名已存在'}), 400
        user.username = data['username']
    
    if 'email' in data and data['email'] != user.email:
        if User.query.filter_by(email=data['email']).first():
            return jsonify({'success': False, 'error': '邮箱已被使用'}), 400
        user.email = data['email']
    
    if 'role' in data:
        user.role = data['role']
    
    if 'password' in data and data['password']:
        user.password_hash = hash_password(data['password'])
    
    user.updated_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': user.to_dict()
    })


@users_api_bp.route('/users/<int:user_id>', methods=['DELETE'])
@login_required
def delete_user(user_id):
    """删除用户"""
    user = User.query.get(user_id)
    if not user:
        return jsonify({'success': False, 'error': '用户不存在'}), 404
    
    # 不允许删除超级管理员
    if user.role == 'admin':
        return jsonify({'success': False, 'error': '不能删除管理员账户'}), 400
    
    db.session.delete(user)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': '用户已删除'
    })


@users_api_bp.route('/users/<int:user_id>/toggle-status', methods=['POST'])
@login_required
def toggle_status(user_id):
    """启用/禁用用户"""
    user = User.query.get(user_id)
    if not user:
        return jsonify({'success': False, 'error': '用户不存在'}), 404
    
    if user.role == 'admin':
        return jsonify({'success': False, 'error': '不能禁用管理员账户'}), 400
    
    user.status = 'inactive' if user.status == 'active' else 'active'
    user.updated_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': user.to_dict()
    })


@users_api_bp.route('/users/<int:user_id>/reset-password', methods=['POST'])
@login_required
def reset_password(user_id):
    """重置用户密码"""
    user = User.query.get(user_id)
    if not user:
        return jsonify({'success': False, 'error': '用户不存在'}), 404
    
    data = request.get_json()
    new_password = data.get('password', 'Password123!')
    
    user.password_hash = hash_password(new_password)
    user.updated_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': '密码已重置'
    })


@users_api_bp.route('/roles', methods=['GET'])
@login_required
def get_roles():
    """获取角色列表"""
    roles = Role.query.all()
    return jsonify({
        'success': True,
        'data': [r.to_dict() for r in roles]
    })


@users_api_bp.route('/roles', methods=['POST'])
@login_required
def create_role():
    """创建角色"""
    data = request.get_json()
    
    role = Role(
        id=data.get('id'),
        name=data.get('name'),
        description=data.get('description'),
        permissions=data.get('permissions', [])
    )
    
    db.session.add(role)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': role.to_dict()
    }), 201


@users_api_bp.route('/users/me', methods=['GET'])
@login_required
def get_profile():
    """获取当前用户资料"""
    user_id = getattr(request, 'user_id', 1)
    user = User.query.get(user_id)
    
    if not user:
        return jsonify({'success': False, 'error': '用户不存在'}), 404
    
    return jsonify({
        'success': True,
        'data': user.to_dict()
    })


@users_api_bp.route('/users/me', methods=['PUT'])
@login_required
def update_profile():
    """更新当前用户资料"""
    user_id = getattr(request, 'user_id', 1)
    user = User.query.get(user_id)
    
    if not user:
        return jsonify({'success': False, 'error': '用户不存在'}), 404
    
    data = request.get_json()
    
    if 'email' in data:
        user.email = data['email']
    if 'password' in data and data['password']:
        user.password_hash = hash_password(data['password'])
    
    user.updated_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': user.to_dict()
    })
