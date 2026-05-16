"""
WAF 日志消费者服务
从 Kafka topic: waf-alert 消费 WAF 告警日志并存储到 TimescaleDB alerts 表
"""

import json
import logging
import threading
from datetime import datetime
from typing import Dict, Any, Optional
from kafka import KafkaConsumer
from kafka.errors import KafkaError
from app.timescaledb import get_tsdb, insert_alert
from app.database import db
from app.models import DataSource, LogType

logger = logging.getLogger(__name__)


class WAFLogConsumer:
    """WAF 日志消费者 - 从 Kafka 消费 WAF 告警并存储"""
    
    _instance = None
    _lock = threading.Lock()
    
    # WAF 告警严重程度映射
    SEVERITY_MAP = {
        '严重': 'critical',
        '高': 'high',
        '中': 'medium',
        '低': 'low',
        '信息': 'low',
    }
    
    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            with cls._lock:
                if not cls._instance:
                    cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self, bootstrap_servers: str = "kafka:29092"):
        if hasattr(self, '_initialized'):
            return
        
        self.bootstrap_servers = bootstrap_servers
        self.topic = "waf-alert"
        self.group_id = "waf-consumer-group"
        self._consumer: Optional[KafkaConsumer] = None
        self._thread: Optional[threading.Thread] = None
        self._running = False
        self._initialized = True
        self._data_source_id = None
        self._log_type_id = None
        
        # 确保数据源存在
        self._ensure_data_source()
    
    def _ensure_data_source(self):
        """确保 WAF 数据源和日志类型存在"""
        try:
            # 查找或创建 WAF 数据源
            self._data_source_id = 1  # 使用已有的数据源或创建新的
            self._log_type_id = "waf_alert"
        except Exception as e:
            logger.warning(f"数据源初始化: {e}")
    
    def _parse_waf_log(self, raw_log: Dict[str, Any]) -> Dict[str, Any]:
        """
        解析 WAF 日志为告警格式
        
        样例日志:
        {
            "timestamp": "2026-05-16T13:53:06.403614",
            "alert_id": "WAF-1778910786403",
            "src_ip": "192.168.35.46",
            "dst_ip": "10.0.92.33",
            "src_port": 5421,
            "dst_port": 80,
            "protocol": "HTTPS",
            "method": "DELETE",
            "host": "www.example10.com",
            "uri": "/etc/passwd",
            "attack_type": "暴力破解",
            "risk_level": "严重",
            "status_code": 400,
            "rule_id": "RULE-5410",
            "message": "检测到SQL注入，来源IP已加入黑名单",
            "action": "log"
        }
        """
        # 转换严重程度
        risk_level = raw_log.get('risk_level', '中')
        severity = self.SEVERITY_MAP.get(risk_level, 'medium')
        
        # 生成告警编号
        alert_id = raw_log.get('alert_id', '')
        if not alert_id:
            import time
            alert_id = f"WAF-{int(time.time() * 1000)}"
        
        # 构建告警数据
        alert_data = {
            'alert_code': alert_id,
            'title': f"[WAF] {raw_log.get('attack_type', '未知攻击类型')} - {raw_log.get('src_ip', '未知')}",
            'description': raw_log.get('message', ''),
            'severity': severity,
            'status': 'new',
            'source': 'waf',
            'source_product': 'WAF',
            'source_type': 'security',
            'category': raw_log.get('attack_type', '其他'),
            'confidence': 95.0,
            
            # 网络信息
            'src_ip': raw_log.get('src_ip'),
            'src_port': raw_log.get('src_port'),
            'dst_ip': raw_log.get('dst_ip'),
            'dst_port': raw_log.get('dst_port'),
            'protocol': raw_log.get('protocol'),
            'hostname': raw_log.get('host'),
            
            # 其他信息
            'raw_log': json.dumps(raw_log, ensure_ascii=False),
            'parsed_data': {
                'method': raw_log.get('method'),
                'uri': raw_log.get('uri'),
                'host': raw_log.get('host'),
                'status_code': raw_log.get('status_code'),
                'rule_id': raw_log.get('rule_id'),
                'action': raw_log.get('action'),
                'attack_type': raw_log.get('attack_type'),
                'risk_level': raw_log.get('risk_level'),
            },
            'extra_data': {},
            
            # 时间
            'first_seen': raw_log.get('timestamp'),
            'last_seen': raw_log.get('timestamp'),
            'tags': [raw_log.get('attack_type', 'WAF'), 'waf-alert'],
        }
        
        return alert_data
    
    def _process_message(self, message: Dict[str, Any]):
        """处理接收到的 WAF 日志消息"""
        try:
            logger.info(f"收到 WAF 日志: {message.get('alert_id', 'N/A')}")
            
            # 解析日志
            alert_data = self._parse_waf_log(message)
            
            # 存储到 TimescaleDB
            tsdb = get_tsdb()
            session = tsdb.get_session()
            
            try:
                alert_id = insert_alert(session, alert_data)
                logger.info(f"WAF 告警已存储: ID={alert_id}, alert_code={alert_data['alert_code']}")
                
            except Exception as e:
                session.rollback()
                logger.error(f"存储 WAF 告警失败: {e}")
                raise
            finally:
                tsdb.close_session(session)
                
        except Exception as e:
            logger.error(f"处理 WAF 日志失败: {e}")
    
    def start(self):
        """启动消费者"""
        if self._running:
            logger.warning("WAF Consumer 已在运行")
            return
        
        try:
            # 创建 Kafka Consumer
            self._consumer = KafkaConsumer(
                self.topic,
                bootstrap_servers=self.bootstrap_servers,
                group_id=self.group_id,
                auto_offset_reset='earliest',
                enable_auto_commit=True,
                auto_commit_interval_ms=5000,
                value_deserializer=lambda v: json.loads(v.decode('utf-8')),
                max_poll_records=100,
                session_timeout_ms=30000,
                heartbeat_interval_ms=10000,
            )
            logger.info(f"WAF Consumer 已连接到 Kafka: {self.bootstrap_servers}, topic: {self.topic}")
            
            # 启动消费线程
            self._running = True
            self._thread = threading.Thread(target=self._consume_loop, daemon=True)
            self._thread.start()
            logger.info("WAF Consumer 线程已启动")
            
        except KafkaError as e:
            logger.error(f"WAF Consumer 启动失败: {e}")
            self._running = False
        except Exception as e:
            logger.error(f"WAF Consumer 启动异常: {e}")
            self._running = False
    
    def _consume_loop(self):
        """消费循环"""
        try:
            for message in self._consumer:
                if not self._running:
                    break
                try:
                    self._process_message(message.value)
                except Exception as e:
                    logger.error(f"处理消息失败: {e}")
        except Exception as e:
            logger.error(f"Consumer 运行错误: {e}")
        finally:
            if self._consumer:
                self._consumer.close()
                logger.info("WAF Consumer 已关闭")
    
    def stop(self):
        """停止消费者"""
        self._running = False
        if self._consumer:
            self._consumer.close()
        logger.info("WAF Consumer 已停止")
    
    def is_running(self) -> bool:
        """检查是否正在运行"""
        return self._running and self._thread and self._thread.is_alive()


