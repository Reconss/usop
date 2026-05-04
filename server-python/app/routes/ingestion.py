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

ingestion_bp = Blueprint('ingestion', __name__)


def generate_id(prefix=''):
    """生成唯一ID"""
    return f"{prefix}{uuid.uuid4().hex[:8]}"


# ==================== 日志类型接口 ====================

@ingestion_bp.route('/log-types', methods=['GET'])
@login_required
def list_log_types():
    """获取所有日志类型"""
    status = request.args.get('status')
    category = request.args.get('category')
    
    query = LogType.query
    
    if status:
        query = query.filter_by(status=status)
    if category:
        query = query.filter_by(category=category)
    
    log_types = query.order_by(LogType.name).all()
    
    return jsonify({
        'success': True,
        'data': [lt.to_dict() for lt in log_types]
    })


@ingestion_bp.route('/log-types/<id>', methods=['GET'])
@login_required
def get_log_type(id):
    """获取单个日志类型"""
    log_type = LogType.query.get_or_404(id)
    return jsonify({
        'success': True,
        'data': log_type.to_dict()
    })


@ingestion_bp.route('/log-types', methods=['POST'])
@login_required
def create_log_type():
    """创建日志类型"""
    data = request.get_json()
    
    if not data or not data.get('name'):
        return jsonify({'success': False, 'error': '日志类型名称不能为空'}), 400
    
    log_type_id = data.get('id') or generate_id('lt_')
    
    if LogType.query.get(log_type_id):
        return jsonify({'success': False, 'error': '日志类型ID已存在'}), 400
    
    log_type = LogType(
        id=log_type_id,
        name=data['name'],
        code=data.get('code', log_type_id),
        description=data.get('description'),
        category=data.get('category', 'security'),
        icon=data.get('icon'),
        color=data.get('color'),
        default_severity=data.get('default_severity', 3),
        retention_days=data.get('retention_days', 90),
        status=data.get('status', 'active'),
        tags=data.get('tags', []),
        pipeline_id=data.get('pipeline_id'),
        pipeline_name=data.get('pipeline_name'),
        patterns=data.get('patterns', []),
        log_count=data.get('log_count', 0)
    )
    
    db.session.add(log_type)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': log_type.to_dict(),
        'message': '日志类型创建成功'
    }), 201


@ingestion_bp.route('/log-types/<id>', methods=['PUT'])
@login_required
def update_log_type(id):
    """更新日志类型"""
    log_type = LogType.query.get_or_404(id)
    data = request.get_json()
    
    # 检查是否尝试禁用已被引用的日志类型
    if 'status' in data and data['status'] == 'inactive':
        references = check_log_type_references(id)
        if references['referenced']:
            ref_names = []
            if references['formats']:
                ref_names.append(f"格式模板 ({len(references['formats'])}个)")
            if references['tables']:
                ref_names.append(f"存储表 ({len(references['tables'])}个)")
            if references['classifiers']:
                ref_names.append(f"分类器 ({len(references['classifiers'])}个)")
            if references['classifier_rules']:
                ref_names.append(f"分类规则 ({len(references['classifier_rules'])}个)")
            if references['source_configs']:
                ref_names.append(f"数据源配置 ({len(references['source_configs'])}个)")
            return jsonify({
                'success': False,
                'error': f'该日志类型已被以下功能引用，无法禁用：{"、".join(ref_names)}'
            }), 400
    
    if data.get('name'):
        log_type.name = data['name']
    if 'code' in data:
        log_type.code = data['code']
    if 'description' in data:
        log_type.description = data['description']
    if 'category' in data:
        log_type.category = data['category']
    if 'icon' in data:
        log_type.icon = data['icon']
    if 'color' in data:
        log_type.color = data['color']
    if 'default_severity' in data:
        log_type.default_severity = data['default_severity']
    if 'retention_days' in data:
        log_type.retention_days = data['retention_days']
    if 'status' in data:
        log_type.status = data['status']
    if 'tags' in data:
        log_type.tags = data['tags']
    if 'pipeline_id' in data:
        log_type.pipeline_id = data['pipeline_id']
    if 'pipeline_name' in data:
        log_type.pipeline_name = data['pipeline_name']
    if 'patterns' in data:
        log_type.patterns = data['patterns']
    if 'log_count' in data:
        log_type.log_count = data['log_count']

    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': log_type.to_dict(),
        'message': '日志类型更新成功'
    })


