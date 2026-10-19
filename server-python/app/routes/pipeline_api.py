"""告警流水线 API：运行状态/统计 + 关联规则管理 + 数据源采集测试"""

import json
import logging
import os
import time
from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request

from app.database import db
from app.routes.auth import login_required
from app.alert_pipeline.pipeline import (
    alert_pipeline, AlertPipeline, CorrelationRule, AlertFilterRule,
    ParseProfile, AlertExit, AlertDispatchPolicy, AlertStorageRoute,
    INDEX_VALID, INDEX_INVALID,
    BRANCH_VALID, BRANCHES, ENTRY_TOPICS, SYSTEM_TOPICS,
)

logger = logging.getLogger(__name__)

pipeline_bp = Blueprint('pipeline_bp', __name__)

_BRANCHES = BRANCHES
_TOPIC_NAME_RE = r'[A-Za-z0-9._-]{1,100}'
_ES_INDEX_RE = r'[a-z][a-z0-9._-]{0,99}'      # ES 索引名必须小写开头


# ==================== 采集测试样例（按产品构造真实解析器可消费的原始日志） ====================

def _build_sample(product_type: str, tag: str) -> dict:
    """构造对应产品解析器可真实消费的原始告警。tag 保证 alert_id 唯一（不与历史指纹撞车）。"""
    pt = (product_type or '').lower()
    src = f"198.51.100.{int(tag) % 200 + 20}"     # TEST-NET-2 测试段
    if pt == 'suricata':
        return {
            'timestamp': time.strftime('%Y-%m-%dT%H:%M:%S.000000+0000', time.gmtime()),
            'event_type': 'alert', 'src_ip': src, 'src_port': 40000 + int(tag) % 9999,
            'dest_ip': '192.168.1.10', 'dest_port': 443, 'proto': 'TCP',
            'alert': {'action': 'flagged', 'signature_id': 990000 + int(tag) % 9999,
                      'signature': f'PIPE-TEST-{tag}', 'category': 'attempted-admin', 'severity': 2},
        }
    if pt == 'wazuh':
        return {
            'rule': {'level': 7, 'description': f'PIPE-TEST-{tag} Wazuh rule hit',
                     'id': '5710'},
            'agent': {'name': 'pipeline-test-agent', 'ip': src},
            'data': {'srcip': src},
            'full_log': f'test ingest {tag}: multiple failed logins from {src}',
        }
    if pt in ('imperva', 'waf'):
        return {'raw': (f'<134>Imperva SecureSphere: security event, {tag}, '
                        f'src_ip={src}, dst_ip=192.168.1.10, '
                        f'attack_type=SQL Injection, severity=High, url=/api/login')}
    if pt == 'modsecurity':
        return {'message': (f'ModSecurity: Warning. Pattern match "{tag}" at REQUEST_URI. '
                            f'[src_ip {src}] [dst_ip 192.168.1.10] [severity ERROR] [uri /login]')}
    if pt == 'crowdstrike':
        return {
            'event': {'EventType': 'DetectionSummaryEvent', 'DetectName': f'PIPE-TEST-{tag}',
                      'SeverityName': 'High', 'LocalIP': src, 'RemoteIP': '192.168.1.10',
                      'ComputerName': 'pipeline-test-host'},
            'metadata': {'customerIDString': 'test'},
        }
    raise ValueError(f'产品 {product_type} 暂不支持采集测试样例')


@pipeline_bp.route('/topics', methods=['POST'])
@login_required
def toggle_topic():
    """数据源采集接入/摘除：更新 DataSource.status 并运行时联动流水线标准化消费。"""
    payload = request.get_json() or {}
    ds_id = payload.get('datasource_id')
    action = payload.get('action')  # start / stop
    from app.models import DataSource
    ds = DataSource.query.get(ds_id) if ds_id else None
    if not ds:
        return jsonify({'success': False, 'error': '数据源不存在'}), 404
    topic = (ds.kafka_topic or '').strip()
    if not topic:
        return jsonify({'success': False, 'error': '该数据源未配置 kafka_topic'}), 400

    if action == 'start':
        ds.status = 'active'
        alert_pipeline.start_topic(topic)
        msg = f'「{ds.name}」已接入采集链路（topic={topic}）'
    elif action == 'stop':
        ds.status = 'inactive'
        alert_pipeline.stop_topic(topic)
        msg = f'「{ds.name}」已停止采集（topic={topic}，消费位移保留）'
    else:
        return jsonify({'success': False, 'error': 'action 必须为 start 或 stop'}), 400
    db.session.commit()
    return jsonify({'success': True, 'data': {'datasource_id': ds.id, 'status': ds.status,
                                              'topic': topic, 'message': msg}})


@pipeline_bp.route('/test-ingest', methods=['POST'])
@login_required
def test_ingest():
    """向指定数据源的 kafka_topic 发送一条真实样例告警，完整走标准化→过滤去重→分流→存储链路。"""
    payload = request.get_json() or {}
    ds_id = payload.get('datasource_id')
    from app.models import DataSource
    ds = DataSource.query.get(ds_id) if ds_id else None
    if not ds:
        return jsonify({'success': False, 'error': '数据源不存在'}), 404
    topic = (ds.kafka_topic or '').strip()
    if not topic:
        return jsonify({'success': False, 'error': '该数据源未配置 kafka_topic，无法进行链路测试'}), 400

    tag = str(int(time.time()) % 100000000)
    try:
        sample = _build_sample(ds.product_type or '', tag)
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400

    try:
        import os
        from kafka import KafkaProducer
        producer = KafkaProducer(
            bootstrap_servers=os.getenv('KAFKA_BOOTSTRAP_SERVERS', 'kafka:29092'),
            value_serializer=lambda v: json.dumps(v).encode('utf-8'))
        meta = producer.send(topic, sample).get(timeout=15)
        producer.flush(); producer.close()
    except Exception as e:
        return jsonify({'success': False, 'error': f'Kafka 发送失败: {e}'}), 500

    return jsonify({'success': True, 'data': {
        'datasource_id': ds.id, 'datasource_name': ds.name,
        'topic': topic, 'product_type': ds.product_type,
        'sample_tag': tag, 'kafka_offset': meta.offset,
        'note': '样例已进入标准化→过滤去重→分流→ES 双索引链路，约数秒后可在采集状态与告警列表查看',
    }})


@pipeline_bp.route('/status', methods=['GET'])
@login_required
def status():
    return jsonify({'success': True, 'data': alert_pipeline.status()})


@pipeline_bp.route('/correlation-rules', methods=['GET'])
@login_required
def list_rules():
    rows = CorrelationRule.query.order_by(CorrelationRule.id).all()
    return jsonify({'success': True, 'data': [r.to_dict() for r in rows]})


