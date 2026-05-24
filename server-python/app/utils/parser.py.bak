import re
import json
import csv
import io
from datetime import datetime
from typing import Dict, Any, List, Optional, Callable
from enum import Enum


class InputType(Enum):
    """输入类型"""
    WEBHOOK = "webhook"           # HTTP Webhook 接收
    KAFKA = "kafka"               # Kafka 消费
    SYSLOG = "syslog"             # Syslog 接收
    FILE = "file"                 # 文件监控
    REDIS = "redis"               # Redis 队列
    SOCKET = "socket"             # TCP/UDP Socket
    MANUAL = "manual"             # 手动输入


class OutputType(Enum):
    """输出类型"""
    ALERT = "alert"               # 告警日志
    EVENT = "event"               # 安全事件
    METRIC = "metric"             # 指标数据
    FLOW = "flow"                 # 网络流量


class ParserBase:
    """解析器基类"""
    
    def parse(self, raw_log: str) -> Dict[str, Any]:
        raise NotImplementedError
    
    @staticmethod
    def extract_by_regex(raw_log: str, pattern: str) -> Dict[str, Any]:
        """使用正则提取字段"""
        result = {'raw_log': raw_log}
        try:
            match = re.match(pattern, raw_log, re.DOTALL)
            if match:
                result.update(match.groupdict())
        except Exception:
            pass
        return result


class JSONParser(ParserBase):
    """JSON格式解析器"""
    
    def parse(self, raw_log: str) -> Dict[str, Any]:
        result = {'raw_log': raw_log, 'parsed_at': datetime.utcnow().isoformat()}
        
        try:
            data = json.loads(raw_log)
            if isinstance(data, dict):
                result.update(data)
                # 提取时间戳
                result['timestamp'] = self._extract_timestamp(data)
            elif isinstance(data, list):
                result['events'] = data
                result['timestamp'] = datetime.utcnow().isoformat()
        except json.JSONDecodeError:
            result['message'] = raw_log
            result['timestamp'] = datetime.utcnow().isoformat()
        
        return result
    
    def _extract_timestamp(self, data: Dict) -> str:
        for key in ['@timestamp', 'timestamp', 'time', 'datetime', 'date', 'ctime', 'created_at']:
            if key in data:
                return str(data[key])
        return datetime.utcnow().isoformat()


