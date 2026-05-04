from flask import Blueprint, request, jsonify
from app.database import db
from app.models import Product, Pipeline
from app.routes.auth import login_required
from datetime import datetime

products_bp = Blueprint('products', __name__)


@products_bp.route('', methods=['GET'])
@login_required
def list_products():
    """获取所有产品列表"""
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


@products_bp.route('/<int:id>', methods=['GET'])
@login_required
def get_product(id):
    """获取单个产品详情"""
    product = Product.query.get_or_404(id)
    data = product.to_dict()
    
    # 附加关联的解析管道
    data['pipelines'] = [p.to_dict() for p in product.pipelines]
    
    return jsonify({
        'success': True,
        'data': data
    })


@products_bp.route('', methods=['POST'])
@login_required
def create_product():
    """创建产品"""
    data = request.get_json()
    
    if not data or not data.get('name') or not data.get('code'):
        return jsonify({'success': False, 'error': '产品名称和代码不能为空'}), 400
    
    # 检查代码是否重复
    if Product.query.filter_by(code=data['code']).first():
        return jsonify({'success': False, 'error': '产品代码已存在'}), 400
    
    # 验证默认管道
    default_pipeline_id = data.get('default_pipeline_id')
    if default_pipeline_id:
        pipeline = Pipeline.query.get(default_pipeline_id)
        if not pipeline:
            return jsonify({'success': False, 'error': '指定的默认解析管道不存在'}), 400
    
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
        default_pipeline_id=default_pipeline_id
    )
    
    db.session.add(product)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': product.to_dict(),
        'message': '产品创建成功'
    }), 201


@products_bp.route('/<int:id>', methods=['PUT'])
@login_required
def update_product(id):
    """更新产品"""
    product = Product.query.get_or_404(id)
    data = request.get_json()
    
    if data.get('name'):
        product.name = data['name']
    if 'category' in data:
        product.category = data['category']
    if 'vendor' in data:
        product.vendor = data['vendor']
    if 'description' in data:
        product.description = data['description']
    if 'icon' in data:
        product.icon = data['icon']
    if 'default_severity' in data:
        product.default_severity = data['default_severity']
    if 'config' in data:
        product.config = data['config']
    if 'status' in data:
        product.status = data['status']
    if 'default_pipeline_id' in data:
        # 验证管道
        pipeline_id = data['default_pipeline_id']
        if pipeline_id:
            pipeline = Pipeline.query.get(pipeline_id)
            if not pipeline:
                return jsonify({'success': False, 'error': '指定的解析管道不存在'}), 400
        product.default_pipeline_id = pipeline_id
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': product.to_dict(),
        'message': '产品更新成功'
    })


@products_bp.route('/<int:id>', methods=['DELETE'])
@login_required
def delete_product(id):
    """删除产品"""
    product = Product.query.get_or_404(id)
    
    # 检查是否有关联的数据源
    if product.data_sources:
        return jsonify({
            'success': False, 
            'error': f'该产品已关联 {len(product.data_sources)} 个数据源，请先删除或迁移数据源'
        }), 400
    
    db.session.delete(product)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': '产品删除成功'
    })


@products_bp.route('/<int:id>/toggle', methods=['POST'])
@login_required
def toggle_product(id):
    """启用/禁用产品"""
    product = Product.query.get_or_404(id)
    
    product.status = 'inactive' if product.status == 'active' else 'active'
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': product.to_dict(),
        'message': f"产品已{'禁用' if product.status == 'inactive' else '启用'}"
    })


@products_bp.route('/<int:id>/pipelines', methods=['GET'])
@login_required
def list_product_pipelines(id):
    """获取产品的解析管道"""
    product = Product.query.get_or_404(id)
    
    pipelines = Pipeline.query.filter(
        (Pipeline.product_id == id) | (Pipeline.id == product.default_pipeline_id)
    ).order_by(Pipeline.priority.desc()).all()
    
    return jsonify({
        'success': True,
        'data': {
            'product': product.to_dict(),
            'pipelines': [p.to_dict() for p in pipelines],
            'default_pipeline': product.default_pipeline.to_dict() if product.default_pipeline else None
        }
    })


@products_bp.route('/<int:id>/pipelines', methods=['POST'])
@login_required
def create_product_pipeline(id):
    """为产品创建解析管道"""
    product = Product.query.get_or_404(id)
    data = request.get_json()
    
    if not data or not data.get('name'):
        return jsonify({'success': False, 'error': '管道名称不能为空'}), 400
    
    pipeline = Pipeline(
        name=data['name'],
        description=data.get('description'),
        product_id=id,  # 关联到产品
        input_format=data.get('input_format', 'json'),
        input_config=data.get('input_config', {}),
        field_mapping=data.get('field_mapping', {}),
        filter_rules=data.get('filter_rules', []),
        transform_rules=data.get('transform_rules', []),
        output_target=data.get('output_target', 'alerts'),
        output_config=data.get('output_config', {}),
        batch_size=data.get('batch_size', 100),
        parallel_workers=data.get('parallel_workers', 4),
        status=data.get('status', 'active'),
        priority=data.get('priority', 100)
    )
    
    db.session.add(pipeline)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': pipeline.to_dict(),
        'message': '解析管道创建成功'
    }), 201


