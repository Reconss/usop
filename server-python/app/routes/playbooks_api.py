"""
剧本管理 API 路由 (新版)
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import Playbook
from datetime import datetime

playbooks_api_bp = Blueprint('playbooks_api', __name__)


def _outputs_to_edges(nodes: list) -> list:
    """把前端画布的 nodes[].outputs[] 转换为引擎所需的 edges[].

    node: {id, outputs: ['n2','n3']}  →  edge: {id:'e_{n1}_{n2}', source:'n1', target:'n2'}
    """
    if not isinstance(nodes, list):
        return []
    edges = []
    for n in nodes:
        if not isinstance(n, dict):
            continue
        src = n.get('id')
        if not src:
            continue
        for tgt in (n.get('outputs') or []):
            if tgt:
                edges.append({'id': f'e_{src}_{tgt}', 'source': src, 'target': tgt})
    return edges


def _edges_to_outputs(nodes: list, edges: list) -> list:
    """把 edges[] 回填为前端画布的 nodes[].outputs[]（引擎→画布方向）。"""
    if not isinstance(nodes, list):
        return []
    for n in nodes:
        if isinstance(n, dict) and n.get('id'):
            n['outputs'] = []
    idx = {n.get('id'): n for n in nodes if isinstance(n, dict)}
    for e in (edges or []):
        if not isinstance(e, dict):
            continue
        src, tgt = e.get('source'), e.get('target')
        if src in idx and tgt and tgt not in idx[src].get('outputs', []):
            idx[src]['outputs'].append(tgt)
    return nodes


@playbooks_api_bp.route('/playbooks', methods=['GET'])
@login_required
def list_playbooks():
    """获取剧本列表"""
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 10, type=int)
    status = request.args.get('status')
    search = request.args.get('search', '')

    query = Playbook.query
    if status:
        query = query.filter(Playbook.status == status)
    if search:
        query = query.filter(
            db.or_(
                Playbook.name.ilike(f'%{search}%'),
                Playbook.description.ilike(f'%{search}%')
            )
        )

    total = query.count()
    playbooks = query.order_by(Playbook.updated_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return jsonify({
        'success': True,
        'data': {
            'items': [p.to_dict(include_graph=False) for p in playbooks],
            'total': total,
            'page': page,
            'limit': limit
        }
    })


@playbooks_api_bp.route('/playbooks/<int:playbook_id>', methods=['GET'])
@login_required
def get_playbook(playbook_id):
    """获取剧本详情"""
    playbook = Playbook.query.get(playbook_id)
    if not playbook:
        return jsonify({'success': False, 'error': '剧本不存在'}), 404

    data = playbook.to_dict()
    # 画布侧以 outputs 表达连线，下发时由权威 edges 回填，前端无需自己建图
    data['nodes'] = _edges_to_outputs(data.get('nodes') or [], data.get('edges') or [])

    return jsonify({
        'success': True,
        'data': data
    })


def _infer_missing_action_names(nodes: list) -> None:
    """兜底：action 节点丢失动作名时按参数特征推断（历史数据/前端异常清空过 action）。

    以 ACTION_PARAM_SCHEMAS 的参数键重叠数打分，≥2 键命中才回填；推断不出保持原样，
    由引擎在执行时报明确的「未找到动作」错误。
    """
    if not isinstance(nodes, list):
        return
    try:
        from app.engine.actions import ACTION_PARAM_SCHEMAS
    except Exception:
        return
    for n in nodes:
        if not isinstance(n, dict) or n.get('typeId') != 'action':
            continue
        cfg = n.get('config')
        if not isinstance(cfg, dict) or cfg.get('action'):
            continue
        best_name, best_score = None, 0
        for name, schema in ACTION_PARAM_SCHEMAS.items():
            schema_keys = {p.get('name') for p in (schema or []) if isinstance(p, dict)}
            score = len(schema_keys & set(cfg.keys()))
            if score > best_score:
                best_name, best_score = name, score
        if best_name and best_score >= 2:
            cfg['action'] = best_name


@playbooks_api_bp.route('/playbooks', methods=['POST'])
@login_required
def create_playbook():
    """创建剧本"""
    data = request.get_json()
    nodes = data.get('nodes', [])
    _infer_missing_action_names(nodes)
    playbook = Playbook(
        name=data.get('name'),
        description=data.get('description'),
        # 前端画布用 nodes[].outputs[]；若前端直接给 edges 也一并接受
        nodes=nodes,
        edges=data.get('edges') or _outputs_to_edges(nodes),
        trigger_type=data.get('trigger_type') or data.get('triggerType') or '告警事件',
        status=data.get('status', 'draft'),
        version=data.get('version', '1.0'),
        category=data.get('category', '其他'),
        enabled=data.get('enabled', data.get('is_active', True)),
        approval_required=bool(data.get('approval_required', False)),
    )
    db.session.add(playbook)
    db.session.commit()

    return jsonify({
        'success': True,
        'data': playbook.to_dict()
    }), 201


@playbooks_api_bp.route('/playbooks/<int:playbook_id>', methods=['PUT'])
@login_required
def update_playbook(playbook_id):
    """更新剧本"""
    playbook = Playbook.query.get(playbook_id)
    if not playbook:
        return jsonify({'success': False, 'error': '剧本不存在'}), 404

    data = request.get_json()
    # 前端画布以 nodes[].outputs[] 表达连线，落库前统一转换为 edges
    if 'nodes' in data and 'edges' not in data:
        data['edges'] = _outputs_to_edges(data['nodes'])
    _infer_missing_action_names(data.get('nodes') or [])
    if 'triggerType' in data and 'trigger_type' not in data:
        data['trigger_type'] = data['triggerType']

    for key in ['name', 'description', 'nodes', 'edges', 'trigger_type',
                'status', 'version', 'category', 'enabled', 'approval_required']:
        if key in data:
            setattr(playbook, key, data[key])

    db.session.commit()

    return jsonify({
        'success': True,
        'data': playbook.to_dict()
    })


@playbooks_api_bp.route('/playbooks/<int:playbook_id>/status', methods=['PATCH'])
@login_required
def update_playbook_status(playbook_id):
    """更新剧本状态"""
    playbook = Playbook.query.get(playbook_id)
    if not playbook:
        return jsonify({'success': False, 'error': '剧本不存在'}), 404

    data = request.get_json()
    status = data.get('status')
    if status not in ['draft', 'published', 'archived']:
        return jsonify({'success': False, 'error': '无效的状态'}), 400

    playbook.status = status
    db.session.commit()

    return jsonify({
        'success': True,
        'data': playbook.to_dict()
    })


@playbooks_api_bp.route('/playbooks/<int:playbook_id>', methods=['DELETE'])
@login_required
def delete_playbook(playbook_id):
    """删除剧本。

    playbooks 被两张表外键引用，直接删会 IntegrityError（前端表现为"删除失败"）：
    - playbook_executions（执行记录）：随剧本一并删除
    - event_actions（事件处置记录）：置 playbook_id=NULL 解除关联，保留处置审计
    """
    playbook = Playbook.query.get(playbook_id)
    if not playbook:
        return jsonify({'success': False, 'error': '剧本不存在'}), 404

    from app.models import EventAction, PlaybookExecution
    exec_n = PlaybookExecution.query.filter_by(playbook_id=playbook_id).delete()
    act_n = EventAction.query.filter_by(playbook_id=playbook_id).update(
        {'playbook_id': None}, synchronize_session=False)
    name = playbook.name
    db.session.delete(playbook)
    db.session.commit()

    msg = '删除成功'
    if exec_n or act_n:
        msg += f'（同时清理 {exec_n} 条执行记录；{act_n} 条事件处置记录已解除关联并保留审计）'
    return jsonify({'success': True, 'message': msg, 'data': {'name': name}})


@playbooks_api_bp.route('/playbooks/<int:playbook_id>/approve-request', methods=['POST'])
@login_required
def request_playbook_approval(playbook_id):
    """提交剧本人工审批申请（事件工作台「需要审批后执行」）。

    落 PlaybookApproval(pending) + 站内信通知；审批通过前剧本不执行。
    """
    playbook = Playbook.query.get(playbook_id)
    if not playbook:
        return jsonify({'success': False, 'error': '剧本不存在'}), 404

    if playbook.status not in ('published', 'active', 'enabled'):
        return jsonify({'success': False, 'error': '剧本未发布，无法提交执行审批'}), 400

    from app.models import PlaybookApproval, Notification
    payload = request.get_json(silent=True) or {}
    current = getattr(request, 'current_user', None) or {}

    # 审批申请同样过前置校验：避免「批了却因为缺入参执行失败」
    from app.models import Event
    from app.routes.events_api import build_event_execution_context
    from app.engine.node_params import validate_execution_request
    event_context, first_alert = {}, {}
    if payload.get('event_id'):
        ev_obj = (Event.query.get(int(payload['event_id']))
                  if str(payload['event_id']).isdigit()
                  else Event.query.filter_by(event_code=payload['event_id']).first())
        if ev_obj:
            event_context, first_alert = build_event_execution_context(ev_obj)
    _, guard_error = validate_execution_request(
        playbook, trigger_type='alert' if event_context else 'manual',
        event=event_context, alert=first_alert, params=payload.get('params') or {})
    if guard_error:
        return jsonify({
            'success': False,
            'error': guard_error['message'],
            'code': guard_error['code'],
            'data': {k: v for k, v in guard_error.items() if k != 'message'},
        }), 400

    approval = PlaybookApproval(
        playbook_id=playbook_id,
        approval_type=payload.get('approval_type', 'playbook_execute'),
        approval_level=int(payload.get('approval_level') or 2),
        status='pending',
        requester_id=current.get('user_id') or 1,
        requester_name=current.get('username') or '当前用户',
        params=payload.get('params') or {},
        reason=(payload.get('reason') or '')[:500],
        related_event_id=str(payload.get('event_id') or ''),
    )
    db.session.add(approval)
    db.session.flush()

    # 审批通知发给审批人（admin / operator 角色，对齐 SYSTEM_ROLES 审批语义），排除申请人自己；
    # 找不到审批人时兜底发申请人，避免申请石沉大海
    from app.models import User
    approver_q = User.query.filter(User.role.in_(('admin', 'operator')))
    if approval.requester_id:
        approver_q = approver_q.filter(User.id != approval.requester_id)
    approvers = approver_q.all()
    if not approvers:
        approvers = [User.query.get(approval.requester_id)] if approval.requester_id else []

    ev = f"（事件 {approval.related_event_id}）" if approval.related_event_id else ''
    for ap_user in approvers:
        db.session.add(Notification(
            user_id=ap_user.id,
            title=f'剧本执行审批申请：{playbook.name}',
            message=(f'{approval.requester_name} 申请执行剧本「{playbook.name}」{ev}，'
                     f'原因：{approval.reason or "未填写"}。审批通过后剧本将自动执行。'),
            type='warning',
            data={'kind': 'playbook_approval', 'approval_id': approval.id,
                  'playbook_id': playbook_id, 'event_id': approval.related_event_id},
        ))
    db.session.commit()

    return jsonify({'success': True,
                    'message': f'已提交「{playbook.name}」执行审批申请，审批通过前剧本不会执行',
                    'data': {'approval_id': approval.id, 'status': 'pending'}})


@playbooks_api_bp.route('/playbooks/actions/list', methods=['GET'])
@login_required
def list_available_actions():
    """列出可用动作类型"""
    from app.engine.actions import list_actions
    return jsonify({
        'success': True,
        'data': list_actions()
    })


@playbooks_api_bp.route('/playbooks/blocked-ips', methods=['GET'])
@login_required
def list_blocked_ips():
    """列出已封堵的 IP"""
    from app.engine.actions import IPBlockManager
    return jsonify({
        'success': True,
        'data': IPBlockManager.list_blocks()
    })


@playbooks_api_bp.route('/playbooks/blocked-ips/<ip>', methods=['DELETE'])
@login_required
def unblock_ip(ip):
    """解封 IP"""
    from app.engine.actions import IPBlockManager
    result = IPBlockManager.unblock_ip(ip, '手动解封')
    return jsonify({
        'success': result.success,
        'message': result.message,
        'data': result.data
    })


def _summarize_execution_actions(node_results: list) -> list:
    """从节点结果里提取关键处置动作（封禁了哪些 IP、隔离了哪些主机、发了什么通知等）。

    返回 [{kind, label, targets: [...], success, message}]，供执行记录列表直接展示。
    """
    ACTION_KINDS = {
        'block_ip': ('封禁IP', 'danger'),
        'unblock_ip': ('解封IP', 'success'),
        'quarantine_host': ('隔离主机', 'warning'),
        'create_ticket': ('创建工单', 'primary'),
        'notify': ('发送通知', 'primary'),
        'notification': ('发送通知', 'primary'),
        'send_notification': ('发送通知', 'primary'),
        'http_request': ('API调用', 'muted'),
    }
    summary = []
    for nr in node_results or []:
        data = nr.get('data') or {}
        action = data.get('action') or nr.get('type') or ''
        kind = ACTION_KINDS.get(action)
        if not kind:
            continue
        targets = []
        if action in ('block_ip', 'unblock_ip'):
            ip = data.get('ip') or data.get('blocked_ip')
            if ip:
                targets.append(str(ip))
            duration = data.get('duration')
            if duration:
                targets.append(f'时长 {duration}')
        elif action == 'quarantine_host':
            host = data.get('hostname') or data.get('target') or data.get('ip')
            if host:
                targets.append(str(host))
        elif action == 'create_ticket':
            tid = data.get('ticket_id') or data.get('ticket_code') or data.get('id')
            if tid:
                targets.append(f'#{tid}')
        elif action in ('notify', 'send_notification'):
            ch = data.get('channel') or data.get('channel_type')
            if ch:
                targets.append(str(ch))
        elif action == 'http_request':
            url = data.get('url')
            if url:
                targets.append(str(url)[:60])
        summary.append({
            'kind': kind[0], 'tone': kind[1],
            'node_label': nr.get('node_label'),
            'targets': targets,
            'success': nr.get('success', False),
            'message': nr.get('message', ''),
        })
    return summary


@playbooks_api_bp.route('/playbooks/executions', methods=['GET'])
@login_required
def list_executions():
    """获取剧本执行历史（支持筛选 + 关键处置动作摘要）。

    查询参数：page / page_size / playbook_id / status / trigger_type / keyword
    （keyword 模糊匹配执行人、触发事件编号、剧本名、处置目标 IP/主机）
    """
    from app.models import PlaybookExecution
    page = request.args.get('page', 1, type=int)
    page_size = min(request.args.get('page_size', 20, type=int), 100)
    playbook_id = request.args.get('playbook_id', type=int)
    status = request.args.get('status', '').strip()
    trigger_type = request.args.get('trigger_type', '').strip()
    keyword = request.args.get('keyword', '').strip()

    query = PlaybookExecution.query.order_by(PlaybookExecution.started_at.desc())
    if playbook_id:
        query = query.filter(PlaybookExecution.playbook_id == playbook_id)
    if status:
        query = query.filter(PlaybookExecution.status == status)
    if trigger_type:
        query = query.filter(PlaybookExecution.trigger_type == trigger_type)
    if keyword:
        like = f'%{keyword}%'
        query = query.filter(db.or_(
            PlaybookExecution.executor.ilike(like),
            PlaybookExecution.trigger_data.cast(db.Text).ilike(like),
            PlaybookExecution.playbook.has(Playbook.name.ilike(like)),
        ))
    pagination = query.paginate(page=page, per_page=page_size, error_out=False)

    # 统计（全局，不受筛选影响，供页面顶部卡片）
    total_all = PlaybookExecution.query.count()
    stats = {'total': total_all}
    for s in ('completed', 'failed', 'running'):
        stats[s] = PlaybookExecution.query.filter(PlaybookExecution.status == s).count()

    items = []
    for e in pagination.items:
        d = e.to_dict()
        td = e.trigger_data or {}
        ev = td.get('event') or {}
        d['event_code'] = ev.get('event_code') or ev.get('eventCode') or td.get('event_id') or ''
        d['event_title'] = ev.get('title') or ''
        d['params'] = td.get('params') or {}
        node_results = (e.result_summary or {}).get('node_results', [])
        d['actions_summary'] = _summarize_execution_actions(node_results)
        # 展示名：审批通过执行的记录 executor 带审批人信息
        d['executor'] = e.executor or 'system'
        items.append(d)

    return jsonify({
        'success': True,
        'data': {
            'items': items,
            'stats': stats,
            'total': pagination.total,
            'page': page,
            'page_size': page_size,
            'pages': pagination.pages
        }
    })


@playbooks_api_bp.route('/playbooks/executions/<execution_id>', methods=['GET'])
@login_required
def get_execution(execution_id):
    """获取剧本执行详情 (包含节点级详细结果)"""
    from app.models import PlaybookExecution, Playbook
    execution = PlaybookExecution.query.get(execution_id)
    if not execution:
        return jsonify({'success': False, 'error': '执行记录不存在'}), 404

    data = execution.to_dict()
    
    # 获取剧本信息
    playbook = Playbook.query.get(execution.playbook_id)
    if playbook:
        data['playbook'] = {
            'id': playbook.id,
            'name': playbook.name,
            'description': playbook.description,
            'nodes_count': len(playbook.nodes or []),
            'nodes': playbook.nodes,
            'edges': playbook.edges
        }
    
    # 解析节点执行结果
    result_summary = execution.result_summary or {}
    node_results = result_summary.get('node_results', [])
    
    # 为每个节点添加详细信息
    enriched_nodes = []
    for node_result in node_results:
        node_info = {
            'node_id': node_result.get('node_id'),
            'node_label': node_result.get('node_label'),
            'type': node_result.get('type'),
            'success': node_result.get('success'),
            'message': node_result.get('message'),
            'data': node_result.get('data', {}),
            'timestamp': node_result.get('timestamp')
        }
        enriched_nodes.append(node_info)
    
    data['node_results'] = enriched_nodes
    data['summary'] = {
        'total_nodes': result_summary.get('total_nodes', 0),
        'successful': result_summary.get('successful', 0),
        'failed': result_summary.get('failed', 0),
        'duration': execution.duration,
        'started_at': execution.started_at.isoformat() if execution.started_at else None,
        'completed_at': execution.completed_at.isoformat() if execution.completed_at else None
    }
    
    return jsonify({
        'success': True,
        'data': data
    })


# ========== 审批相关 API ==========

@playbooks_api_bp.route('/playbooks/approvals', methods=['GET'])
@login_required
def list_playbook_approvals():
    """获取剧本审批列表"""
    from app.models import PlaybookApproval
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 10, type=int)
    status = request.args.get('status')
    
    query = PlaybookApproval.query
    if status:
        query = query.filter(PlaybookApproval.status == status)
    
    total = query.count()
    approvals = query.order_by(PlaybookApproval.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return jsonify({
        'success': True,
        'data': {
            'items': [a.to_dict() for a in approvals],
            'total': total,
            'page': page,
            'limit': limit
        }
    })

@playbooks_api_bp.route('/playbooks/approvals/<approval_id>', methods=['POST'])
@login_required
def process_playbook_approval(approval_id):
    """处理审批"""
    from app.engine.playbook_engine import process_approval_result
    
    data = request.get_json()
    approved = data.get('approved', False)
    
    user_id = getattr(request, 'user_id', 1)
    user_name = getattr(request, 'username', 'admin')
    
    result = process_approval_result(approval_id, approved, user_id, user_name)
    
    return jsonify({
        'success': True,
        'data': result
    })


# ========== 手动触发 API (工作台事件详情) ==========

@playbooks_api_bp.route('/playbooks/<int:playbook_id>/execute', methods=['POST'])
@login_required
def execute_playbook_with_approval(playbook_id):
    """执行剧本（带审批检查）"""
    from app.engine.playbook_engine import check_and_create_approval, playbook_engine as engine
    
    playbook = Playbook.query.get(playbook_id)
    if not playbook:
        return jsonify({'success': False, 'error': '剧本不存在'}), 404

    # 历史数据里存在 active/enabled 等写法，统一按「已发布」放行
    if playbook.status not in ('published', 'active', 'enabled'):
        return jsonify({'success': False, 'error': '剧本未发布，无法执行'}), 400

    data = request.get_json() or {}
    trigger_type = data.get('trigger_type', 'manual')
    event_info = data.get('event', {})
    alert_info = data.get('alert', {})
    params = data.get('params', {})

    user_id = getattr(request, 'user_id', None)
    user_name = getattr(request, 'username', 'system')

    # 如果提供了 event_id, 加载事件详情
    if data.get('event_id') and not event_info:
        from app.models import Event
        event = Event.query.filter_by(event_code=data['event_id']).first()
        if not event and data['event_id'].isdigit():
            event = Event.query.get(int(data['event_id']))
        if event:
            event_info = event.to_dict()

    # ── 执行前置校验（服务端强制）──────────────────────────────
    # 1) 事件触发剧本没有事件/告警上下文 → 拒绝（手动执行无数据可传）
    # 2) 声明的必填入参缺失 / IP 格式错误 → 拒绝
    from app.engine.node_params import validate_execution_request
    params, guard_error = validate_execution_request(
        playbook, trigger_type=trigger_type,
        event=event_info, alert=alert_info, params=params)
    if guard_error:
        return jsonify({
            'success': False,
            'error': guard_error['message'],
            'code': guard_error['code'],
            'data': {k: v for k, v in guard_error.items() if k != 'message'},
        }), 400

    # 创建执行记录
    execution_id = f"exec_{playbook.id}_{int(datetime.utcnow().timestamp())}"
    
    # 检查是否需要审批 (如果剧本配置了 require_approval 或包含危险操作)
    from app.engine.playbook_engine import APPROVAL_RULES
    approval_needed = None
    
    # 检查节点是否包含需要审批的操作
    # 自动触发场景(skip_approval=True)跳过审批
    skip_approval = data.get('skip_approval', False)
    approval_needed = None
    
    if not skip_approval:
        for node in (playbook.nodes or []):
            action_type = node.get('data', {}).get('action', '')
            if action_type in APPROVAL_RULES:
                approval_needed = check_and_create_approval(
                    playbook_id, action_type, params,
                    user_id, user_name, execution_id,
                    skip_approval=False
                )
                if approval_needed:
                    break
    
    # 如果需要审批，创建待审批记录并返回
    if approval_needed and not skip_approval:
        return jsonify({
            'success': True,
            'data': {
                'status': 'pending_approval',
                'approval': approval_needed,
                'execution_id': execution_id
            }
        })
    
    # 不需要审批，直接执行
    result = engine.execute(
        playbook=playbook,
        trigger_type=trigger_type,
        event=event_info,
        alert=alert_info,
        params=params,
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


# ========== 自动触发回调 API ==========

@playbooks_api_bp.route('/playbooks/trigger', methods=['POST'])
@login_required
def trigger_playbook_auto():
    """自动触发剧本 (由规则引擎调用)"""
    from app.engine.playbook_engine import playbook_engine as engine
    
    data = request.get_json()
    playbook_id = data.get('playbook_id')
    event_data = data.get('event', {})
    alert_data = data.get('alert', {})
    trigger_source = data.get('trigger_source', 'rule')  # rule, schedule, webhook
    
    playbook = Playbook.query.get(playbook_id)
    if not playbook:
        return jsonify({'success': False, 'error': '剧本不存在'}), 404
    
    # 历史数据里存在 active/enabled 等写法，统一按「已发布」放行
    if playbook.status not in ('published', 'active', 'enabled'):
        return jsonify({'success': False, 'error': '剧本未发布，无法执行'}), 400

    # 自动触发同样过前置校验：事件触发剧本拿到空上下文时不要静默空跑
    from app.engine.node_params import validate_execution_request
    params, guard_error = validate_execution_request(
        playbook, trigger_type=trigger_source,
        event=event_data, alert=alert_data, params=data.get('params', {}))
    if guard_error:
        return jsonify({
            'success': False,
            'error': guard_error['message'],
            'code': guard_error['code'],
            'data': {k: v for k, v in guard_error.items() if k != 'message'},
        }), 400

    result = engine.execute(
        playbook=playbook,
        trigger_type=trigger_source,
        event=event_data,
        alert=alert_data,
        params=params or {},
        executor='system',
        request_info={'user_id': 0, 'username': 'system', 'ip': '0.0.0.0'}
    )
    
    return jsonify({
        'success': True,
        'data': result
    })


# ============================================
# 剧本执行参数 Schema：事件工作台「执行剧本」弹窗按剧本真实节点动态生成参数表单
# ============================================

@playbooks_api_bp.route('/playbooks/<int:playbook_id>/params', methods=['GET'])
@login_required
def get_playbook_execution_params(playbook_id):
    """剧本运行时入参清单（声明式）。

    返回触发器节点 config.inputs 声明的入参定义，?event_id=<eventCode|数字id>
    时用真实事件上下文为每个入参计算 prefill（如 src_ip ← 事件源 IP）。
    mode='none' 表示剧本未声明入参，执行时无需收集任何参数。
    """
    from app.engine.node_params import build_playbook_param_schema
    playbook = Playbook.query.get(playbook_id)
    if not playbook:
        return jsonify({'success': False, 'error': '剧本不存在'}), 404

    event_context, first_alert = {}, {}
    event_id = request.args.get('event_id')
    if event_id:
        from app.models import Event as DBEvent
        from app.routes.events_api import build_event_execution_context
        ev = (DBEvent.query.get(int(event_id)) if str(event_id).isdigit()
              else DBEvent.query.filter_by(event_code=event_id).first())
        if ev:
            event_context, first_alert = build_event_execution_context(ev)

    schema = build_playbook_param_schema(playbook, event_context, first_alert)
    return jsonify({'success': True, 'data': schema})


# ============================================
# 数据查询节点：可查询数据源枚举（动态，来自存储表注册表 + 内部业务表）
# ============================================

# 内部业务表（平台自有 ORM 模型，非存储表注册表管理）
_INTERNAL_SOURCES = [
    {'value': '告警表', 'label': '告警表（alerts-valid · Elasticsearch）',
     'db': 'Elasticsearch', 'backend': 'elasticsearch', 'location': 'alerts-valid',
     'columns': ['rule_name', 'severity', 'src_ip', 'dst_ip', 'src_port', 'dst_port',
                 'attack_type', 'device_type', 'status', 'first_seen', 'last_seen']},
    {'value': '资产表', 'label': '资产表（assets · PostgreSQL）',
     'db': 'PostgreSQL', 'backend': 'postgresql', 'location': 'assets', 'columns': []},
    {'value': '漏洞表', 'label': '漏洞表（vulnerabilities · PostgreSQL）',
     'db': 'PostgreSQL', 'backend': 'postgresql', 'location': 'vulnerabilities', 'columns': []},
    {'value': '事件表', 'label': '事件表（events · PostgreSQL）',
     'db': 'PostgreSQL', 'backend': 'postgresql', 'location': 'events', 'columns': []},
]

# 支持查询的存储后端类型（timescaledb 已移除，其余未知后端不可查询）
_QUERYABLE_BACKENDS = ('elasticsearch', 'postgresql')


@playbooks_api_bp.route('/query-sources', methods=['GET'])
@login_required
def get_query_sources():
    """枚举数据查询节点可选的数据源：存储表注册表（auto+手动）+ 内部业务表。"""
    from app.routes.storage_tables import StorageTable
    sources = []
    try:
        tables = StorageTable.query.order_by(StorageTable.id).all()
        for t in tables:
            backend = (t.log_type or '').strip().lower()
            if backend not in _QUERYABLE_BACKENDS:
                continue  # timescaledb 等已移除/不可查询的后端跳过
            db_label = 'Elasticsearch' if backend == 'elasticsearch' else 'PostgreSQL'
            # 注册表 columns 可能是字符串列表或对象列表，统一取字段名
            cols = []
            for c in (t.columns or [])[:80]:
                if isinstance(c, str):
                    cols.append(c)
                elif isinstance(c, dict) and c.get('name'):
                    cols.append(c['name'])
            sources.append({
                'value': t.name,
                'label': f"{t.display_name}（{t.name} · {db_label}）",
                'db': db_label,
                'backend': backend,
                'location': t.name,  # 物理位置：ES 索引名 / PG 表名
                'columns': cols,
            })
    except Exception as e:
        # 注册表异常时不阻塞：仍返回内部业务表
        sources = []
    return jsonify({'success': True, 'data': {'sources': sources + _INTERNAL_SOURCES}})
