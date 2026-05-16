"""
日志类型管理 API 路由 (新版)
"""
import uuid
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import LogType

log_types_api_bp = Blueprint('log_types_api', __name__)


def _generate_code(name: str) -> str:
    """从名称生成英文代码"""
    import re
    # 简单转拼音首字母 + uuid短码
    code = re.sub(r'[^a-zA-Z0-9_]', '_', name.lower())
    if not code:
        code = 'lt'
    return f"{code}_{uuid.uuid4().hex[:6]}"


@log_types_api_bp.route('/log-types', methods=['GET'])
@login_required
def list_log_types():
    """获取日志类型列表"""
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', request.args.get('page_size', 20, type=int), type=int)
    category = request.args.get('category')
    search = request.args.get('search', '')

    query = LogType.query

    if category:
        query = query.filter(LogType.category == category)
    if search:
        query = query.filter(
            db.or_(
                LogType.name.ilike(f'%{search}%'),
                LogType.description.ilike(f'%{search}%')
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


@log_types_api_bp.route('/log-types/<lt_id>', methods=['GET'])
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

    if not data or not data.get('name'):
        return jsonify({'success': False, 'error': '日志类型名称不能为空'}), 400

    log_type_id = data.get('id') or f"lt_{uuid.uuid4().hex[:8]}"

    if LogType.query.get(log_type_id):
        return jsonify({'success': False, 'error': '日志类型ID已存在'}), 400

    log_type = LogType(
        id=log_type_id,
        name=data['name'],
        code=data.get('code') or _generate_code(data['name']),
        description=data.get('description'),
        category=data.get('category', 'security'),
        icon=data.get('icon'),
        color=data.get('color'),
        default_severity=data.get('default_severity', 3),
        retention_days=data.get('retention_days', 90),
        status=data.get('status', 'active'),
        tags=data.get('tags', []),
        pipeline_id=str(data.get('pipeline_id')) if data.get('pipeline_id') else None,
        pipeline_name=data.get('pipeline_name'),
        patterns=data.get('patterns', [])
    )

    db.session.add(log_type)
    db.session.commit()

    return jsonify({
        'success': True,
        'data': log_type.to_dict()
    }), 201


@log_types_api_bp.route('/log-types/<lt_id>', methods=['PUT'])
@login_required
def update_log_type(lt_id):
    """更新日志类型"""
    log_type = LogType.query.get(lt_id)
    if not log_type:
        return jsonify({'success': False, 'error': '日志类型不存在'}), 404

    data = request.get_json()
    for key in ['name', 'code', 'category', 'description', 'icon', 'color',
                 'default_severity', 'retention_days', 'status', 'tags', 'patterns',
                 'pipeline_id', 'pipeline_name']:
        if key in data:
            val = data[key]
            if key == 'pipeline_id' and val is not None:
                val = str(val)
            setattr(log_type, key, val)

    db.session.commit()

    return jsonify({
        'success': True,
        'data': log_type.to_dict()
    })


@log_types_api_bp.route('/log-types/<lt_id>', methods=['DELETE'])
@login_required
def delete_log_type(lt_id):
    """删除日志类型"""
    log_type = LogType.query.get(lt_id)
    if not log_type:
        return jsonify({'success': False, 'error': '日志类型不存在'}), 404

    db.session.delete(log_type)
    db.session.commit()

    return jsonify({'success': True, 'message': '删除成功'})