# ---- 关联分析：字段/操作符目录（供前端表单渲染） ----
@pipeline_bp.route('/correlation-rules/field-catalog', methods=['GET'])
@login_required
def correlation_field_catalog():
    from app.flink_sql import correlation as corr
    return jsonify({'success': True, 'data': {
        'string_fields': corr.STRING_FIELDS,
        'numeric_fields': corr.NUMERIC_FIELDS,
        'field_labels': corr.FIELD_LABELS,
        'analysis_types': corr.ANALYSIS_TYPES,
        'analysis_labels': corr.ANALYSIS_LABELS,
        'analysis_hints': corr.ANALYSIS_HINTS,
        'agg_funcs': corr.AGG_FUNCS,
        'filter_ops': corr.FILTER_OPS,
        'string_ops': corr.STRING_OPS,
        'numeric_ops': corr.NUMERIC_OPS,
        'op_labels': corr.OP_LABELS,
        'window_min': corr._WINDOW_MIN,
        'window_max': corr._WINDOW_MAX,
        'source_topics': ['valid-alerts', 'standardized-alerts'],
    }})


def _apply_rule_payload(r, data):
    """把请求体写进模型（新增/更新共用），返回错误列表。"""
    if 'name' in data:
        r.name = (data.get('name') or '').strip()
    if 'analysis_type' in data:
        r.analysis_type = (data.get('analysis_type') or 'frequency').strip()
    if 'source_topic' in data:
        r.source_topic = (data.get('source_topic') or 'valid-alerts').strip()
    if 'field' in data:
        r.field = (data.get('field') or 'src_ip').strip()
    if 'window_seconds' in data:
        r.window_seconds = int(data.get('window_seconds') or 300)
    if 'threshold' in data:
        r.threshold = float(data.get('threshold') or 0)
    if 'severity' in data:
        r.severity = data.get('severity') or 'high'
    if 'event_title' in data:
        r.event_title = (data.get('event_title') or '').strip() or None
    if 'event_category' in data:
        r.event_category = (data.get('event_category') or 'correlation').strip()
    if 'description' in data:
        r.description = (data.get('description') or '').strip() or None
    if 'config' in data:
        r.config = data.get('config') or {}
    if 'enabled' in data:
        r.enabled = bool(data.get('enabled'))
    from app.flink_sql import correlation as corr
    return corr.validate_rule({
        'name': r.name, 'analysis_type': r.analysis_type, 'field': r.field,
        'window_seconds': r.window_seconds, 'threshold': r.threshold,
        'config': r.config or {},
    })


@pipeline_bp.route('/correlation-rules', methods=['POST'])
@login_required
def create_rule():
    data = request.get_json() or {}
    # 显式给全默认值：模型列的 default 要到 flush 才生效，而校验发生在 flush 之前
    r = CorrelationRule(
        name=(data.get('name') or '').strip() or '未命名规则',
        analysis_type='frequency', source_topic='valid-alerts', field='src_ip',
        window_seconds=300, threshold=5.0, severity='high',
        event_category='correlation', config={}, enabled=True,
    )
    errs = _apply_rule_payload(r, data)
    if errs:
        return jsonify({'success': False, 'error': '；'.join(errs)}), 400
    db.session.add(r)
    db.session.commit()
    return jsonify({'success': True, 'data': r.to_dict()}), 201


@pipeline_bp.route('/correlation-rules/<int:rid>', methods=['PATCH'])
@login_required
def update_rule(rid):
    r = CorrelationRule.query.get(rid)
    if not r:
        return jsonify({'success': False, 'error': '规则不存在'}), 404
    errs = _apply_rule_payload(r, request.get_json() or {})
    if errs:
        db.session.rollback()
        return jsonify({'success': False, 'error': '；'.join(errs)}), 400
    db.session.commit()
    return jsonify({'success': True, 'data': r.to_dict()})


@pipeline_bp.route('/correlation-rules/<int:rid>', methods=['DELETE'])
@login_required
def delete_rule(rid):
    r = CorrelationRule.query.get(rid)
    if not r:
        return jsonify({'success': False, 'error': '规则不存在'}), 404
    db.session.delete(r)
    db.session.commit()
    return jsonify({'success': True, 'data': {'id': rid}})


# ==================== 关联分析：Flink 作业生成 / 部署 / 状态 ====================

def _corr_rules():
    return [r.to_dict() for r in
            CorrelationRule.query.filter(CorrelationRule.enabled.is_(True))
            .order_by(CorrelationRule.id).all()]


def _sql_dump_path():
    base = os.getenv('FLINK_JOBS_DIR', '/app/flink-jobs')
    if not os.path.isdir(base):
        base = '/tmp'
    d = os.path.join(base, 'generated')
    try:
        os.makedirs(d, exist_ok=True)
    except OSError:
        d = '/tmp'
    return os.path.join(d, 'correlation_job.sql')


@pipeline_bp.route('/correlation-rules/preview', methods=['POST'])
@login_required
def preview_correlation_sql():
    """只生成 SQL 文本，不提交。body 可传 {rules:[…]} 预览未保存的草稿，否则用已启用规则。"""
    from app.flink_sql import correlation as corr
    data = request.get_json(silent=True) or {}
    rules = data.get('rules') or _corr_rules()
    topic = data.get('source_topic') or (rules[0].get('source_topic') if rules else None) or 'valid-alerts'
    try:
        sql = corr.build_sql_text(rules, topic=topic)
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    return jsonify({'success': True, 'data': {'sql': sql, 'rule_count': len(rules)}})


@pipeline_bp.route('/correlation/deploy', methods=['POST'])
@login_required
def deploy_correlation_job():
    """按已启用规则生成并提交 Flink 关联分析作业（先取消旧作业）。"""
    from app.flink_sql import correlation as corr
    from app.flink_sql import gateway as gw

    rules = _corr_rules()
    if not rules:
        return jsonify({'success': False, 'error': '没有已启用的关联分析规则'}), 400
    topic = rules[0].get('source_topic') or 'valid-alerts'
    try:
        statements, inserts = corr.build_statements(rules, topic=topic)
        sql_text = corr.build_sql_text(rules, topic=topic)
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400

    if not gw.gateway_available():
        return jsonify({'success': False, 'error':
                        f'Flink SQL Gateway 不可达（{gw.GATEWAY_URL}），请确认 flink-sql-gateway 容器已启动'}), 503

    # 落盘 SQL 便于审计/手工重放
    sql_path = _sql_dump_path()
    try:
        with open(sql_path, 'w', encoding='utf-8') as f:
            f.write(sql_text)
    except OSError as e:
        logger.warning('SQL 落盘失败：%s', e)

    cancelled = gw.cancel_correlation_jobs()
    gw.close_deploy_session()
    try:
        res = gw.submit_script(statements, job_name=gw.CORRELATION_JOB_NAME)
    except gw.FlinkError as e:
        return jsonify({'success': False, 'error': f'作业提交失败：{e}'}), 500

    logger.info('关联分析作业已提交 job_id=%s rules=%d cancelled=%s',
                res.get('job_id'), len(rules), cancelled)
    return jsonify({'success': True, 'data': {
        'job_id': res.get('job_id'),
        'session': res.get('session'),
        'rule_count': len(rules),
        'insert_count': len(inserts),
        'cancelled_jobs': cancelled,
        'sql_path': sql_path,
        'sql': sql_text,
    }})


