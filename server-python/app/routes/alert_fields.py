"""
安全告警标准字段定义 API
- CRUD 接口管理标准字段配置
- 供日志解析管道和前端 SmartParser 使用
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import AlertFieldDefinition, AuditLog

alert_fields_bp = Blueprint('alert_fields', __name__)


def _seed_standard_fields():
    """初始化/重置标准字段种子数据（与告警详情页展示字段对齐）"""
    # 如果已有数据则跳过
    if AlertFieldDefinition.query.first():
        return

    fields = [
        # ===== 时间 =====
        {'name': 'timestamp', 'label': '事件时间',   'field_type': 'datetime', 'category': '时间',       'required': True,  'description': '告警事件发生时间，映射到 first_seen',     'aliases': ['timestamp','time','event_time','datetime','@timestamp','created_at'], 'sort_order': 1},

        # ===== 网络-五元组 =====
        {'name': 'src_ip',      'label': '源地址',     'field_type': 'string',   'category': '网络-五元组', 'required': True,  'description': '攻击源IP地址',                          'aliases': ['source_ip','srcip','sourceip','client_ip','remote_addr','src_addr'], 'sort_order': 1},
        {'name': 'src_port',    'label': '源端口',     'field_type': 'number',   'category': '网络-五元组', 'required': False, 'description': '攻击源端口号',                            'aliases': ['source_port','srcport','sport','client_port'], 'sort_order': 2},
        {'name': 'dst_ip',      'label': '目标地址',   'field_type': 'string',   'category': '网络-五元组', 'required': True,  'description': '攻击目标IP地址',                        'aliases': ['dest_ip','dstip','destination_ip','target_ip','dest_address','dst_addr'], 'sort_order': 3},
        {'name': 'dst_port',    'label': '目标端口',   'field_type': 'number',   'category': '网络-五元组', 'required': False, 'description': '攻击目标端口号',                          'aliases': ['dest_port','dstport','dport','target_port'], 'sort_order': 4},
        {'name': 'protocol',    'label': '协议',       'field_type': 'string',   'category': '网络-五元组', 'required': False, 'description': '网络协议（TCP/UDP/HTTP/HTTPS等）',         'aliases': ['proto','transport','network_protocol'], 'sort_order': 5},

        # ===== 告警属性 =====
        {'name': 'severity',    'label': '严重程度',   'field_type': 'string',   'category': '告警属性',   'required': True,  'description': '严重级别：critical/high/medium/low',       'aliases': ['level','priority','risk_level','threat_level','severity_id','severity_name'], 'sort_order': 1, 'default_value': 'medium'},
        {'name': 'title',       'label': '告警标题',   'field_type': 'string',   'category': '告警属性',   'required': True,  'description': '告警标题/名称',                           'aliases': ['alert_name','title','name','event_type','rule_name','event_name','alert_title'], 'sort_order': 2},
        {'name': 'description', 'label': '描述',       'field_type': 'string',   'category': '告警属性',   'required': False, 'description': '告警详细描述信息',                       'aliases': ['message','detail','msg','description','full_log','raw_message','summary'], 'sort_order': 3},
        {'name': 'category',    'label': '分类',       'field_type': 'string',   'category': '告警属性',   'required': False, 'description': '告警分类标签（如Web Attack、Malware等）',  'aliases': ['type','class','alert_type','attack_type','event_category','type_name'], 'sort_order': 4, 'default_value': 'Unknown'},

        # ===== 数据源 =====
        {'name': 'source_product','label': '数据源产品','field_type': 'string', 'category': '数据源',     'required': True,  'description': '产生告警的安全产品（WAF/EDR/NIDS/HIDS等）','aliases': ['source','product','source_product','vendor','device','sensor','agent'], 'sort_order': 1, 'default_value': 'Unknown'},

        # ===== 资产 =====
        {'name': 'hostname',    'label': '主机名',     'field_type': 'string',   'category': '资产',       'required': False, 'description': '受影响的主机名或资产名称',               'aliases': ['host','hostname','computer','host_name','server','asset_name','dest_host','target_host'], 'sort_order': 1},

        # ===== 原始数据 =====
        {'name': 'raw_log',     'label': '原始日志',   'field_type': 'string',   'category': '原始数据',   'required': True,  'description': '完整原始日志文本',                       'aliases': ['raw_log','rawlog','original_log','full_log','log','_raw'], 'sort_order': 1},
    ]

    for f in fields:
        field = AlertFieldDefinition(
            name=f['name'],
            label=f['label'],
            field_type=f['field_type'],
            category=f['category'],
            required=f['required'],
            description=f.get('description'),
            aliases=f.get('aliases', []),
            default_value=f.get('default_value'),
            sort_order=f.get('sort_order', 0),
            enabled=True,
        )
        db.session.add(field)
    db.session.commit()
    print(f"[AlertFieldDefinition] 已初始化 {len(fields)} 条标准字段定义")


@alert_fields_bp.route('/fields', methods=['GET'])
@login_required
def list_fields():
    """获取所有启用的标准字段定义（按分类和排序组织）"""
    category = request.args.get('category')

    query = AlertFieldDefinition.query.filter_by(enabled=True)
    if category:
        query = query.filter_by(category=category)
    fields = query.order_by(AlertFieldDefinition.category, AlertFieldDefinition.sort_order).all()

    # 按分类分组
    grouped = {}
    for f in fields:
        cat = f.category
        if cat not in grouped:
            grouped[cat] = []
        grouped[cat].append(f.to_dict())

    return jsonify({
        'success': True,
        'data': {
            'fields': [f.to_dict() for f in fields],
            'grouped': grouped,
            'categories': sorted(grouped.keys()),
            'total': len(fields)
        }
    })


@alert_fields_bp.route('/fields/all', methods=['GET'])
@login_required
def list_all_fields():
    """获取所有标准字段（含禁用的，用于管理界面）"""
    fields = AlertFieldDefinition.query.order_by(
        AlertFieldDefinition.category, AlertFieldDefinition.sort_order
    ).all()
    return jsonify({
        'success': True,
        'data': [f.to_dict() for f in fields],
        'total': len(fields)
    })


@alert_fields_bp.route('/fields/<int:field_id>', methods=['PUT'])
@login_required
def update_field(field_id):
    """更新单个字段定义"""
    field = AlertFieldDefinition.query.get_or_404(field_id)
    data = request.get_json()

    updatable = ['label', 'field_type', 'category', 'required', 'description',
                 'aliases', 'db_column', 'default_value', 'sort_order', 'enabled']
    for key in updatable:
        if key in data:
            setattr(field, key, data[key])

    db.session.commit()
    return jsonify({'success': True, 'data': field.to_dict()})


@alert_fields_bp.route('/fields/<int:field_id>', methods=['DELETE'])
@login_required
def delete_field(field_id):
    """删除单个字段定义"""
    field = AlertFieldDefinition.query.get_or_404(field_id)
    db.session.delete(field)
    db.session.commit()
    return jsonify({'success': True})


@alert_fields_bp.route('/fields/seed', methods=['POST'])
@login_required
def seed_fields():
    """手动触发初始化标准字段种子数据（幂等操作）"""
    _seed_standard_fields()
    count = AlertFieldDefinition.query.count()
    return jsonify({
        'success': True,
        'message': f'已初始化 {count} 条标准字段定义',
        'total': count
    })


@alert_fields_bp.route('/fields/rebuild', methods=['POST'])
@login_required
def rebuild_fields():
    """重建标准字段（清空后重新插入默认值）"""
    AlertFieldDefinition.query.delete()
    db.session.commit()
    _seed_standard_fields()
    count = AlertFieldDefinition.query.count()
    return jsonify({
        'success': True,
        'message': f'已重建 {count} 条标准字段定义',
        'total': count
    })


@alert_fields_bp.route('/fields/mapping', methods=['POST'])
@login_required
def resolve_mapping():
    """根据输入的字段名自动匹配到标准字段

    Body: {"fields": ["client_ip", "target_ip", "level", "msg"]}
    返回: 匹配结果列表
    """
    data = request.get_json()
    input_fields = data.get('fields', [])

    # 加载所有启用的标准字段及其别名
    std_fields = AlertFieldDefinition.query.filter_by(enabled=True).all()

    results = []
    for input_name in input_fields:
        matched = None
        match_method = None

        # 1. 精确匹配 name 或 db_column
        for sf in std_fields:
            if input_name.lower() == sf.name.lower() or input_name.lower() == (sf.db_column or sf.name).lower():
                matched = sf
                match_method = 'exact'
                break

        # 2. 别名匹配
        if not matched:
            for sf in std_fields:
                if sf.aliases and any(a.lower() == input_name.lower() for a in sf.aliases):
                    matched = sf
                    match_method = 'alias'
                    break

        results.append({
            'input_field': input_name,
            'matched': matched is not None,
            'match_method': match_method,
            'standard_field': matched.to_dict() if matched else None
        })

    return jsonify({
        'success': True,
        'data': results
    })
