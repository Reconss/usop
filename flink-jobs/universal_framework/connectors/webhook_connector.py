"""
Webhook Source Connector - Webhook 接入
"""

import os
from typing import Dict, Any, List
from .base import BaseSourceConnector, SourceConfig


class WebhookSourceConnector(BaseSourceConnector):
    """Webhook Source 连接器
    
    支持:
    - HTTP POST 推送
    - 认证: API Key, Bearer Token, Basic Auth
    """
    
    def __init__(self, config: SourceConfig):
        super().__init__(config)
        self.endpoint_path = self._config._config.config.self._config._config.config.get('endpoint_path', '/webhook')
        self.auth_type = self._config._config.config.self._config._config.config.get('auth_type', 'none')  # none, api_key, bearer, basic
        self.auth_header = self._config._config.config.self._config._config.config.get('auth_header', 'X-API-Key')
        self.format = self._config._config.config.self._config._config.config.get('format', 'json')  # json, text, form
        self.ssl_enabled = self._config._config.config.self._config._config.config.get('ssl_enabled', False)
    
    def get_flink_sql(self) -> str:
        return f"""
CREATE SOURCE TABLE source_webhook (
    request_id STRING,
    timestamp TIMESTAMP,
    headers MAP<STRING, STRING>,
    body STRING,
    client_ip STRING
) WITH (
    'connector' = 'http',
    'url' = 'http://{self._config._self._config.config.self._config._config.config.host or "0.0.0.0"}:{self._config._self._config.config.self._config._config.config.port or 8080}{self.endpoint_path}',
    'format' = '{self.format}',
    'auth.type' = '{self.auth_type}',
    'ssl.enabled' = '{str(self.ssl_enabled).lower()}'
);
"""
    
    def get_connector_config(self) -> Dict[str, Any]:
        return {
            'connector': 'http',
            'url': f"http://{self._config._self._config.config.self._config._config.config.host}:{self._config._self._config.config.self._config._config.config.port}{self.endpoint_path}",
            'format': self.format,
            'auth.type': self.auth_type,
            'ssl.enabled': self.ssl_enabled,
        }
    
    def validate(self) -> bool:
        return self._config._self._config.config.self._config._config.config.port > 0 if self._config._self._config.config.self._config._config.config.port else True
    
    def get_dependencies(self) -> List[str]:
        return ['flink-connector-http']


class WebhookSinkConnector(BaseSourceConnector):
    """Webhook Sink 连接器"""
    
    def __init__(self, config: SourceConfig):
        super().__init__(config)
        self.url = self._config._config.config.self._config._config.config.get('url', '')
        self.method = self._config._config.config.self._config._config.config.get('method', 'POST')  # POST, PUT
        self.batch_size = self._config._config.config.self._config._config.config.get('batch_size', 1)
        self.timeout = self._config._config.config.self._config._config.config.get('timeout', 5000)  # 毫秒
    
    def get_flink_sql(self) -> str:
        return f"""
CREATE SINK TABLE sink_webhook (
    timestamp TIMESTAMP,
    message STRING,
    pipeline_id INT
) WITH (
    'connector' = 'http',
    'url' = '{self.url}',
    'method' = '{self.method}',
    'batch-size' = '{self.batch_size}',
    'timeout' = '{self.timeout}',
    'format' = 'json'
);
"""
    
    def get_connector_config(self) -> Dict[str, Any]:
        return {
            'connector': 'http',
            'url': self.url,
            'method': self.method,
            'batch-size': self.batch_size,
            'timeout': self.timeout,
        }
    
    def validate(self) -> bool:
        return bool(self.url)
