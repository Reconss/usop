"""
Regex Parser - 正则表达式解析器
"""

import re
from typing import Dict, Any, List
from .base import BaseParser, ParseResult


class RegexParser(BaseParser):
    """正则表达式解析器"""
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(config)
        self.pattern = config.get('pattern', '')
        self.named_groups = config.get('named_groups', True)
        self.compiled_regex = None
        
        if self.pattern:
            try:
                self.compiled_regex = re.compile(self.pattern)
            except re.error as e:
                logger.error(f"Invalid regex pattern: {e}")
    
    def parse(self, raw_log: str) -> ParseResult:
        """解析正则表达式"""
        if not self.compiled_regex:
            return ParseResult(
                success=False,
                error="No regex pattern configured",
                raw_log=raw_log
            )
        
        try:
            match = self.compiled_regex.match(raw_log)
            
            if not match:
                return ParseResult(
                    success=False,
                    error="Pattern does not match",
                    raw_log=raw_log
                )
            
            result = {
                'raw_log': raw_log,
                'timestamp': self._extract_timestamp(match.groupdict()),
                'format_type': 'regex'
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
                error=f"Regex parse error: {str(e)}",
                raw_log=raw_log
            )

