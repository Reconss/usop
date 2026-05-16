"""
检测规则 API 路由
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import DetectionRuleExtended, AuditLog, DataSource, FormatTemplate, DataTable
from datetime import datetime

rules_api_bp = Blueprint('rules_api', __name__)


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
    data = request.get_json()
    
    year = datetime.utcnow().year
    rule_count = DetectionRuleExtended.query.count() + 1
    rule_id = f"RULE-{year}-{rule_count:03d}"
    
    rule = DetectionRuleExtended(
        id=rule_id,
        name=data.get('name'),
        type=data.get('type', 'single'),
        description=data.get('description'),
        rule_content=data.get('rule_content'),
        rule_language=data.get('rule_language', 'sigma'),
        severity=data.get('severity', 'medium'),
        status=data.get('status', 'disabled'),
        data_source_ids=[id for id in data.get('data_source_ids', []) if id],
        playbook_id=data.get('playbook_id'),
        tags=data.get('tags', []),
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
    data = request.get_json()
    
    rule = DetectionRuleExtended.query.get(rule_id)
    if not rule:
        return jsonify({'success': False, 'error': '规则不存在'}), 404
    
    if 'name' in data:
        rule.name = data['name']
    if 'type' in data:
        rule.type = data['type']
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
        rule.data_source_ids = [id for id in data['data_source_ids'] if id]
    if 'playbook_id' in data:
        rule.playbook_id = data['playbook_id'] or None
    if 'tags' in data:
        rule.tags = data['tags']
    
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


@rules_api_bp.route('/rules/<rule_id>/test', methods=['POST'])
@login_required
def test_rule(rule_id):
    """测试规则 - 从数据源存储表查询匹配数据"""
    rule = DetectionRuleExtended.query.get(rule_id)
    if not rule:
        return jsonify({'success': False, 'error': '规则不存在'}), 404

    from app.engine.rule_engine import rule_engine

    # 优先从存储表查询
    result = rule_engine.evaluate_rule_on_storage(rule, max_samples=20)

    # 如果没有关联数据源, 回退到传统的 parsed_logs 评估
    if not rule.data_source_ids:
        result = rule_engine.evaluate_rule(rule)
        return jsonify({
            'success': True,
            'data': {
                'matched_count': len(result.get('matches', [])),
                'matched': result.get('matched', False),
                'matches': result.get('matches', []),
                'matched_logs': result.get('matches', []),
                'raw': result
            }
        })

    # 转换存储表查询结果为前端兼容格式
    total = result.get('total_matched', 0)
    all_samples = []
    for src_id, src_data in result.get('sources', {}).items():
        for s in src_data.get('samples', []):
            all_samples.append(s)

    return jsonify({
        'success': True,
        'data': {
            'matched_count': total,
            'matched': total > 0,
            'matched_logs': all_samples[:20],
            'sources': result.get('sources', {}),
            'raw': result
        }
    })


@rules_api_bp.route('/rules/<int:rule_id>/test-storage', methods=['POST'])
@login_required
def test_rule_storage(rule_id):
    """从存储表检测最近一段时间的数据"""
    rule = DetectionRuleExtended.query.get(rule_id)
    if not rule:
        return jsonify({'success': False, 'error': '规则不存在'}), 404

    time_range = request.args.get('time_range_minutes', '30', type=str)
    try:
        time_range_minutes = int(time_range)
    except ValueError:
        time_range_minutes = 30

    from app.engine.rule_engine import rule_engine

    result = rule_engine.evaluate_rule_on_storage(
        rule,
        max_samples=20,
        time_range_minutes=time_range_minutes
    )

    total = result.get('total_matched', 0)
    all_samples = []
    for src_id, src_data in result.get('sources', {}).items():
        for s in src_data.get('samples', []):
            all_samples.append(s)

    return jsonify({
        'success': True,
        'data': {
            'matched_count': total,
            'matched': total > 0,
            'matched_logs': all_samples[:20],
            'sources': result.get('sources', {}),
            'time_range_minutes': time_range_minutes
        }
    })


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


# ─── 工具函数 ───────────────────────────────────────────

def _resolve_datasource(ds_id_or_name):
    """通过 ID 或名称查找数据源"""
    try:
        ds = DataSource.query.get(int(ds_id_or_name))
        if ds:
            return ds
    except (ValueError, TypeError):
        pass
    return DataSource.query.filter_by(name=str(ds_id_or_name)).first()


# ─── 硬编码回退字段 ─────────────────────────────────
FALLBACK_FIELDS = [
    {'name': 'src_ip', 'label': '源IP'},
    {'name': 'dst_ip', 'label': '目标IP'},
    {'name': 'src_port', 'label': '源端口'},
    {'name': 'dst_port', 'label': '目标端口'},
    {'name': 'protocol', 'label': '协议'},
    {'name': 'hostname', 'label': '主机名'},
    {'name': 'username', 'label': '用户名'},
    {'name': 'action', 'label': '动作'},
    {'name': 'result', 'label': '结果'},
    {'name': 'log_type', 'label': '日志类型'},
    {'name': 'source_id', 'label': '数据源ID'}
]


@rules_api_bp.route('/rules/fields', methods=['GET'])
@login_required
def get_rule_fields():
    """获取指定数据源的可用字段列表"""
    ds_ids_str = request.args.get('data_source_ids', '')
    if not ds_ids_str:
        return jsonify({'success': True, 'data': FALLBACK_FIELDS})

    ds_ids = [x.strip() for x in ds_ids_str.split(',') if x.strip()]
    if not ds_ids:
        return jsonify({'success': True, 'data': FALLBACK_FIELDS})

    seen = set()
    fields = []

    for ds_id in ds_ids:
        ds = _resolve_datasource(ds_id)
        if not ds:
            continue

        resolved = False

        # 尝试从 FormatTemplate.fields 获取
        if ds.format_template_id:
            ft = FormatTemplate.query.get(ds.format_template_id)
            if ft and ft.fields:
                for f in ft.fields:
                    fname = f.get('name') or f.get('field')
                    flabel = f.get('label') or fname
                    if fname and fname not in seen:
                        seen.add(fname)
                        fields.append({
                            'name': fname,
                            'label': flabel,
                            'source_name': ds.name,
                            'source_id': ds.id
                        })
                resolved = True
                continue

        # 尝试从 DataTable.columns 获取
        if ds.log_type_id:
            dt = DataTable.query.filter_by(log_type_id=ds.log_type_id).first()
            if dt and dt.columns:
                for c in dt.columns:
                    cname = c.get('name') or c.get('field')
                    clabel = c.get('label') or cname
                    if cname and cname not in seen:
                        seen.add(cname)
                        fields.append({
                            'name': cname,
                            'label': clabel,
                            'source_name': ds.name,
                            'source_id': ds.id
                        })
                resolved = True
                continue

        if not resolved:
            # 回退到硬编码字段
            for f in FALLBACK_FIELDS:
                if f['name'] not in seen:
                    seen.add(f['name'])
                    fields.append({
                        **f,
                        'source_name': ds.name,
                        'source_id': ds.id
                    })

    # 如果没有任何数据源匹配，返回全部回退字段
    if not fields:
        fields = [dict(**f, source_name='系统默认', source_id=None) for f in FALLBACK_FIELDS]

    return jsonify({
        'success': True,
        'data': fields
    })


@rules_api_bp.route('/rules/<rule_id>/preview', methods=['GET'])
@login_required
def preview_rule_data(rule_id):
    """预览规则关联数据源的存储表样本数据"""
    rule = DetectionRuleExtended.query.get(rule_id)
    if not rule:
        return jsonify({'success': False, 'error': '规则不存在'}), 404

    from app.timescaledb import get_tsdb
    from sqlalchemy import text

    ds_ids = rule.data_source_ids or []
    results = {}

    for ds_id in ds_ids:
        ds = _resolve_datasource(ds_id)
        if not ds:
            results[str(ds_id)] = {'error': '数据源不存在'}
            continue
        if not ds.storage_table_name:
            results[str(ds_id)] = {'error': '未配置存储表', 'name': ds.name}
            continue

        tsdb = get_tsdb()
        session = tsdb.get_session()
        try:
            table = ds.storage_table_name
            # 查询样本数据
            sample_sql = f"SELECT * FROM {table} ORDER BY timestamp DESC LIMIT 20"
            result = session.execute(text(sample_sql))
            rows = [dict(r._mapping) for r in result]

            # 获取列信息
            col_sql = f"""
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_name = '{table}'
                ORDER BY ordinal_position
            """
            col_result = session.execute(text(col_sql))
            columns = [{'name': r[0], 'type': r[1]} for r in col_result]

            results[str(ds_id)] = {
                'data_source_id': ds.id,
                'data_source_name': ds.name,
                'storage_table': table,
                'sample_count': len(rows),
                'columns': columns,
                'samples': rows
            }
        except Exception as e:
            results[str(ds_id)] = {
                'data_source_id': ds.id,
                'data_source_name': ds.name,
                'error': str(e)
            }
        finally:
            tsdb.close_session(session)

    return jsonify({
        'success': True,
        'data': {
            'sources': results
        }
    })
