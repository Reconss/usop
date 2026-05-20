"""
Key-Value Parser - 键值对日志解析器
"""

import re
from typing import Dict, Any
from .base import BaseParser, ParseResult


class KeyValueParser(BaseParser):
    """键值对格式解析器"""
    
    # 默认分隔符
    DEFAULT_KV_SEPARATOR = r'[\s=,]'
    DEFAULT_QUOTE_CHARS = ['"', "'"]
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(config)
        self.separator = config.get('separator', self.DEFAULT_KV_SEPARATOR)
        self.quote_chars = config.get('quote_chars', self.DEFAULT_QUOTE_CHARS)
        self.trim_key = config.get('trim_key', True)
        self.trim_value = config.get('trim_value', True)
    
    def parse(self, raw_log: str) -> ParseResult:
        """解析键值对日志"""
        try:
            # 构建正则
            kv_pattern = self._build_kv_pattern()
            matches = kv_pattern.findall(raw_log)
            
            if not matches:
                return ParseResult(
                    success=False,
                    error="No key-value pairs found",
                    raw_log=raw_log
                )
            
            result = {
                'raw_log': raw_log,
                'format_type': 'keyvalue'
            }
            
            for key, value in matches:
                if self.trim_key:
                    key = key.strip()
                if self.trim_value:
                    value = value.strip()
                
                # 移除引号
                value = self._remove_quotes(value)
                
                # 尝试转换类型
                result[key] = self._convert_type(value)
            
            result['timestamp'] = self._extract_timestamp(result)
            
            return ParseResult(
                success=True,
                data=result,
                raw_log=raw_log,
                timestamp=result.get('timestamp', '')
            )
            
        except Exception as e:
            return ParseResult(
                success=False,
                error=f"Key-Value parse error: {str(e)}",
                raw_log=raw_log
            )
    
    def _build_kv_pattern(self) -> re.Pattern:
        """构建键值对正则"""
        # 键: 字母、数字、下划线
        key_pattern = r'([a-zA-Z_][a-zA-Z0-9_]*)'
        
        # 值: 非分隔符字符，支持引号
        value_pattern = r'([^=\s,]+|"[^"]*"|\'[^\']*\')'
        
        # 分隔符
        separator = r'\s*=\s*'
        
        pattern = f'{key_pattern}{separator}{value_pattern}'
        return re.compile(pattern)
    
    def _remove_quotes(self, value: str) -> str:
        """移除引号"""
        for quote in self.quote_chars:
            if value.startswith(quote) and value.endswith(quote):
                return value[1:-1]
        return value
    
    def _convert_type(self, value: str) -> Any:
        """尝试转换类型"""
        # 布尔值
        if value.lower() in ('true', 'yes', 'on', '1'):
            return True
        if value.lower() in ('false', 'no', 'off', '0'):
            return False
        
        # 整数
        try:
            return int(value)
        except ValueError:
            pass
        
        # 浮点数
        try:
            return float(value)
        except ValueError:
            pass
        
        return value
