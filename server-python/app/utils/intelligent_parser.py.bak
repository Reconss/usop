"""
智能解析模块

功能：
1. 自动格式检测 - 自动识别日志格式(JSON/Syslog/CSV/Grok等)
2. 智能字段提取 - 基于AI的模式识别和字段映射
3. 格式建议 - 根据样本日志推荐解析方案
4. 解析验证 - 验证解析配置的正确性
"""

import re
import json
import csv
import io
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
import statistics


class LogFormat(Enum):
    """检测到的日志格式"""
    JSON = "json"
    SYSLOG = "syslog"
    CEF = "cef"
    KEYVALUE = "keyvalue"
    CSV = "csv"
    GROK = "grok"
    REGEX = "regex"
    XML = "xml"
    UNKNOWN = "unknown"


@dataclass
class FormatMatch:
    """格式匹配结果"""
    format: LogFormat
    confidence: float  # 0-1
    pattern: Optional[str] = None
    sample_parsed: Optional[Dict[str, Any]] = None
    suggested_mapping: Dict[str, str] = field(default_factory=dict)
    suggested_config: Dict[str, Any] = field(default_factory=dict)


@dataclass
class FieldInfo:
    """字段信息"""
    name: str
    sample_values: List[Any] = field(default_factory=list)
    detected_type: str = "string"  # string, integer, float, boolean, ip, timestamp, email, url, hash
    frequency: int = 0
    examples: List[str] = field(default_factory=list)


