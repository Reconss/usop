"""
LangGraph + CrewAI 编排引擎

架构:
  用户输入 → LangGraph (意图识别/任务拆分/审批门/执行) → CrewAI Agent 团队
                                                              ├── alert_collector: 告警采集
                                                              ├── threat_intel: 威胁情报
                                                              ├── alert_analyzer: 告警研判
                                                              └── ip_blocker: IP封禁

流程:
  1. intent_parser — 解析用户意图
  2. task_splitter — 拆解为子任务列表
  3. crew_executor — CrewAI 多 Agent 协作执行
  4. human_approval — 高风险操作等待人工审批
  5. result_aggregator — 汇总结果为结构化输出
"""
import json, os, logging, re
from typing import TypedDict, Annotated, List, Dict, Any, Optional, Literal
from datetime import datetime

logger = logging.getLogger(__name__)

# ========== LangGraph ==========
try:
    from langgraph.graph import StateGraph, START, END
    from langgraph.checkpoint.memory import MemorySaver
    from langgraph.types import Command
    HAS_LANGGRAPH = True
except ImportError:
    HAS_LANGGRAPH = False
    logger.warning("langgraph not installed, fallback to direct execution")

# ========== CrewAI ==========
try:
    from crewai import Agent, Task, Crew, Process
    from crewai_tools import BaseTool
    HAS_CREWAI = True
except ImportError:
    HAS_CREWAI = False
    logger.warning("crewai not installed, fallback to LLM only")

from .crewai_tools import TimescaleDBTool, QueryAlertsTool, CreateIncidentTool

# ========== 状态定义 ==========
class SecurityState(TypedDict):
    user_id: str
    session_id: str
    query: str                          # 原始用户输入
    intent: Optional[str]               # 识别后的意图
    confidence: float                   # 意图置信度
    alert_context: Optional[Dict]       # 上下文数据
    task_list: List[Dict]               # 任务列表
    task_index: int                     # 当前执行到第几个任务
    results: List[Dict]                 # 已执行完成的结果
    errors: List[str]                   # 错误信息
    needs_approval: bool                # 是否需要审批
    approved: Optional[bool]            # 是否审批通过
    final_response: Optional[str]       # 最终输出
    messages: List[Dict]                # 对话历史

# ========== 意图识别 ==========
INTENT_PATTERNS = {
    "alert_query": [r"告警", r"alert", r"查看.*事件", r"查询.*告警"],
    "alert_analyze": [r"分析.*告警", r"研判", r"评估.*风险"],
    "threat_intel": [r"情报", r"威胁", r"查询.*ip", r"ioc", r"威胁情报"],
    "ip_block": [r"封禁", r"block", r"拉黑", r"屏蔽.*ip"],
    "incident_create": [r"创建.*事件", r"升级.*事件", r"生成.*事件"],
    "general": []
}

def detect_intent(query: str) -> tuple:
    """基于规则+LLM的意图识别"""
    query_lower = query.lower()
    for intent, patterns in INTENT_PATTERNS.items():
        for p in patterns:
            if re.search(p, query_lower):
                return intent, 0.85
    return "general", 0.6

# ========== LangGraph 节点 ==========
def intent_parser_node(state: SecurityState) -> dict:
    """节点1: 意图识别"""
    intent, confidence = detect_intent(state["query"])
    return {"intent": intent, "confidence": confidence,
            "messages": [{"role": "system", "content": f"意图: {intent} (置信度: {confidence:.2f})"}]}

def task_splitter_node(state: SecurityState) -> dict:
    """节点2: 根据意图拆解任务"""
    task_templates = {
        "alert_query": [
            {"agent": "alert_collector", "description": "查询最近的告警", "priority": 1},
        ],
        "alert_analyze": [
            {"agent": "alert_collector", "description": "查询待分析的高危告警", "priority": 1},
            {"agent": "threat_intel", "description": "关联告警的威胁情报", "priority": 2},
            {"agent": "alert_analyzer", "description": "综合研判告警风险", "priority": 3},
        ],
        "threat_intel": [
            {"agent": "threat_intel", "description": state["query"], "priority": 1},
        ],
        "ip_block": [
            {"agent": "alert_collector", "description": "校验IP相关告警", "priority": 1},
            {"agent": "ip_blocker", "description": state["query"], "priority": 2},
        ],
        "incident_create": [
            {"agent": "alert_analyzer", "description": "综合分析告警", "priority": 1},
        ],
        "general": [
            {"agent": "alert_analyzer", "description": state["query"], "priority": 1},
        ],
    }
    tasks = task_templates.get(state["intent"], task_templates["general"])
    return {"task_list": tasks, "task_index": 0, "results": []}