def check_log_type_references(log_type_id):
    """检查日志类型被引用的情况"""
    references = {
        'referenced': False,
        'formats': [],
        'tables': [],
        'classifiers': [],
        'classifier_rules': [],
        'source_configs': []
    }
    
    # 检查格式模板
    formats = FormatTemplate.query.filter_by(log_type_id=log_type_id).all()
    if formats:
        references['referenced'] = True
        references['formats'] = [{'id': f.id, 'name': f.name} for f in formats]
    
    # 检查存储表
    tables = DataTable.query.filter_by(log_type_id=log_type_id).all()
    if tables:
        references['referenced'] = True
        references['tables'] = [{'id': t.id, 'name': t.name} for t in tables]
    
    # 检查分类器（默认日志类型）
    classifiers = LogClassifier.query.filter_by(default_log_type_id=log_type_id).all()
    if classifiers:
        references['referenced'] = True
        references['classifiers'] = [{'id': c.id, 'name': c.name} for c in classifiers]
    
    # 检查分类规则
    rules = ClassifierRule.query.filter_by(log_type_id=log_type_id).all()
    if rules:
        references['referenced'] = True
        references['classifier_rules'] = [{'id': r.id, 'name': r.name} for r in rules]
    
    # 注意：DataSourceConfig 不再直接关联 log_type_id
    # 而是通过 classifier_id → LogClassifier → ClassifierRule → LogType 间接关联
    # 或者通过 pipeline_id → Pipeline → LogType 间接关联
    
    return references


@ingestion_bp.route('/log-types/<id>/references', methods=['GET'])
@login_required
def get_log_type_references(id):
    """获取日志类型的引用情况"""
    log_type = LogType.query.get_or_404(id)
    references = check_log_type_references(id)
    
    return jsonify({
        'success': True,
        'data': references
    })


@ingestion_bp.route('/log-types/<id>', methods=['DELETE'])
@login_required
def delete_log_type(id):
    """删除日志类型"""
    log_type = LogType.query.get_or_404(id)
    
    # 检查是否被引用
    references = check_log_type_references(id)
    if references['referenced']:
        ref_names = []
        if references['formats']:
            ref_names.append(f"格式模板 ({len(references['formats'])}个)")
        if references['tables']:
            ref_names.append(f"存储表 ({len(references['tables'])}个)")
        if references['classifiers']:
            ref_names.append(f"分类器 ({len(references['classifiers'])}个)")
        if references['classifier_rules']:
            ref_names.append(f"分类规则 ({len(references['classifier_rules'])}个)")
        if references['source_configs']:
            ref_names.append(f"数据源配置 ({len(references['source_configs'])}个)")
        return jsonify({
            'success': False,
            'error': f'该日志类型已被以下功能引用，无法删除：{"、".join(ref_names)}'
        }), 400
    
    db.session.delete(log_type)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': '日志类型删除成功'
    })


# ==================== 格式模板接口 ====================

@ingestion_bp.route('/formats', methods=['GET'])
@login_required
def list_formats():
    """获取所有格式模板"""
    log_type_id = request.args.get('log_type_id')
    status = request.args.get('status')
    
    query = FormatTemplate.query
    
    if log_type_id:
        query = query.filter_by(log_type_id=log_type_id)
    if status:
        query = query.filter_by(status=status)
    
    formats = query.order_by(FormatTemplate.priority, FormatTemplate.name).all()
    
    return jsonify({
        'success': True,
        'data': [f.to_dict() for f in formats]
    })


@ingestion_bp.route('/formats/<id>', methods=['GET'])
@login_required
def get_format(id):
    """获取单个格式模板"""
    format_template = FormatTemplate.query.get_or_404(id)
    return jsonify({
        'success': True,
        'data': format_template.to_dict()
    })


