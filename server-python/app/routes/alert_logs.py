from flask import Blueprint, request, jsonify
from app.database import db
from app.models import AlertLog, DataSource, Product, Pipeline
from app.routes.auth import login_required
from app.utils.parser import LogProcessor, Normalizer
from datetime import datetime, timedelta
from sqlalchemy import func, desc
import json

alert_logs_bp = Blueprint('alert_logs', __name__)


@alert_logs_bp.route('', methods=['GET'])
@login_required
def list_alerts():
    """获取告警日志列表"""
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 50, type=int)
    
    # 筛选参数
    source_id = request.args.get('source_id', type=int)
    product_id = request.args.get('product_id', type=int)
    product_code = request.args.get('product_code')
    severity = request.args.get('severity', type=int)
    status = request.args.get('status')
    alert_type = request.args.get('alert_type')
    src_ip = request.args.get('src_ip')
    dst_ip = request.args.get('dst_ip')
    start_time = request.args.get('start_time')
    end_time = request.args.get('end_time')
    keyword = request.args.get('keyword')
    
    query = AlertLog.query
    
    # 应用筛选
    if source_id:
        query = query.filter(AlertLog.source_id == source_id)
    if product_id:
        query = query.filter(AlertLog.product_id == product_id)
    if product_code:
        query = query.filter(AlertLog.product_code == product_code)
    if severity:
        query = query.filter(AlertLog.severity == severity)
    if status:
        query = query.filter(AlertLog.status == status)
    if alert_type:
        query = query.filter(AlertLog.alert_type == alert_type)
    if src_ip:
        query = query.filter(AlertLog.src_ip.like(f'{src_ip}%'))
    if dst_ip:
        query = query.filter(AlertLog.dst_ip.like(f'{dst_ip}%'))
    if start_time:
        try:
            start_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
            query = query.filter(AlertLog.time >= start_dt)
        except:
            pass
    if end_time:
        try:
            end_dt = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
            query = query.filter(AlertLog.time <= end_dt)
        except:
            pass
    if keyword:
        query = query.filter(
            db.or_(
                AlertLog.alert_name.ilike(f'%{keyword}%'),
                AlertLog.raw_log.ilike(f'%{keyword}%')
            )
        )
    
    # 排序
    query = query.order_by(AlertLog.time.desc())
    
    # 分页
    total = query.count()
    alerts = query.offset((page - 1) * page_size).limit(page_size).all()
    
    return jsonify({
        'success': True,
        'data': {
            'alerts': [a.to_dict() for a in alerts],
            'pagination': {
                'page': page,
                'page_size': page_size,
                'total': total,
                'pages': (total + page_size - 1) // page_size
            }
        }
    })


@alert_logs_bp.route('/<int:id>', methods=['GET'])
@login_required
def get_alert(id):
    """获取单个告警详情"""
    alert = AlertLog.query.filter(AlertLog.id == id).first_or_404()
    return jsonify({
        'success': True,
        'data': alert.to_dict()
    })


