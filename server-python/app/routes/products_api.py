"""
产品管理 API 路由 (新版)
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import Product, Pipeline

products_api_bp = Blueprint('products_api', __name__)


@products_api_bp.route('/products', methods=['GET'])
@login_required
def list_products():
    """获取产品列表"""
    category = request.args.get('category')
    status = request.args.get('status', 'active')
    
    query = Product.query
    
    if category:
        query = query.filter_by(category=category)
    if status:
        query = query.filter_by(status=status)
    
    products = query.order_by(Product.name).all()
    
    return jsonify({
        'success': True,
        'data': {
            'products': [p.to_dict() for p in products],
            'total': len(products)
        }
    })


@products_api_bp.route('/products/<int:id>', methods=['GET'])
@login_required
def get_product(id):
    """获取产品详情"""
    product = Product.query.get(id)
    if not product:
        return jsonify({'success': False, 'error': '产品不存在'}), 404
    
    data = product.to_dict()
    data['pipelines'] = [p.to_dict() for p in product.pipelines]
    
    return jsonify({
        'success': True,
        'data': data
    })


@products_api_bp.route('/products', methods=['POST'])
@login_required
def create_product():
    """创建产品"""
    data = request.get_json()
    
    if not data or not data.get('name') or not data.get('code'):
        return jsonify({'success': False, 'error': '产品名称和代码不能为空'}), 400
    
    if Product.query.filter_by(code=data['code']).first():
        return jsonify({'success': False, 'error': '产品代码已存在'}), 400
    
    product = Product(
        name=data['name'],
        code=data['code'],
        category=data.get('category', '其他'),
        vendor=data.get('vendor'),
        description=data.get('description'),
        icon=data.get('icon'),
        default_severity=data.get('default_severity', 3),
        config=data.get('config', {}),
        status=data.get('status', 'active'),
        default_pipeline_id=data.get('default_pipeline_id')
    )
    
    db.session.add(product)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': product.to_dict()
    }), 201


@products_api_bp.route('/products/<int:id>', methods=['PUT'])
@login_required
def update_product(id):
    """更新产品"""
    product = Product.query.get(id)
    if not product:
        return jsonify({'success': False, 'error': '产品不存在'}), 404
    
    data = request.get_json()
    
    if data.get('name'):
        product.name = data['name']
    if 'category' in data:
        product.category = data['category']
    if 'vendor' in data:
        product.vendor = data['vendor']
    if 'description' in data:
        product.description = data['description']
    if 'status' in data:
        product.status = data['status']
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': product.to_dict()
    })


@products_api_bp.route('/products/<int:id>', methods=['DELETE'])
@login_required
def delete_product(id):
    """删除产品"""
    product = Product.query.get(id)
    if not product:
        return jsonify({'success': False, 'error': '产品不存在'}), 404
    
    db.session.delete(product)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': '产品删除成功'
    })


@products_api_bp.route('/products/<int:id>/toggle', methods=['POST'])
@login_required
def toggle_product(id):
    """启用/禁用产品"""
    product = Product.query.get(id)
    if not product:
        return jsonify({'success': False, 'error': '产品不存在'}), 404
    
    product.status = 'inactive' if product.status == 'active' else 'active'
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': product.to_dict()
    })
