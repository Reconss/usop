"""
用户管理 API 路由
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import User, Role, AuditLog
from app.utils import hash_password, verify_password
from app.utils.ldap_auth import (
    get_ldap_config, save_ldap_config, test_ldap_connection, AD_PASSWORD_PLACEHOLDER,
)
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

    auth_type = data.get('auth_type') or 'local'
    if auth_type not in ('local', 'ad'):
        return jsonify({'success': False, 'error': '无效的账号类型'}), 400
    ad_upn = (data.get('ad_upn') or '').strip() or None
    ad_domain = (data.get('ad_domain') or '').strip() or None
    # 平台用户名即域登录名（登录名直接进入 LDAP 过滤器）：未显式提供 upn 时自动回填
    if auth_type == 'ad' and not ad_upn:
        ad_upn = data.get('username')

    # AD 账号本地密码存不可验证占位；本地账号必须有初始密码
    if auth_type == 'ad':
        password_hash = AD_PASSWORD_PLACEHOLDER
    else:
        pwd = data.get('password')
        if not pwd:
            return jsonify({'success': False, 'error': '本地账号必须设置初始密码'}), 400
        password_hash = hash_password(pwd)

    user = User(
        username=data.get('username'),
        email=data.get('email'),
        password_hash=password_hash,
        role=data.get('role', 'analyst'),
        status='active',
        auth_type=auth_type,
        ad_upn=ad_upn,
        ad_domain=ad_domain,
    )

    db.session.add(user)
    db.session.commit()

    # 记录审计日志
    audit = AuditLog(
        user_id=getattr(request, 'current_user', {}).get('user_id', 1),
        username=getattr(request, 'current_user', {}).get('username', 'system'),
        action='创建用户',
        module='users',
        target=user.username,
        details={'user_id': user.id, 'role': user.role, 'auth_type': auth_type},
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
        # AD 账号的 upn 跟随用户名（若此前未显式覆盖）
        if (user.auth_type or 'local') == 'ad' and user.ad_upn == user.username:
            user.ad_upn = data['username']
        user.username = data['username']
    
    if 'email' in data and data['email'] != user.email:
        if User.query.filter_by(email=data['email']).first():
            return jsonify({'success': False, 'error': '邮箱已被使用'}), 400
        user.email = data['email']
    
    if 'role' in data:
        user.role = data['role']

    # 账号类型与 AD 字段
    if 'auth_type' in data and data['auth_type'] in ('local', 'ad') and data['auth_type'] != (user.auth_type or 'local'):
        user.auth_type = data['auth_type']
        if data['auth_type'] == 'ad':
            # 转 AD：本地密码替换为不可验证占位
            user.password_hash = AD_PASSWORD_PLACEHOLDER
            if not user.ad_upn:
                user.ad_upn = user.username
        else:
            # 转本地：必须提供新密码，否则无法登录
            if not data.get('password'):
                return jsonify({'success': False, 'error': '转为本地账号必须设置登录密码'}), 400
            user.password_hash = hash_password(data['password'])
    if 'ad_upn' in data:
        user.ad_upn = (data.get('ad_upn') or '').strip() or None
    if 'ad_domain' in data:
        user.ad_domain = (data.get('ad_domain') or '').strip() or None
    # 平台用户名即域登录名：AD 账号未显式提供 upn 时自动回填，不再强制要求
    if (user.auth_type or 'local') == 'ad' and not user.ad_upn:
        user.ad_upn = user.username

    if 'password' in data and data['password']:
        if (user.auth_type or 'local') == 'ad':
            return jsonify({'success': False, 'error': 'AD 域账号密码由域控制器管理，无法在平台重置'}), 400
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

    if (user.auth_type or 'local') == 'ad':
        return jsonify({'success': False, 'error': 'AD 域账号密码由域控制器管理，无法在平台重置'}), 400

    data = request.get_json()
    new_password = data.get('password', 'Password123!')

    user.password_hash = hash_password(new_password)
    user.updated_at = datetime.utcnow()
    db.session.commit()

    return jsonify({
        'success': True,
        'message': '密码已重置'
    })


# ── AD 域配置与连接测试 ─────────────────────────────────────

@users_api_bp.route('/ad-config', methods=['GET'])
@login_required
def get_ad_config():
    """获取 AD 域配置（服务账号密码打码）"""
    cfg = get_ldap_config(mask_password=True)
    return jsonify({'success': True, 'data': cfg})


@users_api_bp.route('/ad-config', methods=['POST'])
@login_required
def update_ad_config():
    """保存 AD 域配置（bind_password='******' 表示未修改）"""
    data = request.get_json() or {}
    cfg = {
        'enabled': bool(data.get('enabled')),
        'server_uri': (data.get('server_uri') or '').strip(),
        'port': int(data.get('port') or 389),
        'use_ssl': bool(data.get('use_ssl')),
        'bind_dn': (data.get('bind_dn') or '').strip(),
        'bind_password': data.get('bind_password') or '',
        'base_dn': (data.get('base_dn') or '').strip(),
        'user_filter': (data.get('user_filter') or '').strip() or '(sAMAccountName={username})',
        'attr_map': {'upn': 'userPrincipalName', 'mail': 'mail', 'display': 'displayName'},
    }
    if not cfg['server_uri'].startswith(('ldap://', 'ldaps://')):
        return jsonify({'success': False, 'error': '服务器地址必须以 ldap:// 或 ldaps:// 开头'}), 400
    save_ldap_config(cfg)

    audit = AuditLog(
        user_id=getattr(request, 'current_user', {}).get('user_id', 1),
        username=getattr(request, 'current_user', {}).get('username', 'system'),
        action='更新AD域配置',
        module='users',
        target='ad_ldap_config',
        ip=request.remote_addr
    )
    db.session.add(audit)
    db.session.commit()
    return jsonify({'success': True, 'data': get_ldap_config(mask_password=True)})


@users_api_bp.route('/ad-test', methods=['POST'])
@login_required
def test_ad_connection():
    """
    真实 AD 连接测试。请求体携带待测配置（bind_password='******' 时用已存密码）；
    空请求体则直接用已保存配置测试。
    """
    data = request.get_json() or {}
    if data:
        stored = get_ldap_config()
        if data.get('bind_password') in (None, '', '******'):
            data['bind_password'] = stored.get('bind_password', '')
        if not data.get('server_uri'):
            data['server_uri'] = stored.get('server_uri', '')
        cfg = {**stored, **data}
    else:
        cfg = get_ldap_config()
    ok, msg, sample = test_ldap_connection(cfg)
    return jsonify({'success': ok, 'message': msg, 'data': {'sample_users': sample}}), (200 if ok else 400)


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


# ── SMTP 邮件服务配置与连接测试 ──────────────────────────────

@users_api_bp.route('/smtp-config', methods=['GET'])
@login_required
def get_smtp_config_api():
    """获取 SMTP 邮件配置（授权码打码）"""
    from app.utils.email_service import get_smtp_config
    return jsonify({'success': True, 'data': get_smtp_config(mask_password=True)})


@users_api_bp.route('/smtp-config', methods=['POST'])
@login_required
def update_smtp_config_api():
    """保存 SMTP 邮件配置（password='******' 表示未修改）"""
    from app.utils.email_service import save_smtp_config
    data = request.get_json() or {}
    host = (data.get('host') or '').strip()
    username = (data.get('username') or '').strip()
    if not host or not username:
        return jsonify({'success': False, 'error': 'SMTP 服务器与发件账号不能为空'}), 400
    cfg = save_smtp_config(data)
    audit = AuditLog(
        user_id=getattr(request, 'current_user', {}).get('user_id', 1),
        username=getattr(request, 'current_user', {}).get('username', 'system'),
        action='更新SMTP邮件配置',
        module='users',
        target='smtp_config',
        ip=request.remote_addr
    )
    db.session.add(audit)
    db.session.commit()
    return jsonify({'success': True, 'data': cfg})


@users_api_bp.route('/smtp-test', methods=['POST'])
@login_required
def test_smtp_connection_api():
    """真实 SMTP 连接测试（连接+登录，不发信）"""
    from app.utils.email_service import test_smtp_connection
    result = test_smtp_connection(request.get_json() or {})
    return jsonify(result)


# ── 通知渠道配置（企业微信/钉钉/飞书/Slack webhook + 邮件默认收件人） ──

@users_api_bp.route('/notify-config', methods=['GET'])
@login_required
def get_notify_config_api():
    """获取通知渠道配置（webhook 敏感参数打码为 ******）"""
    from app.utils.notify_service import get_notify_config
    return jsonify({'success': True, 'data': get_notify_config(mask=True)})


@users_api_bp.route('/notify-config', methods=['POST'])
@login_required
def update_notify_config_api():
    """保存通知渠道配置（webhook_url 含 ****** 表示保留原值）"""
    from app.utils.notify_service import save_notify_config
    data = request.get_json() or {}
    cfg = save_notify_config(data)
    audit = AuditLog(
        user_id=getattr(request, 'current_user', {}).get('user_id', 1),
        username=getattr(request, 'current_user', {}).get('username', 'system'),
        action='更新通知渠道配置',
        module='users',
        target='notify_channels_config',
        ip=request.remote_addr
    )
    db.session.add(audit)
    db.session.commit()
    return jsonify({'success': True, 'data': cfg})


@users_api_bp.route('/notify-test', methods=['POST'])
@login_required
def test_notify_channel_api():
    """通知渠道连通性测试：真实 POST 测试消息（邮件渠道=真实发信）。

    body: {channel: '企业微信'|'wecom'|..., webhook_url?: 覆盖用 URL}
    """
    from app.utils.notify_service import test_channel
    data = request.get_json() or {}
    result = test_channel(data.get('channel'), data.get('webhook_url'))
    return jsonify(result)