@pipeline_bp.route('/correlation/stop', methods=['POST'])
@login_required
def stop_correlation_job():
    from app.flink_sql import gateway as gw
    cancelled = gw.cancel_correlation_jobs()
    gw.close_deploy_session()
    return jsonify({'success': True, 'data': {'cancelled_jobs': cancelled}})


@pipeline_bp.route('/correlation/status', methods=['GET'])
@login_required
def correlation_status():
    """关联分析作业运行态 + 产出事件统计。"""
    from app.flink_sql import gateway as gw
    from app.models import Event

    out = {
        'gateway_url': gw.GATEWAY_URL,
        'gateway_available': False,
        'cluster': None,
        'job_name': gw.CORRELATION_JOB_NAME,
        'running_jobs': [],
        'job_running': False,
        'job_history': [],
        'recent_events': [],
        'event_count_24h': 0,
        'rule_count': CorrelationRule.query.count(),
        'enabled_rule_count': CorrelationRule.query.filter(CorrelationRule.enabled.is_(True)).count(),
        'sql_path': _sql_dump_path(),
    }
    try:
        out['gateway_available'] = gw.gateway_available()
    except Exception:
        pass
    try:
        out['cluster'] = gw.cluster_overview()
    except Exception as e:
        out['cluster_error'] = str(e)
    try:
        # 只把「真正在跑」的作业算作运行态；历史 FINISHED/CANCELED 同名作业不列入，
        # 否则前端会把已取消的作业显示成正在运行（历史上误导过排查）。
        _live = ('RUNNING', 'RESTARTING', 'CREATED', 'INITIALIZING', 'RECONCILING')
        _all = [j for j in gw.list_jobs() if j.get('name') == gw.CORRELATION_JOB_NAME]
        out['running_jobs'] = [
            {'jid': j.get('jid'), 'name': j.get('name'), 'state': j.get('state'),
             'start_time': j.get('start-time'), 'duration': j.get('duration')}
            for j in _all if j.get('state') in _live
        ]
        out['job_running'] = bool(out['running_jobs'])
        out['job_history'] = [
            {'jid': j.get('jid'), 'state': j.get('state'), 'start_time': j.get('start-time')}
            for j in _all if j.get('state') not in _live
        ][:10]
    except Exception:
        pass

    try:
        since = datetime.utcnow() - timedelta(hours=24)
        rows = (Event.query
                .filter(Event.source == 'flink-correlation')
                .order_by(Event.id.desc()).limit(10).all())
        out['recent_events'] = [{
            'id': e.id, 'event_code': e.event_code, 'title': e.title,
            'severity': e.severity, 'category': e.category,
            'timestamp': e.timestamp.isoformat() if e.timestamp else None,
        } for e in rows]
        out['event_count_24h'] = Event.query.filter(
            Event.source == 'flink-correlation', Event.timestamp >= since).count()
        out['event_count_total'] = Event.query.filter(
            Event.source == 'flink-correlation').count()
    except Exception as e:
        logger.warning('关联事件统计失败：%s', e)

    return jsonify({'success': True, 'data': out})


# ==================== 告警过滤规则（按 topic 维度） ====================

_FILTER_OPERATORS = ('eq', 'contains', 'regex', 'gt', 'lt',
                     'in_ip_group', 'not_in_ip_group', 'in_domain_group', 'not_in_domain_group')


@pipeline_bp.route('/filter-rules', methods=['GET'])
@login_required
def list_filter_rules():
    rows = AlertFilterRule.query.order_by(AlertFilterRule.id).all()
    return jsonify({'success': True, 'data': [r.to_dict() for r in rows]})


@pipeline_bp.route('/filter-rules', methods=['POST'])
@login_required
def create_filter_rule():
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    field = (data.get('field') or '').strip()
    value = str(data.get('value') or '')
    topic = (data.get('topic') or '*').strip() or '*'
    operator = (data.get('operator') or 'eq').strip()
    if not name or not field:
        return jsonify({'success': False, 'error': '规则名称与字段不能为空'}), 400
    if operator not in _FILTER_OPERATORS:
        return jsonify({'success': False, 'error': f'操作符仅支持 {", ".join(_FILTER_OPERATORS)}'}), 400
    if operator == 'regex':
        import re as _re
        try:
            _re.compile(value)
        except _re.error as e:
            return jsonify({'success': False, 'error': f'正则表达式无效: {e}'}), 400
    r = AlertFilterRule(name=name, topic=topic, field=field,
                        operator=operator, value=value,
                        enabled=bool(data.get('enabled', True)))
    db.session.add(r)
    db.session.commit()
    return jsonify({'success': True, 'data': r.to_dict()}), 201


@pipeline_bp.route('/filter-rules/<int:rid>', methods=['PATCH'])
@login_required
def update_filter_rule(rid):
    r = AlertFilterRule.query.get(rid)
    if not r:
        return jsonify({'success': False, 'error': '规则不存在'}), 404
    data = request.get_json() or {}
    for f in ('name', 'topic', 'field', 'value'):
        if f in data:
            raw = data[f]
            if f == 'topic':
                # topic 留空 → 回退全局 *
                r.topic = str(raw).strip() or '*'
            else:
                # ⚠️ 这里不能回退到 r.field：以前 value 置空会被写成 field 的值
                setattr(r, f, str(raw if raw is not None else '').strip())
    if 'operator' in data:
        if data['operator'] not in _FILTER_OPERATORS:
            return jsonify({'success': False, 'error': '操作符不支持'}), 400
        r.operator = data['operator']
    if 'enabled' in data:
        r.enabled = bool(data['enabled'])
    # 正则操作符要校验编译，避免存进库里让流水线每 30s 抛异常
    if r.operator == 'regex':
        import re as _re
        try:
            _re.compile(r.value or '')
        except _re.error as e:
            db.session.rollback()
            return jsonify({'success': False, 'error': f'正则表达式无效: {e}'}), 400
    if not (r.name or '').strip() or not (r.field or '').strip():
        db.session.rollback()
        return jsonify({'success': False, 'error': '规则名称与字段不能为空'}), 400
    db.session.commit()
    return jsonify({'success': True, 'data': r.to_dict()})


@pipeline_bp.route('/filter-rules/<int:rid>', methods=['DELETE'])
@login_required
def delete_filter_rule(rid):
    r = AlertFilterRule.query.get(rid)
    if not r:
        return jsonify({'success': False, 'error': '规则不存在'}), 404
    db.session.delete(r)
    db.session.commit()
    return jsonify({'success': True, 'data': {'id': rid}})


