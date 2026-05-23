"""CrewAI 工具集 — 覆盖所有安全分析场景"""
import json, logging
from typing import Type, Optional
from crewai.tools import BaseTool
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# ===== 1. TimescaleDB 通用查询 =====
class TimescaleDBInput(BaseModel):
    query: str = Field(description="SQL SELECT 查询")
    params: Optional[dict] = None

class TimescaleDBTool(BaseTool):
    name: str = "timescaledb_query"
    description: str = "查询 TimescaleDB 告警/事件数据"
    args_schema: Type[BaseModel] = TimescaleDBInput
    def _run(self, query: str, params: Optional[dict] = None) -> str:
        if any(kw in query.upper() for kw in ["INSERT","UPDATE","DELETE","DROP","ALTER"]):
            return json.dumps({"error": "仅允许 SELECT"})
        try:
            from app.timescaledb import get_tsdb; from sqlalchemy import text
            tsdb=get_tsdb(); sess=tsdb.get_session()
            rows=sess.execute(text(query),params or {}).fetchall()
            tsdb.close_session(sess)
            return json.dumps([dict(r._mapping) for r in rows], ensure_ascii=False, default=str)
        except Exception as e: return json.dumps({"error":str(e)})

# ===== 2. 告警查询 =====
class QueryAlertsInput(BaseModel):
    severity: Optional[str] = Field(None, description="critical/high/medium/low")
    hours: int = Field(24, description="最近N小时")
    src_ip: Optional[str] = Field(None, description="源IP")
    limit: int = Field(20, description="返回条数")

class QueryAlertsTool(BaseTool):
    name: str = "query_alerts"
    description: str = "查询告警，可按严重度/IP/时间范围筛选"
    args_schema: Type[BaseModel] = QueryAlertsInput
    def _run(self, severity=None, hours=24, src_ip=None, limit=20) -> str:
        try:
            from app.timescaledb import get_tsdb; from sqlalchemy import text
            tsdb=get_tsdb(); sess=tsdb.get_session()
            where=["alert_time > NOW() - INTERVAL ':h HOUR'"]; p={"h":hours,"l":limit}
            if severity: where.append("severity=:sev"); p["sev"]=severity
            if src_ip: where.append("(src_ip=:ip OR dst_ip=:ip)"); p["ip"]=src_ip
            rows=sess.execute(text(f"SELECT alert_code,title,severity,src_ip,dst_ip,attack_type,description,first_seen,status,risk_score FROM alerts WHERE {' AND '.join(where)} ORDER BY first_seen DESC LIMIT :l"),p).fetchall()
            tsdb.close_session(sess)
            return json.dumps([dict(r._mapping) for r in rows], ensure_ascii=False, default=str)
        except Exception as e: return json.dumps({"error":str(e)})

# ===== 3. 创建事件 =====
class CreateIncidentInput(BaseModel):
    title: str = Field(description="事件标题"); severity: str = Field("high")
    alert_codes: list = Field(default_factory=list); description: str = Field("")

class CreateIncidentTool(BaseTool):
    name: str = "create_incident"
    description: str = "将高风险告警创建为安全事件"
    args_schema: Type[BaseModel] = CreateIncidentInput
    def _run(self, title, severity="high", alert_codes=None, description="") -> str:
        try:
            from app.models import Event, db; from app.routes.events_api import generate_event_code,create_action_record
            ec=generate_event_code()
            e=Event(event_code=ec,title=title,severity=severity,description=description or title,category="AI自动",source="ai_orchestrator",status="new",extra_data={"source_alerts":alert_codes or []})
            db.session.add(e); db.session.flush()
            create_action_record(ec,"created",None,"AI编排","AI 自动创建事件",{"source":"ai_orchestrator"})
            db.session.commit(); return json.dumps({"success":True,"event_code":ec})
        except Exception as e: db.session.rollback(); return json.dumps({"error":str(e)})

# ===== 4. 自然语言查询 → SQL =====
class NLQueryInput(BaseModel):
    query: str = Field(description="自然语言查询描述")

