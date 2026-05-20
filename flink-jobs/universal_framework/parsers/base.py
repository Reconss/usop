"""
Base Parser - 解析器基类
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime
import json


@dataclass
class ParseResult:
    """解析结果"""
    success: bool
    data: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None
    raw_log: str = ""
    timestamp: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'success': self.success,
            'data': self.data,
            'error': self.error,
            'raw_log': self.raw_log,
            'timestamp': self.timestamp
        }


class BaseParser(ABC):
    """解析器基类"""
    
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
    
    @abstractmethod
    def parse(self, raw_log: str) -> ParseResult:
        """解析日志"""
        pass
    
    def _extract_timestamp(self, data: Dict[str, Any]) -> str:
        """提取时间戳"""
        timestamp_fields = [
            '@timestamp', 'timestamp', 'time', 'datetime', 
            'ts', 'event_time', 'log_time', 'created_at'
        ]
        for field in timestamp_fields:
            if field in data:
                return str(data[field])
        return datetime.utcnow().isoformat()
    
    def _extract_ip(self, data: Dict[str, Any], field_name: str) -> Optional[str]:
        """提取 IP 地址"""
        ip_fields = [
            f'{field_name}', f'{field_name}_ip', 
            f'{field_name}ip', f'source_{field_name}'
        ]
        for field in ip_fields:
            if field in data:
                return data[field]
        return None
    
    def _safe_json_loads(self, text: str) -> Any:
        """安全的 JSON 解析"""
        try:
            return json.loads(text)
        except (json.JSONDecodeError, TypeError):
            return None
