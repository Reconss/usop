from flask import Blueprint, request, jsonify
from app.database import db
from app.models import SystemConfig, DataSource, AuditLog
from app.routes.auth import login_required

config_bp = Blueprint('config', __name__)


# ============ System Config ============

@config_bp.route('/config', methods=['GET'])
@login_required
def get_config():
    configs = SystemConfig.query.all()
    return jsonify({
        'success': True,
        'data': {
            'items': [c.to_dict() for c in configs],
            'total': len(configs)
        }
    })


@config_bp.route('/config/<key>', methods=['GET'])
@login_required
def get_config_by_key(key):
    config = SystemConfig.query.filter_by(key=key).first()
    if not config:
        return jsonify({'success': False, 'error': '配置不存在'}), 404

    return jsonify({
        'success': True,
        'data': config.to_dict()
    })


@config_bp.route('/config/<key>', methods=['PUT'])
@login_required
def update_config(key):
    data = request.get_json()
    value = data.get('value')

    config = SystemConfig.query.filter_by(key=key).first()
    if not config:
        config = SystemConfig(key=key, value=value, category=data.get('category', 'general'))
        db.session.add(config)
    else:
        config.value = value

    db.session.commit()

    return jsonify({
        'success': True,
        'data': config.to_dict()
    })


@config_bp.route('/config/batch', methods=['POST'])
@login_required
def batch_update_config():
    data = request.get_json()
    items = data.get('items', [])

    for item in items:
        key = item.get('key')
        value = item.get('value')
        category = item.get('category', 'general')

        config = SystemConfig.query.filter_by(key=key).first()
        if config:
            config.value = value
        else:
            config = SystemConfig(key=key, value=value, category=category)
            db.session.add(config)

    db.session.commit()

    return jsonify({
        'success': True,
        'message': '批量更新成功'
    })


@config_bp.route('/config/categories/list', methods=['GET'])
@login_required
def list_config_categories():
    categories = db.session.query(SystemConfig.category).distinct().all()
    return jsonify({
        'success': True,
        'data': [{'id': c[0], 'name': c[0]} for c in categories if c[0]]
    })


# ============ Data Sources ============

@config_bp.route('/datasources', methods=['GET'])
@login_required
def list_datasources():
    datasources = DataSource.query.all()
    return jsonify({
        'success': True,
        'data': {
            'items': [ds.to_dict() for ds in datasources],
            'total': len(datasources)
        }
    })


@config_bp.route('/datasources/<int:ds_id>', methods=['GET'])
@login_required
def get_datasource(ds_id):
    ds = DataSource.query.get(ds_id)
    if not ds:
        return jsonify({'success': False, 'error': '数据源不存在'}), 404

    return jsonify({
        'success': True,
        'data': ds.to_dict()
    })


@config_bp.route('/datasources', methods=['POST'])
@login_required
def create_datasource():
    data = request.get_json()
    ds = DataSource(
        name=data.get('name'),
        type=data.get('type'),
        host=data.get('host'),
        port=data.get('port'),
        database=data.get('database'),
        username=data.get('username'),
        password=data.get('password'),
        config=data.get('config', {}),
        status='active'
    )
    db.session.add(ds)
    db.session.commit()

    return jsonify({
        'success': True,
        'data': ds.to_dict()
    }), 201


@config_bp.route('/datasources/<int:ds_id>', methods=['PUT'])
@login_required
def update_datasource(ds_id):
    ds = DataSource.query.get(ds_id)
    if not ds:
        return jsonify({'success': False, 'error': '数据源不存在'}), 404

    data = request.get_json()
    for key in ['name', 'type', 'host', 'port', 'database', 'username', 'password', 'config', 'status']:
        if key in data:
            setattr(ds, key, data[key])

    db.session.commit()

    return jsonify({
        'success': True,
        'data': ds.to_dict()
    })


@config_bp.route('/datasources/<int:ds_id>', methods=['DELETE'])
@login_required
def delete_datasource(ds_id):
    ds = DataSource.query.get(ds_id)
    if not ds:
        return jsonify({'success': False, 'error': '数据源不存在'}), 404

    db.session.delete(ds)
    db.session.commit()

    return jsonify({'success': True, 'message': '删除成功'})


@config_bp.route('/datasources/<int:ds_id>/test', methods=['POST'])
@login_required
def test_datasource(ds_id):
    ds = DataSource.query.get(ds_id)
    if not ds:
        return jsonify({'success': False, 'error': '数据源不存在'}), 404

    # Simulate connection test
    return jsonify({
        'success': True,
        'data': {
            'connected': True,
            'message': '连接测试成功',
            'latency': '12ms'
        }
    })


@config_bp.route('/datasources/types/list', methods=['GET'])
@login_required
def list_datasource_types():
    return jsonify({
        'success': True,
        'data': [
            {'id': 'timescaledb', 'name': 'TimescaleDB'},
            {'id': 'postgresql', 'name': 'PostgreSQL'},
            {'id': 'kafka', 'name': 'Kafka'},
            {'id': 'syslog', 'name': 'Syslog'},
            {'id': 'api', 'name': 'API'},
            {'id': 'webhook', 'name': 'Webhook'}
        ]
    })


# ============ Notification Settings ============

@config_bp.route('/notify/test-email', methods=['POST'])
@login_required
def test_email():
    data = request.get_json()
    email = data.get('email')

    if not email:
        return jsonify({'success': False, 'error': '邮箱地址不能为空'}), 400

    # Simulate email test
    return jsonify({
        'success': True,
        'message': f'测试邮件已发送到 {email}'
    })


@config_bp.route('/notify/test-dingtalk', methods=['POST'])
@login_required
def test_dingtalk():
    data = request.get_json()
    webhook = data.get('webhook')

    if not webhook:
        return jsonify({'success': False, 'error': '钉钉Webhook不能为空'}), 400

    # Simulate dingtalk test
    return jsonify({
        'success': True,
        'message': '钉钉测试消息发送成功'
    })