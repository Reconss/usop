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
            timeout=kwargs.get('timeout', 60),
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
            timeout=kwargs.get('timeout', 60),
        )
        resp.raise_for_status()
        return resp.json()



def _get_system_llm_config() -> tuple:
    """从 DB 获取系统默认 LLM 配置，返回 (api_base, api_key, model)"""
    try:
        from app.models import SystemConfig
        import json as _j
        
        # 1) 查找系统默认 LLM 提供商
        default_cfg = SystemConfig.query.filter_by(key='ai_llm_default').first()
        default_id = None
        if default_cfg and default_cfg.value:
            try: default_id = _j.loads(default_cfg.value).get('provider_id') if default_cfg.value else None
            except: pass
        
        # 2) 获取所有 LLM 提供商配置
        configs = SystemConfig.query.filter(SystemConfig.key.like('ai_llm_%')).all()
        
        selected_val = None
        for c in configs:
            try: val = _j.loads(c.value) if c.value else {}
            except: val = {}
            if not val.get('enabled', True) or not val.get('base_url') or not val.get('api_key'):
                continue
            provider_id = c.key.replace('ai_llm_', '')
            if selected_val is None:
                selected_val = val
            if default_id and provider_id == default_id:
                selected_val = val
                break
            scope = val.get('scope', '')
            if scope in ('all', 'analysis'):
                selected_val = val
        
        if selected_val:
            return (selected_val['base_url'], selected_val['api_key'], selected_val.get('model', 'deepseek-chat'))
    except Exception:
        pass
    return (None, None, None)