# ==================== 设备 topic 管理（raw-logs 汇聚 → 设备存储 topic） ====================

@pipeline_bp.route('/device-topics', methods=['GET'])
@login_required
def list_device_topics():
    """列出「平台已纳管」的设备 topic（以 DataSource 为事实来源，叠加 Kafka 实时状态）。

    与旧实现的区别：旧版返回集群内全部 topic（含非平台创建的杂散 topic、Kafka 内部记录），
    页面无法区分哪些是平台配的。现只返回在平台配置过的 topic，每项带：
      exists   → Kafka 中是否存在（删除后为 False，可重建）
      status   → DataSource 采集状态（active/inactive，暂停/启用据此持久化）
      consuming→ 标准化消费线程是否在跑（运行时）
      system   → 是否流水线系统 topic（禁删禁改）
    """
    from app.models import DataSource
    rows = DataSource.query.filter(DataSource.kafka_topic.isnot(None),
                                   DataSource.kafka_topic != '').all()
    try:
        from kafka import KafkaConsumer
        c = KafkaConsumer(bootstrap_servers=alert_pipeline._bootstrap,
                          request_timeout_ms=8000)
        live = set(c.topics())
        parts = {t: len(c.partitions_for_topic(t) or []) for t in live}
        c.close()
        reachable = True
    except Exception:
        live, parts, reachable = set(), {}, False

    items = [{
        'topic': ds.kafka_topic,
        'datasource_id': ds.id,
        'name': ds.name,
        'device_type': ds.product_type,
        'status': ds.status,
        'exists': ds.kafka_topic in live,
        'partitions': parts.get(ds.kafka_topic),
        'consuming': bool(alert_pipeline._topic_active.get(ds.kafka_topic)),
        'system': ds.kafka_topic in SYSTEM_TOPICS,
    } for ds in rows]
    items.sort(key=lambda x: x['topic'])
    return jsonify({'success': True, 'data': {
        'items': items,
        'kafka_reachable': reachable,
        'managed_count': len(items),
    }})


@pipeline_bp.route('/device-topics', methods=['POST'])
@login_required
def create_device_topic():
    data = request.get_json() or {}
    topic = (data.get('topic') or '').strip()
    device_type = (data.get('device_type') or '').strip()
    if not topic:
        return jsonify({'success': False, 'error': 'topic 名称不能为空'}), 400
    import re as _re
    if not _re.fullmatch(r'[A-Za-z0-9._-]{1,100}', topic):
        return jsonify({'success': False, 'error': 'topic 名仅允许字母/数字/点/下划线/中划线，≤100 字符'}), 400
    if topic in SYSTEM_TOPICS:
        return jsonify({'success': False, 'error': '该名称为流水线系统 topic，禁止重复创建/绑定'}), 400
    # 基础 Kafka 配置（分片/有效期/容量），校验取值范围
    num_partitions = data.get('num_partitions', 1)
    retention_ms = data.get('retention_ms')
    retention_bytes = data.get('retention_bytes')
    max_message_bytes = data.get('max_message_bytes')
    try:
        num_partitions = int(num_partitions)
        if retention_ms is not None:
            retention_ms = int(retention_ms)
        if retention_bytes is not None:
            retention_bytes = int(retention_bytes)
        if max_message_bytes is not None:
            max_message_bytes = int(max_message_bytes)
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': '分片/有效期/大小必须为整数'}), 400
    if not 1 <= num_partitions <= 64:
        return jsonify({'success': False, 'error': '分片数必须在 1-64 之间'}), 400
    if retention_ms is not None and retention_ms < 60000:
        return jsonify({'success': False, 'error': '有效期不能少于 1 分钟'}), 400
    if retention_bytes is not None and retention_bytes < 1048576:
        return jsonify({'success': False, 'error': '单分区容量上限不能小于 1MB'}), 400
    if not AlertPipeline.create_device_topic(
            topic, num_partitions=num_partitions, retention_ms=retention_ms,
            retention_bytes=retention_bytes, max_message_bytes=max_message_bytes):
        return jsonify({'success': False, 'error': 'topic 创建失败（Kafka 不可达或已存在冲突）'}), 500
    # 平台创建的 topic 一律登记为 DataSource（纳管）：
    # 未指定设备类型时用 generic —— 保证 topic 必定出现在设备接入列表且可暂停/删除，
    # 避免「创建了却因为没绑数据源而看不见」。未指定设备类型时不自动拉起采集线程，
    # 保持 inactive，由用户在页面显式「启用」。
    from app.models import DataSource
    ds = DataSource.query.filter_by(kafka_topic=topic).first()
    if not ds:
        ds = DataSource(
            name=f'{device_type}-{topic}' if device_type else topic,
            product_type=device_type or 'generic',
            kafka_topic=topic,
            status='active' if device_type else 'inactive',
        )
        db.session.add(ds)
        db.session.commit()
    elif device_type and ds.product_type != device_type:
        ds.product_type = device_type
        db.session.commit()
    ds_info = ds.to_dict()
    if device_type:
        alert_pipeline.start_topic(topic)
    return jsonify({'success': True, 'data': {'topic': topic, 'datasource': ds_info}}), 201


@pipeline_bp.route('/device-topics/<path:topic>', methods=['GET'])
@login_required
def get_device_topic(topic):
    """topic 详情：Kafka 配置（分片/有效期/容量）+ 数据源绑定 + 消费状态。"""
    detail = AlertPipeline.describe_device_topic(topic)
    if detail is None:
        return jsonify({'success': False, 'error': 'topic 不存在或 Kafka 不可达'}), 404
    from app.models import DataSource
    ds = DataSource.query.filter_by(kafka_topic=topic).first()
    detail['datasource'] = ds.to_dict() if ds else None
    detail['consuming'] = topic in alert_pipeline._topic_active
    detail['topic'] = topic
    return jsonify({'success': True, 'data': detail})


