"""
Connectors - Source & Sink Connectors

支持的数据源类型:
- kafka: Kafka 流式接入
- syslog: Syslog 协议接入
- webhook: HTTP Webhook 接入
- file: 文件/目录监控接入
- jdbc: 关系型数据库接入
- es: Elasticsearch 接入
- s3: S3 对象存储接入
- sftp: SFTP 文件接入
- snmp: SNMP 监控接入
- api: HTTP API 拉取接入
"""

from .base import BaseSourceConnector, SourceConfig, SourceType, DeployMode
from .kafka_connector import KafkaSourceConnector, KafkaSinkConnector
from .syslog_connector import SyslogSourceConnector, SyslogUDPSourceConnector, SyslogTCPSourceConnector
from .webhook_connector import WebhookSourceConnector, WebhookSinkConnector
from .file_connector import FileSourceConnector, FileSinkConnector
from .jdbc_connector import JDBCSourceConnector, JDBCSinkConnector
from .elasticsearch_connector import ElasticsearchSourceConnector, ElasticsearchSinkConnector
from .s3_connector import S3SourceConnector, S3SinkConnector
from .sftp_connector import SFTPSourceConnector
from .snmp_connector import SNMPSourceConnector

# Source 连接器映射
SOURCE_CONNECTORS = {
    'kafka': KafkaSourceConnector,
    'syslog': SyslogSourceConnector,
    'syslog_udp': SyslogUDPSourceConnector,
    'syslog_tcp': SyslogTCPSourceConnector,
    'webhook': WebhookSourceConnector,
    'http': WebhookSourceConnector,
    'file': FileSourceConnector,
    'jdbc': JDBCSourceConnector,
    'es': ElasticsearchSourceConnector,
    'elasticsearch': ElasticsearchSourceConnector,
    's3': S3SourceConnector,
    'sftp': SFTPSourceConnector,
    'snmp': SNMPSourceConnector,
}

# Sink 连接器映射
SINK_CONNECTORS = {
    'kafka': KafkaSinkConnector,
    'timescaledb': None,  # Uses JDBC
    'postgresql': JDBCSinkConnector,
    'mysql': JDBCSinkConnector,
    'jdbc': JDBCSinkConnector,
    'es': ElasticsearchSinkConnector,
    'elasticsearch': ElasticsearchSinkConnector,
    's3': S3SinkConnector,
    'file': FileSinkConnector,
    'webhook': WebhookSinkConnector,
    'http': WebhookSinkConnector,
}


def get_source_connector(protocol: str, config: SourceConfig) -> BaseSourceConnector:
    """获取 Source 连接器实例
    
    Args:
        protocol: 协议类型 (kafka, syslog, jdbc, etc.)
        config: 源配置
        
    Returns:
        Source 连接器实例
    """
    connector_class = SOURCE_CONNECTORS.get(protocol.lower())
    
    if connector_class is None:
        raise ValueError(f"Unknown source protocol: {protocol}. Supported: {list(SOURCE_CONNECTORS.keys())}")
    
    return connector_class(config)


def get_sink_connector(protocol: str, config: SourceConfig) -> BaseSourceConnector:
    """获取 Sink 连接器实例
    
    Args:
        protocol: 协议类型 (kafka, jdbc, es, etc.)
        config: 目标配置
        
    Returns:
        Sink 连接器实例
    """
    connector_class = SINK_CONNECTORS.get(protocol.lower())
    
    if connector_class is None:
        raise ValueError(f"Unknown sink protocol: {protocol}. Supported: {list(SINK_CONNECTORS.keys())}")
    
    return connector_class(config)


def get_all_supported_protocols() -> dict:
    """获取所有支持的协议"""
    return {
        'source': list(SOURCE_CONNECTORS.keys()),
        'sink': list(SINK_CONNECTORS.keys()),
    }


__all__ = [
    # Base
    'BaseSourceConnector', 'SourceConfig', 'SourceType', 'DeployMode',
    
    # Source Connectors
    'KafkaSourceConnector',
    'SyslogSourceConnector', 'SyslogUDPSourceConnector', 'SyslogTCPSourceConnector',
    'WebhookSourceConnector',
    'FileSourceConnector',
    'JDBCSourceConnector',
    'ElasticsearchSourceConnector',
    'S3SourceConnector',
    'SFTPSourceConnector',
    'SNMPSourceConnector',
    
    # Sink Connectors
    'KafkaSinkConnector',
    'JDBCSinkConnector',
    'ElasticsearchSinkConnector',
    'S3SinkConnector',
    'FileSinkConnector',
    'WebhookSinkConnector',
    
    # Factory
    'get_source_connector', 'get_sink_connector', 'get_all_supported_protocols',
]
