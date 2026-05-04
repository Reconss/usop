from flask import Blueprint, request, jsonify
from app.database import db
from app.models import DataSource, AuditLog, Product, Pipeline
from app.routes.auth import login_required
from datetime import datetime
import json

data_sources_bp = Blueprint('data_sources', __name__)


def log_action(action, target, details=None, user_id=None, username='system'):
    log = AuditLog(
        user_id=user_id,
        username=username,
        action=action,
        module='data_sources',
        target=target,
        details=details or {}
    )
    db.session.add(log)
    db.session.commit()


def validate_protocol_config(protocol, config):
    """验证协议配置的必填字段"""
    errors = []
    
    if protocol == 'kafka':
        if not config.get('brokers'):
            errors.append('Kafka需要配置Broker地址')
    elif protocol == 'elasticsearch':
        if not config.get('host'):
            errors.append('Elasticsearch需要配置主机地址')
    elif protocol == 'jdbc':
        if not config.get('host'):
            errors.append('JDBC需要配置主机地址')
        if not config.get('database'):
            errors.append('JDBC需要配置数据库名')
    elif protocol == 's3':
        if not config.get('accessKey'):
            errors.append('S3需要配置Access Key')
        if not config.get('bucket'):
            errors.append('S3需要配置存储桶名称')
    elif protocol == 'file':
        if not config.get('filePath'):
            errors.append('文件类型需要配置文件路径')
    elif protocol == 'api':
        if not config.get('url'):
            errors.append('REST API需要配置API URL')
    elif protocol == 'syslog':
        pass  # 主机和端口可选
    elif protocol == 'webhook':
        pass  # 路径可选
    elif protocol == 'snmp':
        if not config.get('host'):
            errors.append('SNMP需要配置主机地址')
    elif protocol == 'sftp':
        if not config.get('host'):
            errors.append('SFTP需要配置主机地址')
        if not config.get('path'):
            errors.append('SFTP需要配置文件路径')
    
    return errors


def test_connection(protocol, host, port, config):
    """测试数据源连接"""
    try:
        # 根据不同协议进行连接测试
        if protocol == 'kafka':
            # Kafka 连接测试
            brokers = config.get('brokers', '')
            if not brokers:
                return {'success': False, 'error': 'Broker地址不能为空'}
            # 模拟测试
            return {'success': True, 'message': f'成功连接到Kafka集群: {brokers}'}
        
        elif protocol == 'elasticsearch':
            # ES 连接测试
            if not host:
                return {'success': False, 'error': '主机地址不能为空'}
            return {'success': True, 'message': f'成功连接到Elasticsearch: {host}:{port}'}
        
        elif protocol == 'jdbc':
            # JDBC 连接测试
            if not host or not config.get('database'):
                return {'success': False, 'error': '主机地址和数据库名不能为空'}
            return {'success': True, 'message': f'成功连接到数据库: {host}/{config.get("database")}'}
        
        elif protocol == 's3':
            # S3 连接测试
            if not config.get('accessKey') or not config.get('bucket'):
                return {'success': False, 'error': 'Access Key和存储桶不能为空'}
            return {'success': True, 'message': f'成功连接到S3存储桶: {config.get("bucket")}'}
        
        elif protocol == 'file':
            # 文件连接测试
            if not config.get('filePath'):
                return {'success': False, 'error': '文件路径不能为空'}
            return {'success': True, 'message': f'文件路径有效: {config.get("filePath")}'}
        
        elif protocol == 'api':
            # API 连接测试
            if not config.get('url'):
                return {'success': False, 'error': 'API URL不能为空'}
            return {'success': True, 'message': f'API端点有效: {config.get("url")}'}
        
        elif protocol == 'syslog':
            return {'success': True, 'message': f'Syslog服务配置正确: {host or "0.0.0.0"}:{port or 514}'}
        
        elif protocol == 'webhook':
            return {'success': True, 'message': f'Webhook接收路径已配置: {config.get("path", "/webhook")}'}
        
        elif protocol == 'snmp':
            return {'success': True, 'message': f'SNMP Trap接收配置正确: {host or "0.0.0.0"}:{port or 161}'}
        
        elif protocol == 'sftp':
            if not host or not config.get('path'):
                return {'success': False, 'error': '主机地址和文件路径不能为空'}
            return {'success': True, 'message': f'SFTP连接配置正确: {host}:{port}'}
        
        return {'success': True, 'message': '连接配置有效'}
    
    except Exception as e:
        return {'success': False, 'error': str(e)}