@products_bp.route('/<int:id>/pipelines/default', methods=['PUT'])
@login_required
def set_default_pipeline(id):
    """设置产品默认解析管道"""
    product = Product.query.get_or_404(id)
    data = request.get_json()
    
    pipeline_id = data.get('pipeline_id')
    if not pipeline_id:
        return jsonify({'success': False, 'error': '请指定管道ID'}), 400
    
    pipeline = Pipeline.query.get(pipeline_id)
    if not pipeline:
        return jsonify({'success': False, 'error': '管道不存在'}), 400
    
    # 验证管道属于该产品
    if pipeline.product_id and pipeline.product_id != id:
        return jsonify({'success': False, 'error': '该管道不属于此产品'}), 400
    
    product.default_pipeline_id = pipeline_id
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': product.to_dict(),
        'message': '默认解析管道已设置'
    })


@products_bp.route('/categories', methods=['GET'])
@login_required
def list_categories():
    """获取产品类别列表"""
    categories = db.session.query(Product.category).distinct().filter(
        Product.category.isnot(None)
    ).all()
    
    return jsonify({
        'success': True,
        'data': [c[0] for c in categories if c[0]]
    })


@products_bp.route('/templates', methods=['GET'])
@login_required
def list_templates():
    """获取预设产品模板"""
    templates = [
        {
            'category': '网络安全',
            'products': [
                {'name': '防火墙', 'code': 'firewall', 'vendor': '多厂商', 'icon': 'shield'},
                {'name': 'WAF', 'code': 'waf', 'vendor': '多厂商', 'icon': 'shield-check'},
                {'name': '入侵检测/防御', 'code': 'ids_ips', 'vendor': '多厂商', 'icon': 'radar'},
                {'name': 'VPN', 'code': 'vpn', 'vendor': '多厂商', 'icon': 'lock'},
                {'name': '抗DDoS', 'code': 'ddos', 'vendor': '多厂商', 'icon': 'shield-alert'},
            ]
        },
        {
            'category': '主机安全',
            'products': [
                {'name': '主机入侵检测', 'code': 'hids', 'vendor': '多厂商', 'icon': 'server'},
                {'name': '主机安全审计', 'code': 'hsa', 'vendor': '多厂商', 'icon': 'file-check'},
                {'name': '终端检测响应', 'code': 'edr', 'vendor': '多厂商', 'icon': 'monitor'},
            ]
        },
        {
            'category': '运维安全',
            'products': [
                {'name': '堡垒机', 'code': 'bastion', 'vendor': '多厂商', 'icon': 'key'},
                {'name': '运维审计', 'code': 'oma', 'vendor': '多厂商', 'icon': 'clipboard-check'},
                {'name': '配置核查', 'code': 'config_audit', 'vendor': '多厂商', 'icon': 'settings'},
            ]
        },
        {
            'category': '数据安全',
            'products': [
                {'name': '数据库审计', 'code': 'dbaudit', 'vendor': '多厂商', 'icon': 'database'},
                {'name': '数据防泄漏', 'code': 'dlp', 'vendor': '多厂商', 'icon': 'file-warning'},
                {'name': '数据脱敏', 'code': 'masking', 'vendor': '多厂商', 'icon': 'eye-off'},
            ]
        },
        {
            'category': '应用安全',
            'products': [
                {'name': '代码审计', 'code': 'sast', 'vendor': '多厂商', 'icon': 'code'},
                {'name': 'Web扫描', 'code': 'dast', 'vendor': '多厂商', 'icon': 'globe'},
                {'name': 'API安全', 'code': 'api_gateway', 'vendor': '多厂商', 'icon': 'git-branch'},
            ]
        },
        {
            'category': '云安全',
            'products': [
                {'name': '云安全态势管理', 'code': 'cspm', 'vendor': '多厂商', 'icon': 'cloud'},
                {'name': '云工作负载保护', 'code': 'cwpp', 'vendor': '多厂商', 'icon': 'cloud-server'},
                {'name': '云访问安全代理', 'code': 'casb', 'vendor': '多厂商', 'icon': 'cloud-off'},
            ]
        },
        {
            'category': '威胁检测',
            'products': [
                {'name': '威胁情报平台', 'code': 'tip', 'vendor': '多厂商', 'icon': 'search'},
                {'name': '安全运营中心', 'code': 'soc', 'vendor': '多厂商', 'icon': 'activity'},
                {'name': 'SIEM', 'code': 'siem', 'vendor': '多厂商', 'icon': 'layers'},
            ]
        }
    ]
    
    return jsonify({
        'success': True,
        'data': templates
    })
