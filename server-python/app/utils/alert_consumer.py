"""
统一告警消费者 — 动态管理 Kafka 消费者

根据 DataSource 配置自动启动/停止消费者:
  - suricata-alert   → Suricata NIDS
  - wazuh-alert      → Wazuh HIDS
  - imperva-alert    → Imperva WAF
  - crowdstrike-alert → CrowdStrike EDR
  - modsecurity-alert → ModSecurity WAF
"""

import json
import logging
import threading
from datetime import datetime, timedelta
from typing import Dict

logger = logging.getLogger(__name__)

_app = None

# 去重时间窗口：窗口内同指纹告警视为重复，仅刷新既有记录
DEDUP_WINDOW_MINUTES = 60

# 产品类型 → topic 映射
PRODUCT_TOPIC_MAP = {
    'suricata': 'suricata-alert',
    'wazuh': 'wazuh-alert',
    'imperva': 'imperva-alert',
    'crowdstrike': 'crowdstrike-alert',
    'modsecurity': 'modsecurity-alert',
}


class AlertConsumerManager:
    """动态告警消费者管理器"""

    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            with cls._lock:
                if not cls._instance:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if hasattr(self, '_initialized'):
            return
        self._initialized = True
        self._threads: Dict[str, threading.Thread] = {}
        self._running = True

    def _get_parser(self, topic: str):
        from app.utils.alert_parsers import PARSER_REGISTRY
        return PARSER_REGISTRY.get(topic)

    def _insert_alert(self, alert_data: dict) -> bool:
        global _app
        if not _app:
            logger.error("Flask app 未初始化")
            return False
        try:
            with _app.app_context():
                from app.database import db
                from app.models import Alert
                from app.utils.dedup import compute_dedup_hash

                dedup_hash = compute_dedup_hash(alert_data)

                # 幂等去重：时间窗口内同指纹告警 → 刷新 last_seen/次数，不重复插入
                window_start = datetime.utcnow() - timedelta(minutes=DEDUP_WINDOW_MINUTES)
                existing = (Alert.query
                            .filter(Alert.dedup_hash == dedup_hash,
                                    Alert.last_seen >= window_start)
                            .order_by(Alert.last_seen.desc())
                            .first())
                if existing:
                    existing.last_seen = alert_data.get('last_seen') or datetime.utcnow()
                    # 必须用新 dict 赋值：原地改同一对象不会触发 SQLAlchemy JSON 列的 dirty 标记
                    extra = dict(existing.extra_data or {})
                    extra['occurrences'] = (extra.get('occurrences') or 1) + 1
                    existing.extra_data = extra
                    db.session.commit()
                    logger.info(f"♻️ 重复告警已合并: {dedup_hash[:8]} → alert#{existing.id} "
                                f"(累计 {extra['occurrences']} 次)")
                    return False

                # 标准告警字段自动填充（真实派生，拒绝占位/mock）：
                # - alert_log_id: 与流水线 _normalize 生成的告警ID一致（ALT-{dedup_hash}），
                #   可回链 ES valid-alerts / Kafka 中的原始告警记录
                # - operation: 设备侧动作字段（如 Suricata alert.action = allowed/blocked），
                #   设备未提供该字段时保持空值，不编造
                log_id = alert_data.get('alert_id') or f"ALT-{dedup_hash}"
                # operation 优先采用解析结果里已有的 operation（可能来自②日志解析配置把
                # 设备侧的 act/action_N 等字段映射到该标准字段），其次回退设备原生 action
                operation = ''
                for _src in (alert_data, alert_data.get('parsed_data') or {},
                             alert_data.get('extra_data') or {}):
                    if not isinstance(_src, dict):
                        continue
                    _v = _src.get('operation') or _src.get('action')
                    if _v:
                        operation = str(_v)
                        break

                # 告警编号缺失时用告警ID/指纹兜底：alerts.alert_code 有唯一约束，
                # 自定义解析配置解析出的告警常常不带编号，留空会导致整条告警入库失败
                code = (alert_data.get('alert_code') or '').strip()
                if not code:
                    code = (alert_data.get('alert_id') or '').strip() or f'ALT-{dedup_hash[:16]}'

                a = Alert(
                    alert_code=code,
                    alert_log_id=log_id,
                    operation=operation,
                    title=alert_data.get('title', ''),
                    description=alert_data.get('description', ''),
                    severity=alert_data.get('severity', 'medium'),
                    status=alert_data.get('status', 'new'),
                    source=alert_data.get('source', ''),
                    source_product=alert_data.get('source_product', ''),
                    source_type=alert_data.get('source_type', ''),
                    category=alert_data.get('category', ''),
                    confidence=alert_data.get('confidence', 100.0),
                    src_ip=alert_data.get('src_ip', ''),
                    src_port=alert_data.get('src_port'),
                    dst_ip=alert_data.get('dst_ip', ''),
                    dst_port=alert_data.get('dst_port'),
                    protocol=alert_data.get('protocol', ''),
                    hostname=alert_data.get('hostname', ''),
                    first_seen=alert_data.get('first_seen') or datetime.utcnow(),
                    last_seen=alert_data.get('last_seen') or datetime.utcnow(),
                    raw_log=alert_data.get('raw_log', ''),
                    parsed_data=alert_data.get('parsed_data', {}),
                    extra_data=alert_data.get('extra_data', {}),
                    tags=alert_data.get('tags', []),
                    dedup_hash=dedup_hash,
                )
                db.session.add(a)
                db.session.commit()
                # 入库时自动调用模板：渲染 auto_render 模板写入 extra_data.rendered_templates
                try:
                    from app.routes.templates import render_templates_for_alert
                    render_templates_for_alert(a.id)
                except Exception as te:
                    logger.warning(f"模板自动渲染失败(不影响入库): {te}")
                return True
        except Exception as e:
            logger.error(f"写入告警失败: {e}")
            try:
                with _app.app_context():
                    from app.database import db
                    db.session.rollback()
            except Exception:
                pass
            return False

    def _consume_topic(self, topic: str):
        parser = self._get_parser(topic)
        if not parser:
            logger.warning(f"topic {topic} 无解析器")
            return
        try:
            from kafka import KafkaConsumer
            import os
            servers = os.getenv('KAFKA_BOOTSTRAP_SERVERS', 'localhost:9092')
            consumer = KafkaConsumer(
                topic,
                bootstrap_servers=servers,
                group_id=f'usop-{topic}-consumer',
                auto_offset_reset='latest',
                enable_auto_commit=True,
                value_deserializer=lambda v: json.loads(v.decode('utf-8')) if v else None,
                session_timeout_ms=30000,
                max_poll_records=50,
            )
            logger.info(f"✅ 消费者已启动: topic={topic}")
            for msg in consumer:
                if not self._running or topic not in self._threads:
                    break
                try:
                    raw = msg.value
                    if raw is None:
                        continue
                    alert_data = parser(raw)
                    if alert_data and self._insert_alert(alert_data):
                        logger.info(f"📨 [{topic}] 告警入库: {alert_data['alert_code']}")
                except Exception as e:
                    logger.error(f"处理消息失败 topic={topic}: {e}")
        except Exception as e:
            logger.warning(f"⚠️ 消费者 {topic} 异常: {e}")
        finally:
            logger.info(f"消费者 {topic} 已停止")

    def start_topic(self, topic: str):
        if topic in self._threads and self._threads[topic].is_alive():
            return  # 已在运行
        t = threading.Thread(target=self._consume_topic, args=(topic,), name=f'consumer-{topic}', daemon=True)
        self._threads[topic] = t
        t.start()

    def stop_topic(self, topic: str):
        if topic in self._threads:
            del self._threads[topic]

    def start_from_datasources(self):
        """从 DataSource 表加载活跃的数据源并启动对应消费者"""
        global _app
        if not _app:
            return
        try:
            with _app.app_context():
                from app.models import DataSource
                sources = DataSource.query.filter_by(status='active').all()
                started = 0
                for src in sources:
                    topic = src.kafka_topic
                    if topic:
                        self.start_topic(topic)
                        started += 1
                logger.info(f"🚀 从数据源配置加载了 {started} 个消费者")
        except Exception as e:
            logger.error(f"加载数据源配置失败: {e}")

    def stop_all(self):
        self._running = False
        self._threads.clear()
        logger.info("所有消费者已停止")

    def status(self) -> dict:
        return {
            'running': self._running,
            'active_topics': list(self._threads.keys()),
            'threads_alive': {
                name: t.is_alive() for name, t in self._threads.items()
            },
        }


def init_alert_consumer(app=None):
    global _app
    _app = app
    manager = AlertConsumerManager()
    manager.start_from_datasources()
    return manager
