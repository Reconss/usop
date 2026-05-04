"""
Flink 告警引擎任务
用于实时检测日志中的异常模式并生成告警

功能:
    - 单事件规则匹配 (如: 登录失败 5 次)
    - 关联规则匹配 (如: A 事件后 B 事件发生)
    - 滑动窗口聚合 (如: 1 分钟内错误数超过阈值)
    - CEP 时序规则 (如: 失败后成功)

依赖:
    pip install apache-flink kafka-python redis
"""

from pyflink.datastream import StreamExecutionEnvironment, TimeCharacteristic
from pyflink.datastream.connectors.kafka import KafkaSource, KafkaOffsetsInitializer
from pyflink.datastream.connectors.kafka import KafkaSink, KafkaRecordSerializationSchema
from pyflink.datastream.formats.json import JsonRowSerializationSchema
from pyflink.common.typeinfo import Types
from pyflink.common import Row, Time
from pyflink.datastream.window import SlidingEventTimeWindows, TumblingEventTimeWindows
import json
import re
from datetime import datetime
from typing import Dict, Any, List, Optional
from collections import defaultdict
import logging
import hashlib

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class RuleDefinition:
    """告警规则定义"""
    
    def __init__(self, rule_dict: Dict):
        self.id = rule_dict.get('id', '')
        self.name = rule_dict.get('name', 'Unknown Rule')
        self.type = rule_dict.get('type', 'single')  # single, correlation, sequence
        self.enabled = rule_dict.get('enabled', True)
        self.severity = rule_dict.get('severity', 3)  # 1-5
        self.condition = rule_dict.get('condition', {})
        self.window_seconds = rule_dict.get('window_seconds', 60)
        self.threshold = rule_dict.get('threshold', 1)
        self.log_type = rule_dict.get('log_type')
        self.field = rule_dict.get('field', 'action')
        self.value = rule_dict.get('value')
        self.action = rule_dict.get('action', 'alert')
    
    @classmethod
    def from_json(cls, json_str: str) -> 'RuleDefinition':
        """从 JSON 创建规则"""
        return cls(json.loads(json_str))
    
    def to_dict(self) -> Dict:
        return {
            'id': self.id,
            'name': self.name,
            'type': self.type,
            'enabled': self.enabled,
            'severity': self.severity,
            'condition': self.condition,
            'window_seconds': self.window_seconds,
            'threshold': self.threshold,
            'log_type': self.log_type,
            'field': self.field,
            'value': self.value,
            'action': self.action
        }