@alert_logs_bp.route('/stats', methods=['GET'])
@login_required
def get_stats():
    """获取告警统计"""
    product_id = request.args.get('product_id', type=int)
    start_time = request.args.get('start_time')
    end_time = request.args.get('end_time')
    
    query = AlertLog.query
    
    if product_id:
        query = query.filter(AlertLog.product_id == product_id)
    if start_time:
        try:
            start_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
            query = query.filter(AlertLog.time >= start_dt)
        except:
            pass
    if end_time:
        try:
            end_dt = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
            query = query.filter(AlertLog.time <= end_dt)
        except:
            pass
    
    # 总数
    total = query.count()
    
    # 按严重级别统计
    severity_stats = db.session.query(
        AlertLog.severity,
        func.count(AlertLog.id)
    ).filter(
        AlertLog.severity.isnot(None)
    )
    if product_id:
        severity_stats = severity_stats.filter(AlertLog.product_id == product_id)
    if start_time:
        try:
            severity_stats = severity_stats.filter(AlertLog.time >= datetime.fromisoformat(start_time.replace('Z', '+00:00')))
        except:
            pass
    if end_time:
        try:
            severity_stats = severity_stats.filter(AlertLog.time <= datetime.fromisoformat(end_time.replace('Z', '+00:00')))
        except:
            pass
    severity_stats = severity_stats.group_by(AlertLog.severity).all()
    
    # 按产品统计
    product_stats = db.session.query(
        AlertLog.product_code,
        func.count(AlertLog.id)
    ).filter(
        AlertLog.product_code.isnot(None)
    )
    if start_time:
        try:
            product_stats = product_stats.filter(AlertLog.time >= datetime.fromisoformat(start_time.replace('Z', '+00:00')))
        except:
            pass
    if end_time:
        try:
            product_stats = product_stats.filter(AlertLog.time <= datetime.fromisoformat(end_time.replace('Z', '+00:00')))
        except:
            pass
    product_stats = product_stats.group_by(AlertLog.product_code).all()
    
    # 按状态统计
    status_stats = db.session.query(
        AlertLog.status,
        func.count(AlertLog.id)
    ).group_by(AlertLog.status).all()
    
    return jsonify({
        'success': True,
        'data': {
            'total': total,
            'by_severity': {str(s[0]): s[1] for s in severity_stats},
            'by_product': {s[0]: s[1] for s in product_stats},
            'by_status': {s[0]: s[1] for s in status_stats}
        }
    })


@alert_logs_bp.route('/trend', methods=['GET'])
@login_required
def get_trend():
    """获取告警趋势"""
    days = request.args.get('days', 7, type=int)
    product_id = request.args.get('product_id', type=int)
    group_by = request.args.get('group_by', 'day')  # hour, day, week
    
    start_time = datetime.utcnow() - timedelta(days=days)
    
    query = db.session.query(
        func.date_trunc(group_by, AlertLog.time).label('bucket'),
        AlertLog.severity,
        func.count(AlertLog.id)
    ).filter(AlertLog.time >= start_time)
    
    if product_id:
        query = query.filter(AlertLog.product_id == product_id)
    
    query = query.group_by('bucket', AlertLog.severity).order_by('bucket')
    
    results = query.all()
    
    # 整理数据
    trend_data = {}
    for r in results:
        bucket = r[0].isoformat() if hasattr(r[0], 'isoformat') else str(r[0])
        severity = r[1]
        count = r[2]
        
        if bucket not in trend_data:
            trend_data[bucket] = {'timestamp': bucket}
        trend_data[bucket][f'severity_{severity}'] = count
    
    return jsonify({
        'success': True,
        'data': {
            'trend': list(trend_data.values())
        }
    })


