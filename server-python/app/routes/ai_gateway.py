"""
AI Gateway — 统一的 AI 功能网关

架构:
  前端 → Hermes Gateway (API) → AI Agent / Custom Tools / Tool Calling

功能:
  - agent:    调用 Hermes/OpenClaw 等 AI Agent 引擎进行对话分析
  - tools:    使用预定义工具（数据库查询等）获取上下文数据
  - function: 通过 function calling 让 LLM 动态调用外部功能
"""

import os, json, logging, requests as http_requests
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from datetime import datetime

logger = logging.getLogger(__name__)
ai_gateway_bp = Blueprint('ai_gateway', __name__)

# ============================================================
# 预定义工具集 — AI Agent 可调用这些工具来获取数据
# ============================================================

TOOLS_REGISTRY = {
    "query_alerts_by_ip": {
        "name": "query_alerts_by_ip",
        "description": "根据源IP或目标IP查询最近的安全告警",
        "parameters": {
            "type": "object",
            "properties": {
                "ip": {"type": "string", "description": "IP 地址"},
                "direction": {"type": "string", "enum": ["src", "dst", "both"], "description": "查询方向"}
            },
            "required": ["ip"]
        }
    },
    "query_alert_detail": {
        "name": "query_alert_detail",
        "description": "根据告警ID查询告警详细信息",
        "parameters": {
            "type": "object",
            "properties": {
                "alert_code": {"type": "string", "description": "告警编号"}
            },
            "required": ["alert_code"]
        }
    },
    "query_event_detail": {
        "name": "query_event_detail",
        "description": "查询安全事件详情及关联告警",
        "parameters": {
            "type": "object",
            "properties": {
                "event_code": {"type": "string", "description": "事件编号"}
            },
            "required": ["event_code"]
        }
    },
    "query_asset_info": {
        "name": "query_asset_info",
        "description": "根据IP地址查询资产信息",
        "parameters": {
            "type": "object",
            "properties": {
                "ip": {"type": "string", "description": "IP 地址"}
            },
            "required": ["ip"]
        }
    },
    "query_recent_alerts": {
        "name": "query_recent_alerts",
        "description": "查询最近N条告警（默认最近10条）",
        "parameters": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "返回条数"}
            }
        }
    }
}


def _execute_tool(tool_name: str, arguments: dict) -> dict:
    """执行工具调用 - 从数据库查询数据"""
    try:
        from app.timescaledb import get_tsdb
        from sqlalchemy import text

        tsdb = get_tsdb()
        sess = tsdb.get_session()

        result = {"success": False, "data": None, "error": None}

        if tool_name == "query_alerts_by_ip":
            ip = arguments.get("ip", "")
            direction = arguments.get("direction", "both")
            conditions = []
            if direction in ("src", "both"):
                conditions.append(f"src_ip = '{ip}'")
            if direction in ("dst", "both"):
                conditions.append(f"dst_ip = '{ip}'")
            where = " OR ".join(conditions)
            rows = sess.execute(text(f"""
                SELECT alert_code, title, severity, src_ip, dst_ip, 
                       attack_type, first_seen, description
                FROM alerts WHERE {where}
                ORDER BY first_seen DESC LIMIT 20
            """)).fetchall()
            result["data"] = [dict(r._mapping) for r in rows]
            result["success"] = True

        elif tool_name == "query_alert_detail":
            code = arguments.get("alert_code", "")
            row = sess.execute(text("""
                SELECT * FROM alerts WHERE alert_code = :code
            """), {"code": code}).fetchone()
            if row:
                result["data"] = dict(row._mapping)
                result["success"] = True
            else:
                result["error"] = f"告警 {code} 不存在"

        elif tool_name == "query_event_detail":
            code = arguments.get("event_code", "")
            from app.models import Event
            event = Event.query.filter_by(event_code=code).first()
            if event:
                ed = event.to_dict()
                extra = ed.get("extra_data", {})
                if isinstance(extra, str):
                    try: extra = json.loads(extra)
                    except: extra = {}
                ed["related_alerts"] = extra.get("related_alerts", [])
                result["data"] = ed
                result["success"] = True
            else:
                result["error"] = f"事件 {code} 不存在"

        elif tool_name == "query_recent_alerts":
            limit = min(int(arguments.get("limit", 10)), 50)
            rows = sess.execute(text(f"""
                SELECT alert_code, title, severity, src_ip, dst_ip, 
                       attack_type, first_seen FROM alerts 
                ORDER BY first_seen DESC LIMIT {limit}
            """)).fetchall()
            result["data"] = [dict(r._mapping) for r in rows]
            result["success"] = True

        tsdb.close_session(sess)
        return result

    except Exception as e:
        logger.error(f"工具执行失败 {tool_name}: {e}")
        return {"success": False, "data": None, "error": str(e)}


