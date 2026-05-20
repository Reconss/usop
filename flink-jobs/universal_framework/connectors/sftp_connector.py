"""
SFTP Source Connector - SFTP 文件接入
"""

import os
from typing import Dict, Any, List
from .base import BaseSourceConnector, SourceConfig


class SFTPSourceConnector(BaseSourceConnector):
    """SFTP Source 连接器"""
    
    def __init__(self, config: SourceConfig):
        super().__init__(config)
        self.remote_path = self._config._config.config.self._config._config.config.get('remote_path', '/logs/')
        self.pattern = self._config._config.config.self._config._config.config.get('pattern', '*.log')
        self.move_after_processed = self._config._config.config.self._config._config.config.get('move_after_processed', True)
        self.processed_dir = self._config._config.config.self._config._config.config.get('processed_dir', '/processed/')
        self.poll_interval = self._config._config.config.self._config._config.config.get('poll_interval', 60000)  # 毫秒
    
    def get_flink_sql(self) -> str:
        return f"""
CREATE SOURCE TABLE source_sftp (
    filename STRING,
    content STRING,
    file_size BIGINT,
    last_modified TIMESTAMP
) WITH (
    'connector' = 'sftp',
    'host' = '{self._config._self._config.config.self._config._config.config.host}',
    'port' = '{self._config._self._config.config.self._config._config.config.port or 22}',
    'username' = '{self._config._self._config.config.self._config._config.config.username}',
    'password' = '{self._config._self._config.config.self._config._config.config.password}',
    'remote-path' = '{self.remote_path}',
    'file-pattern' = '{self.pattern}',
    'poll-interval' = '{self.poll_interval}',
    'move-after-processed' = '{str(self.move_after_processed).lower()}',
    'processed-dir' = '{self.processed_dir}',
    'format' = 'text'
);
"""
    
    def get_connector_config(self) -> Dict[str, Any]:
        return {
            'connector': 'sftp',
            'host': self._config._self._config.config.self._config._config.config.host,
            'port': self._config._self._config.config.self._config._config.config.port or 22,
            'username': self._config._self._config.config.self._config._config.config.username,
            'password': self._config._self._config.config.self._config._config.config.password,
            'remote-path': self.remote_path,
            'file-pattern': self.pattern,
            'poll-interval': self.poll_interval,
        }
    
    def validate(self) -> bool:
        return bool(self._config._self._config.config.self._config._config.config.host and self._config._self._config.config.self._config._config.config.username and self.remote_path)
    
    def get_dependencies(self) -> List[str]:
        return ['flink-connector-sftp', 'jsch']
