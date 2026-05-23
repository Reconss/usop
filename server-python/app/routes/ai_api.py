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
import re
import requests as http_requests
from datetime import datetime
from flask import Blueprint, request, jsonify, Response, stream_with_context
from app.routes.auth import login_required
from app.database import db
from app.models import AIModel, AITask, AIChatSession, AIChatMessage, AIInsight, AIAgent

ai_api_bp = Blueprint('ai_api', __name__)

# ==================== DeepSeek 客户端配置 ====================
def _get_db_config(key: str, default: str = '') -> str:
    """从 DB 获取配置值，如不存在则返回默认值"""
    try:
        from app.models import SystemConfig
        cfg = SystemConfig.query.filter_by(key=f'ai_provider_{key}').first()
        if cfg and cfg.value:
            return cfg.value
    except Exception:
        pass
    return default


DEEPSEEK_API_KEY = _get_db_config('deepseek_api_key') or os.getenv('DEEPSEEK_API_KEY', 'sk-bf41b5f890024a739325b3f765129dbc')
DEEPSEEK_BASE_URL = _get_db_config('deepseek_base_url') or os.getenv('DEEPSEEK_BASE_URL', 'https://api.deepseek.com/v1')
DEEPSEEK_MODEL = _get_db_config('deepseek_model') or os.getenv('DEEPSEEK_MODEL', 'deepseek-chat')

# Hermes Agent 地址
HERMES_BASE_URL = _get_db_config('hermes_base_url') or os.getenv('HERMES_BASE_URL', 'http://hermes-agent:8080')

# 是否优先使用 Hermes 代理
USE_HERMES_PROXY = (_get_db_config('use_hermes_proxy') or os.getenv('USE_HERMES_PROXY', 'false')).lower() == 'true'

# 本地 AI 提供商（开发阶段使用）
LOCAL_AI_TYPE = _get_db_config('local_ai_type') or os.getenv('LOCAL_AI_TYPE', '')
LOCAL_AI_BASE_URL = _get_db_config('local_ai_base_url') or os.getenv('LOCAL_AI_BASE_URL', 'http://localhost:11434')
LOCAL_AI_MODEL = _get_db_config('local_ai_model') or os.getenv('LOCAL_AI_MODEL', 'llama3')
LOCAL_AI_API_KEY = _get_db_config('local_ai_api_key') or os.getenv('LOCAL_AI_API_KEY', '')


def _get_api_base() -> str:
    """获取当前 API base URL（直连 DeepSeek 或通过 Hermes）"""
    if USE_HERMES_PROXY:
        return f"{HERMES_BASE_URL}/v1"
    return DEEPSEEK_BASE_URL


def _local_ai_request(messages: list, **kwargs) -> dict:
    """调用本地 AI（Ollama / LM Studio / OpenAI 兼容）"""
    import re
    import requests as http_requests

    ai_type = LOCAL_AI_TYPE
    base_url = LOCAL_AI_BASE_URL
    model = kwargs.get('model', LOCAL_AI_MODEL)

    if ai_type == 'ollama':
        # Ollama 原生 API
        resp = http_requests.post(
            f'{base_url}/api/chat',
            json={
                'model': model,
                'messages': messages,
                'stream': False,
                'options': {
                    'temperature': kwargs.get('temperature', 0.7),
                }
            },
            timeout=kwargs.get('timeout', 120),
        )
        resp.raise_for_status()
        result = resp.json()
        return {
            'choices': [{
                'message': {
                    'content': result['message']['content']
                }
            }],
            'usage': {
                'total_tokens': result.get('eval_count', 0)
            }
        }
    else:
        # OpenAI 兼容 API (LM Studio, vLLM, etc.)
        headers = {'Content-Type': 'application/json'}
        if LOCAL_AI_API_KEY:
            headers['Authorization'] = f'Bearer {LOCAL_AI_API_KEY}'
        resp = http_requests.post(
            f'{base_url}/v1/chat/completions',
            headers=headers,
            json={
                'model': model,
                'messages': messages,
                'temperature': kwargs.get('temperature', 0.7),
                'max_tokens': kwargs.get('max_tokens', 4096),
                'stream': False,
            },
            timeout=kwargs.get('timeout', 120),
        )
        resp.raise_for_status()
        return resp.json()


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