@pipeline_bp.route('/device-topics/<path:topic>', methods=['PATCH'])
@login_required
def update_device_topic(topic):
    """编辑 topic：有效期/容量/单条大小（动态配置）+ 分片增加 + 设备类型改绑。"""
    data = request.get_json() or {}
    if topic in SYSTEM_TOPICS:
        return jsonify({'success': False, 'error': '流水线系统 topic 不可编辑'}), 400
    retention_ms = data.get('retention_ms')
    retention_bytes = data.get('retention_bytes')
    max_message_bytes = data.get('max_message_bytes')
    num_partitions = data.get('num_partitions')
    device_type = (data.get('device_type') or '').strip() or None
    try:
        if retention_ms is not None:
            retention_ms = int(retention_ms)
        if retention_bytes is not None:
            retention_bytes = int(retention_bytes)
        if max_message_bytes is not None:
            max_message_bytes = int(max_message_bytes)
        if num_partitions is not None:
            num_partitions = int(num_partitions)
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': '配置项必须为整数'}), 400
    if retention_ms is not None and retention_ms < 60000:
        return jsonify({'success': False, 'error': '有效期不能少于 1 分钟'}), 400
    if retention_bytes is not None and retention_bytes < 1048576:
        return jsonify({'success': False, 'error': '单分区容量上限不能小于 1MB'}), 400
    ok, err = AlertPipeline.alter_device_topic(
        topic, retention_ms=retention_ms, retention_bytes=retention_bytes,
        max_message_bytes=max_message_bytes, num_partitions=num_partitions)
    if not ok:
        return jsonify({'success': False, 'error': f'topic 更新失败: {err}'}), 400
    # 设备类型改绑（更新 DataSource 的解析器类型）
    ds_info = None
    if device_type:
        from app.models import DataSource
        ds = DataSource.query.filter_by(kafka_topic=topic).first()
        if ds:
            ds.product_type = device_type
            db.session.commit()
            ds_info = ds.to_dict()
    return jsonify({'success': True, 'data': {'topic': topic, 'datasource': ds_info}})


@pipeline_bp.route('/device-topics/<path:topic>', methods=['DELETE'])
@login_required
def delete_device_topic(topic):
    """删除 Kafka topic 本体（DataSource 纳管记录保留，可后续再建）。

    级联范围（既定约定）：仅删除 Kafka 中的 topic 及其数据，
    不停用/删除 DataSource 绑定，也不动引用它的过滤规则与输出路由。
    删除前先停止该 topic 的消费线程，避免删除后消费组持续报错。
    """
    from app.models import DataSource
    if topic in SYSTEM_TOPICS:
        return jsonify({'success': False, 'error': '流水线系统 topic 不可删除'}), 400
    ds = DataSource.query.filter_by(kafka_topic=topic).first()
    alert_pipeline.stop_topic(topic)
    ok, msg = AlertPipeline.delete_device_topic(topic)
    if not ok:
        return jsonify({'success': False, 'error': f'topic 删除失败：{msg}'}), 500
    return jsonify({'success': True, 'data': {
        'topic': topic,
        'datasource_id': ds.id if ds else None,
        'exists': False,
        'message': msg or 'topic 已删除（数据源纳管记录保留，可再次创建）',
    }})


@pipeline_bp.route('/device-topics/<path:topic>/messages', methods=['GET'])
@login_required
def get_device_topic_messages(topic):
    """查看 topic 最近的数据（回读最近 N 条消息）。"""
    try:
        limit = min(int(request.args.get('limit', 50)), 200)
    except (TypeError, ValueError):
        limit = 50
    msgs = AlertPipeline.read_topic_messages(topic, limit=limit)
    if msgs is None:
        return jsonify({'success': False, 'error': '读取失败（Kafka 不可达）'}), 503
    return jsonify({'success': True, 'data': {'topic': topic, 'count': len(msgs), 'messages': msgs}})


# ==================== ② 日志解析配置（raw-logs 多方式解析） ====================

# auto/json/regex/template 为原有方式；syslog/cef/keyvalue/csv/grok 复用旧版解析通道解析器
_PARSE_TYPES = ('auto', 'json', 'regex', 'template', 'syslog', 'cef', 'keyvalue', 'csv', 'grok')

# 需要 parser_config 额外配置的方式（UI 展开配置项）
_PARSER_CONFIG_TYPES = ('csv', 'keyvalue', 'grok')

_FIELD_TYPES = ('', 'string', 'number', 'int', 'float', 'boolean', 'datetime', 'ip')


@pipeline_bp.route('/parse-profiles', methods=['GET'])
@login_required
def list_parse_profiles():
    rows = ParseProfile.query.order_by(ParseProfile.id).all()
    tpl_names = {t.id: t.name for t in _list_templates()}
    data = []
    for r in rows:
        d = r.to_dict()
        d['template_name'] = tpl_names.get(r.template_id)
        data.append(d)
    return jsonify({'success': True, 'data': data})


def _list_templates():
    """模板中心可用的解析模板（alert 场景优先，全部类型可作字段集来源）。"""
    from app.routes.templates import AlertTemplate
    return AlertTemplate.query.filter_by(enabled=True).all()


@pipeline_bp.route('/parse-templates', methods=['GET'])
@login_required
def list_parse_templates():
    """供解析配置选择的模板中心模板（含字段清单）。"""
    import re as _re
    from app.routes.templates import AlertTemplate
    rows = AlertTemplate.query.filter_by(enabled=True).all()
    data = []
    for t in rows:
        keys = [k.strip() for k in _re.findall(r"\{\{\s*([^{}]+?)\s*\}\}", t.content or '')]
        data.append({'id': t.id, 'name': t.name, 'fields': keys})
    return jsonify({'success': True, 'data': data})


def _alert_model_fields() -> list:
    """安全告警模型的字段清单（映射目标首选）。"""
    from app.alert_pipeline.pipeline import _alert_model_fields as _f
    try:
        return [{'key': v['key'], 'label': v['label'], 'category': v['category']}
                for v in _f() if v.get('key')]
    except Exception:
        return []


@pipeline_bp.route('/parse-profiles/model-fields', methods=['GET'])
@login_required
def parse_model_fields():
    """安全告警模型字段——解析结果必须对齐的目标字段集。"""
    fields = _alert_model_fields()
    return jsonify({'success': True, 'data': fields,
                    'count': len(fields),
                    'model_missing': not fields})


@pipeline_bp.route('/parse-profiles/field-catalog', methods=['GET'])
@login_required
def parse_field_catalog():
    """字段映射目录 = 安全告警模型字段（优先） + 标准告警字段（去重）。

    source 标记：
      model    — 属于「安全告警模型」，解析结果对齐到这些字段才算匹配模型
      standard — AlertFieldDefinition 标准告警字段
    """
    from app.models import AlertFieldDefinition

    fields, seen = [], set()
    for v in _alert_model_fields():
        if v['key'] in seen:
            continue
        seen.add(v['key'])
        fields.append({'name': v['key'], 'label': v['label'], 'type': 'string',
                       'category': v['category'] or '安全告警模型',
                       'aliases': [], 'required': False, 'source': 'model'})
    for f in AlertFieldDefinition.query.filter_by(enabled=True).order_by(
            AlertFieldDefinition.category, AlertFieldDefinition.sort_order).all():
        if f.name in seen:
            continue
        seen.add(f.name)
        fields.append({'name': f.name, 'label': f.label, 'type': f.field_type,
                       'category': f.category, 'aliases': f.aliases or [],
                       'required': bool(f.required), 'source': 'standard'})
    return jsonify({'success': True, 'data': fields})


def _guess_field_type_parse_type(name, value) -> str:
    """按字段名与取值推断 field_type（给 CSV/KV 这类无类型输入的场景用）。"""
    from app.alert_pipeline.pipeline import _infer_field_type as _infer
    try:
        return _infer(name, value)
    except Exception:
        return 'string'


