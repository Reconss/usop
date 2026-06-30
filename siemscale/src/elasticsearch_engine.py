#!/usr/bin/env python3
"""
Elasticsearch 搜索引擎 - 全文搜索调查
"""

import os
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime
from dataclasses import dataclass

try:
    from elasticsearch import Elasticsearch
except ImportError:
    Elasticsearch = None

logger = logging.getLogger(__name__)


@dataclass
class ESConfig:
    hosts: List[str] = None
    index_prefix: str = 'usop'
    
    def __post_init__(self):
        if self.hosts is None:
            self.hosts = [os.getenv('ES_HOSTS', 'http://elasticsearch:9200')]


class ESEngine:
    """Elasticsearch 搜索引擎"""
    
    def __init__(self, config: ESConfig):
        self.config = config
        self.client: Optional[Elasticsearch] = None
    
    def connect(self) -> bool:
        try:
            if Elasticsearch is None:
                logger.error("elasticsearch 未安装: pip install elasticsearch")
                return False
            
            self.client = Elasticsearch(self.config.hosts)
            if self.client.ping():
                logger.info(f"ES 连接成功: {self.config.hosts}")
                return True
            return False
        except Exception as e:
            logger.error(f"ES 连接失败: {e}")
            return False
    
    def close(self):
        if self.client:
            self.client.close()
    
    # ========== 索引管理 ==========
    
    def create_indices(self):
        self.client.indices.create(
            index=f"{self.config.index_prefix}-alerts-*",
            ignore=400,
            body={
                "settings": {"number_of_shards": 3, "number_of_replicas": 1},
                "mappings": {
                    "properties": {
                        "time": {"type": "date"},
                        "source_id": {"type": "integer"},
                        "log_type": {"type": "keyword"},
                        "src_ip": {"type": "ip"},
                        "dst_ip": {"type": "ip"},
                        "src_port": {"type": "integer"},
                        "dst_port": {"type": "integer"},
                        "protocol": {"type": "keyword"},
                        "hostname": {"type": "keyword"},
                        "username": {"type": "keyword"},
                        "action": {"type": "keyword"},
                        "result": {"type": "keyword"},
                        "severity": {"type": "keyword"},
                        "category": {"type": "keyword"},
                        "raw_log": {"type": "text"},
                        "details": {"type": "object"}
                    }
                }
            }
        )
        logger.info("ES 索引创建完成")
    
    # ========== 写入 ==========
    
    def index_logs(self, logs: List[Dict]) -> bool:
        if not self.client or not logs:
            return False
        try:
            actions = []
            for log in logs:
                idx = f"{self.config.index_prefix}-alerts-{log.get('time', datetime.utcnow()).strftime('%Y.%m.%d')}"
                actions.append({"index": {"_index": idx}})
                actions.append(log)
            self.client.bulk(body=actions, refresh=False)
            return True
        except Exception as e:
            logger.error(f"索引失败: {e}")
            return False
    
    def index_single(self, log: Dict) -> bool:
        if not self.client:
            return False
        try:
            idx = f"{self.config.index_prefix}-alerts-{datetime.utcnow().strftime('%Y.%m.%d')}"
            self.client.index(index=idx, document=log)
            return True
        except Exception as e:
            logger.error(f"单条索引失败: {e}")
            return False
    
    # ========== 搜索 ==========
    
    def search(self, query: Dict, size: int = 100) -> Dict:
        if not self.client:
            return {'hits': [], 'total': 0}
        try:
            result = self.client.search(
                index=f"{self.config.index_prefix}-alerts-*",
                body=query,
                size=size
            )
            return {'total': result['hits']['total']['value'],
                    'hits': [h['_source'] for h in result['hits']['hits']],
                    'took': result['took']}
        except Exception as e:
            logger.error(f"搜索失败: {e}")
            return {'hits': [], 'total': 0}
    
    def search_by_keyword(self, keyword: str, size: int = 100) -> Dict:
        query = {"query": {"multi_match": {"query": keyword, "fields": ["raw_log", "hostname", "username"]}},
                 "sort": [{"time": {"order": "desc"}}]}
        return self.search(query, size)
    
    def search_by_ip(self, ip: str, size: int = 100) -> Dict:
        query = {"query": {"bool": {"should": [{"term": {"src_ip": ip}}, {"term": {"dst_ip": ip}}]}},
                 "sort": [{"time": {"order": "desc"}}]}
        return self.search(query, size)
    
    def investigate_ip(self, ip: str) -> Dict:
        query = {
            "query": {"bool": {"should": [{"term": {"src_ip": ip}}, {"term": {"dst_ip": ip}}]}},
            "aggs": {
                "actions": {"terms": {"field": "action", "size": 20}},
                "severities": {"terms": {"field": "severity", "size": 10}},
                "timeline": {"date_histogram": {"field": "time", "calendar_interval": "hour"}},
                "targets": {"terms": {"field": "dst_ip", "size": 10}}
            },
            "size": 0
        }
        result = self.search(query)
        aggs = result.get('aggregations', {})
        return {
            'ip': ip, 'total': result['total'],
            'actions': aggs.get('actions', {}).get('buckets', []),
            'severities': aggs.get('severities', {}).get('buckets', []),
            'timeline': aggs.get('timeline', {}).get('buckets', []),
            'targets': aggs.get('targets', {}).get('buckets', [])
        }
    
    def advanced_search(self, conditions: Dict, size: int = 100) -> Dict:
        must = []
        if conditions.get('ip'):
            must.append({"bool": {"should": [{"term": {"src_ip": conditions['ip']}}, {"term": {"dst_ip": conditions['ip']}}]}})
        if conditions.get('keyword'):
            must.append({"multi_match": {"query": conditions['keyword'], "fields": ["raw_log", "hostname"]}})
        if conditions.get('severity'):
            must.append({"term": {"severity": conditions['severity']}})
        if conditions.get('category'):
            must.append({"term": {"category": conditions['category']}})
        if conditions.get('start_time') and conditions.get('end_time'):
            must.append({"range": {"time": {"gte": conditions['start_time'], "lte": conditions['end_time']}}})
        
        query = {"query": {"bool": {"must": must}}, "sort": [{"time": {"order": "desc"}}], "size": size}
        return self.search(query)
