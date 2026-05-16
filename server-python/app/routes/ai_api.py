"""
AI 中心 API 路由 — 真实 DeepSeek 大模型接入（基于 requests，无需 openai SDK）
支持：
  - 直接调用 DeepSeek API（OpenAI 兼容协议）
  - 可选通过 Hermes Agent 转发
  - 流式 SSE 返回
  - 对话会话管理
"""
import os
import json
import uuid
import requests as http_requests
from datetime import datetime
from flask import Blueprint, request, jsonify, Response, stream_with_context
from app.routes.auth import login_required
from app.database import db
from app.models import AIModel, AITask, AIChatSession, AIChatMessage, AIInsight, AIAgent

ai_api_bp = Blueprint('ai_api', __name__)

# ==================== DeepSeek 客户端配置 ====================
DEEPSEEK_API_KEY = os.getenv('DEEPSEEK_API_KEY', 'sk-bf41b5f890024a739325b3f765129dbc')
DEEPSEEK_BASE_URL = os.getenv('DEEPSEEK_BASE_URL', 'https://api.deepseek.com/v1')
DEEPSEEK_MODEL = os.getenv('DEEPSEEK_MODEL', 'deepseek-chat')

# Hermes Agent 地址（Docker 内部网络）
HERMES_BASE_URL = os.getenv('HERMES_BASE_URL', 'http://hermes-agent:8080')

# 是否优先使用 Hermes 代理（默认 false = 直连 DeepSeek）
USE_HERMES_PROXY = os.getenv('USE_HERMES_PROXY', 'false').lower() == 'true'


def _get_api_base() -> str:
    """获取当前 API base URL（直连 DeepSeek 或通过 Hermes）"""
    if USE_HERMES_PROXY:
        return f"{HERMES_BASE_URL}/v1"
    return DEEPSEEK_BASE_URL


def _deepseek_request(messages: list, **kwargs) -> dict:
    """调用 DeepSeek 兼容 API（非流式），返回 response JSON"""
    api_base = _get_api_base()
    resp = http_requests.post(
        f"{api_base}/chat/completions",
        headers={
            "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": kwargs.get('model', DEEPSEEK_MODEL),
            "messages": messages,
            "temperature": kwargs.get('temperature', 0.7),
            "max_tokens": kwargs.get('max_tokens', 4096),
            "stream": False,
            **({} if not kwargs.get('response_format') else {"response_format": kwargs['response_format']}),
        },
        timeout=kwargs.get('timeout', 60),
    )
    resp.raise_for_status()
    return resp.json()


def _deepseek_stream(messages: list, **kwargs):
    """调用 DeepSeek 兼容 API（流式），返回 response 迭代器"""
    api_base = _get_api_base()
    resp = http_requests.post(
        f"{api_base}/chat/completions",
        headers={
            "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": kwargs.get('model', DEEPSEEK_MODEL),
            "messages": messages,
            "temperature": kwargs.get('temperature', 0.7),
            "max_tokens": kwargs.get('max_tokens', 4096),
            "stream": True,
        },
        stream=True,
        timeout=kwargs.get('timeout', 120),
    )
    resp.raise_for_status()
    return resp.iter_lines(decode_unicode=True)


# ==================== 模型管理 ====================

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
    return jsonify({'success': True, 'data': model.to_dict()}), 201


@ai_api_bp.route('/models/<int:model_id>', methods=['GET'])
@login_required
def get_model(model_id):
    """获取 AI 模型详情"""
    model = AIModel.query.get(model_id)
    if not model:
        return jsonify({'success': False, 'error': '模型不存在'}), 404
    return jsonify({'success': True, 'data': model.to_dict()})


@ai_api_bp.route('/models/<int:model_id>', methods=['PUT'])
@login_required
def update_model(model_id):
    """更新 AI 模型配置"""
    model = AIModel.query.get(model_id)
    if not model:
        return jsonify({'success': False, 'error': '模型不存在'}), 404
    data = request.get_json()
    for key in ('name', 'status', 'config'):
        if key in data:
            setattr(model, key, data[key])
    db.session.commit()
    return jsonify({'success': True, 'data': model.to_dict()})


@ai_api_bp.route('/models/<int:model_id>', methods=['DELETE'])
@login_required
def delete_model(model_id):
    """删除 AI 模型配置"""
    model = AIModel.query.get(model_id)
    if not model:
        return jsonify({'success': False, 'error': '模型不存在'}), 404
    db.session.delete(model)
    db.session.commit()
    return jsonify({'success': True, 'message': '模型已删除'})