@pipeline_bp.route('/parse-profiles/preview', methods=['POST'])
@login_required
def preview_parse():
    """样本试解析（不落库）：把样本日志按配置解析+映射，并报告安全告警模型字段命中率。

    借鉴旧版 /pipelines/parse/test：实时给到解析结果与可用字段，配置即可所见即所得。
    body: {match_type, match_value?, template_id?, parser_config?, field_mappings?, sample}
    """
    from app.alert_pipeline.pipeline import ParseProfile, _suggest_mappings

    data = request.get_json() or {}
    sample = (data.get('sample') or '').strip()
    if not sample:
        return jsonify({'success': False, 'error': '请提供样本日志'}), 400
    match_type = (data.get('match_type') or 'auto').strip()
    if match_type not in _PARSE_TYPES:
        return jsonify({'success': False, 'error': f'解析方式仅支持 {", ".join(_PARSE_TYPES)}'}), 400

    p = ParseProfile(name='__preview__', topic='raw-logs', match_type=match_type,
                     match_value=str(data.get('match_value') or ''),
                     template_id=data.get('template_id'),
                     parser_config=data.get('parser_config') or {},
                     field_mappings=_validate_field_mappings(data.get('field_mappings')) or [])
    # preview 不从 DB 查询，仅为复用解析逻辑（detached 实例不落库）
    try:
        try:
            if p.match_type != 'regex' and p.match_type not in _PARSER_CONFIG_TYPES \
                    and p.match_type not in ('syslog', 'cef'):
                raw = json.loads(sample)
            else:
                raw = sample
        except (ValueError, TypeError):
            raw = sample
        parsed = p.parse(raw)
    except Exception as e:
        return jsonify({'success': False, 'error': f'解析失败: {e}'}), 400
    if not parsed:
        return jsonify({'success': False, 'error': '未解析出任何字段（请检查解析方式与样本是否匹配）'}), 400

    mapped = p.map_fields(parsed) or {}
    model_fields = _alert_model_fields()
    hit = [f for f in model_fields if mapped.get(f['key']) not in (None, '')]
    return jsonify({'success': True, 'data': {
        'parsed': parsed,
        'parsed_fields': [{'name': k, 'type': _guess_field_type_parse_type(k, v)}
                          for k, v in parsed.items()],
        'mapped': mapped,
        'model_total': len(model_fields),
        'model_hit': len(hit),
        'model_missing': [f['key'] for f in model_fields
                          if mapped.get(f['key']) in (None, '')],
        'suggestions': _suggest_mappings(
            [{'name': k, 'type': _guess_field_type_parse_type(k, v)} for k, v in parsed.items()]),
    }})


@pipeline_bp.route('/parse-profiles/auto-map', methods=['POST'])
@login_required
def auto_map_fields():
    """借鉴旧版 auto-map：为解析出的字段推荐目标标准字段（精确/模糊 + 置信度）。

    body: {parsed_fields: [{name, type?}]}
    """
    from app.alert_pipeline.pipeline import _suggest_mappings
    data = request.get_json() or {}
    parsed_fields = data.get('parsed_fields') or []
    if not isinstance(parsed_fields, list):
        return jsonify({'success': False, 'error': 'parsed_fields 需为数组'}), 400
    return jsonify({'success': True, 'data': {
        'mappings': _suggest_mappings(parsed_fields),
        'total': len(parsed_fields),
    }})


def _validate_field_mappings(raw) -> list:
    """校验字段映射列表：[{source, target, field_type?, default_value?, required?}]。

    非法格式返回 None（由调用方返回 400）。field_type 借鉴 PipelineFieldMapping。
    """
    if not raw:
        return []
    if not isinstance(raw, list):
        return None
    out = []
    for m in raw:
        if not isinstance(m, dict):
            return None
        src = str(m.get('source') or '').strip()
        tgt = str(m.get('target') or '').strip()
        if not src or not tgt:
            return None
        ftype = str(m.get('field_type') or '').strip().lower()
        if ftype and ftype not in _FIELD_TYPES:
            return None
        out.append({'source': src, 'target': tgt, 'field_type': ftype,
                    'default_value': str(m.get('default_value') or ''),
                    'required': bool(m.get('required'))})
    return out


def _validate_parser_config(raw) -> dict:
    """校验解析器配置：csv {headers,delimiter} / keyvalue {delimiter} / grok {pattern}。"""
    if not raw:
        return {}
    if not isinstance(raw, dict):
        return None
    cfg: dict = {}
    if isinstance(raw.get('headers'), list):
        cfg['headers'] = [str(h).strip() for h in raw['headers'] if str(h).strip()]
    elif isinstance(raw.get('headers'), str):
        cfg['headers'] = [h.strip() for h in raw['headers'].split(',') if h.strip()]
    for k in ('delimiter', 'pair_delimiter', 'kv_delimiter', 'pattern'):
        if raw.get(k) not in (None, ''):
            cfg[k] = str(raw[k])
    return cfg


@pipeline_bp.route('/parse-profiles', methods=['POST'])
@login_required
def create_parse_profile():
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    match_type = (data.get('match_type') or 'auto').strip()
    if not name:
        return jsonify({'success': False, 'error': '配置名称不能为空'}), 400
    if match_type not in _PARSE_TYPES:
        return jsonify({'success': False, 'error': f'解析方式仅支持 {", ".join(_PARSE_TYPES)}'}), 400
    match_value = str(data.get('match_value') or '')
    if match_type in ('regex', 'grok') and not match_value:
        return jsonify({'success': False,
                        'error': ('正则解析必须提供匹配模式' if match_type == 'regex'
                                  else 'Grok 解析必须提供模式（如 %{IPV4:src_ip}）')}), 400
    if match_type == 'regex':
        import re as _re
        try:
            _re.compile(match_value)
        except _re.error as e:
            return jsonify({'success': False, 'error': f'正则表达式无效: {e}'}), 400
    if match_type == 'template' and not data.get('template_id'):
        return jsonify({'success': False, 'error': '模板解析必须选择资源管理模板'}), 400
    parser_cfg = _validate_parser_config(data.get('parser_config'))
    if parser_cfg is None:
        return jsonify({'success': False, 'error': '解析器配置格式无效'}), 400
    mappings = _validate_field_mappings(data.get('field_mappings'))
    if mappings is None:
        return jsonify({'success': False, 'error': '字段映射格式无效（需 source/target）'}), 400
    p = ParseProfile(
        name=name, topic=(data.get('topic') or 'raw-logs').strip() or 'raw-logs',
        match_type=match_type, match_value=match_value,
        template_id=data.get('template_id'),
        parser_config=parser_cfg,
        field_mappings=mappings,
        enabled=bool(data.get('enabled', True)))
    db.session.add(p)
    db.session.commit()
    return jsonify({'success': True, 'data': p.to_dict()}), 201


