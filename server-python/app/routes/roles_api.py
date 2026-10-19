"""
Roles API 路由 - 角色管理接口

权限约束：写操作要求 roles.manage；系统内置角色不可删除、id/name 不可改，权限组合可调。
"""
from flask import Blueprint, request, jsonify
from app.database import db
from app.models.extensions import Role
from app.models import User, AuditLog
from app.routes.auth import login_required
from app.utils.permissions import (
    permission_required, seed_system_roles, SYSTEM_ROLES, PERMISSION_CATALOG,
)
from datetime import datetime

roles_api_bp = Blueprint('roles_api', __name__)


def _audit(action, target, details=None):
    _cu = getattr(request, 'current_user', None) or {}
    db.session.add(AuditLog(
        user_id=_cu.get('user_id', 1),
        username=(_cu.get('username') or 'system'),
        action=action,
        module='roles',
        target=target,
        details=details or {},
        ip=request.remote_addr,
    ))


@roles_api_bp.route('/roles', methods=['GET'])
@login_required
def list_roles():
    """获取角色列表（附实时用户数）"""
    roles = Role.query.all()
    counts = dict(
        db.session.query(User.role, db.func.count(User.id)).group_by(User.role).all()
    )
    data = []
    for r in roles:
        d = r.to_dict()
        d['user_count'] = counts.get(r.id, 0)
        data.append(d)
    return jsonify({
        'success': True,
        'data': data
    })


@roles_api_bp.route('/roles/catalog', methods=['GET'])
@login_required
def get_catalog():
    """权限点目录（前端与后端单一来源对齐）"""
    return jsonify({
        'success': True,
        'data': [
            {'id': pid, 'name': name, 'description': desc, 'module': module}
            for pid, name, desc, module in PERMISSION_CATALOG
        ]
    })


@roles_api_bp.route('/roles/seed', methods=['POST'])
@login_required
@permission_required('roles.manage')
def seed_roles():
    """重置系统角色为内置默认权限分配（幂等）"""
    result = seed_system_roles(force=True)
    _audit('重置系统角色权限', 'roles:system', result)
    db.session.commit()
    return jsonify({'success': True, 'data': result})


@roles_api_bp.route('/roles/<role_id>', methods=['GET'])
@login_required
def get_role(role_id):
    """获取单个角色"""
    role = Role.query.get(role_id)
    if not role:
        return jsonify({'success': False, 'error': '角色不存在'}), 404
    return jsonify({
        'success': True,
        'data': role.to_dict()
    })


@roles_api_bp.route('/roles', methods=['POST'])
@login_required
@permission_required('roles.manage')
def create_role():
    """创建角色"""
    data = request.get_json()

    if not data.get('name'):
        return jsonify({'success': False, 'error': '角色名称不能为空'}), 400

    role_id = data.get('id', f"role_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}")
    if Role.query.get(role_id):
        return jsonify({'success': False, 'error': f'角色 ID {role_id} 已存在'}), 400

    role = Role(
        id=role_id,
        name=data['name'],
        description=data.get('description', ''),
        permissions=data.get('permissions', []),
        approval_level=data.get('approval_level', 1),
        can_approve=data.get('can_approve', []),
        max_auto_approve=data.get('max_auto_approve', 0),
        is_system=False
    )

    db.session.add(role)
    _audit('创建角色', f"role:{role_id}", {'name': role.name, 'permissions': role.permissions})
    db.session.commit()

    return jsonify({
        'success': True,
        'data': role.to_dict()
    }), 201


@roles_api_bp.route('/roles/<role_id>', methods=['PUT'])
@login_required
@permission_required('roles.manage')
def update_role(role_id):
    """更新角色。

    系统内置角色：允许调整权限组合/描述/审批配置（满足按需收紧放宽），
    但 name 不可改（与 users.role 语义绑定）、角色本身不可删除。
    """
    role = Role.query.get(role_id)
    if not role:
        return jsonify({'success': False, 'error': '角色不存在'}), 404

    data = request.get_json()

    if role.is_system and 'name' in data and data['name'] != role.name:
        return jsonify({'success': False, 'error': '系统角色的名称不可修改'}), 400

    if 'name' in data:
        role.name = data['name']
    if 'description' in data:
        role.description = data['description']
    if 'permissions' in data:
        role.permissions = data['permissions']
    if 'approval_level' in data:
        role.approval_level = data['approval_level']
    if 'can_approve' in data:
        role.can_approve = data['can_approve']
    if 'max_auto_approve' in data:
        role.max_auto_approve = data['max_auto_approve']

    _audit('更新角色', f"role:{role_id}", {'permissions': role.permissions})
    db.session.commit()

    return jsonify({
        'success': True,
        'data': role.to_dict()
    })


@roles_api_bp.route('/roles/<role_id>', methods=['DELETE'])
@login_required
@permission_required('roles.manage')
def delete_role(role_id):
    """删除角色"""
    role = Role.query.get(role_id)
    if not role:
        return jsonify({'success': False, 'error': '角色不存在'}), 404

    if role.is_system:
        return jsonify({'success': False, 'error': '系统内置角色不可删除'}), 403

    in_use = User.query.filter_by(role=role_id).count()
    if in_use:
        return jsonify({'success': False, 'error': f'仍有 {in_use} 个用户使用该角色，请先调整用户角色'}), 400

    db.session.delete(role)
    _audit('删除角色', f"role:{role_id}", {'name': role.name})
    db.session.commit()

    return jsonify({
        'success': True,
        'message': '角色删除成功'
    })