# ==================== 对话会话管理 ====================

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
    return jsonify({'success': True, 'data': session.to_dict()}), 201


@ai_api_bp.route('/chat/sessions/<session_id>', methods=['GET'])
@login_required
def get_chat_session(session_id):
    """获取对话会话详情"""
    session = AIChatSession.query.get(session_id)
    if not session:
        return jsonify({'success': False, 'error': '会话不存在'}), 404
    return jsonify({'success': True, 'data': session.to_dict()})


@ai_api_bp.route('/chat/sessions/<session_id>', methods=['DELETE'])
@login_required
def delete_chat_session(session_id):
    """删除对话会话"""
    session = AIChatSession.query.get(session_id)
    if not session:
        return jsonify({'success': False, 'error': '会话不存在'}), 404
    AIChatMessage.query.filter_by(session_id=session_id).delete()
    db.session.delete(session)
    db.session.commit()
    return jsonify({'success': True, 'message': '会话已删除'})


# ==================== 核心：AI 对话（流式 / 非流式）====================

@ai_api_bp.route('/chat/sessions/<session_id>/messages', methods=['POST'])
@login_required
def send_message(session_id):
    """
    发送消息并获取 AI 回复
    支持两种模式：
      - stream=true（默认）：SSE 流式返回
      - stream=false：一次性返回完整 JSON
    """
    session = AIChatSession.query.get(session_id)
    if not session:
        return jsonify({'success': False, 'error': '会话不存在'}), 404

    data = request.get_json()
    user_content = data.get('content', '').strip()
    if not user_content:
        return jsonify({'success': False, 'error': '消息不能为空'}), 400

    stream_mode = data.get('stream', True)

    # 保存用户消息到数据库
    user_message = AIChatMessage(
        session_id=session_id,
        role='user',
        content=user_content
    )
    db.session.add(user_message)

    # 构建消息历史（取最近 20 轮）
    history_messages = AIChatMessage.query.filter_by(
        session_id=session_id
    ).order_by(AIChatMessage.created_at.asc()).limit(40).all()

    # 组装消息列表
    messages = [
        {
            "role": "system",
            "content": (
                "你是一名专业的安全运营中心（SOC）AI 安全分析助手，名叫 USOP AI。"
                "你擅长：安全事件分析、威胁情报查询、日志解析、漏洞研判、合规检查。"
                "请用专业且简洁的中文回答问题。"
                "如果涉及安全分析，请给出具体的检测建议和处置方案。"
            )
        }
    ]
    for msg in history_messages:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": user_content})

    model = data.get('model', DEEPSEEK_MODEL)

    def stream_response():
        """SSE 流式返回 AI 回复"""
        collected_content = ""
        try:
            lines = _deepseek_stream(
                messages,
                model=model,
                temperature=data.get('temperature', 0.7),
                max_tokens=data.get('max_tokens', 4096),
            )
            for line in lines:
                if not line or line.startswith(':'):
                    continue
                if line.startswith('data: '):
                    payload = line[6:]
                    if payload.strip() == '[DONE]':
                        break
                    try:
                        chunk = json.loads(payload)
                        delta = chunk.get('choices', [{}])[0].get('delta', {})
                        content = delta.get('content', '')
                        collected_content += content
                        yield f"data: {json.dumps({'content': content, 'done': False})}\n\n"
                    except json.JSONDecodeError:
                        continue

            # 流结束，保存完整回复到数据库
            ai_message = AIChatMessage(
                session_id=session_id,
                role='assistant',
                content=collected_content,
                model=model,
                tokens_used=len(collected_content) // 4
            )
            db.session.add(ai_message)
            session.updated_at = datetime.utcnow()
            db.session.commit()

            yield f"data: {json.dumps({'content': '', 'done': True, 'message_id': ai_message.id})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'error': f'AI 服务调用失败: {str(e)}', 'done': True})}\n\n"

    def non_stream_response():
        """一次性返回完整回复"""
        try:
            result = _deepseek_request(
                messages,
                model=model,
                temperature=data.get('temperature', 0.7),
                max_tokens=data.get('max_tokens', 4096),
            )

            reply_content = result['choices'][0]['message']['content'] or ""

            ai_message = AIChatMessage(
                session_id=session_id,
                role='assistant',
                content=reply_content,
                model=model,
                tokens_used=result.get('usage', {}).get('total_tokens', len(reply_content) // 4)
            )
            db.session.add(ai_message)
            session.updated_at = datetime.utcnow()
            db.session.commit()

            return jsonify({
                'success': True,
                'data': {
                    'user_message': user_message.to_dict(),
                    'ai_message': ai_message.to_dict()
                }
            })

        except Exception as e:
            return jsonify({
                'success': False,
                'error': f'AI 服务调用失败: {str(e)}'
            }), 503

    if stream_mode:
        return Response(
            stream_with_context(stream_response()),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no',
            }
        )
    else:
        return non_stream_response()


