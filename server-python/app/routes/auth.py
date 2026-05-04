from flask import Blueprint, request, jsonify, make_response
from app.database import db
from app.models import User, AuditLog
from app.utils import hash_password, verify_password, generate_token, decode_token
from functools import wraps
from datetime import datetime

auth_bp = Blueprint('auth', __name__)


def add_cors_headers(response):
    """Add CORS headers to response"""
    response.headers['Access-Control-Allow-Origin'] = request.headers.get('Origin', '*')
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    response.headers['Access-Control-Max-Age'] = '3600'
    return response

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        # Allow OPTIONS requests for CORS preflight
        if request.method == 'OPTIONS':
            response = make_response('', 200)
            return add_cors_headers(response)
        
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not token:
            response = make_response(jsonify({'success': False, 'error': '未登录'}), 401)
            return add_cors_headers(response)

        payload = decode_token(token)
        if not payload:
            response = make_response(jsonify({'success': False, 'error': 'Token无效'}), 401)
            return add_cors_headers(response)

        request.current_user = payload
        return f(*args, **kwargs)
    return decorated


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({'success': False, 'error': '用户名和密码不能为空'}), 400

    user = User.query.filter_by(username=username).first()
    if not user or not verify_password(password, user.password_hash):
        return jsonify({'success': False, 'error': '用户名或密码错误'}), 401

    if user.status != 'active':
        return jsonify({'success': False, 'error': '账户已被禁用'}), 403

    token = generate_token(user.id, user.username)

    # Log the login
    log = AuditLog(
        user_id=user.id,
        username=user.username,
        action='login',
        module='auth',
        target=f'user:{user.id}',
        ip=request.remote_addr
    )
    db.session.add(log)
    db.session.commit()

    return jsonify({
        'success': True,
        'data': {
            'token': token,
            'user': user.to_dict()
        }
    })


@auth_bp.route('/logout', methods=['POST'])
@login_required
def logout():
    # Log the logout
    log = AuditLog(
        user_id=request.current_user['user_id'],
        username=request.current_user['username'],
        action='logout',
        module='auth',
        target=f"user:{request.current_user['user_id']}",
        ip=request.remote_addr
    )
    db.session.add(log)
    db.session.commit()

    return jsonify({'success': True, 'message': '登出成功'})


@auth_bp.route('/me', methods=['GET'])
@login_required
def get_current_user():
    user = User.query.get(request.current_user['user_id'])
    if not user:
        return jsonify({'success': False, 'error': '用户不存在'}), 404

    return jsonify({
        'success': True,
        'data': user.to_dict()
    })


@auth_bp.route('/change-password', methods=['POST'])
@login_required
def change_password():
    data = request.get_json()
    old_password = data.get('oldPassword')
    new_password = data.get('newPassword')

    if not old_password or not new_password:
        return jsonify({'success': False, 'error': '密码不能为空'}), 400

    user = User.query.get(request.current_user['user_id'])
    if not verify_password(old_password, user.password_hash):
        return jsonify({'success': False, 'error': '原密码错误'}), 400

    user.password_hash = hash_password(new_password)
    db.session.commit()

    # Log the password change
    log = AuditLog(
        user_id=user.id,
        username=user.username,
        action='change_password',
        module='auth',
        target=f'user:{user.id}',
        ip=request.remote_addr
    )
    db.session.add(log)
    db.session.commit()

    return jsonify({'success': True, 'message': '密码修改成功'})