@ingestion_bp.route('/formats', methods=['POST'])
@login_required
def create_format():
    """创建格式模板"""
    data = request.get_json()
    
    if not data or not data.get('name'):
        return jsonify({'success': False, 'error': '格式模板名称不能为空'}), 400
    
    format_id = data.get('id') or generate_id('fmt_')
    
    if FormatTemplate.query.get(format_id):
        return jsonify({'success': False, 'error': '格式模板ID已存在'}), 400
    
    # 验证日志类型存在
    log_type_id = data.get('log_type_id')
    if log_type_id:
        log_type = LogType.query.get(log_type_id)
        if not log_type:
            return jsonify({'success': False, 'error': '指定的日志类型不存在'}), 400
    
    format_template = FormatTemplate(
        id=format_id,
        name=data['name'],
        description=data.get('description'),
        log_type_id=log_type_id,
        type=data.get('type', 'json'),
        priority=data.get('priority', 100),
        sample=data.get('sample'),
        fields=data.get('fields', []),
        input_config=data.get('input_config', {}),
        grok_pattern=data.get('grok_pattern'),
        regex_pattern=data.get('regex_pattern'),
        delimiter=data.get('delimiter'),
        is_system=data.get('is_system', False),
        is_custom=data.get('is_custom', True)
    )
    
    db.session.add(format_template)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': format_template.to_dict(),
        'message': '格式模板创建成功'
    }), 201


@ingestion_bp.route('/formats/<id>', methods=['PUT'])
@login_required
def update_format(id):
    """更新格式模板"""
    format_template = FormatTemplate.query.get_or_404(id)
    data = request.get_json()
    
    if data.get('name'):
        format_template.name = data['name']
    if 'description' in data:
        format_template.description = data['description']
    if 'log_type_id' in data:
        format_template.log_type_id = data['log_type_id']
    if 'type' in data:
        format_template.type = data['type']
    if 'priority' in data:
        format_template.priority = data['priority']
    if 'sample' in data:
        format_template.sample = data['sample']
    if 'fields' in data:
        format_template.fields = data['fields']
    if 'input_config' in data:
        format_template.input_config = data['input_config']
    if 'grok_pattern' in data:
        format_template.grok_pattern = data['grok_pattern']
    if 'regex_pattern' in data:
        format_template.regex_pattern = data['regex_pattern']
    if 'delimiter' in data:
        format_template.delimiter = data['delimiter']
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': format_template.to_dict(),
        'message': '格式模板更新成功'
    })


def check_format_references(format_id):
    """检查格式模板被引用的情况"""
    references = {
        'referenced': False,
        'pipelines': [],
        'source_configs': []
    }
    
    # 检查解析管道（格式模板现在通过 Pipeline.format_id 关联）
    from app.models import Pipeline
    pipelines = Pipeline.query.filter_by(format_id=format_id).all()
    if pipelines:
        references['referenced'] = True
        references['pipelines'] = [{'id': p.id, 'name': p.name} for p in pipelines]
    
    # 注意：ClassifierRule 不再直接关联 format_id，而是只关联 log_type_id
    # DataSourceConfig 不再有 format_id 字段
    
    return references


@ingestion_bp.route('/formats/<id>', methods=['DELETE'])
@login_required
def delete_format(id):
    """删除格式模板"""
    format_template = FormatTemplate.query.get_or_404(id)
    
    if format_template.is_system:
        return jsonify({'success': False, 'error': '系统内置格式模板不能删除'}), 400
    
    # 检查是否被引用
    references = check_format_references(id)
    if references['referenced']:
        ref_names = []
        if references['pipelines']:
            ref_names.append(f"解析管道 ({len(references['pipelines'])}个)")
        return jsonify({
            'success': False,
            'error': f'该格式模板已被以下功能引用，无法删除：{"、".join(ref_names)}'
        }), 400
    
    db.session.delete(format_template)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': '格式模板删除成功'
    })


# ==================== 存储表接口 ====================

@ingestion_bp.route('/tables', methods=['GET'])
@login_required
def list_tables():
    """获取所有存储表"""
    log_type_id = request.args.get('log_type_id')
    status = request.args.get('status')
    
    query = DataTable.query
    
    if log_type_id:
        query = query.filter_by(log_type_id=log_type_id)
    if status:
        query = query.filter_by(status=status)
    
    tables = query.order_by(DataTable.name).all()
    
    return jsonify({
        'success': True,
        'data': [t.to_dict() for t in tables]
    })


@ingestion_bp.route('/tables/<id>', methods=['GET'])
@login_required
def get_table(id):
    """获取单个存储表"""
    table = DataTable.query.get_or_404(id)
    return jsonify({
        'success': True,
        'data': table.to_dict()
    })


