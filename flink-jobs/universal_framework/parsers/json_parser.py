"""
JSON Parser - JSON 格式日志解析器
"""

import json
import re
from typing import Dict, Any
from .base import BaseParser, ParseResult


class JSONParser(BaseParser):
    """JSON 格式解析器"""
    
    def parse(self, raw_log: str) -> ParseResult:
        """解析 JSON 日志"""
        try:
            data = json.loads(raw_log)
            
            if not isinstance(data, dict):
                return ParseResult(
                    success=False,
                    error="JSON root must be an object",
                    raw_log=raw_log
                )
            
            # 提取标准字段
            result = {
                'raw_log': raw_log,
                'timestamp': self._extract_timestamp(data),
                'src_ip': self._extract_ip(data, 'src'),
                'dst_ip': self._extract_ip(data, 'dst'),
            }
            
            # 添加所有原始字段
            result.update(data)
            
            # 尝试提取常见字段
            self._extract_common_fields(result, data)
            
            return ParseResult(
                success=True,
                data=result,
                raw_log=raw_log,
                timestamp=result['timestamp']
            )
            
        except json.JSONDecodeError as e:
            return ParseResult(
                success=False,
                error=f"JSON parse error: {str(e)}",
                raw_log=raw_log
            )
        except Exception as e:
            return ParseResult(
                success=False,
                error=str(e),
                raw_log=raw_log
            )
    
    def _extract_common_fields(self, result: Dict, data: Dict):
        """提取常见字段"""
        # IP 相关
        for src_key in ['src_ip', 'source_ip', 'srcip', 'client_ip', 'remote_addr']:
            if src_key in data:
                result['src_ip'] = data[src_key]
                break
        
        for dst_key in ['dst_ip', 'dest_ip', 'dstip', 'server_ip']:
            if dst_key in data:
                result['dst_ip'] = data[dst_key]
                break
        
        # 端口
        for key in ['src_port', 'source_port', 'sport']:
            if key in data:
                result['src_port'] = data[key]
                break
        
        for key in ['dst_port', 'dest_port', 'dport']:
            if key in data:
                result['dst_port'] = data[key]
                break
        
        # 协议
        for key in ['protocol', 'proto', 'scheme']:
            if key in data:
                result['protocol'] = data[key].upper()
                break
        
        # 动作/事件
        for key in ['action', 'event', 'event_type', 'event_type']:
            if key in data:
                result['action'] = data[key]
                break
        
        # 严重程度
        for key in ['severity', 'level', 'priority', 'threat_level']:
            if key in data:
                result['severity'] = data[key]
                break
        
        # 消息
        for key in ['message', 'msg', 'description', 'detail']:
            if key in data:
                result['message'] = data[key]
                break
        
        # 用户名
        for key in ['username', 'user', 'user_name', 'account']:
            if key in data:
                result['username'] = data[key]
                break
        
        # 主机名
        for key in ['hostname', 'host', 'device_name', 'server']:
            if key in data:
                result['hostname'] = data[key]
                break