@alert_logs_bp.route('/ingest', methods=['POST'])
@login_required
def ingest_alerts():
    """批量接收和解析告警"""
    data = request.get_json()

    if not data or not data.get('logs'):
        return jsonify({'success': False, 'error': '请提供日志数据'}), 400

    source_id = data.get('source_id')
    product_id = data.get('product_id')
    pipeline_id = data.get('pipeline_id')
    logs = data['logs'] if isinstance(data['logs'], list) else [data['logs']]

    # 获取源信息
    source = None
    product = None

    if source_id:
        source = DataSource.query.get(source_id)
    if product_id:
        product = Product.query.get(product_id)
    # 如果有数据源但没有产品，使用数据源关联的产品
    if source and not product and source.product_id:
        product = source.product

    # 获取要使用的管道列表
    pipelines_to_use = []

    if pipeline_id:
        # 指定了单个管道
        pipeline = Pipeline.query.get(pipeline_id)
        if pipeline:
            pipelines_to_use = [pipeline]
    else:
        # 未指定管道，根据数据源获取关联的管道
        if source and source.pipeline_id:
            # 数据源关联了特定管道
            pipeline = Pipeline.query.get(source.pipeline_id)
            if pipeline:
                pipelines_to_use = [pipeline]
        elif source and source.product_id:
            # 获取产品下所有活跃的管道
            pipelines_to_use = Pipeline.query.filter_by(
                product_id=source.product_id,
                status='active'
            ).order_by(Pipeline.priority.desc()).all()
        elif product_id:
            pipelines_to_use = Pipeline.query.filter_by(
                product_id=product_id,
                status='active'
            ).order_by(Pipeline.priority.desc()).all()

    ingested = 0
    errors = 0
    results_by_pipeline = {}

    for raw_log in logs:
        if not raw_log.strip():
            continue

        try:
            # 使用多规则解析
            parsed_data, matched_pipeline_id = _process_with_pipeline_rules(
                raw_log, pipelines_to_use, source, product
            )

            if not parsed_data:
                errors += 1
                continue

            # 记录结果
            pipeline_key = str(matched_pipeline_id or 'default')
            if pipeline_key not in results_by_pipeline:
                results_by_pipeline[pipeline_key] = {'ingested': 0, 'errors': 0}

            # 创建告警记录
            alert = AlertLog(
                source_id=source_id,
                product_id=product_id or (source.product_id if source else None),
                product_code=product.code if product else (source.config.get('product_code') if source else None),
                pipeline_id=matched_pipeline_id,
                alert_name=parsed_data.get('alert_name') or parsed_data.get('message', 'Unknown')[:200],
                alert_type=parsed_data.get('alert_type'),
                severity=parsed_data.get('severity', product.default_severity if product else 3),
                status='open',
                src_ip=parsed_data.get('src_ip'),
                dst_ip=parsed_data.get('dst_ip'),
                src_port=parsed_data.get('src_port'),
                dst_port=parsed_data.get('dst_port'),
                protocol=parsed_data.get('protocol'),
                hostname=parsed_data.get('hostname'),
                username=parsed_data.get('username'),
                raw_log=raw_log,
                details=parsed_data.get('details', {}),
                ioc_type=parsed_data.get('ioc_type'),
                ioc_value=parsed_data.get('ioc_value'),
                time=datetime.fromisoformat(parsed_data['timestamp'].replace('Z', '+00:00')) if parsed_data.get('timestamp') else datetime.utcnow()
            )

            db.session.add(alert)
            ingested += 1
            results_by_pipeline[pipeline_key]['ingested'] += 1

        except Exception as e:
            errors += 1
            print(f"Error ingesting log: {e}")

    db.session.commit()

    return jsonify({
        'success': True,
        'data': {
            'total': len(logs),
            'ingested': ingested,
            'errors': errors,
            'by_pipeline': results_by_pipeline
        },
        'message': f'成功导入 {ingested} 条告警'
    })