class SyslogParser(ParserBase):
    """Syslog格式解析器"""
    
    # RFC5424: <priority>version timestamp host app proc msgid [structured] msg
    RFC5424 = r'^<(?P<priority>\d+)>(?P<version>\d+)\s+(?P<timestamp>\S+)\s+(?P<hostname>\S+)\s+(?P<app_name>\S+)\s+(?P<procid>\S+)\s+(?P<msgid>\S+)\s+(?P<structured_data>\[.*?\]|-)\s*(?P<message>.*)$'
    
    # RFC3164: timestamp host app[procid]: message
    RFC3164 = r'^(?P<timestamp>\w+\s+\d+\s+\d+:\d+:\d+)\s+(?P<hostname>\S+)\s+(?P<app_name>\S+?)(?:\[(?P<procid>\d+)\])?:\s+(?P<message>.*)$'
    
    # CEF格式: CEF:Version|Device Vendor|Device Product|Device Version|Signature ID|Name|Severity|Extension
    CEF = r'^CEF:(?P<version>\d+)\|(?P<vendor>[^|]+)\|(?P<product>[^|]+)\|(?P<version2>[^|]+)\|(?P<signature_id>[^|]+)\|(?P<name>[^|]+)\|(?P<severity>\d+)\|(?P<extension>.*)$'
    
    def parse(self, raw_log: str) -> Dict[str, Any]:
        result = {'raw_log': raw_log, 'parsed_at': datetime.utcnow().isoformat()}
        
        # 尝试CEF格式
        if raw_log.startswith('CEF:'):
            return self._parse_cef(raw_log)
        
        # 尝试RFC5424
        match = re.match(self.RFC5424, raw_log)
        if match:
            return self._parse_rfc5424(match, result)
        
        # 尝试RFC3164
        match = re.match(self.RFC3164, raw_log)
        if match:
            return self._parse_rfc3164(match, result)
        
        # 尝试时间戳开头的自定义格式
        return self._parse_custom(raw_log, result)
    
    @staticmethod
    def _extract_kv_from_message(message: str) -> Dict[str, str]:
        """从消息体中提取 key=value 对"""
        kv = {}
        if not message:
            return kv
        # 匹配 key=value 或 key="value" 或 key='value'
        for m in re.finditer(r'(\w+)=("[^"]*"|\'[^\']*\'|\S+)', message):
            key = m.group(1)
            val = m.group(2).strip('"\'')
            if val and len(val) < 500:
                kv[key] = val
        return kv

    def _parse_rfc5424(self, match, result: Dict) -> Dict[str, Any]:
        groups = match.groupdict()
        priority = int(groups.get('priority', 0))
        message = groups.get('message', '')

        result.update({
            'format': 'RFC5424',
            'hostname': groups.get('hostname'),
            'app_name': groups.get('app_name'),
            'procid': groups.get('procid'),
            'msgid': groups.get('msgid'),
            'message': message,
            'facility': priority >> 3,
            'severity': priority & 7,
            'timestamp': self._parse_timestamp(groups.get('timestamp', ''))
        })
        # 从消息体提取 key=value 对
        result.update(self._extract_kv_from_message(message))
        return result

    def _parse_rfc3164(self, match, result: Dict) -> Dict[str, Any]:
        groups = match.groupdict()
        message = groups.get('message', '')
        result.update({
            'format': 'RFC3164',
            'hostname': groups.get('hostname'),
            'app_name': groups.get('app_name'),
            'procid': groups.get('procid'),
            'message': message,
            'timestamp': self._parse_timestamp(groups.get('timestamp', ''))
        })
        result.update(self._extract_kv_from_message(message))
        return result
    
    def _parse_cef(self, raw_log: str) -> Dict[str, Any]:
        result = {'raw_log': raw_log, 'format': 'CEF', 'parsed_at': datetime.utcnow().isoformat()}
        match = re.match(self.CEF, raw_log)
        if match:
            groups = match.groupdict()
            result.update({
                'vendor': groups.get('vendor', '').strip(),
                'product': groups.get('product', '').strip(),
                'signature_id': groups.get('signature_id', '').strip(),
                'name': groups.get('name', '').strip(),
                'severity': self._cef_severity(int(groups.get('severity', 0))),
                'timestamp': datetime.utcnow().isoformat()
            })
            # 解析扩展字段 key=value（按空格分词后逐项解析，避免贪婪匹配）
            extension = groups.get('extension', '')
            tokens = extension.split()
            current_key = None
            for token in tokens:
                if '=' in token:
                    key, _, val = token.partition('=')
                    result[key.strip()] = val.strip()
                    current_key = key.strip()
                elif current_key:
                    # 续接上一字段的值（如含空格的 msg="..." 已按引号处理）
                    result[current_key] += ' ' + token
        return result
    
    def _parse_custom(self, raw_log: str, result: Dict) -> Dict[str, Any]:
        # 尝试匹配常见的时间戳格式
        patterns = [
            (r'^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[^\s]*)\s+(.*)$', ['timestamp', 'message']),
            (r'^(\w+\s+\d+\s+\d+:\d+:\d+)\s+(.*)$', ['timestamp', 'message']),
        ]
        for pattern, keys in patterns:
            match = re.match(pattern, raw_log)
            if match:
                for i, key in enumerate(keys):
                    result[key] = match.group(i + 1)
                break
        
        if 'message' not in result:
            result['message'] = raw_log
        if 'timestamp' not in result:
            result['timestamp'] = datetime.utcnow().isoformat()
        return result
    
    @staticmethod
    def _parse_timestamp(ts_str: str) -> str:
        if not ts_str:
            return datetime.utcnow().isoformat()
        
        formats = [
            '%Y-%m-%dT%H:%M:%S.%fZ', '%Y-%m-%dT%H:%M:%SZ', '%Y-%m-%dT%H:%M:%S',
            '%Y-%m-%d %H:%M:%S', '%b %d %H:%M:%S', '%Y/%m/%d %H:%M:%S'
        ]
        for fmt in formats:
            try:
                return datetime.strptime(ts_str.split('.')[0], fmt).isoformat()
            except:
                continue
        return ts_str
    
    @staticmethod
    def _cef_severity(level: int) -> int:
        """CEF严重级别转1-5"""
        mapping = {0: 5, 1: 4, 2: 4, 3: 3, 4: 3, 5: 2, 6: 2, 7: 1, 8: 1, 9: 1, 10: 1}
        return mapping.get(level, 3)


