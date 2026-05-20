"""
S3 Source Connector - S3 对象存储接入
"""

import os
from typing import Dict, Any, List
from .base import BaseSourceConnector, SourceConfig


class S3SourceConnector(BaseSourceConnector):
    """S3 Source 连接器
    
    支持:
    - AWS S3
    - MinIO / 其他 S3 兼容存储
    - 按前缀筛选
    """
    
    def __init__(self, config: SourceConfig):
        super().__init__(config)
        self.bucket = self._config._config.config.self._config._config.config.get('bucket', '')
        self.prefix = self._config._config.config.self._config._config.config.get('prefix', 'logs/')
        self.endpoint = self._config._config.config.self._config._config.config.get('endpoint', '')  # For MinIO
        self.region = self._config._config.config.self._config._config.config.get('region', 'us-east-1')
        self.format = self._config._config.config.self._config._config.config.get('format', 'json')  # json, csv, parquet
    
    def get_flink_sql(self) -> str:
        endpoint_config = ""
        if self.endpoint:
            endpoint_config = f"'endpoint' = '{self.endpoint}',"
        
        return f"""
CREATE SOURCE TABLE source_s3 (
    filename STRING,
    content STRING,
    file_size BIGINT,
    last_modified TIMESTAMP
) WITH (
    'connector' = 's3',
    'bucket' = '{self.bucket}',
    'path' = '{self.prefix}',
    {endpoint_config}
    'format' = '{self.format}',
    'access.key' = '{self._config._self._config.config.self._config._config.config.username}',
    'secret.key' = '{self._config._self._config.config.self._config._config.config.password}',
    'region' = '{self.region}'
);
"""
    
    def get_connector_config(self) -> Dict[str, Any]:
        config = {
            'connector': 's3',
            'bucket': self.bucket,
            'path': self.prefix,
            'format': self.format,
            'access.key': self._config._self._config.config.self._config._config.config.username,
            'secret.key': self._config._self._config.config.self._config._config.config.password,
            'region': self.region,
        }
        
        if self.endpoint:
            config['endpoint'] = self.endpoint
        
        return config
    
    def validate(self) -> bool:
        return bool(self.bucket and self._config._self._config.config.self._config._config.config.username and self._config._self._config.config.self._config._config.config.password)
    
    def get_dependencies(self) -> List[str]:
        return ['flink-connector-s3']


class S3SinkConnector(BaseSourceConnector):
    """S3 Sink 连接器"""
    
    def __init__(self, config: SourceConfig):
        super().__init__(config)
        self.bucket = self._config._config.config.self._config._config.config.get('bucket', '')
        self.prefix = self._config._config.config.self._config._config.config.get('prefix', 'processed/')
        self.endpoint = self._config._config.config.self._config._config.config.get('endpoint', '')
        self.region = self._config._config.config.self._config._config.config.get('region', 'us-east-1')
    
    def get_flink_sql(self) -> str:
        endpoint_config = ""
        if self.endpoint:
            endpoint_config = f"'endpoint' = '{self.endpoint}',"
        
        return f"""
CREATE SINK TABLE sink_s3 (
    timestamp TIMESTAMP,
    message STRING,
    pipeline_id INT
) WITH (
    'connector' = 's3',
    'bucket' = '{self.bucket}',
    'path' = '{self.prefix}',
    {endpoint_config}
    'format' = 'json',
    'access.key' = '{self._config._self._config.config.self._config._config.config.username}',
    'secret.key' = '{self._config._self._config.config.self._config._config.config.password}'
);
"""
    
    def get_connector_config(self) -> Dict[str, Any]:
        config = {
            'connector': 's3',
            'bucket': self.bucket,
            'path': self.prefix,
            'format': 'json',
            'access.key': self._config._self._config.config.self._config._config.config.username,
            'secret.key': self._config._self._config.config.self._config._config.config.password,
            'region': self.region,
        }
        
        if self.endpoint:
            config['endpoint'] = self.endpoint
        
        return config
    
    def validate(self) -> bool:
        return bool(self.bucket)