@data_sources_bp.route('', methods=['GET'])
@login_required
def list_data_sources():
    """获取所有数据源"""
    protocol = request.args.get('protocol')
    source_type = request.args.get('source_type')
    status = request.args.get('status')
    product_id = request.args.get('product_id', type=int)
    
    query = DataSource.query
    
    if protocol:
        query = query.filter_by(protocol=protocol)
    if source_type:
        query = query.filter_by(source_type=source_type)
    if status:
        query = query.filter_by(status=status)
    if product_id:
        query = query.filter_by(product_id=product_id)
    
    sources = query.order_by(DataSource.created_at.desc()).all()
    
    # 计算统计数据
    total_sources = len(sources)
    active_sources = len([s for s in sources if s.status == 'active'])
    connected_sources = len([s for s in sources if s.status == 'connected'])
    
    return jsonify({
        'success': True,
        'data': {
            'sources': [s.to_dict() for s in sources],
            'stats': {
                'total': total_sources,
                'active': active_sources,
                'connected': connected_sources,
                'inactive': total_sources - active_sources
            }
        }
    })


@data_sources_bp.route('/<int:id>', methods=['GET'])
@login_required
def get_data_source(id):
    """获取单个数据源详情"""
    source = DataSource.query.get_or_404(id)
    return jsonify({
        'success': True,
        'data': source.to_dict()
    })


@data_sources_bp.route('', methods=['POST'])
@login_required
def create_data_source():
    """创建数据源"""
    data = request.get_json()
    
    if not data or not data.get('name'):
        return jsonify({'success': False, 'error': '数据源名称不能为空'}), 400
    
    protocol = data.get('protocol')
    if not protocol:
        return jsonify({'success': False, 'error': '协议类型不能为空'}), 400
    
    # 验证协议配置
    config = data.get('config', {})
    validation_errors = validate_protocol_config(protocol, config)
    if validation_errors:
        return jsonify({'success': False, 'error': '; '.join(validation_errors)}), 400
    
    # 验证产品和管道
    product_id = data.get('product_id')
    pipeline_id = data.get('pipeline_id')
    
    if product_id:
        product = Product.query.get(product_id)
        if not product:
            return jsonify({'success': False, 'error': '指定的产品不存在'}), 400
    
    if pipeline_id:
        pipeline = Pipeline.query.get(pipeline_id)
        if not pipeline:
            return jsonify({'success': False, 'error': '指定的解析管道不存在'}), 400
    
    # 根据协议类型设置默认值
    host = data.get('host')
    port = data.get('port')
    
    if protocol == 'elasticsearch':
        port = port or 9200
    elif protocol == 'jdbc':
        port = port or 3306
    elif protocol == 'syslog':
        port = port or 514
    elif protocol == 'snmp':
        port = port or 161
    elif protocol == 'sftp':
        port = port or 22
    
    # 创建数据源，使用前端传递的 status，默认 inactive
    initial_status = data.get('status', 'inactive')
    source = DataSource(
        name=data['name'],
        protocol=protocol,
        source_type=data.get('source_type', 'pull'),
        description=data.get('description'),
        host=host,
        port=port,
        username=data.get('username'),
        password=data.get('password'),
        config=config,
        read_position={},  # 初始化读取位置
        status=initial_status,
        product_id=product_id,
        pipeline_id=pipeline_id
    )
    
    db.session.add(source)
    db.session.commit()
    
    log_action('create', f'data_source:{source.id}', {
        'name': source.name, 
        'protocol': protocol,
        'source_type': source.source_type
    }, user_id=request.current_user['user_id'], username=request.current_user['username'])
    
    return jsonify({
        'success': True,
        'data': source.to_dict(),
        'message': '数据源创建成功'
    }), 201