@ingestion_bp.route('/tables', methods=['POST'])
@login_required
def create_table():
    """创建存储表"""
    data = request.get_json()
    
    if not data or not data.get('name'):
        return jsonify({'success': False, 'error': '表名不能为空'}), 400
    
    table_id = data.get('id') or generate_id('tbl_')
    
    if DataTable.query.get(table_id):
        return jsonify({'success': False, 'error': '表ID已存在'}), 400
    
    # 验证日志类型存在
    log_type_id = data.get('log_type_id')
    if log_type_id:
        log_type = LogType.query.get(log_type_id)
        if not log_type:
            return jsonify({'success': False, 'error': '指定的日志类型不存在'}), 400
    
    table = DataTable(
        id=table_id,
        name=data['name'],
        code=data.get('code', table_id),
        description=data.get('description'),
        log_type_id=log_type_id,
        columns=data.get('columns', []),
        retention_days=data.get('retention_days', 90),
        partition_by=data.get('partition_by'),
        index_fields=data.get('index_fields', []),
        status=data.get('status', 'active')
    )
    
    db.session.add(table)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': table.to_dict(),
        'message': '存储表创建成功'
    }), 201


@ingestion_bp.route('/tables/<id>', methods=['PUT'])
@login_required
def update_table(id):
    """更新存储表"""
    table = DataTable.query.get_or_404(id)
    data = request.get_json()
    
    if data.get('name'):
        table.name = data['name']
    if 'code' in data:
        table.code = data['code']
    if 'description' in data:
        table.description = data['description']
    if 'log_type_id' in data:
        table.log_type_id = data['log_type_id']
    if 'columns' in data:
        table.columns = data['columns']
    if 'retention_days' in data:
        table.retention_days = data['retention_days']
    if 'partition_by' in data:
        table.partition_by = data['partition_by']
    if 'index_fields' in data:
        table.index_fields = data['index_fields']
    if 'status' in data:
        table.status = data['status']
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': table.to_dict(),
        'message': '存储表更新成功'
    })


@ingestion_bp.route('/tables/<id>', methods=['DELETE'])
@login_required
def delete_table(id):
    """删除存储表"""
    table = DataTable.query.get_or_404(id)
    
    db.session.delete(table)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': '存储表删除成功'
    })


# ==================== 分类器接口 ====================

@ingestion_bp.route('/classifiers', methods=['GET'])
@login_required
def list_classifiers():
    """获取所有分类器"""
    data_source_id = request.args.get('data_source_id', type=int)
    status = request.args.get('status')
    
    query = LogClassifier.query
    
    if data_source_id:
        query = query.filter_by(data_source_id=data_source_id)
    if status:
        query = query.filter_by(status=status)
    
    classifiers = query.order_by(LogClassifier.priority, LogClassifier.name).all()
    
    return jsonify({
        'success': True,
        'data': [c.to_dict() for c in classifiers]
    })


@ingestion_bp.route('/classifiers/<id>', methods=['GET'])
@login_required
def get_classifier(id):
    """获取单个分类器"""
    classifier = LogClassifier.query.get_or_404(id)
    
    # 获取关联的规则
    rules = ClassifierRule.query.filter_by(classifier_id=id).order_by(ClassifierRule.priority).all()
    
    result = classifier.to_dict()
    result['rules'] = [r.to_dict() for r in rules]
    
    return jsonify({
        'success': True,
        'data': result
    })