def should_approve(state: SecurityState) -> Literal["approve_required", "direct_execute"]:
    """条件边: 判断是否需要人工审批"""
    if state["intent"] == "ip_block":
        return "approve_required"
    return "direct_execute"

def human_approval_node(state: SecurityState) -> dict:
    """节点3(可选): 人工审批 — 实际中暂停等待API调用"""
    return {"needs_approval": True, "approved": None}

def after_approval(state: SecurityState) -> Literal["execute", "rejected_end"]:
    """审批后分支"""
    if state.get("approved"):
        return "execute"
    return "rejected_end"

def crew_executor_node(state: SecurityState) -> dict:
    """节点4: CrewAI Agent 团队执行"""
    if not HAS_CREWAI:
        return _llm_fallback(state)

    try:
        results = []
        for task_def in state["task_list"]:
            agent_name = task_def["agent"]
            description = task_def["description"]
            crew_agent = _get_crew_agent(agent_name)
            task = Task(description=description, agent=crew_agent,
                        expected_output="JSON 格式结果，包含分析和建议")
            crew = Crew(agents=[crew_agent], tasks=[task], verbose=False)
            result = crew.kickoff()
            result_str = str(result)
            results.append({"agent": agent_name, "result": result_str})
            logger.info(f"CrewAI {agent_name} 执行完成")

        return {"results": results, "task_index": len(state["task_list"])}
    except Exception as e:
        logger.error(f"CrewAI execution failed: {e}")
        return _llm_fallback(state)

def _get_crew_agent(name: str) -> Agent:
    """获取或创建 CrewAI Agent"""
    from langchain_openai import ChatOpenAI
    from app.core.config import settings

    llm = ChatOpenAI(
        model=settings.llm_model or "gpt-4o-mini",
        api_key=settings.openai_api_key or os.getenv("OPENAI_API_KEY", ""),
        temperature=0.3
    )

    agents = {
        "alert_collector": Agent(
            role="安全告警采集员",
            goal="精确查询TimescaleDB中的告警数据",
            backstory="负责从安全数据库中检索告警信息，擅长SQL查询",
            tools=[TimescaleDBTool(), QueryAlertsTool()],
            llm=llm, verbose=False
        ),
        "threat_intel": Agent(
            role="威胁情报分析师",
            goal="查询IP/域名的威胁情报",
            backstory="资深威胁情报专家，熟悉各类威胁情报源",
            tools=[TimescaleDBTool()],
            llm=llm, verbose=False
        ),
        "alert_analyzer": Agent(
            role="安全告警研判专家",
            goal="综合分析告警，评估风险等级，给出处置建议",
            backstory="15年安全运营经验，精通告警分析和事件响应",
            tools=[TimescaleDBTool(), QueryAlertsTool(), CreateIncidentTool()],
            llm=llm, verbose=False
        ),
        "ip_blocker": Agent(
            role="安全处置工程师",
            goal="执行IP封禁、主机隔离等处置动作",
            backstory="负责安全设备的运维和策略下发",
            tools=[TimescaleDBTool()],
            llm=llm, verbose=False
        ),
    }
    return agents.get(name, agents["alert_analyzer"])

def _llm_fallback(state: SecurityState) -> dict:
    """降级: 无 CrewAI 时直接用 LLM 分析"""
    from app.routes.ai_api import _deepseek_request
    try:
        prompt = f"""用户查询: {state['query']}
意图: {state['intent']}

请分析并给出回答。如果是告警分析，请说明风险等级和建议处置动作。"""
        result = _deepseek_request(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3
        )
        reply = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        return {"results": [{"agent": "llm_fallback", "result": reply}],
                "task_index": len(state.get("task_list", []))}
    except Exception as e:
        return {"errors": [f"LLM fallback failed: {e}"]}

