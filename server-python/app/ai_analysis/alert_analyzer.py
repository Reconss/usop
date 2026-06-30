"""
告警自动分析 → 事件生成 (增强版)
1. 批量分析未处理告警 → LLM研判 → 高风险创建事件
2. 关闭已处理告警并添加 ai_analyzed 参数
3. 白名单匹配自动标记误报
"""
import json, logging
from datetime import datetime
from typing import List, Dict

logger = logging.getLogger(__name__)

def analyze_alert_batch(limit: int = 50) -> dict:
    """批量分析告警，高风险创建事件，告警标为已分析"""
    from app.timescaledb import get_tsdb
    from sqlalchemy import text
    from app.routes.ai_api import _deepseek_request

    tsdb = get_tsdb()
    sess = tsdb.get_session()

    try:
        rows = sess.execute(text("""
            SELECT id, alert_code, title, description, severity, src_ip, dst_ip,
                   category, first_seen, raw_log, source_type
            FROM alerts 
            WHERE status IS NULL OR status NOT IN ('ai_analyzed','closed','false_positive')
            ORDER BY first_seen DESC LIMIT :lim
        """), {"lim": limit}).fetchall()

        if not rows:
            return {"success": True, "analyzed": 0, "events_created": 0, "message": "无未分析的告警"}

        alerts = [dict(r._mapping) for r in rows]
        logger.info(f"找到 {len(alerts)} 条未处理告警")
        results = _analyze_with_llm(alerts)

        events_created = 0
        false_positives = 0

        logger.info(f"_analyze_with_llm 返回 {len(results)} 条结果")
        for item in results:
            alert_code = item.get("alert_code", "")
            analysis = item.get("analysis", {})
            is_fp = analysis.get("is_false_positive", False)
            is_attack = analysis.get("is_attack", False)
            priority = analysis.get("priority", "low")

            # 更新告警状态：误报 → false_positive, 已分析 → closed, 其他 → ai_analyzed
            if is_fp:
                sess.execute(text("""
                    UPDATE alerts SET status = 'false_positive',
                        extra_data = COALESCE(extra_data, '{}'::jsonb) || CAST(:extra AS jsonb)
                    WHERE alert_code = :code
                """), {"code": alert_code, "extra": json.dumps({
                    "ai_analyzed": True, "ai_analyzed_at": datetime.utcnow().isoformat(),
                    "ai_analysis": analysis, "ai_verdict": "false_positive"
                }, ensure_ascii=False)})
                false_positives += 1
            elif is_attack and priority in ("high", "critical"):
                # 高风险 → 创建事件 + 状态 closed
                try:
                    event_id = _create_event(alert_code, analysis)
                except Exception as e:
                    logger.error(f"创建事件失败: {alert_code} - {e}")
                    event_id = "" 
                sess.execute(text("""
                    UPDATE alerts SET status = 'closed',
                        event_ids = COALESCE(event_ids, '[]'::jsonb) || CAST(:eid_arr AS jsonb),
                        extra_data = COALESCE(extra_data, '{}'::jsonb) || CAST(:extra AS jsonb)
                    WHERE alert_code = :code
                """), {"code": alert_code, "eid_arr": json.dumps([event_id]), "extra": json.dumps({
                    "ai_analyzed": True, "ai_analyzed_at": datetime.utcnow().isoformat(),
                    "ai_analysis": analysis, "ai_verdict": "attack", "incident_id": event_id
                }, ensure_ascii=False)})
                events_created += 1
            else:
                # 低风险 → 标为已分析
                sess.execute(text("""
                    UPDATE alerts SET status = 'ai_analyzed',
                        extra_data = COALESCE(extra_data, '{}'::jsonb) || CAST(:extra AS jsonb)
                    WHERE alert_code = :code
                """), {"code": alert_code, "extra": json.dumps({
                    "ai_analyzed": True, "ai_analyzed_at": datetime.utcnow().isoformat(),
                    "ai_analysis": analysis
                }, ensure_ascii=False)})

        logger.info(f"准备提交 {len(results)} 条告警更新")
        sess.commit()
        logger.info(f"提交完成")
        return {
            "success": True, "analyzed": len(results),
            "events_created": events_created,
            "false_positives": false_positives,
            "message": f"分析 {len(results)} 条, 创建事件 {events_created} 个, 误报 {false_positives} 条"
        }
    except Exception as e:
        sess.rollback()
        logger.error(f"批量分析失败: {e}")
        return {"success": False, "error": str(e)}
    finally:
        tsdb.close_session(sess)