@ingestion_bp.route('/classifiers', methods=['POST'])
@login_required
def create_classifier():
    """创建分类器"""
    data = request.get_json()
    
    if not data or not data.get('name'):
        return jsonify({'success': False, 'error': '分类器名称不能为空'}), 400
    
    classifier_id = data.get('id') or generate_id('cls_')
    
    if LogClassifier.query.get(classifier_id):
        return jsonify({'success': False, 'error': '分类器ID已存在'}), 400
    
    # 验证数据源存在
    data_source_id = data.get('data_source_id')
    if data_source_id:
        data_source = DataSource.query.get(data_source_id)
        if not data_source:
            return jsonify({'success': False, 'error': '指定的数据源不存在'}), 400
    
    classifier = LogClassifier(
        id=classifier_id,
        name=data['name'],
        description=data.get('description'),
        data_source_id=data_source_id,
        default_log_type_id=data.get('default_log_type_id'),
        match_mode=data.get('match_mode', 'first_match'),
        priority=data.get('priority', 100),
        status=data.get('status', 'active')
    )
    
    db.session.add(classifier)
    db.session.commit()
    
    # 创建规则
    rules_data = data.get('rules', [])
    for rule_data in rules_data:
        rule_id = rule_data.get('id') or generate_id('rule_')
        rule = ClassifierRule(
            id=rule_id,
            name=rule_data['name'],
            classifier_id=classifier_id,
            log_type_id=rule_data.get('log_type_id'),
            format_id=rule_data.get('format_id'),
            pipeline_id=rule_data.get('pipeline_id'),
            priority=rule_data.get('priority', 100),
            enabled=rule_data.get('enabled', True),
            conditions=rule_data.get('conditions', []),
            condition_logic=rule_data.get('condition_logic', 'AND')
        )
        db.session.add(rule)
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': classifier.to_dict(),
        'message': '分类器创建成功'
    }), 201


@ingestion_bp.route('/classifiers/<id>', methods=['PUT'])
@login_required
def update_classifier(id):
    """更新分类器"""
    classifier = LogClassifier.query.get_or_404(id)
    data = request.get_json()
    
    if data.get('name'):
        classifier.name = data['name']
    if 'description' in data:
        classifier.description = data['description']
    if 'data_source_id' in data:
        classifier.data_source_id = data['data_source_id']
    if 'default_log_type_id' in data:
        classifier.default_log_type_id = data['default_log_type_id']
    if 'match_mode' in data:
        classifier.match_mode = data['match_mode']
    if 'priority' in data:
        classifier.priority = data['priority']
    if 'status' in data:
        classifier.status = data['status']
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': classifier.to_dict(),
        'message': '分类器更新成功'
    })


def check_classifier_references(classifier_id):
    """检查分类器被引用的情况"""
    references = {
        'referenced': False,
        'classifier_rules': []
    }
    
    # 检查分类规则
    rules = ClassifierRule.query.filter_by(classifier_id=classifier_id).all()
    if rules:
        references['referenced'] = True
        references['classifier_rules'] = [{'id': r.id, 'name': r.name} for r in rules]
    
    return references


@ingestion_bp.route('/classifiers/<id>', methods=['DELETE'])
@login_required
def delete_classifier(id):
    """删除分类器"""
    classifier = LogClassifier.query.get_or_404(id)
    
    # 检查是否被引用
    references = check_classifier_references(id)
    if references['referenced']:
        return jsonify({
            'success': False,
            'error': f'该分类器已被 {len(references["classifier_rules"])} 个分类规则引用，无法删除'
        }), 400
    
    db.session.delete(classifier)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': '分类器删除成功'
    })


# ==================== 分类规则接口 ====================

@ingestion_bp.route('/classifier-rules', methods=['POST'])
@login_required
def create_classifier_rule():
    """创建分类规则"""
    data = request.get_json()
    
    if not data or not data.get('name'):
        return jsonify({'success': False, 'error': '规则名称不能为空'}), 400
    
    rule_id = data.get('id') or generate_id('rule_')
    
    rule = ClassifierRule(
        id=rule_id,
        name=data['name'],
        classifier_id=data.get('classifier_id'),
        log_type_id=data.get('log_type_id'),
        format_id=data.get('format_id'),
        pipeline_id=data.get('pipeline_id'),
        priority=data.get('priority', 100),
        enabled=data.get('enabled', True),
        conditions=data.get('conditions', []),
        condition_logic=data.get('condition_logic', 'AND')
    )
    
    db.session.add(rule)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': rule.to_dict(),
        'message': '分类规则创建成功'
    }), 201


@ingestion_bp.route('/classifier-rules/<id>', methods=['PUT'])
@login_required
def update_classifier_rule(id):
    """更新分类规则"""
    rule = ClassifierRule.query.get_or_404(id)
    data = request.get_json()
    
    if data.get('name'):
        rule.name = data['name']
    if 'log_type_id' in data:
        rule.log_type_id = data['log_type_id']
    if 'format_id' in data:
        rule.format_id = data['format_id']
    if 'pipeline_id' in data:
        rule.pipeline_id = data['pipeline_id']
    if 'priority' in data:
        rule.priority = data['priority']
    if 'enabled' in data:
        rule.enabled = data['enabled']
    if 'conditions' in data:
        rule.conditions = data['conditions']
    if 'condition_logic' in data:
        rule.condition_logic = data['condition_logic']
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': rule.to_dict(),
        'message': '分类规则更新成功'
    })


