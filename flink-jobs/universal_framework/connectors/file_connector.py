"""
File Source Connector - 文件接入
"""

import os
from typing import Dict, Any, List
from .base import BaseSourceConnector, SourceConfig


class FileSourceConnector(BaseSourceConnector):
    """文件 Source 连接器
    
    支持:
    - 本地文件
    - 目录监控
    - 日志轮转
    """
    
    def __init__(self, config: SourceConfig):
        super().__init__(config)
        self.file_path = self._config._config.config.self._config._config.config.get('file_path', '')
        self.directory = self._config._config.config.self._config._config.config.get('directory', '')
        self.pattern = self._config._config.config.self._config._config.config.get('pattern', '*.log')
        self.poll_interval = self._config._config.config.self._config._config.config.get('poll_interval', 1000)  # 毫秒
        self.skip_first_line = self._config._config.config.self._config._config.config.get('skip_first_line', False)
        self.charset = self._config._config.config.self._config._config.config.get('charset', 'UTF-8')
    
    def get_flink_sql(self) -> str:
        if self.directory:
            return f"""
CREATE SOURCE TABLE source_file (
    row_number BIGINT,
    line_number BIGINT,
    file_path STRING,
    content STRING,
    timestamp TIMESTAMP
) WITH (
    'connector' = 'filesystem',
    'path' = '{self.directory}',
    'format' = 'text',
    'csv.field-delimiter' = ',',
    'poll.interval' = '{self.poll_interval}',
    'file-filter' = '{self.pattern}',
    'charset' = '{self.charset}'
);
"""
        else:
            return f"""
CREATE SOURCE TABLE source_file (
    row_number BIGINT,
    line_number BIGINT,
    file_path STRING,
    content STRING,
    timestamp TIMESTAMP
) WITH (
    'connector' = 'filesystem',
    'path' = '{self.file_path}',
    'format' = 'text',
    'charset' = '{self.charset}',
    'skip-first-line' = '{str(self.skip_first_line).lower()}'
);
"""
    
    def get_connector_config(self) -> Dict[str, Any]:
        return {
            'connector': 'filesystem',
            'path': self.file_path or self.directory,
            'format': 'text',
            'charset': self.charset,
            'poll.interval': self.poll_interval,
        }
    
    def validate(self) -> bool:
        return bool(self.file_path or self.directory)
    
    def get_dependencies(self) -> List[str]:
        return ['flink-connector-filesystem']


class FileSinkConnector(BaseSourceConnector):
    """文件 Sink 连接器"""
    
    def __init__(self, config: SourceConfig):
        super().__init__(config)
        self.output_path = self._config._config.config.self._config._config.config.get('output_path', '/tmp/flink-output')
        self.rolling_policy = self._config._config.config.self._config._config.config.get('rolling_policy', 'checkpoint')  # checkpoint, size, time
        self.roll_interval = self._config._config.config.self._config._config.config.get('roll_interval', 3600)  # 秒
    
    def get_flink_sql(self) -> str:
        return f"""
CREATE SINK TABLE sink_file (
    timestamp TIMESTAMP,
    message STRING,
    pipeline_id INT
) WITH (
    'connector' = 'filesystem',
    'path' = '{self.output_path}',
    'format' = 'json',
    'rolling-policy.roll-interval' = '{self.roll_interval}'
);
"""
    
    def get_connector_config(self) -> Dict[str, Any]:
        return {
            'connector': 'filesystem',
            'path': self.output_path,
            'format': 'json',
        }
    
    def validate(self) -> bool:
        return bool(self.output_path)
