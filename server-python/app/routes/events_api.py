"""
事件管理 API 路由 (新版)
包含事件CRUD和处置记录功能
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import Event, Alert, EventAction, Playbook, AuditLog
from app.utils import es_alerts, event_enrichment, event_alert_link
from datetime import datetime
from sqlalchemy import func, desc
import logging

logger = logging.getLogger(__name__)

events_api_bp = Blueprint('events_api', __name__)

# ===== 事件状态机 =====
# 主流程: new → acknowledged → investigating → resolved → closed
# 旁路:   非终态均可 → false_positive（误报）
# 纠错:   resolved/closed/false_positive → investigating（重新打开）
# pending_approval/approval_rejected 为审批闭环专用态，可回 investigating
STATUS_TRANSITIONS = {
    'new':              {'acknowledged', 'investigating', 'false_positive'},
    'acknowledged':     {'investigating', 'resolved', 'closed', 'false_positive'},
    'investigating':    {'resolved', 'closed', 'false_positive'},
    'resolved':         {'closed', 'investigating'},
    'closed':           {'investigating'},
    'false_positive':   {'investigating'},
    'pending_approval': {'investigating', 'closed', 'false_positive'},
    'approval_rejected': {'investigating', 'false_positive'},
}
VALID_EVENT_STATUSES = set(STATUS_TRANSITIONS.keys())
TERMINAL_STATUSES = {'closed', 'false_positive'}


def _current_actor():
    """从 request.current_user（login_required 注入的 JWT payload）取当前操作人。"""
    u = getattr(request, 'current_user', None) or {}
    return u.get('user_id'), (u.get('username') or 'system')


def validate_transition(old_status, new_status):
    """校验状态流转合法性，非法返回错误信息字符串，合法返回 None。"""
    if new_status == old_status:
        return '状态未发生变化'
    allowed = STATUS_TRANSITIONS.get(old_status)
    if allowed is None:
        # 历史脏数据：状态值不在状态机内，放行到任意目标态（自愈）
        return None
    if new_status not in allowed:
        return f'不允许从「{old_status}」流转到「{new_status}」，可流转: {", ".join(sorted(allowed))}'
    return None


def generate_event_code():
    """生成事件ID，格式为：EVT-年月日-序号（使用数据库数值最大避免字符串排序问题）"""
    today = datetime.utcnow().strftime('%Y%m%d')
    prefix = f'EVT-{today}-'
    
    # 使用数据库函数提取数字部分求最大值（避免1000 < 999的字符串排序问题）
    from sqlalchemy import cast, Integer, func as _f
    max_num = db.session.query(
        _f.max(
            cast(
                _f.substring(Event.event_code, len(prefix) + 1),
                Integer
            )
        )
    ).filter(
        Event.event_code.like(f'{prefix}%')
    ).scalar()
    
    if max_num:
        new_seq = max_num + 1
    else:
        new_seq = 1
    
    return f"{prefix}{new_seq:03d}"
def _load_event(event_id):
    """按数字 ID 或 event_code 载入事件（两个标识符在历史数据中都在用）。"""
    if event_id is None:
        return None
    sid = str(event_id)
    if sid.isdigit():
        return Event.query.get(int(sid))
    return Event.query.filter_by(event_code=sid).first()


def create_action_record(event_id, action, user_id, user_name, content=None, 
                         previous_status=None, new_status=None,
                         previous_severity=None, new_severity=None,
                         assignee=None, attachments=None,
                         playbook_id=None, playbook_name=None,
                         playbook_execution_id=None, playbook_result=None,
                         extra_data=None):
    """创建处置记录"""
    action_record = EventAction(
        event_id=event_id,
        action=action,
        user_id=user_id,
        user_name=user_name,
        content=content,
        previous_status=previous_status,
        new_status=new_status,
        previous_severity=previous_severity,
        new_severity=new_severity,
        assignee=assignee,
        attachments=attachments or [],
        playbook_id=playbook_id,
        playbook_name=playbook_name,
        playbook_execution_id=playbook_execution_id,
        playbook_result=playbook_result or {},
        extra_data=extra_data or {}
    )
    db.session.add(action_record)
    return action_record


# =====================
# 事件列表与CRUD
# =====================

@events_api_bp.route('/events', methods=['GET'])
@login_required
def list_events():
    """获取事件列表"""
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 20, type=int)
    severity = request.args.get('severity')
    status = request.args.get('status')
    search = request.args.get('search', '')
    
    query = Event.query
    
    if severity:
        query = query.filter(Event.severity == severity)
    if status:
        query = query.filter(Event.status == status)
    if search:
        query = query.filter(
            db.or_(
                Event.title.ilike(f'%{search}%'),
                Event.event_code.ilike(f'%{search}%')
            )
        )
    
    pagination = query.order_by(Event.created_at.desc()).paginate(
        page=page, per_page=page_size, error_out=False
    )
    
    return jsonify({
        'success': True,
        'data': {
            'items': [e.to_dict() for e in pagination.items],
            'total': pagination.total,
            'page': page,
            'page_size': page_size,
            'pages': pagination.pages
        }
    })


@events_api_bp.route('/events/<event_id>', methods=['GET'])
@login_required
def get_event(event_id):
    """获取事件详情"""
    # 支持数字ID和event_code
    if event_id.isdigit():
        event = Event.query.get(int(event_id))
    else:
        event = Event.query.filter_by(event_code=event_id).first()
    
    if not event:
        return jsonify({'success': False, 'error': '事件不存在'}), 404
    
    return jsonify({
        'success': True,
        'data': event.to_dict()
    })


@events_api_bp.route('/events/<event_id>/ai-analyze', methods=['POST'])
@login_required
def ai_analyze_event(event_id):
    """对安全事件执行结构化 AI 研判，结果写入 event.extra_data['ai_analysis']。

    事件研判与告警研判同源（同一 LLM 网关、同一「互斥标签 + 证据链」结构），
    区别在于上下文：事件会带上其关联告警摘要，且额外给出影响面与攻击链阶段。
    """
    event = _load_event(event_id)
    if not event:
        return jsonify({'success': False, 'error': '事件不存在'}), 404

    try:
        from app.routes.ai_judgment import run_event_judgment
        result = run_event_judgment(event)
    except Exception as e:  # 兜底：不因研判失败阻断处置流程
        return jsonify({'success': False, 'error': f'研判执行失败: {e}'}), 500

    extra = dict(event.extra_data or {})
    extra['ai_analysis'] = result
    event.extra_data = extra
    db.session.commit()

    return jsonify({
        'success': True,
        'data': result,
        'event': event.to_dict(),
    })


@events_api_bp.route('/events/<event_id>/ai-analysis', methods=['GET'])
@login_required
def get_event_ai_analysis(event_id):
    """读取事件已保存的 AI 研判结果（未研判时返回 null，不做占位）。"""
    event = _load_event(event_id)
    if not event:
        return jsonify({'success': False, 'error': '事件不存在'}), 404
    return jsonify({
        'success': True,
        'data': (event.extra_data or {}).get('ai_analysis'),
    })


@events_api_bp.route('/events', methods=['POST'])
@login_required
def create_event():
    """创建事件，可关联告警"""
    data = request.get_json()

    # 自动生成事件ID
    event_code = generate_event_code()
    
    # 获取当前用户信息
    user_id, user_name = _current_actor()
    
    # 获取关联的告警信息（告警唯一真相源 = ES，勿用已废弃的 PG alerts 表）
    alert_ids = [str(a) for a in (data.get('alert_ids') or [])]
    alert_docs = {}
    for aid in alert_ids:
        doc = es_alerts.get_alert(aid)
        if doc:
            alert_docs[aid] = doc

    src_ip = (data.get('source_ip') or data.get('src_ip') or '').strip() or None
    description = data.get('description', '')

    # 构建事件扩展数据：关联告警 + 统计摘要 + 主责源 IP + 自动描述
    extra_data = {'event_type': data.get('category', data.get('event_type', '其他'))}
    if alert_docs:
        content = event_enrichment.build_event_content(
            alert_docs, origin='人工创建', user_description=description)
        extra_data['related_alerts'] = content['related_alerts']
        extra_data['summary'] = content['summary']
        extra_data['alert_count'] = len(alert_docs)
        extra_data['alert_ids'] = alert_ids
        src_ip = src_ip or content['src_ip'] or None
        # 有告警时把统计信息并入描述，避免事件详情只剩一句手填话术
        description = content['description']
    if data.get('attachments'):
        extra_data['attachments'] = data['attachments']

    # 创建事件
    event = Event(
        event_code=event_code,
        title=data.get('title', '新建事件'),
        description=description,
        severity=data.get('severity', 'medium'),
        src_ip=src_ip,
        category=data.get('category', data.get('event_type', '其他')),
        source=data.get('source', 'manual'),
        status='new',
        raw_log=data.get('raw_log'),
        extra_data=extra_data,
        timestamp=datetime.utcnow()
    )
    db.session.add(event)
    db.session.flush()  # 获取event.id
    
    # 创建处置记录：事件创建
    create_action_record(
        event_id=event.event_code,
        action='created',
        user_id=user_id,
        user_name=user_name,
        content=f'创建了事件：{event.title}',
        extra_data={'event_type': event.category, 'severity': event.severity,
                    'alert_count': len(alert_docs), 'src_ip': src_ip}
    )

    # 如果有告警，统一联动：状态推到 investigating + event_ids 回写（ES 为唯一真相源）
    if alert_docs:
        try:
            link = event_alert_link.link_alerts_to_event(
                list(alert_docs.keys()), event.event_code, 'investigating')
        except Exception as e:
            logger.warning(f'事件 {event.event_code} 关联告警状态回写失败: {e}')
        # 创建告警关联记录
        create_action_record(
            event_id=event.event_code,
            action='enriched',
            user_id=user_id,
            user_name=user_name,
            content=f'关联了 {len(alert_ids)} 条告警',
            extra_data={'alert_ids': alert_ids, 'alert_count': len(alert_ids)}
        )
    
    # 记录审计日志
    audit = AuditLog(
        user_id=user_id,
        username=user_name,
        action='创建事件',
        module='events',
        target=event.event_code,
        details={'title': event.title, 'severity': event.severity,
                 'alert_count': len(alert_docs), 'src_ip': src_ip},
        ip=request.remote_addr
    )
    db.session.add(audit)
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': event.to_dict()
    }), 201


@events_api_bp.route('/events/<event_id>', methods=['PUT'])
@login_required
def update_event(event_id):
    """更新事件"""
    # 支持数字ID和event_code
    if event_id.isdigit():
        event = Event.query.get(int(event_id))
    else:
        event = Event.query.filter_by(event_code=event_id).first()

    if not event:
        return jsonify({'success': False, 'error': '事件不存在'}), 404
    
    data = request.get_json()
    user_id, user_name = _current_actor()
    
    # 记录状态变更
    old_status = event.status
    old_severity = event.severity
    
    # 更新字段
    if 'title' in data:
        event.title = data['title']
    if 'description' in data:
        event.description = data['description']
    if 'severity' in data:
        event.severity = data['severity']
    if 'category' in data:
        event.category = data['category']
    if 'src_ip' in data or 'source_ip' in data:
        event.src_ip = (data.get('src_ip') or data.get('source_ip') or '').strip() or None
    if 'status' in data:
        event.status = data['status']
    if 'raw_log' in data:
        event.raw_log = data['raw_log']
    
    # 如果严重度变更，记录
    if 'severity' in data and data['severity'] != old_severity:
        create_action_record(
            event_id=event.event_code,
            action='severity_changed',
            user_id=user_id,
            user_name=user_name,
            content=f'严重度从 {old_severity} 变更为 {data["severity"]}',
            previous_severity=old_severity,
            new_severity=data['severity']
        )
    
    # 如果状态变更，记录
    if 'status' in data and data['status'] != old_status:
        create_action_record(
            event_id=event.event_code,
            action='status_changed',
            user_id=user_id,
            user_name=user_name,
            content=f'状态从 {old_status} 变更为 {data["status"]}',
            previous_status=old_status,
            new_status=data['status']
        )
        
        # 如果是关闭事件，记录关闭操作
        if data['status'] == 'closed':
            create_action_record(
                event_id=event.event_code,
                action='closed',
                user_id=user_id,
                user_name=user_name,
                content=data.get('close_reason', '完成处置，关闭事件'),
                extra_data={'close_reason': data.get('close_reason', '')}
            )

        # 联动：事件状态变化 → 同步关联告警状态（closed→closed 等映射见
        # event_alert_link.EVENT_TO_ALERT_STATUS，避免已转事件的告警被重复分析）
        try:
            synced = event_alert_link.sync_alerts_on_event_status(
                event_alert_link.collect_event_alert_ids(event),
                data['status'], event.event_code)
            if synced:
                create_action_record(
                    event_id=event.event_code,
                    action='alert_sync',
                    user_id=user_id,
                    user_name=user_name,
                    content=f'事件状态变更为 {data["status"]}，'
                            f'已同步 {synced} 条关联告警状态'
                )
        except Exception as e:
            logger.warning(f'事件 {event.event_code} 状态联动告警失败: {e}')

    db.session.commit()

    return jsonify({
        'success': True,
        'data': event.to_dict()
    })


@events_api_bp.route('/events/<event_id>/status', methods=['PUT'])
@login_required
def update_event_status(event_id):
    """更新事件状态"""
    # 支持数字ID和event_code
    if event_id.isdigit():
        event = Event.query.get(int(event_id))
    else:
        event = Event.query.filter_by(event_code=event_id).first()

    if not event:
        return jsonify({'success': False, 'error': '事件不存在'}), 404
    
    data = request.get_json()
    new_status = data.get('status')

    if new_status not in VALID_EVENT_STATUSES:
        return jsonify({'success': False, 'error': '无效的状态'}), 400

    old_status = event.status
    err = validate_transition(old_status, new_status)
    if err:
        return jsonify({'success': False, 'error': err}), 400

    reason = (data.get('reason') or '').strip()
    user_id, user_name = _current_actor()
    
    event.status = new_status
    event.updated_at = datetime.utcnow()

    # 终态处置说明：closed 必填，resolved/false_positive 可选，写入处置记录
    if new_status == 'closed' and not reason:
        return jsonify({'success': False, 'error': '关闭事件必须填写处置总结'}), 400

    # 记录状态变更
    create_action_record(
        event_id=event.event_code,
        action='status_changed',
        user_id=user_id,
        user_name=user_name,
        content=f'状态从 {old_status} 变更为 {new_status}' + (f'；{reason}' if reason else ''),
        previous_status=old_status,
        new_status=new_status
    )
    
    # 如果是关闭事件，额外记录
    if new_status == 'closed':
        create_action_record(
            event_id=event.event_code,
            action='closed',
            user_id=user_id,
            user_name=user_name,
            content=reason or '完成处置，关闭事件'
        )

    # 审计日志
    audit = AuditLog(
        user_id=user_id,
        username=user_name,
        action='更新事件状态',
        module='events',
        target=event.event_code,
        details={'status': new_status, 'old_status': old_status},
        ip=request.remote_addr
    )
    db.session.add(audit)

    db.session.commit()

    # 联动：事件状态变化 → 同步关联告警状态（closed/resolved/false_positive →
    # 告警同态关闭；重开 → 告警回到 investigating），避免已转事件告警被重复研判
    try:
        synced = event_alert_link.sync_alerts_on_event_status(
            event_alert_link.collect_event_alert_ids(event),
            new_status, event.event_code)
        if synced:
            create_action_record(
                event_id=event.event_code,
                action='alert_sync',
                user_id=user_id,
                user_name=user_name,
                content=f'事件状态变更为 {new_status}，已同步 {synced} 条关联告警状态'
            )
            db.session.commit()
    except Exception as e:
        logger.warning(f'事件 {event.event_code} 状态联动告警失败: {e}')

    return jsonify({
        'success': True,
        'data': event.to_dict()
    })


def build_event_execution_context(event) -> tuple:
    """构建剧本执行上下文（event_context, first_alert）。

    事件工作台「执行剧本」与 /playbooks-api/<id>/params 参数预解析共用，
    保证「弹窗预填判定」与「真实执行」看到完全相同的上下文。
    """
    extra = event.extra_data or {}
    related_alerts = extra.get('related_alerts', [])
    first_alert = related_alerts[0] if related_alerts else {}
    src_ip = (event.source or first_alert.get('src_ip') or '')
    event_context = {
        'id': event.id,
        'event_code': event.event_code,
        'eventCode': event.event_code,
        'title': event.title,
        'description': event.description,
        'severity': event.severity,
        'status': event.status,
        'eventType': event.category or '其他',
        'category': event.category or '其他',
        'src_ip': src_ip,
        'sourceIp': src_ip,
        'affectedAssets': [],
        'related_alerts': related_alerts,
        'relatedAlerts': related_alerts,
        'timestamp': event.timestamp.isoformat() if event.timestamp else None,
    }
    return event_context, first_alert


@events_api_bp.route('/events/<event_id>/playbooks/<playbook_id>/execute', methods=['POST'])
@login_required
def trigger_event_playbook(event_id, playbook_id):
    """执行事件关联的剧本（进程内执行，完整传递事件/告警上下文）。

    旧实现经 HTTP 自调且传参键名错位（event_context ≠ execute 端点的 event），
    导致引擎收到空上下文 —— 触发器/引用/通用动作全部拿不到数据。
    """
    from app.models import Event as DBEvent, Playbook
    from app.engine.playbook_engine import playbook_engine as engine
    from app.engine.node_params import validate_execution_request

    # 查询事件
    if event_id.isdigit():
        event = DBEvent.query.get(int(event_id))
    else:
        event = DBEvent.query.filter_by(event_code=event_id).first()
    if not event:
        return jsonify({'success': False, 'error': '事件不存在'}), 404

    playbook = Playbook.query.get(playbook_id)
    if not playbook:
        return jsonify({'success': False, 'error': '剧本不存在'}), 404
    if playbook.status not in ('published', 'active', 'enabled'):
        return jsonify({'success': False, 'error': '剧本未发布，无法执行'}), 400

    # 审批是剧本配置项（作者在画布设置），不由执行人勾选：
    # 配置了 approval_required 的剧本不允许在此直执，前端/调用方应走审批申请。
    if playbook.approval_required:
        return jsonify({
            'success': False,
            'need_approval': True,
            'error': f'剧本「{playbook.name}」已配置执行需审批，请提交审批申请，批准后自动执行',
        }), 403

    data = request.get_json(silent=True) or {}
    submitted = data.get('params') or {}

    # 构建事件上下文（event_code/eventCode、src_ip/sourceIp 双写兼容新旧表达式）
    event_context, first_alert = build_event_execution_context(event)

    # 声明式入参校验（服务端强制）：
    # - 只接受剧本触发器声明的入参 key，其余一律丢弃（节点配置不接受执行期覆盖）
    # - 提交留空的入参回退事件预填值（自动化路径兜底）
    # - 必填仍为空 / IP 格式错误 → 400，不带空参数执行
    params, guard_error = validate_execution_request(
        playbook, trigger_type='alert',
        event=event_context, alert=first_alert, params=submitted)
    if guard_error:
        return jsonify({
            'success': False,
            'error': guard_error['message'],
            'code': guard_error['code'],
            'data': {k: v for k, v in guard_error.items() if k != 'message'},
        }), 400

    user_id, user_name = _current_actor()
    result = engine.execute(
        playbook=playbook,
        trigger_type='alert',   # 前端触发类型「告警事件」
        event=event_context,
        alert=first_alert,
        params=params,
        executor=user_name,
        request_info={'user_id': user_id, 'username': user_name,
                      'ip': request.remote_addr},
    )
    success = result.get('status') == 'completed'

    # 创建处置记录
    create_action_record(
        event_id=event.event_code,
        action='playbook_triggered',
        user_id=user_id,
        user_name=user_name,
        content=f'执行剧本 #{playbook_id}',
        playbook_id=playbook_id,
        playbook_result=result
    )

    return jsonify({
        'success': success,
        'data': result,
        'event_context': event_context
    })


@events_api_bp.route('/events/<event_id>', methods=['DELETE'])
@login_required
def delete_event(event_id):
    """删除事件"""
    # 优先通过 event_code 查找
    event = Event.query.filter_by(event_code=event_id).first()
    
    # 如果没找到，且 event_id 是数字，尝试通过 Event.id 查找
    if not event and event_id.isdigit():
        event = Event.query.get(int(event_id))
    
    # 如果还是没找到，尝试通过数字ID查找（兼容前端传递数字ID的情况）
    if not event:
        try:
            event = Event.query.get(int(event_id))
        except (ValueError, TypeError):
            pass
    
    if not event:
        return jsonify({'success': False, 'error': '事件不存在'}), 404
    
    # 删除关联的处置记录
    EventAction.query.filter_by(event_id=event.event_code).delete()
    
    db.session.delete(event)
    db.session.commit()
    
    return jsonify({'success': True, 'message': '删除成功'})


# =====================
# 事件处置记录
# =====================

@events_api_bp.route('/events/<event_id>/actions', methods=['GET'])
@login_required
def list_event_actions(event_id):
    """获取事件的处置记录"""
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 50, type=int)
    
    # 支持通过数字ID或event_code查询
    # 如果 event_id 是纯数字，尝试先查事件再匹配
    try:
        # 尝试作为 event_code 直接查询
        query = EventAction.query.filter_by(event_id=event_id)
        if query.count() == 0 and event_id.isdigit():
            # 如果是数字ID，查找对应的 event_code
            event = Event.query.get(int(event_id))
            if event:
                query = EventAction.query.filter_by(event_id=event.event_code)
    except:
        query = EventAction.query.filter_by(event_id=event_id)
    
    query = query.order_by(EventAction.created_at.desc())
    pagination = query.paginate(page=page, per_page=page_size, error_out=False)
    
    return jsonify({
        'success': True,
        'data': {
            'items': [a.to_dict() for a in pagination.items],
            'total': pagination.total,
            'page': page,
            'page_size': page_size,
            'pages': pagination.pages
        }
    })


@events_api_bp.route('/events/<event_id>/actions', methods=['POST'])
@login_required
def create_event_action(event_id):
    """添加处置记录"""
    # 支持数字ID和event_code
    if event_id.isdigit():
        event = Event.query.get(int(event_id))
    else:
        event = Event.query.filter_by(event_code=event_id).first()
    if not event:
        return jsonify({'success': False, 'error': '事件不存在'}), 404
    
    data = request.get_json()
    action_type = data.get('action', 'comment')
    
    user_id, user_name = _current_actor()
    
    # 创建处置记录
    action_record = EventAction(
        event_id=event.event_code,
        action=action_type,
        content=data.get('content', ''),
        user_id=user_id,
        user_name=user_name,
        previous_status=data.get('previous_status'),
        new_status=data.get('new_status'),
        previous_severity=data.get('previous_severity'),
        new_severity=data.get('new_severity'),
        assignee=data.get('assignee'),
        attachments=data.get('attachments', []),
        playbook_id=data.get('playbook_id'),
        playbook_name=data.get('playbook_name'),
        playbook_execution_id=data.get('playbook_execution_id'),
        playbook_result=data.get('playbook_result', {}),
        extra_data=data.get('extra_data', {})
    )
    db.session.add(action_record)
    
    # 如果有附件，更新事件
    if data.get('attachments'):
        # attachments格式: [{name, url, size, type}]
        current_attachments = event.extra_data.get('attachments', []) if event.extra_data else []
        event.extra_data = event.extra_data or {}
        event.extra_data['attachments'] = current_attachments + data.get('attachments', [])
    
    # 审计日志
    audit = AuditLog(
        user_id=user_id,
        username=user_name,
        action=f'添加处置记录-{action_type}',
        module='events',
        target=event_id,
        details={'action': action_type, 'content': data.get('content', '')[:100]},
        ip=request.remote_addr
    )
    db.session.add(audit)
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': action_record.to_dict()
    }), 201


@events_api_bp.route('/events/<event_id>/actions/<int:action_id>', methods=['PUT'])
@login_required
def update_event_action(event_id, action_id):
    """更新处置记录"""
    action_record = EventAction.query.filter_by(id=action_id, event_id=event_id).first()
    if not action_record:
        return jsonify({'success': False, 'error': '处置记录不存在'}), 404
    
    data = request.get_json()
    user_id, user_name = _current_actor()
    
    if 'content' in data:
        action_record.content = data['content']
    if 'attachments' in data:
        action_record.attachments = data['attachments']
    if 'extra_data' in data:
        action_record.extra_data = {**action_record.extra_data, **data['extra_data']}
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': action_record.to_dict()
    })


@events_api_bp.route('/events/<event_id>/actions/<int:action_id>', methods=['DELETE'])
@login_required
def delete_event_action(event_id, action_id):
    """删除处置记录"""
    action_record = EventAction.query.filter_by(id=action_id, event_id=event_id).first()
    if not action_record:
        return jsonify({'success': False, 'error': '处置记录不存在'}), 404
    
    db.session.delete(action_record)
    db.session.commit()
    
    return jsonify({'success': True, 'message': '删除成功'})


# =====================
# 剧本执行
# =====================

@events_api_bp.route('/events/<event_id>/playbooks', methods=['GET'])
@login_required
def list_event_playbooks(event_id):
    """获取可用于该事件的剧本列表"""
    # 获取所有已发布或已启用的剧本
    playbooks = Playbook.query.filter(
        Playbook.status.in_(['published', 'enabled'])
    ).order_by(Playbook.name).all()
    
    return jsonify({
        'success': True,
        'data': [p.to_dict() for p in playbooks]
    })


# =====================
# 事件统计
# =====================

@events_api_bp.route('/events/stats', methods=['GET'])
@login_required
def get_event_stats():
    """获取事件统计"""
    today = datetime.utcnow().date()
    
    stats = {
        'total': Event.query.count(),
        'today_new': Event.query.filter(
            db.func.date(Event.created_at) == today
        ).count(),
        'by_severity': {
            'critical': Event.query.filter(Event.severity == 'critical').count(),
            'high': Event.query.filter(Event.severity == 'high').count(),
            'medium': Event.query.filter(Event.severity == 'medium').count(),
            'low': Event.query.filter(Event.severity == 'low').count()
        },
        'by_status': {
            'new': Event.query.filter(Event.status == 'new').count(),
            'investigating': Event.query.filter(Event.status == 'investigating').count(),
            'closed': Event.query.filter(Event.status == 'closed').count(),
            'false_positive': Event.query.filter(Event.status == 'false_positive').count()
        }
    }
    
    return jsonify({
        'success': True,
        'data': stats
    })


# =====================
# 批量操作
# =====================

@events_api_bp.route('/events/batch/status', methods=['PUT'])
@login_required
def batch_update_status():
    """批量更新事件状态"""
    data = request.get_json()
    event_ids = data.get('event_ids', [])
    new_status = data.get('status')
    
    if not event_ids or not new_status:
        return jsonify({'success': False, 'error': '缺少必要参数'}), 400

    if new_status not in VALID_EVENT_STATUSES:
        return jsonify({'success': False, 'error': '无效的状态'}), 400

    if new_status == 'closed' and not (data.get('reason') or '').strip():
        return jsonify({'success': False, 'error': '批量关闭必须填写处置总结'}), 400

    reason = (data.get('reason') or '').strip()
    user_id, user_name = _current_actor()
    
    updated, skipped = 0, []
    for event_code in event_ids:
        event = Event.query.filter_by(event_code=event_code).first()
        if not event:
            skipped.append({'event_code': event_code, 'reason': '事件不存在'})
            continue
        err = validate_transition(event.status, new_status)
        if err:
            skipped.append({'event_code': event.event_code, 'reason': err})
            continue
        old_status = event.status
        event.status = new_status
        event.updated_at = datetime.utcnow()
        
        # 记录变更
        create_action_record(
            event_id=event.event_code,
            action='status_changed',
            user_id=user_id,
            user_name=user_name,
            content=f'批量操作：状态从 {old_status} 变更为 {new_status}' + (f'；{reason}' if reason else ''),
            previous_status=old_status,
            new_status=new_status
        )
        
        if new_status == 'closed':
            create_action_record(
                event_id=event.event_code,
                action='closed',
                user_id=user_id,
                user_name=user_name,
                content=reason or '批量关闭事件'
            )
        updated += 1
        # 联动：同步该事件关联的告警状态（防误关逻辑见 event_alert_link）
        try:
            synced = event_alert_link.sync_alerts_on_event_status(
                event_alert_link.collect_event_alert_ids(event),
                new_status, event.event_code)
            if synced:
                create_action_record(
                    event_id=event.event_code,
                    action='alert_sync',
                    user_id=user_id,
                    user_name=user_name,
                    content=f'批量操作：事件状态变更为 {new_status}，'
                            f'已同步 {synced} 条关联告警状态'
                )
        except Exception as e:
            logger.warning(f'事件 {event.event_code} 批量状态联动告警失败: {e}')

    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': {'updated_count': updated, 'skipped': skipped}
    })


@events_api_bp.route('/events/batch', methods=['DELETE'])
@login_required
def batch_delete():
    """批量删除事件"""
    data = request.get_json()
    event_ids = data.get('event_ids', [])
    
    if not event_ids:
        return jsonify({'success': False, 'error': '缺少事件ID列表'}), 400
    
    deleted = 0
    for event_code in event_ids:
        event = Event.query.filter_by(event_code=event_code).first()
        if event:
            EventAction.query.filter_by(event_id=event_code).delete()
            db.session.delete(event)
            deleted += 1
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': {'deleted_count': deleted}
    })

@events_api_bp.route('/approvals/trigger-event-action', methods=['POST'])
@login_required
def trigger_event_action_after_approval():
    """审批通过后触发事件action记录"""
    from app.models import PlaybookApproval, Event, EventAction
    
    data = request.get_json()
    event_id = data.get('event_id')
    approval_id = data.get('approval_id')
    
    if not event_id or not approval_id:
        return jsonify({'success': False, 'error': '缺少必要参数'}), 400
    
    # 获取审批记录
    approval = PlaybookApproval.query.get(approval_id)
    if not approval:
        return jsonify({'success': False, 'error': '审批记录不存在'}), 404
    
    if approval.status != 'approved':
        return jsonify({'success': False, 'error': '审批未通过'}), 400
    
    # 获取事件
    event = Event.query.filter_by(event_code=event_id).first()
    if not event and event_id.isdigit():
        event = Event.query.get(int(event_id))
    
    if not event:
        return jsonify({'success': False, 'error': '事件不存在'}), 404
    
    # 映射action_type到EventActionType
    action_type_map = {
        'block_ip': 'playbook_triggered',
        'isolate_host': 'playbook_triggered',
        'reset_password': 'playbook_triggered',
        'modify_firewall': 'playbook_triggered',
        'delete_host': 'playbook_triggered'
    }
    
    action_type = action_type_map.get(approval.approval_type, 'playbook_triggered')
    
    # 创建处置记录
    action_label = approval.approval_type.replace('_', ' ').title()
    
    action_record = EventAction(
        event_id=event.event_code,
        action=action_type,
        user_id=(_current_actor()[0] if _current_actor()[0] is not None else 1),
        user_name=_current_actor()[1],
        content=f'审批通过：{action_label} 操作 (审批ID: {approval_id})',
        extra_data={
            'approval_id': approval_id,
            'approval_type': approval.approval_type,
            'params': approval.params,
            'approvers': approval.approver_name
        }
    )
    
    db.session.add(action_record)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': {
            'event_id': event_id,
            'action_id': action_record.id,
            'action_type': action_type
        }
    })
