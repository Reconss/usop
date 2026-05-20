"""
Flink WAF 日志处理作业
功能: 从 Kafka 读取 WAF 日志，进行规则分析，然后输出到下游
"""

from pyflink.datastream import StreamExecutionEnvironment
from pyflink.datastream.connectors.kafka import KafkaSource, KafkaOffsetsInitializer
from pyflink.datastream.connectors.kafka import KafkaSink, KafkaRecordSerializationSchema
from pyflink.datastream.formats.json import JsonRowSerializationSchema
from pyflink.common.typeinfo import Types
from pyflink.common import Row
import json
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 告警规则配置
RULES = {
    'sql_injection': {
        'keywords': ['sql', 'injection', 'select ', 'union', 'drop ', "' or '"],
        'severity': 'high'
    },
    'xss': {
        'keywords': ['<script', 'javascript:', 'onerror=', 'onload='],
        'severity': 'high'
    },
    'path_traversal': {
        'keywords': ['../', '..\\', '/etc/passwd', '/etc/shadow'],
        'severity': 'medium'
    },
    'brute_force': {
        'keywords': ['login', 'failed', 'password', '401', '403'],
        'severity': 'medium'
    }
}

def analyze_log(log_data: dict) -> dict:
    """基于规则分析日志，返回告警信息"""
    message = log_data.get('message', '')
    uri = log_data.get('uri', '')
    attack_type = log_data.get('attack_type', '')
    src_ip = log_data.get('src_ip', '')
    risk_level = log_data.get('risk_level', '低')
    
    # 检测规则匹配
    matched_rules = []
    for rule_name, rule_config in RULES.items():
        for keyword in rule_config['keywords']:
            if keyword.lower() in message.lower() or keyword.lower() in uri.lower():
                matched_rules.append(rule_name)
                break
    
    # 如果没有匹配任何规则但有攻击类型，也记录
    if not matched_rules and attack_type:
        matched_rules.append(attack_type)
    
    # 映射严重程度
    severity_map = {
        '严重': 'critical',
        '高危': 'high',
        '高': 'high',
        '中': 'medium',
        '低': 'low',
        '信息': 'low'
    }
    
    return {
        'alert_code': log_data.get('alert_id', ''),
        'title': f"[WAF] {attack_type or '未知攻击'} - {src_ip}",
        'description': message,
        'severity': severity_map.get(risk_level, 'medium'),
        'status': 'new',
        'source': 'waf',
        'src_ip': src_ip,
        'src_port': log_data.get('src_port'),
        'dst_ip': log_data.get('dst_ip'),
        'dst_port': log_data.get('dst_port'),
        'protocol': log_data.get('protocol'),
        'hostname': log_data.get('host'),
        'raw_log': json.dumps(log_data, ensure_ascii=False),
        'category': matched_rules[0] if matched_rules else attack_type,
        'matched_rules': matched_rules,
        'rule_count': len(matched_rules)
    }

def main():
    env = StreamExecutionEnvironment.get_execution_environment()
    env.set_parallelism(2)
    
    # Kafka Source
    kafka_source = KafkaSource.builder() \
        .set_bootstrap_servers("kafka:29092") \
        .set_topics("waf-alert") \
        .set_group_id("flink-waf-processor") \
        .set_starting_offsets(OffsetsInitializer.latest()) \
        .set_value_only_deserializer(CustomJsonDeserializer()) \
        .build()
    
    # Kafka Sink - 输出到 processed-alerts topic
    kafka_sink = KafkaSink.builder() \
        .set_bootstrap_servers("kafka:29092") \
        .set_record_serializer(
            KafkaRecordSerializationSchema.builder()
                .set_topic("processed-alerts")
                .set_value_serialization_schema(CustomJsonSerializer())
                .build()
        ) \
        .build()
    
    # 处理流程
    env.from_source(
        kafka_source,
        WatermarkStrategy.no_watermarks(),
        "WAF Kafka Source"
    ).process(
        ProcessFunction=lambda value: analyze_log(value)
    ).sink_to(kafka_sink)
    
    env.execute("WAF Log Analysis Job")

class CustomJsonDeserializer:
    def deserialize(self, message):
        return json.loads(message)

class CustomJsonSerializer:
    def serialize(self, element):
        return json.dumps(element, ensure_ascii=False).encode('utf-8')

if __name__ == "__main__":
    main()
