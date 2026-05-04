"""
日志类型管理 API 路由 (新版)
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import LogType

log_types_api_bp = Blueprint('log_types_api', __name__)


@log_types_api_bp.route('/log-types', methods=['GET'])
@login_required
def list_log_types():
    """获取日志类型列表"""
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 20, type=int)
    category = request.args.get('category')
    search = request.args.get('search', '')

    query = LogType.query
    
    if category:
        query = query.filter(LogType.category == category)
    if search:
        query = query.filter(
            db.or_(
                LogType.name.ilike(f'%{search}%'),
                LogType.pattern.ilike(f'%{search}%')
            )
        )

    total = query.count()
    log_types = query.order_by(LogType.name).offset((page - 1) * limit).limit(limit).all()

    return jsonify({
        'success': True,
        'data': {
            'items': [lt.to_dict() for lt in log_types],
            'total': total,
            'page': page,
            'limit': limit
        }
    })


@log_types_api_bp.route('/log-types/<int:lt_id>', methods=['GET'])
@login_required
def get_log_type(lt_id):
    """获取日志类型详情"""
    log_type = LogType.query.get(lt_id)
    if not log_type:
        return jsonify({'success': False, 'error': '日志类型不存在'}), 404

    return jsonify({
        'success': True,
        'data': log_type.to_dict()
    })


@log_types_api_bp.route('/log-types', methods=['POST'])
@login_required
def create_log_type():
    """创建日志类型"""
    data = request.get_json()
    
    log_type = LogType(
        name=data.get('name'),
        category=data.get('category'),
        pattern=data.get('pattern'),
        description=data.get('description'),
        severity_mapping=data.get('severity_mapping', {}),
        field_schema=data.get('field_schema', {}),
        status=data.get('status', 'active')
    )
    
    db.session.add(log_type)
    db.session.commit()

    return jsonify({
        'success': True,
        'data': log_type.to_dict()
    }), 201


@log_types_api_bp.route('/log-types/<int:lt_id>', methods=['PUT'])
@login_required
def update_log_type(lt_id):
    """更新日志类型"""
    log_type = LogType.query.get(lt_id)
    if not log_type:
        return jsonify({'success': False, 'error': '日志类型不存在'}), 404

    data = request.get_json()
    for key in ['name', 'category', 'pattern', 'description', 'severity_mapping', 'field_schema', 'status']:
        if key in data:
            setattr(log_type, key, data[key])

    db.session.commit()

    return jsonify({
        'success': True,
        'data': log_type.to_dict()
    })


@log_types_api_bp.route('/log-types/<int:lt_id>', methods=['DELETE'])
@login_required
def delete_log_type(lt_id):
    """删除日志类型"""
    log_type = LogType.query.get(lt_id)
    if not log_type:
        return jsonify({'success': False, 'error': '日志类型不存在'}), 404

    db.session.delete(log_type)
    db.session.commit()

    return jsonify({'success': True, 'message': '删除成功'})