def _deepseek_request(messages: list, **kwargs) -> dict:
    """调用 LLM API（优先使用用户配置的提供商，否则 DeepSeek）"""
    # 尝试从 DB 获取用户配置的 LLM（优先使用系统默认提供商）
    api_base, api_key, model = _get_system_llm_config()
    if not api_base:
        api_base = _get_api_base()
        api_key = DEEPSEEK_API_KEY
        model = kwargs.get('model', DEEPSEEK_MODEL)
    else:
        model = kwargs.get('model', model)

    resp = http_requests.post(
        f"{api_base}/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": model,
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
    """调用 DeepSeek 兼容 API（流式），返回 response 迭代器
    优先使用系统配置的 LLM 提供商，否则使用 DeepSeek / 环境变量"""
    api_base, api_key, model = _get_system_llm_config()
    if not api_base:
        api_base = _get_api_base()
        api_key = DEEPSEEK_API_KEY
    model = kwargs.get('model', model if model else DEEPSEEK_MODEL)
    resp = http_requests.post(
        f"{api_base}/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": messages,
            "temperature": kwargs.get('temperature', 0.7),
            "max_tokens": kwargs.get('max_tokens', 4096),
            "stream": True,
        },
        stream=True,
        timeout=kwargs.get('timeout', 60),
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

@ai_api_bp.route('/llm-providers/default', methods=['GET'])
@login_required
def get_default_llm_provider():
    """获取默认 LLM 提供商"""
    from app.models import SystemConfig
    try:
        cfg = SystemConfig.query.filter_by(key='ai_llm_default').first()
        if cfg and cfg.value:
            try: val = json.loads(cfg.value) if cfg.value else {}
            except: val = {}
            default_id = val.get('provider_id', '')
            # 查找对应的提供商详情
            provider_cfg = SystemConfig.query.filter_by(key=f'ai_llm_{default_id}').first()
            if provider_cfg:
                try: provider_val = json.loads(provider_cfg.value) if provider_cfg.value else {}
                except: provider_val = {}
                provider_val['id'] = default_id
                return jsonify({'success': True, 'data': provider_val})
        return jsonify({'success': True, 'data': None})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@ai_api_bp.route('/llm-providers/<provider_id>/set-default', methods=['POST'])
@login_required
def set_default_llm_provider(provider_id):
    """设置默认 LLM 提供商"""
    from app.models import SystemConfig
    # 验证提供商存在
    config = SystemConfig.query.filter_by(key=f'ai_llm_{provider_id}').first()
    if not config:
        return jsonify({'success': False, 'error': '提供商不存在'}), 404
    # 保存默认配置
    cfg = SystemConfig.query.filter_by(key='ai_llm_default').first()
    if not cfg:
        cfg = SystemConfig(key='ai_llm_default', value='{}', category='ai_llm')
        db.session.add(cfg)
    cfg.value = json.dumps({'provider_id': provider_id}, ensure_ascii=False)
    db.session.commit()
    return jsonify({'success': True, 'message': '已设为默认'})



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
    """AI 编排入口 — 意图识别 → 执行动作 / LLM 分析"""
    data = request.get_json() or {}
    query = data.get('query', '')
    session_id = data.get('session_id', '')
    if not query:
        return jsonify({'success': False, 'error': '缺少 query'}), 400

    # 保存用户消息到会话
    if session_id:
        try:
            from app.models import AIChatSession as ChatSess
            sess = ChatSess.query.get(session_id)
            if sess:
                msgs = sess.messages or []
                msgs.append({'role': 'user', 'content': query, 'time': datetime.utcnow().isoformat()})
                sess.messages = msgs
                db.session.commit()
        except: pass

    q = query.lower().strip()

    # 从原始查询中提取事件编号（保持原始大小写）
    event_code_raw = ''
    for prefix in ['事件','协查','调查','事件编号','追踪','溯源','inc','evt']:
        idx = query.find(prefix)
        if idx >= 0:
            after = query[idx+len(prefix):].strip().split()[0] if query[idx+len(prefix):].strip() else ''
            if after and len(after) > 3:
                event_code_raw = after
                break

    # ===== 动作型指令：直接执行实际功能 =====
    # 定时分析告警
    if any(k in q for k in ['定时分析','批量分析','分析告警','运行分析','安全告警','告警分析','分析最近','分析告警数据','查看告警','查看安全告警']):
        from app.ai_analysis.alert_analyzer import analyze_alert_batch
        result = analyze_alert_batch(limit=50)
        if result.get('success'):
            reply = f"✅ 分析完成！\n- 已分析: {result.get('analyzed',0)} 条\n- 创建事件: {result.get('events_created',0)} 个\n- 标记误报: {result.get('false_positives',0)} 条\n- {result.get('message','')}"
            if session_id:
                try:
                    from app.models import AIChatSession as ChatSess
                    sess = ChatSess.query.get(session_id)
                    if sess:
                        msgs = sess.messages or []
                        msgs.append({'role': 'assistant', 'content': reply, 'time': datetime.utcnow().isoformat()})
                        sess.messages = msgs
                        db.session.commit()
                except: pass
            return jsonify({'success': True, 'data': {
                'response': reply,
                'session_id': session_id, 'intent': 'batch_analysis', 'orchestrator': 'action'
            }})
        return jsonify({'success': False, 'error': result.get('error','分析失败')}), 500

    # 事件协查分析
    if event_code_raw or any(k in q for k in ['事件分析','协查事件','分析事件']):
        event_code = event_code_raw
        from app.ai_analysis.event_copilot import analyze_event
        result = analyze_event(event_code) if event_code else {"success":False,"error":"请输入事件编号"}
        if result.get('success'):
            analysis = result.get('data',{}).get('analysis',{})
            related = result.get('data',{}).get('related_alerts',[])
            alert_list = '\n'.join([f"- [{a.get('severity','')}] {a.get('alert_code','')}: {a.get('title','')}" for a in related[:5]]) or '无关联告警'
            actions = '\n'.join([f"  {i+1}. {a}" for i,a in enumerate(analysis.get('recommended_actions',[]))]) or '无'
            return jsonify({'success': True, 'data': {
                'response': f"## 事件分析报告: {event_code or result.get('data',{}).get('event_code','')}\n\n"
                           f"**评价**: {analysis.get('event_assessment','')}\n"
                           f"**攻击类型**: {analysis.get('attack_type','')}\n"
                           f"**严重度**: {analysis.get('severity_assessment','')}\n\n"
                           f"**关联告警**:\n{alert_list}\n\n"
                           f"**处置建议**:\n{actions}\n\n"
                           f"**后续调查**: {analysis.get('investigation_direction','')}",
                'session_id': session_id, 'intent': 'event_copilot', 'orchestrator': 'action'
            }})
        return jsonify({'success': False, 'error': result.get('error','分析失败')}), 500

    # 攻击链溯源
    if any(k in q for k in ['攻击链','溯源','att&ck','mitre','时间线']):
        code = event_code_raw or ''
        if code:
            from app.ai_analysis.investigation import investigate
            result = investigate(code)
            if result.get('success'):
                d = result.get('data',{})
                chain = '\n'.join([f"  **{s.get('step','')}.** {s.get('action','')} ({s.get('technique','')})" for s in d.get('attack_chain',[])]) or '无'
                timeline = '\n'.join([f"  - {t.get('time','')}: {t.get('event','')}" for t in d.get('timeline',[])]) or '无'
                recs = '\n'.join([f"  {i+1}. {r}" for i,r in enumerate(d.get('recommendations',[]))]) or '无'
                return jsonify({'success': True, 'data': {
                    'response': f"## 溯源分析: {code}\n\n"
                               f"**结论**: {d.get('summary','')}\n\n"
                               f"**攻击链**:\n{chain}\n\n"
                               f"**时间线**:\n{timeline}\n\n"
                               f"**建议**:\n{recs}",
                    'session_id': session_id, 'intent': 'investigate', 'orchestrator': 'action'
                }})
            return jsonify({'success': False, 'error': result.get('error','分析失败')}), 500
        return jsonify({'success': True, 'data': {
            'response': '请输入事件编号，例如：追踪事件 INC-20240523 的攻击链',
            'session_id': session_id, 'intent': 'investigate', 'orchestrator': 'direct'
        }})

    # 白名单管理
    if any(k in q for k in ['白名单','误报名单','whitelist']):
        from app.ai_analysis.whitelist import get_rules, save_rules
        if '查看' in q or '查询' in q or '列表' in q or '所有' in q:
            rules = get_rules()
            rule_list = '\n'.join([f"- {r.get('name','')}: {r.get('reason','')}" for r in rules]) or '无规则'
            return jsonify({'success': True, 'data': {
                'response': f"## 白名单规则\n\n{rule_list}\n\n发送「添加白名单规则: 名称|条件|理由」添加新规则",
                'session_id': session_id, 'intent': 'whitelist', 'orchestrator': 'direct'
            }})
        if '添加' in q:
            return jsonify({'success': True, 'data': {
                'response': '请在 AI 配置页面的白名单管理中配置规则，或输入格式: 添加白名单规则: 规则名称|{"src_ip":"10.0.0.1"}|理由',
                'session_id': session_id, 'intent': 'whitelist', 'orchestrator': 'direct'
            }})

    # ===== 技能执行：封禁IP/隔离主机/查询情报 =====
    if any(k in q for k in ['封禁','block','拉黑','屏蔽']):
        import re as _re
        ip_match = _re.search(r'(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})', query)
        if ip_match:
            from app.ai_analysis.approval import create_action
            ip = ip_match.group(1)
            pending = create_action("block_ip", {"ip": ip, "reason": "AI自动封禁", "duration": 1440})
            return jsonify({'success': True, 'data': {
                'response': f"📋 **封禁IP {ip} 需要审批**\n\n"
                           f"操作已提交等待审批。\n"
                           f"审批编号: `{pending['id']}`\n\n"
                           f"请前往 **AI 配置 → 审批管理** 确认或拒绝此操作。",
                'session_id': session_id, 'intent': 'skill_execute',
                'pending_action_id': pending['id'],
                'orchestrator': 'pending_approval'
            }})
        return jsonify({'success': True, 'data': {
            'response': '请提供要封禁的IP地址，例如：封禁IP 192.168.1.1',
            'session_id': session_id, 'intent': 'skill_execute', 'orchestrator': 'direct'
        }})

    if any(k in q for k in ['隔离','isolate']):
        import re as _re
        host_match = _re.search(r'(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|[\w-]+)', query)
        if host_match:
            host = host_match.group(1)
            if host in ('封禁','block','拉黑','屏蔽','ip','隔离','主机'): host = ''
            if host and len(host) > 2:
                from app.ai_analysis.approval import create_action
                pending = create_action("isolate_host", {"host_id": host, "reason": "AI自动隔离"})
                return jsonify({'success': True, 'data': {
                    'response': f"📋 **隔离主机 {host} 需要审批**\n\n"
                               f"操作已提交等待审批。\n"
                               f"审批编号: `{pending['id']}`\n\n"
                               f"请前往 **AI 配置 → 审批管理** 确认或拒绝此操作。",
                    'session_id': session_id, 'intent': 'skill_execute',
                    'pending_action_id': pending['id'],
                    'orchestrator': 'pending_approval'
                }})

    if any(k in q for k in ['查询.*情报','情报.*查询','威胁情报','ip.*查询','ip.*分析']) and any(k in q for k in ['.']):
        import re as _re
        ip_match = _re.search(r'(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})', query)
        if ip_match:
            from app.ai_analysis.skill_registry import get_skill_registry
            reg = get_skill_registry()
            result = reg.execute('query_ip_reputation', {'ip': ip_match.group(1)})
            if result.get('success'):
                rep = result.get('reputation', {})
                return jsonify({'success': True, 'data': {
                    'response': f"## IP 威胁情报: {result.get('ip','')}\n\n"
                               f"**标签**: {', '.join(rep.get('tags',[]))}\n"
                               f"**国家**: {rep.get('country','')}\n"
                               f"**ASN**: {rep.get('asn','')}\n"
                               f"**置信度**: {rep.get('confidence','')}",
                    'session_id': session_id, 'intent': 'threat_intel', 'orchestrator': 'action'
                }})

    # ===== 对话型指令：调用 LLM 生成回复 =====
    # 简单问候
    simple = ['你好', 'hi', 'hello', 'help', '帮助', '功能']
    if any(p in q for p in simple):
        return jsonify({'success': True, 'data': {
            'response': '👋 你好！我是安全分析助手。\n\n'
                       '**我可以执行以下操作：**\n'
                       '• 输入 **分析告警** → 批量分析数据库中未处理的告警\n'
                       '• 输入 **分析事件 INC-xxx** → 协查安全事件\n'
                       '• 输入 **追踪 INC-xxx 的攻击链** → 溯源分析\n'
                       '• 输入 **查看白名单** → 查看告警白名单规则\n'
                       '• 输入 **封禁IP 1.2.3.4** → 执行IP封禁\n'
                       '• 直接描述安全相关问题 → AI 分析回答',
            'session_id': session_id, 'orchestrator': 'direct'
        }})

    # 意图识别（仅用于 LLM 回复）
    intent = 'general'
    if any(k in q for k in ['告警','alert','高危','异常']): intent = 'alert_analysis'
    elif any(k in q for k in ['分诊','误报','优先级']): intent = 'triage'
    elif any(k in q for k in ['情报','ioc','ip','threat']): intent = 'threat_intel'
    elif any(k in q for k in ['响应','封禁','隔离','block','处置']): intent = 'respond'
    elif any(k in q for k in ['查询','最近','过去','列出','搜索']): intent = 'nl_query'

    system_prompts = {
        'alert_analysis': '''你是USOP安全运营平台的专业安全告警分析师。
你的职责是根据用户提供的告警信息或数据库中的告警数据进行分析：
1. 评估每条告警的风险等级（CRITICAL/HIGH/MEDIUM/LOW）
2. 判断是否为真实攻击还是误报
3. 给出详细的处置建议（封禁IP、隔离主机、忽略等）
4. 如有多条告警，进行关联分析，判断是否为同一攻击链
5. 参考MITRE ATT&CK框架识别攻击技术

回复格式建议：先给出总体评估，然后逐条分析告警。''',

        'triage': '''你是USOP安全运营平台的告警分诊专家。
你的职责是对告警进行优先级排序和误报分析：
1. 评估误报概率（high/medium/low）
2. 基于告警类型、来源IP信誉、历史行为等综合判断
3. 给出优先级排序建议（P0紧急/P1高/P2中/P3低）
4. 提供分诊依据和研判理由

注意：如果用户请求「批量分析告警」或「分诊告警」，系统会自动调用数据库分析函数，不需要你处理。''',

        'threat_intel': '''你是USOP安全运营平台的威胁情报分析师。
你的职责是分析IP地址、域名、URL等威胁指标：
1. 查询IP/域名的威胁情报信息
2. 分析关联的攻击事件和历史行为
3. 评估威胁等级的置信度
4. 给出威胁处置建议（封禁、监控、忽略等）

你可以分析的指标类型：IP地址、域名、URL、文件哈希、邮箱地址。''',

        'respond': '''你是USOP安全运营平台的自动化响应专家。
你的职责是根据安全事件的风险等级自动决定处置动作：
1. CRITICAL级别：建议立即封禁IP、隔离主机
2. HIGH级别：建议封禁IP、终止进程
3. MEDIUM级别：建议加入监控、进一步调查
4. LOW级别：建议记录、定期回顾

注意：封禁IP和隔离主机等高风险操作需要创建审批流程等待审批。安全等级较低的操作可以自动执行。''',

        'nl_query': '''你是USOP安全运营平台的数据查询专家。
你可以帮助用户查询和理解安全数据：
1. 解释安全事件和告警的含义
2. 说明安全术语和攻击技术
3. 提供安全运营的最佳实践建议
4. 引导用户使用平台的各项功能

注意：如果你需要查询数据库但无法直接连接，请引导用户使用具体功能。''',

        'general': '''你是USOP安全运营平台的AI安全分析助手。
你可以帮助安全运营团队完成以下工作：
1. 🚨 告警分析：评估风险、识别误报、给出处置建议
2. 🔍 事件调查：分析安全事件、追溯攻击链
3. 🛡️ 威胁情报：查询IP/域名威胁信息
4. 📊 安全咨询：回答安全运营相关问题
5. ⚡ 自动化响应：封禁IP、隔离主机等操作（需审批）
6. 📝 白名单管理：管理误报规则

回复要求：
- 专业、简洁、条理清晰
- 使用Markdown格式美化回复
- 给出可操作的结论和建议
- 不确定的信息请明确说明'''
    }

    # LLM 调用（优先使用系统配置的默认 LLM 提供商）
    llm_config = None
    try:
        api_base, api_key, model = _get_system_llm_config()
        if api_base:
            llm_config = {'base_url': api_base, 'api_key': api_key, 'model': model}
    except: pass

    try:
        system_prompt = system_prompts.get(intent, system_prompts['general'])
        if intent in ('threat_intel','nl_query'):
            system_prompt += '\n\n如果你需要查询数据库但无法直接连接，请引导用户使用具体功能，如「分析告警」或「输入事件编号进行分析」。'

        if llm_config:
            import requests as http_requests
            resp = http_requests.post(f'{llm_config.get("base_url", "")}/chat/completions',
                headers={'Authorization': f'Bearer {llm_config.get("api_key", "")}', 'Content-Type': 'application/json'},
                json={'model': llm_config.get('model', 'deepseek-chat'), 'messages': [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": query}
                ], 'temperature': 0.3}, timeout=60)
            resp.raise_for_status()
            result = resp.json()
        else:
            result = _deepseek_request(messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": query}
            ], temperature=0.3)
        reply = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        # 保存 AI 回复到会话
        if session_id:
            try:
                from app.models import AIChatSession as ChatSess
                sess = ChatSess.query.get(session_id)
                if sess:
                    msgs = sess.messages or []
                    msgs.append({'role': 'assistant', 'content': reply, 'time': datetime.utcnow().isoformat()})
                    sess.messages = msgs
                    db.session.commit()
            except: pass
        return jsonify({'success': True, 'data': {
            'response': reply, 'session_id': session_id,
            'intent': intent, 'orchestrator': 'llm'
        }})
    except Exception as e:
        return jsonify({'success': False, 'error': f'分析失败: {str(e)}'}), 500