@ingestion_bp.route('/classifier-rules/<id>', methods=['DELETE'])
@login_required
def delete_classifier_rule(id):
    """删除分类规则"""
    rule = ClassifierRule.query.get_or_404(id)
    
    db.session.delete(rule)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': '分类规则删除成功'
    })


# ==================== 数据源配置接口 ====================

@ingestion_bp.route('/source-configs', methods=['GET'])
@login_required
def list_source_configs():
    """获取数据源配置列表"""
    data_source_id = request.args.get('data_source_id', type=int)
    
    query = DataSourceConfig.query
    
    if data_source_id:
        query = query.filter_by(data_source_id=data_source_id)
    
    configs = query.order_by(DataSourceConfig.priority).all()
    
    return jsonify({
        'success': True,
        'data': [c.to_dict() for c in configs]
    })


@ingestion_bp.route('/source-configs', methods=['POST'])
@login_required
def create_source_config():
    """创建数据源配置
    
    支持两种模式：
    - 智能分类模式：传入 classifier_id
    - 直接解析模式：传入 pipeline_id
    """
    data = request.get_json()
    
    if not data.get('data_source_id'):
        return jsonify({'success': False, 'error': '数据源ID不能为空'}), 400
    
    # 验证：必须指定 classifier_id 或 pipeline_id 之一
    if not data.get('classifier_id') and not data.get('pipeline_id'):
        return jsonify({'success': False, 'error': '必须指定分类器ID或解析管道ID之一'}), 400
    
    config_id = data.get('id') or generate_id('scfg_')
    
    config = DataSourceConfig(
        id=config_id,
        data_source_id=data['data_source_id'],
        classifier_id=data.get('classifier_id'),  # 智能分类模式
        pipeline_id=data.get('pipeline_id'),  # 直接解析模式
        enabled=data.get('enabled', True),
        priority=data.get('priority', 100),
        description=data.get('description'),
        pre_filters=data.get('pre_filters', [])
    )
    
    db.session.add(config)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': config.to_dict(),
        'message': '数据源配置创建成功'
    }), 201


@ingestion_bp.route('/source-configs/<id>', methods=['PUT'])
@login_required
def update_source_config(id):
    """更新数据源配置"""
    config = DataSourceConfig.query.get_or_404(id)
    data = request.get_json()
    
    if 'classifier_id' in data:
        config.classifier_id = data['classifier_id']
    if 'pipeline_id' in data:
        config.pipeline_id = data['pipeline_id']
    if 'enabled' in data:
        config.enabled = data['enabled']
    if 'priority' in data:
        config.priority = data['priority']
    if 'description' in data:
        config.description = data['description']
    if 'pre_filters' in data:
        config.pre_filters = data['pre_filters']
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': config.to_dict(),
        'message': '数据源配置更新成功'
    })


@ingestion_bp.route('/source-configs/<id>', methods=['DELETE'])
@login_required
def delete_source_config(id):
    """删除数据源配置"""
    config = DataSourceConfig.query.get_or_404(id)
    
    db.session.delete(config)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': '数据源配置删除成功'
    })


# ==================== 统一数据接口 ====================

@ingestion_bp.route('/all', methods=['GET'])
@login_required
def get_all_config():
    """获取所有数据接入配置（用于初始化）"""
    try:
        data = {
            'logTypes': [lt.to_dict() for lt in LogType.query.all()],
            'formats': [f.to_dict() for f in FormatTemplate.query.all()],
            'tables': [t.to_dict() for t in DataTable.query.all()],
            'classifiers': [c.to_dict() for c in LogClassifier.query.all()],
            'dataSources': [ds.to_dict() for ds in DataSource.query.all()],
            'pipelines': [p.to_dict() for p in Pipeline.query.all()],
            'products': [p.to_dict() for p in Product.query.all()]
        }
        return jsonify({
            'success': True,
            'data': data
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': f'获取配置失败: {str(e)}'
        }), 500
