"""
AI 能力 API 路由
暴露 AI 分析的 8 大能力:
1. 事件协查分析
2. 告警批量分析 & 自动生成事件
3. 技能注册与调用
4. 告警降噪与优先级分诊
5. 自动调查与攻击链
6. 智能响应
7. 自然语言查询
8. 反馈学习
"""
import json, logging
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from datetime import datetime

logger = logging.getLogger(__name__)
ai_capabilities_bp = Blueprint('ai_capabilities', __name__)


# ==================== 1. 事件协查分析 ====================
@ai_capabilities_bp.route('/copilot/analyze-event', methods=['POST'])
@login_required
def copilot_analyze_event():
    """AI 协查：分析安全事件"""
    data = request.get_json() or {}
    event_code = data.get('event_code', '')
    if not event_code:
        return jsonify({'success': False, 'error': '缺少 event_code'}), 400

    from app.ai_analysis.event_copilot import analyze_event
    result = analyze_event(event_code, provider_id=data.get('provider_id'))
    return jsonify(result)


# ==================== 2. 告警批量研判 & 事件生成 ====================
@ai_capabilities_bp.route('/alerts/analyze-batch', methods=['POST'])
@login_required
def alerts_analyze_batch():
    """批量结构化研判未闭环告警并自动闭环（与「告警监控」同一实现）"""
    data = request.get_json() or {}
    limit = int(data.get('limit', 50))
    from app.routes.ai_judgment import run_batch_judgment
    result = run_batch_judgment(limit=limit)
    return jsonify(result)


# ==================== 3. 技能注册与调用 ====================
@ai_capabilities_bp.route('/skills/list', methods=['GET'])
@login_required
def list_skills():
    """列出所有已注册技能"""
    from app.ai_analysis.skill_registry import get_skill_registry
    skills = get_skill_registry().list_skills()
    return jsonify({'success': True, 'data': {'skills': skills, 'total': len(skills)}})


@ai_capabilities_bp.route('/skills/execute', methods=['POST'])
@login_required
def execute_skill():
    """执行指定技能"""
    data = request.get_json() or {}
    skill_name = data.get('skill', '')
    arguments = data.get('arguments', {})
    if not skill_name:
        return jsonify({'success': False, 'error': '缺少 skill 名称'}), 400

    from app.ai_analysis.skill_registry import get_skill_registry
    result = get_skill_registry().execute(skill_name, arguments)
    return jsonify({'success': result.get('success', False), 'data': result})