@ai_api_bp.route('/debug-env', methods=['GET'])
def debug_env():
    import os
    from app.models import SystemConfig
    try:
        configs = SystemConfig.query.filter(SystemConfig.key.like('ai_llm_%')).all()
        llm_db = []
        for c in configs:
            try: import json; llm_db.append(json.loads(c.value))
            except: llm_db.append({"raw": c.value[:50]})
    except Exception as e:
        llm_db = [{"error": str(e)}]
    return jsonify({
        "env_api_key": os.getenv('DEEPSEEK_API_KEY', 'NOT SET')[:30] + '...',
        "global_api_key": DEEPSEEK_API_KEY[:30] + '...' if DEEPSEEK_API_KEY else 'EMPTY',
        "llm_db_count": len(configs if 'configs' in dir() else []),
        "llm_db": llm_db,
    })

@ai_api_bp.route('/approval/pending', methods=['GET'])
@login_required
def get_pending_approvals():
    """获取待审批操作列表"""
    from app.ai_analysis.approval import get_pending_actions
    actions = get_pending_actions()
    return jsonify({'success': True, 'data': actions})

@ai_api_bp.route('/approval/pending/<action_id>', methods=['POST'])
@login_required
def approve_or_reject(action_id):
    """审批：同意或拒绝操作"""
    data = request.get_json() or {}
    approved = data.get('approved', False)
    from app.ai_analysis.approval import approve_action
    result = approve_action(action_id, approved)
    return jsonify(result)