# 全局实例
_waf_consumer: Optional[WAFLogConsumer] = None


def get_waf_consumer() -> WAFLogConsumer:
    """获取 WAF 消费者单例"""
    global _waf_consumer
    if _waf_consumer is None:
        # 从环境变���获取 Kafka 配置
        bootstrap_servers = "kafka:29092"  # Docker 内部使用
        import os
        if os.getenv('KAFKA_BOOTSTRAP_SERVERS'):
            bootstrap_servers = os.getenv('KAFKA_BOOTSTRAP_SERVERS')
        elif not os.path.exists('/.dockerenv'):
            # 本地开发环境
            bootstrap_servers = "localhost:9092"
        
        _waf_consumer = WAFLogConsumer(bootstrap_servers=bootstrap_servers)
    return _waf_consumer


def init_waf_consumer(app=None):
    """初始化 WAF 消费者（Flask 应用）"""
    consumer = get_waf_consumer()
    consumer.start()
    
    if app:
        @app.teardown_appcontext
        def cleanup(exception=None):
            pass  # 可在此添加清理逻辑
    
    return consumer


if __name__ == "__main__":
    # 测试消费
    logging.basicConfig(level=logging.INFO)
    consumer = get_waf_consumer()
    consumer.start()
    
    import time
    try:
        while True:
            time.sleep(10)
            print(f"WAF Consumer 运行状态: {consumer.is_running()}")
    except KeyboardInterrupt:
        consumer.stop()
        print("WAF Consumer 已停止")