# ==================== AI 安全洞察 ====================

@ai_api_bp.route('/insights', methods=['GET'])
@login_required
def get_insights():
    """获取 AI 安全洞察（支持分页和筛选）"""
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
    return jsonify({'success': True, 'data': insight.to_dict()})


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
    return jsonify({'success': True, 'data': insight.to_dict()})


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
    return jsonify({'success': True, 'data': insight.to_dict()})


# ==================== AI Agent（通过 Hermes 调用）====================

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
    """
    调用 AI Agent
    如果 Hermes 不可用，降级为直连 DeepSeek 分析
    """
    agent = AIAgent.query.get(agent_id)
    if not agent:
        return jsonify({'success': False, 'error': 'Agent 不存在'}), 404

    data = request.get_json()
    input_data = data.get('input', {})

    agent.status = 'busy'
    agent.last_active = datetime.utcnow()
    db.session.commit()

    try:
        if USE_HERMES_PROXY:
            hermes_response = http_requests.post(
                f"{HERMES_BASE_URL}/api/agents/{agent_id}/execute",
                json={"input": input_data},
                timeout=120
            )
            if hermes_response.status_code == 200:
                result = hermes_response.json()
                agent.status = 'idle'
                db.session.commit()
                return jsonify({'success': True, 'data': result})
            print(f"Hermes 返回异常 ({hermes_response.status_code})，降级到 DeepSeek")

        # 降级方案：直接调用 DeepSeek 分析
        result = _deepseek_request(
            messages=[
                {"role": "system", "content": f"你是一个 AI Agent「{agent.name}」，职责：{agent.description}。请根据输入数据进行分析。"},
                {"role": "user", "content": json.dumps(input_data, ensure_ascii=False)}
            ],
            temperature=0.3,
            max_tokens=4096,
            timeout=120,
        )
        reply = result['choices'][0]['message']['content']

        response_data = {
            'agent_id': agent_id,
            'agent_name': agent.name,
            'result': reply,
            'executed_at': datetime.utcnow().isoformat(),
            'source': 'deepseek_fallback'
        }

        agent.status = 'idle'
        db.session.commit()

        return jsonify({'success': True, 'data': response_data})

    except Exception as e:
        agent.status = 'error'
        agent.last_error = str(e)
        db.session.commit()

        return jsonify({
            'success': False,
            'error': f'Agent 调用失败: {str(e)}'
        }), 503


# ==================== AI 任务管理 ====================

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
    return jsonify({'success': True, 'data': task.to_dict()}), 201


@ai_api_bp.route('/analyze', methods=['POST'])
@login_required
def analyze():
    """
    AI 分析接口 — 使用 DeepSeek 进行实时安全分析
    """
    data = request.get_json()
    analysis_type = data.get('type', 'event')
    input_data = data.get('data', {})

    try:
        result = _deepseek_request(
            messages=[
                {
                    "role": "system",
                    "content": (
                        f"你是一名安全分析师。请对以下 {analysis_type} 数据进行专业分析。"
                        "输出 JSON 格式：包含 summary（摘要）、recommendations（建议列表）、confidence（置信度0-1）。"
                    )
                },
                {"role": "user", "content": json.dumps(input_data, ensure_ascii=False)}
            ],
            temperature=0.3,
            response_format={"type": "json_object"},
        )

        result_text = result['choices'][0]['message']['content']
        try:
            analysis_result = json.loads(result_text)
        except json.JSONDecodeError:
            analysis_result = {
                "summary": result_text[:200],
                "recommendations": ["请手动分析详情"],
                "confidence": 0.5,
            }

        analysis_result['type'] = analysis_type
        analysis_result['analyzed_at'] = datetime.utcnow().isoformat()

        return jsonify({'success': True, 'data': analysis_result})

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'分析服务调用失败: {str(e)}'
        }), 503