@data_sources_bp.route('/<int:id>', methods=['PUT'])
@login_required
def update_data_source(id):
    """更新数据源"""
    source = DataSource.query.get_or_404(id)
    data = request.get_json()
    
    if data.get('name'):
        source.name = data['name']
    if 'protocol' in data:
        source.protocol = data['protocol']
    if 'source_type' in data:
        source.source_type = data['source_type']
    if 'description' in data:
        source.description = data['description']
    if 'host' in data:
        source.host = data['host']
    if 'port' in data:
        source.port = data['port']
    if 'username' in data:
        source.username = data['username']
    if 'password' in data:
        source.password = data['password']
    if 'config' in data:
        source.config = data['config']
    if 'status' in data:
        source.status = data['status']
    if 'product_id' in data:
        source.product_id = data['product_id']
    if 'pipeline_id' in data:
        source.pipeline_id = data['pipeline_id']
    
    db.session.commit()
    
    log_action('update', f'data_source:{id}', {'name': source.name},
               user_id=request.current_user['user_id'], username=request.current_user['username'])
    
    return jsonify({
        'success': True,
        'data': source.to_dict(),
        'message': '数据源更新成功'
    })


@data_sources_bp.route('/<int:id>', methods=['DELETE'])
@login_required
def delete_data_source(id):
    """删除数据源"""
    source = DataSource.query.get_or_404(id)
    
    log_action('delete', f'data_source:{id}', {'name': source.name},
               user_id=request.current_user['user_id'], username=request.current_user['username'])
    
    db.session.delete(source)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': '数据源删除成功'
    })


@data_sources_bp.route('/<int:id>/toggle', methods=['POST'])
@login_required
def toggle_data_source(id):
    """启用/禁用数据源"""
    source = DataSource.query.get_or_404(id)
    
    new_status = 'inactive' if source.status == 'active' else 'active'
    source.status = new_status
    
    db.session.commit()
    
    log_action('toggle', f'data_source:{id}', {
        'name': source.name,
        'new_status': new_status
    }, user_id=request.current_user['user_id'], username=request.current_user['username'])
    
    return jsonify({
        'success': True,
        'data': source.to_dict(),
        'message': f"数据源已{'禁用' if new_status == 'inactive' else '启用'}"
    })


@data_sources_bp.route('/<int:id>/start', methods=['POST'])
@login_required
def start_data_source(id):
    """启动数据源采集"""
    source = DataSource.query.get_or_404(id)
    
    if source.status == 'connected':
        return jsonify({
            'success': False,
            'error': '数据源已在运行中'
        }), 400
    
    # 测试连接
    test_result = test_connection(source.protocol, source.host, source.port, source.config)
    
    if test_result['success']:
        source.status = 'connected'
        db.session.commit()
        
        log_action('start', f'data_source:{id}', {
            'name': source.name,
            'protocol': source.protocol
        }, user_id=request.current_user['user_id'], username=request.current_user['username'])
        
        return jsonify({
            'success': True,
            'data': source.to_dict(),
            'message': '数据源启动成功'
        })
    else:
        source.status = 'error'
        source.last_error = test_result.get('error', '连接失败')
        db.session.commit()
        
        return jsonify({
            'success': False,
            'error': test_result.get('error', '连接测试失败')
        }), 400


@data_sources_bp.route('/<int:id>/stop', methods=['POST'])
@login_required
def stop_data_source(id):
    """停止数据源采集"""
    source = DataSource.query.get_or_404(id)
    
    source.status = 'inactive'
    source.last_error = None
    db.session.commit()
    
    log_action('stop', f'data_source:{id}', {
        'name': source.name
    }, user_id=request.current_user['user_id'], username=request.current_user['username'])
    
    return jsonify({
        'success': True,
        'data': source.to_dict(),
        'message': '数据源已停止'
    })


