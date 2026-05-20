"""
Syslog Parser - Syslog 格式日志解析器
"""

import re
from datetime import datetime
from typing import Dict, Any, Optional
from .base import BaseParser, ParseResult


class SyslogParser(BaseParser):
    """Syslog 格式解析器"""
    
    # RFC 5424 正则
    RFC5424_PATTERN = re.compile(
        r'^<(?P<priority>\d+)>'
        r'(?P<version>\d+)\s+'
        r'(?P<timestamp>\S+)\s+'
        r'(?P<hostname>\S+)\s+'
        r'(?P<app_name>\S+)\s+'
        r'(?P<procid>\S+)\s+'
        r'(?P<msgid>\S+)\s+'
        r'(?P<structured_data>\[.*?\]|-)\s*'
        r'(?P<message>.*)$'
    )
    
    # RFC 3164 正则
    RFC3164_PATTERN = re.compile(
        r'^(?P<timestamp>\w+\s+\d+\s+\d+:\d+:\d+)\s+'
        r'(?P<hostname>\S+)\s+'
        r'(?P<app_name>\S+?)'
        r'(?:\[(?P<procid>\d+)\])?:\s+'
        r'(?P<message>.*)$'
    )
    
    # 标准 syslog 正则
    STANDARD_PATTERN = re.compile(
        r'^(?P<timestamp>\w+\s+\d+\s+\d+:\d+:\d+)\s+'
        r'(?P<hostname>\S+)\s+'
        r'(?P<app_name>\S+?)(?:\[(?P<procid>\d+)\])?:\s+'
        r'(?P<message>.*)$'
    )
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(config)
        self.syslog_version = config.get('syslog_version', 'auto')  # auto, rfc5424, rfc3164
    
    def parse(self, raw_log: str) -> ParseResult:
        """解析 Syslog 日志"""
        try:
            # 自动检测版本
            if self.syslog_version == 'auto':
                version = self._detect_version(raw_log)
            else:
                version = self.syslog_version
            
            if version == 'rfc5424':
                result = self._parse_rfc5424(raw_log)
            elif version == 'rfc3164':
                result = self._parse_rfc3164(raw_log)
            else:
                # 尝试 RFC5424，再尝试 RFC3164
                result = self._parse_rfc5424(raw_log)
                if not result.success:
                    result = self._parse_rfc3164(raw_log)
            
            return result
            
        except Exception as e:
            return ParseResult(
                success=False,
                error=str(e),
                raw_log=raw_log
            )
    
    def _detect_version(self, raw_log: str) -> str:
        """检测 Syslog 版本"""
        if raw_log.strip().startswith('<'):
            return 'rfc5424'
        return 'rfc3164'
    
    def _parse_rfc5424(self, raw_log: str) -> ParseResult:
        """解析 RFC 5424 格式"""
        match = self.RFC5424_PATTERN.match(raw_log.strip())
        if not match:
            return ParseResult(
                success=False,
                error="Not a valid RFC 5424 syslog",
                raw_log=raw_log
            )
        
        groups = match.groupdict()
        priority = int(groups.get('priority', 0))
        facility = priority >> 3
        severity = priority & 0x07
        
        result = {
            'raw_log': raw_log,
            'timestamp': groups.get('timestamp'),
            'hostname': groups.get('hostname'),
            'app_name': groups.get('app_name'),
            'proc_id': groups.get('procid'),
            'msgid': groups.get('msgid'),
            'message': groups.get('message'),
            'facility': facility,
            'severity': severity,
            'format_type': 'syslog_rfc5424'
        }
        
        return ParseResult(
            success=True,
            data=result,
            raw_log=raw_log,
            timestamp=result['timestamp']
        )
    
    def _parse_rfc3164(self, raw_log: str) -> ParseResult:
        """解析 RFC 3164 格式"""
        match = self.RFC3164_PATTERN.match(raw_log.strip())
        if not match:
            return ParseResult(
                success=False,
                error="Not a valid RFC 3164 syslog",
                raw_log=raw_log
            )
        
        groups = match.groupdict()
        
        result = {
            'raw_log': raw_log,
            'timestamp': groups.get('timestamp'),
            'hostname': groups.get('hostname'),
            'app_name': groups.get('app_name'),
            'proc_id': groups.get('procid'),
            'message': groups.get('message'),
            'format_type': 'syslog_rfc3164'
        }
        
        return ParseResult(
            success=True,
            data=result,
            raw_log=raw_log,
            timestamp=result['timestamp']
        )
