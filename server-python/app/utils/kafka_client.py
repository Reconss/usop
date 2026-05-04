"""
Kafka 集成工具
用于将 Flask 后端与 Kafka 集成

依赖:
    pip install kafka-python confluent-kafka
"""

import json
import threading
import logging
from typing import Dict, Any, List, Optional, Callable
from datetime import datetime
from kafka import KafkaProducer, KafkaConsumer
from kafka.errors import KafkaError
import time

logger = logging.getLogger(__name__)


class KafkaClient:
    """Kafka 客户端封装"""
    
    # 单例实例
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            with cls._lock:
                if not cls._instance:
                    cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self, bootstrap_servers: str = "localhost:9092"):
        if hasattr(self, '_initialized'):
            return
        
        self.bootstrap_servers = bootstrap_servers
        self._producer = None
        self._consumers: Dict[str, KafkaConsumer] = {}
        self._initialized = True
        self._consumer_threads: Dict[str, threading.Thread] = {}
    
    @property
    def producer(self) -> Optional[KafkaProducer]:
        """获取 Kafka Producer"""
        if self._producer is None:
            try:
                self._producer = KafkaProducer(
                    bootstrap_servers=self.bootstrap_servers,
                    value_serializer=lambda v: json.dumps(v, ensure_ascii=False).encode('utf-8'),
                    key_serializer=lambda k: k.encode('utf-8') if k else None,
                    acks='all',  # 确保所有副本确认
                    retries=3,
                    max_block_ms=5000,  # 阻塞最大时间
                    compression_type='lz4',  # 压缩
                    batch_size=16384,  # 批次大小
                    linger_ms=10,  # 批次等待时间
                )
                logger.info(f"Kafka Producer 初始化成功: {self.bootstrap_servers}")
            except KafkaError as e:
                logger.error(f"Kafka Producer 初始化失败: {e}")
                return None
        return self._producer
    
    def send_message(
        self, 
        topic: str, 
        message: Dict[str, Any], 
        key: Optional[str] = None
    ) -> bool:
        """
        发送消息到 Kafka
        
        Args:
            topic: Kafka 主题
            message: 消息内容
            key: 消息键（用于分区）
        
        Returns:
            是否发送成功
        """
        try:
            if self.producer is None:
                logger.error("Kafka Producer 未初始化")
                return False
            
            future = self.producer.send(topic, value=message, key=key)
            # 等待确认（可选，生产环境可异步发送）
            # future.get(timeout=10)
            logger.debug(f"消息已发送到 {topic}: {message.get('id', 'N/A')}")
            return True
            
        except KafkaError as e:
            logger.error(f"发送消息失败: {e}")
            return False
    
    def send_batch(
        self, 
        topic: str, 
        messages: List[Dict[str, Any]], 
        key_field: Optional[str] = None
    ) -> int:
        """
        批量发送消息
        
        Args:
            topic: Kafka 主题
            messages: 消息列表
            key_field: 用作 key 的字段名
        
        Returns:
            成功发送的数量
        """
        success_count = 0
        for msg in messages:
            key = msg.get(key_field) if key_field else None
            if self.send_message(topic, msg, key):
                success_count += 1
        
        # 确保所有消息发送完成
        if self.producer:
            self.producer.flush()
        
        return success_count
    
    def create_consumer(
        self, 
        topic: str, 
        group_id: str,
        auto_offset_reset: str = 'earliest'
    ) -> Optional[KafkaConsumer]:
        """
        创建 Kafka Consumer
        
        Args:
            topic: 订阅主题
            group_id: 消费者组 ID
            auto_offset_reset: 起始位置 (earliest, latest)
        
        Returns:
            KafkaConsumer 实例
        """
        try:
            consumer = KafkaConsumer(
                topic,
                bootstrap_servers=self.bootstrap_servers,
                group_id=group_id,
                auto_offset_reset=auto_offset_reset,
                enable_auto_commit=True,
                auto_commit_interval_ms=5000,
                value_deserializer=lambda v: json.loads(v.decode('utf-8')),
                max_poll_records=100,  # 每次最多拉取的消息数
                session_timeout_ms=30000,
                heartbeat_interval_ms=10000,
            )
            logger.info(f"Kafka Consumer 创建成功: topic={topic}, group={group_id}")
            return consumer
            
        except KafkaError as e:
            logger.error(f"Kafka Consumer 创建失败: {e}")
            return None
    
    def start_consumer(
        self,
        topic: str,
        group_id: str,
        callback: Callable[[Dict[str, Any]], None],
        auto_offset_reset: str = 'earliest'
    ):
        """
        启动消费者线程
        
        Args:
            topic: 订阅主题
            group_id: 消费者组 ID
            callback: 消息处理回调函数
            auto_offset_reset: 起始位置
        """
        consumer_id = f"{topic}:{group_id}"
        
        if consumer_id in self._consumer_threads:
            logger.warning(f"Consumer 已存在: {consumer_id}")
            return
        
        consumer = self.create_consumer(topic, group_id, auto_offset_reset)
        if consumer is None:
            return
        
        self._consumers[consumer_id] = consumer
        
        def consume_loop():
            try:
                for message in consumer:
                    try:
                        callback(message.value)
                    except Exception as e:
                        logger.error(f"处理消息失败: {e}")
            except Exception as e:
                logger.error(f"Consumer 运行错误: {e}")
            finally:
                consumer.close()
        
        thread = threading.Thread(target=consume_loop, daemon=True)
        thread.start()
        self._consumer_threads[consumer_id] = thread
        logger.info(f"Consumer 线程已启动: {consumer_id}")
    
    def stop_consumer(self, topic: str, group_id: str):
        """停止消费者"""
        consumer_id = f"{topic}:{group_id}"
        
        if consumer_id in self._consumers:
            self._consumers[consumer_id].close()
            del self._consumers[consumer_id]
            
        if consumer_id in self._consumer_threads:
            del self._consumer_threads[consumer_id]
        
        logger.info(f"Consumer 已停止: {consumer_id}")
    
    def close(self):
        """关闭所有连接"""
        if self._producer:
            self._producer.close()
            self._producer = None
        
        for consumer_id, consumer in self._consumers.items():
            consumer.close()
        self._consumers.clear()
        self._consumer_threads.clear()
        
        logger.info("Kafka 客户端已关闭")


