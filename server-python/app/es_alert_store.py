"""
Elasticsearch 告警存储模块 — 替代 TimescaleDB alerts 相关功能

负责：
  - ES 连接管理（单例）
  - 告警 CRUD（创建/读取/更新状态/删除）
  - 类 Graylog 搜索（query_string 解析 → Query DSL）
  - 聚合查询（Quick Values、Field Stats、Date Histogram）
  - Stream / SavedSearch 管理

用法:
    from app.es_alert_store import es_store
    es_store.insert_alert({...})
    result = es_store.search_alerts(AlertQuery(query_string="severity:critical"))
"""

from __future__ import annotations

import os
import re
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Optional

logger = logging.getLogger(__name__)

# =============================================
# 类型定义
# =============================================

@dataclass
class TimeRange:
    """时间范围"""
    start: str = ""          # ISO 格式
    end: str = ""

@dataclass
class AlertQuery:
    """告警查询参数 — 映射 Graylog 搜索语法"""
    query_string: str = ""          # 类 Graylog 语法: severity:critical AND src_ip:10.0.*
    filters: dict[str, Any] = field(default_factory=dict)   # 精确筛选
    time_range: Optional[TimeRange] = None
    page: int = 1
    page_size: int = 20
    sort_field: str = "first_seen"
    sort_order: str = "desc"
    aggregations: list[str] = field(default_factory=list)    # quick_values, histogram, field_stats
    agg_field: str = "severity"                              # QuickValues/FieldStats 目标字段
    histogram_interval: str = "auto"                         # auto / 1m / 5m / 1h / 1d

@dataclass
class SearchResult:
    """搜索结果"""
    total: int = 0
    items: list[dict] = field(default_factory=list)
    page: int = 1
    page_size: int = 20
    took_ms: int = 0
    aggregations: dict[str, Any] = field(default_factory=dict)

# =============================================
# 查询语法解析器
# =============================================

