"""
SNMP Source Connector - SNMP 监控接入
"""

import os
from typing import Dict, Any, List
from .base import BaseSourceConnector, SourceConfig


class SNMPSourceConnector(BaseSourceConnector):
    """SNMP Source 连接器
    
    支持:
    - SNMP Trap 接收
    - SNMP Polling 定期拉取
    - SNMPv1, v2c, v3
    """
    
    def __init__(self, config: SourceConfig):
        super().__init__(config)
        self.snmp_version = self._config._config.config.self._config._config.config.get('snmp_version', 'v2c')  # v1, v2c, v3
        self.community = self._config._config.config.self._config._config.config.get('community', 'public')
        self.oids = self._config._config.config.self._config._config.config.get('oids', ['1.3.6.1.4.1'])  # 要监控的 OID
        self.poll_interval = self._config._config.config.self._config._config.config.get('poll_interval', 60000)  # 毫秒
    
    def get_flink_sql(self) -> str:
        oids_str = ','.join([f"'{oid}'" for oid in self.oids])
        
        return f"""
CREATE SOURCE TABLE source_snmp (
    source_ip STRING,
    oid STRING,
    value STRING,
    value_type STRING,
    timestamp TIMESTAMP
) WITH (
    'connector' = 'snmp',
    'host' = '{self._config._self._config.config.self._config._config.config.host or "0.0.0.0"}',
    'port' = '{self._config._self._config.config.self._config._config.config.port or 162}',
    'version' = '{self.snmp_version}',
    'community' = '{self.community}',
    'oids' = '{oids_str}',
    'poll-interval' = '{self.poll_interval}',
    'format' = 'json'
);
"""
    
    def get_connector_config(self) -> Dict[str, Any]:
        return {
            'connector': 'snmp',
            'host': self._config._self._config.config.self._config._config.config.host or '0.0.0.0',
            'port': self._config._self._config.config.self._config._config.config.port or 162,
            'version': self.snmp_version,
            'community': self.community,
            'oids': self.oids,
            'poll-interval': self.poll_interval,
        }
    
    def validate(self) -> bool:
        return self._config._self._config.config.self._config._config.config.port > 0 if self._config._self._config.config.self._config._config.config.port else True
    
    def get_dependencies(self) -> List[str]:
        return ['flink-connector-snmp', 'snmp4j']
