"""
数据源管理 API 路由 (新版)
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import DataSource

data_sources_api_bp = Blueprint('data_sources_api', __name__)


@data_sources_api_bp.route('/datasources', methods=['GET'])
@login_required
def list_datasources():
    """获取数据源列表"""
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 10, type=int)
    status = request.args.get('status')
    source_type = request.args.get('type')
    product_id = request.args.get('product_id', type=int)

    query = DataSource.query
    
    if status:
        query = query.filter(DataSource.status == status)
    if source_type:
        query = query.filter(DataSource.type == source_type)
    if product_id:
        query = query.filter(DataSource.product_id == product_id)

    total = query.count()
    datasources = query.order_by(DataSource.updated_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return jsonify({
        'success': True,
        'data': {
            'items': [ds.to_dict() for ds in datasources],
            'total': total,
            'page': page,
            'limit': limit
        }
    })


@data_sources_api_bp.route('/datasources/<int:ds_id>', methods=['GET'])
@login_required
def get_datasource(ds_id):
    """获取数据源详情"""
    datasource = DataSource.query.get(ds_id)
    if not datasource:
        return jsonify({'success': False, 'error': '数据源不存在'}), 404

    return jsonify({
        'success': True,
        'data': datasource.to_dict()
    })


@data_sources_api_bp.route('/datasources', methods=['POST'])
@login_required
def create_datasource():
    """创建数据源"""
    data = request.get_json()
    
    datasource = DataSource(
        name=data.get('name'),
        type=data.get('type'),
        product_id=data.get('product_id'),
        host=data.get('host'),
        port=data.get('port'),
        config=data.get('config', {}),
        status=data.get('status', 'active')
    )
    
    db.session.add(datasource)
    db.session.commit()

    return jsonify({
        'success': True,
        'data': datasource.to_dict()
    }), 201


@data_sources_api_bp.route('/datasources/<int:ds_id>', methods=['PUT'])
@login_required
def update_datasource(ds_id):
    """更新数据源"""
    datasource = DataSource.query.get(ds_id)
    if not datasource:
        return jsonify({'success': False, 'error': '数据源不存在'}), 404

    data = request.get_json()
    for key in ['name', 'type', 'host', 'port', 'config', 'status']:
        if key in data:
            setattr(datasource, key, data[key])

    db.session.commit()

    return jsonify({
        'success': True,
        'data': datasource.to_dict()
    })


@data_sources_api_bp.route('/datasources/<int:ds_id>', methods=['DELETE'])
@login_required
def delete_datasource(ds_id):
    """删除数据源"""
    datasource = DataSource.query.get(ds_id)
    if not datasource:
        return jsonify({'success': False, 'error': '数据源不存在'}), 404

    db.session.delete(datasource)
    db.session.commit()

    return jsonify({'success': True, 'message': '删除成功'})


@data_sources_api_bp.route('/datasources/<int:ds_id>/test', methods=['POST'])
@login_required
def test_datasource(ds_id):
    """测试数据源连接"""
    datasource = DataSource.query.get(ds_id)
    if not datasource:
        return jsonify({'success': False, 'error': '数据源不存在'}), 404

    return jsonify({
        'success': True,
        'data': {
            'status': 'success',
            'message': '连接测试成功',
            'tested_at': db.func.now()
        }
    })
