"""
数据采集器模块
支持多种数据源获取日志：Webhook、Redis Stream、Kafka等
"""
import json
import threading
import queue
from datetime import datetime
from typing import Dict, Any, List, Optional, Callable
from enum import Enum


class CollectorStatus(Enum):
    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"
    ERROR = "error"


class BaseCollector:
    """采集器基类"""
    
    def __init__(self, config: Dict[str, Any], on_message: Callable = None):
        self.config = config
        self.on_message = on_message
        self.status = CollectorStatus.IDLE
        self._running = False
        self._thread = None
        self._queue = queue.Queue(maxsize=10000)
        self._stats = {
            'received': 0,
            'processed': 0,
            'errors': 0,
            'start_time': None,
            'last_time': None
        }
    
    def start(self):
        """启动采集器"""
        if self.status == CollectorStatus.RUNNING:
            return
        
        self._running = True
        self._stats['start_time'] = datetime.utcnow().isoformat()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        self.status = CollectorStatus.RUNNING
    
    def stop(self):
        """停止采集器"""
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)
        self.status = CollectorStatus.IDLE
    
    def _run(self):
        """采集循环"""
        raise NotImplementedError
    
    def _handle_message(self, message: Any):
        """处理消息"""
        self._stats['received'] += 1
        self._stats['last_time'] = datetime.utcnow().isoformat()
        
        try:
            if self.on_message:
                self.on_message(message)
            self._stats['processed'] += 1
        except Exception as e:
            self._stats['errors'] += 1
            print(f"Error processing message: {e}")
    
    def get_stats(self) -> Dict[str, Any]:
        """获取统计信息"""
        return {
            'status': self.status.value,
            'running': self._running,
            **self._stats
        }


class WebhookCollector(BaseCollector):
    """Webhook采集器 - 接收HTTP POST日志"""
    
    def __init__(self, config: Dict[str, Any], on_message: Callable = None):
        super().__init__(config, on_message)
        self.host = config.get('host', '0.0.0.0')
        self.port = config.get('port', 5002)
    
    def _run(self):
        """启动Flask Webhook服务"""
        from flask import Flask, request, jsonify
        
        app = Flask(__name__)
        
        @app.route('/webhook', methods=['POST'])
        def webhook():
            """接收日志"""
            try:
                content_type = request.content_type or ''
                
                if 'application/json' in content_type:
                    data = request.get_json()
                    if isinstance(data, list):
                        for item in data:
                            self._handle_message(item)
                    elif isinstance(data, dict):
                        self._handle_message(data)
                    else:
                        self._handle_message(data)
                else:
                    raw_log = request.get_data(as_text=True)
                    self._handle_message({'raw_log': raw_log})
                
                return jsonify({'status': 'ok', 'received': self._stats['received']})
            except Exception as e:
                return jsonify({'status': 'error', 'message': str(e)}), 400
        
        @app.route('/webhook/health', methods=['GET'])
        def health():
            return jsonify(self.get_stats())
        
        app.run(host=self.host, port=self.port, debug=False, use_reloader=False, threaded=True)


class RedisStreamCollector(BaseCollector):
    """Redis Stream采集器"""
    
    def __init__(self, config: Dict[str, Any], on_message: Callable = None):
        super().__init__(config, on_message)
        self.client = None
        self.stream_key = config.get('stream_key', 'logs:stream')
        self.group = config.get('group', 'usop-consumers')
        self.consumer = config.get('consumer', f'consumer-{id(self)}')
    
    def _connect(self):
        import redis
        self.client = redis.Redis(
            host=self.config.get('host', 'localhost'),
            port=self.config.get('port', 6379),
            password=self.config.get('password'),
            decode_responses=True
        )
        try:
            self.client.xgroup_create(self.stream_key, self.group, id='0', mkstream=True)
        except:
            pass
    
    def _run(self):
        self._connect()
        
        while self._running:
            try:
                messages = self.client.xreadgroup(
                    self.group, self.consumer, {self.stream_key: '>'}, count=100, block=5000
                )
                
                for stream, entries in messages:
                    for msg_id, data in entries:
                        try:
                            log_data = json.loads(data.get('data', '{}'))
                            log_data['_stream_id'] = msg_id
                            self._handle_message(log_data)
                            self.client.xack(self.stream_key, self.group, msg_id)
                        except Exception as e:
                            print(f"Error processing stream message: {e}")
                            
            except Exception as e:
                print(f"Redis stream error: {e}")
                self._stats['errors'] += 1


class KafkaCollector(BaseCollector):
    """Kafka采集器"""
    
    def __init__(self, config: Dict[str, Any], on_message: Callable = None):
        super().__init__(config, on_message)
        self.consumer = None
        self.topic = config.get('topic', 'security-logs')
        self.group = config.get('group', 'usop-consumer')
    
    def _run(self):
        try:
            from kafka import KafkaConsumer
        except ImportError:
            print("kafka-python not installed")
            return
        
        self.consumer = KafkaConsumer(
            self.topic,
            bootstrap_servers=self.config.get('bootstrap_servers', 'localhost:9092'),
            group_id=self.group,
            auto_offset_reset='latest',
            enable_auto_commit=True,
            value_deserializer=lambda x: json.loads(x.decode('utf-8')) if x else None,
            consumer_timeout_ms=5000
        )
        
        while self._running:
            try:
                for message in self.consumer:
                    if not self._running:
                        break
                    if message.value:
                        message.value['_kafka_offset'] = message.offset
                        message.value['_kafka_partition'] = message.partition
                        self._handle_message(message.value)
            except Exception as e:
                print(f"Kafka consumer error: {e}")
        
        if self.consumer:
            self.consumer.close()


class CollectorManager:
    """采集器管理器"""
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._collectors = {}
                    cls._instance._init_lock = threading.Lock()
        return cls._instance
    
    def register(self, name: str, collector: BaseCollector):
        """注册采集器"""
        with self._init_lock:
            self._collectors[name] = collector
    
    def unregister(self, name: str):
        """取消注册"""
        with self._init_lock:
            if name in self._collectors:
                self._collectors[name].stop()
                del self._collectors[name]
    
    def start(self, name: str = None):
        """启动采集器"""
        with self._init_lock:
            if name and name in self._collectors:
                self._collectors[name].start()
            else:
                for collector in self._collectors.values():
                    collector.start()
    
    def stop(self, name: str = None):
        """停止采集器"""
        with self._init_lock:
            if name:
                if name in self._collectors:
                    self._collectors[name].stop()
            else:
                for collector in self._collectors.values():
                    collector.stop()
    
    def get_stats(self, name: str = None) -> Dict[str, Any]:
        """获取统计"""
        with self._init_lock:
            if name and name in self._collectors:
                return self._collectors[name].get_stats()
            return {name: c.get_stats() for name, c in self._collectors.items()}
    
    def list_collectors(self) -> List[Dict[str, Any]]:
        """列出所有采集器"""
        with self._init_lock:
            return [{'name': name, **c.get_stats()} for name, c in self._collectors.items()]


collector_manager = CollectorManager()


def create_collector(collector_type: str, config: Dict[str, Any], on_message: Callable = None) -> BaseCollector:
    """创建采集器"""
    collectors = {
        'webhook': WebhookCollector,
        'redis': RedisStreamCollector,
        'kafka': KafkaCollector,
    }
    collector_class = collectors.get(collector_type.lower())
    if not collector_class:
        raise ValueError(f"Unknown collector type: {collector_type}")
    return collector_class(config, on_message)
