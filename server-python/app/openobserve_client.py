"""
日志存储客户端 - 支持 Elasticsearch 和 OpenObserve
"""
import os
import json
import requests
from typing import Dict, List, Any, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# 存储后端选择
LOG_STORAGE_BACKEND = os.getenv('LOG_STORAGE_BACKEND', 'elasticsearch').lower()


class LogStorageClient:
    """统一日志存储客户端"""
    
    def __init__(self):
        self.backend = LOG_STORAGE_BACKEND
        
        if self.backend == 'openobserve':
            from .openobserve_client import OpenObserveClient
            self.client = OpenObserveClient()
        else:
            # 默认使用 Elasticsearch
            self.client = ESClient()
    
    def ingest_logs(self, logs: List[Dict], stream: str = "security") -> Dict:
        """写入日志"""
        return self.client.ingest_logs(logs, stream)
    
    def search(self, query: str = None, sql: str = None, stream: str = "security", 
               limit: int = 100) -> Dict:
        """搜索日志"""
        return self.client.search(query, sql, stream, limit)
    
    def list_streams(self) -> List[Dict]:
        """列出所有日志流/索引"""
        return self.client.list_streams()
    
    def health_check(self) -> bool:
        """健康检查"""
        return self.client.health_check()


class ESClient:
    """Elasticsearch 客户端"""
    
    def __init__(self):
        self.es_host = os.getenv('ES_HOSTS', 'http://localhost:9200')
        self.index_prefix = os.getenv('ES_INDEX_PREFIX', 'usop-logs-')
        self.index = f"{self.index_prefix}security"
    
    def _get_es_url(self, path: str = "") -> str:
        return f"{self.es_host}/{path}"
    
    def _headers(self) -> Dict:
        return {"Content-Type": "application/json"}
    
    def ingest_logs(self, logs: List[Dict], stream: str = "security") -> Dict:
        """批量写入日志到 ES"""
        index = f"{self.index_prefix}{stream}"
        bulk_data = ""
        
        for log in logs:
            doc = log.copy()
            if 'timestamp' not in doc:
                doc['@timestamp'] = datetime.utcnow().isoformat() + 'Z'
            else:
                doc['@timestamp'] = doc.pop('timestamp')
            
            # 添加索引时间戳
            doc['ingested_at'] = datetime.utcnow().isoformat()
            
            # 构建 bulk 请求
            bulk_data += json.dumps({"index": {"_index": index}}) + "\n"
            bulk_data += json.dumps(doc) + "\n"
        
        if not bulk_data:
            return {"success": True, "ingested": 0}
        
        try:
            response = requests.post(
                f"{self.es_host}/_bulk",
                data=bulk_data,
                headers={"Content-Type": "application/x-ndjson"},
                timeout=30
            )
            
            if response.status_code in (200, 201):
                result = response.json()
                errors = result.get('errors', False)
                return {
                    "success": not errors,
                    "ingested": len(logs) - (len(result.get('items', [])) if errors else 0),
                    "failed": len(result.get('items', [])) if errors else 0
                }
            return {"success": False, "error": f"HTTP {response.status_code}"}
        except Exception as e:
            logger.error(f"ES 写入失败: {e}")
            return {"success": False, "error": str(e)}
    
    def search(self, query: str = None, sql: str = None, stream: str = "security", 
               limit: int = 100) -> Dict:
        """搜索日志"""
        index = f"{self.index_prefix}{stream}*"
        
        # 构建 ES 查询
        es_query = {"query": {"match_all": {}}, "size": limit, "sort": [{"@timestamp": "desc"}]}
        
        if query:
            es_query = {
                "query": {
                    "bool": {
                        "should": [
                            {"match": {"message": query}},
                            {"match": {"src_ip": query}},
                            {"match": {"dst_ip": query}}
                        ]
                    }
                },
                "size": limit,
                "sort": [{"@timestamp": "desc"}]
            }
        
        try:
            response = requests.post(
                f"{self.es_host}/{index}/_search",
                json=es_query,
                headers=self._headers(),
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                hits = [hit['_source'] for hit in data.get('hits', {}).get('hits', [])]
                return {
                    "hits": hits,
                    "total": data.get('hits', {}).get('total', {}).get('value', 0),
                    "took": data.get('took', 0)
                }
            return {"hits": [], "total": 0, "error": f"HTTP {response.status_code}"}
        except Exception as e:
            logger.error(f"ES 搜索失败: {e}")
            return {"hits": [], "total": 0, "error": str(e)}
    
    def list_streams(self) -> List[Dict]:
        """列出所有索引"""
        try:
            response = requests.get(f"{self.es_host}/_aliases", headers=self._headers(), timeout=10)
            if response.status_code == 200:
                indices = response.json()
                return [{"name": name} for name in indices.keys() if name.startswith(self.index_prefix)]
        except Exception as e:
            logger.error(f"ES 列出索引失败: {e}")
        return []
    
    def health_check(self) -> bool:
        """健康检查"""
        try:
            response = requests.get(f"{self.es_host}/_cluster/health", timeout=5)
            return response.status_code == 200
        except:
            return False


# 全局单例
_log_client: Optional[LogStorageClient] = None

def get_log_storage_client() -> LogStorageClient:
    global _log_client
    if _log_client is None:
        _log_client = LogStorageClient()
    return _log_client
