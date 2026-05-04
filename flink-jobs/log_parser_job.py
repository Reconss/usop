"""
Flink 日志解析任务
用于实时解析 Kafka 中的日志数据

依赖:
    pip install apache-flink kafka-python
"""

from pyflink.datastream import StreamExecutionEnvironment
from pyflink.datastream.connectors.kafka import KafkaSource, KafkaOffsetsInitializer
from pyflink.datastream.formats.json import JsonRowDeserializationSchema
from pyflink.common.typeinfo import Types
from pyflink.common import Row
import json
import re
from datetime import datetime
from typing import Dict, Any, Optional
import logging

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class LogParser:
    """日志解析器"""
    
    # 预编译正则表达式
    PATTERNS = {
        'json': re.compile(r'^\s*\{.*\}\s*$'),
        'syslog_rfc5424': re.compile(
            r'^<(?P<priority>\d+)>(?P<version>\d+)\s+(?P<timestamp>\S+)\s+'
            r'(?P<hostname>\S+)\s+(?P<app_name>\S+)\s+(?P<procid>\S+)\s+'
            r'(?P<msgid>\S+)\s+(?P<structured_data>\[.*?\]|-)\s*(?P<message>.*)$'
        ),
        'syslog_rfc3164': re.compile(
            r'^(?P<timestamp>\w+\s+\d+\s+\d+:\d+:\d+)\s+'
            r'(?P<hostname>\S+)\s+(?P<app_name>\S+?)(?:\[(?P<procid>\d+)\])?:\s+(?P<message>.*)$'
        ),
        'cef': re.compile(
            r'^CEF:(?P<version>\d+)\|(?P<vendor>[^|]+)\|(?P<product>[^|]+)\|'
            r'(?P<version2>[^|]+)\|(?P<signature_id>[^|]+)\|(?P<name>[^|]+)\|'
            r'(?P<severity>\d+)\|(?P<extension>.*)$'
        ),
        'keyvalue': re.compile(r'(\w+)=([^\s]+)'),
        'ip_log': re.compile(
            r'(?P<src_ip>\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}).*'
            r'(?P<dst_ip>\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})'
        )
    }
    
    @classmethod
    def parse(cls, raw_log: str, format_type: str = 'auto') -> Dict[str, Any]:
        """
        解析日志
        
        Args:
            raw_log: 原始日志字符串
            format_type: 格式类型 (auto, json, syslog, cef, keyvalue, grok)
        
        Returns:
            解析后的字段字典
        """
        result = {
            'raw_log': raw_log,
            'timestamp': datetime.utcnow().isoformat(),
            'format_type': 'unknown'
        }
        
        try:
            if format_type == 'auto':
                format_type = cls._detect_format(raw_log)
            
            result['format_type'] = format_type
            
            if format_type == 'json':
                result.update(cls._parse_json(raw_log))
            elif format_type in ('syslog', 'syslog_rfc5424', 'syslog_rfc3164'):
                result.update(cls._parse_syslog(raw_log))
            elif format_type == 'cef':
                result.update(cls._parse_cef(raw_log))
            elif format_type == 'keyvalue':
                result.update(cls._parse_keyvalue(raw_log))
            elif format_type == 'grok':
                result.update(cls._parse_grok(raw_log))
            else:
                result['message'] = raw_log
                
        except Exception as e:
            logger.error(f"解析失败: {e}, raw_log: {raw_log[:100]}")
            result['parse_error'] = str(e)
        
        return result
    
    @classmethod
    def _detect_format(cls, raw_log: str) -> str:
        """自动检测日志格式"""
        raw_log = raw_log.strip()
        
        if cls.PATTERNS['json'].match(raw_log):
            return 'json'
        elif raw_log.startswith('CEF:'):
            return 'cef'
        elif raw_log.startswith('<'):
            return 'syslog'
        elif '=' in raw_log and ' ' not in raw_log.split('=')[0]:
            return 'keyvalue'
        else:
            return 'raw'
    
    @classmethod
    def _parse_json(cls, raw_log: str) -> Dict[str, Any]:
        """解析 JSON 格式"""
        data = json.loads(raw_log)
        result = {}
        
        if isinstance(data, dict):
            result.update(data)
            # 提取时间戳
            for key in ['@timestamp', 'timestamp', 'time', 'datetime']:
                if key in data:
                    result['timestamp'] = str(data[key])
                    break
        
        return result
    
    @classmethod
    def _parse_syslog(cls, raw_log: str) -> Dict[str, Any]:
        """解析 Syslog 格式"""
        # 尝试 RFC5424
        match = cls.PATTERNS['syslog_rfc5424'].match(raw_log)
        if match:
            groups = match.groupdict()
            priority = int(groups.get('priority', 0))
            return {
                'hostname': groups.get('hostname'),
                'app_name': groups.get('app_name'),
                'message': groups.get('message', ''),
                'facility': priority >> 3,
                'severity': priority & 7,
                'timestamp': groups.get('timestamp'),
                'format': 'RFC5424'
            }
        
        # 尝试 RFC3164
        match = cls.PATTERNS['syslog_rfc3164'].match(raw_log)
        if match:
            groups = match.groupdict()
            return {
                'hostname': groups.get('hostname'),
                'app_name': groups.get('app_name'),
                'message': groups.get('message', ''),
                'timestamp': groups.get('timestamp'),
                'format': 'RFC3164'
            }
        
        return {'message': raw_log}
    
    @classmethod
    def _parse_cef(cls, raw_log: str) -> Dict[str, Any]:
        """解析 CEF 格式"""
        match = cls.PATTERNS['cef'].match(raw_log)
        if match:
            groups = match.groupdict()
            return {
                'vendor': groups.get('vendor', '').strip(),
                'product': groups.get('product', '').strip(),
                'signature_id': groups.get('signature_id', '').strip(),
                'name': groups.get('name', '').strip(),
                'severity': cls._cef_severity(int(groups.get('severity', 0))),
                'message': groups.get('extension', ''),
                'format': 'CEF'
            }
        return {'message': raw_log}
    
    @classmethod
    def _parse_keyvalue(cls, raw_log: str) -> Dict[str, Any]:
        """解析键值对格式"""
        matches = cls.PATTERNS['keyvalue'].findall(raw_log)
        return {k: v for k, v in matches}
    
    @classmethod
    def _parse_grok(cls, raw_log: str) -> Dict[str, Any]:
        """解析 Grok 格式 (简化版)"""
        # 实际生产环境应使用 pyparsing 或自定义 Grok 库
        return {'message': raw_log, 'format': 'grok'}
    
    @staticmethod
    def _cef_severity(level: int) -> str:
        """CEF 严重级别转换"""
        mapping = {
            0: 'Unknown',
            1: 'Low',
            2: 'Medium', 
            3: 'High',
            4: 'Very-High',
            5: 'Critical',
            6: 'Critical',
            7: 'Critical',
            8: 'Critical',
            9: 'Critical',
            10: 'Critical'
        }
        return mapping.get(level, 'Unknown')


