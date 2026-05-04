from flask import Blueprint, request, jsonify
from app.database import db
from app.models import (
    DataSource, Product, Pipeline, DataFormat,
    LogType, FormatTemplate, DataTable, LogClassifier,
    ClassifierRule, DataSourceConfig
)
from app.routes.auth import login_required
from datetime import datetime
import uuid

log_management_bp = Blueprint('log_management', __name__)


def generate_id(prefix=''):
    """生成唯一ID"""
    return f"{prefix}{uuid.uuid4().hex[:8]}"


# ==================== 数据源管理接口 ====================

@log_management_bp.route('/sources', methods=['GET'])
@login_required
def list_sources():
    """获取所有数据源"""
    status = request.args.get('status')
    source_type = request.args.get('type')
    
    query = DataSource.query
    
    if status:
        query = query.filter_by(status=status)
    if source_type:
        query = query.filter_by(type=source_type)
    
    sources = query.order_by(DataSource.name).all()
    
    return jsonify({
        'success': True,
        'data': [s.to_dict() for s in sources]
    })


@log_management_bp.route('/sources/<id>', methods=['GET'])
@login_required
def get_source(id):
    """获取单个数据源"""
    source = DataSource.query.get_or_404(id)
    return jsonify({
        'success': True,
        'data': source.to_dict()
    })


@log_management_bp.route('/sources', methods=['POST'])
@login_required
def create_source():
    """创建数据源"""
    data = request.get_json()
    
    if not data or not data.get('name'):
        return jsonify({'success': False, 'error': '数据源名称不能为空'}), 400
    
    if not data.get('type'):
        return jsonify({'success': False, 'error': '数据源类型不能为空'}), 400
    
    source = DataSource(
        name=data['name'],
        type=data['type'],
        host=data.get('host'),
        port=data.get('port'),
        description=data.get('description'),
        config=data.get('config', {}),
        status='disconnected'
    )
    
    db.session.add(source)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': source.to_dict(),
        'message': '数据源创建成功'
    }), 201


@log_management_bp.route('/sources/<id>', methods=['PUT'])
@login_required
def update_source(id):
    """更新数据源"""
    source = DataSource.query.get_or_404(id)
    data = request.get_json()
    
    if data.get('name'):
        source.name = data['name']
    if 'type' in data:
        source.type = data['type']
    if 'host' in data:
        source.host = data['host']
    if 'port' in data:
        source.port = data['port']
    if 'description' in data:
        source.description = data['description']
    if 'config' in data:
        source.config = data['config']
    if 'status' in data:
        source.status = data['status']
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': source.to_dict(),
        'message': '数据源更新成功'
    })


@log_management_bp.route('/sources/<id>', methods=['DELETE'])
@login_required
def delete_source(id):
    """删除数据源"""
    source = DataSource.query.get_or_404(id)
    
    # 检查是否有关联的管道
    if source.pipelines:
        return jsonify({
            'success': False,
            'error': '该数据源已关联解析管道，无法删除'
        }), 400
    
    db.session.delete(source)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': '数据源删除成功'
    })


@log_management_bp.route('/sources/<id>/test', methods=['POST'])
@login_required
def test_source_connection(id):
    """测试数据源连接"""
    source = DataSource.query.get_or_404(id)
    
    # 模拟连接测试
    # 实际应该根据不同类型进行真实连接测试
    try:
        # 这里可以实现真实的连接测试逻辑
        # 例如：
        # - file: 检查文件是否存在
        # - syslog: 测试UDP/TCP连接
        # - api: 测试API可访问性
        # - database: 测试数据库连接
        # - kafka: 测试Kafka连接
        
        # 模拟成功
        source.status = 'connected'
        source.last_sync = datetime.now().isoformat()
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': '连接测试成功',
            'data': source.to_dict()
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'连接测试失败：{str(e)}'
        }), 400


# ==================== 产品管理接口 ====================

@log_management_bp.route('/products', methods=['GET'])
@login_required
def list_products():
    """获取所有产品"""
    status = request.args.get('status')
    
    query = Product.query
    
    if status:
        query = query.filter_by(status=status)
    
    products = query.order_by(Product.name).all()
    
    # 统计每个产品的数据源数量
    result = []
    for product in products:
        product_dict = product.to_dict()
        product_dict['log_source_count'] = len(product.data_sources) if hasattr(product, 'data_sources') else 0
        result.append(product_dict)
    
    return jsonify({
        'success': True,
        'data': result
    })


@log_management_bp.route('/products/<id>', methods=['GET'])
@login_required
def get_product(id):
    """获取单个产品"""
    product = Product.query.get_or_404(id)
    product_dict = product.to_dict()
    product_dict['log_source_count'] = len(product.data_sources) if hasattr(product, 'data_sources') else 0
    return jsonify({
        'success': True,
        'data': product_dict
    })


@log_management_bp.route('/products', methods=['POST'])
@login_required
def create_product():
    """创建产品"""
    data = request.get_json()
    
    if not data or not data.get('name'):
        return jsonify({'success': False, 'error': '产品名称不能为空'}), 400
    
    if not data.get('code'):
        return jsonify({'success': False, 'error': '产品代码不能为空'}), 400
    
    # 检查代码是否重复
    existing = Product.query.filter_by(code=data['code']).first()
    if existing:
        return jsonify({'success': False, 'error': '产品代码已存在'}), 400
    
    product = Product(
        name=data['name'],
        code=data['code'],
        description=data.get('description'),
        status=data.get('status', 'active')
    )
    
    db.session.add(product)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': product.to_dict(),
        'message': '产品创建成功'
    }), 201


@log_management_bp.route('/products/<id>', methods=['PUT'])
@login_required
def update_product(id):
    """更新产品"""
    product = Product.query.get_or_404(id)
    data = request.get_json()
    
    if data.get('name'):
        product.name = data['name']
    if 'code' in data:
        # 检查代码是否重复
        existing = Product.query.filter_by(code=data['code']).first()
        if existing and existing.id != product.id:
            return jsonify({'success': False, 'error': '产品代码已存在'}), 400
        product.code = data['code']
    if 'description' in data:
        product.description = data['description']
    if 'status' in data:
        product.status = data['status']
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': product.to_dict(),
        'message': '产品更新成功'
    })


@log_management_bp.route('/products/<id>', methods=['DELETE'])
@login_required
def delete_product(id):
    """删除产品"""
    product = Product.query.get_or_404(id)
    
    # 检查是否有关联的数据源
    if product.data_sources:
        return jsonify({
            'success': False,
            'error': '该产品已关联数据源，无法删除'
        }), 400
    
    db.session.delete(product)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': '产品删除成功'
    })


# ==================== 统计接口 ====================

@log_management_bp.route('/stats', methods=['GET'])
@login_required
def get_stats():
    """获取日志管理统计信息"""
    try:
        stats = {
            'total_sources': DataSource.query.count(),
            'active_sources': DataSource.query.filter_by(status='connected').count(),
            'total_pipelines': Pipeline.query.count(),
            'active_pipelines': Pipeline.query.filter_by(status='active').count(),
            'total_formats': FormatTemplate.query.count(),
            'total_products': Product.query.count(),
            'total_logs_today': 0,  # 需要根据实际日志表计算
            'logs_by_source': []
        }
        
        # 按数据源统计日志数量
        sources = DataSource.query.all()
        for source in sources:
            stats['logs_by_source'].append({
                'id': source.id,
                'name': source.name,
                'type': source.type,
                'log_count': source.log_count or 0
            })
        
        return jsonify({
            'success': True,
            'data': stats
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'获取统计信息失败：{str(e)}'
        }), 500
