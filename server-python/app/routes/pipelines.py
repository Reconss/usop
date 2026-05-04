from flask import Blueprint, request, jsonify
from app.database import db
from app.models import Pipeline, DataSource, Product, DataFormat
from app.routes.auth import login_required
from app.utils.parser import LogProcessor, PRODUCT_PRESETS
from app.utils.collector import collector_manager, create_collector
from datetime import datetime
import threading
import uuid

pipelines_bp = Blueprint('pipelines', __name__)


@pipelines_bp.route('', methods=['GET'])
@login_required
def list_pipelines():
    """获取所有解析管道"""
    status = request.args.get('status')
    product_id = request.args.get('product_id', type=int)
    
    query = Pipeline.query
    
    if status:
        query = query.filter_by(status=status)
    if product_id:
        query = query.filter_by(product_id=product_id)
    
    pipelines = query.order_by(Pipeline.priority.desc(), Pipeline.name).all()
    
    return jsonify({
        'success': True,
        'data': {
            'pipelines': [p.to_dict() for p in pipelines],
            'total': len(pipelines)
        }
    })


@pipelines_bp.route('/<int:id>', methods=['GET'])
@login_required
def get_pipeline(id):
    """获取单个管道详情"""
    pipeline = Pipeline.query.get_or_404(id)
    return jsonify({
        'success': True,
        'data': pipeline.to_dict()
    })


@pipelines_bp.route('', methods=['POST'])
@login_required
def create_pipeline():
    """创建解析管道"""
    data = request.get_json()
    
    if not data or not data.get('name'):
        return jsonify({'success': False, 'error': '管道名称不能为空'}), 400
    
    # 验证产品存在
    product_id = data.get('product_id')
    if product_id:
        product = Product.query.get(product_id)
        if not product:
            return jsonify({'success': False, 'error': '产品不存在'}), 400
    
    # 验证格式模板存在
    format_id = data.get('format_id')
    if format_id:
        from app.models import FormatTemplate
        format_template = FormatTemplate.query.get(format_id)
        if not format_template:
            return jsonify({'success': False, 'error': '格式模板不存在'}), 400
    
    # 验证下一管道是否存在
    next_pipeline_id = data.get('next_pipeline_id')
    if next_pipeline_id:
        next_pipeline = Pipeline.query.get(next_pipeline_id)
        if not next_pipeline:
            return jsonify({'success': False, 'error': '下一管道不存在'}), 400

    pipeline = Pipeline(
        name=data['name'],
        description=data.get('description'),
        product_id=product_id,
        format_id=format_id,
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
        priority=data.get('priority', 100),
        match_conditions=data.get('match_conditions', []),
        rule_type=data.get('rule_type', 'exclusive'),
        next_pipeline_id=next_pipeline_id
    )
    
    db.session.add(pipeline)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': pipeline.to_dict(),
        'message': '解析管道创建成功'
    }), 201