class NLQueryTool(BaseTool):
    name: str = "nl_query"
    description: str = "将自然语言转为SQL查询告警数据"
    args_schema: Type[BaseModel] = NLQueryInput
    def _run(self, query: str) -> str:
        try:
            from app.routes.ai_api import _deepseek_request
            r=_deepseek_request(messages=[{"role":"system","content":"将用户查询转为SQL。表: alerts(alert_code,title,severity,src_ip,dst_ip,attack_type,description,first_seen,status,risk_score)。只输出SQL。"},{"role":"user","content":query}],temperature=0.1)
            sql=r.get("choices",[{}])[0].get("message",{}).get("content","").replace("```sql","").replace("```","").strip()
            from app.timescaledb import get_tsdb; from sqlalchemy import text
            tsdb=get_tsdb(); sess=tsdb.get_session()
            rows=sess.execute(text(sql)).fetchall(); tsdb.close_session(sess)
            return json.dumps([dict(r._mapping) for r in rows], ensure_ascii=False, default=str)
        except Exception as e: return json.dumps({"error":str(e)})

# ===== 5. 技能执行 =====
class SkillExecuteInput(BaseModel):
    instruction: str = Field(description="自然语言操作指令")

class SkillExecuteTool(BaseTool):
    name: str = "skill_execute"
    description: str = "根据NL指令匹配并执行已注册安全技能"
    args_schema: Type[BaseModel] = SkillExecuteInput
    def _run(self, instruction: str) -> str:
        try:
            from app.routes.ai_capabilities import execute_skill_by_name
            from app.ai_analysis.skill_registry import get_skill_registry
            reg=get_skill_registry(); skills=reg.list_skills()
            from app.routes.ai_api import _deepseek_request
            import json as j
            desc="\n".join([f"- {s['name']}: {s['description']}" for s in skills])
            r=_deepseek_request(messages=[{"role":"system","content":f"选择技能并填参数。可用: {desc}\n输出JSON: {{\"skill\":\"...\",\"arguments\":{{}}}}"},{"role":"user","content":instruction}],temperature=0.1)
            result=r.get("choices",[{}])[0].get("message",{}).get("content","")
            try: parsed=j.loads(result); return j.dumps({"selected_skill":parsed.get("skill"),"result":reg.execute(parsed.get("skill",""),parsed.get("arguments",{}))})
            except: return j.dumps({"result":result})
        except Exception as e: return json.dumps({"error":str(e)})

# ===== 6. MITRE ATT&CK =====
class MITREInput(BaseModel):
    technique_id: Optional[str] = Field(None, description="MITRE 技术ID如 T1566")
    description: str = Field("", description="攻击行为描述")

class MITRETool(BaseTool):
    name: str = "mitre_attack"
    description: str = "查询MITRE ATT&CK技术映射"
    args_schema: Type[BaseModel] = MITREInput
    def _run(self, technique_id=None, description="") -> str:
        import json
        techniques={"T1566":"Phishing","T1059":"Command and Scripting Interpreter","T1485":"Data Destruction","T1071":"Application Layer Protocol","T1046":"Network Service Scanning"}
        if technique_id and technique_id in techniques:
            return json.dumps({"technique_id":technique_id,"name":techniques[technique_id],"tactic":"根据技术ID获取"})
        return json.dumps({"matched":[],"note":"需要具体技术ID或详细攻击描述"})

# ===== 7. 事件协查分析 =====
class EventAnalysisInput(BaseModel):
    event_code: str = Field(description="事件编号")

class EventAnalysisTool(BaseTool):
    name: str = "event_analysis"
    description: str = "分析安全事件，获取关联告警、资产、攻击信息"
    args_schema: Type[BaseModel] = EventAnalysisInput
    def _run(self, event_code: str) -> str:
        try:
            from app.ai_analysis.event_copilot import analyze_event
            result=analyze_event(event_code)
            return json.dumps(result, ensure_ascii=False, default=str)
        except Exception as e: return json.dumps({"error":str(e)})
