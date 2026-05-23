"""
LangGraph + CrewAI 编排引擎 — 覆盖所有 AI 分析能力

架构: 1 个编排入口 → 意图识别 → CrewAI 多Agent团队 → 结果汇总
       @mention 可直连 Agent

Agent 团队 (覆盖 8 大能力):
  1. alert_analyzer   → 告警分析 + 批量分析 + 事件生成
  2. event_copilot    → 事件协查 (告警关联/攻击链/处置建议)
  3. triage_expert    → 告警分诊 (误报判断/优先级/建议)
  4. threat_intel     → 威胁情报查询
  5. incident_respond → 智能响应 (风险决策/处置动作)
  6. skill_operator   → 技能中心 (NL指令→技能匹配→执行)
  7. nl_analyst       → 自然语言查询 (NL→SQL)
  8. investigator     → 自动调查 (事件ID→攻击时间线+MITRE)
"""
import json, os, logging, re
from typing import Tuple, Literal, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

# ========== LangGraph ==========
try:
    from langgraph.graph import StateGraph, START, END
    from langgraph.checkpoint.memory import MemorySaver
    HAS_LANGGRAPH = True
except ImportError:
    HAS_LANGGRAPH = False

# ========== CrewAI ==========
try:
    from crewai import Agent, Task, Crew
    HAS_CREWAI = True
except ImportError:
    HAS_CREWAI = False

from .crewai_tools import (
    TimescaleDBTool, QueryAlertsTool, CreateIncidentTool,
    NLQueryTool, SkillExecuteTool, MITRETool
)

# ========== 状态定义 ==========
from typing import TypedDict, Annotated, List, Dict, Any
import operator

class SecurityState(TypedDict):
    query: str
    intent: str
    confidence: float
    task_results: Annotated[List[Dict], operator.add]
    errors: List[str]
    needs_approval: bool
    approved: Optional[bool]
    final_response: str
    session_id: str

# ========== 意图识别 (8 大能力) ==========
INTENT_MAP = {
    "alert_analyze":     [r"分析.*告警", r"批量.*分析", r"高危", r"异常", r"威胁.*模式"],
    "event_copilot":     [r"事件协查", r"事件.*分析", r"协查.*事件", r"事件.*调查", r"事件编号"],
    "triage":            [r"分诊", r"误报", r"优先级", r"降噪", r"研判"],
    "threat_intel":      [r"情报", r"威胁.*查询", r"查询.*ip", r"ioc", r"ip.*分析"],
    "incident_respond":  [r"响应", r"封禁", r"隔离", r"处置", r"block", r"自动.*响应"],
    "skill_execute":     [r"技能", r"执行.*操作", r"封禁", r"拉黑", r"查.*情报"],
    "nl_query":          [r"查询.*告警", r"最近.*事件", r"过去.*小时", r"列出", r"搜索"],
    "investigate":       [r"攻击链", r"att&ck", r"mitre", r"时间线", r"溯源"],
}

def detect_intent(query: str) -> Tuple[str, float]:
    q = query.lower()
    for intent, patterns in INTENT_MAP.items():
        if any(re.search(p, q) for p in patterns):
            return intent, 0.85
    return "general", 0.5

# ========== 节点 ==========
def intent_node(state: SecurityState) -> dict:
    intent, conf = detect_intent(state["query"])
    return {"intent": intent, "confidence": conf}

def should_approve(state: SecurityState) -> str:
    return "approve_required" if state.get("intent") in ("incident_respond",) else "direct"

def approval_node(state: SecurityState) -> dict:
    return {"needs_approval": True, "approved": None}

def after_approval(state: SecurityState) -> str:
    return "execute" if state.get("approved") else "rejected"

