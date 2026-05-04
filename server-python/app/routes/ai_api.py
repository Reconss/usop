"""
AI 中心 API 路由
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import AIModel, AITask, AIChatSession, AIChatMessage, AIInsight, AIAgent
from datetime import datetime
import uuid

ai_api_bp = Blueprint('ai_api', __name__)


@ai_api_bp.route('/models', methods=['GET'])
@login_required
def get_models():
    """获取 AI 模型列表"""
    models = AIModel.query.all()
    return jsonify({
        'success': True,
        'data': [m.to_dict() for m in models]
    })


@ai_api_bp.route('/models', methods=['POST'])
@login_required
def create_model():
    """创建 AI 模型配置"""
    data = request.get_json()
    
    model = AIModel(
        name=data.get('name'),
        type=data.get('type', 'chat'),
        provider=data.get('provider'),
        status='active',
        config=data.get('config', {})
    )
    
    db.session.add(model)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': model.to_dict()
    }), 201


@ai_api_bp.route('/models/<int:model_id>', methods=['GET'])
@login_required
def get_model(model_id):
    """获取 AI 模型详情"""
    model = AIModel.query.get(model_id)
    if not model:
        return jsonify({'success': False, 'error': '模型不存在'}), 404
    
    return jsonify({
        'success': True,
        'data': model.to_dict()
    })


@ai_api_bp.route('/models/<int:model_id>', methods=['PUT'])
@login_required
def update_model(model_id):
    """更新 AI 模型配置"""
    model = AIModel.query.get(model_id)
    if not model:
        return jsonify({'success': False, 'error': '模型不存在'}), 404
    
    data = request.get_json()
    if 'name' in data:
        model.name = data['name']
    if 'status' in data:
        model.status = data['status']
    if 'config' in data:
        model.config = data['config']
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': model.to_dict()
    })


@ai_api_bp.route('/models/<int:model_id>', methods=['DELETE'])
@login_required
def delete_model(model_id):
    """删除 AI 模型配置"""
    model = AIModel.query.get(model_id)
    if not model:
        return jsonify({'success': False, 'error': '模型不存在'}), 404
    
    db.session.delete(model)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': '模型已删除'
    })


@ai_api_bp.route('/chat/sessions', methods=['GET'])
@login_required
def get_chat_sessions():
    """获取对话会话列表"""
    user_id = getattr(request, 'user_id', 1)
    
    sessions = AIChatSession.query.filter_by(
        user_id=user_id
    ).order_by(AIChatSession.updated_at.desc()).limit(20).all()
    
    return jsonify({
        'success': True,
        'data': [s.to_dict() for s in sessions]
    })


@ai_api_bp.route('/chat/sessions', methods=['POST'])
@login_required
def create_chat_session():
    """创建对话会话"""
    user_id = getattr(request, 'user_id', 1)
    data = request.get_json()
    
    session = AIChatSession(
        id=f"session_{uuid.uuid4().hex[:12]}",
        title=data.get('title', '新对话'),
        user_id=user_id,
        model_id=data.get('model_id'),
        messages=[],
        context=data.get('context', {}),
        status='active'
    )
    
    db.session.add(session)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': session.to_dict()
    }), 201


@ai_api_bp.route('/chat/sessions/<session_id>', methods=['GET'])
@login_required
def get_chat_session(session_id):
    """获取对话会话详情"""
    session = AIChatSession.query.get(session_id)
    if not session:
        return jsonify({'success': False, 'error': '会话不存在'}), 404
    
    return jsonify({
        'success': True,
        'data': session.to_dict()
    })


@ai_api_bp.route('/chat/sessions/<session_id>/messages', methods=['POST'])
@login_required
def send_message(session_id):
    """发送消息"""
    session = AIChatSession.query.get(session_id)
    if not session:
        return jsonify({'success': False, 'error': '会话不存在'}), 404
    
    data = request.get_json()
    
    # 添加用户消息
    user_message = AIChatMessage(
        session_id=session_id,
        role='user',
        content=data.get('content')
    )
    db.session.add(user_message)
    
    # 模拟 AI 响应
    ai_response_content = f"这是一个模拟的AI响应。您发送的消息是: {data.get('content', '')[:50]}..."
    
    # 添加 AI 消息
    ai_message = AIChatMessage(
        session_id=session_id,
        role='assistant',
        content=ai_response_content,
        model=session.model.name if session.model else 'unknown',
        tokens_used=len(ai_response_content) // 4
    )
    db.session.add(ai_message)
    
    # 更新会话
    session.messages.append({
        'id': ai_message.id,
        'role': 'assistant',
        'content': ai_response_content,
        'timestamp': datetime.utcnow().isoformat()
    })
    session.updated_at = datetime.utcnow()
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': {
            'user_message': user_message.to_dict(),
            'ai_message': ai_message.to_dict()
        }
    })


@ai_api_bp.route('/chat/sessions/<session_id>', methods=['DELETE'])
@login_required
def delete_chat_session(session_id):
    """删除对话会话"""
    session = AIChatSession.query.get(session_id)
    if not session:
        return jsonify({'success': False, 'error': '会话不存在'}), 404
    
    # 删除关联消息
    AIChatMessage.query.filter_by(session_id=session_id).delete()
    
    db.session.delete(session)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': '会话已删除'
    })


@ai_api_bp.route('/insights', methods=['GET'])
@login_required
def get_insights():
    """获取 AI 安全洞察"""
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 20, type=int)
    severity = request.args.get('severity')
    category = request.args.get('category')
    status = request.args.get('status')
    
    query = AIInsight.query
    
    if severity:
        query = query.filter(AIInsight.severity == severity)
    if category:
        query = query.filter(AIInsight.category == category)
    if status:
        query = query.filter(AIInsight.status == status)
    
    query = query.order_by(AIInsight.created_at.desc())
    pagination = query.paginate(page=page, per_page=page_size, error_out=False)
    
    return jsonify({
        'success': True,
        'data': {
            'items': [i.to_dict() for i in pagination.items],
            'total': pagination.total,
            'page': page,
            'page_size': page_size,
            'pages': pagination.pages
        }
    })


@ai_api_bp.route('/insights/<insight_id>', methods=['GET'])
@login_required
def get_insight(insight_id):
    """获取洞察详情"""
    insight = AIInsight.query.get(insight_id)
    if not insight:
        return jsonify({'success': False, 'error': '洞察不存在'}), 404
    
    return jsonify({
        'success': True,
        'data': insight.to_dict()
    })


@ai_api_bp.route('/insights/<insight_id>/acknowledge', methods=['POST'])
@login_required
def acknowledge_insight(insight_id):
    """确认洞察"""
    insight = AIInsight.query.get(insight_id)
    if not insight:
        return jsonify({'success': False, 'error': '洞察不存在'}), 404
    
    insight.status = 'acknowledged'
    insight.acknowledged_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': insight.to_dict()
    })


@ai_api_bp.route('/insights/<insight_id>/resolve', methods=['POST'])
@login_required
def resolve_insight(insight_id):
    """解决洞察"""
    insight = AIInsight.query.get(insight_id)
    if not insight:
        return jsonify({'success': False, 'error': '洞察不存在'}), 404
    
    insight.status = 'resolved'
    insight.resolved_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': insight.to_dict()
    })


@ai_api_bp.route('/agents', methods=['GET'])
@login_required
def get_agents():
    """获取 AI Agent 列表"""
    agents = AIAgent.query.all()
    return jsonify({
        'success': True,
        'data': [a.to_dict() for a in agents]
    })


@ai_api_bp.route('/agents/<agent_id>/invoke', methods=['POST'])
@login_required
def invoke_agent(agent_id):
    """调用 AI Agent"""
    agent = AIAgent.query.get(agent_id)
    if not agent:
        return jsonify({'success': False, 'error': 'Agent 不存在'}), 404
    
    data = request.get_json()
    input_data = data.get('input', {})
    
    # 更新 Agent 状态
    agent.status = 'busy'
    agent.last_active = datetime.utcnow()
    db.session.commit()
    
    # 模拟 Agent 执行
    # 实际应该根据 agent_type 调用对应的处理逻辑
    mock_result = {
        'agent_id': agent_id,
        'agent_name': agent.name,
        'result': f"模拟执行结果: 处理了输入数据 {input_data}",
        'executed_at': datetime.utcnow().isoformat()
    }
    
    # 恢复 Agent 状态
    agent.status = 'idle'
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': mock_result
    })


@ai_api_bp.route('/tasks', methods=['GET'])
@login_required
def get_tasks():
    """获取 AI 任务列表"""
    tasks = AITask.query.order_by(AITask.created_at.desc()).limit(20).all()
    return jsonify({
        'success': True,
        'data': [t.to_dict() for t in tasks]
    })


@ai_api_bp.route('/tasks', methods=['POST'])
@login_required
def create_task():
    """创建 AI 任务"""
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


@ai_api_bp.route('/analyze', methods=['POST'])
@login_required
def analyze():
    """AI 分析接口"""
    data = request.get_json()
    analysis_type = data.get('type', 'event')
    input_data = data.get('data', {})
    
    # 模拟 AI 分析
    mock_analysis = {
        'type': analysis_type,
        'summary': f'这是一个针对 {analysis_type} 的模拟分析结果',
        'recommendations': [
            '建议1: 检查相关日志',
            '建议2: 关注异常行为',
            '建议3: 进行深入调查'
        ],
        'confidence': 0.85,
        'analyzed_at': datetime.utcnow().isoformat()
    }
    
    return jsonify({
        'success': True,
        'data': mock_analysis
    })
