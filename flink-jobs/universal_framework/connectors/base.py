"""
Base Source Connector - 数据源连接器基类
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field
from enum import Enum

class SourceType(Enum):
    """数据源类型"""
    # 流式接入
    KAFKA = "kafka"
    SYSLOG = "syslog"
    WEBHOOK = "webhook"
    
    # 拉取接入
    FILE = "file"
    JDBC = "jdbc"
    ELASTICSEARCH = "es"
    S3 = "s3"
    API = "api"
    SFTP = "sftp"
    SNMP = "snmp"


class DeployMode(Enum):
    """部署模式"""
    SESSION = "session"       # 共享集群，多作业
    PER_JOB = "per-job"       # 每次提交新建集群
    APPLICATION = "application"  # Application 模式


@dataclass
class SourceConfig:
    """数据源配置"""
    protocol: str  # kafka, syslog, es, jdbc, file, webhook, s3, api, snmp, sftp
    source_type: str = "push"  # pull, push
    
    # 连接配置
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None
    
    # 协议特定配置
    config: Dict[str, Any] = field(default_factory=dict)
    
    # Flink 配置
    parallelism: int = 1
    restart_strategy: str = "fixed-delay"


class BaseSourceConnector(ABC):
    """数据源连接器基类"""
    
    def __init__(self, config: SourceConfig):
        self._config = config
    
    @abstractmethod
    def get_flink_sql(self) -> str:
        """获取 Flink SQL 创建语句"""
        pass
    
    @abstractmethod
    def get_connector_config(self) -> Dict[str, Any]:
        """获取连接器配置"""
        pass
    
    @abstractmethod
    def validate(self) -> bool:
        """验证配置是否有效"""
        pass
    
    def get_dependencies(self) -> List[str]:
        """获取需要的依赖包"""
        return []


# 向后兼容：允许使用 config.get()
class ConfigWrapper:
    """配置包装器，允许使用 .get() 方法"""
    
    def __init__(self, config: Dict[str, Any]):
        self._config = config
    
    def get(self, key: str, default=None):
        return self._config.get(key, default)
    
    def __getitem__(self, key):
        return self._config[key]
    
    def __setitem__(self, key, value):
        self._config[key] = value
    
    def items(self):
        return self._config.items()
    
    def keys(self):
        return self._config.keys()
