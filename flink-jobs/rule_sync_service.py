"""
规则同步服务
将 PostgreSQL 中的检测规则同步到 Flink 和 Kafka

功能:
    - 从 PostgreSQL 读取规则
    - 将规则发布到 Kafka 供 Flink 消费
    - 支持规则热更新
    - 提供规则版本管理
"""

import json
import time
import threading
from datetime import datetime
from typing import List, Dict, Optional
from dataclasses import dataclass, asdict
from enum import Enum

import psycopg2
from kafka import KafkaProducer, KafkaConsumer
from kafka.errors import KafkaError

# 配置
POSTGRES_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'database': 'usop',
    'user': 'postgres',
    'password': 'postgres'
}

KAFKA_BROKER = 'localhost:9092'
RULE_TOPIC = 'rule-updates'
POLL_INTERVAL = 5  # 秒


class RuleStatus(Enum):
    """规则状态"""
    DRAFT = 'draft'
    ENABLED = 'enabled'
    DISABLED = 'disabled'
    DELETED = 'deleted'


class RuleSyncEvent(Enum):
    """规则同步事件类型"""
    CREATED = 'created'
    UPDATED = 'updated'
    DELETED = 'deleted'
    ENABLED = 'enabled'
    DISABLED = 'disabled'


@dataclass
class SyncedRule:
    """同步后的规则数据"""
    rule_id: str
    name: str
    type: str  # single, correlation, sequence, threshold
    status: str
    severity: int
    condition: Dict
    window_seconds: int
    threshold: int
    log_type: str
    field: str
    value: str
    action: str
    updated_at: str
    version: int
    event: str  # 同步事件类型