def _call_llm(messages: list, tools: list = None, provider_id: str = None) -> dict:
    """调用大模型 (通过已配置的 LLM 提供商)"""
    from app.models import SystemConfig

    if provider_id:
        cfg = SystemConfig.query.filter_by(key=f'ai_llm_{provider_id}').first()
    else:
        cfg = SystemConfig.query.filter(SystemConfig.key.like('ai_llm_%')).first()
    
    if not cfg:
        # 兜底 DeepSeek
        api_key = os.getenv('DEEPSEEK_API_KEY', 'sk-bf41b5f890024a739325b3f765129dbc')
        base_url = os.getenv('DEEPSEEK_BASE_URL', 'https://api.deepseek.com/v1')
        model = os.getenv('DEEPSEEK_MODEL', 'deepseek-chat')
    else:
        try: conf = json.loads(cfg.value) if cfg.value else {}
        except: conf = {}
        api_key = conf.get('api_key', os.getenv('DEEPSEEK_API_KEY', ''))
        base_url = conf.get('base_url', os.getenv('DEEPSEEK_BASE_URL', 'https://api.deepseek.com/v1'))
        model = conf.get('model', os.getenv('DEEPSEEK_MODEL', 'deepseek-chat'))

    payload = {
        'model': model,
        'messages': messages,
        'temperature': 0.3,
        'max_tokens': 4096,
    }
    if tools:
        payload['tools'] = tools
        payload['tool_choice'] = 'auto'

    try:
        resp = http_requests.post(
            f'{base_url}/chat/completions',
            headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
            json=payload,
            timeout=120
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.error(f"LLM 调用失败: {e}")
        return {"error": str(e)}


@ai_gateway_bp.route('/gateway/analyze', methods=['POST'])
@login_required
def gateway_analyze():
    """
    AI 分析网关入口 — 统一的分析接口
    
    请求体:
    {
        "mode": "agent" | "tools" | "function",
        "provider_id": "可选, 指定 LLM/Agent ID",
        "messages": [...],           # 对话历史
        "query_type": "alert_detail" | "event_analysis" | "threat_hunting" | "custom",
        "context": {                 # 分析上下文
            "alert_code": "...",
            "event_code": "...", 
            "ip": "...",
            "title": "...",
            "description": "..."
        }
    }
    """
    data = request.get_json() or {}
    mode = data.get('mode', 'agent')
    messages = data.get('messages', [])
    context = data.get('context', {})
    query_type = data.get('query_type', 'custom')
    provider_id = data.get('provider_id', '')

    # Step 1: 如果是 tools/function 模式，先收集上下文数据
    enriched_context = {}
    if mode in ('tools', 'function'):
        # 自动根据 query_type 收集相关数据
        if context.get('ip'):
            ip_data = _execute_tool("query_alerts_by_ip", {"ip": context['ip'], "direction": "both"})
            if ip_data['success']:
                enriched_context['related_alerts'] = ip_data['data']

        if context.get('alert_code'):
            alert_data = _execute_tool("query_alert_detail", {"alert_code": context['alert_code']})
            if alert_data['success']:
                enriched_context['alert_detail'] = alert_data['data']

        if context.get('event_code'):
            event_data = _execute_tool("query_event_detail", {"event_code": context['event_code']})
            if event_data['success']:
                enriched_context['event_detail'] = event_data['data']

        # 最近告警作为参考
        recent = _execute_tool("query_recent_alerts", {"limit": 5})
        if recent['success']:
            enriched_context['recent_alerts'] = recent['data']

    # Step 2: 构建系统提示词
    system_prompt = """你是一个专业的安全运营中心（SOC）AI 分析助手。

你可以访问以下安全数据来辅助分析:
- 安全告警数据（按 IP、告警ID、时间范围查询）
- 安全事件详情（含关联告警）
- 资产信息

请根据用户提供的数据和上下文，进行专业的安全分析。
分析应包括: 攻击判断、影响评估、处置建议。
回答请使用中文。"""

    if enriched_context:
        system_prompt += f"\n\n以下是从系统获取的上下文数据:\n{json.dumps(enriched_context, ensure_ascii=False, indent=2, default=str)}"

    # Step 3: 构建消息
    full_messages = [{"role": "system", "content": system_prompt}]
    
    # 添加用户原始上下文
    if context:
        context_str = "\n".join([f"{k}: {v}" for k, v in context.items() if v])
        if context_str:
            full_messages.append({"role": "user", "content": f"分析上下文:\n{context_str}"})

    full_messages.extend(messages)

    # Step 4: 调用 LLM (function calling 模式下传工具定义)
    tools_list = list(TOOLS_REGISTRY.values()) if mode == 'function' else None
    llm_result = _call_llm(full_messages, tools=tools_list, provider_id=provider_id)

    if "error" in llm_result:
        return jsonify({"success": False, "error": llm_result["error"]}), 500

    # Step 5: 处理 function calling 的 tool calls
    choice = llm_result.get('choices', [{}])[0]
    message = choice.get('message', {})
    tool_calls = message.get('tool_calls', [])

    tool_results = []
    if tool_calls:
        for tc in tool_calls:
            func_name = tc['function']['name']
            try:
                args = json.loads(tc['function']['arguments'])
            except:
                args = {}
            tool_result = _execute_tool(func_name, args)
            tool_results.append({
                "tool": func_name,
                "arguments": args,
                "result": tool_result
            })
            full_messages.append(message)
            full_messages.append({
                "role": "tool",
                "tool_call_id": tc['id'],
                "content": json.dumps(tool_result, ensure_ascii=False, default=str)
            })
        
        # 如果有 tool calls，再次调用 LLM 获取最终回答
        if tool_results:
            llm_result = _call_llm(full_messages, provider_id=provider_id)
            if "error" in llm_result:
                return jsonify({"success": False, "error": llm_result["error"]}), 500
            final_content = llm_result.get('choices', [{}])[0].get('message', {}).get('content', '')
        else:
            final_content = ""
    else:
        final_content = message.get('content', '')

    return jsonify({
        "success": True,
        "data": {
            "content": final_content,
            "context": enriched_context,
            "tool_calls": tool_results if tool_calls else [],
            "mode": mode,
        }
    })


@ai_gateway_bp.route('/gateway/tools', methods=['GET'])
@login_required
def list_tools():
    """列出所有可用工具"""
    return jsonify({
        "success": True,
        "data": {
            "tools": [
                {"name": t["name"], "description": t["description"], 
                 "parameters": t.get("parameters", {})}
                for t in TOOLS_REGISTRY.values()
            ]
        }
    })


@ai_gateway_bp.route('/gateway/tools/<tool_name>/execute', methods=['POST'])
@login_required
def execute_tool(tool_name):
    """直接执行指定工具"""
    if tool_name not in TOOLS_REGISTRY:
        return jsonify({"success": False, "error": f"工具 '{tool_name}' 不存在"}), 404
    data = request.get_json() or {}
    result = _execute_tool(tool_name, data.get("arguments", {}))
    return jsonify({"success": result["success"], "data": result["data"], "error": result.get("error")})
