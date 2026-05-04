from flask import Blueprint, request, jsonify
from app.database import db
from app.models import Playbook, AuditLog
from app.routes.auth import login_required
from datetime import datetime

playbooks_bp = Blueprint('playbooks', __name__)


@playbooks_bp.route('/', methods=['GET'])
@login_required
def list_playbooks():
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 10, type=int)
    status = request.args.get('status')
    search = request.args.get('search', '')

    query = Playbook.query
    if status:
        query = query.filter(Playbook.status == status)
    if search:
        query = query.filter(Playbook.name.contains(search) | Playbook.description.contains(search))

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


@playbooks_bp.route('/<int:playbook_id>', methods=['GET'])
@login_required
def get_playbook(playbook_id):
    playbook = Playbook.query.get(playbook_id)
    if not playbook:
        return jsonify({'success': False, 'error': '剧本不存在'}), 404

    return jsonify({
        'success': True,
        'data': playbook.to_dict()
    })


@playbooks_bp.route('/', methods=['POST'])
@login_required
def create_playbook():
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


@playbooks_bp.route('/<int:playbook_id>', methods=['PUT'])
@login_required
def update_playbook(playbook_id):
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


@playbooks_bp.route('/<int:playbook_id>/status', methods=['PATCH'])
@login_required
def update_playbook_status(playbook_id):
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


@playbooks_bp.route('/<int:playbook_id>', methods=['DELETE'])
@login_required
def delete_playbook(playbook_id):
    playbook = Playbook.query.get(playbook_id)
    if not playbook:
        return jsonify({'success': False, 'error': '剧本不存在'}), 404

    db.session.delete(playbook)
    db.session.commit()

    return jsonify({'success': True, 'message': '删除成功'})


@playbooks_bp.route('/<int:playbook_id>/execute', methods=['POST'])
@login_required
def execute_playbook(playbook_id):
    playbook = Playbook.query.get(playbook_id)
    if not playbook:
        return jsonify({'success': False, 'error': '剧本不存在'}), 404

    if playbook.status != 'published':
        return jsonify({'success': False, 'error': '剧本未发布，无法执行'}), 400

    # Simulate execution
    return jsonify({
        'success': True,
        'data': {
            'execution_id': f'exec_{playbook_id}_{datetime.utcnow().timestamp()}',
            'playbook_id': playbook_id,
            'status': 'running',
            'started_at': datetime.utcnow().isoformat(),
            'steps_completed': 0,
            'total_steps': len(playbook.nodes)
        }
    })


@playbooks_bp.route('/node-types/list', methods=['GET'])
@login_required
def list_node_types():
    return jsonify({
        'success': True,
        'data': [
            {'id': 'trigger', 'name': '触发器', 'icon': 'Zap'},
            {'id': 'action', 'name': '执行动作', 'icon': 'Play'},
            {'id': 'condition', 'name': '条件判断', 'icon': 'GitBranch'},
            {'id': 'notification', 'name': '通知', 'icon': 'Bell'},
            {'id': 'api', 'name': 'API调用', 'icon': 'Globe'}
        ]
    })