def result_aggregator_node(state: SecurityState) -> dict:
    """节点5: 汇总结果为最终回复"""
    parts = []
    for r in state.get("results", []):
        agent = r.get("agent", "unknown")
        result = r.get("result", "")
        parts.append(f"【{agent}】\n{result[:2000]}")
    final = "\n\n---\n\n".join(parts) if parts else "处理完成，未产生分析结果。"
    if state.get("errors"):
        final += f"\n\n⚠️ 部分步骤异常: {'; '.join(state['errors'])}"
    return {"final_response": final,
            "messages": [{"role": "assistant", "content": final}]}

# ========== 构建图 ==========
def build_orchestrator():
    """构建 LangGraph 编排图"""
    if not HAS_LANGGRAPH:
        return None

    builder = StateGraph(SecurityState)
    builder.add_node("intent_parser", intent_parser_node)
    builder.add_node("task_splitter", task_splitter_node)
    builder.add_node("human_approval", human_approval_node)
    builder.add_node("crew_executor", crew_executor_node)
    builder.add_node("result_aggregator", result_aggregator_node)

    builder.add_edge(START, "intent_parser")
    builder.add_edge("intent_parser", "task_splitter")
    builder.add_conditional_edges(
        "task_splitter",
        should_approve,
        {"approve_required": "human_approval", "direct_execute": "crew_executor"}
    )
    builder.add_conditional_edges(
        "human_approval",
        after_approval,
        {"execute": "crew_executor", "rejected_end": "result_aggregator"}
    )
    builder.add_edge("crew_executor", "result_aggregator")
    builder.add_edge("result_aggregator", END)

    memory = MemorySaver()
    return builder.compile(checkpointer=memory)

orchestrator = build_orchestrator()

# ========== 对外接口 ==========
async def run_orchestration(query: str, user_id: str = "anonymous",
                            session_id: Optional[str] = None) -> dict:
    """运行 LangGraph 编排流程（异步接口）"""
    import uuid
    sid = session_id or str(uuid.uuid4())

    if orchestrator is None:
        # 无 LangGraph 时直接执行 CrewAI 或 LLM 降级
        state: SecurityState = {
            "user_id": user_id, "session_id": sid, "query": query,
            "intent": None, "confidence": 0, "alert_context": None,
            "task_list": [], "task_index": 0, "results": [], "errors": [],
            "needs_approval": False, "approved": None,
            "final_response": None, "messages": []
        }
        state.update(intent_parser_node(state))
        state.update(task_splitter_node(state))
        state.update(crew_executor_node(state))
        state.update(result_aggregator_node(state))
        return {
            "success": True, "response": state.get("final_response", ""),
            "session_id": sid, "intent": state.get("intent", "general"),
            "orchestrator": "direct"
        }

    # LangGraph 流程
    try:
        initial_state: SecurityState = {
            "user_id": user_id, "session_id": sid, "query": query,
            "intent": None, "confidence": 0, "alert_context": None,
            "task_list": [], "task_index": 0, "results": [], "errors": [],
            "needs_approval": False, "approved": None,
            "final_response": None, "messages": []
        }
        final_state = None
        for event in orchestrator.stream(
            initial_state,
            config={"configurable": {"thread_id": sid}}
        ):
            final_state = event
        if final_state and isinstance(final_state, dict):
            # 取最后一个节点的输出
            last_node = list(final_state.keys())[-1] if final_state else None
            node_output = final_state.get(last_node, {}) if last_node else {}
            return {
                "success": True,
                "response": node_output.get("final_response", ""),
                "session_id": sid,
                "intent": initial_state.get("intent", "general"),
                "result": node_output.get("results", []),
                "orchestrator": "langgraph"
            }
        return {"success": True, "response": "处理完成", "session_id": sid}
    except Exception as e:
        logger.error(f"LangGraph error: {e}")
        return {"success": False, "error": str(e)}

# ========== 审批接口 ==========
def approve_action(session_id: str, approved: bool) -> dict:
    """人工审批: 外部调用(如前端审批弹窗)"""
    if orchestrator is None:
        return {"success": False, "error": "Orchestrator not available"}
    try:
        # LangGraph 的异步更新机制
        orchestrator.update_state(
            {"configurable": {"thread_id": session_id}},
            {"approved": approved, "needs_approval": False}
        )
        return {"success": True, "approved": approved}
    except Exception as e:
        return {"success": False, "error": str(e)}