@ai_api_bp.route('/orchestrate/approve', methods=['POST'])
@login_required
def orchestrate_approve():
    """人工审批（兼容旧接口）"""
    data = request.get_json() or {}
    action_id = data.get('action_id', data.get('session_id', ''))
    approved = data.get('approved', False)
    if not action_id:
        return jsonify({'success': False, 'error': '缺少 action_id'}), 400
    from app.ai_analysis.approval import approve_action
    result = approve_action(action_id, approved)
    return jsonify(result)

@ai_api_bp.route('/approval/rules', methods=['GET'])
@login_required
def get_approval_rules_api():
    from app.ai_analysis.approval import get_approval_rules
    rules = get_approval_rules()
    return jsonify({'success': True, 'data': rules})

@ai_api_bp.route('/approval/history', methods=['GET'])
@login_required
def get_approval_history():
    from app.ai_analysis.approval import get_action_history
    history = get_action_history(limit=50)
    return jsonify({'success': True, 'data': history})

@ai_api_bp.route('/workflows', methods=['GET'])
@login_required
def list_workflows():
    """获取所有保存的工作流"""
    from app.models import SystemConfig
    configs = SystemConfig.query.filter(SystemConfig.key.like('ai_workflow_%')).all()
    result = []
    for c in configs:
        import json as _j
        try: val = _j.loads(c.value) if c.value else {}
        except: val = {}
        val['id'] = c.key.replace('ai_workflow_', '')
        result.append(val)
    return jsonify({'success': True, 'data': result})