class QueryStringParser:
    """
    Graylog 风格查询语法解析器 → ES Query DSL

    支持的语法:
      - term:          severity:critical
      - phrase:        title:"SQL Injection"
      - wildcard:      src_ip:10.0.*
      - range:         confidence:[80 TO 100]
      - exists:        _exists_:raw_log
      - NOT:           NOT status:closed
      - AND / OR:      severity:critical AND src_ip:10.0.*
      - 括号分组:      (severity:critical OR severity:high) AND NOT status:closed
      - 全文搜索:      直接输入关键词 → multi_match
    """

    # Token 模式
    TOKEN_PATTERN = re.compile(r"""
        (\b(?:AND|OR|NOT)\b)          |  # 布尔运算符
        (\(|\))                        |  # 括号
        ([\w.]+):"([^"]+)"            |  # 带引号的 field:"value"
        ([\w.]+):(\[.*?\]|[^\s()]+)   |  # field:value / field:[range]
        ("[^"]+")                      |  # 全文短语
        (\S+)                            # 普通词
    """, re.VERBOSE | re.IGNORECASE)

    @classmethod
    def parse(cls, query_string: str) -> dict:
        """解析查询字符串 → ES Query DSL bool 子句"""
        if not query_string or not query_string.strip():
            return {"match_all": {}}

        tokens = cls._tokenize(query_string)
        if not tokens:
            return {"match_all": {}}

        must, must_not, should, filter_clauses = cls._build_clauses(tokens)

        dsl: dict[str, Any] = {"bool": {}}
        if must:         dsl["bool"]["must"] = must
        if must_not:     dsl["bool"]["must_not"] = must_not
        if should:       dsl["bool"]["should"] = should
        if should:       dsl["bool"]["minimum_should_match"] = 1
        # filter_clauses 由外部传入（时间范围等）

        if len(dsl["bool"]) == 0:
            return {"match_all": {}}

        return dsl

    @classmethod
    def _tokenize(cls, s: str) -> list[tuple[str, str, str, str]]:
        """词法分析"""
        tokens = []
        pos = 0
        for m in cls.TOKEN_PATTERN.finditer(s):
            if m.group(1):  # 布尔运算符
                tokens.append(("bool", m.group(1).upper(), "", ""))
            elif m.group(2):  # 括号
                tokens.append(("paren", m.group(2), "", ""))
            elif m.group(3) and m.group(4):  # field:"phrase"
                tokens.append(("field_phrase", m.group(3), m.group(4), ""))
            elif m.group(5) and m.group(6):  # field:value
                tokens.append(("field_value", m.group(5), m.group(6).strip(), ""))
            elif m.group(7):  # 全文短语 "xxx"
                tokens.append(("phrase", m.group(7).strip('"'), "", ""))
            elif m.group(8):  # 普通词
                tokens.append(("term", m.group(8), "", ""))
        return tokens

    @classmethod
    def _build_clauses(cls, tokens: list) -> tuple[list, list, list, list]:
        """构建 must / must_not / should 子句"""
        must: list[dict] = []
        must_not: list[dict] = []
        should: list[dict] = []
        i = 0
        not_next = False
        or_mode = False

        while i < len(tokens):
            ttype, a, b, c = tokens[i]

            if ttype == "bool":
                if a == "NOT":
                    not_next = True
                elif a == "OR":
                    or_mode = True
                elif a == "AND":
                    or_mode = False
                i += 1
                continue

            if ttype == "paren":
                if a == "(":
                    # 提取括号内子表达式
                    depth = 1
                    sub_tokens = []
                    i += 1
                    while i < len(tokens) and depth > 0:
                        st, sa, sb, sc = tokens[i]
                        if st == "paren" and sa == ")":
                            depth -= 1
                            if depth == 0:
                                break
                        if depth > 0:
                            sub_tokens.append(tokens[i])
                        i += 1
                    sub_dsl = cls._build_clauses(sub_tokens)
                    sub_must = sub_dsl[0] + sub_dsl[2]  # merge should into must
                    for clause in sub_must:
                        if not_next:
                            must_not.append(clause)
                        elif or_mode:
                            should.append(clause)
                        else:
                            must.append(clause)
                    not_next = False
                    i += 1
                    continue
                else:
                    i += 1
                    continue

            clause = cls._token_to_clause(ttype, a, b)
            if clause:
                if not_next:
                    must_not.append(clause)
                    not_next = False
                elif or_mode:
                    should.append(clause)
                else:
                    must.append(clause)
            i += 1

        return must, must_not, should, []

    @classmethod
    def _token_to_clause(cls, ttype: str, field: str, value: str) -> Optional[dict]:
        """单个 token → ES query clause"""
        if ttype in ("term",):
            # 全文搜索
            return {"multi_match": {
                "query": field,
                "fields": ["title^3", "description", "alert_code^2", "raw_log"],
                "type": "best_fields"
            }}

        if ttype in ("phrase",):
            return {"match_phrase": {
                "title": {"query": field, "slop": 2}
            }}

        if ttype in ("field_value", "field_phrase"):
            return cls._field_query(field, value)

        return None

    @classmethod
    def _field_query(cls, field: str, value: str) -> dict:
        """field:value → ES query"""
        # 范围查询 [x TO y]
        range_match = re.match(r'^\[(.+?) TO (.+?)\]$', value)
        if range_match:
            return {"range": {field: {"gte": range_match.group(1).strip(),
                                      "lte": range_match.group(2).strip()}}}

        # 通配符查询
        if '*' in value or '?' in value:
            return {"wildcard": {field: {"value": value, "case_insensitive": True}}}

        # 模糊查询 value~
        if value.endswith('~'):
            return {"fuzzy": {field: {"value": value.rstrip('~'), "fuzziness": "AUTO"}}}

        # 存在查询 _exists_:field
        if field == "_exists_" or value == "_exists_":
            return {"exists": {"field": field if value == "_exists_" else value}}

        # 精确匹配 (IP/枚举字段用 term, 文本字段用 match)
        ip_match = re.match(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}', value)
        if ip_match or field in ('severity', 'status', 'source', 'category', 'protocol', 'alert_code', 'source_product'):
            return {"term": {field: value}}
        else:
            return {"match": {field: value}}


# =============================================
# ES 告警存储客户端
# =============================================

