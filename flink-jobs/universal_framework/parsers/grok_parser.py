"""
Grok Parser - Grok 模式日志解析器
"""

import re
import os
from typing import Dict, Any
from .base import BaseParser, ParseResult


# 常用 Grok 模式
COMMON_PATTERNS = {
    'NGINX_ACCESS_LOG': r'%{IPORHOST:client_ip} - %{DATA:user} \[%{HTTPDATE:timestamp}\] "%{WORD:method} %{URIPATHPARAM:request} HTTP/%{NUMBER:http_version}" %{NUMBER:status:int} %{NUMBER:bytes:int} "%{DATA:referrer}" "%{DATA:agent}"',
    'NGINX_ERROR_LOG': r'%{TIMESTAMP_ISO8601:timestamp} %{LOGLEVEL:level} %{NUMBER:pid:int}#%{NUMBER:tid:int}: %{GREEDYDATA:message}',
    'APACHE_ACCESS_LOG': r'%{IPORHOST:client_ip} %{DATA:user} %{DATA:auth} \[%{HTTPDATE:timestamp}\] "%{WORD:method} %{URIPATHPARAM:request} HTTP/%{NUMBER:http_version}" %{NUMBER:status:int} %{NUMBER:bytes:int}',
    'SYSLOG': r'%{SYSLOGTIMESTAMP:timestamp} %{HOSTNAME:hostname} %{DATA:program}(?:\[%{POSINT:pid}\])?: %{GREEDYDATA:message}',
    'TIMESTAMP_ISO8601': r'%{YEAR}-%{MONTHNUM}-%{MONTHDAY}[T ]%{HOUR}:%{MINUTE}:%{SECOND}(?:\.%{NS})?(?:Z|%{ISO8601_TIMEZONE})?',
    'LOGLEVEL': r'(?:%{LOGLEVEL:level}|%{SYSLOGPROG})',
    'IPORHOST': r'(?:%{IP}|%{HOSTNAME})',
    'NUMBER': r'(?:[+-]?(?:[0-9]+))',
}

class GrokParser(BaseParser):
    """Grok 模式解析器"""
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(config)
        self.pattern = config.get('pattern', '')
        self.patterns = dict(COMMON_PATTERNS)
        
        # 加载自定义模式
        custom_patterns = config.get('custom_patterns', {})
        self.patterns.update(custom_patterns)
    
    def parse(self, raw_log: str) -> ParseResult:
        """解析 Grok 格式日志"""
        if not self.pattern:
            return ParseResult(
                success=False,
                error="No Grok pattern configured",
                raw_log=raw_log
            )
        
        try:
            # 展开 Grok 模式
            expanded_pattern = self._expand_pattern(self.pattern)
            
            # 编译正则
            regex = self._compile_grok(expanded_pattern)
            match = regex.match(raw_log)
            
            if not match:
                return ParseResult(
                    success=False,
                    error="Pattern does not match",
                    raw_log=raw_log
                )
            
            result = {
                'raw_log': raw_log,
                'timestamp': self._extract_timestamp(match.groupdict()),
                'format_type': 'grok'
            }
            result.update(match.groupdict())
            
            return ParseResult(
                success=True,
                data=result,
                raw_log=raw_log,
                timestamp=result.get('timestamp', '')
            )
            
        except Exception as e:
            return ParseResult(
                success=False,
                error=f"Grok parse error: {str(e)}",
                raw_log=raw_log
            )
    
    def _expand_pattern(self, pattern: str) -> str:
        """展开 Grok 模式"""
        expanded = pattern
        max_iterations = 10
        
        for _ in range(max_iterations):
            new_expanded = expanded
            for name, pat in self.patterns.items():
                new_expanded = new_expanded.replace(f'%{{{name}}}', f'(?P<{name}>{pat})')
            
            # 处理带字段名的模式 %{PATTERN:field}
            new_expanded = re.sub(
                r'%\{(\w+):(\w+)\}',
                r'(?P<\2>{\1})',
                new_expanded
            )
            
            if new_expanded == expanded:
                break
            expanded = new_expanded
        
        return expanded
    
    def _compile_grok(self, pattern: str) -> re.Pattern:
        """编译 Grok 模式为正则"""
        # 处理 {PATTERN} 格式（已展开的）
        pattern = re.sub(r'\{(\w+)\}', r'(?P<\1>.*?)', pattern)
        # 处理可选字段 %{PATTERN:field}
        pattern = re.sub(r'%\{\w+:\w+\}', r'.*?', pattern)
        
        return re.compile(pattern)
    
    def _extract_timestamp(self, groups: Dict) -> str:
        """从解析结果中提取时间戳"""
        for key in ['timestamp', 'time', 'datetime', 'ts']:
            if key in groups:
                return groups[key]
        return ''