class KeyValueParser(ParserBase):
    """键值对格式解析器"""
    
    def parse(self, raw_log: str) -> Dict[str, Any]:
        result = {'raw_log': raw_log, 'parsed_at': datetime.utcnow().isoformat()}
        
        # 支持多种分隔符
        pairs = re.split(r'[\s,;]+', raw_log)
        for pair in pairs:
            if '=' in pair:
                key, _, value = pair.partition('=')
                result[key.strip()] = value.strip().strip('"\'')
        
        if 'message' not in result:
            result['message'] = raw_log
        if 'timestamp' not in result:
            result['timestamp'] = datetime.utcnow().isoformat()
        
        return result


class CSVParser(ParserBase):
    """CSV格式解析器"""
    
    def __init__(self, headers: List[str] = None, delimiter: str = ','):
        self.headers = headers or []
        self.delimiter = delimiter
    
    def parse(self, raw_log: str) -> Dict[str, Any]:
        result = {'raw_log': raw_log, 'parsed_at': datetime.utcnow().isoformat()}
        
        reader = csv.reader(io.StringIO(raw_log), delimiter=self.delimiter)
        try:
            row = next(reader)
            if self.headers and len(self.headers) == len(row):
                for i, value in enumerate(row):
                    result[self.headers[i]] = value.strip().strip('"\'')
            else:
                for i, value in enumerate(row):
                    result[f'field_{i}'] = value.strip().strip('"\'')
        except (csv.Error, StopIteration):
            result['message'] = raw_log
        
        return result


class GrokParser(ParserBase):
    """Grok模式解析器"""
    
    # 常用Grok模式
    PATTERNS = {
        'IPV4': r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}',
        'IPV6': r'(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}',
        'HOSTNAME': r'\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}\b',
        'WORD': r'\w+',
        'NUMBER': r'[+-]?\d+(?:\.\d+)?',
        'TIMESTAMP': r'\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?',
        'ISO8601': r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?',
        'HTTPDATE': r'\d{2}/[a-zA-Z]{3}/\d{4}:\d{2}:\d{2}:\d{2}',
        'SYSLOGDATE': r'\w+\s+\d+\s+\d{2}:\d{2}:\d{2}',
    }
    
    def parse(self, raw_log: str) -> Dict[str, Any]:
        result = {'raw_log': raw_log, 'parsed_at': datetime.utcnow().isoformat()}
        
        grok_pattern = self.config.get('pattern', '') if hasattr(self, 'config') else ''
        if not grok_pattern:
            result['message'] = raw_log
            return result
        
        # 转换Grok模式
        pattern = grok_pattern
        for name, regex in self.PATTERNS.items():
            pattern = pattern.replace(f'%{{{name}}}', regex)
            pattern = re.sub(rf'%{{\s*{name}:(\w+)\s*}}', f'(?P<\\1>{regex})', pattern)
        
        match = re.match(pattern, raw_log)
        if match:
            result.update(match.groupdict())
        
        return result


