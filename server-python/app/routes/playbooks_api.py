"""
剧本管理 API 路由 (新版)
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import Playbook
from datetime import datetime

playbooks_api_bp = Blueprint('playbooks_api', __name__)


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
            'items': [p.to_dict() for p in playbooks],
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

    return jsonify({
        'success': True,
        'data': playbook.to_dict()
    })


@playbooks_api_bp.route('/playbooks', methods=['POST'])
@login_required
def create_playbook():
    """创建剧本"""
    data = request.get_json()
    playbook = Playbook(
        name=data.get('name'),
        description=data.get('description'),
        nodes=data.get('nodes', []),
        edges=data.get('edges', []),
        status='draft',
        version='1.0'
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
    for key in ['name', 'description', 'nodes', 'edges', 'status', 'version']:
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
    """删除剧本"""
    playbook = Playbook.query.get(playbook_id)
    if not playbook:
        return jsonify({'success': False, 'error': '剧本不存在'}), 404

    db.session.delete(playbook)
    db.session.commit()

    return jsonify({'success': True, 'message': '删除成功'})


@playbooks_api_bp.route('/playbooks/<int:playbook_id>/execute', methods=['POST'])
@login_required
def execute_playbook(playbook_id):
    """执行剧本"""
    playbook = Playbook.query.get(playbook_id)
    if not playbook:
        return jsonify({'success': False, 'error': '剧本不存在'}), 404

    if playbook.status not in ('published', 'enabled'):
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
        event_code = data['event_id']
        from app.models import Event
        event = Event.query.filter_by(event_code=event_code).first()
        if not event and event_code.isdigit():
            event = Event.query.get(int(event_code))
        if event:
            event_info = event.to_dict()

    from app.engine.playbook_engine import playbook_engine

    result = playbook_engine.execute(
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


@playbooks_api_bp.route('/playbooks/executions', methods=['GET'])
@login_required
def list_executions():
    """获取剧本执行历史"""
    from app.models import PlaybookExecution
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 20, type=int)

    query = PlaybookExecution.query.order_by(
        PlaybookExecution.started_at.desc()
    )
    pagination = query.paginate(page=page, per_page=page_size, error_out=False)

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


@playbooks_api_bp.route('/playbooks/executions/<execution_id>', methods=['GET'])
@login_required
def get_execution(execution_id):
    """获取剧本执行详情"""
    from app.models import PlaybookExecution
    execution = PlaybookExecution.query.get(execution_id)
    if not execution:
        return jsonify({'success': False, 'error': '执行记录不存在'}), 404

    return jsonify({
        'success': True,
        'data': execution.to_dict()
    })
