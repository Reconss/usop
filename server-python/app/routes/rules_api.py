"""
检测规则 API 路由

检测规则 = 在 ES 告警索引（alerts-valid）上做单事件判断的规则：
  条件命中数 >= 阈值（可分组）→ 命中则写 PG events。
多事件的频次/去重/聚合/时序分析由「关联分析规则」（Flink 流作业）承担，
本模块不再提供 sequence / query 类型。
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import DetectionRuleExtended, AuditLog, as_json_list
from datetime import datetime

rules_api_bp = Blueprint('rules_api', __name__)

# ─── 规则类型白名单 ─────────────────────────────────
#
# sigma / yara 是历史遗留取值（现存规则里就有），保留以兼容读写；
# sequence（时序）与 query（自定义 SQL）已下线：前者归「关联分析规则」，
# 后者依赖已不存在的数据源存储表。
_ALLOWED_RULE_TYPES = {'single', 'threshold', 'aggregation', 'correlation', 'sigma', 'yara'}

_RETIRED_RULE_TYPES = {
    'sequence': '时序规则类型已下线：多事件时序分析请使用「关联分析规则」（Flink 流作业）',
    'query': '自定义 SQL 规则类型已下线：请改用字段条件，或使用「关联分析规则」',
}


def _validate_rule_type(value):
    """返回 (规范化类型, 错误信息)，二者必有一个为 None。"""
    t = str(value or 'single').strip().lower()
    if t in _RETIRED_RULE_TYPES:
        return None, _RETIRED_RULE_TYPES[t]
    if t not in _ALLOWED_RULE_TYPES:
        return None, (f'不支持的规则类型：{value}（可选：single 单事件 / threshold 阈值 / '
                      f'aggregation 聚合 / correlation 关联）')
    return t, None


@rules_api_bp.route('/rules', methods=['GET'])
@login_required
def get_rules():
    """获取检测规则列表"""
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 20, type=int)
    rule_type = request.args.get('type')
    status = request.args.get('status')
    search = request.args.get('search')
    
    query = DetectionRuleExtended.query
    
    if rule_type:
        query = query.filter(DetectionRuleExtended.type == rule_type)
    if status:
        query = query.filter(DetectionRuleExtended.status == status)
    if search:
        query = query.filter(
            db.or_(
                DetectionRuleExtended.name.ilike(f'%{search}%'),
                DetectionRuleExtended.id.ilike(f'%{search}%')
            )
        )
    
    query = query.order_by(DetectionRuleExtended.hit_count.desc())
    pagination = query.paginate(page=page, per_page=page_size, error_out=False)
    
    return jsonify({
        'success': True,
        'data': {
            'items': [r.to_dict() for r in pagination.items],
            'total': pagination.total,
            'page': page,
            'page_size': page_size,
            'pages': pagination.pages
        }
    })


@rules_api_bp.route('/rules', methods=['POST'])
@login_required
def create_rule():
    """创建检测规则"""
    data = request.get_json() or {}

    rule_type, err = _validate_rule_type(data.get('type', 'single'))
    if err:
        return jsonify({'success': False, 'error': err}), 400

    year = datetime.utcnow().year
    rule_count = DetectionRuleExtended.query.count() + 1
    rule_id = f"RULE-{year}-{rule_count:03d}"
    
    rule = DetectionRuleExtended(
        id=rule_id,
        name=data.get('name'),
        type=rule_type,
        description=data.get('description'),
        rule_content=data.get('rule_content'),
        rule_language=data.get('rule_language', 'sigma'),
        severity=data.get('severity', 'medium'),
        status=data.get('status', 'disabled'),
        data_source_ids=as_json_list(data.get('data_source_ids')),
        playbook_id=data.get('playbook_id'),
        tags=as_json_list(data.get('tags')),
        author=getattr(request, 'username', 'system')
    )
    
    db.session.add(rule)
    db.session.commit()
    
    # 记录审计日志
    audit = AuditLog(
        user_id=getattr(request, 'user_id', 1),
        username=getattr(request, 'username', 'system'),
        action='创建规则',
        module='rules',
        target=rule_id,
        details={'name': rule.name},
        ip=request.remote_addr
    )
    db.session.add(audit)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': rule.to_dict()
    }), 201


@rules_api_bp.route('/rules/<rule_id>', methods=['GET'])
@login_required
def get_rule(rule_id):
    """获取规则详情"""
    rule = DetectionRuleExtended.query.get(rule_id)
    if not rule:
        return jsonify({'success': False, 'error': '规则不存在'}), 404
    
    return jsonify({
        'success': True,
        'data': rule.to_dict()
    })


@rules_api_bp.route('/rules/<rule_id>', methods=['PUT'])
@login_required
def update_rule(rule_id):
    """更新规则"""
    data = request.get_json() or {}
    
    rule = DetectionRuleExtended.query.get(rule_id)
    if not rule:
        return jsonify({'success': False, 'error': '规则不存在'}), 404
    
    if 'type' in data:
        rule_type, err = _validate_rule_type(data['type'])
        if err:
            return jsonify({'success': False, 'error': err}), 400
        rule.type = rule_type
    if 'name' in data:
        rule.name = data['name']
    if 'description' in data:
        rule.description = data['description']
    if 'rule_content' in data:
        rule.rule_content = data['rule_content']
    if 'rule_language' in data:
        rule.rule_language = data['rule_language']
    if 'severity' in data:
        rule.severity = data['severity']
    if 'status' in data:
        rule.status = data['status']
    if 'data_source_ids' in data:
        rule.data_source_ids = [i for i in as_json_list(data['data_source_ids']) if i]
    if 'playbook_id' in data:
        rule.playbook_id = data['playbook_id'] or None
    if 'tags' in data:
        rule.tags = as_json_list(data['tags'])
    
    rule.updated_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': rule.to_dict()
    })


@rules_api_bp.route('/rules/<rule_id>', methods=['DELETE'])
@login_required
def delete_rule(rule_id):
    """删除规则"""
    rule = DetectionRuleExtended.query.get(rule_id)
    if not rule:
        return jsonify({'success': False, 'error': '规则不存在'}), 404
    
    db.session.delete(rule)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': '规则已删除'
    })


@rules_api_bp.route('/rules/<rule_id>/toggle', methods=['POST'])
@login_required
def toggle_rule(rule_id):
    """启用/禁用规则"""
    rule = DetectionRuleExtended.query.get(rule_id)
    if not rule:
        return jsonify({'success': False, 'error': '规则不存在'}), 404
    
    rule.status = 'enabled' if rule.status == 'disabled' else 'disabled'
    rule.updated_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': rule.to_dict()
    })


def _test_response(result, extra=None):
    """把引擎评估结果规范成前端测试面板需要的结构（只读，不产生事件）。"""
    data = {
        'matched': bool(result.get('matched')),
        'matched_count': int(result.get('matched_count') or 0),
        'threshold': result.get('threshold'),
        'matches': result.get('matches', []),
        'matched_logs': result.get('matched_logs', []),
        'time_window': result.get('time_window'),
        'warnings': result.get('warnings', []),
        'raw': result,
    }
    if result.get('error'):
        data['error'] = result['error']
    if result.get('sources'):
        data['sources'] = result['sources']
    if extra:
        data.update(extra)
    return jsonify({'success': True, 'data': data})


@rules_api_bp.route('/rules/<rule_id>/test', methods=['POST'])
@login_required
def test_rule(rule_id):
    """测试规则：在 ES 告警索引上按规则条件做一次只读评估（不创建事件）。"""
    rule = DetectionRuleExtended.query.get(rule_id)
    if not rule:
        return jsonify({'success': False, 'error': '规则不存在'}), 404

    from app.engine.rule_engine import rule_engine

    result = rule_engine.evaluate_rule(rule, dry_run=True, max_samples=20)
    return _test_response(result)


@rules_api_bp.route('/rules/<rule_id>/test-storage', methods=['POST'])
@login_required
def test_rule_storage(rule_id):
    """按指定时间范围在 ES 告警上评估规则（只读）。

    路径名沿用历史（原为"从数据源存储表取样"），实际已改为读 ES 告警。
    注意 rule_id 是字符串主键（如 dr-webshell检测 / RULE-2026-005），
    不能声明成 <int:rule_id>，否则非数字 ID 直接 404。
    """
    rule = DetectionRuleExtended.query.get(rule_id)
    if not rule:
        return jsonify({'success': False, 'error': '规则不存在'}), 404

    time_range = request.args.get('time_range_minutes', '30', type=str)
    try:
        time_range_minutes = int(time_range)
    except ValueError:
        time_range_minutes = 30

    from app.engine.rule_engine import rule_engine

    result = rule_engine.evaluate_rule(rule, dry_run=True, max_samples=20,
                                      time_range_minutes=time_range_minutes)
    return _test_response(result, {'time_range_minutes': time_range_minutes})


@rules_api_bp.route('/rules/<rule_id>/hit', methods=['POST'])
@login_required
def record_hit(rule_id):
    """记录规则命中"""
    rule = DetectionRuleExtended.query.get(rule_id)
    if not rule:
        return jsonify({'success': False, 'error': '规则不存在'}), 404
    
    rule.hit_count += 1
    rule.last_hit_time = datetime.utcnow()
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': {'hit_count': rule.hit_count}
    })


@rules_api_bp.route('/rules/evaluate-all', methods=['POST'])
@login_required
def evaluate_all_rules():
    """评估所有启用的规则"""
    data = request.get_json(silent=True) or {}
    rule_ids = data.get('rule_ids')  # 可选: 指定规则ID列表

    from app.engine.rule_engine import rule_engine

    if rule_ids:
        results = []
        events_total = 0
        for rid in rule_ids:
            rule = DetectionRuleExtended.query.get(rid)
            if rule:
                result = rule_engine.evaluate_rule(rule)
                results.append(result)
                events_total += len(result.get('events_created', []))
        evaluated = len(results)
    else:
        summary = rule_engine.evaluate_all_enabled()
        results = summary['results']
        events_total = summary['events_created']
        evaluated = summary['evaluated']

    return jsonify({
        'success': True,
        'data': {
            'evaluated': evaluated,
            'events_created': events_total,
            'results': results
        }
    })


@rules_api_bp.route('/rules/stats', methods=['GET'])
@login_required
def get_stats():
    """获取规则统计"""
    stats = {
        'total': DetectionRuleExtended.query.count(),
        'enabled': DetectionRuleExtended.query.filter(
            DetectionRuleExtended.status == 'enabled'
        ).count(),
        'by_type': {},
        'by_severity': {}
    }
    
    by_type = db.session.query(
        DetectionRuleExtended.type,
        db.func.count(DetectionRuleExtended.id)
    ).group_by(DetectionRuleExtended.type).all()
    stats['by_type'] = dict(by_type)
    
    by_severity = db.session.query(
        DetectionRuleExtended.severity,
        db.func.count(DetectionRuleExtended.id)
    ).group_by(DetectionRuleExtended.severity).all()
    stats['by_severity'] = dict(by_severity)
    
    return jsonify({
        'success': True,
        'data': stats
    })


# ─── 可选字段目录 ─────────────────────────────────────
#
# 检测条件字段来自 ES 告警索引（alerts-valid）的显式映射，不再依赖
# FormatTemplate / DataTable —— 告警已统一落 ES，那两张表已不参与检测。
# 下面只是"展示顺序 + 中文名"的偏好表；不在表里的映射字段会追加到末尾。

_ES_FIELD_PREFERRED = (
    'alert_code', 'title', 'description', 'severity', 'status',
    'src_ip', 'src_port', 'dst_ip', 'dst_port', 'protocol', 'hostname',
    'operation', 'category', 'confidence', 'source', 'source_product',
    'tags', 'processing_status', 'dispatch_policy', 'assigned_to', 'raw_log',
)

_ES_FIELD_LABELS = {
    'alert_code': '告警编号', 'alert_id': '告警ID', 'alert_log_id': '告警日志ID',
    'title': '告警标题', 'description': '告警描述', 'severity': '严重等级',
    'status': '处理状态', 'operation': '操作动作', 'source': '来源',
    'source_product': '来源产品', 'source_type': '来源类型', 'source_topic': '来源topic',
    'category': '分类', 'confidence': '置信度',
    'src_ip': '源IP', 'src_port': '源端口', 'dst_ip': '目标IP', 'dst_port': '目标端口',
    'protocol': '协议', 'hostname': '主机名', 'tags': '标签',
    'processing_status': '处理标记', 'dispatch_policy': '分流策略',
    'dispatch_branch': '分流分支', 'assigned_to': '处置人ID', 'raw_log': '原始日志',
    'first_seen': '告警时间', 'last_seen': '最后出现', 'created_at': '入库时间',
}

_SOURCE_NAME = '告警索引 alerts-valid'


def _es_alert_fields():
    """ES 告警索引里可作检测条件的字段（按偏好顺序，含中文名）。"""
    from app.engine import rule_engine as re_mod
    from app.utils import es_alerts

    types = es_alerts.flatten_mapping() or {}
    usable = set(re_mod.ALERT_FIELDS)

    ordered = [f for f in _ES_FIELD_PREFERRED if f in usable]
    ordered += [f for f in types
                if f in usable and f not in ordered]

    return [{
        'name': f,
        'label': _ES_FIELD_LABELS.get(f, f),
        'field_type': types.get(f, 'keyword'),
        'source_name': _SOURCE_NAME,
        'source_id': None,
    } for f in ordered]


@rules_api_bp.route('/rules/fields', methods=['GET'])
@login_required
def get_rule_fields():
    """获取可用于检测条件的告警字段列表。

    data_source_ids 参数保留兼容（历史实现按数据源的格式模板解析字段），
    现在字段统一取告警索引映射，不再随数据源变化。
    """
    return jsonify({'success': True, 'data': _es_alert_fields()})


@rules_api_bp.route('/rules/<rule_id>/preview', methods=['GET'])
@login_required
def preview_rule_data(rule_id):
    """预览规则在告警索引里的命中样本（按条件过滤，取最近 20 条）。

    历史实现读数据源在 TimescaleDB 上的存储表，该路径已随架构迁移失效；
    现直接给 ES 告警样本，并附上索引里实际存在的字段清单。
    """
    from app.engine import rule_engine as re_mod
    from app.utils import es_alerts

    rule = DetectionRuleExtended.query.get(rule_id)
    if not rule:
        return jsonify({'success': False, 'error': '规则不存在'}), 404

    parsed = re_mod.parse_rule_content(rule)
    types = es_alerts.flatten_mapping()
    _query, warnings = re_mod._build_query(parsed.get('conditions', []), types,
                                          None, None, rule.data_source_ids)

    sources = {}
    try:
        result = re_mod.rule_engine.evaluate_rule(rule, dry_run=True, max_samples=20)
        samples = result.get('matched_logs', [])
        sources[_SOURCE_NAME] = {
            'data_source_id': None,
            'data_source_name': _SOURCE_NAME,
            'sample_count': len(samples),
            'columns': [{'name': f, 'type': t} for f, t in sorted(types.items())
                        if '.' not in f],
            'samples': samples,
        }
        if result.get('error'):
            sources[_SOURCE_NAME]['error'] = result['error']
        if warnings:
            sources[_SOURCE_NAME]['warnings'] = warnings
        sources[_SOURCE_NAME]['total_matched'] = result.get('matched_count', 0)
    except Exception as e:
        return jsonify({'success': False, 'error': f'告警索引查询失败: {e}'}), 500

    return jsonify({'success': True, 'data': {'sources': sources}})


# ========== 自动触发剧本相关 API ==========

@rules_api_bp.route('/rules/<rule_id>/trigger-playbook', methods=['POST'])
@login_required
def trigger_playbook_from_rule(rule_id):
    """从规则触发关联的剧本 (自动触发入口)"""
    from app.engine.playbook_engine import playbook_engine as engine
    from app.models import Playbook, Alert
    
    rule = DetectionRuleExtended.query.get(rule_id)
    if not rule:
        return jsonify({'success': False, 'error': '规则不存在'}), 404
    
    if not rule.playbook_id:
        return jsonify({'success': False, 'error': '该规则未关联剧本'}), 400
    
    playbook = Playbook.query.get(rule.playbook_id)
    if not playbook:
        return jsonify({'success': False, 'error': '关联的剧本不存在'}), 404
    
    if playbook.status not in ('published', 'enabled'):
        return jsonify({'success': False, 'error': '剧本未启用'}), 400
    
    data = request.get_json() or {}
    alert_data = data.get('alert', {})
    event_data = data.get('event', {})
    
    # 执行剧本
    result = engine.execute(
        playbook=playbook,
        trigger_type='rule',
        event=event_data,
        alert=alert_data,
        params={'rule_id': rule_id},
        executor='system',
        request_info={'user_id': 0, 'username': 'rule_engine', 'ip': '0.0.0.0'}
    )
    
    return jsonify({
        'success': True,
        'data': result
    })


@rules_api_bp.route('/rules/<rule_id>/auto-trigger', methods=['POST'])
@login_required
def configure_auto_trigger(rule_id):
    """配置规则的自动触发"""
    rule = DetectionRuleExtended.query.get(rule_id)
    if not rule:
        return jsonify({'success': False, 'error': '规则不存在'}), 404
    
    data = request.get_json()
    enabled = data.get('enabled', True)
    trigger_mode = data.get('trigger_mode', 'immediate')  # immediate, delayed, manual
    
    # 更新规则的触发配置
    trigger_config = rule.extra_data or {}
    trigger_config['auto_trigger'] = {
        'enabled': enabled,
        'trigger_mode': trigger_mode,
        'playbook_id': rule.playbook_id,
        'configured_at': datetime.utcnow().isoformat()
    }
    rule.extra_data = trigger_config
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': trigger_config['auto_trigger']
    })


@rules_api_bp.route('/rules/<rule_id>/auto-trigger', methods=['GET'])
@login_required
def get_auto_trigger_config(rule_id):
    """获取规则的自动触发配置"""
    rule = DetectionRuleExtended.query.get(rule_id)
    if not rule:
        return jsonify({'success': False, 'error': '规则不存在'}), 404
    
    trigger_config = (rule.extra_data or {}).get('auto_trigger', {
        'enabled': False,
        'trigger_mode': 'manual',
        'playbook_id': rule.playbook_id
    })
    
    return jsonify({
        'success': True,
        'data': trigger_config
    })