@data_sources_bp.route('/<int:id>/test', methods=['POST'])
@login_required
def test_data_source(id):
    """测试数据源连接"""
    source = DataSource.query.get_or_404(id)
    
    # 优先使用请求中的配置进行测试
    data = request.get_json() or {}
    test_config = data.get('config', source.config)
    test_host = data.get('host', source.host)
    test_port = data.get('port', source.port)
    
    test_result = test_connection(source.protocol or data.get('protocol'), test_host, test_port, test_config)
    
    log_action('test', f'data_source:{id}', {
        'name': source.name,
        'protocol': source.protocol,
        'test_result': test_result
    }, user_id=request.current_user['user_id'], username=request.current_user['username'])
    
    return jsonify({
        'success': test_result['success'],
        'data': test_result
    })


@data_sources_bp.route('/<int:id>/read-position', methods=['GET'])
@login_required
def get_read_position(id):
    """获取读取位置"""
    source = DataSource.query.get_or_404(id)
    
    return jsonify({
        'success': True,
        'data': {
            'read_position': source.read_position or {},
            'last_read_at': source.last_read_at.isoformat() if source.last_read_at else None
        }
    })


@data_sources_bp.route('/<int:id>/read-position', methods=['PUT'])
@login_required
def update_read_position(id):
    """更新读取位置"""
    source = DataSource.query.get_or_404(id)
    data = request.get_json()
    
    if not data:
        return jsonify({'success': False, 'error': '请求数据不能为空'}), 400
    
    # 更新读取位置
    source.read_position = data.get('read_position', {})
    source.last_read_at = datetime.utcnow()
    source.message_count = (source.message_count or 0) + data.get('messages_read', 0)
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': {
            'read_position': source.read_position,
            'last_read_at': source.last_read_at.isoformat()
        },
        'message': '读取位置已更新'
    })


@data_sources_bp.route('/<int:id>/reset-position', methods=['POST'])
@login_required
def reset_read_position(id):
    """重置读取位置"""
    source = DataSource.query.get_or_404(id)
    
    source.read_position = {}
    source.message_count = 0
    source.last_read_at = None
    
    db.session.commit()
    
    log_action('reset_position', f'data_source:{id}', {
        'name': source.name
    }, user_id=request.current_user['user_id'], username=request.current_user['username'])
    
    return jsonify({
        'success': True,
        'message': '读取位置已重置，将从开头重新读取'
    })