@ai_api_bp.route('/llm-providers', methods=['GET'])
@login_required
def get_llm_providers():
    """获取所有 LLM 提供商配置"""
    from app.models import SystemConfig
    configs = SystemConfig.query.filter(SystemConfig.key.like('ai_llm_%')).all()
    result = []
    for c in configs:
        try:
            val = json.loads(c.value) if c.value else {}
        except:
            val = {}
        if val.get('name'):
            val['id'] = c.key.replace('ai_llm_', '')
            result.append(val)
    return jsonify({'success': True, 'data': result})


@ai_api_bp.route('/llm-providers', methods=['POST'])
@login_required
def add_llm_provider():
    """添加 LLM 提供商"""
    from app.models import SystemConfig
    from uuid import uuid4
    data = request.get_json() or {}
    if not data.get('name'):
        return jsonify({'success': False, 'error': '提供商名称不能为空'}), 400
    
    provider_id = str(uuid4())[:8]
    config = SystemConfig(
        key=f'ai_llm_{provider_id}',
        value=json.dumps({
            'name': data['name'],
            'type': data.get('type', 'openai_compatible'),
            'base_url': data.get('base_url', ''),
            'api_key': data.get('api_key', ''),
            'model': data.get('model', ''),
            'enabled': data.get('enabled', True),
            'temperature': data.get('temperature', 0.7),
            'max_tokens': data.get('max_tokens', 4096),
        }),
        category='ai_llm'
    )
    db.session.add(config)
    db.session.commit()
    return jsonify({'success': True, 'message': 'LLM 提供商已添加', 'data': {'id': provider_id}})


@ai_api_bp.route('/llm-providers/<provider_id>', methods=['PUT'])
@login_required
def update_llm_provider(provider_id):
    """更新 LLM 提供商"""
    from app.models import SystemConfig
    config = SystemConfig.query.filter_by(key=f'ai_llm_{provider_id}').first()
    if not config:
        return jsonify({'success': False, 'error': '提供商不存在'}), 404
    
    data = request.get_json() or {}
    try:
        val = json.loads(config.value) if config.value else {}
    except:
        val = {}
    for key in ['name', 'type', 'base_url', 'api_key', 'model', 'enabled', 'temperature', 'max_tokens', 'scope']:
        if key in data:
            val[key] = data[key]
    config.value = json.dumps(val)
    db.session.commit()
    return jsonify({'success': True, 'message': 'LLM 提供商已更新'})


@ai_api_bp.route('/llm-providers/<provider_id>', methods=['DELETE'])
@login_required
def delete_llm_provider(provider_id):
    """删除 LLM 提供商"""
    from app.models import SystemConfig
    config = SystemConfig.query.filter_by(key=f'ai_llm_{provider_id}').first()
    if not config:
        return jsonify({'success': False, 'error': '提供商不存在'}), 404
    db.session.delete(config)
    db.session.commit()
    return jsonify({'success': True, 'message': 'LLM 提供商已删除'})


@ai_api_bp.route('/agent-providers', methods=['GET'])
@login_required
def get_agent_providers():
    """获取所有 AI Agent 提供商配置"""
    from app.models import SystemConfig
    configs = SystemConfig.query.filter(SystemConfig.key.like('ai_agent_%')).all()
    result = []
    for c in configs:
        try:
            val = json.loads(c.value) if c.value else {}
        except:
            val = {}
        if val.get('name'):
            val['id'] = c.key.replace('ai_agent_', '')
            result.append(val)
    return jsonify({'success': True, 'data': result})


