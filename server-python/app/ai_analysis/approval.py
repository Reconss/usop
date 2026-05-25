"""
审批工作流 — 基于角色的分级审批
- approval_level 1: 自动执行（普通操作如白名单添加）
- approval_level 2: 主管审批（中级操作如IP封禁）
- approval_level 3: 高级管理审批（危险操作如主机隔离）
"""
import json, os, logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

# 审批列表（写入文件持久化）
APPROVAL_FILE = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'pending_actions.json')

def _load_actions():
    try:
        if os.path.exists(APPROVAL_FILE):
            with open(APPROVAL_FILE, 'r') as f:
                return json.load(f)
    except: pass
    return []

def _save_actions(actions):
    os.makedirs(os.path.dirname(APPROVAL_FILE), exist_ok=True)
    with open(APPROVAL_FILE, 'w') as f:
        json.dump(actions, f, ensure_ascii=False, indent=2)

def create_action(action_type: str, params: dict, user: str = "system") -> dict:
    """创建待审批操作，根据类型分配审批角色"""
    import uuid
    
    # 根据操作类型决定审批等级
    approval_rules = {
        "block_ip": {"level": 2, "label": "IP封禁"},
        "unblock_ip": {"level": 2, "label": "IP解禁"},
        "isolate_host": {"level": 3, "label": "主机隔离"},
        "whitelist_add": {"level": 1, "label": "白名单添加"},
        "quarantine_file": {"level": 2, "label": "文件隔离"},
        "terminate_process": {"level": 2, "label": "进程终止"},
        "reset_password": {"level": 2, "label": "密码重置"},
        "modify_firewall": {"level": 3, "label": "防火墙修改"},
    }
    rule = approval_rules.get(action_type, {"level": 2, "label": action_type})
    
    actions = _load_actions()
    action = {
        "id": str(uuid.uuid4())[:8],
        "type": action_type,
        "label": rule["label"],
        "params": params,
        "status": "pending",
        "approval_level": rule["level"],
        "requested_by": user,
        "created_at": datetime.utcnow().isoformat(),
        "approved_at": None,
        "approved_by": None,
        "notified_users": [],
        "result": None
    }
    actions.append(action)
    _save_actions(actions)
    logger.info(f"待审批操作已创建: {action['label']}(L{rule['level']}) id={action['id']}")
    return action

def approve_action(action_id: str, approved: bool, approver: str = "admin") -> dict:
    """审批操作"""
    actions = _load_actions()
    for action in actions:
        if action["id"] == action_id:
            action["status"] = "approved" if approved else "rejected"
            action["approved_at"] = datetime.utcnow().isoformat()
            action["approved_by"] = approver
            _save_actions(actions)
            
            if approved:
                # 执行操作
                from app.ai_analysis.skill_registry import get_skill_registry
                reg = get_skill_registry()
                result = reg.execute(action["type"], action["params"])
                action["result"] = result
                _save_actions(actions)
                logger.info(f"操作已执行: {action['type']} (id={action_id})")
                return {"success": True, "status": "approved", "result": result}
            else:
                logger.info(f"操作已拒绝: {action['type']} (id={action_id})")
                return {"success": True, "status": "rejected"}
    return {"success": False, "error": "操作不存在"}

def get_pending_actions() -> list:
    """获取所有待审批操作"""
    return [a for a in _load_actions() if a["status"] == "pending"]

def get_action_history(limit: int = 20) -> list:
    """获取审批历史"""
    return _load_actions()[-limit:] if _load_actions() else []

def get_approval_rules() -> dict:
    """获取审批规则定义"""
    return {
        "block_ip": {"level": 2, "label": "IP封禁", "risk": "中", "desc": "封禁攻击源IP地址"},
        "unblock_ip": {"level": 2, "label": "IP解禁", "risk": "中", "desc": "解除IP封禁"},
        "isolate_host": {"level": 3, "label": "主机隔离", "risk": "高", "desc": "将受损主机从网络隔离"},
        "quarantine_file": {"level": 2, "label": "文件隔离", "risk": "中", "desc": "隔离恶意文件"},
        "terminate_process": {"level": 2, "label": "进程终止", "risk": "中", "desc": "终止恶意进程"},
        "reset_password": {"level": 2, "label": "密码重置", "risk": "中", "desc": "重置用户密码"},
        "modify_firewall": {"level": 3, "label": "防火墙修改", "risk": "高", "desc": "修改防火墙规则"},
        "whitelist_add": {"level": 1, "label": "白名单添加", "risk": "低", "desc": "添加白名单规则"},
    }
