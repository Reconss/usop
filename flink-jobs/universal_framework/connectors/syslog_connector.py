"""
Syslog Source Connector - Syslog 协议接入
"""

import os
from typing import Dict, Any, List
from .base import BaseSourceConnector, SourceConfig


class SyslogSourceConnector(BaseSourceConnector):
    """Syslog Source 连接器"""
    
    def __init__(self, config: SourceConfig):
        super().__init__(config)
        cfg = config.config or {}
        self.protocol = cfg.get('protocol', 'udp')
        self.port = config.port or 5140
        self.rfc_version = cfg.get('rfc_version', 'auto')
        self.charset = cfg.get('charset', 'UTF-8')
    
    def get_flink_sql(self) -> str:
        return f"""
CREATE SOURCE TABLE source_syslog (
    timestamp TIMESTAMP,
    hostname STRING,
    app_name STRING,
    proc_id STRING,
    message STRING,
    facility INT,
    severity INT,
    raw_log STRING
) WITH (
    'connector' = 'syslog',
    'host' = '{self._config.host or "0.0.0.0"}',
    'port' = '{self.port}',
    'protocol' = '{self.protocol}',
    'charset' = '{self.charset}',
    'rfc-version' = '{self.rfc_version}',
    'format' = 'raw'
);
"""
    
    def get_connector_config(self) -> Dict[str, Any]:
        return {
            'connector': 'syslog',
            'host': self._config.host or '0.0.0.0',
            'port': self.port,
            'protocol': self.protocol,
            'charset': self.charset,
            'rfc-version': self.rfc_version,
        }
    
    def validate(self) -> bool:
        return self.port > 0 and self.port < 65536
    
    def get_dependencies(self) -> List[str]:
        return ['flink-connector-syslog']


class SyslogUDPSourceConnector(SyslogSourceConnector):
    """Syslog UDP Source"""
    
    def __init__(self, config: SourceConfig):
        cfg = dict(config.config or {})
        cfg['protocol'] = 'udp'
        config.config = cfg
        super().__init__(config)


class SyslogTCPSourceConnector(SyslogSourceConnector):
    """Syslog TCP Source"""
    
    def __init__(self, config: SourceConfig):
        cfg = dict(config.config or {})
        cfg['protocol'] = 'tcp'
        config.config = cfg
        super().__init__(config)
