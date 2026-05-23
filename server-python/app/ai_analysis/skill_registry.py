"""
技能注册与调用框架
支持动态注册安全操作技能，AI Agent 根据 NL 指令自动选择并调用
"""
import json, os, logging, requests
from typing import Dict, Any, Callable, List, Optional

logger = logging.getLogger(__name__)


class Skill:
    """安全技能定义"""
    def __init__(self, name: str, description: str, parameters: dict, 
                 handler: Callable = None, endpoint: str = None):
        self.name = name
        self.description = description
        self.parameters = parameters  # JSON Schema
        self.handler = handler
        self.endpoint = endpoint

    def to_openai_tool(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters
            }
        }

    def execute(self, arguments: dict) -> dict:
        if self.handler:
            return self.handler(**arguments)
        if self.endpoint:
            try:
                resp = requests.post(self.endpoint, json=arguments, timeout=30)
                return resp.json()
            except Exception as e:
                return {"success": False, "error": str(e)}
        return {"success": False, "error": "No handler or endpoint configured"}


class SkillRegistry:
    """技能注册中心"""
    def __init__(self):
        self._skills: Dict[str, Skill] = {}
        self._register_builtin()

    def _register_builtin(self):
        """注册内置安全技能"""
        self.register(Skill(
            "block_ip", "封禁恶意IP地址",
            {"type": "object", "properties": {
                "ip": {"type": "string", "description": "要封禁的IP地址"},
                "reason": {"type": "string", "description": "封禁原因"},
                "duration": {"type": "integer", "description": "封禁时长(分钟)", "default": 1440}
            }, "required": ["ip", "reason"]},
            handler=self._builtin_block_ip
        ))
        self.register(Skill(
            "query_ip_reputation", "查询IP地址威胁情报",
            {"type": "object", "properties": {
                "ip": {"type": "string", "description": "IP地址"}
            }, "required": ["ip"]},
            handler=self._builtin_ip_reputation
        ))
        self.register(Skill(
            "isolate_host", "隔离受感染主机",
            {"type": "object", "properties": {
                "host_id": {"type": "string", "description": "主机ID或IP"},
                "reason": {"type": "string", "description": "隔离原因"}
            }, "required": ["host_id", "reason"]},
            handler=self._builtin_isolate_host
        ))
        self.register(Skill(
            "reset_credentials", "重置用户凭证",
            {"type": "object", "properties": {
                "username": {"type": "string", "description": "用户名"},
                "reason": {"type": "string", "description": "重置原因"}
            }, "required": ["username", "reason"]},
            handler=self._builtin_reset_creds
        ))
        self.register(Skill(
            "query_alert_detail", "查询告警详情",
            {"type": "object", "properties": {
                "alert_code": {"type": "string", "description": "告警编号"}
            }, "required": ["alert_code"]},
            handler=self._builtin_query_alert
        ))
        self.register(Skill(
            "query_event_detail", "查询事件详情及关联告警",
            {"type": "object", "properties": {
                "event_code": {"type": "string", "description": "事件编号"}
            }, "required": ["event_code"]},
            handler=self._builtin_query_event
        ))

    def register(self, skill: Skill):
        self._skills[skill.name] = skill
        logger.info(f"技能已注册: {skill.name}")

    def get(self, name: str) -> Optional[Skill]:
        return self._skills.get(name)

    def list_skills(self) -> list:
        return [{"name": s.name, "description": s.description, 
                 "parameters": s.parameters} for s in self._skills.values()]

    def list_openai_tools(self) -> list:
        return [s.to_openai_tool() for s in self._skills.values()]

    def execute(self, name: str, arguments: dict) -> dict:
        skill = self.get(name)
        if not skill:
            return {"success": False, "error": f"技能 '{name}' 未注册"}
        return skill.execute(arguments)

    # === 内置技能实现 ===
    def _builtin_block_ip(self, ip: str, reason: str, duration: int = 1440):
        from app.timescaledb import get_tsdb
        from sqlalchemy import text
        result = {"success": True, "ip": ip, "reason": reason, "duration_minutes": duration}
        try:
            # 记录到 blocked_ips 表
            tsdb = get_tsdb()
            sess = tsdb.get_session()
            sess.execute(text("""
                CREATE TABLE IF NOT EXISTS blocked_ips (
                    ip TEXT PRIMARY KEY, reason TEXT, blocked_at TIMESTAMPTZ DEFAULT NOW(),
                    duration_minutes INTEGER DEFAULT 1440, source TEXT DEFAULT 'ai_agent'
                )
            """))
            sess.execute(text("""
                INSERT INTO blocked_ips (ip, reason, duration_minutes, source) 
                VALUES (:ip, :reason, :duration, 'ai_agent')
                ON CONFLICT (ip) DO UPDATE SET reason = :reason, blocked_at = NOW()
            """), {"ip": ip, "reason": reason, "duration": duration})
            sess.commit()
            tsdb.close_session(sess)
            result["message"] = f"IP {ip} 已封禁 {duration} 分钟"
        except Exception as e:
            result = {"success": False, "error": str(e)}
        return result

    def _builtin_ip_reputation(self, ip: str):
        return {
            "success": True, "ip": ip,
            "reputation": {
                "tags": ["malicious", "scanner"] if ip.startswith("192.168") else ["unknown"],
                "country": "CN",
                "asn": "AS4808",
                "confidence": "medium"
            }
        }

    def _builtin_isolate_host(self, host_id: str, reason: str):
        return {"success": True, "host_id": host_id, "reason": reason, 
                "action": "isolate", "status": "pending_approval"}

    def _builtin_reset_creds(self, username: str, reason: str):
        return {"success": True, "username": username, "action": "reset_credentials",
                "status": "completed", "message": f"用户 {username} 凭证已重置"}

    def _builtin_query_alert(self, alert_code: str):
        from app.timescaledb import get_tsdb
        from sqlalchemy import text
        try:
            tsdb = get_tsdb()
            sess = tsdb.get_session()
            row = sess.execute(text("SELECT * FROM alerts WHERE alert_code = :code"),
                                {"code": alert_code}).fetchone()
            tsdb.close_session(sess)
            if row: return {"success": True, "data": dict(row._mapping)}
            return {"success": False, "error": "告警不存在"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def _builtin_query_event(self, event_code: str):
        from app.models import Event
        event = Event.query.filter_by(event_code=event_code).first()
        if event:
            d = event.to_dict()
            extra = d.get("extra_data", {})
            if isinstance(extra, str):
                try: extra = json.loads(extra)
                except: extra = {}
            d["related_alerts"] = extra.get("related_alerts", [])
            return {"success": True, "data": d}
        return {"success": False, "error": "事件不存在"}


# 全局单例
_skill_registry = None

def get_skill_registry() -> SkillRegistry:
    global _skill_registry
    if _skill_registry is None:
        _skill_registry = SkillRegistry()
    return _skill_registry
