"""
Agent Pool - 智能 Agent 池

根据任务类型自动选择合适的 Agent
"""

from enum import Enum
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
import logging

logger = logging.getLogger(__name__)


class AgentType(Enum):
    """Agent 类型"""
    EXPLORER = "explorer"         # 代码探索、调研
    WORKER = "worker"             # 代码开发、实现
    TESTER = "tester"             # 测试开发、验证
    REVIEWER = "reviewer"         # 代码审查、优化
    DEPLOYER = "deployer"         # 部署、运维


@dataclass
class AgentCapability:
    """Agent 能力描述"""
    languages: List[str] = field(default_factory=list)       # 编程语言
    frameworks: List[str] = field(default_factory=list)      # 框架
    components: List[str] = field(default_factory=list)      # 组件
    tasks: List[str] = field(default_factory=list)           # 擅长任务类型


@dataclass
class Agent:
    """Agent 定义"""
    id: str
    name: str
    agent_type: AgentType
    capability: AgentCapability
    status: str = "idle"  # idle, busy, offline
    current_task: Optional[str] = None
    
    def is_available(self) -> bool:
        return self.status == "idle"


class AgentPool:
    """Agent 池管理器"""
    
    def __init__(self):
        self.agents: Dict[str, Agent] = {}
        self._init_default_agents()
    
    def _init_default_agents(self):
        """初始化默认 Agent"""
        
        # Explorer Agent - 负责代码探索和调研
        explorer = Agent(
            id="explorer-001",
            name="Code Explorer",
            agent_type=AgentType.EXPLORER,
            capability=AgentCapability(
                languages=["python", "javascript", "java", "go"],
                frameworks=["flask", "react", "spring", "flink"],
                components=["database", "api", "frontend"],
                tasks=["explore", "research", "analyze", "document"]
            )
        )
        
        # Worker Agent - 负责代码开发实现
        worker = Agent(
            id="worker-001",
            name="Code Developer",
            agent_type=AgentType.WORKER,
            capability=AgentCapability(
                languages=["python", "javascript", "java", "go", "rust"],
                frameworks=["flask", "react", "spring", "flink", "django"],
                components=["api", "database", "frontend", "backend"],
                tasks=["implement", "fix", "refactor", "create"]
            )
        )
        
        # Tester Agent - 负责测试开发验证
        tester = Agent(
            id="tester-001",
            name="Test Engineer",
            agent_type=AgentType.TESTER,
            capability=AgentCapability(
                languages=["python", "javascript", "java"],
                frameworks=["pytest", "unittest", "jest", "junit"],
                components=["unit_test", "integration_test", "e2e_test"],
                tasks=["test", "verify", "validate", "debug"]
            )
        )
        
        # Reviewer Agent - 负责代码审查优化
        reviewer = Agent(
            id="reviewer-001",
            name="Code Reviewer",
            agent_type=AgentType.REVIEWER,
            capability=AgentCapability(
                languages=["python", "javascript", "java", "go"],
                frameworks=["all"],
                components=["security", "performance", "quality"],
                tasks=["review", "optimize", "security_check", "refactor"]
            )
        )
        
        # Deployer Agent - 负责部署运维
        deployer = Agent(
            id="deployer-001",
            name="DevOps Engineer",
            agent_type=AgentType.DEPLOYER,
            capability=AgentCapability(
                languages=["python", "bash", "yaml"],
                frameworks=["docker", "kubernetes", "github_actions"],
                components=["ci_cd", "infrastructure", "monitoring"],
                tasks=["deploy", "monitor", "scale", "backup"]
            )
        )
        
        # 添加多个 Worker 以支持并行开发
        for i in range(2, 5):
            worker = Agent(
                id=f"worker-{i:03d}",
                name=f"Developer {i}",
                agent_type=AgentType.WORKER,
                capability=AgentCapability(
                    languages=["python", "javascript", "java"],
                    frameworks=["flask", "react", "spring"],
                    components=["api", "frontend", "backend"],
                    tasks=["implement", "fix", "create"]
                )
            )
            self.agents[worker.id] = worker
        
        # 添加所有单例 Agent
        for agent in [explorer, worker, tester, reviewer, deployer]:
            self.agents[agent.id] = agent
        
        logger.info(f"初始化 Agent 池，共 {len(self.agents)} 个 Agent")
    
    def select_agent(self, task_type: str, requirements: Dict[str, Any] = None) -> Optional[Agent]:
        """根据任务类型选择合适的 Agent"""
        
        # 任务类型到 Agent 类型的映射
        task_to_agent = {
            'explore': AgentType.EXPLORER,
            'research': AgentType.EXPLORER,
            'analyze': AgentType.EXPLORER,
            'implement': AgentType.WORKER,
            'create': AgentType.WORKER,
            'fix': AgentType.WORKER,
            'refactor': AgentType.WORKER,
            'test': AgentType.TESTER,
            'verify': AgentType.TESTER,
            'validate': AgentType.TESTER,
            'debug': AgentType.TESTER,
            'review': AgentType.REVIEWER,
            'optimize': AgentType.REVIEWER,
            'security': AgentType.REVIEWER,
            'deploy': AgentType.DEPLOYER,
            'monitor': AgentType.DEPLOYER,
            'scale': AgentType.DEPLOYER,
        }
        
        # 确定需要的 Agent 类型
        agent_type = task_to_agent.get(task_type.lower(), AgentType.WORKER)
        
        # 查找空闲的 Agent
        for agent in self.agents.values():
            if agent.agent_type == agent_type and agent.is_available():
                agent.status = "busy"
                logger.info(f"选中 Agent: {agent.name} (类型: {agent_type.value})")
                return agent
        
        # 如果没有特定类型的空闲 Agent，尝试找任何空闲的 Worker
        if agent_type == AgentType.WORKER:
            for agent in self.agents.values():
                if agent.agent_type == AgentType.WORKER and agent.is_available():
                    agent.status = "busy"
                    return agent
        
        logger.warning(f"没有可用的 {agent_type.value} 类型 Agent")
        return None
    
    def release_agent(self, agent_id: str):
        """释放 Agent"""
        if agent_id in self.agents:
            self.agents[agent_id].status = "idle"
            self.agents[agent_id].current_task = None
            logger.info(f"Agent {agent_id} 已释放")
    
    def get_status(self) -> Dict[str, Any]:
        """获取 Agent 池状态"""
        status = {
            "total": len(self.agents),
            "busy": sum(1 for a in self.agents.values() if a.status == "busy"),
            "idle": sum(1 for a in self.agents.values() if a.status == "idle"),
            "agents": []
        }
        
        for agent in self.agents.values():
            status["agents"].append({
                "id": agent.id,
                "name": agent.name,
                "type": agent.agent_type.value,
                "status": agent.status
            })
        
        return status


# 全局 Agent 池
agent_pool = AgentPool()


def get_agent_pool() -> AgentPool:
    return agent_pool
