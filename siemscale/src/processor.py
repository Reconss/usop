#!/usr/bin/env python3
"""
SIEM 大规模数据处理统一处理器
- ClickHouse: 复杂分析报表
- Elasticsearch: 全文搜索调查
- 数据分层存储优化
"""

import asyncio
import os
import logging
import re
import json
from typing import Dict, List, Optional
from datetime import datetime
from dataclasses import dataclass

import uvloop
uvloop.install()

import redis.asyncio as redis

logger = logging.getLogger(__name__)


@dataclass
class Config:
    redis_url: str = os.getenv('REDIS_URL', 'redis://redis:6379')
    clickhouse_host: str = os.getenv('CLICKHOUSE_HOST', 'clickhouse')
    es_hosts: List[str] = None
    
    def __post_init__(self):
        if self.es_hosts is None:
            self.es_hosts = [os.getenv('ES_HOSTS', 'http://elasticsearch:9200')]


class LogParser:
    """日志解析器"""
    PATTERNS = {'json': re.compile(r'^\s*\{.*\}\s*$')}
    
    @classmethod
    def parse(cls, raw_log: str, format_type: str = 'auto') -> Dict:
        result = {'raw_log': raw_log[:10000], 'timestamp': datetime.utcnow().isoformat(), 'format_type': 'unknown'}
        try:
            if format_type == 'auto':
                format_type = cls._detect(raw_log)
            result['format_type'] = format_type
            if format_type == 'json':
                data = json.loads(raw_log)
                result.update(data)
                for k in ['@timestamp', 'timestamp', 'time']:
                    if k in data: result['timestamp'] = str(data[k]); break
                for k in ['src_ip', 'source_ip']:
                    if k in data: result['src_ip'] = str(data[k]); break
                for k in ['dst_ip', 'dest_ip']:
                    if k in data: result['dst_ip'] = str(data[k]); break
        except Exception as e:
            result['error'] = str(e)
        return result
    
    @classmethod
    def _detect(cls, raw: str) -> str:
        return 'json' if cls.PATTERNS['json'].match(raw.strip()) else 'raw'


class AlertEngine:
    """告警引擎"""
    def __init__(self):
        self.rules = {
            'brute_force': {'type': 'threshold', 'field': 'action', 'value': 'login_failed', 
                           'threshold': 5, 'severity': 'high', 'group_by': 'src_ip'},
            'port_scan': {'type': 'threshold', 'field': 'action', 'value': 'connection_refused',
                         'threshold': 10, 'severity': 'medium', 'group_by': 'src_ip'},
            'malware': {'type': 'single', 'field': 'action', 'value': 'malware', 'severity': 'critical'},
        }
        self.state = {}
    
    async def process(self, log: Dict) -> List[Dict]:
        alerts = []
        for rule_id, rule in self.rules.items():
            if self._match(rule, log):
                alerts.append({
                    'alert_code': f"ALERT-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{rule_id[:4]}",
                    'rule_id': rule_id, 'severity': rule['severity'],
                    'title': f"[{rule_id}] 检测到异常", 'src_ip': log.get('src_ip'),
                    'timestamp': datetime.utcnow().isoformat()
                })
        return alerts
    
    def _match(self, rule: Dict, log: Dict) -> bool:
        if rule['type'] == 'single':
            return str(log.get(rule['field'], '')) == str(rule.get('value', ''))
        elif rule['type'] == 'threshold':
            key = log.get(rule.get('group_by', 'src_ip'), 'unknown')
            self.state[rule.get('id', '')] = self.state.get(rule.get('id', ''), {})
            self.state[rule.get('id', '')][key] = self.state[rule.get('id', '')].get(key, 0) + 1
            if self.state[rule.get('id', '')][key] >= rule.get('threshold', 1):
                self.state[rule.get('id', '')][key] = 0
                return True
        return False


class DataRouter:
    """数据路由 - 优化存储"""
    
    def __init__(self, ch_engine, es_engine):
        self.ch = ch_engine
        self.es = es_engine
    
    def should_index_es(self, log: Dict) -> bool:
        """ES 只索引高危数据 (节省 80-95% 存储)"""
        severity = log.get('severity', '').lower()
        category = log.get('category', '').lower()
        
        # 高危必存
        if severity in ('critical', 'high'):
            return True
        # 特定类别必存
        if category in ('attack', 'malware', 'intrusion', 'brute_force'):
            return True
        return False
    
    async def route(self, log: Dict) -> bool:
        # ClickHouse: 全量存储 (分析)
        if self.ch:
            self.ch.write_logs([log])
        
        # ES: 按需索引 (搜索)
        if self.es and self.should_index_es(log):
            self.es.index_single(log)
        
        return True


class SIEMProcessor:
    """SIEM 统一处理器"""
    
    def __init__(self):
        self.config = Config()
        self.redis: Optional[redis.Redis] = None
        self.ch = None
        self.es = None
        self.parser = LogParser()
        self.alert_engine = AlertEngine()
        self.router = None
        self.running = False
    
    async def start(self):
        logger.info("启动 SIEM 处理器...")
        
        # Redis
        self.redis = redis.from_url(self.config.redis_url, decode_responses=True)
        
        # ClickHouse
        try:
            from clickhouse_engine import ClickHouseEngine, ClickHouseConfig
            ch_config = ClickHouseConfig(host=self.config.clickhouse_host)
            self.ch = ClickHouseEngine(ch_config)
            if self.ch.connect():
                self.ch.create_tables()
                logger.info("ClickHouse 已连接")
        except Exception as e:
            logger.warning(f"ClickHouse 未连接: {e}")
        
        # Elasticsearch
        try:
            from elasticsearch_engine import ESEngine, ESConfig
            es_config = ESConfig(hosts=self.config.es_hosts)
            self.es = ESEngine(es_config)
            if self.es.connect():
                self.es.create_indices()
                logger.info("Elasticsearch 已连接")
        except Exception as e:
            logger.warning(f"Elasticsearch 未连接: {e}")
        
        # 数据路由
        self.router = DataRouter(self.ch, self.es)
        
        self.running = True
        tasks = [self._consume(), self._stats()]
        await asyncio.gather(*tasks)
    
    async def stop(self):
        self.running = False
        if self.redis: await self.redis.close()
        if self.ch: self.ch.close()
        if self.es: self.es.close()
        logger.info("处理器已停止")
    
    async def _consume(self):
        logger.info("开始消费日志...")
        while self.running:
            try:
                msgs = await self.redis.xread({'raw-logs': '0'}, count=100, block=5000)
                
                for stream, messages in msgs:
                    for msg_id, data in messages:
                        try:
                            log = self.parser.parse(data.get('raw_log', ''))
                            log['source_id'] = int(data.get('source_id', 1))
                            log['time'] = log.get('timestamp', datetime.utcnow().isoformat())
                            
                            # 路由数据
                            await self.router.route(log)
                            
                            # 告警
                            alerts = await self.alert_engine.process(log)
                            for alert in alerts:
                                await self.redis.xadd('alerts', alert)
                        finally:
                            await self.redis.xdel(stream, msg_id)
            except Exception as e:
                logger.error(f"消费错误: {e}")
                await asyncio.sleep(1)
    
    async def _stats(self):
        while self.running:
            await asyncio.sleep(60)
            if self.redis:
                await self.redis.hset('siem:stats', mapping={
                    'timestamp': datetime.utcnow().isoformat(),
                    'running': str(self.running)
                })


async def main():
    processor = SIEMProcessor()
    try:
        await processor.start()
    except KeyboardInterrupt:
        pass
    finally:
        await processor.stop()


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    asyncio.run(main())