@ai_capabilities_bp.route('/skills/agent-route', methods=['POST'])
@login_required
def agent_skill_route():
    """Agent 自然语言路由：指令 → 选择技能 → 执行"""
    data = request.get_json() or {}
    instruction = data.get('instruction', '')
    if not instruction:
        return jsonify({'success': False, 'error': '缺少指令'}), 400

    from app.ai_analysis.skill_registry import get_skill_registry
    from app.routes.ai_api import _deepseek_request
    import json as j

    registry = get_skill_registry()
    skills_desc = "\n".join([f"- {s['name']}: {s['description']}" for s in registry.list_skills()])

    system_prompt = f"""你是一个安全操作助手。用户会给出自然语言指令，请选择合适的技能并填充参数。
可用技能:
{skills_desc}

请输出 JSON:
{{"skill": "技能名", "arguments": {{"key": "value"}}, "reason": "选择理由"}}"""

    try:
        result = _deepseek_request(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": instruction}
            ],
            temperature=0.1,
            max_tokens=2048
        )
        content = result['choices'][0]['message']['content']
        j_start = content.find("{")
        j_end = content.rfind("}") + 1
        if j_start >= 0 and j_end > j_start:
            parsed = j.loads(content[j_start:j_end])
            skill_name = parsed.get("skill", "")
            arguments = parsed.get("arguments", {})
            if skill_name:
                exec_result = registry.execute(skill_name, arguments)
                return jsonify({
                    'success': True,
                    'data': {
                        'instruction': instruction,
                        'selected_skill': skill_name,
                        'arguments': arguments,
                        'result': exec_result,
                        'reason': parsed.get("reason", "")
                    }
                })
        return jsonify({'success': False, 'error': '无法识别指令'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== 4. 告警降噪与优先级分诊 ====================
@ai_capabilities_bp.route('/alerts/triage', methods=['POST'])
@login_required
def alerts_triage():
    """批量评估告警：误报判断 + 优先级分诊"""
    data = request.get_json() or {}
    alerts = data.get('alerts', [])
    if not alerts:
        return jsonify({'success': False, 'error': '请提供告警列表'}), 400

    from app.routes.ai_api import _deepseek_request

    summaries = []
    for i, a in enumerate(alerts[:50]):
        summaries.append(
            f"{i+1}. [{a.get('severity','?')}] {a.get('alert_code','')} | "
            f"src={a.get('src_ip','')} dst={a.get('dst_ip','')} | "
            f"type={a.get('attack_type',a.get('category',''))} | "
            f"time={a.get('first_seen','')}"
        )

    system_prompt = """你是安全告警分诊专家。请分析以下告警，每行输出JSON:
{"index":N,"is_false_positive":true/false,"priority":"high/medium/low",
"suggested_action":"block_ip/isolate/review/ignore","reason":"..."}"""

    try:
        result = _deepseek_request(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": "请分诊以下告警:\n" + "\n".join(summaries)}
            ],
            temperature=0.1,
            max_tokens=4096
        )
        content = result['choices'][0]['message']['content']
        
        triage_results = []
        for line in content.strip().split("\n"):
            line = line.strip()
            if line.startswith("{"):
                try:
                    triage_results.append(json.loads(line))
                except:
                    pass

        return jsonify({
            'success': True,
            'data': {'triage_results': triage_results, 'total': len(triage_results)}
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== 5. 自动调查与攻击链 ====================
@ai_capabilities_bp.route('/investigate/event', methods=['POST'])
@login_required
def investigate_event():
    """自动调查事件，生成攻击时间线和 MITRE ATT&CK 映射"""
    data = request.get_json() or {}
    event_code = data.get('event_code', '')
    if not event_code:
        return jsonify({'success': False, 'error': '缺少 event_code'}), 400

    from app.ai_analysis.event_copilot import analyze_event
    result = analyze_event(event_code)
    if not result.get('success'):
        return jsonify(result)

    analysis = result.get('data', {}).get('analysis', {})
    return jsonify({
        'success': True,
        'data': {
            'timeline': analysis.get('attack_chain', []),
            'mitre_mapping': [
                {'technique': s.get('mitre_technique', ''), 'step': s.get('step'), 'action': s.get('action')}
                for s in analysis.get('attack_chain', [])
            ],
            'affected_assets': analysis.get('affected_assets', []),
            'summary': analysis.get('summary', ''),
            'confidence': analysis.get('confidence', 0)
        }
    })


# ==================== 6. 智能响应 ====================
@ai_capabilities_bp.route('/respond/auto', methods=['POST'])
@login_required
def auto_respond():
    """根据事件风险自动决定处置动作"""
    data = request.get_json() or {}
    event_code = data.get('event_code', '')
    if not event_code:
        return jsonify({'success': False, 'error': '缺少 event_code'}), 400

    from app.ai_analysis.event_copilot import analyze_event
    result = analyze_event(event_code)
    if not result.get('success'):
        return jsonify(result)

    analysis = result.get('data', {}).get('analysis', {})
    risk_level = analysis.get('risk_level', 'medium')
    actions = analysis.get('recommended_actions', [])

    # 高置信度、高风险时自动执行
    auto_execute = risk_level in ('critical', 'high') and analysis.get('confidence', 0) > 80

    return jsonify({
        'success': True,
        'data': {
            'risk_level': risk_level,
            'confidence': analysis.get('confidence', 0),
            'decisions': [
                {
                    'action': a.get('action'),
                    'target': a.get('target'),
                    'reason': a.get('reason'),
                    'auto_execute': auto_execute,
                    'status': 'auto_executed' if auto_execute else 'pending_approval'
                }
                for a in actions
            ]
        }
    })


# ==================== 7. 自然语言查询 ====================
@ai_capabilities_bp.route('/nl/query', methods=['POST'])
@login_required
def natural_language_query():
    """自然语言安全查询"""
    data = request.get_json() or {}
    query = data.get('query', '')
    if not query:
        return jsonify({'success': False, 'error': '缺少查询内容'}), 400

    from app.routes.ai_api import _deepseek_request
    from app.ai_analysis.skill_registry import get_skill_registry
    import re

    # 1. 意图识别
    intent_prompt = """识别以下安全查询的意图，只输出JSON:
{"intent":"query_alerts/query_ip/query_event/analyze/other","params":{"key":"value"},"confidence":0-100}
示例:
- "过去24小时的高危告警" → {"intent":"query_alerts","params":{"time":"24h","severity":"high"}}
- "查询IP 8.8.8.8" → {"intent":"query_ip","params":{"ip":"8.8.8.8"}}
- "帮我分析事件EVT-001" → {"intent":"analyze","params":{"event_code":"EVT-001"}}"""

    try:
        intent_result = _deepseek_request(
            messages=[
                {"role": "system", "content": intent_prompt},
                {"role": "user", "content": query}
            ],
            temperature=0.1,
            max_tokens=1024
        )
        intent_text = intent_result['choices'][0]['message']['content']
        j_start = intent_text.find("{")
        j_end = intent_text.rfind("}") + 1
        intent = {}
        if j_start >= 0:
            intent = json.loads(intent_text[j_start:j_end])
    except Exception as e:
        intent = {"intent": "query_alerts", "params": {}, "confidence": 30}

    # 2. 执行查询
    intent_type = intent.get("intent", "query_alerts")
    params = intent.get("params", {})
    query_result = {}

    if intent_type == "query_alerts":
        from app.utils import es_alerts
        from datetime import datetime, timedelta
        kwargs = {}
        if "24h" in str(params):
            kwargs['start'] = (datetime.utcnow() - timedelta(hours=24)).isoformat() + 'Z'
        severity = params.get("severity", "")
        if severity:
            kwargs['filters'] = {'severity': severity}
        res = es_alerts.search_alerts(page_size=20, **kwargs)
        query_result = {"alerts": [{
            'alert_code': it.get('alert_code') or it.get('alert_id', ''),
            'title': it.get('title', ''),
            'severity': it.get('severity', ''),
            'src_ip': it.get('src_ip', ''),
            'dst_ip': it.get('dst_ip', ''),
            'attack_type': it.get('category', ''),
            'first_seen': it.get('first_seen', ''),
        } for it in res.get('items', [])]}

    elif intent_type == "query_ip":
        ip = params.get("ip", "")
        from app.utils import es_alerts
        res = es_alerts.search_alerts(query_string=f'"{ip}"', page_size=20)
        query_result = {"ip": ip, "alerts": [{
            'alert_code': it.get('alert_code') or it.get('alert_id', ''),
            'title': it.get('title', ''),
            'severity': it.get('severity', ''),
            'attack_type': it.get('category', ''),
            'first_seen': it.get('first_seen', ''),
        } for it in res.get('items', [])]}

    elif intent_type == "analyze" and params.get("event_code"):
        from app.ai_analysis.event_copilot import analyze_event
        ar = analyze_event(params["event_code"])
        query_result = ar.get("data", {})

    # 3. 自然语言回复
    reply_prompt = f"""用户查询: {query}
查询意图: {intent_type}
查询结果: {json.dumps(query_result, ensure_ascii=False, default=str)[:2000]}

请用自然语言回复用户，简介清晰。"""

    try:
        reply_result = _deepseek_request(
            messages=[
                {"role": "system", "content": "你是一个安全助手，用中文回答安全问题。"},
                {"role": "user", "content": reply_prompt}
            ],
            temperature=0.3,
            max_tokens=2048
        )
        reply = reply_result['choices'][0]['message']['content']
    except:
        reply = f"查询完成，共找到 {len(query_result.get('alerts', []))} 条结果"

    return jsonify({
        'success': True,
        'data': {
            'query': query,
            'intent': intent_type,
            'result': query_result,
            'reply': reply
        }
    })


# ==================== 8. 知识沉淀与反馈 ====================
@ai_capabilities_bp.route('/feedback/record', methods=['POST'])
@login_required
def record_feedback():
    """记录 AI 分析反馈"""
    data = request.get_json() or {}
    event_id = data.get('event_id', '')
    ai_decision = data.get('ai_decision', {})
    human_correction = data.get('human_correction', {})
    is_accepted = data.get('is_accepted', True)

    from app.database import db
    from sqlalchemy import text

    try:
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS ai_feedback (
                id SERIAL PRIMARY KEY,
                event_id VARCHAR(50),
                ai_decision JSONB,
                human_correction JSONB,
                is_accepted BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """))
        db.session.execute(text("""
            INSERT INTO ai_feedback (event_id, ai_decision, human_correction, is_accepted)
            VALUES (:event_id, :ai_dec, :human_corr, :accepted)
        """), {
            "event_id": event_id,
            "ai_dec": json.dumps(ai_decision, ensure_ascii=False),
            "human_corr": json.dumps(human_correction, ensure_ascii=False),
            "accepted": is_accepted
        })
        db.session.commit()
        return jsonify({'success': True, 'message': '反馈已记录'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@ai_capabilities_bp.route('/feedback/stats', methods=['GET'])
@login_required
def feedback_stats():
    """获取反馈统计（PG ai_feedback 表）"""
    from app.database import db
    from sqlalchemy import text
    try:
        row = db.session.execute(text("""
            SELECT COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE is_accepted) AS accepted,
                   COUNT(*) FILTER (WHERE NOT is_accepted) AS rejected
            FROM ai_feedback
        """)).fetchone()
        total = row.total or 0
        accepted = row.accepted or 0
        return jsonify({
            "success": True,
            "data": {
                "total": total,
                "accepted": accepted,
                "rejected": row.rejected or 0,
                "acceptance_rate": round(accepted / total, 4) if total else 0
            }
        })
    except Exception:
        return jsonify({
            "success": True,
            "data": {"total": 0, "accepted": 0, "rejected": 0, "acceptance_rate": 0}
        })