@pipelines_bp.route('/<int:id>', methods=['PUT'])
@login_required
def update_pipeline(id):
    """更新解析管道"""
    pipeline = Pipeline.query.get_or_404(id)
    data = request.get_json()
    
    if data.get('name'):
        pipeline.name = data['name']
    if 'description' in data:
        pipeline.description = data['description']
    if 'product_id' in data:
        pipeline.product_id = data['product_id']
    if 'format_id' in data:
        # 验证格式模板存在
        if data['format_id']:
            from app.models import FormatTemplate
            format_template = FormatTemplate.query.get(data['format_id'])
            if not format_template:
                return jsonify({'success': False, 'error': '格式模板不存在'}), 400
        pipeline.format_id = data['format_id']
    if 'input_format' in data:
        pipeline.input_format = data['input_format']
    if 'input_config' in data:
        pipeline.input_config = data['input_config']
    if 'field_mapping' in data:
        pipeline.field_mapping = data['field_mapping']
    if 'filter_rules' in data:
        pipeline.filter_rules = data['filter_rules']
    if 'transform_rules' in data:
        pipeline.transform_rules = data['transform_rules']
    if 'output_target' in data:
        pipeline.output_target = data['output_target']
    if 'output_config' in data:
        pipeline.output_config = data['output_config']
    if 'batch_size' in data:
        pipeline.batch_size = data['batch_size']
    if 'parallel_workers' in data:
        pipeline.parallel_workers = data['parallel_workers']
    if 'status' in data:
        pipeline.status = data['status']
    if 'priority' in data:
        pipeline.priority = data['priority']
    if 'match_conditions' in data:
        pipeline.match_conditions = data['match_conditions']
    if 'rule_type' in data:
        pipeline.rule_type = data['rule_type']
    if 'next_pipeline_id' in data:
        # 验证下一管道是否存在
        if data['next_pipeline_id']:
            next_pipeline = Pipeline.query.get(data['next_pipeline_id'])
            if not next_pipeline:
                return jsonify({'success': False, 'error': '下一管道不存在'}), 400
            if next_pipeline.id == pipeline.id:
                return jsonify({'success': False, 'error': '不能将管道串联到自己'}), 400
        pipeline.next_pipeline_id = data['next_pipeline_id']

    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': pipeline.to_dict(),
        'message': '解析管道更新成功'
    })


@pipelines_bp.route('/<int:id>', methods=['DELETE'])
@login_required
def delete_pipeline(id):
    """删除解析管道"""
    pipeline = Pipeline.query.get_or_404(id)
    
    if pipeline.data_sources:
        return jsonify({
            'success': False,
            'error': f'该管道已关联 {len(pipeline.data_sources)} 个数据源，请先删除或迁移'
        }), 400
    
    db.session.delete(pipeline)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': '解析管道删除成功'
    })


@pipelines_bp.route('/<int:id>/toggle', methods=['POST'])
@login_required
def toggle_pipeline(id):
    """启用/禁用管道"""
    pipeline = Pipeline.query.get_or_404(id)
    
    pipeline.status = 'inactive' if pipeline.status == 'active' else 'active'
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': pipeline.to_dict(),
        'message': f"管道已{'禁用' if pipeline.status == 'inactive' else '启用'}"
    })


@pipelines_bp.route('/parse', methods=['POST'])
@login_required
def parse_logs():
    """解析日志数据"""
    data = request.get_json()
    
    if not data or not data.get('logs'):
        return jsonify({'success': False, 'error': '请提供日志数据'}), 400
    
    logs = data['logs'] if isinstance(data['logs'], list) else [data['logs']]
    format_type = data.get('format', 'json')
    config = data.get('config', {})
    pipeline_id = data.get('pipeline_id')
    field_mapping = data.get('field_mapping', {})
    
    # 如果指定了管道，使用管道的配置
    if pipeline_id:
        pipeline = Pipeline.query.get(pipeline_id)
        if pipeline:
            format_type = pipeline.input_format
            config = pipeline.input_config
            field_mapping = pipeline.field_mapping or {}
    
    processor = LogProcessor(format_type, config)
    results = []
    
    for raw_log in logs:
        if not raw_log.strip():
            continue
        
        try:
            parsed = processor.process(raw_log)
            if parsed:
                # 应用自定义字段映射
                if field_mapping:
                    parsed = apply_field_mapping(parsed, field_mapping)
                results.append({
                    'success': True,
                    'original': raw_log,
                    'parsed': parsed
                })
            else:
                results.append({
                    'success': False,
                    'original': raw_log,
                    'error': '解析结果为空'
                })
        except Exception as e:
            results.append({
                'success': False,
                'original': raw_log,
                'error': str(e)
            })
    
    return jsonify({
        'success': True,
        'data': {
            'total': len(logs),
            'success_count': len([r for r in results if r['success']]),
            'failed_count': len([r for r in results if not r['success']]),
            'results': results
        }
    })