class AlertEngine:
    """告警引擎"""
    
    def __init__(self, rules: List[RuleDefinition]):
        self.rules = {r.id: r for r in rules if r.enabled}
        self.state = defaultdict(lambda: defaultdict(list))  # rule_id -> key -> events
    
    def process(self, parsed_log: Dict) -> Optional[Dict]:
        """
        处理解析后的日志，返回告警列表
        
        Args:
            parsed_log: 解析后的日志字典
        
        Returns:
            告警字典，如果无匹配返回 None
        """
        alerts = []
        
        for rule_id, rule in self.rules.items():
            if self._match_rule(rule, parsed_log):
                alert = self._create_alert(rule, parsed_log)
                alerts.append(alert)
        
        return alerts[0] if alerts else None
    
    def _match_rule(self, rule: RuleDefinition, log: Dict) -> bool:
        """匹配单事件规则"""
        if rule.type == 'single':
            return self._match_single(rule, log)
        elif rule.type == 'threshold':
            return self._match_threshold(rule, log)
        elif rule.type == 'sequence':
            return self._match_sequence(rule, log)
        return False
    
    def _match_single(self, rule: RuleDefinition, log: Dict) -> bool:
        """单事件匹配"""
        # 按日志类型过滤
        if rule.log_type and log.get('log_type') != rule.log_type:
            return False
        
        # 按字段值过滤
        field_value = str(log.get(rule.field, ''))
        
        if rule.value:
            # 精确匹配
            return field_value == str(rule.value)
        else:
            # 存在性检查
            return rule.field in log
    
    def _match_threshold(self, rule: RuleDefinition, log: Dict) -> bool:
        """阈值规则匹配"""
        if rule.log_type and log.get('log_type') != rule.log_type:
            return False
        
        # 使用日志标识作为 key (如 IP、用户等)
        key = log.get(rule.field, log.get('src_ip', 'unknown'))
        current_count = len(self.state[rule.id][key])
        
        # 检查是否达到阈值
        if current_count >= rule.threshold - 1:
            # 清理状态
            self.state[rule.id][key] = []
            return True
        
        # 添加到状态
        self.state[rule.id][key].append(log.get('timestamp', datetime.utcnow().isoformat()))
        
        # 清理过期事件
        self._cleanup_state(rule)
        return False
    
    def _match_sequence(self, rule: RuleDefinition, log: Dict) -> bool:
        """序列规则匹配 (需要 A 然后 B)"""
        # 简化实现：检查关联字段
        if rule.log_type and log.get('log_type') != rule.log_type:
            return False
        
        key = rule.condition.get('group_by', 'src_ip')
        group_value = log.get(key, 'unknown')
        
        sequence = self.state[rule.id].get(group_value, [])
        
        # 检查是否满足序列模式
        expected_sequence = rule.condition.get('sequence', [])
        if not expected_sequence:
            return False
        
        current_action = log.get(rule.field)
        expected_action = expected_sequence[-1] if expected_sequence else None
        
        return current_action == expected_action
    
    def _cleanup_state(self, rule: RuleDefinition):
        """清理过期状态"""
        now = datetime.utcnow().timestamp()
        cutoff = now - rule.window_seconds
        
        for key in list(self.state[rule.id].keys()):
            events = self.state[rule.id][key]
            valid_events = []
            
            for event_ts in events:
                try:
                    ts = datetime.fromisoformat(event_ts.replace('Z', '+00:00')).timestamp()
                    if ts > cutoff:
                        valid_events.append(event_ts)
                except:
                    pass
            
            if valid_events:
                self.state[rule.id][key] = valid_events
            else:
                del self.state[rule.id][key]
    
    def _create_alert(self, rule: RuleDefinition, log: Dict) -> Dict:
        """创建告警"""
        return {
            'id': f"ALERT-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{hashlib.md5(rule.id.encode()).hexdigest()[:6]}",
            'rule_id': rule.id,
            'rule_name': rule.name,
            'severity': rule.severity,
            'alert_type': rule.type,
            'message': f"[{rule.name}] 检测到异常事件: {log.get('action', 'N/A')}",
            'src_ip': log.get('src_ip'),
            'dst_ip': log.get('dst_ip'),
            'username': log.get('username'),
            'source_id': log.get('source_id'),
            'timestamp': datetime.utcnow().isoformat(),
            'details': {
                'matched_log': log,
                'rule_type': rule.type
            }
        }


def load_rules_from_config() -> List[RuleDefinition]:
    """从配置文件加载规则 (生产环境应从 Kafka 或 API 获取)"""
    default_rules = [
        {
            'id': 'R001',
            'name': '暴力破解检测',
            'type': 'threshold',
            'enabled': True,
            'severity': 4,
            'log_type': 'login',
            'field': 'src_ip',
            'threshold': 5,
            'window_seconds': 300,  # 5分钟
            'action': 'alert'
        },
        {
            'id': 'R002',
            'name': '异常登录地点',
            'type': 'single',
            'enabled': True,
            'severity': 3,
            'log_type': 'login',
            'field': 'action',
            'value': 'login_fail',
            'action': 'alert'
        },
        {
            'id': 'R003',
            'name': '权限提升尝试',
            'type': 'single',
            'enabled': True,
            'severity': 5,
            'field': 'action',
            'value': ' privilege_escalation',
            'action': 'block'
        },
        {
            'id': 'R004',
            'name': '数据外传检测',
            'type': 'threshold',
            'enabled': True,
            'severity': 5,
            'log_type': 'network',
            'field': 'dst_ip',
            'threshold': 100,
            'window_seconds': 60,  # 1分钟
            'action': 'alert'
        },
        {
            'id': 'R005',
            'name': 'SQL 注入攻击',
            'type': 'single',
            'enabled': True,
            'severity': 5,
            'field': 'action',
            'value': 'sqli_detected',
            'action': 'block'
        },
        {
            'id': 'R006',
            'name': '账号锁定',
            'type': 'single',
            'enabled': True,
            'severity': 3,
            'log_type': 'login',
            'field': 'action',
            'value': 'account_locked',
            'action': 'notify'
        }
    ]
    
    return [RuleDefinition(r) for r in default_rules]


