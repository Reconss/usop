"""
Roles API 路由 - 角色管理接口
"""
from flask import Blueprint, request, jsonify
from app.database import db
from app.models.extensions import Role
from app.routes.auth import login_required
from datetime import datetime

roles_api_bp = Blueprint('roles_api', __name__)


@roles_api_bp.route('/roles', methods=['GET'])
@login_required
def list_roles():
    """获取角色列表"""
    roles = Role.query.all()
    return jsonify({
        'success': True,
        'data': [r.to_dict() for r in roles]
    })


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
def create_role():
    """创建角色"""
    data = request.get_json()
    
    if not data.get('name'):
        return jsonify({'success': False, 'error': '角色名称不能为空'}), 400
    
    role = Role(
        id=data.get('id', f"role_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"),
        name=data['name'],
        description=data.get('description', ''),
        permissions=data.get('permissions', []),
        is_system=False
    )
    
    db.session.add(role)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': role.to_dict()
    })


@roles_api_bp.route('/roles/<role_id>', methods=['PUT'])
@login_required
def update_role(role_id):
    """更新角色"""
    role = Role.query.get(role_id)
    if not role:
        return jsonify({'success': False, 'error': '角色不存在'}), 404
    
    if role.is_system:
        return jsonify({'success': False, 'error': '系统角色不能修改'}), 403
    
    data = request.get_json()
    
    if 'name' in data:
        role.name = data['name']
    if 'description' in data:
        role.description = data['description']
    if 'permissions' in data:
        role.permissions = data['permissions']
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': role.to_dict()
    })


@roles_api_bp.route('/roles/<role_id>', methods=['DELETE'])
@login_required
def delete_role(role_id):
    """删除角色"""
    role = Role.query.get(role_id)
    if not role:
        return jsonify({'success': False, 'error': '角色不存在'}), 404
    
    if role.is_system:
        return jsonify({'success': False, 'error': '系统角色不能删除'}), 403
    
    db.session.delete(role)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': '角色删除成功'
    })