class ESAlertStore:
    """Elasticsearch 告警存储客户端 — 单例"""

    _instance: Optional['ESAlertStore'] = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self, hosts: Optional[list[str]] = None, index_prefix: str = "usop-alerts"):
        if self._initialized:
            return
        self._initialized = True

        self.hosts = hosts or [os.getenv('ES_HOSTS', 'http://localhost:9200')]
        self.index_prefix = index_prefix
        self.write_alias = f"{index_prefix}-write"
        self._client: Optional[Any] = None
        self._connect()

    def _connect(self):
        """建立 ES 连接"""
        try:
            from elasticsearch import Elasticsearch
            self._client = Elasticsearch(
                self.hosts,
                request_timeout=30,
                max_retries=3,
                retry_on_timeout=True
            )
            # 测试连接
            info = self._client.info()
            logger.info(f"✅ ES 已连接: {info['version']['number']} (cluster: {info['cluster_name']})")
        except Exception as e:
            logger.warning(f"⚠️ ES 连接失败: {e} — 告警将使用降级模式")
            self._client = None

    @property
    def client(self):
        if self._client is None:
            self._connect()
        return self._client

    @property
    def connected(self) -> bool:
        try:
            return self.client is not None and self.client.ping()
        except Exception:
            return False

    # =============================================
    # 索引管理
    # =============================================

    def ensure_index_template(self) -> bool:
        """确保索引模板已创建"""
        try:
            from elasticsearch import Elasticsearch
            tmpl_name = f"{self.index_prefix}-template"
            if self.client.indices.exists_index_template(name=tmpl_name):
                return True

            body = {
                "index_patterns": [f"{self.index_prefix}-*"],
                "priority": 100,
                "template": {
                    "settings": {
                        "number_of_shards": 1,
                        "number_of_replicas": 0,
                        "refresh_interval": "30s"
                    },
                    "mappings": {
                        "dynamic": False,
                        "properties": {
                            "id":              {"type": "long"},
                            "alert_code":      {"type": "keyword"},
                            "title":           {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
                            "description":     {"type": "text"},
                            "severity":        {"type": "keyword"},
                            "status":          {"type": "keyword"},
                            "source":          {"type": "keyword"},
                            "source_product":  {"type": "keyword"},
                            "source_type":     {"type": "keyword"},
                            "category":        {"type": "keyword"},
                            "confidence":      {"type": "float"},
                            "src_ip":          {"type": "ip"},
                            "src_port":        {"type": "integer"},
                            "dst_ip":          {"type": "ip"},
                            "dst_port":        {"type": "integer"},
                            "protocol":        {"type": "keyword"},
                            "asset_id":        {"type": "long"},
                            "asset_name":      {"type": "keyword"},
                            "hostname":        {"type": "keyword"},
                            "affected_assets": {"type": "keyword"},
                            "event_ids":       {"type": "long"},
                            "assigned_to":     {"type": "long"},
                            "raw_log":         {"type": "text", "index": False},
                            "extra_data":      {"type": "flattened"},
                            "tags":            {"type": "keyword"},
                            "first_seen":      {"type": "date"},
                            "last_seen":       {"type": "date"},
                            "created_at":      {"type": "date"},
                            "updated_at":      {"type": "date"},
                        }
                    }
                }
            }
            self.client.indices.put_index_template(name=tmpl_name, body=body)
            logger.info(f"✅ 索引模板 {tmpl_name} 已创建")
            return True
        except Exception as e:
            logger.error(f"❌ 创建索引模板失败: {e}")
            return False

    def ensure_write_index(self) -> bool:
        """确保写入索引存在"""
        try:
            if self.client.indices.exists_alias(name=self.write_alias):
                return True

            index_name = f"{self.index_prefix}-000001"
            self.client.indices.create(index=index_name, body={
                "aliases": {self.write_alias: {"is_write_index": True}}
            })
            logger.info(f"✅ 写入索引 {index_name} 已创建 (alias: {self.write_alias})")
            return True
        except Exception as e:
            logger.error(f"❌ 创建写入索引失败: {e}")
            return False

    def ensure_stream_index(self) -> bool:
        """确保 streams 索引存在"""
        try:
            if self.client.indices.exists(index="usop-streams"):
                return True
            self.client.indices.create(index="usop-streams", body={
                "settings": {"number_of_shards": 1, "number_of_replicas": 0},
                "mappings": {
                    "dynamic": False,
                    "properties": {
                        "id":          {"type": "keyword"},
                        "title":       {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
                        "description": {"type": "text"},
                        "rules":       {"type": "nested", "properties": {
                            "field": {"type": "keyword"},
                            "type":  {"type": "keyword"},
                            "value": {"type": "keyword"}
                        }},
                        "disabled":    {"type": "boolean"},
                        "created_at":  {"type": "date"}
                    }
                }
            })
            return True
        except Exception:
            return False

    def init_all(self) -> bool:
        """初始化所有 ES 资源"""
        if not self.connected:
            logger.error("❌ ES 未连接，跳过初始化")
            return False
        ok = True
        ok &= self.ensure_index_template()
        ok &= self.ensure_write_index()
        ok &= self.ensure_stream_index()
        logger.info(f"✅ ES 初始化{'成功' if ok else '部分失败'}")
        return ok

    # =============================================
    # 告警 CRUD
    # =============================================

    def insert_alert(self, alert: dict) -> Optional[str]:
        """
        插入一条告警到 ES

        Args:
            alert: 告警数据字典（字段名使用 snake_case）

        Returns:
            ES 文档 _id，失败返回 None
        """
        if not self.connected:
            logger.warning("ES 不可用，告警写入失败")
            return None

        try:
            # 自动填充时间戳
            now = datetime.utcnow().isoformat()
            alert.setdefault("created_at", now)
            alert.setdefault("updated_at", now)
            alert.setdefault("first_seen", now)
            alert.setdefault("last_seen", now)
            alert.setdefault("status", "new")
            alert.setdefault("severity", "medium")
            alert.setdefault("confidence", 100.0)

            resp = self.client.index(
                index=self.write_alias,
                body=alert,
                refresh="wait_for"
            )
            return resp.get("_id")
        except Exception as e:
            logger.error(f"❌ 插入告警失败: {e}")
            return None

    def bulk_insert(self, alerts: list[dict]) -> int:
        """
        批量插入告警

        Returns:
            成功写入的数量
        """
        if not self.connected or not alerts:
            return 0

        try:
            from elasticsearch.helpers import bulk
            now = datetime.utcnow().isoformat()
            actions = []
            for a in alerts:
                a.setdefault("created_at", now)
                a.setdefault("updated_at", now)
                a.setdefault("first_seen", now)
                a.setdefault("last_seen", now)
                a.setdefault("status", "new")
                a.setdefault("severity", "medium")
                actions.append({
                    "_index": self.write_alias,
                    "_source": a
                })

            success, errors = bulk(self.client, actions, raise_on_error=False)
            if errors:
                logger.warning(f"批量写入 {errors} 条错误")
            return success
        except Exception as e:
            logger.error(f"❌ 批量插入告警失败: {e}")
            return 0

    def get_alert(self, alert_id: str) -> Optional[dict]:
        """
        根据 ID 获取告警详情

        Args:
            alert_id: ES 文档 ID 或 alert_code

        Returns:
            告警数据字典
        """
        if not self.connected:
            return None

        try:
            # 先按 ES _id 查询
            try:
                resp = self.client.get(index=self.write_alias, id=alert_id)
                return resp["_source"]
            except Exception:
                pass

            # 再按 alert_code 查询
            resp = self.client.search(
                index=self.write_alias,
                body={
                    "query": {"term": {"alert_code": alert_id}},
                    "size": 1
                }
            )
            hits = resp["hits"]["hits"]
            if hits:
                return hits[0]["_source"]
            return None
        except Exception as e:
            logger.error(f"❌ 查询告警失败: {e}")
            return None

    def update_alert(self, alert_id: str, body: dict) -> bool:
        """
        更新告警字段

        Args:
            alert_id: ES 文档 ID
            body: 要更新的字段

        Returns:
            是否成功
        """
        if not self.connected:
            return False
        try:
            body["updated_at"] = datetime.utcnow().isoformat()
            self.client.update(index=self.write_alias, id=alert_id, body={"doc": body})
            return True
        except Exception as e:
            logger.error(f"❌ 更新告警失败: {e}")
            return False

    def update_status(self, alert_id: str, status: str) -> bool:
        """更新告警状态"""
        return self.update_alert(alert_id, {"status": status})

    def delete_alert(self, alert_id: str) -> bool:
        """删除告警"""
        if not self.connected:
            return False
        try:
            self.client.delete(index=self.write_alias, id=alert_id)
            return True
        except Exception:
            return False

    # =============================================
    # 搜索（Graylog 风格）
    # =============================================

    def _build_es_query(self, query: AlertQuery) -> dict:
        """AlertQuery → ES request body"""
        # 1. 解析 query_string
        query_clause = QueryStringParser.parse(query.query_string)

        # 2. 筛选条件
        filters: list[dict] = []
        for field, value in query.filters.items():
            if isinstance(value, list):
                filters.append({"terms": {field: value}})
            elif isinstance(value, bool):
                filters.append({"term": {field: value}})
            else:
                filters.append({"term": {field: value}})

        # 3. 时间范围
        if query.time_range:
            tr = query.time_range
            time_filter: dict[str, Any] = {"range": {"first_seen": {}}}
            if tr.start:
                time_filter["range"]["first_seen"]["gte"] = tr.start
            if tr.end:
                time_filter["range"]["first_seen"]["lte"] = tr.end
            if tr.start or tr.end:
                filters.append(time_filter)

        # 4. 组装 bool query
        body: dict[str, Any] = {
            "query": {
                "bool": {
                    "must": [],
                    "filter": filters
                }
            }
        }

        if query_clause.get("bool"):
            bool_part = query_clause["bool"]
            body["query"]["bool"]["must"] = bool_part.get("must", [])
            body["query"]["bool"]["must_not"] = bool_part.get("must_not", [])
            body["query"]["bool"]["should"] = bool_part.get("should", [])
            if bool_part.get("should"):
                body["query"]["bool"]["minimum_should_match"] = 1
        elif query_clause.get("match_all"):
            body["query"]["bool"]["must"].append(query_clause)

        # 5. 排序
        body["sort"] = [{query.sort_field: {"order": query.sort_order}}]

        # 6. 分页
        from_idx = (query.page - 1) * query.page_size
        body["from"] = from_idx
        body["size"] = query.page_size

        # 7. 聚合
        aggs = {}
        for agg_type in query.aggregations:
            if agg_type == "quick_values":
                aggs["quick_values"] = {
                    "terms": {
                        "field": query.agg_field,
                        "size": 10,
                        "order": {"_count": "desc"}
                    }
                }
            elif agg_type == "histogram":
                interval = query.histogram_interval
                if interval == "auto":
                    # 根据时间范围自动选择桶大小
                    if query.time_range and query.time_range.start and query.time_range.end:
                        try:
                            start = datetime.fromisoformat(query.time_range.start.replace('Z', '+00:00'))
                            end = datetime.fromisoformat(query.time_range.end.replace('Z', '+00:00'))
                            hours = (end - start).total_seconds() / 3600
                            interval = "5m" if hours <= 3 else "1h" if hours <= 48 else "1d"
                        except Exception:
                            interval = "1h"
                    else:
                        interval = "1h"
                aggs["histogram"] = {
                    "date_histogram": {
                        "field": "first_seen",
                        "fixed_interval": interval,
                        "format": "yyyy-MM-dd HH:mm:ss"
                    }
                }
            elif agg_type == "field_stats":
                aggs["field_stats"] = {
                    "stats": {"field": query.agg_field}
                } if query.agg_field in ("confidence", "src_port", "dst_port") else {
                    "terms": {"field": query.agg_field, "size": 10}
                }

        if aggs:
            body["aggs"] = aggs

        # 高亮
        body["highlight"] = {
            "fields": {"title": {}, "description": {}, "raw_log": {}},
            "pre_tags": ["<mark>"],
            "post_tags": ["</mark>"]
        }

        return body

    def search_alerts(self, query: AlertQuery) -> SearchResult:
        """
        搜索告警 — 返回结构化结果

        Args:
            query: 查询参数

        Returns:
            SearchResult 对象
        """
        result = SearchResult(page=query.page, page_size=query.page_size)

        if not self.connected:
            logger.warning("ES 不可用，返回空结果")
            return result

        try:
            body = self._build_es_query(query)
            start = time.time()
            resp = self.client.search(index=self.write_alias, body=body)
            took = int((time.time() - start) * 1000)

            # 解析结果
            hits = resp["hits"]
            result.total = hits["total"]["value"]
            result.took_ms = took
            result.items = [
                {**hit["_source"], "_id": hit["_id"], "_score": hit.get("_score", 0),
                 "highlight": hit.get("highlight", {})}
                for hit in hits["hits"]
            ]

            # 解析聚合
            aggs = resp.get("aggregations", {})
            if "quick_values" in aggs:
                result.aggregations["quick_values"] = [
                    {"key": b["key"], "count": b["doc_count"]}
                    for b in aggs["quick_values"]["buckets"]
                ]
            if "histogram" in aggs:
                result.aggregations["histogram"] = [
                    {"key": b["key_as_string"], "count": b["doc_count"]}
                    for b in aggs["histogram"]["buckets"]
                ]
            if "field_stats" in aggs:
                result.aggregations["field_stats"] = aggs["field_stats"]

        except Exception as e:
            logger.error(f"❌ 搜索告警失败: {e}")

        return result

    def quick_values(self, field: str, filters: dict | None = None,
                     time_range: TimeRange | None = None) -> list[dict]:
        """Quick Values — 字段值分布统计"""
        if not self.connected:
            return []

        try:
            must: list[dict] = [{"match_all": {}}]
            if filters:
                must = [{"term": {k: v}} for k, v in filters.items()]

            body: dict[str, Any] = {
                "query": {"bool": {"must": must}},
                "size": 0,
                "aggs": {
                    "values": {
                        "terms": {
                            "field": field,
                            "size": 10,
                            "order": {"_count": "desc"}
                        }
                    }
                }
            }

            # 时间范围
            if time_range:
                tr: dict[str, Any] = {"range": {"first_seen": {}}}
                if time_range.start:
                    tr["range"]["first_seen"]["gte"] = time_range.start
                if time_range.end:
                    tr["range"]["first_seen"]["lte"] = time_range.end
                body["query"] = {"bool": {"must": must, "filter": [tr]}}

            resp = self.client.search(index=self.write_alias, body=body)
            buckets = resp["aggregations"]["values"]["buckets"]
            total = resp["hits"]["total"]["value"]

            return [
                {"key": b["key"], "count": b["doc_count"],
                 "percentage": round(b["doc_count"] / total * 100, 1) if total > 0 else 0}
                for b in buckets
            ]
        except Exception as e:
            logger.error(f"❌ QuickValues 查询失败: {e}")
            return []

    def date_histogram(self, interval: str = "1h",
                       filters: dict | None = None,
                       time_range: TimeRange | None = None) -> list[dict]:
        """时间分布直方图"""
        if not self.connected:
            return []

        try:
            must: list[dict] = [{"match_all": {}}]
            if filters:
                must = [{"term": {k: v}} for k, v in filters.items()]

            body: dict[str, Any] = {
                "query": {"bool": {"must": must}},
                "size": 0,
                "aggs": {
                    "timeline": {
                        "date_histogram": {
                            "field": "first_seen",
                            "fixed_interval": interval,
                            "format": "yyyy-MM-dd HH:mm:ss"
                        }
                    }
                }
            }

            if time_range:
                tr: dict[str, Any] = {"range": {"first_seen": {}}}
                if time_range.start:
                    tr["range"]["first_seen"]["gte"] = time_range.start
                if time_range.end:
                    tr["range"]["first_seen"]["lte"] = time_range.end
                body["query"] = {"bool": {"must": must, "filter": [tr]}}

            resp = self.client.search(index=self.write_alias, body=body)
            return [
                {"key": b["key_as_string"], "count": b["doc_count"]}
                for b in resp["aggregations"]["timeline"]["buckets"]
            ]
        except Exception as e:
            logger.error(f"❌ DateHistogram 查询失败: {e}")
            return []

    def field_stats(self, field: str, filters: dict | None = None) -> dict:
        """字段统计信息"""
        if not self.connected:
            return {}

        try:
            must = [{"term": {k: v}} for k, v in (filters or {}).items()] or [{"match_all": {}}]
            body = {
                "query": {"bool": {"must": must}},
                "size": 0,
                "aggs": {
                    "stats": {"stats": {"field": field}}
                }
            }

            resp = self.client.search(index=self.write_alias, body=body)
            return resp["aggregations"]["stats"]
        except Exception as e:
            logger.error(f"❌ FieldStats 查询失败: {e}")
            return {}

    # =============================================
    # 告警统计
    # =============================================

    def get_stats(self, time_range: TimeRange | None = None) -> dict:
        """获取告警统计概览"""
        stats = {
            "total": 0,
            "by_severity": {},
            "by_status": {},
            "today_new": 0,
        }

        if not self.connected:
            return stats

        try:
            # 今日范围
            today_start = datetime.utcnow().strftime("%Y-%m-%dT00:00:00Z")

            body: dict[str, Any] = {
                "size": 0,
                "aggs": {
                    "by_severity": {"terms": {"field": "severity"}},
                    "by_status": {"terms": {"field": "status"}},
                    "today_new": {
                        "filter": {"range": {"first_seen": {"gte": today_start}}}
                    }
                }
            }

            if time_range:
                tr: dict[str, Any] = {"range": {"first_seen": {}}}
                if time_range.start:
                    tr["range"]["first_seen"]["gte"] = time_range.start
                if time_range.end:
                    tr["range"]["first_seen"]["lte"] = time_range.end
                body["query"] = {"bool": {"filter": [tr]}}

            resp = self.client.search(index=self.write_alias, body=body)

            stats["total"] = resp["hits"]["total"]["value"]

            for b in resp["aggregations"]["by_severity"]["buckets"]:
                stats["by_severity"][b["key"]] = b["doc_count"]
            for b in resp["aggregations"]["by_status"]["buckets"]:
                stats["by_status"][b["key"]] = b["doc_count"]
            stats["today_new"] = resp["aggregations"]["today_new"]["doc_count"]

        except Exception as e:
            logger.error(f"❌ 获取告警统计失败: {e}")

        return stats

    def get_trend(self, interval: str = "1h",
                  time_range: TimeRange | None = None) -> list[dict]:
        """告警趋势数据"""
        return self.date_histogram(interval=interval, time_range=time_range)

    # =============================================
    # Stream 管理（存于独立索引）
    # =============================================

    def create_stream(self, stream: dict) -> Optional[str]:
        """创建 Stream"""
        try:
            self.ensure_stream_index()
            stream.setdefault("disabled", False)
            stream.setdefault("created_at", datetime.utcnow().isoformat())
            resp = self.client.index(index="usop-streams", body=stream, refresh="wait_for")
            return resp["_id"]
        except Exception as e:
            logger.error(f"❌ 创建 Stream 失败: {e}")
            return None

    def list_streams(self) -> list[dict]:
        """列出所有 Stream"""
        try:
            resp = self.client.search(
                index="usop-streams",
                body={"query": {"match_all": {}}, "size": 100}
            )
            return [hit["_source"] for hit in resp["hits"]["hits"]]
        except Exception:
            return []

    def search_by_stream(self, stream_id: str, query: AlertQuery) -> SearchResult:
        """按 Stream 搜索（叠加 Stream 筛选条件）"""
        try:
            resp = self.client.get(index="usop-streams", id=stream_id)
            stream = resp["_source"]
            rules = stream.get("rules", [])

            # Stream 规则转为 filter
            for rule in rules:
                query.filters[rule["field"]] = rule["value"]

        except Exception:
            pass

        return self.search_alerts(query)

    # =============================================
    # Saved Search 管理
    # =============================================

    def create_saved_search(self, search: dict) -> Optional[str]:
        """保存搜索条件"""
        try:
            search.setdefault("created_at", datetime.utcnow().isoformat())
            self.client.indices.create(index="usop-saved-searches", body={
                "settings": {"number_of_shards": 1, "number_of_replicas": 0},
                "mappings": {
                    "dynamic": False,
                    "properties": {
                        "id":       {"type": "keyword"},
                        "title":    {"type": "text"},
                        "query":    {"type": "object", "enabled": False},
                        "user_id":  {"type": "long"},
                        "shared":   {"type": "boolean"},
                        "created_at": {"type": "date"}
                    }
                }
            })
            resp = self.client.index(index="usop-saved-searches", body=search, refresh="wait_for")
            return resp["_id"]
        except Exception as e:
            logger.error(f"❌ 保存搜索失败: {e}")
            return None

    def list_saved_searches(self, user_id: int | None = None) -> list[dict]:
        """列出已保存搜索"""
        try:
            query = {"match_all": {}} if user_id is None else {"term": {"user_id": user_id}}
            resp = self.client.search(
                index="usop-saved-searches",
                body={"query": query, "size": 100}
            )
            return [hit["_source"] for hit in resp["hits"]["hits"]]
        except Exception:
            return []


# =============================================
# 全局单例
# =============================================
    # =============================================
    # 邻接消息查询（Sprint 5）
    # =============================================

    def related_alerts(self, alert_id: str, limit: int = 20) -> list[dict]:
        """
        查询与指定告警相关的邻接消息：
          - 同 src_ip
          - 同 category
          - 前后 1 小时
        """
        if not self.connected:
            return []

        try:
            # 1. 获取原始告警
            alert = self.get_alert(alert_id)
            if not alert:
                return []

            should_clauses: list[dict] = []
            filter_clauses: list[dict] = []

            # 同 src_ip
            src_ip = alert.get("src_ip")
            if src_ip:
                should_clauses.append({"term": {"src_ip": src_ip}})

            # 同 category
            category = alert.get("category")
            if category:
                should_clauses.append({"term": {"category": category}})

            # 前后 1 小时
            first_seen = alert.get("first_seen")
            if first_seen:
                try:
                    from dateutil.parser import parse as dt_parse
                    dt = dt_parse(first_seen) if isinstance(first_seen, str) else first_seen
                    start = (dt - timedelta(hours=1)).isoformat()
                    end = (dt + timedelta(hours=1)).isoformat()
                except Exception:
                    start = ""
                    end = ""

                if start and end:
                    filter_clauses.append({
                        "range": {"first_seen": {"gte": start, "lte": end}}
                    })

            # 排除自己
            must_not = [{"term": {"_id": alert_id}}]

            body: dict[str, Any] = {
                "query": {
                    "bool": {
                        "should": should_clauses if should_clauses else [{"match_all": {}}],
                        "minimum_should_match": 1 if should_clauses else 0,
                        "filter": filter_clauses,
                        "must_not": must_not,
                    }
                },
                "size": limit,
                "sort": [{"first_seen": {"order": "desc"}}],
            }

            resp = self.client.search(index=self.write_alias, body=body)
            hits = resp["hits"]["hits"]
            results = []
            for hit in hits:
                doc = hit["_source"]
                doc["_id"] = hit["_id"]
                doc["_score"] = hit.get("_score")
                results.append(doc)
            return results

        except Exception as e:
            logger.error(f"❌ 邻接消息查询失败: {e}")
            return []

    # =============================================
    # Stream CRUD 完善（Sprint 6）
    # =============================================

    def get_stream(self, stream_id: str) -> Optional[dict]:
        """获取单个 Stream"""
        try:
            resp = self.client.get(index="usop-streams", id=stream_id)
            doc = resp["_source"]
            doc["_id"] = resp["_id"]
            return doc
        except Exception:
            return None

    def update_stream(self, stream_id: str, body: dict) -> bool:
        """更新 Stream"""
        try:
            self.client.update(
                index="usop-streams",
                id=stream_id,
                body={"doc": body},
                refresh="wait_for",
            )
            return True
        except Exception as e:
            logger.error(f"❌ 更新 Stream 失败: {e}")
            return False

    def delete_stream(self, stream_id: str) -> bool:
        """删除 Stream"""
        try:
            self.client.delete(index="usop-streams", id=stream_id, refresh="wait_for")
            return True
        except Exception as e:
            logger.error(f"❌ 删除 Stream 失败: {e}")
            return False

    # =============================================
    # SavedSearch 完善（Sprint 6）
    # =============================================

    def delete_saved_search(self, search_id: str) -> bool:
        """删除已保存搜索"""
        try:
            self.client.delete(index="usop-saved-searches", id=search_id, refresh="wait_for")
            return True
        except Exception as e:
            logger.error(f"❌ 删除已保存搜索失败: {e}")
            return False



# =============================================
# 全局单例
# =============================================

es_store = ESAlertStore()