def create_flink_job():
    """创建 Flink 告警引擎任务"""
    
    # 创建执行环境
    env = StreamExecutionEnvironment.get_execution_environment()
    env.set_parallelism(4)
    env.set_stream_time_characteristic(TimeCharacteristic.EventTime)
    
    # 配置 Kafka Source (消费解析后日志)
    kafka_source = KafkaSource.builder() \
        .set_bootstrap_servers("kafka:29092") \
        .set_topics("parsed-logs") \
        .set_group_id("flink-alert-engine") \
        .set_starting_offsets(KafkaOffsetsInitializer.earliest()) \
        .set_value_only_deserializer(JsonRowDeserializationSchema.builder()
            .type_info(Types.ROW_NAMED(
                ['id', 'source_id', 'log_type', 'timestamp', 'src_ip', 'dst_ip', 
                 'username', 'action', 'result', 'raw_message', 'details'],
                Types.STRING, Types.INT, Types.STRING, Types.STRING, Types.STRING,
                Types.STRING, Types.STRING, Types.STRING, Types.STRING, Types.STRING, Types.STRING
            ))
            .build()) \
        .build()
    
    # 添加 Kafka Source
    stream = env.from_source(
        kafka_source,
        WatermarkStrategy.no_watermarks(),
        "Parsed Logs Source"
    )
    
    # 加载告警规则
    rules = load_rules_from_config()
    alert_engine = AlertEngine(rules)
    
    logger.info(f"加载 {len(rules)} 条告警规则")
    
    # 处理函数
    def process_log(element):
        try:
            # 构建日志字典
            log_dict = {
                'id': element[0],
                'source_id': element[1],
                'log_type': element[2],
                'timestamp': element[3],
                'src_ip': element[4],
                'dst_ip': element[5],
                'username': element[6],
                'action': element[7],
                'result': element[8],
                'raw_message': element[9],
                'details': element[10]
            }
            
            # 解析 details JSON
            if log_dict['details']:
                try:
                    log_dict['details'] = json.loads(log_dict['details'])
                except:
                    log_dict['details'] = {}
            
            # 执行告警检测
            alert = alert_engine.process(log_dict)
            
            if alert:
                logger.warning(f"告警触发: [{alert['rule_name']}] "
                             f"src_ip={alert['src_ip']} severity={alert['severity']}")
                return alert
            
            return None
            
        except Exception as e:
            logger.error(f"处理失败: {e}")
            return None
    
    # 应用处理函数并过滤空值
    alerts = stream.map(process_log).filter(lambda x: x is not None)
    
    # 配置 Kafka Sink (输出告警)
    kafka_sink = KafkaSink.builder() \
        .set_bootstrap_servers("kafka:29092") \
        .set_record_serializer(KafkaRecordSerializationSchema.builder()
            .set_topic("alerts")
            .set_value_serialization_schema(JsonRowSerializationSchema.builder()
                .with_type_info(Types.ROW_NAMED(
                    ['id', 'rule_id', 'rule_name', 'severity', 'alert_type',
                     'message', 'src_ip', 'dst_ip', 'username', 'source_id', 'timestamp', 'details'],
                    Types.STRING, Types.STRING, Types.STRING, Types.INT, Types.STRING,
                    Types.STRING, Types.STRING, Types.STRING, Types.STRING, Types.INT, Types.STRING, Types.STRING
                ))
                .build())
            .build()) \
        .build()
    
    alerts.add_sink(kafka_sink)
    
    # 打印告警到控制台 (用于调试)
    alerts.print()
    
    # 执行任务
    env.execute("Alert Engine Job")


def create_threshold_job():
    """创建阈值检测任务 (独立运行)"""
    
    env = StreamExecutionEnvironment.get_execution_environment()
    env.set_parallelism(2)
    env.set_stream_time_characteristic(TimeCharacteristic.EventTime)
    
    # Kafka Source
    kafka_source = KafkaSource.builder() \
        .set_bootstrap_servers("kafka:29092") \
        .set_topics("parsed-logs") \
        .set_group_id("flink-threshold-detector") \
        .set_starting_offsets(KafkaOffsetsInitializer.earliest()) \
        .set_value_only_deserializer(JsonRowDeserializationSchema.builder()
            .type_info(Types.ROW_NAMED(
                ['id', 'source_id', 'log_type', 'timestamp', 'src_ip', 'dst_ip', 'username', 'action'],
                Types.STRING, Types.INT, Types.STRING, Types.STRING, Types.STRING, Types.STRING, Types.STRING, Types.STRING
            ))
            .build()) \
        .build()
    
    stream = env.from_source(
        kafka_source,
        WatermarkStrategy.no_watermarks(),
        "Parsed Logs Source"
    )
    
    # 阈值统计
    def count_and_check(element):
        key = (element[4], element[6] or 'unknown')  # (src_ip, username)
        count = 1  # 实际应使用状态后端
        threshold = 5
        
        if count >= threshold:
            return {
                'type': 'threshold_alert',
                'src_ip': element[4],
                'username': element[6],
                'action': element[7],
                'count': count,
                'timestamp': datetime.utcnow().isoformat()
            }
        return None
    
    alerts = stream.map(count_and_check).filter(lambda x: x is not None)
    alerts.print()
    
    env.execute("Threshold Detector Job")


if __name__ == "__main__":
    create_flink_job()