def _process_with_pipeline_rules(raw_log: str, pipelines: list, source, product) -> tuple:
    """
    多规则解析核心逻辑

    Args:
        raw_log: 原始日志
        pipelines: 按优先级排序的管道列表
        source: 数据源
        product: 产品

    Returns:
        (parsed_data, matched_pipeline_id): 解析结果和匹配的管道ID
    """
    if not pipelines:
        # 没有管道，使用默认解析
        processor = LogProcessor('json', {})
        parsed = processor.process(raw_log)
        return parsed, None

    # 分离 exclusive 和 fallback 管道
    exclusive_pipelines = [p for p in pipelines if p.rule_type == 'exclusive']
    fallback_pipelines = [p for p in pipelines if p.rule_type == 'fallback']

    matched_pipeline = None
    parsed = None

    # 1. 先尝试 exclusive 模式管道
    for pipeline in exclusive_pipelines:
        if _match_conditions(raw_log, pipeline.match_conditions):
            parsed = _process_single_pipeline(raw_log, pipeline, source, product)
            if parsed:
                matched_pipeline = pipeline
                # 尝试串联处理
                parsed = _process_pipeline_chain(parsed, pipeline, source, product)
                return parsed, matched_pipeline.id

    # 2. 没有 exclusive 匹配，尝试 fallback 管道
    for pipeline in fallback_pipelines:
        if _match_conditions(raw_log, pipeline.match_conditions):
            parsed = _process_single_pipeline(raw_log, pipeline, source, product)
            if parsed:
                matched_pipeline = pipeline
                parsed = _process_pipeline_chain(parsed, pipeline, source, product)
                return parsed, matched_pipeline.id

    # 3. 都没有匹配，使用第一个 exclusive 管道（无条件的）
    for pipeline in exclusive_pipelines:
        if not pipeline.match_conditions or len(pipeline.match_conditions) == 0:
            parsed = _process_single_pipeline(raw_log, pipeline, source, product)
            if parsed:
                matched_pipeline = pipeline
                parsed = _process_pipeline_chain(parsed, pipeline, source, product)
                return parsed, matched_pipeline.id

    # 4. 都没有匹配，使用第一个 fallback 管道（无条件的）
    for pipeline in fallback_pipelines:
        if not pipeline.match_conditions or len(pipeline.match_conditions) == 0:
            parsed = _process_single_pipeline(raw_log, pipeline, source, product)
            if parsed:
                matched_pipeline = pipeline
                parsed = _process_pipeline_chain(parsed, pipeline, source, product)
                return parsed, matched_pipeline.id

    # 5. 使用第一个管道作为默认
    if pipelines:
        pipeline = pipelines[0]
        parsed = _process_single_pipeline(raw_log, pipeline, source, product)
        if parsed:
            matched_pipeline = pipeline
            parsed = _process_pipeline_chain(parsed, pipeline, source, product)
            return parsed, matched_pipeline.id

    return None, None


def _match_conditions(raw_log: str, conditions: list) -> bool:
    """
    检查日志是否匹配条件

    Args:
        raw_log: 原始日志字符串或已解析的对象
        conditions: 匹配条件列表

    Returns:
        True 如果所有条件都满足
    """
    if not conditions or len(conditions) == 0:
        return True  # 无条件则匹配

    # 如果 raw_log 是字符串，尝试解析
    data = raw_log
    if isinstance(raw_log, str):
        try:
            import json
            data = json.loads(raw_log)
        except:
            data = raw_log  # 保留原始字符串供后续处理

    all_match = True
    for cond in conditions:
        field = cond.get('field', '')
        operator = cond.get('operator', 'exists')
        expected_value = cond.get('value', '')
        expected_value2 = cond.get('value2', '')  # 用于 between 操作符

        # 获取字段值
        field_value = None
        if isinstance(data, dict):
            field_value = data.get(field)
        elif isinstance(data, str) and field == 'raw_log':
            field_value = data

        # 字段值转换为字符串进行比较
        field_str = str(field_value) if field_value is not None else ''

        # 根据操作符判断
        match = False
        if operator == 'exists':
            match = field_value is not None
        elif operator == 'not_exists':
            match = field_value is None
        elif operator == 'equals':
            match = field_str.lower() == str(expected_value).lower()
        elif operator == 'not_equals':
            match = field_str.lower() != str(expected_value).lower()
        elif operator == 'contains':
            match = str(expected_value) in field_str
        elif operator == 'not_contains':
            match = str(expected_value) not in field_str
        elif operator == 'starts_with':
            match = field_str.startswith(str(expected_value))
        elif operator == 'ends_with':
            match = field_str.endswith(str(expected_value))
        elif operator == 'regex':
            import re
            try:
                match = bool(re.search(str(expected_value), field_str))
            except:
                match = False
        elif operator == 'greater_than':
            try:
                match = float(field_str) > float(expected_value)
            except:
                match = False
        elif operator == 'less_than':
            try:
                match = float(field_str) < float(expected_value)
            except:
                match = False
        elif operator == 'between':
            try:
                val = float(field_str)
                match = float(expected_value) <= val <= float(expected_value2)
            except:
                match = False

        if not match:
            all_match = False
            break

    return all_match


