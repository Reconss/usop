"""
扫描管理器 — 统一扫描框架 (参考 CyberEdge 架构)
提供: 工具注册、流水线编排、阶段式扫描、结果结构化
"""
import os
import logging
from typing import Optional, List, Dict, Type, Callable
from datetime import datetime
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# ==================== 数据结构 ====================

@dataclass
class ScanTarget:
    """扫描目标"""
    value: str           # IP / 域名 / CIDR
    type: str = "ip"     # ip / domain / cidr
    project: str = "default"

@dataclass
class ScanConfig:
    """统一扫描配置"""
    target: ScanTarget
    options: Dict = field(default_factory=dict)
    timeout: int = 300

@dataclass
class ScannerInfo:
    """扫描工具信息"""
    name: str
    category: str
    available: bool = True
    description: str = ""

@dataclass
class ScanStage:
    """扫描阶段"""
    name: str
    scanners: List[str]
    depends_on: List[str] = field(default_factory=list)
    parallel: bool = False
    options: Dict = field(default_factory=dict)

@dataclass
class ScanPipeline:
    """扫描流水线"""
    name: str
    stages: List[ScanStage]
    parallel: bool = False
    continue_on_error: bool = True
    description: str = ""

# ==================== 基类 ====================

class Scanner:
    """扫描工具基类"""
    name = ""
    category = ""
    description = ""

    def is_available(self) -> bool:
        return True

    def validate(self, config: ScanConfig) -> Optional[str]:
        return None

    def scan(self, config: ScanConfig, progress_cb: Optional[Callable] = None) -> List[Dict]:
        raise NotImplementedError


# ==================== 扫描管理器 ====================

class ScanManager:
    """扫描管理器 — 注册工具、执行流水线"""

    def __init__(self):
        self._scanners: Dict[str, Scanner] = {}

    def register(self, scanner: Scanner):
        self._scanners[scanner.name] = scanner
        logger.info(f"注册扫描工具: {scanner.name} ({scanner.category})")

    def get(self, name: str) -> Optional[Scanner]:
        s = self._scanners.get(name)
        if s and s.is_available():
            return s
        return None

    def list_by_category(self, category: str) -> List[Scanner]:
        return [s for s in self._scanners.values()
                if s.category == category and s.is_available()]

    def list_all(self) -> List[ScannerInfo]:
        return [ScannerInfo(name=s.name, category=s.category,
                           available=s.is_available(), description=s.description)
                for s in self._scanners.values()]

    def execute_stage(self, stage: ScanStage, target: ScanTarget,
                      results: Dict, progress_cb: Optional[Callable] = None) -> List[Dict]:
        """执行单个阶段"""
        stage_results = []
        scanners = [s for s_name in stage.scanners
                    for s in [self.get(s_name)] if s]

        for scanner in scanners:
            config = ScanConfig(target=target, options=stage.options)
            try:
                r = scanner.scan(config, progress_cb)
                stage_results.extend(r)
            except Exception as e:
                logger.warning(f"工具 {scanner.name} 扫描失败: {e}")

        return stage_results

    def execute_pipeline(self, pipeline: ScanPipeline, target: ScanTarget,
                         progress_cb: Optional[Callable] = None) -> Dict:
        """执行完整流水线"""
        all_results = {}
        completed = set()

        for stage in pipeline.stages:
            # 检查依赖
            deps_met = all(d in completed for d in stage.depends_on)
            if not deps_met:
                logger.info(f"跳过阶段 {stage.name}: 依赖未满足")
                continue

            r = self.execute_stage(stage, target, all_results, progress_cb)
            all_results[stage.name] = r
            completed.add(stage.name)

        return all_results


# ==================== 全局实例 ====================

_manager = None

def get_manager() -> ScanManager:
    global _manager
    if _manager is None:
        _manager = ScanManager()
        # 注册可用工具
        _auto_register(_manager)
    return _manager


def _auto_register(manager: ScanManager):
    """自动检测并注册可用扫描工具"""
    import importlib

    # 定义内置扫描器
    builtin_scanners = []

    # 检测外部工具
    tool_checks = {
        "nmap": ("nmap", ["nmap", "--version"]),
        "naabu": ("naabu", ["naabu", "-version"]),
        "nuclei": ("nuclei", ["nuclei", "-version"]),
        "httpx": ("httpx", ["httpx", "-version"]),
        "subfinder": ("subfinder", ["subfinder", "-version"]),
    }

    available = {}
    for name, (_, cmd) in tool_checks.items():
        try:
            import subprocess
            r = subprocess.run(cmd, capture_output=True, timeout=5)
            available[name] = r.returncode == 0
        except:
            available[name] = False

    logger.info(f"可用扫描工具: {[k for k,v in available.items() if v]}")

    # 注册 pipeline 中的扫描阶段工具
    import sys
    # 尝试从 recon_pipeline 注册阶段
    try:
        from app.engine.recon_pipeline import (
            DNSEnumPhase, PortScanPhase, ServiceDetectPhase,
            HTTPProbePhase, VulnScanPhase, SCAN_TEMPLATES
        )
        # 注册为 scanners
        class DNSEnumerator(Scanner):
            name = "subfinder"; category = "subdomain"; description = "DNS子域名枚举"
            def scan(self, config, cb=None):
                phase = DNSEnumPhase()
                return phase.run(config.target.value, {}, "")

        class PortScanner(Scanner):
            name = "nmap"; category = "port"; description = "端口发现"
            def scan(self, config, cb=None):
                phase = PortScanPhase()
                return phase.run(config.target.value, {}, "")

        class ServiceScanner(Scanner):
            name = "naabu"; category = "service"; description = "服务识别"
            def scan(self, config, cb=None):
                phase = ServiceDetectPhase()
                return phase.run(config.target.value, {}, "")

        class WebProber(Scanner):
            name = "httpx"; category = "web"; description = "HTTP探针"
            def scan(self, config, cb=None):
                phase = HTTPProbePhase()
                return phase.run(config.target.value, {}, "")

        class VulnScanner(Scanner):
            name = "nuclei"; category = "vuln"; description = "漏洞扫描"
            def scan(self, config, cb=None):
                phase = VulnScanPhase()
                return phase.run(config.target.value, {}, "")

        for s in [DNSEnumerator(), PortScanner(), ServiceScanner(), WebProber(), VulnScanner()]:
            manager.register(s)

    except ImportError as e:
        logger.warning(f"无法加载扫描阶段: {e}")
