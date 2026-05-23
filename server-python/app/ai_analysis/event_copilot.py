"""
事件协查分析 (增强版)
分析安全事件 → 关联告警 → 研判分析 → 处置意见
"""
import json, logging
from typing import Dict, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

def analyze_event(event_code: str, provider_id: str = None) -> dict:
    """分析安全事件：关联告警、研判、处置建议"""
    from app.models import Event
    from app.routes.ai_api import _deepseek_request
    from app.timescaledb import get_tsdb
    from sqlalchemy import text

    # 获取事件
    event = Event.query.filter_by(event_code=event_code).first()
    if not event and event_code.isdigit():
        event = Event.query.get(int(event_code))
    if not event:
        return {"success": False, "error": "事件不存在"}

    ed = event.to_dict()
    extra = ed.get("extra_data", {})
    if isinstance(extra, str):
        try: extra = json.loads(extra)
        except: extra = {}
    related_alert_codes = extra.get("source_alerts", extra.get("related_alerts", []))

    # 获取关联告警详情
    alert_details = []
    if related_alert_codes:
        tsdb = get_tsdb()
        sess = tsdb.get_session()
        for code in related_alert_codes[:10]:
            row = sess.execute(text(
                "SELECT alert_code, title, severity, src_ip, dst_ip, attack_type, description, first_seen, status, risk_score FROM alerts WHERE alert_code = :code"
            ), {"code": code}).fetchone()
            if row:
                alert_details.append(dict(row._mapping))
        tsdb.close_session(sess)

    # 构建分析上下文
    context = {
        "event_code": event_code,
        "title": ed.get("title", ""),
        "severity": ed.get("severity", "medium"),
        "status": ed.get("status", "new"),
        "description": ed.get("description", ""),
        "category": ed.get("category", ""),
        "related_alerts": alert_details,
        "created_at": str(ed.get("created_at", "")),
        "source": ed.get("source", ""),
    }

    alert_summary = "\n".join([
        f"- [{a.get('severity','')}] {a.get('alert_code','')}: {a.get('title','')} "
        f"src={a.get('src_ip','')} dst={a.get('dst_ip','')} type={a.get('attack_type','')}"
        for a in alert_details
    ]) or "无关联告警"

    system_prompt = """你是一个安全事件响应专家。分析安全事件及其关联告警，输出JSON格式：
{
    "event_assessment": "事件总体评价",
    "attack_type": "攻击类型判断",
    "severity_assessment": "严重度重新评估",
    "affected_assets": ["受影响资产"],
    "attack_chain": "攻击链分析",
    "recommended_actions": ["处置建议1", "处置建议2"],
    "investigation_direction": "后续调查方向建议"
}"""

    user_msg = f"""事件编号: {event_code}
标题: {context['title']}
严重度: {context['severity']}
描述: {context['description']}
分类: {context['category']}

关联告警:
{alert_summary}

请综合分析并给出研判结论和处置建议。"""

    try:
        result = _deepseek_request(messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_msg}
        ], temperature=0.3, response_format={"type": "json_object"})
        analysis = json.loads(result["choices"][0]["message"]["content"])

        # 更新事件 extra_data
        ed["extra_data"] = extra
        ed["extra_data"]["ai_analysis"] = {
            **analysis,
            "analyzed_at": datetime.utcnow().isoformat(),
            "provider": provider_id or "deepseek"
        }
        event.extra_data = ed["extra_data"]
        from app.database import db
        db.session.commit()

        return {"success": True, "data": {
            "event_code": event_code,
            "analysis": analysis,
            "related_alerts": alert_details,
            "analyzed_at": datetime.utcnow().isoformat()
        }}
    except Exception as e:
        logger.error(f"事件分析失败: {e}")
        return {"success": False, "error": str(e)}