@pipeline_bp.route('/parse-profiles/<int:pid>', methods=['PATCH'])
@login_required
def update_parse_profile(pid):
    p = ParseProfile.query.get(pid)
    if not p:
        return jsonify({'success': False, 'error': '配置不存在'}), 404
    data = request.get_json() or {}
    for f in ('name', 'topic', 'match_value'):
        if f in data:
            setattr(p, f, str(data[f]).strip())
    if 'match_type' in data:
        if data['match_type'] not in _PARSE_TYPES:
            return jsonify({'success': False, 'error': '解析方式不支持'}), 400
        p.match_type = data['match_type']
    if 'template_id' in data:
        p.template_id = data['template_id']
    if 'parser_config' in data:
        cfg = _validate_parser_config(data['parser_config'])
        if cfg is None:
            return jsonify({'success': False, 'error': '解析器配置格式无效'}), 400
        p.parser_config = cfg
    if 'field_mappings' in data:
        mappings = _validate_field_mappings(data['field_mappings'])
        if mappings is None:
            return jsonify({'success': False, 'error': '字段映射格式无效（需 source/target）'}), 400
        p.field_mappings = mappings
    if 'enabled' in data:
        p.enabled = bool(data['enabled'])
    db.session.commit()
    return jsonify({'success': True, 'data': p.to_dict()})


@pipeline_bp.route('/parse-profiles/<int:pid>', methods=['DELETE'])
@login_required
def delete_parse_profile(pid):
    p = ParseProfile.query.get(pid)
    if not p:
        return jsonify({'success': False, 'error': '配置不存在'}), 404
    db.session.delete(p)
    db.session.commit()
    return jsonify({'success': True, 'data': {'id': pid}})


# ==================== ③ 告警分流策略（判定开关 + 出口清单，单层出口） ====================

def _validate_exits(raw):
    """校验出口列表，返回 (exits, error)；exits 为待写入的 dict 列表（不含 policy_id）。"""
    import re as _re
    if raw in (None, ''):
        raw = []
    if not isinstance(raw, list):
        return None, 'exits 必须是数组'
    out, seen = [], set()
    for i, item in enumerate(raw, 1):
        if not isinstance(item, dict):
            return None, f'第 {i} 条出口格式不正确'
        branch = (item.get('branch') or BRANCH_VALID).strip()
        if branch not in _BRANCHES:
            return None, f'第 {i} 条出口的分支仅支持 {", ".join(_BRANCHES)}'
        target = (item.get('target_topic') or '').strip()
        if not _re.fullmatch(_TOPIC_NAME_RE, target):
            return None, f'第 {i} 条出口的目标 topic 不合法：{target or "(空)"}'
        if target in ENTRY_TOPICS:
            return None, (f'第 {i} 条出口的目标不能是流水线入口 topic'
                          f'（{", ".join(ENTRY_TOPICS)}），否则会形成环路')
        if (branch, target) in seen:
            return None, f'同一分支下的出口 topic 重复：{target}'
        seen.add((branch, target))
        tpl = item.get('template_id')
        if tpl in ('', None):
            tpl = None
        else:
            try:
                tpl = int(tpl)
            except (TypeError, ValueError):
                return None, f'第 {i} 条出口的字段模型 id 不合法'
        out.append({
            'name': (item.get('name') or '').strip() or None,
            'branch': branch, 'target_topic': target, 'template_id': tpl,
            'enabled': bool(item.get('enabled', True)),
            'sort_order': int(item.get('sort_order') or 0),
        })
    return out, None


def _normalize_source_topics(data: dict):
    """归一化来源 topic 入参，支持多选。

    接受 source_topic（字符串，可逗号分隔多个）或 source_topics（字符串数组）。
    '*' 表示全局，不能与其他 topic 混用。返回 (逗号连接串, error)。
    """
    import re as _re
    raw = data.get('source_topics')
    if isinstance(raw, list):
        parts = [str(t or '').strip() for t in raw]
    else:
        parts = str(data.get('source_topic') or '*').split(',')
    topics, seen = [], set()
    for t in parts:
        t = t.strip()
        if not t or t in seen:
            continue
        seen.add(t)
        topics.append(t)
    if not topics:
        topics = ['*']
    if '*' in topics and len(topics) > 1:
        return None, '全局（*）不能与具体 topic 同时选择：全局策略请单独创建'
    for t in topics:
        if t != '*' and not _re.fullmatch(_TOPIC_NAME_RE, t):
            return None, f'来源 topic 名不合法：{t}'
    joined = ','.join(topics)
    if len(joined) > 512:
        return None, '来源 topic 数量过多（总长超过 512 字符），请拆分为多条策略'
    return joined, None


def _validate_policy_payload(data: dict):
    """校验分流策略入参（含嵌套出口），返回 (kwargs, exits, error)。"""
    name = (data.get('name') or '').strip()
    if not name:
        return None, None, '策略名称不能为空'
    source_topic, err = _normalize_source_topics(data)
    if err:
        return None, None, err
    exits, err = _validate_exits(data.get('exits'))
    if err:
        return None, None, err
    return {
        'name': name, 'source_topic': source_topic,
        'dedup_enabled': bool(data.get('dedup_enabled', True)),
        'whitelist_enabled': bool(data.get('whitelist_enabled', True)),
        'enabled': bool(data.get('enabled', True)),
        'sort_order': int(data.get('sort_order') or 0),
    }, exits, None


def _apply_exits(policy, exits):
    """整体替换策略出口：同 (分支, 目标 topic) 的条目就地更新，其余删除，新增追加。"""
    keep = {(e['branch'], e['target_topic']): e for e in exits}
    for cur in list(policy.exits):
        spec = keep.pop((cur.branch, cur.target_topic), None)
        if spec is None:
            policy.exits.remove(cur)
        else:
            for k, v in spec.items():
                setattr(cur, k, v)
    for spec in keep.values():
        policy.exits.append(AlertExit(**spec))


@pipeline_bp.route('/dispatch-policies', methods=['GET'])
@login_required
def list_dispatch_policies():
    # 首访播种内置默认策略：不带出口 → 回退内置默认（未过滤 valid-alerts / 被过滤 invalid-alerts）
    if AlertDispatchPolicy.query.count() == 0:
        db.session.add(AlertDispatchPolicy(
            name='默认分流（全局）', source_topic='*',
            dedup_enabled=True, whitelist_enabled=True, enabled=True, sort_order=0))
        db.session.commit()
    rows = AlertDispatchPolicy.query.order_by(
        AlertDispatchPolicy.sort_order, AlertDispatchPolicy.id).all()
    tpl_names = {t.id: t.name for t in _list_templates()}
    data = []
    for p in rows:
        d = p.to_dict()
        for e in d['exits']:
            e['template_name'] = tpl_names.get(e['template_id'])
        data.append(d)
    return jsonify({'success': True, 'data': data})


