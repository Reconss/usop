"""
事件管理 API 路由 (新版)
包含事件CRUD和处置记录功能
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import Event, Alert, EventAction, Playbook, AuditLog
from datetime import datetime
from sqlalchemy import func, desc

events_api_bp = Blueprint('events_api', __name__)


def generate_event_code():
    """生成事件ID，格式为：EVT-年月日-三位序号"""
    today = datetime.utcnow().strftime('%Y%m%d')
    
    # 查找今天已存在的最大序号
    max_code = db.session.query(func.max(Event.event_code)).filter(
        Event.event_code.like(f'EVT-{today}%')
    ).scalar()
    
    if max_code:
        try:
            # 提取序号部分并加1 (格式: EVT-20250115-001)
            parts = max_code.split('-')
            if len(parts) >= 3:
                last_seq = int(parts[-1])
                new_seq = last_seq + 1
            else:
                new_seq = 1
        except (ValueError, IndexError):
            new_seq = 1
    else:
        new_seq = 1
    
    return f"EVT-{today}-{new_seq:03d}"


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


@events_api_bp.route('/events', methods=['POST'])
@login_required
def create_event():
    """创建事件，可关联告警"""
    data = request.get_json()
    
    # 自动生成事件ID
    event_code = generate_event_code()
    
    # 获取当前用户信息
    user_id = getattr(request, 'user_id', None)
    user_name = getattr(request, 'username', 'system')
    
    # 获取关联的告警信息
    alert_ids = data.get('alert_ids', [])
    alert_info = data.get('alerts', [])
    
    # 如果有告警ID但没有告警详情，尝试查询
    if alert_ids and not alert_info:
        alerts = Alert.query.filter(Alert.id.in_(alert_ids)).all()
        alert_info = [{'id': a.id, 'alert_code': a.alert_code, 'title': a.title, 'severity': a.severity} for a in alerts]
    
    # 构建事件扩展数据
    extra_data = {'event_type': data.get('category', data.get('event_type', '其他'))}
    if alert_info:
        extra_data['related_alerts'] = alert_info
        extra_data['alert_count'] = len(alert_info)
    
    # 创建事件
    event = Event(
        event_code=event_code,
        title=data.get('title', '新建事件'),
        description=data.get('description', ''),
        severity=data.get('severity', 'medium'),
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
        extra_data={'event_type': event.category, 'severity': event.severity, 'alert_count': len(alert_info)}
    )
    
    # 如果有告警，更新告警状态为 investigating
    if alert_ids:
        Alert.query.filter(Alert.id.in_(alert_ids)).update({
            'status': 'investigating',
            'updated_at': datetime.utcnow()
        }, synchronize_session=False)
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
        details={'title': event.title, 'severity': event.severity, 'alert_count': len(alert_info)},
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
    user_id = getattr(request, 'user_id', None)
    user_name = getattr(request, 'username', 'system')
    
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
    valid_statuses = ['new', 'investigating', 'closed', 'false_positive', 'active', 'resolved']
    
    if new_status not in valid_statuses:
        return jsonify({'success': False, 'error': '无效的状态'}), 400
    
    old_status = event.status
    user_id = getattr(request, 'user_id', None)
    user_name = getattr(request, 'username', 'system')
    
    event.status = new_status
    
    # 记录状态变更
    create_action_record(
        event_id=event.event_code,
        action='status_changed',
        user_id=user_id,
        user_name=user_name,
        content=f'状态从 {old_status} 变更为 {new_status}',
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
            content=data.get('reason', '完成处置，关闭事件')
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
    
    return jsonify({
        'success': True,
        'data': event.to_dict()
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
    
    user_id = getattr(request, 'user_id', None)
    user_name = getattr(request, 'username', 'system')
    
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
    user_id = getattr(request, 'user_id', None)
    user_name = getattr(request, 'username', 'system')
    
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


@events_api_bp.route('/events/<event_id>/playbooks/<int:playbook_id>/execute', methods=['POST'])
@login_required
def execute_event_playbook(event_id, playbook_id):
    """在事件上执行剧本 - 使用真实执行引擎"""
    # 支持数字ID或event_code查询事件
    event = Event.query.filter_by(event_code=event_id).first()
    if not event and event_id.isdigit():
        event = Event.query.get(int(event_id))

    if not event:
        return jsonify({'success': False, 'error': '事件不存在'}), 404

    playbook = Playbook.query.get(playbook_id)
    if not playbook:
        return jsonify({'success': False, 'error': '剧本不存在'}), 404

    if playbook.status not in ('published', 'enabled'):
        return jsonify({'success': False, 'error': '剧本未发布，无法执行'}), 400

    data = request.get_json() or {}
    user_id = getattr(request, 'user_id', None)
    user_name = getattr(request, 'username', 'system')

    # 使用真实执行引擎
    from app.engine.playbook_engine import playbook_engine

    result = playbook_engine.execute(
        playbook=playbook,
        trigger_type='event',
        event=event.to_dict(),
        alert=data.get('alert', {}),
        params=data.get('params', {}),
        executor=user_name,
        request_info={
            'user_id': user_id,
            'username': user_name,
            'ip': request.remote_addr
        }
    )

    return jsonify({
        'success': True,
        'data': result
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
    
    user_id = getattr(request, 'user_id', None)
    user_name = getattr(request, 'username', 'system')
    
    for event_code in event_ids:
        event = Event.query.filter_by(event_code=event_code).first()
        if event:
            old_status = event.status
            event.status = new_status
            
            # 记录变更
            create_action_record(
                event_id=event.event_code,
                action='status_changed',
                user_id=user_id,
                user_name=user_name,
                content=f'批量操作：状态从 {old_status} 变更为 {new_status}',
                previous_status=old_status,
                new_status=new_status
            )
            
            if new_status == 'closed':
                create_action_record(
                    event_id=event.event_code,
                    action='closed',
                    user_id=user_id,
                    user_name=user_name,
                    content='批量关闭事件'
                )
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': {'updated_count': len(event_ids)}
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