@ai_api_bp.route('/pipeline/status', methods=['GET'])
@login_required
def pipeline_status():
    """获取告警处理流水线运行状态"""
    import json, os
    status_file = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'pipeline_status.json')
    status = {"running": False, "last_run": None, "total_analyzed": 0, "total_events": 0, "error": None}
    if os.path.exists(status_file):
        try:
            with open(status_file) as f:
                status.update(json.load(f))
        except: pass
    return jsonify({'success': True, 'data': status})


# 模块启动时自动清理上一次遗留的状态
import os as _pipeline_os
_status_file = _pipeline_os.path.join(_pipeline_os.path.dirname(__file__), '..', '..', 'data', 'pipeline_status.json')
if _pipeline_os.path.exists(_status_file):
    try:
        import json as _pipeline_json
        with open(_status_file) as _pf:
            _ps = _pipeline_json.load(_pf)
        if _ps.get('running'):
            _ps['running'] = False
            _ps['error'] = '服务重启，上次分析中断'
            with open(_status_file, 'w') as _pf:
                _pipeline_json.dump(_ps, _pf)
    except Exception:
        pass

@ai_api_bp.route('/pipeline/start', methods=['POST'])
@login_required
def pipeline_start():
    """启动定时告警分析"""
    import json, os, threading
    from flask import current_app
    status_file = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'pipeline_status.json')
    
    def run_analysis():
        with current_app.app_context():
            from app.ai_analysis.alert_analyzer import analyze_alert_batch
            try:
                result = analyze_alert_batch(limit=50)
                # 累计当日统计（每次运行累加）
                import json as _rj
                _prev = {"total_analyzed": 0, "total_events": 0, "high_risk": 0}
                if os.path.exists(status_file):
                    try:
                        with open(status_file) as _pf:
                            _prev_data = _rj.load(_pf)
                        if _prev_data.get('last_run'):
                            _prev = _prev_data
                    except: pass
                status = {"running": False, "last_run": __import__('datetime').datetime.utcnow().isoformat(),
                          "total_analyzed": _prev.get('total_analyzed', 0) + result.get('analyzed', 0),
                          "total_events": _prev.get('total_events', 0) + result.get('events_created', 0),
                          "high_risk": _prev.get('high_risk', 0) + max(0, result.get('analyzed', 0) - result.get('false_positives', 0)),
                          "error": result.get('error')}
            except Exception as e:
                status = {"running": False, "error": str(e)}
            os.makedirs(os.path.dirname(status_file), exist_ok=True)
            with open(status_file, 'w') as f:
                json.dump(status, f)
    
    os.makedirs(os.path.dirname(status_file), exist_ok=True)
    with open(status_file, 'w') as f:
        json.dump({"running": True, "last_run": None, "error": None}, f)
    
    t = threading.Thread(target=run_analysis, daemon=True)
    t.start()
    return jsonify({'success': True, 'message': '分析已启动'})