class IntelligentParser:
    """智能解析器"""
    
    # 格式检测规则
    FORMAT_PATTERNS = {
        LogFormat.JSON: [
            (r'^\s*\{', 0.95),
            (r'^\s*\[', 0.9),
        ],
        LogFormat.SYSLOG: [
            (r'^<\d+>.*?\d{4}[-/]\d{2}[-/]\d{2}', 0.95),  # RFC5424
            (r'^\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}', 0.85),  # RFC3164
            (r'^\w+\s+\d+\s+\d{2}:\d{2}:\d{2}', 0.8),
        ],
        LogFormat.CEF: [
            (r'^CEF:\d+\|', 0.98),
        ],
        LogFormat.KEYVALUE: [
            (r'\w+=\S+', 0.7),
            (r'\w+=\d+', 0.65),
        ],
        LogFormat.CSV: [
            (r'^[^,]+(,[^,]+)+$', 0.6),
        ],
        LogFormat.XML: [
            (r'^\s*<[?!]?\w+', 0.95),
            (r'<[a-zA-Z][^>]*>.*</[a-zA-Z][^>]*>', 0.9),
        ],
    }
    
    # 常见字段类型检测模式
    TYPE_PATTERNS = {
        'ip': [
            (r'\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b', 0.99),
        ],
        'timestamp': [
            (r'\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}', 0.95),
            (r'\d{2}/\w{3}/\d{4}:\d{2}:\d{2}:\d{2}', 0.9),
            (r'\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}', 0.85),
        ],
        'email': [
            (r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', 0.98),
        ],
        'url': [
            (r'https?://[^\s<>"{}|\\^`\[\]]+', 0.95),
        ],
        'hash_md5': [
            (r'\b[a-fA-F0-9]{32}\b', 0.95),
        ],
        'hash_sha256': [
            (r'\b[a-fA-F0-9]{64}\b', 0.98),
        ],
        'integer': [
            (r'^-?\d+$', 0.8),
        ],
        'float': [
            (r'^-?\d+\.\d+$', 0.8),
        ],
        'boolean': [
            (r'^(true|false|yes|no|on|off)$', 0.95),
        ],
        'mac_address': [
            (r'([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}', 0.95),
        ],
        'uuid': [
            (r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', 0.98),
        ],
    }
    
    # 标准字段映射建议
    STANDARD_FIELD_MAPPING = {
        'src_ip': ['source_ip', 'srcip', 'sourceip', 'client_ip', 'cip', 'orig_ip', 'src_addr', 'source_address'],
        'dst_ip': ['dest_ip', 'dstip', 'destination_ip', 'target_ip', 'dip', 'dst_addr', 'destination_address', 'dest_address'],
        'src_port': ['source_port', 'srcport', 'sport', 'sourcePort', 'src_port', 'orig_port', 'source_port'],
        'dst_port': ['dest_port', 'dstport', 'dport', 'destinationPort', 'dst_port', 'dest_port'],
        'hostname': ['host', 'hostname', 'computer', 'server_name', 'device', 'endpoint', 'server', 'name'],
        'username': ['user', 'username', 'account', 'login_name', 'usr', 'user_name', 'account_name', 'account_name', 'login'],
        'severity': ['level', 'priority', 'risk_level', 'alert_level', 'criticity', 'threat_level', 'severity', 'loglevel'],
        'alert_name': ['title', 'name', 'event_type', 'rule_name', 'alertname', 'signature', 'msg', 'event_name', 'action'],
        'message': ['msg', 'description', 'detail', 'info', 'content', 'log', 'text', 'message', 'log_message'],
        'protocol': ['proto', 'network_protocol', 'networkProtocol', 'l4_protocol', 'protocol', 'l4_proto'],
        'action': ['action_taken', 'action_type', 'event_action', 'outcome', 'result', 'action', 'action_type'],
        'url': ['uri', 'url', 'request_uri', 'path', 'request_path', 'request_url', 'url_path'],
        'user_agent': ['user_agent', 'ua', 'http_user_agent', 'browser', 'user_agent_string'],
        'country': ['country', 'geo_country', 'src_country', 'location', 'geo_location'],
        'timestamp': ['timestamp', 'time', '@timestamp', 'datetime', 'date', 'ctime', 'created_at', 'event_time', 'log_time'],
    }
    
    def __init__(self):
        self.field_stats: Dict[str, FieldInfo] = {}
    
    def detect_format(self, samples: List[str]) -> FormatMatch:
        """检测日志格式"""
        if not samples:
            return FormatMatch(format=LogFormat.UNKNOWN, confidence=0.0)
        
        scores: Dict[LogFormat, List[float]] = {f: [] for f in LogFormat}
        
        for sample in samples[:50]:  # 最多分析50条样本
            sample = sample.strip()
            if not sample:
                continue
            
            for fmt, patterns in self.FORMAT_PATTERNS.items():
                for pattern, base_score in patterns:
                    if re.search(pattern, sample):
                        scores[fmt].append(base_score)
        
        # 选择得分最高的格式
        best_format = LogFormat.UNKNOWN
        best_score = 0.0
        
        for fmt, fmt_scores in scores.items():
            if fmt_scores:
                avg_score = statistics.mean(fmt_scores)
                if avg_score > best_score:
                    best_score = avg_score
                    best_format = fmt
        
        # 生成解析配置
        suggested_config = self._generate_config(best_format, samples)
        
        return FormatMatch(
            format=best_format,
            confidence=best_score,
            suggested_config=suggested_config
        )
    
    def analyze_fields(self, samples: List[str], format_hint: LogFormat = None) -> Dict[str, FieldInfo]:
        """分析样本中的字段"""
        self.field_stats = {}
        
        for sample in samples[:100]:  # 最多分析100条样本
            sample = sample.strip()
            if not sample:
                continue
            
            fields = self._extract_fields(sample, format_hint)
            for name, value in fields.items():
                if name not in self.field_stats:
                    self.field_stats[name] = FieldInfo(name=name)
                
                info = self.field_stats[name]
                info.frequency += 1
                info.sample_values.append(value)
                if len(info.examples) < 3:
                    info.examples.append(str(value)[:50])
        
        # 检测字段类型
        for name, info in self.field_stats.items():
            info.detected_type = self._detect_field_type(info.sample_values)
        
        return self.field_stats
    
    def suggest_mapping(self, fields: Dict[str, FieldInfo]) -> Dict[str, str]:
        """建议字段映射到标准字段"""
        mapping = {}
        
        for field_name, info in fields.items():
            field_lower = field_name.lower()
            
            for std_field, variants in self.STANDARD_FIELD_MAPPING.items():
                if field_lower in variants or field_lower == std_field.replace('_', ''):
                    mapping[field_name] = std_field
                    break
        
        return mapping
    
    def generate_grok_pattern(self, samples: List[str]) -> str:
        """根据样本生成Grok模式"""
        fields = self.analyze_fields(samples)
        
        pattern_parts = []
        for name, info in sorted(fields.items(), key=lambda x: x[1].frequency, reverse=True):
            if info.frequency < len(samples) * 0.3:  # 出现频率低于30%的字段不包含在模式中
                continue
            
            grok_type = self._get_grok_type(info.detected_type)
            pattern_parts.append(f'(?P<{name}>{grok_type})')
        
        return ' '.join(pattern_parts)
    
    def validate_and_test(self, sample: str, format_type: str, config: Dict[str, Any]) -> Tuple[bool, Dict[str, Any], str]:
        """验证和测试解析配置
        
        Returns:
            (是否成功, 解析结果, 错误信息)
        """
        from app.utils.parser import LogProcessor
        
        try:
            processor = LogProcessor(format_type, config)
            result = processor.process(sample)
            
            if result and 'error' not in result:
                return True, result, ""
            else:
                return False, result, result.get('error', '解析失败')
        except Exception as e:
            return False, {}, str(e)
    
    def suggest_format_for_product(self, product_name: str) -> List[FormatMatch]:
        """根据产品名称建议格式"""
        suggestions = []
        
        # 常见产品的解析配置
        product_formats = {
            'firewall': [
                FormatMatch(format=LogFormat.SYSLOG, confidence=0.9, 
                           suggested_config={'format': 'syslog'}),
                FormatMatch(format=LogFormat.CEF, confidence=0.85,
                           suggested_config={'format': 'cef'}),
            ],
            'waf': [
                FormatMatch(format=LogFormat.JSON, confidence=0.95,
                           suggested_config={'timestamp_field': '@timestamp'}),
                FormatMatch(format=LogFormat.KEYVALUE, confidence=0.8,
                           suggested_config={'delimiter': ' '}),
            ],
            'ids': [
                FormatMatch(format=LogFormat.JSON, confidence=0.9,
                           suggested_config={'format': 'json'}),
                FormatMatch(format=LogFormat.SYSLOG, confidence=0.85,
                           suggested_config={'format': 'syslog'}),
            ],
            'ips': [
                FormatMatch(format=LogFormat.JSON, confidence=0.9,
                           suggested_config={'format': 'json'}),
                FormatMatch(format=LogFormat.SYSLOG, confidence=0.85,
                           suggested_config={'format': 'syslog'}),
            ],
            'siem': [
                FormatMatch(format=LogFormat.JSON, confidence=0.95,
                           suggested_config={'timestamp_field': '@timestamp'}),
            ],
            'nginx': [
                FormatMatch(format=LogFormat.GROK, confidence=0.95,
                           suggested_config={'pattern': '%{IPV4:client_ip} - %{WORD:user} \\[%{HTTPDATE:timestamp}\\] "%{WORD:method} %{URIPATHPARAM:request} HTTP/%{NUMBER:http_version}" %{NUMBER:status:int} %{NUMBER:bytes:int}'}),
            ],
            'apache': [
                FormatMatch(format=LogFormat.GROK, confidence=0.95,
                           suggested_config={'pattern': '%{IPV4:client_ip} - %{DATA:user} \\[%{HTTPDATE:timestamp}\\] "%{WORD:method} %{URIPATHPARAM:request} HTTP/%{NUMBER:http_version}" %{NUMBER:status:int} %{NUMBER:bytes:int}'}),
            ],
            'audit': [
                FormatMatch(format=LogFormat.SYSLOG, confidence=0.9,
                           suggested_config={'format': 'syslog'}),
                FormatMatch(format=LogFormat.KEYVALUE, confidence=0.85,
                           suggested_config={'delimiter': ' '}),
            ],
        }
        
        product_lower = product_name.lower()
        for key, formats in product_formats.items():
            if key in product_lower:
                suggestions.extend(formats)
        
        if not suggestions:
            # 默认返回JSON和Syslog
            suggestions = [
                FormatMatch(format=LogFormat.JSON, confidence=0.8,
                           suggested_config={'timestamp_field': 'timestamp'}),
                FormatMatch(format=LogFormat.SYSLOG, confidence=0.7,
                           suggested_config={'format': 'syslog'}),
            ]
        
        return suggestions
    
    def _extract_fields(self, sample: str, format_hint: LogFormat) -> Dict[str, Any]:
        """根据格式提取字段"""
        if format_hint == LogFormat.JSON or format_hint is None:
            # 尝试JSON解析
            try:
                data = json.loads(sample)
                if isinstance(data, dict):
                    return data
            except json.JSONDecodeError:
                pass
        
        if format_hint == LogFormat.SYSLOG or format_hint is None:
            # 尝试Syslog解析
            fields = self._extract_syslog_fields(sample)
            if fields:
                return fields
        
        if format_hint == LogFormat.KEYVALUE or format_hint is None:
            # 尝试键值对解析
            fields = self._extract_keyvalue_fields(sample)
            if len(fields) > 1:
                return fields
        
        if format_hint == LogFormat.CSV:
            # CSV解析
            return self._extract_csv_fields(sample)
        
        return {'raw_message': sample}
    
    def _extract_syslog_fields(self, sample: str) -> Optional[Dict[str, Any]]:
        """提取Syslog格式字段"""
        patterns = [
            r'^<(?P<priority>\d+)>(?P<version>\d+)\s+(?P<timestamp>\S+)\s+(?P<hostname>\S+)\s+(?P<app>\S+)\s+(?P<procid>\S+)\s+(?P<msgid>\S+)\s+(?P<structured_data>\[.*?\]|-)\s*(?P<message>.*)$',
            r'^(?P<timestamp>\w+\s+\d+\s+\d+:\d+:\d+)\s+(?P<hostname>\S+)\s+(?P<app_name>\S+?)(?:\[(?P<procid>\d+)\])?:\s+(?P<message>.*)$',
        ]
        
        for pattern in patterns:
            match = re.match(pattern, sample)
            if match:
                return {k: v for k, v in match.groupdict().items() if v}
        
        return None
    
    def _extract_keyvalue_fields(self, sample: str) -> Dict[str, Any]:
        """提取键值对格式字段"""
        fields = {}
        
        # 支持多种分隔符
        pairs = re.split(r'[\s,;]+', sample)
        for pair in pairs:
            if '=' in pair:
                key, _, value = pair.partition('=')
                fields[key.strip()] = value.strip().strip('"\'')
        
        return fields
    
    def _extract_csv_fields(self, sample: str) -> Dict[str, Any]:
        """提取CSV格式字段"""
        fields = {}
        
        reader = csv.reader(io.StringIO(sample))
        try:
            row = next(reader)
            for i, value in enumerate(row):
                fields[f'field_{i}'] = value.strip().strip('"\'')
        except (csv.Error, StopIteration):
            pass
        
        return fields
    
    def _detect_field_type(self, values: List[Any]) -> str:
        """检测字段类型"""
        if not values:
            return 'string'
        
        # 检查所有值的类型
        non_empty_values = [v for v in values if v is not None and str(v).strip()]
        if not non_empty_values:
            return 'string'
        
        for field_type, patterns in self.TYPE_PATTERNS.items():
            for pattern, score in patterns:
                match_count = 0
                for value in non_empty_values[:10]:  # 只检查前10个值
                    if re.search(pattern, str(value)):
                        match_count += 1
                
                if match_count >= len(non_empty_values[:10]) * 0.7:  # 70%匹配
                    return field_type
        
        # 尝试Python类型检测
        try:
            for value in non_empty_values[:5]:
                int(value)
            return 'integer'
        except (ValueError, TypeError):
            pass
        
        try:
            for value in non_empty_values[:5]:
                float(value)
            return 'float'
        except (ValueError, TypeError):
            pass
        
        unique_values = set(str(v).lower() for v in non_empty_values)
        if unique_values <= {'true', 'false', 'yes', 'no', 'on', 'off'}:
            return 'boolean'
        
        return 'string'
    
    def _get_grok_type(self, field_type: str) -> str:
        """获取Grok类型"""
        type_mapping = {
            'ip': '%{IP}',
            'timestamp': '%{TIMESTAMP_ISO8601}',
            'email': '%{EMAILADDRESS}',
            'url': '%{URI}',
            'hash_md5': '%{MD5}',
            'hash_sha256': '%{SHA256}',
            'integer': '%{INT}',
            'float': '%{NUMBER}',
            'boolean': '%{WORD}',
            'mac_address': '%{MAC}',
            'uuid': '%{UUID}',
        }
        return type_mapping.get(field_type, '%{DATA}')
    
    def _generate_config(self, fmt: LogFormat, samples: List[str]) -> Dict[str, Any]:
        """生成解析配置"""
        config = {}
        
        if fmt == LogFormat.JSON:
            config = {'timestamp_field': 'timestamp', 'encoding': 'utf-8'}
        elif fmt == LogFormat.SYSLOG:
            config = {'format': 'RFC5424', 'timestamp_field': 'timestamp'}
        elif fmt == LogFormat.KEYVALUE:
            config = {'delimiter': ' ', 'kv_separator': '='}
        elif fmt == LogFormat.CSV:
            # 尝试从第一条样本推断CSV表头
            if samples:
                fields = self._extract_csv_fields(samples[0])
                if fields:
                    config = {'headers': list(fields.keys()), 'delimiter': ','}
        elif fmt == LogFormat.GROK:
            # 生成Grok模式
            pattern = self.generate_grok_pattern(samples)
            config = {'pattern': pattern}
        
        return config


# 全局实例
intelligent_parser = IntelligentParser()


# 快捷函数
def auto_detect_format(samples: List[str]) -> FormatMatch:
    """自动检测格式"""
    return intelligent_parser.detect_format(samples)


def analyze_log_fields(samples: List[str], format_hint: LogFormat = None) -> Dict[str, FieldInfo]:
    """分析日志字段"""
    return intelligent_parser.analyze_fields(samples, format_hint)


def suggest_field_mapping(samples: List[str]) -> Dict[str, str]:
    """建议字段映射"""
    fields = intelligent_parser.analyze_fields(samples)
    return intelligent_parser.suggest_mapping(fields)


def generate_parse_config(samples: List[str], format_type: str = None) -> Dict[str, Any]:
    """生成解析配置"""
    if format_type:
        fmt = LogFormat(format_type)
    else:
        match = intelligent_parser.detect_format(samples)
        fmt = match.format
    
    return intelligent_parser._generate_config(fmt, samples)
