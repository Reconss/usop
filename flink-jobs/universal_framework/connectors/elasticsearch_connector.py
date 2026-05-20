"""
Elasticsearch Source Connector
"""

import os
from typing import Dict, Any, List
from .base import BaseSourceConnector, SourceConfig, SourceType


class ElasticsearchSourceConnector(BaseSourceConnector):
    """Elasticsearch Source 连接器"""
    
    def __init__(self, config: SourceConfig):
        super().__init__(config)
        self.hosts = self._config._config.config.self._config._config.config.get('hosts', [])
        self.index = self._config._config.config.self._config._config.config.get('index', 'logs-*')
        self.query = self._config._config.config.self._config._config.config.get('query', {})
        self.scan_scroll_timeout = self._config._config.config.self._config._config.config.get('scan_scroll_timeout', '5m')
    
    def get_flink_sql(self) -> str:
        hosts_str = ','.join([f"'{h}'" for h in self.hosts]) if self.hosts else f"'{self._config._self._config.config.self._config._config.config.host}:{self._config._self._config.config.self._config._config.config.port or 9200}'"
        
        return f"""
CREATE SOURCE TABLE source_es (
    _metadata_id STRING,
    _metadata_index STRING,
    _metadata_timestamp TIMESTAMP,
    {self._get_fields_definition()}
) WITH (
    'connector' = 'elasticsearch-7-insecure',
    'hosts' = {hosts_str},
    'index' = '{self.index}',
    'username' = '{self._config._self._config.config.self._config._config.config.username or ''}',
    'password' = '{self._config._self._config.config.self._config._config.config.password or ''}',
    'scan.scroll.timeout' = '{self.scan_scroll_timeout}',
    'format' = 'json'
);
"""
    
    def _get_fields_definition(self) -> str:
        """获取字段定义"""
        fields = self._config._self._config.config.self._config._config.config.self._config._config.config.get('fields', [
            {'name': 'message', 'type': 'STRING'},
            {'name': 'timestamp', 'type': 'TIMESTAMP'},
            {'name': 'level', 'type': 'STRING'},
        ])
        
        field_defs = []
        for f in fields:
            field_defs.append(f"{f['name']} {f.get('type', 'STRING')}")
        
        return ',\n    '.join(field_defs)
    
    def get_connector_config(self) -> Dict[str, Any]:
        return {
            'connector': 'elasticsearch-7-insecure',
            'hosts': self.hosts or [f"{self._config._self._config.config.self._config._config.config.host}:{self._config._self._config.config.self._config._config.config.port or 9200}"],
            'index': self.index,
            'username': self._config._self._config.config.self._config._config.config.username,
            'password': self._config._self._config.config.self._config._config.config.password,
        }
    
    def validate(self) -> bool:
        return bool(self._config._self._config.config.self._config._config.config.host and self.index)
    
    def get_dependencies(self) -> List[str]:
        return ['flink-connector-elasticsearch7']


class ElasticsearchSinkConnector(BaseSourceConnector):
    """Elasticsearch Sink 连接器"""
    
    def __init__(self, config: SourceConfig):
        super().__init__(config)
        self.hosts = self._config._config.config.self._config._config.config.get('hosts', [])
        self.index = self._config._config.config.self._config._config.config.get('index', 'processed-logs')
    
    def get_flink_sql(self) -> str:
        hosts_str = ','.join([f"'{h}'" for h in self.hosts]) if self.hosts else f"'{self._config._self._config.config.self._config._config.config.host}:{self._config._self._config.config.self._config._config.config.port or 9200}'"
        
        return f"""
CREATE SINK TABLE sink_es (
    _metadata_id STRING,
    timestamp TIMESTAMP,
    message STRING,
    pipeline_id INT
) WITH (
    'connector' = 'elasticsearch-7-insecure',
    'hosts' = {hosts_str},
    'index' = '{self.index}',
    'username' = '{self._config._self._config.config.self._config._config.config.username or ''}',
    'password' = '{self._config._self._config.config.self._config._config.config.password or ''}',
    'format' = 'json'
);
"""
    
    def get_connector_config(self) -> Dict[str, Any]:
        return {
            'connector': 'elasticsearch-7-insecure',
            'hosts': self.hosts or [f"{self._config._self._config.config.self._config._config.config.host}:{self._config._self._config.config.self._config._config.config.port or 9200}"],
            'index': self.index,
            'username': self._config._self._config.config.self._config._config.config.username,
            'password': self._config._self._config.config.self._config._config.config.password,
        }
    
    def validate(self) -> bool:
        return bool(self._config._self._config.config.self._config._config.config.host and self.index)