@ai_api_bp.route('/pipeline/stop', methods=['POST'])
@login_required
def pipeline_stop():
    """停止定时分析（标记停止）"""
    import json, os
    status_file = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'pipeline_status.json')
    os.makedirs(os.path.dirname(status_file), exist_ok=True)
    with open(status_file, 'w') as f:
        json.dump({"running": False, "last_run": None, "stopped": True}, f)
    return jsonify({'success': True, 'message': '已停止'})


@ai_api_bp.route('/alerts/schema', methods=['GET'])
@login_required
def get_alerts_schema():
    from app.timescaledb import get_tsdb
    from sqlalchemy import text
    try:
        tsdb = get_tsdb(); sess = tsdb.get_session()
        rows = sess.execute(text("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'alerts' ORDER BY ordinal_position")).fetchall()
        tsdb.close_session(sess)
        fields = [{"name": r[0], "type": r[1], "nullable": r[2] == 'YES', "label": _alert_field_label(r[0])} for r in rows]
        parsed_sub = [
            {"name": "extra_data.parsed.attack_type", "type": "text", "label": "攻击类型(解析)"},
            {"name": "extra_data.parsed.method", "type": "text", "label": "请求方法(解析)"},
            {"name": "extra_data.parsed.uri", "type": "text", "label": "请求URI(解析)"},
            {"name": "extra_data.parsed.risk_level", "type": "text", "label": "风险等级(解析)"},
        ]
        return jsonify({'success': True, 'data': fields + parsed_sub})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