def _process_single_pipeline(raw_log: str, pipeline, source, product) -> dict:
    """使用单个管道处理日志"""
    try:
        processor = LogProcessor(pipeline.input_format, pipeline.input_config or {})
        parsed = processor.process(raw_log)

        if not parsed:
            return None

        # 应用字段映射
        if pipeline.field_mapping:
            from app.routes.pipelines import apply_field_mapping
            parsed = apply_field_mapping(parsed, pipeline.field_mapping)

        return parsed
    except Exception as e:
        print(f"Pipeline {pipeline.id} processing error: {e}")
        return None


def _process_pipeline_chain(parsed: dict, pipeline, source, product) -> dict:
    """处理串联管道链"""
    current_pipeline = pipeline

    while current_pipeline.next_pipeline_id and current_pipeline.rule_type == 'pipeline':
        next_pipeline = Pipeline.query.get(current_pipeline.next_pipeline_id)
        if not next_pipeline or next_pipeline.status != 'active':
            break

        try:
            # 使用下一个管道的配置继续处理
            processor = LogProcessor(next_pipeline.input_format, next_pipeline.input_config or {})
            # 将当前结果转为 JSON 字符串再解析（支持多格式串联）
            temp_log = json.dumps(parsed, ensure_ascii=False)
            new_parsed = processor.process(temp_log)

            if new_parsed:
                # 合并结果
                parsed = {**parsed, **new_parsed}

                # 应用下一个管道的字段映射
                if next_pipeline.field_mapping:
                    from app.routes.pipelines import apply_field_mapping
                    parsed = apply_field_mapping(parsed, next_pipeline.field_mapping)

            current_pipeline = next_pipeline
        except Exception as e:
            print(f"Pipeline chain error at {current_pipeline.next_pipeline_id}: {e}")
            break

    return parsed


@alert_logs_bp.route('/<int:id>/status', methods=['PUT'])
@login_required
def update_alert_status(id):
    """更新告警状态"""
    alert = AlertLog.query.filter(AlertLog.id == id).first_or_404()
    data = request.get_json()
    
    if not data or not data.get('status'):
        return jsonify({'success': False, 'error': '请提供状态'}), 400
    
    alert.status = data['status']
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': alert.to_dict(),
        'message': '状态更新成功'
    })


@alert_logs_bp.route('/bulk/status', methods=['PUT'])
@login_required
def bulk_update_status():
    """批量更新告警状态"""
    data = request.get_json()
    
    if not data or not data.get('ids') or not data.get('status'):
        return jsonify({'success': False, 'error': '请提供告警ID列表和状态'}), 400
    
    ids = data['ids'] if isinstance(data['ids'], list) else [data['ids']]
    status = data['status']
    
    AlertLog.query.filter(AlertLog.id.in_(ids)).update(
        {AlertLog.status: status},
        synchronize_session=False
    )
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': f'已更新 {len(ids)} 条告警状态'
    })


@alert_logs_bp.route('/top/sources', methods=['GET'])
@login_required
def get_top_sources():
    """获取Top告警源IP"""
    limit = request.args.get('limit', 10, type=int)
    days = request.args.get('days', 7, type=int)
    
    start_time = datetime.utcnow() - timedelta(days=days)
    
    results = db.session.query(
        AlertLog.src_ip,
        func.count(AlertLog.id).label('count'),
        func.max(AlertLog.severity).label('max_severity')
    ).filter(
        AlertLog.src_ip.isnot(None),
        AlertLog.time >= start_time
    ).group_by(
        AlertLog.src_ip
    ).order_by(
        desc('count')
    ).limit(limit).all()
    
    return jsonify({
        'success': True,
        'data': [{
            'ip': r[0],
            'count': r[1],
            'max_severity': r[2]
        } for r in results]
    })