class RuleSyncService:
    """规则同步服务"""
    
    def __init__(self, pg_config: Dict = None, kafka_broker: str = None):
        self.pg_config = pg_config or POSTGRES_CONFIG
        self.kafka_broker = kafka_broker or KAFKA_BROKER
        self.producer = None
        self.conn = None
        self.cursor = None
        self.last_version = 0
        self._running = False
        self._lock = threading.Lock()
        
    def connect(self):
        """建立数据库连接"""
        self.conn = psycopg2.connect(**self.pg_config)
        self.cursor = self.conn.cursor()
        print(f"已连接到 PostgreSQL: {self.pg_config['host']}:{self.pg_config['port']}")
        
    def connect_kafka(self):
        """建立 Kafka 连接"""
        self.producer = KafkaProducer(
            bootstrap_servers=self.kafka_broker,
            value_serializer=lambda v: json.dumps(v, ensure_ascii=False).encode('utf-8'),
            acks='all',
            retries=3
        )
        print(f"已连接到 Kafka: {self.kafka_broker}")
        
    def disconnect(self):
        """关闭连接"""
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()
        if self.producer:
            self.producer.close()
        print("连接已关闭")
        
    def get_rules_from_db(self, since_version: int = 0) -> List[SyncedRule]:
        """从数据库获取更新的规则"""
        try:
            query = """
                SELECT 
                    id, name, type, status, severity,
                    rule_content, log_type, data_source_ids,
                    updated_at, created_at
                FROM detection_rules 
                WHERE updated_at > NOW() - INTERVAL '1 day'
                ORDER BY updated_at DESC
            """
            self.cursor.execute(query)
            
            rules = []
            for row in self.cursor.fetchall():
                rule_id, name, rule_type, status, severity, rule_content, log_type, data_source_ids, updated_at, created_at = row
                
                # 解析规则内容
                condition = {}
                threshold = 1
                window_seconds = 60
                field = 'action'
                value = None
                
                try:
                    if rule_content:
                        content = json.loads(rule_content) if isinstance(rule_content, str) else rule_content
                        condition = content.get('condition', {})
                        threshold = content.get('threshold', 1)
                        window_seconds = content.get('window_seconds', 60)
                        field = content.get('field', 'action')
                        value = content.get('value')
                except:
                    pass
                
                synced_rule = SyncedRule(
                    rule_id=rule_id,
                    name=name,
                    type=rule_type,
                    status=status,
                    severity=self._severity_to_int(severity),
                    condition=condition,
                    window_seconds=window_seconds,
                    threshold=threshold,
                    log_type=log_type,
                    field=field,
                    value=value,
                    action='alert',
                    updated_at=updated_at.isoformat() if updated_at else datetime.utcnow().isoformat(),
                    version=int(time.time()),
                    event=RuleSyncEvent.UPDATED.value
                )
                rules.append(synced_rule)
                
            return rules
            
        except Exception as e:
            print(f"查询规则失败: {e}")
            return []
    
    def get_all_enabled_rules(self) -> List[SyncedRule]:
        """获取所有启用的规则"""
        try:
            query = """
                SELECT 
                    id, name, type, severity,
                    rule_content, log_type, data_source_ids,
                    updated_at
                FROM detection_rules 
                WHERE status = 'enabled'
                ORDER BY severity DESC
            """
            self.cursor.execute(query)
            
            rules = []
            for row in self.cursor.fetchall():
                rule_id, name, rule_type, severity, rule_content, log_type, data_source_ids, updated_at = row
                
                condition = {}
                threshold = 1
                window_seconds = 60
                field = 'action'
                value = None
                
                try:
                    if rule_content:
                        content = json.loads(rule_content) if isinstance(rule_content, str) else rule_content
                        condition = content.get('condition', {})
                        threshold = content.get('threshold', 1)
                        window_seconds = content.get('window_seconds', 60)
                        field = content.get('field', 'action')
                        value = content.get('value')
                except:
                    pass
                
                synced_rule = SyncedRule(
                    rule_id=rule_id,
                    name=name,
                    type=rule_type,
                    status='enabled',
                    severity=self._severity_to_int(severity),
                    condition=condition,
                    window_seconds=window_seconds,
                    threshold=threshold,
                    log_type=log_type,
                    field=field,
                    value=value,
                    action='alert',
                    updated_at=updated_at.isoformat() if updated_at else datetime.utcnow().isoformat(),
                    version=int(time.time()),
                    event=RuleSyncEvent.CREATED.value
                )
                rules.append(synced_rule)
                
            return rules
            
        except Exception as e:
            print(f"查询规则失败: {e}")
            return []
    
    def _severity_to_int(self, severity: str) -> int:
        """将严重级别转换为整数"""
        mapping = {
            'critical': 5,
            'high': 4,
            'medium': 3,
            'low': 2,
            'info': 1
        }
        return mapping.get(str(severity).lower(), 3)
    
    def sync_rule_to_kafka(self, rule: SyncedRule):
        """将单条规则同步到 Kafka"""
        try:
            message = {
                'event_type': rule.event,
                'timestamp': datetime.utcnow().isoformat(),
                'rule': asdict(rule)
            }
            
            future = self.producer.send(RULE_TOPIC, value=message)
            record_metadata = future.get(timeout=10)
            
            print(f"规则已同步到 Kafka: {rule.rule_id} -> {record_metadata.topic}:{record_metadata.partition}:{record_metadata.offset}")
            
        except KafkaError as e:
            print(f"Kafka 同步失败: {e}")
            raise
    
    def sync_all_rules(self):
        """全量同步所有启用的规则"""
        print("开始全量同步规则...")
        
        rules = self.get_all_enabled_rules()
        print(f"获取到 {len(rules)} 条启用的规则")
        
        # 批量发送到 Kafka
        for rule in rules:
            try:
                self.sync_rule_to_kafka(rule)
            except:
                continue
        
        print(f"全量同步完成，共同步 {len(rules)} 条规则")
        return len(rules)
    
    def start_watch(self, poll_interval: int = POLL_INTERVAL):
        """启动规则监听 (持续同步变更)"""
        self._running = True
        print(f"启动规则监听，轮询间隔: {poll_interval}秒")
        
        # 先执行全量同步
        self.sync_all_rules()
        
        while self._running:
            try:
                # 增量获取变更
                rules = self.get_rules_from_db(self.last_version)
                
                for rule in rules:
                    self.sync_rule_to_kafka(rule)
                    self.last_version = max(self.last_version, rule.version)
                
                time.sleep(poll_interval)
                
            except KeyboardInterrupt:
                self.stop_watch()
                break
            except Exception as e:
                print(f"监听异常: {e}")
                time.sleep(poll_interval)
    
    def stop_watch(self):
        """停止规则监听"""
        self._running = False
        print("规则监听已停止")


def main():
    """命令行入口"""
    import argparse
    
    parser = argparse.ArgumentParser(description='规则同步服务')
    parser.add_argument('--mode', choices=['sync', 'watch'], default='watch',
                       help='运行模式: sync=一次性同步, watch=持续监听')
    parser.add_argument('--pg-host', default='localhost', help='PostgreSQL 主机')
    parser.add_argument('--pg-port', type=int, default=5432, help='PostgreSQL 端口')
    parser.add_argument('--pg-db', default='usop', help='PostgreSQL 数据库')
    parser.add_argument('--kafka', default='localhost:9092', help='Kafka 地址')
    parser.add_argument('--interval', type=int, default=5, help='轮询间隔(秒)')
    
    args = parser.parse_args()
    
    # 配置
    pg_config = {
        'host': args.pg_host,
        'port': args.pg_port,
        'database': args.pg_db,
        'user': 'postgres',
        'password': 'postgres'
    }
    
    service = RuleSyncService(pg_config, args.kafka)
    
    try:
        service.connect()
        service.connect_kafka()
        
        if args.mode == 'sync':
            service.sync_all_rules()
        else:
            service.start_watch(args.interval)
            
    finally:
        service.disconnect()


if __name__ == '__main__':
    main()