def _analyze_with_llm(alerts: List[dict]) -> List[dict]:
    """LLM分析每条告警"""
    from app.routes.ai_api import _deepseek_request

    summaries = []
    for a in alerts[:20]:
        summaries.append(f"[{a['severity']}] {a.get('alert_code','')}: {a.get('title','')} | "
                         f"src={a.get('src_ip','')} dst={a.get('dst_ip','')} | "
                         f"type={a.get('category','')}")

    prompt = """你是安全告警分析师。分析每条告警输出JSON (每行一条):
{"alert_code":"...","analysis":{"is_attack":true/false,"is_false_positive":true/false,
"priority":"critical/high/medium/low","category":"...","suggested_action":"...","reason":"..."}}

注意: 如果src_ip或dst_ip命中白名单则is_false_positive=true"""

    try:
        r = _deepseek_request(messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": "分析以下告警:\n" + "\n".join(summaries)}
        ], temperature=0.1, max_tokens=4096)
        content = r["choices"][0]["message"]["content"]
    except Exception as e:
        logger.error(f"LLM分析失败: {e}")
        return _rule_fallback(alerts)

    results = []
    for line in content.strip().split("\n"):
        line = line.strip()
        if line.startswith("{"):
            try:
                results.append(json.loads(line))
            except: pass

    # 兜底
    analyzed = {r.get("alert_code") for r in results}
    for a in alerts:
        if a["alert_code"] not in analyzed:
            sev = a.get("severity", "medium")
            results.append({"alert_code": a["alert_code"], "analysis": {
                "is_attack": sev in ("critical","high"),
                "is_false_positive": False,
                "priority": sev, "attack_type": a.get("attack_type","unknown"),
                "suggested_action": "block_ip" if sev in ("critical","high") else "review",
                "reason": f"自动分析: severity={sev}"
            }})
    return results


def _rule_fallback(alerts: List[dict]) -> List[dict]:
    """规则兜底"""
    results = []
    for a in alerts:
        sev = a.get("severity", "medium")
        atk = a.get("category", "")
        is_attack = sev in ("critical","high") and atk not in ("info","notice")
        results.append({"alert_code": a["alert_code"], "analysis": {
            "is_attack": is_attack, "is_false_positive": False,
            "priority": "high" if is_attack else "low",
            "category": atk or "unknown",
            "suggested_action": "block_ip" if is_attack else "review",
            "reason": f"规则分析: severity={sev}, type={atk}"
        }})
    return results


def _create_event(alert_code: str, analysis: dict) -> str:
    """创建安全事件"""
    from app.models import Event, db
    from app.routes.events_api import generate_event_code, create_action_record
    from app.timescaledb import get_tsdb
    from sqlalchemy import text

    tsdb = get_tsdb()
    sess = tsdb.get_session()
    alert = sess.execute(text("SELECT * FROM alerts WHERE alert_code = :code"),
                         {"code": alert_code}).fetchone()
    tsdb.close_session(sess)
    if not alert:
        return ""

    ad = dict(alert._mapping)
    ec = generate_event_code()
    event = Event(
        event_code=ec,
        title=f"[AI自动] {analysis.get('category','安全告警')} - {ad.get('src_ip','')}",
        description=f"AI自动分析\n分析: {analysis.get('reason','')}\n告警: {alert_code}\n"
                    f"{ad.get('src_ip','')} -> {ad.get('dst_ip','')}",
        severity=analysis.get('priority', 'medium'),
        category=analysis.get('category', '其他'),
        source='ai_auto_analysis', status='new',
        extra_data={'source_alert': alert_code, 'ai_analysis': analysis},
        raw_log=ad.get('raw_log', '')
    )
    from app.database import db
    db.session.add(event)
    db.session.flush()
    create_action_record(ec, 'created', None, 'AI自动',
                         f'AI 从告警 {alert_code} 创建事件',
                         previous_status='new',
                         extra_data=json.dumps({'source': 'ai_auto_analysis'}))
    db.session.commit()
    logger.info(f"创建事件: {ec} <- 告警 {alert_code}")
    return ec