@pipelines_bp.route('/parse/test', methods=['POST'])
@login_required
def test_parse():
    """测试解析配置"""
    data = request.get_json()
    
    if not data or not data.get('log'):
        return jsonify({'success': False, 'error': '请提供测试日志'}), 400
    
    raw_log = data['log']
    # 支持 format_type (前端) 和 format (后端)
    format_type = data.get('format_type') or data.get('format', 'json')
    config = data.get('config', {})
    field_mapping = data.get('field_mapping', {})
    
    # 支持 input_config.pattern 或 pattern 字段
    pattern = data.get('input_config', {}).get('pattern') or data.get('pattern') or config.get('pattern', '')
    
    # 如果有pattern，设置到config中
    if pattern:
        config['pattern'] = pattern
    
    try:
        processor = LogProcessor(format_type, config)
        parsed = processor.process(raw_log)
        
        if parsed and field_mapping:
            parsed = apply_field_mapping(parsed, field_mapping)
        
        return jsonify({
            'success': True,
            'data': {
                'raw_log': raw_log,
                'format': format_type,
                'pattern': pattern,
                'parsed': parsed,
                'available_fields': list(parsed.keys()) if parsed else [],
                'standard_fields': get_standard_fields(parsed) if parsed else []
            }
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'解析失败: {str(e)}'
        }), 400


@pipelines_bp.route('/formats', methods=['GET'])
@login_required
def list_formats():
    """获取支持的解析格式（包含内置格式和自定义格式）"""
    # 获取使用各格式的管道数量
    pipelines = Pipeline.query.all()
    format_usage = {}
    for p in pipelines:
        fmt_id = p.input_format
        format_usage[fmt_id] = format_usage.get(fmt_id, 0) + 1
    
    formats = [
        {
            'id': 'json',
            'name': 'JSON',
            'description': 'JSON格式日志，自动解析键值对',
            'example': '{"timestamp": "2024-01-01T10:00:00Z", "src_ip": "192.168.1.1", "alert_name": "Login Failed"}',
            'default_config': {
                'timestamp_field': 'timestamp',
                'encoding': 'utf-8',
                'time_format': 'iso8601'
            },
            'default_mapping': {
                'src_ip': 'source_ip',
                'dst_ip': 'dest_ip',
                'severity': 'level',
                'alert_name': 'event_name',
                'message': 'raw_message'
            },
            'standard_fields': ['timestamp', 'source_ip', 'dest_ip', 'source_port', 'dest_port', 'protocol', 'action', 'level', 'event_name', 'raw_message'],
            'is_custom': False,
            'used_by_count': format_usage.get('json', 0)
        },
        {
            'id': 'syslog',
            'name': 'Syslog/CEF',
            'description': 'RFC5424/RFC3164/CEF格式，支持安全设备日志',
            'example': '<34>1 2024-01-01T10:00:00Z firewall FW01 1234 ID001 [FW] src=192.168.1.1 dst=10.0.0.1',
            'default_config': {
                'format': 'RFC5424',
                'timestamp_field': 'timestamp',
                'encoding': 'utf-8'
            },
            'default_mapping': {
                'src': 'source_ip',
                'dst': 'dest_ip',
                'spt': 'source_port',
                'dpt': 'dest_port',
                'act': 'action',
                'sev': 'level',
                'msg': 'raw_message'
            },
            'standard_fields': ['timestamp', 'hostname', 'source_ip', 'dest_ip', 'source_port', 'dest_port', 'protocol', 'action', 'level', 'event_name', 'raw_message'],
            'is_custom': False,
            'used_by_count': format_usage.get('syslog', 0)
        },
        {
            'id': 'keyvalue',
            'name': '键值对',
            'description': 'key=value格式日志',
            'example': 'src_ip=192.168.1.1 action=block severity=high alert_name=brute_force',
            'default_config': {
                'delimiter': ' ',
                'kv_separator': '=',
                'encoding': 'utf-8'
            },
            'default_mapping': {
                'src_ip': 'source_ip',
                'dst_ip': 'dest_ip',
                'severity': 'level',
                'alert_name': 'event_name'
            },
            'standard_fields': ['source_ip', 'dest_ip', 'source_port', 'dest_port', 'protocol', 'action', 'level', 'event_name', 'raw_message'],
            'is_custom': False,
            'used_by_count': format_usage.get('keyvalue', 0)
        },
        {
            'id': 'csv',
            'name': 'CSV',
            'description': 'CSV格式日志，需要指定表头',
            'example': 'timestamp,src_ip,dst_ip,action\n2024-01-01,192.168.1.1,10.0.0.1,allow',
            'default_config': {
                'headers': 'timestamp,src_ip,dst_ip,action',
                'delimiter': ',',
                'encoding': 'utf-8'
            },
            'default_mapping': {
                'src_ip': 'source_ip',
                'dst_ip': 'dest_ip',
                'action': 'action'
            },
            'standard_fields': ['timestamp', 'source_ip', 'dest_ip', 'source_port', 'dest_port', 'action', 'raw_message'],
            'is_custom': False,
            'used_by_count': format_usage.get('csv', 0)
        },
        {
            'id': 'grok',
            'name': 'Grok',
            'description': 'Grok模式解析，灵活定义字段',
            'example': '%{IP:client_ip} - %{USER:user} \\[%{HTTPDATE:timestamp}\\] "%{WORD:method}"',
            'default_config': {
                'pattern': '',
                'encoding': 'utf-8'
            },
            'default_mapping': {},
            'standard_fields': ['source_ip', 'dest_ip', 'timestamp', 'method', 'uri', 'status', 'raw_message'],
            'is_custom': False,
            'used_by_count': format_usage.get('grok', 0)
        }
    ]
    
    # 从数据库获取自定义格式
    db_formats = DataFormat.query.all()
    custom_formats = []
    for df in db_formats:
        fmt_dict = df.to_dict()
        fmt_dict['used_by_count'] = format_usage.get(df.id, 0)
        custom_formats.append(fmt_dict)
    
    # 合并内置格式和自定义格式
    all_formats = formats + custom_formats
    
    return jsonify({
        'success': True,
        'data': all_formats
    })