# 全局 Kafka 客户端实例
kafka_client = None

def get_kafka_client() -> KafkaClient:
    """获取 Kafka 客户端单例"""
    global kafka_client
    if kafka_client is None:
        kafka_client = KafkaClient(
            bootstrap_servers="localhost:9092"  # Docker 环境使用容器名
        )
    return kafka_client


class LogIngestionService:
    """日志摄入服务"""
    
    def __init__(self):
        self.client = get_kafka_client()
        self.raw_logs_topic = "raw-logs"
        self.parsed_logs_topic = "parsed-logs"
        self.alerts_topic = "alerts"
    
    def ingest_logs(self, logs: List[Dict[str, Any]], source: str = "api") -> int:
        """
        摄入日志到 Kafka
        
        Args:
            logs: 日志列表
            source: 数据来源标识
        
        Returns:
            成功摄入的数量
        """
        messages = []
        for log in logs:
            messages.append({
                'id': log.get('id', f"{source}-{time.time()}"),
                'source': source,
                'raw': log.get('raw', str(log)),
                'timestamp': log.get('timestamp', datetime.utcnow().isoformat()),
                'metadata': {
                    'source': source,
                    'ingest_time': datetime.utcnow().isoformat()
                }
            })
        
        return self.client.send_batch(self.raw_logs_topic, messages, 'id')
    
    def get_stats(self) -> Dict[str, Any]:
        """获取摄入统计"""
        return {
            'producer_connected': self.client.producer is not None,
            'bootstrap_servers': self.client.bootstrap_servers,
            'topics': {
                'raw_logs': self.raw_logs_topic,
                'parsed_logs': self.parsed_logs_topic,
                'alerts': self.alerts_topic
            }
        }


# Flask 集成示例
def init_kafka(app=None):
    """初始化 Kafka（Flask 应用）"""
    kafka_client = get_kafka_client()
    
    if app:
        @app.teardown_appcontext
        def cleanup(exception=None):
            pass  # 可在此添加清理逻辑
    
    return kafka_client


# 使用示例
if __name__ == "__main__":
    # 测试 Kafka 连接
    client = get_kafka_client()
    
    # 发送测试消息
    test_log = {
        "id": "test-001",
        "raw": '{"timestamp": "2024-01-01T10:00:00Z", "src_ip": "192.168.1.1", "alert": "test"}',
        "type": "json"
    }
    
    client.send_message("raw-logs", test_log, key="test-001")
    print("测试消息已发送")
