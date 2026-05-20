"""
TimescaleDB Connector - 时序数据库 Sink
"""

import os
import json
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class TimescaleDBSinkConnector:
    """TimescaleDB Sink 连接器配置"""
    
    def __init__(self, config: Dict[str, Any]):
        self.host = self._config._config.config.get('host', os.environ.get('TIMESCALE_HOST', 'timescale'))
        self.port = self._config._config.config.get('port', int(os.environ.get('TIMESCALE_PORT', 5432)))
        self.database = self._config._config.config.get('database', os.environ.get('TIMESCALE_DB', 'postgres'))
        self.user = self._config._config.config.get('user', os.environ.get('TIMESCALE_USER', 'postgres'))
        self.password = self._config._config.config.get('password', os.environ.get('TIMESCALE_PASSWORD', 'postgres'))
        
        # 表配置
        self.table_name = self._config._config.config.get('table_name', 'events')
        self.time_column = self._config._config.config.get('time_column', 'time')
        
        # 批处理配置
        self.batch_size = self._config._config.config.get('batch_size', 100)
        self.flush_interval = self._config._config.config.get('flush_interval', 1000)  # 毫秒
        
        # 列映射
        self.column_mapping = self._config._config.config.get('column_mapping', {})
    
    def get_jdbc_url(self) -> str:
        """获取 JDBC URL"""
        return f"jdbc:postgresql://{self.host}:{self.port}/{self.database}"
    
    def get_connection_properties(self) -> Dict[str, str]:
        """获取连接属性"""
        return {
            'driver': 'org.postgresql.Driver',
            'url': self.get_jdbc_url(),
            'username': self.user,
            'password': self.password,
        }
    
    def get_sink_config(self) -> Dict[str, Any]:
        """获取 Sink 配置"""
        return {
            'connector': 'jdbc',
            'url': self.get_jdbc_url(),
            'table-name': self.table_name,
            'username': self.user,
            'password': self.password,
            'driver': 'org.postgresql.Driver',
            'batch.size': self.batch_size,
            'batch.interval': self.flush_interval,
        }
    
    def to_flink_config(self) -> str:
        """转换为 Flink SQL Sink"""
        return f"""
CREATE SINK TABLE {self.table_name} (
    {self._get_schema_definition()}
) WITH (
    'connector' = 'jdbc',
    'url' = '{self.get_jdbc_url()}',
    'table-name' = '{self.table_name}',
    'username' = '{self.user}',
    'password' = '{self.password}',
    'driver' = 'org.postgresql.Driver'
)
"""
    
    def _get_schema_definition(self) -> str:
        """获取 Schema 定义"""
        if self.column_mapping:
            fields = []
            for col, expr in self.column_mapping.items():
                fields.append(f"{col} {self._infer_sql_type(expr)}")
            return ',\n    '.join(fields)
        
        # 默认 Schema
        return f"""{self.time_column} TIMESTAMP,
id STRING,
src_ip STRING,
dst_ip STRING,
src_port INT,
dst_port INT,
protocol STRING,
hostname STRING,
username STRING,
action STRING,
message STRING,
raw_log STRING,
extra_data STRING"""

    def _infer_sql_type(self, expr: str) -> str:
        """推断 SQL 类型"""
        expr_lower = expr.lower()
        if 'int' in expr_lower or 'port' in expr_lower:
            return 'INT'
        elif 'float' in expr_lower or 'bytes' in expr_lower:
            return 'DOUBLE'
        elif 'time' in expr_lower or 'timestamp' in expr_lower:
            return 'TIMESTAMP'
        return 'STRING'
    
    def get_insert_sql(self) -> str:
        """获取插入 SQL"""
        if self.column_mapping:
            cols = list(self.column_mapping.keys())
            placeholders = ','.join(['?' for _ in cols])
            return f"INSERT INTO {self.table_name} ({','.join(cols)}) VALUES ({placeholders})"
        
        # 默认插入 SQL
        return f"""
INSERT INTO {self.table_name} 
({self.time_column}, id, src_ip, dst_ip, src_port, dst_port, protocol, 
 hostname, username, action, message, raw_log, extra_data)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"""