@ai_api_bp.route('/agent-providers', methods=['POST'])
@login_required
def add_agent_provider():
    """添加 AI Agent 提供商"""
    from app.models import SystemConfig
    from uuid import uuid4
    data = request.get_json() or {}
    if not data.get('name'):
        return jsonify({'success': False, 'error': 'Agent 名称不能为空'}), 400
    
    provider_id = str(uuid4())[:8]
    config = SystemConfig(
        key=f'ai_agent_{provider_id}',
        value=json.dumps({
            'name': data['name'],
            'type': data.get('type', 'hermes'),  # hermes, openclaw, custom
            'endpoint': data.get('endpoint', ''),
            'api_key': data.get('api_key', ''),
            'description': data.get('description', ''),
            'capabilities': data.get('capabilities', []),
            'enabled': data.get('enabled', True),
        }),
        category='ai_agent'
    )
    db.session.add(config)
    db.session.commit()
    return jsonify({'success': True, 'message': 'Agent 提供商已添加', 'data': {'id': provider_id}})


@ai_api_bp.route('/agent-providers/<provider_id>', methods=['PUT'])
@login_required
def update_agent_provider(provider_id):
    """更新 AI Agent 提供商"""
    from app.models import SystemConfig
    config = SystemConfig.query.filter_by(key=f'ai_agent_{provider_id}').first()
    if not config:
        return jsonify({'success': False, 'error': 'Agent 不存在'}), 404
    data = request.get_json() or {}
    try:
        val = json.loads(config.value) if config.value else {}
    except:
        val = {}
    for key in ['name', 'type', 'endpoint', 'api_key', 'description', 'capabilities', 'skills', 'scope', 'enabled']:
        if key in data:
            val[key] = data[key]
    config.value = json.dumps(val)
    db.session.commit()
    return jsonify({'success': True, 'message': 'Agent 提供商已更新'})


@ai_api_bp.route('/agent-providers/<provider_id>', methods=['DELETE'])
@login_required
def delete_agent_provider(provider_id):
    """删除 AI Agent 提供商"""
    from app.models import SystemConfig
    config = SystemConfig.query.filter_by(key=f'ai_agent_{provider_id}').first()
    if not config:
        return jsonify({'success': False, 'error': 'Agent 不存在'}), 404
    db.session.delete(config)
    db.session.commit()
    return jsonify({'success': True, 'message': 'Agent 提供商已删除'})


@ai_api_bp.route('/agents', methods=['GET'])
@login_required
def get_agents():
    """获取 AI Agent 列表"""
    agents = AIAgent.query.all()
    return jsonify({
        'success': True,
        'data': [a.to_dict() for a in agents]
    })


@ai_api_bp.route('/providers', methods=['GET'])
@login_required
def get_ai_providers():
    """获取当前可用的 AI 提供商配置"""
    providers = []

    # DeepSeek (always available if configured)
    providers.append({
        'id': 'deepseek',
        'name': 'DeepSeek AI',
        'type': 'cloud',
        'status': 'available',
        'model': DEEPSEEK_MODEL,
        'configurable': True
    })

    # Hermes agent (if configured)
    if USE_HERMES_PROXY:
        try:
            import re
            import requests as http_requests
            r = http_requests.get(f'{HERMES_BASE_URL}/api/health', timeout=3)
            hermes_ok = r.status_code == 200
        except:
            hermes_ok = False
        providers.append({
            'id': 'hermes',
            'name': 'Hermes Agent',
            'type': 'remote',
            'status': 'available' if hermes_ok else 'unavailable',
            'endpoint': HERMES_BASE_URL,
            'configurable': True
        })

    # Local AI (development mode)
    if LOCAL_AI_TYPE:
        try:
            if LOCAL_AI_TYPE == 'ollama':
                import re
                import requests as http_requests
                r = http_requests.get(f'{LOCAL_AI_BASE_URL}/api/tags', timeout=3)
                local_ok = r.status_code == 200
            else:
                r = http_requests.get(f'{LOCAL_AI_BASE_URL}/v1/models', timeout=3,
                    headers={'Authorization': f'Bearer {LOCAL_AI_API_KEY}'} if LOCAL_AI_API_KEY else {})
                local_ok = r.status_code == 200
        except:
            local_ok = False
        providers.append({
            'id': 'local',
            'name': f'本地 AI ({LOCAL_AI_TYPE})',
            'type': 'local',
            'status': 'available' if local_ok else 'unavailable',
            'endpoint': LOCAL_AI_BASE_URL,
            'model': LOCAL_AI_MODEL,
            'configurable': True
        })

    return jsonify({'success': True, 'data': providers})