@pipelines_bp.route('/formats', methods=['POST'])
@login_required
def create_format():
    """创建自定义解析格式"""
    data = request.get_json()
    
    if not data:
        return jsonify({'success': False, 'error': '请求数据格式错误，请检查JSON格式'}), 400
    
    if not data.get('name'):
        return jsonify({'success': False, 'error': '格式名称不能为空'}), 400
    
    # 检查名称是否已存在（不区分大小写）
    name = data['name'].strip()
    if DataFormat.query.filter(db.func.lower(DataFormat.name) == name.lower()).first():
        return jsonify({'success': False, 'error': f'格式名称"{name}"已存在，请使用其他名称'}), 400
    
    # 生成ID
    format_id = data.get('id') or f"custom_{uuid.uuid4().hex[:8]}"
    
    # 检查ID是否已存在
    if DataFormat.query.get(format_id):
        return jsonify({'success': False, 'error': '格式ID已存在'}), 400
    
    # 创建数据库记录
    new_format = DataFormat(
        id=format_id,
        name=name,
        description=data.get('description', ''),
        type=data.get('type', 'custom'),
        sample=data.get('sample', ''),
        example=data.get('sample', ''),
        default_config=data.get('default_config', {}),
        default_mapping=data.get('default_mapping', {}),
        fields=data.get('fields', []),
        standard_fields=data.get('standard_fields', []),
        input_config=data.get('input_config', {}),
        status='active'
    )
    
    db.session.add(new_format)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': new_format.to_dict(),
        'message': '格式创建成功'
    }), 201