def _alert_field_label(name):
    labels = {'id':'ID','alert_code':'告警编号','title':'标题','description':'描述','severity':'严重度','status':'状态','source':'来源','source_product':'数据源产品','source_type':'数据源类型','category':'分类','confidence':'置信度','src_ip':'源IP','src_port':'源端口','dst_ip':'目标IP','dst_port':'目标端口','protocol':'协议','hostname':'主机名','raw_log':'原始日志','first_seen':'首次发现','last_seen':'最后发现','tags':'标签'}
    return labels.get(name, name)

@ai_api_bp.route('/whitelist/rules', methods=['GET'])
@login_required
def get_whitelist_rules():
    """获取白名单规则列表"""
    from app.ai_analysis.whitelist import get_rules
    rules = get_rules()
    return jsonify({'success': True, 'data': rules})

@ai_api_bp.route('/whitelist/rules', methods=['POST'])
@login_required
def add_whitelist_rule():
    """添加白名单规则"""
    data = request.get_json() or {}
    name = data.get('name', '')
    conditions = data.get('conditions', {})
    reason = data.get('reason', '')
    if not name:
        return jsonify({'success': False, 'error': '规则名称不能为空'}), 400
    from app.ai_analysis.whitelist import get_rules, save_rules
    rules = get_rules()
    rules.append({"name": name, "conditions": conditions, "reason": reason or name})
    save_rules(rules)
    return jsonify({'success': True, 'message': '规则已添加'})

