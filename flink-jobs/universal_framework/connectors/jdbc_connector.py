"""
JDBC Source Connector - 数据库接入
"""

import os
from typing import Dict, Any, List
from .base import BaseSourceConnector, SourceConfig


class JDBCSourceConnector(BaseSourceConnector):
    """JDBC Source 连接器"""
    
    def __init__(self, config: SourceConfig):
        super().__init__(config)
        cfg = config.config or {}
        self.driver = cfg.get('driver', 'com.mysql.cj.jdbc.Driver')
        self.database = cfg.get('database', '')
        self.query = cfg.get('query', 'SELECT * FROM logs WHERE id > ?')
        self.partition_column = cfg.get('partition_column', 'id')
        self.partition_num = cfg.get('partition_num', 4)
        self.scan_interval = cfg.get('scan_interval', 10000)
        self.fetch_size = cfg.get('fetch_size', 1000)
    
    def get_jdbc_url(self) -> str:
        host = self._config.host
        port = self._config.port or 3306
        db = self.database
        
        if 'mysql' in self.driver.lower():
            return f"jdbc:mysql://{host}:{port}/{db}?useSSL=false&serverTimezone=UTC"
        elif 'postgresql' in self.driver.lower():
            return f"jdbc:postgresql://{host}:{port}/{db}"
        return f"jdbc:default://{host}:{port}/{db}"
    
    def get_flink_sql(self) -> str:
        return f"""
CREATE SOURCE TABLE source_jdbc (
    id BIGINT,
    message STRING,
    timestamp TIMESTAMP,
    level STRING
) WITH (
    'connector' = 'jdbc',
    'url' = '{self.get_jdbc_url()}',
    'username' = '{self._config.username}',
    'password' = '{self._config.password}',
    'driver' = '{self.driver}',
    'scan.partition.column' = '{self.partition_column}',
    'scan.partition.num' = '{self.partition_num}',
    'scan.fetch-size' = '{self.fetch_size}',
    'scan.polling.interval' = '{self.scan_interval}'
);
"""
    
    def get_connector_config(self) -> Dict[str, Any]:
        return {
            'connector': 'jdbc',
            'url': self.get_jdbc_url(),
            'username': self._config.username,
            'password': self._config.password,
            'driver': self.driver,
            'query': self.query,
        }
    
    def validate(self) -> bool:
        return bool(self._config.host and self._config.username and self.query)
    
    def get_dependencies(self) -> List[str]:
        return ['flink-connector-jdbc']


class JDBCSinkConnector(BaseSourceConnector):
    """JDBC Sink 连接器"""
    
    def __init__(self, config: SourceConfig):
        super().__init__(config)
        cfg = config.config or {}
        self.driver = cfg.get('driver', 'org.postgresql.Driver')
        self.database = cfg.get('database', '')
        self.table_name = cfg.get('table_name', 'logs')
        self.batch_size = cfg.get('batch_size', 100)
        self.batch_interval = cfg.get('batch_interval', 1000)
    
    def get_jdbc_url(self) -> str:
        host = self._config.host
        port = self._config.port or 5432
        db = self.database
        
        if 'postgresql' in self.driver.lower():
            return f"jdbc:postgresql://{host}:{port}/{db}"
        elif 'mysql' in self.driver.lower():
            return f"jdbc:mysql://{host}:{port}/{db}"
        return f"jdbc:default://{host}:{port}/{db}"
    
    def get_flink_sql(self) -> str:
        return f"""
CREATE SINK TABLE sink_jdbc (
    id STRING,
    message STRING,
    timestamp TIMESTAMP,
    pipeline_id INT
) WITH (
    'connector' = 'jdbc',
    'url' = '{self.get_jdbc_url()}',
    'table-name' = '{self.table_name}',
    'username' = '{self._config.username}',
    'password' = '{self._config.password}',
    'driver' = '{self.driver}',
    'sink.batch-size' = '{self.batch_size}',
    'sink.batch-interval' = '{self.batch_interval}'
);
"""
    
    def get_connector_config(self) -> Dict[str, Any]:
        return {
            'connector': 'jdbc',
            'url': self.get_jdbc_url(),
            'table-name': self.table_name,
            'username': self._config.username,
            'password': self._config.password,
            'driver': self.driver,
        }
    
    def validate(self) -> bool:
        return bool(self._config.host and self.table_name)
