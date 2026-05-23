"""CrewAI 工具集 — 安全分析可调用工具"""
import json, os, logging
from typing import Type, Optional
from crewai.tools import BaseTool
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# ===== TimescaleDB 查询工具 =====
class TimescaleDBInput(BaseModel):
    query: str = Field(description="SQL SELECT 查询（仅允许 SELECT）")
    params: Optional[dict] = None

class TimescaleDBTool(BaseTool):
    name: str = "timescaledb_query"
    description: str = "查询 TimescaleDB 告警数据，支持按时间/IP/严重度筛选"
    args_schema: Type[BaseModel] = TimescaleDBInput

    def _run(self, query: str, params: Optional[dict] = None) -> str:
        if any(kw in query.upper() for kw in ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER"]):
            return json.dumps({"error": "Only SELECT queries allowed"})
        try:
            from app.timescaledb import get_tsdb
            from sqlalchemy import text
            tsdb = get_tsdb()
            sess = tsdb.get_session()
            rows = sess.execute(text(query), params or {}).fetchall()
            tsdb.close_session(sess)
            return json.dumps([dict(r._mapping) for r in rows], ensure_ascii=False, default=str)
        except Exception as e:
            return json.dumps({"error": str(e)})

# ===== 告警查询工具 =====
class QueryAlertsInput(BaseModel):
    severity: Optional[str] = Field(None, description="严重度: critical/high/medium/low")
    limit: int = Field(20, description="返回条数")
    hours: int = Field(24, description="最近N小时")

class QueryAlertsTool(BaseTool):
    name: str = "query_alerts"
    description: str = "查询最近的告警，可按严重度和时间范围筛选"
    args_schema: Type[BaseModel] = QueryAlertsInput

    def _run(self, severity: Optional[str] = None, limit: int = 20, hours: int = 24) -> str:
        try:
            from app.timescaledb import get_tsdb
            from sqlalchemy import text
            tsdb = get_tsdb()
            sess = tsdb.get_session()
            where = "WHERE alert_time > NOW() - INTERVAL ':h HOUR'"
            params = {"h": hours, "l": limit}
            if severity:
                where += " AND severity = :sev"
                params["sev"] = severity
            rows = sess.execute(text(f"""
                SELECT alert_code, title, severity, src_ip, dst_ip, attack_type,
                       description, first_seen, status, risk_score
                FROM alerts {where}
                ORDER BY first_seen DESC LIMIT :l
            """), params).fetchall()
            tsdb.close_session(sess)
            return json.dumps([dict(r._mapping) for r in rows], ensure_ascii=False, default=str)
        except Exception as e:
            return json.dumps({"error": str(e)})

# ===== 事件创建工具 =====
class CreateIncidentInput(BaseModel):
    title: str = Field(description="事件标题")
    severity: str = Field("high", description="严重度")
    alert_codes: list = Field(default_factory=list, description="关联的告警编号列表")
    description: str = Field("", description="事件描述")

class CreateIncidentTool(BaseTool):
    name: str = "create_incident"
    description: str = "创建安全事件，将告警升级为事件"
    args_schema: Type[BaseModel] = CreateIncidentInput

    def _run(self, title: str, severity: str = "high", alert_codes: list = None, description: str = "") -> str:
        try:
            from app.models import Event, db
            from app.routes.events_api import generate_event_code, create_action_record
            event_code = generate_event_code()
            event = Event(
                event_code=event_code, title=title, severity=severity,
                description=description or title,
                category="AI自动分析", source="ai_orchestrator",
                status="new", extra_data={"source_alerts": alert_codes or []}
            )
            db.session.add(event)
            db.session.flush()
            create_action_record(event_code, "created", None, "AI编排",
                                 f"LangGraph 自动创建事件", {"source": "ai_orchestrator"})
            db.session.commit()
            return json.dumps({"success": True, "event_code": event_code})
        except Exception as e:
            db.session.rollback()
            return json.dumps({"error": str(e)})