@ai_api_bp.route('/invoke', methods=['POST'])
@login_required
def invoke_ai():
    """统一 AI 调用入口：支持 LLM 或 Agent，根据传入的 provider 类型路由"""
    data = request.get_json() or {}
    provider_id = data.get('provider_id', '')
    provider_type = data.get('provider_type', 'llm')  # llm or agent
    messages = data.get('messages', [])
    skills = data.get('skills', [])
    
    if provider_type == 'agent':
        # 调用 Agent
        from app.models import SystemConfig
        config = SystemConfig.query.filter_by(key=f'ai_agent_{provider_id}').first()
        if not config:
            return jsonify({'success': False, 'error': 'Agent 不存在'}), 404
        try:
            agent_config = json.loads(config.value) if config.value else {}
        except:
            agent_config = {}
        
        endpoint = agent_config.get('endpoint', '')
        api_key = agent_config.get('api_key', '')
        agent_type = agent_config.get('type', 'hermes')
        user_message = messages[-1]['content'] if messages else ''
        
        try:
            import re
            import requests as http_requests
            if agent_type == 'hermes':
                resp = http_requests.post(
                    f'{endpoint}/v1/chat/completions',
                    headers={'Authorization': f'Bearer {api_key}' if api_key else '', 'Content-Type': 'application/json'},
                    json={
                        'messages': messages,
                        'skills': skills,
                        'stream': False,
                    },
                    timeout=120
                )
                resp.raise_for_status()
                result = resp.json()
                return jsonify({'success': True, 'data': result})
            else:
                # 通用 OpenAI 兼容 Agent
                resp = http_requests.post(
                    f'{endpoint}/v1/chat/completions',
                    headers={'Authorization': f'Bearer {api_key}' if api_key else '', 'Content-Type': 'application/json'},
                    json={'messages': messages, 'stream': False},
                    timeout=120
                )
                resp.raise_for_status()
                return jsonify({'success': True, 'data': resp.json()})
        except Exception as e:
            return jsonify({'success': False, 'error': f'Agent 调用失败: {str(e)}'}), 500
    
    else:
        # 调用 LLM
        from app.models import SystemConfig
        config = SystemConfig.query.filter_by(key=f'ai_llm_{provider_id}').first()
        if not config:
            return jsonify({'success': False, 'error': 'LLM 提供商不存在'}), 404
        try:
            llm_config = json.loads(config.value) if config.value else {}
        except:
            llm_config = {}
        
        import re
        
        import requests as http_requests
        try:
            resp = http_requests.post(
                f'{llm_config.get("base_url", "")}/chat/completions',
                headers={
                    'Authorization': f'Bearer {llm_config.get("api_key", "")}',
                    'Content-Type': 'application/json',
                },
                json={
                    'model': llm_config.get('model', 'gpt-3.5-turbo'),
                    'messages': messages,
                    'temperature': llm_config.get('temperature', 0.7),
                    'max_tokens': llm_config.get('max_tokens', 4096),
                },
                timeout=120
            )
            resp.raise_for_status()
            return jsonify({'success': True, 'data': resp.json()})
        except Exception as e:
            return jsonify({'success': False, 'error': f'LLM 调用失败: {str(e)}'}), 500
    return jsonify({'success': False, 'error': '无效的 provider_type'}), 400


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




@ai_api_bp.route('/cron/analyze-alerts', methods=['GET'])
def cron_analyze_alerts():
    """无需认证的定时告警分析触发器（用于内部 cron 调用）"""
    from app.ai_analysis.alert_analyzer import analyze_alert_batch
    result = analyze_alert_batch(limit=50)
    return jsonify(result)

