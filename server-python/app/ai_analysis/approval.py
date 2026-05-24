"""
审批工作流 — 高风险操作需要人工确认后才执行
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
    """创建待审批操作"""
    import uuid
    actions = _load_actions()
    action = {
        "id": str(uuid.uuid4())[:8],
        "type": action_type,
        "params": params,
        "status": "pending",
        "requested_by": user,
        "created_at": datetime.utcnow().isoformat(),
        "approved_at": None,
        "approved_by": None,
        "result": None
    }
    actions.append(action)
    _save_actions(actions)
    logger.info(f"待审批操作已创建: {action['type']} (id={action['id']})")
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