@pipelines_bp.route('/formats/<format_id>', methods=['PUT'])
@login_required
def update_format(format_id):
    """更新自定义解析格式"""
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': '请求数据格式错误，请检查JSON格式'}), 400
    
    # 查找要更新的格式
    format_to_update = DataFormat.query.get(format_id)
    if not format_to_update:
        return jsonify({'success': False, 'error': '格式不存在'}), 404
    
    # 检查名称是否已存在（排除自己）
    name = data.get('name', '').strip()
    if name:
        existing = DataFormat.query.filter(
            db.func.lower(DataFormat.name) == name.lower(),
            DataFormat.id != format_id
        ).first()
        if existing:
            return jsonify({'success': False, 'error': f'格式名称"{name}"已存在，请使用其他名称'}), 400
    
    # 更新字段
    if name:
        format_to_update.name = name
    if 'description' in data:
        format_to_update.description = data['description']
    if 'type' in data:
        format_to_update.type = data['type']
    if 'sample' in data:
        format_to_update.sample = data['sample']
        format_to_update.example = data['sample']
    if 'default_config' in data:
        format_to_update.default_config = data['default_config']
    if 'default_mapping' in data:
        format_to_update.default_mapping = data['default_mapping']
    if 'fields' in data:
        format_to_update.fields = data['fields']
    if 'standard_fields' in data:
        format_to_update.standard_fields = data['standard_fields']
    if 'input_config' in data:
        format_to_update.input_config = data['input_config']
    if 'status' in data:
        format_to_update.status = data['status']
    
    format_to_update.updated_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': format_to_update.to_dict(),
        'message': '格式更新成功'
    })


@pipelines_bp.route('/formats/<format_id>', methods=['DELETE'])
@login_required
def delete_format(format_id):
    """删除自定义解析格式"""
    # 检查是否有管道使用此格式
    pipelines_using = Pipeline.query.filter(Pipeline.input_format == format_id).all()
    
    if pipelines_using:
        pipeline_names = ', '.join([p.name for p in pipelines_using[:3]])
        if len(pipelines_using) > 3:
            pipeline_names += f' 等{len(pipelines_using)}个'
        return jsonify({
            'success': False,
            'error': f'该格式已被 {len(pipelines_using)} 个管道引用，无法删除。请先删除或修改以下管道：{pipeline_names}'
        }), 400
    
    # 从数据库删除
    format_to_delete = DataFormat.query.get(format_id)
    if not format_to_delete:
        return jsonify({'success': False, 'error': '格式不存在'}), 404
    
    db.session.delete(format_to_delete)
    db.session.commit()
    
    return jsonify({'success': True, 'message': '格式已删除'})


@pipelines_bp.route('/templates', methods=['GET'])
@login_required
def list_templates():
    """获取预设解析模板"""
    templates = [
        {
            'id': 'nginx_access',
            'name': 'Nginx Access Log',
            'format': 'grok',
            'pattern': '%{IPV4:client_ip} - %{WORD:user} \\[%{HTTPDATE:timestamp}\\] "%{WORD:method} %{URIPATHPARAM:request} HTTP/%{NUMBER:http_version}" %{NUMBER:status:int} %{NUMBER:bytes:int}',
            'description': '标准Nginx访问日志'
        },
        {
            'id': 'firewall_iptables',
            'name': 'IPTables Firewall',
            'format': 'syslog',
            'description': 'Linux iptables防火墙日志'
        },
        {
            'id': 'aws_waf',
            'name': 'AWS WAF',
            'format': 'json',
            'description': 'AWS WAF日志格式'
        },
        {
            'id': 'cef_generic',
            'name': 'CEF通用格式',
            'format': 'syslog',
            'description': '通用CEF格式，安全设备通用'
        }
    ]
    
    return jsonify({
        'success': True,
        'data': templates
    })