@ai_api_bp.route('/orchestrate', methods=['POST'])
@login_required
def orchestrate():
    """AI 编排入口 — 意图识别 + LLM 分析"""
    data = request.get_json() or {}
    query = data.get('query', '')
    session_id = data.get('session_id', '')
    if not query:
        return jsonify({'success': False, 'error': '缺少 query'}), 400

    # 简单问候
    simple = ['你好', 'hi', 'hello', 'help', '帮助', '功能']
    if any(p in query.lower() for p in simple):
        return jsonify({
            'success': True, 'data': {
                'response': '👋 你好！我是安全分析助手，可以帮你分析告警、查询威胁情报、封禁IP等。直接在输入框描述你的需求。',
                'session_id': session_id, 'orchestrator': 'direct'
            }
        })

    # 意图识别
    intent = 'general'
    q = query.lower()
    if any(k in q for k in ['告警','alert','分析','高危','异常']): intent = 'alert_analysis'
    elif any(k in q for k in ['事件','协查','调查','编号']): intent = 'event_copilot'
    elif any(k in q for k in ['分诊','误报','优先级']): intent = 'triage'
    elif any(k in q for k in ['情报','ioc','ip','threat']): intent = 'threat_intel'
    elif any(k in q for k in ['响应','封禁','隔离','block','处置']): intent = 'respond'
    elif any(k in q for k in ['查询','最近','过去','列出','搜索']): intent = 'nl_query'
    elif any(k in q for k in ['攻击链','att&ck','mitre','时间线','溯源']): intent = 'investigate'

    # 构建系统提示词
    system_prompts = {
        'alert_analysis': '你是一个安全告警分析师。请分析用户提供的告警信息，评估风险等级(critical/high/medium/low)，判断是否为真实攻击，给出处置建议。输出格式：风险等级、分析结论、建议动作。',
        'event_copilot': '你是一个安全事件响应专家。请分析安全事件，关联告警上下文，评估影响范围，给出处置建议和后续调查方向。',
        'triage': '你是一个告警分诊专家。请分析告警的误报概率、优先级等级，给出研判依据和处置建议。',
        'threat_intel': '你是一个威胁情报分析师。查询IP/域名的威胁情报信息，分析其关联的告警和风险。',
        'respond': '你是一个安全响应专家。根据事件风险等级决定处置动作(封禁IP/隔离主机/告警通知)，评估威胁等级并给出建议。',
        'nl_query': '你是一个安全数据查询专家。根据用户描述，查询相关的安全告警和事件数据。',
        'investigate': '你是一个攻击溯源专家。分析攻击链、关联告警、资产信息，生成MITRE ATT&CK映射和时间线。',
        'general': '你是一个安全分析助手。请专业、简洁地回答用户的安全相关问题。'
    }
    system_prompt = system_prompts.get(intent, system_prompts['general'])

    # 优先使用用户配置的 LLM，否则使用默认 DeepSeek
    llm_config = None
    try:
        from app.models import SystemConfig
        configs = SystemConfig.query.filter(SystemConfig.key.like('ai_llm_%')).all()
        for c in configs:
            try: val = json.loads(c.value) if c.value else {}
            except: val = {}
            if val.get('enabled', True):
                llm_config = val
                break
    except: pass

    try:
        if llm_config:
            import requests as http_requests
            resp = http_requests.post(
                f'{llm_config.get("base_url", "")}/chat/completions',
                headers={'Authorization': f'Bearer {llm_config.get("api_key", "")}', 'Content-Type': 'application/json'},
                json={'model': llm_config.get('model', 'gpt-4o'), 'messages': [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": query}
                ], 'temperature': 0.3},
                timeout=60
            )
            resp.raise_for_status()
            result = resp.json()
        else:
            result = _deepseek_request(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": query}
                ],
                temperature=0.3
            )
        reply = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        return jsonify({
            'success': True, 'data': {
                'response': reply,
                'session_id': session_id,
                'intent': intent,
                'orchestrator': 'llm'
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': f'分析服务调用失败: {str(e)}'}), 500


@ai_api_bp.route('/orchestrate/approve', methods=['POST'])
@login_required
def orchestrate_approve():
    """人工审批"""
    data = request.get_json() or {}
    session_id = data.get('session_id', '')
    approved = data.get('approved', False)
    if not session_id:
        return jsonify({'success': False, 'error': '缺少 session_id'}), 400
    from app.agents.langgraph_crew import approve_action
    result = approve_action(session_id, approved)
    return jsonify(result)
