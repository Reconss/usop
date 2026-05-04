from flask import Blueprint, request, jsonify
from app.database import db
from app.models import Event, AuditLog
from app.routes.auth import login_required
from datetime import datetime
from sqlalchemy import func

events_bp = Blueprint('events', __name__)


def generate_event_code():
    """生成事件ID，格式为：年月日+三位序号（如：20250115001）"""
    today = datetime.utcnow().strftime('%Y%m%d')
    
    # 查找今天已存在的最大序号
    max_code = db.session.query(func.max(Event.event_code)).filter(
        Event.event_code.like(f'{today}%')
    ).scalar()
    
    if max_code:
        # 提取序号部分并加1
        try:
            last_seq = int(max_code[-3:])
            new_seq = last_seq + 1
        except ValueError:
            new_seq = 1
    else:
        new_seq = 1
    
    return f"{today}{new_seq:03d}"


@events_bp.route('/', methods=['GET'])
@login_required
def list_events():
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 10, type=int)
    severity = request.args.get('severity')
    status = request.args.get('status')
    search = request.args.get('search', '')

    query = Event.query
    if severity:
        query = query.filter(Event.severity == severity)
    if status:
        query = query.filter(Event.status == status)
    if search:
        query = query.filter(Event.title.contains(search))

    total = query.count()
    events = query.order_by(Event.timestamp.desc()).offset((page - 1) * limit).limit(limit).all()

    return jsonify({
        'success': True,
        'data': {
            'items': [e.to_dict() for e in events],
            'total': total,
            'page': page,
            'limit': limit
        }
    })


@events_bp.route('/<int:event_id>', methods=['GET'])
@login_required
def get_event(event_id):
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'success': False, 'error': '事件不存在'}), 404

    return jsonify({
        'success': True,
        'data': event.to_dict()
    })


@events_bp.route('/', methods=['POST'])
@login_required
def create_event():
    data = request.get_json()
    
    # 自动生成事件ID：年月日+三位序号
    event_code = generate_event_code()
    
    event = Event(
        event_code=event_code,
        title=data.get('title'),
        description=data.get('description'),
        severity=data.get('severity', 'medium'),
        category=data.get('category'),
        source=data.get('source'),
        status='new',
        raw_log=data.get('raw_log'),
        timestamp=datetime.utcnow()
    )
    db.session.add(event)
    db.session.commit()

    return jsonify({
        'success': True,
        'data': event.to_dict()
    }), 201


@events_bp.route('/<int:event_id>', methods=['PUT'])
@login_required
def update_event(event_id):
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'success': False, 'error': '事件不存在'}), 404

    data = request.get_json()
    for key in ['title', 'description', 'severity', 'category', 'source', 'raw_log']:
        if key in data:
            setattr(event, key, data[key])

    db.session.commit()

    return jsonify({
        'success': True,
        'data': event.to_dict()
    })


@events_bp.route('/<int:event_id>/status', methods=['PATCH'])
@login_required
def update_event_status(event_id):
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'success': False, 'error': '事件不存在'}), 404

    data = request.get_json()
    status = data.get('status')
    valid_statuses = ['new', 'investigating', 'closed', 'false_positive']
    if status not in valid_statuses:
        return jsonify({'success': False, 'error': '无效的状态'}), 400

    event.status = status
    db.session.commit()

    return jsonify({
        'success': True,
        'data': event.to_dict()
    })


@events_bp.route('/<int:event_id>', methods=['DELETE'])
@login_required
def delete_event(event_id):
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'success': False, 'error': '事件不存在'}), 404

    db.session.delete(event)
    db.session.commit()

    return jsonify({'success': True, 'message': '删除成功'})