@pipelines_bp.route('/products', methods=['GET'])
@login_required
def list_product_presets():
    """获取产品预定义配置"""
    return jsonify({
        'success': True,
        'data': [
            {'id': k, **v} for k, v in PRODUCT_PRESETS.items()
        ]
    })


@pipelines_bp.route('/mapping/presets', methods=['GET'])
@login_required
def list_mapping_presets():
    """获取字段映射预设"""
    presets = [
        {
            'name': '通用安全告警',
            'mapping': {
                'alert_name': 'title',
                'severity': 'level',
                'src_ip': 'source_ip',
                'dst_ip': 'dest_ip',
                'src_port': 'source_port',
                'dst_port': 'dest_port',
                'username': 'user',
                'hostname': 'host',
                'message': 'description'
            }
        },
        {
            'name': '网络防火墙',
            'mapping': {
                'alert_name': 'rule_name',
                'severity': 'threat_level',
                'src_ip': 'src_ip',
                'dst_ip': 'dst_ip',
                'src_port': 'src_port',
                'dst_port': 'dst_port',
                'protocol': 'protocol',
                'action': 'action',
                'hostname': 'device_name'
            }
        },
        {
            'name': '主机入侵检测',
            'mapping': {
                'alert_name': 'event_type',
                'severity': 'severity',
                'src_ip': 'src_ip',
                'hostname': 'hostname',
                'username': 'username',
                'message': 'detail',
                'action': 'action_taken'
            }
        }
    ]
    
    return jsonify({
        'success': True,
        'data': presets
    })


@pipelines_bp.route('/collectors', methods=['GET'])
@login_required
def list_collectors():
    """获取采集器状态"""
    collectors = collector_manager.list_collectors()
    return jsonify({
        'success': True,
        'data': collectors
    })


@pipelines_bp.route('/collectors/start', methods=['POST'])
@login_required
def start_collector():
    """启动采集器"""
    data = request.get_json()
    
    if not data or not data.get('type'):
        return jsonify({'success': False, 'error': '请指定采集器类型'}), 400
    
    collector_type = data['type']
    name = data.get('name', f'{collector_type}-{datetime.utcnow().strftime("%Y%m%d%H%M%S")}')
    config = data.get('config', {})
    
    try:
        collector = create_collector(collector_type, config)
        collector_manager.register(name, collector)
        collector.start()
        
        return jsonify({
            'success': True,
            'data': {'name': name, **collector.get_stats()},
            'message': f'采集器 {name} 已启动'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400


@pipelines_bp.route('/collectors/stop', methods=['POST'])
@login_required
def stop_collector():
    """停止采集器"""
    data = request.get_json()
    name = data.get('name')
    
    if not name:
        return jsonify({'success': False, 'error': '请指定采集器名称'}), 400
    
    collector_manager.stop(name)
    
    return jsonify({
        'success': True,
        'message': f'采集器 {name} 已停止'
    })


@pipelines_bp.route('/collectors/stats', methods=['GET'])
@login_required
def collector_stats():
    """获取采集器统计"""
    name = request.args.get('name')
    stats = collector_manager.get_stats(name)
    return jsonify({
        'success': True,
        'data': stats
    })


def apply_field_mapping(data: dict, mapping: dict) -> dict:
    """应用字段映射"""
    if not mapping:
        return data
    
    result = {}
    for dest, src in mapping.items():
        if src in data:
            result[dest] = data[src]
    
    # 保留未映射的字段
    for k, v in data.items():
        if k not in mapping.values() and k not in ['raw_log', 'parsed_at']:
            result[k] = v
    
    return result


def get_standard_fields(data: dict) -> dict:
    """获取标准化字段"""
    standard = {}
    for key in ['src_ip', 'dst_ip', 'src_port', 'dst_port', 'hostname', 'username', 
                'severity', 'alert_name', 'message', 'protocol', 'action', 'timestamp']:
        if key in data:
            standard[key] = data[key]
    return standard
