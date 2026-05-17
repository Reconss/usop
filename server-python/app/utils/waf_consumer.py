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
import time
import os

logger = logging.getLogger(__name__)


class WAFLogConsumer:
    """WAF 日志消费者 - 从 Kafka 消费 WAF 告警并存储到 alerts 表"""
    
    _instance = None
    _lock = threading.Lock()
    
    # WAF 告警严重程度映射
    SEVERITY_MAP = {
        '严重': 'critical',
        '高危': 'high',
        '高': 'high',
        '中': 'medium',
        '低': 'low',
        '信息': 'low',
        'critical': 'critical',
        'high': 'high',
        'medium': 'medium',
        'low': 'low',
    }
    
    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            with cls._lock:
                if not cls._instance:
                    cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self, bootstrap_servers: str = None):
        if hasattr(self, '_initialized'):
            return
        
        # 从环境变量获取 Kafka 配置
        self.bootstrap_servers = bootstrap_servers or os.getenv('KAFKA_BOOTSTRAP_SERVERS', 'kafka:29092')
        self.topic = "waf-alert"
        self.group_id = "waf-consumer-group"
        self._consumer: Optional[KafkaConsumer] = None
        self._thread: Optional[threading.Thread] = None
        self._running = False
        self._initialized = True
        self._data_source_id = None
        self._log_type_id = None
        
        logger.info(f"WAF Consumer 初始化: Kafka={self.bootstrap_servers}, Topic={self.topic}")
    
    def _map_severity(self, risk_level: str) -> str:
        """映射风险等级到严重程度"""
        return self.SEVERITY_MAP.get(risk_level, 'medium')
    
    def _parse_waf_log(self, raw_log: Dict[str, Any]) -> Dict[str, Any]:
        """
        解析 WAF 日志为 alerts 表格式
        
        WAF 日志样例:
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
        
        alerts 表字段:
        - alert_code, title, description, severity, status, source
        - src_ip, src_port, dst_ip, dst_port, protocol, hostname
        - raw_log, parsed_data, first_seen, last_seen, tags, category
        """
        risk_level = raw_log.get('risk_level', '中')
        severity = self._map_severity(risk_level)
        
        # 生成告警编号
        alert_id = raw_log.get('alert_id', '')
        if not alert_id:
            alert_id = f"WAF-{int(time.time() * 1000)}"
        
        # 解析时间戳
        timestamp = raw_log.get('timestamp', '')
        try:
            if isinstance(timestamp, str):
                # 处理 ISO 格式时间戳
                first_seen = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            else:
                first_seen = datetime.utcnow()
        except Exception:
            first_seen = datetime.utcnow()
        
        # 构建告警数据（匹配 alerts 表结构）
        alert_data = {
            'alert_code': alert_id,
            'title': f"[WAF] {raw_log.get('attack_type', '未知攻击')} - {raw_log.get('src_ip', '未知')}",
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
            
            # 原始数据
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
            
            # 时间字段（TimescaleDB 分区键）
            'first_seen': first_seen,
            'last_seen': first_seen,
            
            # 标签
            'tags': json.dumps([raw_log.get('attack_type', 'WAF'), 'waf-alert'], ensure_ascii=False),
        }
        
        return alert_data
    
    def _insert_to_db(self, alert_data: Dict[str, Any]) -> bool:
        """插入告警到 TimescaleDB alerts 表"""
        try:
            from app.timescaledb import get_tsdb
            from psycopg2.extras import Json
            from sqlalchemy import text
            
            tsdb = get_tsdb()
            session = tsdb.get_session()
            
            try:
                query = text("""
                    INSERT INTO alerts (
                        alert_code, title, description, severity, status,
                        source, source_product, source_type, category, confidence,
                        src_ip, src_port, dst_ip, dst_port, protocol, hostname,
                        raw_log, parsed_data, extra_data,
                        first_seen, last_seen, tags
                    ) VALUES (
                        :alert_code, :title, :description, :severity, :status,
                        :source, :source_product, :source_type, :category, :confidence,
                        :src_ip, :src_port, :dst_ip, :dst_port, :protocol, :hostname,
                        :raw_log, :parsed_data, :extra_data,
                        :first_seen, :last_seen, :tags
                    )
                    RETURNING id
                """)
                
                params = {
                    'alert_code': alert_data['alert_code'],
                    'title': alert_data['title'],
                    'description': alert_data.get('description', ''),
                    'severity': alert_data['severity'],
                    'status': alert_data['status'],
                    'source': alert_data['source'],
                    'source_product': alert_data.get('source_product', ''),
                    'source_type': alert_data.get('source_type', ''),
                    'category': alert_data.get('category', ''),
                    'confidence': alert_data.get('confidence', 100.0),
                    'src_ip': alert_data.get('src_ip'),
                    'src_port': alert_data.get('src_port'),
                    'dst_ip': alert_data.get('dst_ip'),
                    'dst_port': alert_data.get('dst_port'),
                    'protocol': alert_data.get('protocol'),
                    'hostname': alert_data.get('hostname'),
                    'raw_log': alert_data.get('raw_log', ''),
                    'parsed_data': Json(alert_data.get('parsed_data', {})),
                    'extra_data': Json(alert_data.get('extra_data', {})),
                    'first_seen': alert_data['first_seen'],
                    'last_seen': alert_data['last_seen'],
                    'tags': alert_data.get('tags', '[]'),
                }
                
                result = session.execute(query, params)
                session.commit()
                
                alert_id = result.scalar()
                logger.info(f"WAF 告警已存储: ID={alert_id}, alert_code={alert_data['alert_code']}")
                return True
                
            except Exception as e:
                session.rollback()
                logger.error(f"存储 WAF 告警失败: {e}")
                raise
            finally:
                tsdb.close_session(session)
                
        except Exception as e:
            logger.error(f"数据库操作失败: {e}")
            return False
    
    def _process_message(self, message: Dict[str, Any]):
        """处理接收到的 WAF 日志消息"""
        try:
            logger.info(f"收到 WAF 日志: alert_id={message.get('alert_id', 'N/A')}, src_ip={message.get('src_ip', 'N/A')}")
            
            # 解析日志
            alert_data = self._parse_waf_log(message)
            
            # 存储到 TimescaleDB
            success = self._insert_to_db(alert_data)
            if success:
                logger.info(f"WAF 告警处理成功: {alert_data['alert_code']}")
            else:
                logger.error(f"WAF 告警处理失败: {alert_data['alert_code']}")
                
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
        _waf_consumer = WAFLogConsumer()
    return _waf_consumer


def init_waf_consumer(app=None):
    """初始化 WAF 消费者（Flask 应用）"""
    try:
        consumer = get_waf_consumer()
        consumer.start()
        logger.info("WAF 日志消费者已启动，监听 topic: waf-alert")
        
        if app:
            @app.teardown_appcontext
            def cleanup(exception=None):
                pass
    except Exception as e:
        logger.error(f"WAF 消费者初始化失败: {e}")
    
    return consumer


if __name__ == "__main__":
    # 测试消费
    logging.basicConfig(level=logging.INFO)
    consumer = get_waf_consumer()
    consumer.start()
    
    try:
        while True:
            time.sleep(10)
            print(f"WAF Consumer 运行状态: {consumer.is_running()}")
    except KeyboardInterrupt:
        consumer.stop()
        print("WAF Consumer 已停止")