@pipeline_bp.route('/dispatch-policies', methods=['POST'])
@login_required
def create_dispatch_policy():
    kwargs, exits, err = _validate_policy_payload(request.get_json() or {})
    if err:
        return jsonify({'success': False, 'error': err}), 400
    p = AlertDispatchPolicy(**kwargs)
    for spec in exits:
        p.exits.append(AlertExit(**spec))
    db.session.add(p)
    db.session.commit()
    return jsonify({'success': True, 'data': p.to_dict()}), 201


@pipeline_bp.route('/dispatch-policies/<int:pid>', methods=['PATCH'])
@login_required
def update_dispatch_policy(pid):
    p = AlertDispatchPolicy.query.get(pid)
    if not p:
        return jsonify({'success': False, 'error': '分流策略不存在'}), 404
    data = request.get_json() or {}
    # source_topics 是 to_dict() 的派生字段（source_topic 拆分而来），不能作为合并基线，
    # 否则旧值数组会覆盖本次提交的 source_topic（表现为：改完来源又变回全局 *）
    base = {k: v for k, v in p.to_dict().items() if k not in ('exits', 'source_topics')}
    payload = {**base, **data}
    touch_exits = 'exits' in data
    if not touch_exits:
        payload['exits'] = []
    kwargs, exits, err = _validate_policy_payload(payload)
    if err:
        return jsonify({'success': False, 'error': err}), 400
    for k, v in kwargs.items():
        setattr(p, k, v)
    if touch_exits:
        _apply_exits(p, exits)
    db.session.commit()
    return jsonify({'success': True, 'data': p.to_dict()})


@pipeline_bp.route('/dispatch-policies/<int:pid>', methods=['DELETE'])
@login_required
def delete_dispatch_policy(pid):
    p = AlertDispatchPolicy.query.get(pid)
    if not p:
        return jsonify({'success': False, 'error': '分流策略不存在'}), 404
    db.session.delete(p)     # 出口随关系级联删除
    db.session.commit()
    return jsonify({'success': True, 'data': {'id': pid}})


# ==================== ④ 告警存储任务（Kafka → ES 持续化） ====================

_INDEX_PRESETS = {
    INDEX_VALID: '有效告警索引（历史默认）',
    INDEX_INVALID: '无效/隔离告警索引（历史默认）',
}


@pipeline_bp.route('/storage-routes', methods=['GET'])
@login_required
def list_storage_routes():
    """存储任务列表：配置信息 + 运行统计（线程存活/写入数/最近错误）+ ES 文档数。"""
    rows = AlertStorageRoute.query.order_by(AlertStorageRoute.id).all()
    data = []
    for r in rows:
        d = r.to_dict()
        d['runtime'] = alert_pipeline.storage_route_stats(r.id)
        es_info = alert_pipeline._es_index_stats(r.index_name)
        d['es'] = es_info or {'docs': None, 'exists': False}
        data.append(d)
    return jsonify({'success': True, 'data': data})


@pipeline_bp.route('/storage-routes', methods=['POST'])
@login_required
def create_storage_route():
    import re as _re
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    source_topic = (data.get('source_topic') or '').strip()
    index_name = (data.get('index_name') or '').strip()
    if not name or not source_topic or not index_name:
        return jsonify({'success': False, 'error': '任务名称、源 topic、目标索引均不能为空'}), 400
    if not _re.fullmatch(_TOPIC_NAME_RE, source_topic):
        return jsonify({'success': False, 'error': '源 topic 名不合法'}), 400
    if not _re.fullmatch(_ES_INDEX_RE, index_name):
        return jsonify({'success': False,
                        'error': '索引名不合法：须小写字母开头，仅含小写字母/数字/点/下划线/中划线'}), 400
    if AlertStorageRoute.query.filter_by(source_topic=source_topic, index_name=index_name).first():
        return jsonify({'success': False, 'error': '已存在相同 topic → 索引 的存储任务'}), 400
    r = AlertStorageRoute(
        name=name, source_topic=source_topic, index_name=index_name,
        id_field=(data.get('id_field') or 'alert_id').strip() or 'alert_id',
        description=str(data.get('description') or '')[:300],
        enabled=bool(data.get('enabled', True)))
    db.session.add(r)
    db.session.commit()
    return jsonify({'success': True, 'data': r.to_dict()}), 201


@pipeline_bp.route('/storage-routes/<int:rid>', methods=['PATCH'])
@login_required
def update_storage_route(rid):
    import re as _re
    r = AlertStorageRoute.query.get(rid)
    if not r:
        return jsonify({'success': False, 'error': '存储任务不存在'}), 404
    data = request.get_json() or {}
    if 'name' in data:
        r.name = str(data['name']).strip() or r.name
    if 'source_topic' in data:
        st = str(data['source_topic']).strip()
        if not _re.fullmatch(_TOPIC_NAME_RE, st):
            return jsonify({'success': False, 'error': '源 topic 名不合法'}), 400
        r.source_topic = st
    if 'index_name' in data:
        ix = str(data['index_name']).strip()
        if not _re.fullmatch(_ES_INDEX_RE, ix):
            return jsonify({'success': False, 'error': '索引名不合法（须小写开头）'}), 400
        r.index_name = ix
    if 'id_field' in data:
        r.id_field = str(data['id_field']).strip() or 'alert_id'
    if 'description' in data:
        r.description = str(data['description'] or '')[:300]
    if 'enabled' in data:
        r.enabled = bool(data['enabled'])
    db.session.commit()
    return jsonify({'success': True, 'data': r.to_dict()})


@pipeline_bp.route('/storage-routes/<int:rid>', methods=['DELETE'])
@login_required
def delete_storage_route(rid):
    r = AlertStorageRoute.query.get(rid)
    if not r:
        return jsonify({'success': False, 'error': '存储任务不存在'}), 404
    db.session.delete(r)
    db.session.commit()
    return jsonify({'success': True, 'data': {'id': rid}})


# ==================== 配置下拉辅助：Kafka topic / ES 索引 ====================

@pipeline_bp.route('/kafka-topics', methods=['GET'])
@login_required
def list_kafka_topics():
    """列举 Kafka 业务 topic（供存储任务/输出路由选择源 topic）。"""
    info = alert_pipeline.list_kafka_topics()
    return jsonify({'success': True, 'data': info})


@pipeline_bp.route('/es-indexes', methods=['GET'])
@login_required
def list_es_indexes():
    """列举 ES 索引 + 文档数（供存储任务选择目标索引，也可直接新建索引名）。"""
    idx = alert_pipeline.list_es_indexes()
    have = {i['name'] for i in idx}
    for name, label in _INDEX_PRESETS.items():
        if name not in have:
            idx.append({'name': name, 'docs': 0, 'preset': label})
    return jsonify({'success': True, 'data': sorted(idx, key=lambda x: x['name'])})
