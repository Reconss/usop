from flask import Blueprint, request, jsonify
from app.database import db
from app.models import AIModel, AITask, AuditLog
from app.routes.auth import login_required
from datetime import datetime

ai_bp = Blueprint('ai', __name__)


@ai_bp.route('/models', methods=['GET'])
@login_required
def list_models():
    models = AIModel.query.all()
    return jsonify({
        'success': True,
        'data': {
            'items': [m.to_dict() for m in models],
            'total': len(models)
        }
    })


@ai_bp.route('/models/<int:model_id>', methods=['GET'])
@login_required
def get_model(model_id):
    model = AIModel.query.get(model_id)
    if not model:
        return jsonify({'success': False, 'error': '模型不存在'}), 404

    return jsonify({
        'success': True,
        'data': model.to_dict()
    })


@ai_bp.route('/tasks', methods=['POST'])
@login_required
def create_task():
    data = request.get_json()
    task = AITask(
        name=data.get('name'),
        model_id=data.get('model_id'),
        type=data.get('type'),
        input_data=data.get('input_data', {}),
        status='pending'
    )
    db.session.add(task)
    db.session.commit()

    return jsonify({
        'success': True,
        'data': task.to_dict()
    }), 201


@ai_bp.route('/tasks', methods=['GET'])
@login_required
def list_tasks():
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 10, type=int)

    total = AITask.query.count()
    tasks = AITask.query.order_by(AITask.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return jsonify({
        'success': True,
        'data': {
            'items': [t.to_dict() for t in tasks],
            'total': total,
            'page': page,
            'limit': limit
        }
    })


@ai_bp.route('/tasks/<int:task_id>', methods=['GET'])
@login_required
def get_task(task_id):
    task = AITask.query.get(task_id)
    if not task:
        return jsonify({'success': False, 'error': '任务不存在'}), 404

    return jsonify({
        'success': True,
        'data': task.to_dict()
    })


@ai_bp.route('/suggestions', methods=['POST'])
@login_required
def get_suggestions():
    data = request.get_json()
    context = data.get('context', '')

    # Simulated AI suggestions
    suggestions = [
        {'text': '建议检查该IP的所有连接记录', 'confidence': 0.92},
        {'text': '考虑封禁该IP并更新防火墙规则', 'confidence': 0.85},
        {'text': '通知相关责任人进行响应', 'confidence': 0.78}
    ]

    return jsonify({
        'success': True,
        'data': {
            'context': context,
            'suggestions': suggestions
        }
    })