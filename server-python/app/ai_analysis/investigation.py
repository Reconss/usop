"""
攻击溯源分析 (增强版)
根据事件/告警信息溯源分析：关联资产、攻击源、受害目标、攻击手法
"""
import json, logging
from typing import Dict, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

def investigate(event_code: str) -> dict:
    """溯源分析安全事件"""
    from app.models import Event
    from app.routes.ai_api import _deepseek_request
    from app.timescaledb import get_tsdb
    from sqlalchemy import text

    # 获取事件
    event = Event.query.filter_by(event_code=event_code).first()
    if not event:
        return {"success": False, "error": "事件不存在"}

    ed = event.to_dict()
    extra = ed.get("extra_data", {})
    if isinstance(extra, str):
        try: extra = json.loads(extra)
        except: extra = {}

    # 获取关联告警 + 同一源IP的历史告警
    alert_codes = extra.get("source_alerts", extra.get("related_alerts", []))
    tsdb = get_tsdb()
    sess = tsdb.get_session()

    related_alerts = []
    src_ips = set()
    dst_ips = set()

    for code in alert_codes[:10]:
        row = sess.execute(text(
            "SELECT alert_code, title, severity, src_ip, dst_ip, attack_type, description, first_seen, status, risk_score FROM alerts WHERE alert_code = :code"
        ), {"code": code}).fetchone()
        if row:
            ad = dict(row._mapping)
            related_alerts.append(ad)
            if ad.get("src_ip"): src_ips.add(ad["src_ip"])
            if ad.get("dst_ip"): dst_ips.add(ad["dst_ip"])

    # 查询同一源IP的历史告警
    history = []
    for sip in list(src_ips)[:3]:
        rows = sess.execute(text(
            "SELECT alert_code, title, severity, attack_type, first_seen FROM alerts WHERE src_ip = :ip AND alert_time > NOW() - INTERVAL '7 days' ORDER BY first_seen DESC LIMIT 10"
        ), {"ip": sip}).fetchall()
        for r in rows:
            history.append(dict(r._mapping))

    # 查询资产信息
    assets = []
    for ip in list(src_ips | dst_ips)[:5]:
        row = sess.execute(text(
            "SELECT ip, hostname, os, service, is_important FROM assets WHERE ip = :ip"
        ), {"ip": ip}).fetchone()
        if row:
            assets.append(dict(row._mapping))

    tsdb.close_session(sess)

    # 构建分析上下文
    alert_summary = "\n".join([
        f"- [{a['severity']}] {a['alert_code']} {a.get('title','')} src={a.get('src_ip','')} dst={a.get('dst_ip','')} {a.get('attack_type','')} {a.get('first_seen','')}"
        for a in related_alerts
    ]) or "无关联告警"

    history_summary = "\n".join([
        f"- [{h['severity']}] {h['alert_code']} {h.get('title','')} {h.get('attack_type','')} {h.get('first_seen','')}"
        for h in history[:10]
    ]) or "无历史记录"

    asset_summary = "\n".join([
        f"- {a.get('ip','')} ({a.get('hostname','')}) os={a.get('os','')} service={a.get('service','')}"
        for a in assets
    ]) or "无资产信息"

    system_prompt = """你是一个攻击溯源专家。根据事件信息、关联告警、资产信息和历史记录，生成MITRE ATT&CK攻击链分析。
输出JSON格式:
{
    "summary": "总体溯源结论",
    "attack_source": {"ip": "攻击源IP", "analysis": "分析"},
    "victim": {"ip": "受害IP", "analysis": "分析"},
    "attack_chain": [{"step": 1, "action": "初始访问", "technique": "T1566", "detail": "详情"}],
    "mitre_mapping": [{"tactic": "初始访问", "technique_id": "T1566", "technique_name": "网络钓鱼"}],
    "timeline": [{"time": "2024-01-01T00:00", "event": "事件描述"}],
    "recommendations": ["建议1", "建议2"]
}"""

    user_msg = f"""事件: {event_code} ({ed.get('title','')})
严重度: {ed.get('severity','')}

关联告警:
{alert_summary}

历史活动:
{history_summary}

资产信息:
{asset_summary}

请进行完整的攻击溯源分析。"""

    try:
        result = _deepseek_request(messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_msg}
        ], temperature=0.3, response_format={"type": "json_object"})
        analysis = json.loads(result["choices"][0]["message"]["content"])
        return {"success": True, "data": analysis}
    except Exception as e:
        logger.error(f"溯源分析失败: {e}")
        return {"success": False, "error": str(e)}