class Normalizer:
    """告警字段标准化"""
    
    # 字段映射表
    FIELD_MAPPING = {
        'src_ip': ['source_ip', 'srcip', 'sourceip', 'client_ip', 'clientip', 'cip', 'src_ip', 'srcip', ' origination', 'orig_ip', 'src', 'sip'],
        'dst_ip': ['dest_ip', 'dstip', 'destination_ip', 'target_ip', 'targetip', 'dip', 'dst_ip', 'destination', 'destaddr', 'dst', 'dip'],
        'src_port': ['source_port', 'srcport', 'sport', 'sourcePort', 'src_port', 'orig_port', 'spt'],
        'dst_port': ['dest_port', 'dstport', 'dport', 'destinationPort', 'dst_port', 'dest_port', 'dpt'],
        'hostname': ['host', 'hostname', 'computer', 'server_name', 'device', 'endpoint', 'dhost', 'shost'],
        'username': ['user', 'username', 'account', 'login_name', 'usr', 'user_name', 'account_name', 'suser', 'duser'],
        'severity': ['level', 'priority', 'risk_level', 'alert_level', 'criticity', 'threat_level', 'sev', 'severity'],
        'alert_name': ['title', 'name', 'event_type', 'rule_name', 'alertname', 'signature', 'msg', 'event_name'],
        'message': ['msg', 'description', 'detail', 'info', 'content', 'log', 'text', 'message'],
        'protocol': ['proto', 'network_protocol', 'networkProtocol', 'l4_protocol', 'protocol', 'app'],
        'action': ['action_taken', 'action_type', 'event_action', 'outcome', 'result', 'act', 'action', 'deviceAction'],
        'url': ['uri', 'url', 'request_uri', 'path', 'request_path', 'request'],
        'user_agent': ['user_agent', 'ua', 'http_user_agent', 'browser', 'agent'],
        'country': ['country', 'geo_country', 'src_country', 'location', 'srcGeo'],
        'asn': ['asn', 'as_number', 'autonomous_system', 'srcASN'],
    }
    
    # 严重级别映射
    SEVERITY_MAP = {
        'critical': 1, 'crit': 1, 'fatal': 1, 'emergency': 1, 'emerg': 1, '0': 1, '1': 1,
        'high': 2, 'error': 2, 'major': 2, '2': 2,
        'medium': 3, 'moderate': 3, 'warning': 3, 'warn': 3, '3': 3,
        'low': 4, 'minor': 4, 'info': 4, '4': 4,
        'debug': 5, 'trace': 5, 'verbose': 5, '5': 5,
    }
    
    @classmethod
    def normalize(cls, parsed: Dict[str, Any]) -> Dict[str, Any]:
        """标准化解析结果"""
        normalized = {
            'raw_log': parsed.get('raw_log', ''),
            'timestamp': parsed.get('timestamp') or datetime.utcnow().isoformat(),
            'parsed_at': datetime.utcnow().isoformat()
        }
        
        # 字段映射
        for std_field, alt_fields in cls.FIELD_MAPPING.items():
            for alt in alt_fields:
                if alt in parsed:
                    normalized[std_field] = parsed[alt]
                    break
        
        # 标准化严重级别
        if 'severity' in normalized:
            normalized['severity'] = cls._normalize_severity(normalized['severity'])
        
        # 标准化IP地址
        if 'src_ip' in normalized:
            normalized['src_ip'] = cls._normalize_ip(normalized['src_ip'])
        if 'dst_ip' in normalized:
            normalized['dst_ip'] = cls._normalize_ip(normalized['dst_ip'])
        
        # 提取IOC
        ioc_type, ioc_value = cls._extract_ioc(normalized)
        normalized['ioc_type'] = ioc_type
        normalized['ioc_value'] = ioc_value
        
        # 其他字段放入details
        details = {
            k: v for k, v in parsed.items()
            if k not in normalized and k not in ['raw_log', 'parsed_at']
        }
        if details:
            normalized['details'] = details
        
        return normalized
    
    @staticmethod
    def _normalize_severity(severity: Any) -> int:
        if isinstance(severity, int):
            if severity > 10:
                return max(1, min(5, (100 - severity) // 20 + 1))
            return max(1, min(5, abs(severity)))
        
        return Normalizer.SEVERITY_MAP.get(str(severity).lower().strip(), 3)
    
    @staticmethod
    def _normalize_ip(ip: str) -> str:
        if not ip:
            return ''
        # 清理IP地址
        ip = ip.strip()
        # 移除端口
        if ':' in ip and '.' in ip:
            # IPv6:port 格式
            if ip.count(':') > 1:
                ip = ip.rsplit(':', 1)[0]
        elif ':' in ip and '.' not in ip:
            # 纯IPv6
            pass
        else:
            ip = ip.split(':')[0] if ':' in ip else ip
        return ip
    
    @staticmethod
    def _extract_ioc(data: Dict[str, Any]) -> tuple:
        """提取IOC信息"""
        # IP地址
        ip_pattern = r'\b(?:\d{1,3}\.){3}\d{1,3}\b'
        # 域名
        domain_pattern = r'\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}\b'
        # MD5
        md5_pattern = r'\b[a-fA-F0-9]{32}\b'
        # SHA256
        sha256_pattern = r'\b[a-fA-F0-9]{64}\b'
        # URL
        url_pattern = r'https?://[^\s<>"{}|\\^`\[\]]+'
        
        message = str(data.get('message', ''))
        
        # 优先提取URL
        url_match = re.search(url_pattern, message)
        if url_match:
            return ('url', url_match.group())
        
        # 提取IP
        ip_match = re.search(ip_pattern, message)
        if ip_match:
            ip = ip_match.group()
            if not ip.startswith('0.') and not ip.startswith('255.'):
                return ('ip', ip)
        
        # 提取域名
        domain_match = re.search(domain_pattern, message)
        if domain_match:
            return ('domain', domain_match.group())
        
        # 提取Hash
        sha_match = re.search(sha256_pattern, message)
        if sha_match:
            return ('sha256', sha_match.group())
        
        md5_match = re.search(md5_pattern, message)
        if md5_match:
            return ('md5', md5_match.group())
        
        return (None, None)


class LogProcessor:
    """日志处理器"""
    
    PARSERS = {
        'json': JSONParser,
        'syslog': SyslogParser,
        'cef': SyslogParser,
        'keyvalue': KeyValueParser,
        'csv': CSVParser,
        'grok': GrokParser,
    }
    
    def __init__(self, format_type: str = 'json', config: Dict[str, Any] = None):
        self.format_type = format_type
        self.config = config or {}
        self.parser = self._create_parser()
        self.normalizer = Normalizer()
    
    def _create_parser(self) -> ParserBase:
        parser_class = self.PARSERS.get(self.format_type.lower(), JSONParser)
        
        if self.format_type.lower() == 'csv':
            return CSVParser(
                headers=self.config.get('headers', []),
                delimiter=self.config.get('delimiter', ',')
            )
        elif self.format_type.lower() == 'grok':
            parser = GrokParser()
            parser.config = self.config
            return parser
        
        # JSONParser, SyslogParser, KeyValueParser 不需要参数
        return parser_class()
    
    def process(self, raw_log: str) -> Dict[str, Any]:
        """处理单条日志"""
        if not raw_log or not raw_log.strip():
            return None
        
        try:
            parsed = self.parser.parse(raw_log)
            normalized = self.normalizer.normalize(parsed)
            return normalized
        except Exception as e:
            return {
                'raw_log': raw_log,
                'error': str(e),
                'timestamp': datetime.utcnow().isoformat()
            }
    
    def process_batch(self, raw_logs: List[str]) -> List[Dict[str, Any]]:
        """批量处理日志"""
        results = []
        for log in raw_logs:
            result = self.process(log)
            if result:
                results.append(result)
        return results


# 产品预定义解析配置
PRODUCT_PRESETS = {
    'fortinet_fortigate': {
        'format': 'syslog',
        'cef_version': True,
        'severity_map': {'0': 5, '1': 4, '2': 4, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1, '8': 1, '9': 1, '10': 1}
    },
    'palo_alto': {
        'format': 'json',
        'timestamp_field': 'generated_at'
    },
    'suricata': {
        'format': 'json',
        'eve_version': True
    },
    'zeek': {
        'format': 'json',
        'timestamp_field': 'ts'
    },
    'osquery': {
        'format': 'json',
        'name_field': 'name'
    },
    'wazuh': {
        'format': 'json',
        'alert_level_field': 'level'
    },
    'auditd': {
        'format': 'syslog',
        'custom_pattern': r'type=(?P<type>\S+)\s+(?P<msg>.*)'
    },
    'aws_waf': {
        'format': 'json',
        'timestamp_field': 'timestamp'
    },
    'azure_sentinel': {
        'format': 'json',
        'table_name_field': 'TableName'
    }
}


# 导出快捷函数
def parse_log(raw_log: str, format_type: str = 'json', config: Dict[str, Any] = None) -> Dict[str, Any]:
    """快捷解析函数"""
    processor = LogProcessor(format_type, config)
    return processor.process(raw_log)


def parse_logs_batch(raw_logs: List[str], format_type: str = 'json', config: Dict[str, Any] = None) -> List[Dict[str, Any]]:
    """快捷批量解析函数"""
    processor = LogProcessor(format_type, config)
    return processor.process_batch(raw_logs)