def execute_agents(state: SecurityState) -> dict:
    """CrewAI 多 Agent 执行"""
    query = state["query"]
    intent = state["intent"]
    results = []
    errors = []

    # 每个意图对应一个 CrewAI Agent
    agent_map = {
        "alert_analyze": _get_agent("alert_analyzer", "安全告警分析师",
            "分析告警数据，识别威胁模式，生成风险事件",
            [QueryAlertsTool(), CreateIncidentTool(), TimescaleDBTool()]),
        "event_copilot": _get_agent("event_copilot", "事件协查专家",
            "关联告警、资产、攻击源，输出事件评价和处置建议",
            [TimescaleDBTool(), MITRETool()]),
        "triage": _get_agent("triage_expert", "告警分诊专家",
            "判断误报概率、评估优先级、给出处置建议",
            [QueryAlertsTool(), TimescaleDBTool()]),
        "threat_intel": _get_agent("threat_intel", "威胁情报分析师",
            "查询IP/域名的威胁情报，关联告警上下文",
            [TimescaleDBTool()]),
        "incident_respond": _get_agent("incident_respond", "安全响应专家",
            "根据事件风险决定处置动作：封禁IP、隔离主机、告警通知",
            [TimescaleDBTool(), CreateIncidentTool()]),
        "skill_execute": _get_agent("skill_operator", "安全操作工程师",
            "根据NL指令匹配并执行已注册的安全技能",
            [SkillExecuteTool(), TimescaleDBTool()]),
        "nl_query": _get_agent("nl_analyst", "安全数据查询员",
            "将自然语言查询转换为数据库查询，返回结果",
            [NLQueryTool(), TimescaleDBTool()]),
        "investigate": _get_agent("investigator", "攻击溯源专家",
            "分析攻击链、MITRE ATT&CK映射、时间线",
            [TimescaleDBTool(), MITRETool()]),
    }

    if intent == "general" or intent not in agent_map:
        # 通用对话交给 LLM
        try:
            from app.routes.ai_api import _deepseek_request
            r = _deepseek_request(messages=[{"role": "user", "content": query}], temperature=0.5)
            reply = r.get("choices",[{}])[0].get("message",{}).get("content","")
            return {"task_results": [{"agent": "assistant", "result": reply}]}
        except Exception as e:
            return {"errors": [str(e)]}

    if HAS_CREWAI:
        try:
            agent = agent_map[intent]
            task_desc = f"用户需求: {query}\n请分析并输出JSON格式结果，包含分析结论、建议动作和相关依据。"
            task = Task(description=task_desc, agent=agent, expected_output="JSON")
            crew = Crew(agents=[agent], tasks=[task], verbose=False)
            result = str(crew.kickoff())
            results.append({"agent": intent, "result": result})
        except Exception as e:
            errors.append(f"CrewAI {intent}: {e}")
            return _llm_fallback(query, intent)

    if not results:
        return _llm_fallback(query, intent)

    return {"task_results": results, "errors": errors}

def _get_agent(name, role, goal, tools):
    from langchain_openai import ChatOpenAI
    from app.core.config import settings
    base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
    llm = ChatOpenAI(
        model=settings.llm_model or "deepseek-chat",
        api_key=settings.openai_api_key or os.getenv("DEEPSEEK_API_KEY",""),
        base_url=base_url,
        temperature=0.3
    )
    return Agent(role=role, goal=goal, backstory=f"负责{goal}", tools=tools, llm=llm, verbose=False)

def _llm_fallback(query: str, intent: str = "general") -> dict:
    try:
        from app.routes.ai_api import _deepseek_request
        system = f"你是一个安全分析助手。用户意图: {intent}。请给出专业、简洁的分析回答。"
        r = _deepseek_request(messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": query}
        ], temperature=0.3)
        reply = r.get("choices",[{}])[0].get("message",{}).get("content","")
        return {"task_results": [{"agent": "llm_fallback", "result": reply}]}
    except Exception as e:
        return {"errors": [str(e)]}

def aggregate_node(state: SecurityState) -> dict:
    parts = [r.get("result","") for r in state.get("task_results",[])]
    final = "\n\n".join(parts) if parts else "处理完成。"
    if state.get("errors"):
        final += f"\n\n⚠️ 部分步骤异常: {'; '.join(state['errors'])}"
    return {"final_response": final}

# ========== 构建图 ==========
def build():
    if not HAS_LANGGRAPH: return None
    b = StateGraph(SecurityState)
    b.add_node("intent", intent_node)
    b.add_node("approval", approval_node)
    b.add_node("execute", execute_agents)
    b.add_node("aggregate", aggregate_node)
    b.add_edge(START, "intent")
    b.add_conditional_edges("intent", should_approve, {"approve_required":"approval","direct":"execute"})
    b.add_conditional_edges("approval", after_approval, {"execute":"execute","rejected":"aggregate"})
    b.add_edge("execute", "aggregate")
    b.add_edge("aggregate", END)
    return b.compile(checkpointer=MemorySaver())

orchestrator = build()

async def run(query: str, session_id: str = "") -> dict:
    import uuid
    sid = session_id or str(uuid.uuid4())
    init = SecurityState(query=query, intent="", confidence=0.0, task_results=[],
                         errors=[], needs_approval=False, approved=None,
                         final_response="", session_id=sid)

    if orchestrator is None:
        init.update(intent_node(init))
        init.update(execute_agents(init))
        init.update(aggregate_node(init))
        return {"success": True, "response": init["final_response"],
                "session_id": sid, "intent": init["intent"], "orchestrator": "direct"}

    try:
        for event in orchestrator.stream(init, config={"configurable": {"thread_id": sid}}):
            if isinstance(event, dict):
                for node, data in event.items():
                    if isinstance(data, dict):
                        init.update(data)
        return {"success": True, "response": init["final_response"],
                "session_id": sid, "intent": init["intent"],
                "orchestrator": "langgraph"}
    except Exception as e:
        return {"success": False, "error": str(e)}

def approve(session_id: str, approved: bool) -> dict:
    if not orchestrator: return {"success": False, "error": "Unavailable"}
    try:
        orchestrator.update_state({"configurable": {"thread_id": session_id}},
                                   {"approved": approved, "needs_approval": False})
        return {"success": True, "approved": approved}
    except Exception as e:
        return {"success": False, "error": str(e)}