def create_flink_job():
    """创建 Flink 流处理任务"""
    
    # 创建执行环境
    env = StreamExecutionEnvironment.get_execution_environment()
    env.set_parallelism(4)  # 设置并行度
    
    # 配置 Kafka Source
    kafka_source = KafkaSource.builder() \
        .set_bootstrap_servers("kafka:29092") \
        .set_topics("raw-logs") \
        .set_group_id("flink-log-parser") \
        .set_starting_offsets(KafkaOffsetsInitializer.earliest()) \
        .set_value_only_deserializer(JsonRowDeserializationSchema.builder()
            .type_info(Types.ROW(Types.STRING, Types.STRING, Types.STRING))
            .build()) \
        .build()
    
    # 添加 Kafka Source
    stream = env.from_source(
        kafka_source,
        WatermarkStrategy.no_watermarks(),
        "Kafka Source"
    )
    
    # 处理每条日志
    def process_log(element):
        try:
            # element 格式: Row(log_id, raw_log, format_type)
            log_id = element[0]
            raw_log = element[1]
            format_type = element[2] if len(element) > 2 else 'auto'
            
            # 解析日志
            parsed = LogParser.parse(raw_log, format_type)
            parsed['log_id'] = log_id
            parsed['parse_time'] = datetime.utcnow().isoformat()
            
            # 输出到控制台（生产环境应输出到 Kafka 或数据库）
            logger.info(f"Parsed: {parsed.get('name', 'unknown')}, "
                       f"src_ip: {parsed.get('src_ip', 'N/A')}, "
                       f"severity: {parsed.get('severity', 'N/A')}")
            
            return parsed
            
        except Exception as e:
            logger.error(f"处理失败: {e}")
            return {"error": str(e)}
    
    # 应用处理函数
    processed_stream = stream.map(process_log)
    
    # 打印结果
    processed_stream.print()
    
    # 执行任务
    env.execute("Log Parser Job")


if __name__ == "__main__":
    create_flink_job()