@ai_api_bp.route('/whitelist/rules/<int:index>', methods=['DELETE'])
@login_required
def delete_whitelist_rule(index):
    """删除白名单规则"""
    from app.ai_analysis.whitelist import get_rules, save_rules
    rules = get_rules()
    if index < 0 or index >= len(rules):
        return jsonify({'success': False, 'error': '规则不存在'}), 404
    rules.pop(index)
    save_rules(rules)
    return jsonify({'success': True, 'message': '规则已删除'})

@ai_api_bp.route('/workflows', methods=['POST'])
@login_required
def save_workflow():
    """保存工作流配置"""
    from app.models import SystemConfig, db
    from uuid import uuid4
    data = request.get_json() or {}
    name = data.get('name', 'default')
    workflow_id = data.get('id', str(uuid4())[:8])
    import json as _j
    config = SystemConfig.query.filter_by(key=f'ai_workflow_{workflow_id}').first()
    if not config:
        config = SystemConfig(key=f'ai_workflow_{workflow_id}', value='{}', category='ai_workflow')
        db.session.add(config)
    config.value = _j.dumps({
        'name': name,
        'nodes': data.get('nodes', []),
        'connections': data.get('connections', []),
        'config': data.get('config', {}),
        'enabled': data.get('enabled', True),
    }, ensure_ascii=False)
    db.session.commit()
    return jsonify({'success': True, 'data': {'id': workflow_id, 'name': name}})


@ai_api_bp.route('/workflows/<workflow_id>', methods=['DELETE'])
@login_required
def delete_workflow(workflow_id):
    from app.models import SystemConfig, db
    config = SystemConfig.query.filter_by(key=f'ai_workflow_{workflow_id}').first()
    if config:
        db.session.delete(config)
        db.session.commit()
    return jsonify({'success': True})
