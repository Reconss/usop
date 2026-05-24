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

        # === 内置技能实现（API 优先 + Mock 兜底） ===
    import os as _os
    
    # ===== 通用接口配置（从 .env 读取） =====
    FIREWALL_API = _os.getenv('FIREWALL_API', '')
    FIREWALL_TOKEN = _os.getenv('FIREWALL_TOKEN', '')
    EDR_API = _os.getenv('EDR_API', '')
    EDR_TOKEN = _os.getenv('EDR_TOKEN', '')
    THREAT_INTEL_API = _os.getenv('THREAT_INTEL_API', '')
    THREAT_INTEL_KEY = _os.getenv('THREAT_INTEL_KEY', '')

    def _call_api(self, url, method='POST', headers=None, json_data=None, timeout=10):
        if not url:
            return None
        try:
            import requests as _req
            if method.upper() == 'GET':
                resp = _req.get(url, headers=headers or {}, timeout=timeout)
            else:
                resp = _req.post(url, headers=headers or {}, json=json_data or {}, timeout=timeout)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            logger.warning(f"API调用失败({url}): {e}")
            return None

    def _builtin_block_ip(self, ip, reason, duration=1440):
        if self.FIREWALL_API:
            r = self._call_api(self.FIREWALL_API+'/block-address', json_data={
                "ip": ip, "reason": reason, "ttl": duration*60
            }, headers={"Authorization": f"Bearer {self.FIREWALL_TOKEN}"})
            if r:
                return {"success": True, "ip": ip, "message": f"IP {ip} 已通过防火墙封禁 {duration} 分钟", "source": "firewall_api"}
        return {"success": True, "ip": ip, "reason": reason, "duration_minutes": duration,
                "message": f"[测试] IP {ip} 封禁指令已记录({duration}分钟)。配置 FIREWALL_API 可对接真实防火墙。", "source": "mock"}

    def _builtin_ip_reputation(self, ip):
        if self.THREAT_INTEL_API:
            r = self._call_api(self.THREAT_INTEL_API+'/query', json_data={"indicator": ip},
                               headers={"Authorization": f"Bearer {self.THREAT_INTEL_KEY}"})
            if r:
                return {"success": True, "ip": ip, "reputation": r, "source": "threat_intel_api"}
        mock_db = {
            "8.8.8.8": {"tags":["dns","public_dns"],"country":"US","asn":"AS15169","confidence":"high","org":"Google"},
            "1.1.1.1": {"tags":["dns","public_dns"],"country":"AU","asn":"AS13335","confidence":"high","org":"Cloudflare"},
            "114.114.114.114": {"tags":["dns"],"country":"CN","asn":"AS4849","confidence":"high","org":"中国电信"},
        }
        if ip in mock_db:
            rep = mock_db[ip]
        elif ip.startswith(('10.','172.','192.')):
            rep = {"tags":["internal","private"],"country":"N/A","asn":"N/A","confidence":"low","org":"内网地址"}
        elif ip.startswith(('1.','2.','3.','4.','5.')):
            rep = {"tags":["public","internet"],"country":"US","asn":f"AS{abs(hash(ip))%10000+10000}","confidence":"medium","org":"ISP"}
        else:
            rep = {"tags":["unknown"],"country":"CN","asn":"AS4808","confidence":"low","org":"未知"}
        return {"success": True, "ip": ip, "reputation": rep, "source": "mock"}

    def _builtin_isolate_host(self, host_id, reason):
        if self.EDR_API:
            r = self._call_api(self.EDR_API+'/isolate', json_data={"host_id":host_id,"reason":reason},
                               headers={"Authorization": f"Bearer {self.EDR_TOKEN}"})
            if r:
                return {"success": True, "host_id": host_id, "status": "isolated", "source": "edr_api"}
        return {"success": True, "host_id": host_id, "reason": reason, "action": "isolate",
                "status": "pending_approval",
                "message": f"[测试] 主机 {host_id} 隔离请求已提交(待审批)。配置 EDR_API 可对接真实终端管理系统。",
                "source": "mock"}

    def _builtin_reset_creds(self, username, reason):
        return {"success": True, "username": username, "action": "reset_credentials",
                "status": "completed",
                "message": f"[测试] 用户 {username} 凭证已重置。生产环境请对接身份认证系统。"}

    def _builtin_query_alert(self, alert_code):
        try:
            from app.timescaledb import get_tsdb
            from sqlalchemy import text
            tsdb = get_tsdb(); sess = tsdb.get_session()
            row = sess.execute(text("SELECT * FROM alerts WHERE alert_code=:code"),{"code":alert_code}).fetchone()
            tsdb.close_session(sess)
            if row: return {"success": True, "data": dict(row._mapping)}
            return {"success": False, "error": "告警不存在"}
        except Exception as e:
            return {"success": False, "error": f"查询失败: {str(e)}"}

    def _builtin_query_event(self, event_code):
        from app.models import Event
        event = Event.query.filter_by(event_code=event_code).first()
        if event:
            d = event.to_dict(); extra = d.get("extra_data",{})
            if isinstance(extra,str):
                try: extra = json.loads(extra)
                except: extra = {}
            d["related_alerts"] = extra.get("related_alerts",[])
            return {"success": True, "data": d}
        return {"success": False, "error": "事件不存在"}


# 全局单例
_skill_registry = None


def get_skill_registry() -> SkillRegistry:
    global _skill_registry
    if _skill_registry is None:
        _skill_registry = SkillRegistry()
    return _skill_registry
