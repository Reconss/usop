"""
Kafka Connector - Kafka Source & Sink
"""

import os
from typing import Dict, Any, List
from .base import BaseSourceConnector, SourceConfig


class KafkaSourceConnector(BaseSourceConnector):
    """Kafka Source 连接器配置"""
    
    def __init__(self, config: SourceConfig):
        super().__init__(config)
        cfg = config.config or {}
        self.bootstrap_servers = cfg.get('bootstrap_servers', 
            os.environ.get('KAFKA_BOOTSTRAP_SERVERS', 'kafka:29092'))
        self.topic = cfg.get('topic', 'raw-logs')
        self.group_id = cfg.get('group_id', 'flink-universal')
        self.start_offset = cfg.get('start_offset', 'earliest')
        self.value_format = cfg.get('value_format', 'json')
        self.key_format = cfg.get('key_format', None)
        self.schema = cfg.get('schema', None)
    
    def get_flink_sql(self) -> str:
        return f"""
CREATE SOURCE TABLE source_kafka (
    row_key STRING,
    raw_log STRING,
    timestamp STRING,
    source_id STRING
) WITH (
    'connector' = 'kafka',
    'topic' = '{self.topic}',
    'properties.bootstrap.servers' = '{self.bootstrap_servers}',
    'properties.group.id' = '{self.group_id}',
    'scan.startup.mode' = '{self.start_offset}',
    'format' = '{self.value_format}'
);
"""
    
    def get_connector_config(self) -> Dict[str, Any]:
        return {
            'connector': 'kafka',
            'topic': self.topic,
            'bootstrap.servers': self.bootstrap_servers,
            'group.id': self.group_id,
            'start_offset': self.start_offset,
            'format': self.value_format,
        }
    
    def validate(self) -> bool:
        return bool(self.topic and self.bootstrap_servers)
    
    def get_dependencies(self) -> List[str]:
        return ['flink-connector-kafka']


class KafkaSinkConnector(BaseSourceConnector):
    """Kafka Sink 连接器配置"""
    
    def __init__(self, config: SourceConfig):
        super().__init__(config)
        cfg = config.config or {}
        self.bootstrap_servers = cfg.get('bootstrap_servers',
            os.environ.get('KAFKA_BOOTSTRAP_SERVERS', 'kafka:29092'))
        self.topic = cfg.get('topic', 'processed-logs')
        self.value_format = cfg.get('value_format', 'json')
        self.semantic = cfg.get('semantic', 'at-least-once')
        self.acks = cfg.get('acks', 'all')
    
    def get_flink_sql(self) -> str:
        return f"""
CREATE SINK TABLE sink_kafka (
    timestamp TIMESTAMP,
    id STRING,
    message STRING,
    pipeline_id INT
) WITH (
    'connector' = 'kafka',
    'topic' = '{self.topic}',
    'properties.bootstrap.servers' = '{self.bootstrap_servers}',
    'properties.acks' = '{self.acks}',
    'sink.semantic' = '{self.semantic}',
    'format' = '{self.value_format}'
);
"""
    
    def get_connector_config(self) -> Dict[str, Any]:
        return {
            'connector': 'kafka',
            'topic': self.topic,
            'bootstrap.servers': self.bootstrap_servers,
            'acks': self.acks,
            'sink.semantic': self.semantic,
            'format': self.value_format,
        }
    
    def validate(self) -> bool:
        return bool(self.topic and self.bootstrap_servers)
    
    def get_dependencies(self) -> List[str]:
        return ['flink-connector-kafka']