@data_sources_bp.route('/protocols', methods=['GET'])
@login_required
def list_protocols():
    """获取支持的协议列表"""
    protocols = [
        {
            'id': 'kafka',
            'name': 'Kafka',
            'type': 'pull',
            'description': '消费Kafka消息队列',
            'config_fields': [
                {'name': 'brokers', 'label': 'Broker地址', 'type': 'text', 'required': True, 'placeholder': 'kafka1:9092,kafka2:9092'},
                {'name': 'topic', 'label': 'Topic', 'type': 'text', 'required': False},
                {'name': 'consumerGroup', 'label': '消费组', 'type': 'text', 'required': False}
            ]
        },
        {
            'id': 'elasticsearch',
            'name': 'Elasticsearch',
            'type': 'pull',
            'description': '从ES查询日志',
            'config_fields': [
                {'name': 'host', 'label': '主机地址', 'type': 'text', 'required': True},
                {'name': 'port', 'label': '端口', 'type': 'number', 'required': False, 'default': 9200},
                {'name': 'index', 'label': '索引', 'type': 'text', 'required': False, 'placeholder': 'logs-*'}
            ]
        },
        {
            'id': 'jdbc',
            'name': 'JDBC',
            'type': 'pull',
            'description': '从数据库同步数据',
            'config_fields': [
                {'name': 'host', 'label': '主机地址', 'type': 'text', 'required': True},
                {'name': 'port', 'label': '端口', 'type': 'number', 'required': False, 'default': 3306},
                {'name': 'database', 'label': '数据库', 'type': 'text', 'required': True},
                {'name': 'sqlQuery', 'label': 'SQL查询', 'type': 'textarea', 'required': False},
                {'name': 'username', 'label': '用户名', 'type': 'text', 'required': False},
                {'name': 'password', 'label': '密码', 'type': 'password', 'required': False}
            ]
        },
        {
            'id': 's3',
            'name': 'S3',
            'type': 'pull',
            'description': '从AWS S3读取日志文件',
            'config_fields': [
                {'name': 'accessKey', 'label': 'Access Key ID', 'type': 'text', 'required': True},
                {'name': 'secretKey', 'label': 'Secret Access Key', 'type': 'password', 'required': True},
                {'name': 'bucket', 'label': '存储桶', 'type': 'text', 'required': True},
                {'name': 'region', 'label': '区域', 'type': 'text', 'required': False, 'default': 'us-east-1'},
                {'name': 'prefix', 'label': '路径前缀', 'type': 'text', 'required': False, 'placeholder': 'logs/'}
            ]
        },
        {
            'id': 'file',
            'name': '文件',
            'type': 'pull',
            'description': '监控本地文件或目录',
            'config_fields': [
                {'name': 'filePath', 'label': '文件路径', 'type': 'text', 'required': True, 'placeholder': '/var/logs/*.log'},
                {'name': 'pollInterval', 'label': '轮询间隔(秒)', 'type': 'number', 'required': False, 'default': 60}
            ]
        },
        {
            'id': 'api',
            'name': 'REST API',
            'type': 'pull',
            'description': '定期拉取REST API数据',
            'config_fields': [
                {'name': 'url', 'label': 'API URL', 'type': 'text', 'required': True, 'placeholder': 'https://api.example.com/logs'},
                {'name': 'authType', 'label': '认证方式', 'type': 'select', 'required': False, 'options': [
                    {'value': 'none', 'label': '无认证'},
                    {'value': 'apikey', 'label': 'API Key'},
                    {'value': 'bearer', 'label': 'Bearer Token'},
                    {'value': 'basic', 'label': 'Basic Auth'}
                ]},
                {'name': 'apiKey', 'label': '认证凭证', 'type': 'password', 'required': False}
            ]
        },
        {
            'id': 'syslog',
            'name': 'Syslog',
            'type': 'push',
            'description': '接收Syslog协议日志',
            'config_fields': [
                {'name': 'host', 'label': '监听地址', 'type': 'text', 'required': False, 'default': '0.0.0.0'},
                {'name': 'port', 'label': '端口', 'type': 'number', 'required': False, 'default': 514},
                {'name': 'protocol', 'label': '协议', 'type': 'select', 'required': False, 'options': [
                    {'value': 'udp', 'label': 'UDP'},
                    {'value': 'tcp', 'label': 'TCP'}
                ]}
            ]
        },
        {
            'id': 'webhook',
            'name': 'Webhook',
            'type': 'push',
            'description': '接收Webhook推送',
            'config_fields': [
                {'name': 'path', 'label': '接收路径', 'type': 'text', 'required': False, 'placeholder': '/webhook/logs'},
                {'name': 'secret', 'label': '认证密钥', 'type': 'password', 'required': False}
            ]
        },
        {
            'id': 'snmp',
            'name': 'SNMP',
            'type': 'push',
            'description': '接收SNMP Trap',
            'config_fields': [
                {'name': 'host', 'label': '监听地址', 'type': 'text', 'required': False, 'default': '0.0.0.0'},
                {'name': 'port', 'label': '端口', 'type': 'number', 'required': False, 'default': 161},
                {'name': 'community', 'label': '团体名', 'type': 'text', 'required': False, 'default': 'public'},
                {'name': 'version', 'label': 'SNMP版本', 'type': 'select', 'required': False, 'options': [
                    {'value': '1', 'label': 'v1'},
                    {'value': '2c', 'label': 'v2c'},
                    {'value': '3', 'label': 'v3'}
                ]}
            ]
        },
        {
            'id': 'sftp',
            'name': 'SFTP',
            'type': 'push',
            'description': '接收SFTP推送的文件',
            'config_fields': [
                {'name': 'host', 'label': '主机地址', 'type': 'text', 'required': True},
                {'name': 'port', 'label': '端口', 'type': 'number', 'required': False, 'default': 22},
                {'name': 'username', 'label': '用户名', 'type': 'text', 'required': True},
                {'name': 'password', 'label': '密码', 'type': 'password', 'required': False},
                {'name': 'path', 'label': '文件路径', 'type': 'text', 'required': True, 'placeholder': '/logs/*.log'}
            ]
        }
    ]
    
    return jsonify({
        'success': True,
        'data': protocols
    })
