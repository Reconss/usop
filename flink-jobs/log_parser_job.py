"""
Flink Log Parser Job - 完善版
支持输出到 TimescaleDB 和 Kafka

依赖:
    pip install apache-flink kafka-python psycopg2-binary redis
"""

from pyflink.datastream import StreamExecutionEnvironment
from pyflink.datastream.connectors.kafka import KafkaSource, KafkaSink, KafkaOffsetsInitializer
from pyflink.datastream.connectors.kafka import KafkaRecordSerializationSchema
from pyflink.datastream.formats.json import JsonRowDeserializationSchema, JsonRowSerializationSchema
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
        """解析日志"""
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
            else:
                result['message'] = raw_log
                
        except Exception as e:
            logger.error(f"解析失败: {e}")
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
            # 提取 IP
            for key in ['src_ip', 'source_ip', 'srcip', 'client_ip']:
                if key in data:
                    result['src_ip'] = data[key]
                    break
            for key in ['dst_ip', 'dest_ip', 'dstip', 'server_ip']:
                if key in data:
                    result['dst_ip'] = data[key]
                    break
            # 提取动作
            for key in ['action', 'event', 'event_type']:
                if key in data:
                    result['action'] = data[key]
                    break
        
        return result
    
    @classmethod
    def _parse_syslog(cls, raw_log: str) -> Dict[str, Any]:
        """解析 Syslog 格式"""
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
            # 解析扩展字段
            extension = groups.get('extension', '')
            ext_fields = {}
            for item in extension.split(' '):
                if '=' in item:
                    k, v = item.split('=', 1)
                    ext_fields[k] = v
            
            return {
                'vendor': groups.get('vendor', '').strip(),
                'product': groups.get('product', '').strip(),
                'signature_id': groups.get('signature_id', '').strip(),
                'name': groups.get('name', '').strip(),
                'severity': cls._cef_severity(int(groups.get('severity', 0))),
                'message': extension,
                'action': ext_fields.get('act', 'unknown'),
                'src_ip': ext_fields.get('src', ''),
                'dst_ip': ext_fields.get('dst', ''),
                'user': ext_fields.get('suser', ''),
                'format': 'CEF',
                'details': ext_fields
            }
        return {'message': raw_log}
    
    @classmethod
    def _parse_keyvalue(cls, raw_log: str) -> Dict[str, Any]:
        """解析键值对格式"""
        matches = cls.PATTERNS['keyvalue'].findall(raw_log)
        return {k: v for k, v in matches}
    
    @staticmethod
    def _cef_severity(level: int) -> str:
        """CEF 严重级别转换"""
        mapping = {0: 'Unknown', 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Very-High', 5: 'Critical'}
        return mapping.get(level, 'Unknown')


class TimescaleDBSink:
    """TimescaleDB Sink (使用 JDBC)"""
    
    def __init__(self, host: str, port: int, database: str, user: str, password: str):
        self.config = {
            'host': host,
            'port': port,
            'database': database,
            'user': user,
            'password': password
        }
    
    def insert_parsed_log(self, parsed_log: Dict) -> bool:
        """插入解析后的日志到 TimescaleDB"""
        import psycopg2
        from psycopg2.extras import execute_values
        
        try:
            conn = psycopg2.connect(**self.config)
            cursor = conn.cursor()
            
            sql = """
                INSERT INTO parsed_logs 
                (source_id, log_type, timestamp, src_ip, dst_ip, src_port, dst_port,
                 protocol, hostname, username, action, result, raw_message, details)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            
            values = (
                parsed_log.get('source_id'),
                parsed_log.get('log_type', 'unknown'),
                parsed_log.get('timestamp', datetime.utcnow().isoformat()),
                parsed_log.get('src_ip'),
                parsed_log.get('dst_ip'),
                parsed_log.get('src_port'),
                parsed_log.get('dst_port'),
                parsed_log.get('protocol'),
                parsed_log.get('hostname'),
                parsed_log.get('username'),
                parsed_log.get('action'),
                parsed_log.get('result'),
                parsed_log.get('raw_log') or parsed_log.get('raw_message'),
                json.dumps(parsed_log.get('details', {}))
            )
            
            cursor.execute(sql, values)
            conn.commit()
            cursor.close()
            conn.close()
            
            return True
            
        except Exception as e:
            logger.error(f"插入 TimescaleDB 失败: {e}")
            return False


def create_flink_job():
    """创建 Flink 日志解析任务"""
    
    env = StreamExecutionEnvironment.get_execution_environment()
    env.set_parallelism(4)
    
    # Kafka Source (消费原始日志)
    kafka_source = KafkaSource.builder() \
        .set_bootstrap_servers("kafka:29092") \
        .set_topics("raw-logs") \
        .set_group_id("flink-log-parser") \
        .set_starting_offsets(KafkaOffsetsInitializer.earliest()) \
        .set_value_only_deserializer(JsonRowDeserializationSchema.builder()
            .type_info(Types.ROW(Types.STRING, Types.STRING, Types.STRING, Types.STRING))
            .build()) \
        .build()
    
    stream = env.from_source(
        kafka_source,
        WatermarkStrategy.no_watermarks(),
        "Kafka Source"
    )
    
    # Kafka Sink (输出解析后日志)
    kafka_sink = KafkaSink.builder() \
        .set_bootstrap_servers("kafka:29092") \
        .set_record_serializer(KafkaRecordSerializationSchema.builder()
            .set_topic("parsed-logs")
            .set_value_serialization_schema(JsonRowSerializationSchema.builder()
                .with_type_info(Types.ROW_NAMED(
                    ['id', 'source_id', 'log_type', 'timestamp', 'src_ip', 'dst_ip',
                     'username', 'action', 'result', 'raw_message', 'details'],
                    Types.STRING, Types.INT, Types.STRING, Types.STRING, Types.STRING,
                    Types.STRING, Types.STRING, Types.STRING, Types.STRING, Types.STRING, Types.STRING
                ))
                .build())
            .build()) \
        .build()
    
    # TimescaleDB Sink
    tsdb_sink = TimescaleDBSink(
        host='timescale',
        port=5432,
        database='timescale',
        user='postgres',
        password='timescale_pass'
    )
    
    # 处理函数
    def process_log(element):
        try:
            # element 格式: Row(id, source_id, raw_log, format_type)
            log_id = element[0]
            source_id = element[1] if len(element) > 1 else None
            raw_log = element[2] if len(element) > 2 else str(element)
            format_type = element[3] if len(element) > 3 else 'auto'
            
            # 解析日志
            parsed = LogParser.parse(raw_log, format_type)
            parsed['id'] = log_id
            parsed['source_id'] = int(source_id) if source_id else None
            parsed['log_type'] = parsed.get('log_type', format_type)
            parsed['parse_time'] = datetime.utcnow().isoformat()
            
            # 输出到 Kafka
            kafka_record = (
                log_id,
                parsed.get('source_id'),
                parsed.get('log_type', 'unknown'),
                parsed.get('timestamp'),
                parsed.get('src_ip'),
                parsed.get('dst_ip'),
                parsed.get('username'),
                parsed.get('action'),
                parsed.get('result'),
                raw_log,
                json.dumps(parsed.get('details', {}))
            )
            
            return Row(*kafka_record)
            
        except Exception as e:
            logger.error(f"处理失败: {e}")
            return None
    
    # 应用处理
    parsed_stream = stream.map(process_log).filter(lambda x: x is not None)
    
    # 输出到 Kafka
    parsed_stream.add_sink(kafka_sink)
    
    # 打印到控制台 (用于调试)
    parsed_stream.print()
    
    env.execute("Log Parser Job")


if __name__ == "__main__":
    create_flink_job()
