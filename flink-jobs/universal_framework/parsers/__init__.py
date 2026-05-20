"""
Parsers - Dynamic Log Parsers
"""

from .base import BaseParser, ParseResult
from .json_parser import JSONParser
from .syslog_parser import SyslogParser
from .grok_parser import GrokParser
from .regex_parser import RegexParser
from .keyvalue_parser import KeyValueParser

__all__ = [
    'BaseParser', 'ParseResult',
    'JSONParser', 'SyslogParser', 'GrokParser', 
    'RegexParser', 'KeyValueParser',
    'get_parser'
]

def get_parser(format_type: str, config: dict = None) -> BaseParser:
    """获取解析器实例"""
    parsers = {
        'json': JSONParser,
        'syslog': SyslogParser,
        'syslog_rfc5424': SyslogParser,
        'syslog_rfc3164': SyslogParser,
        'grok': GrokParser,
        'regex': RegexParser,
        'keyvalue': KeyValueParser,
    }
    
    parser_class = parsers.get(format_type.lower(), JSONParser)
    return parser_class(config or {})

