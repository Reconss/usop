"""
Elasticsearch 告警访问层 —— 告警持久化与读取的唯一入口

背景：告警不再同步写 PostgreSQL，全部落 ES（流水线存储任务写入 alerts-valid /
alerts-invalid）。本模块提供告警的检索、读写、聚合能力，供：

  - app/routes/alerts_api.py     安全告警工作台（列表/详情/状态/统计/聚合/导出）
  - app/routes/ai_judgment.py    AI 研判（structured_analysis 写回 ES 文档）

文档约定：
  - 文档 _id = 告警的 alert_id（流水线内为 ALT-{dedup_hash}，历史回灌为其 alert_id）
  - 对外返回的 dict 一定带 'id'（= 文档 _id），前端 id 语义统一为字符串
  - 检索语法沿用 ES query_string（支持 field:value / AND / OR / NOT / 括号 / 通配符）

用法::

    from app.utils import es_alerts
    es_alerts.ensure_indices()
    res = es_alerts.search_alerts(query_string='severity:critical', page=1, page_size=20)
"""
from __future__ import annotations

import logging
import os
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)

# =============================================
# 索引与映射
# =============================================

INDEX_VALID = os.getenv('ES_ALERT_VALID_INDEX', 'alerts-valid')
INDEX_INVALID = os.getenv('ES_ALERT_INVALID_INDEX', 'alerts-invalid')

# 告警标准字段映射：显式声明 keyword/ip/date 类型，保证 term 精确匹配与排序可用
ALERT_MAPPING: dict[str, Any] = {
    'properties': {
        'id': {'type': 'keyword'},
        'alert_id': {'type': 'keyword'},
        'alert_code': {'type': 'keyword'},
        'alert_log_id': {'type': 'keyword'},
        'title': {'type': 'text',
                  'fields': {'keyword': {'type': 'keyword', 'ignore_above': 512}}},
        'description': {'type': 'text'},
        'severity': {'type': 'keyword'},
        'status': {'type': 'keyword'},
        'operation': {'type': 'keyword'},
        'source': {'type': 'keyword'},
        'source_product': {'type': 'keyword'},
        'source_type': {'type': 'keyword'},
        'source_topic': {'type': 'keyword'},
        'category': {'type': 'keyword'},
        'confidence': {'type': 'float'},
        'src_ip': {'type': 'ip'},
        'src_port': {'type': 'integer'},
        'dst_ip': {'type': 'ip'},
        'dst_port': {'type': 'integer'},
        'protocol': {'type': 'keyword'},
        'hostname': {'type': 'keyword'},
        'first_seen': {'type': 'date'},
        'last_seen': {'type': 'date'},
        'created_at': {'type': 'date'},
        'updated_at': {'type': 'date'},
        'raw_log': {'type': 'text'},
        'parsed_data': {'type': 'object', 'dynamic': True},
        'extra_data': {'type': 'object', 'dynamic': True},
        'tags': {'type': 'keyword'},
        'dedup_hash': {'type': 'keyword'},
        'event_ids': {'type': 'keyword'},
        'assigned_to': {'type': 'long'},
        'processing_status': {'type': 'keyword'},
        'status_reason': {'type': 'text'},
        'dispatch_policy': {'type': 'keyword'},
        'dispatch_branch': {'type': 'keyword'},
    }
}

# 允许排序的字段（其余一律回落到 first_seen，避免 ES 因未知字段报错）
SORTABLE_FIELDS = {
    'first_seen', 'last_seen', 'created_at', 'updated_at',
    'severity', 'status', 'confidence', 'alert_code', 'title.keyword',
}

# 全文检索默认字段（无字段前缀的裸词会命中这些字段）
DEFAULT_SEARCH_FIELDS = [
    'title^3', 'description', 'alert_code^2', 'raw_log',
    'src_ip', 'dst_ip', 'hostname', 'category', 'source_product',
]

# 前端展示用的告警字段（导出/列表响应字段一致）
ALERT_FIELDS = (
    'id', 'alert_id', 'alert_code', 'alert_log_id', 'title', 'description',
    'severity', 'status', 'operation', 'source', 'source_product', 'source_type',
    'category', 'confidence', 'src_ip', 'src_port', 'dst_ip', 'dst_port',
    'protocol', 'hostname', 'first_seen', 'last_seen', 'raw_log', 'parsed_data',
    'extra_data', 'tags', 'dedup_hash', 'event_ids', 'assigned_to',
    'processing_status', 'status_reason', 'dispatch_policy', 'dispatch_branch',
    'created_at', 'updated_at',
)

# 索引 → 该索引内文档的默认分支标记
_INDEX_BRANCH = {INDEX_VALID: 'valid', INDEX_INVALID: 'filtered'}

_client = None


# =============================================
# 客户端 / 索引
# =============================================

def client():
    """ES 客户端单例（ES_URL 支持逗号分隔多节点）。"""
    global _client
    if _client is None:
        from elasticsearch import Elasticsearch
        _client = Elasticsearch(
            os.getenv('ES_URL', 'http://elasticsearch:9200').split(','),
            request_timeout=15)
    return _client


def connected() -> bool:
    try:
        return bool(client().ping())
    except Exception:
        return False


def index_names() -> tuple[str, str]:
    return INDEX_VALID, INDEX_INVALID


def ensure_index(index: str = None) -> bool:
    """索引不存在则按显式映射创建（幂等）。"""
    index = index or INDEX_VALID
    try:
        es = client()
        if es.indices.exists(index=index):
            return True
        es.indices.create(index=index, body={'mappings': ALERT_MAPPING})
        logger.info(f"已创建 ES 索引: {index}")
        return True
    except Exception as e:
        logger.warning(f"ES 索引创建失败 {index}: {e}")
        return False


def ensure_indices() -> bool:
    return all(ensure_index(i) for i in (INDEX_VALID, INDEX_INVALID))


def recreate_index(index: str) -> bool:
    """删除并重建索引（用于映射升级 / 数据迁移）。"""
    es = client()
    if es.indices.exists(index=index):
        es.indices.delete(index=index)
    return ensure_index(index)


# =============================================
# 内部工具
# =============================================

def to_iso(value) -> Optional[str]:
    """datetime / 字符串 → ES 可解析的 UTC ISO 字符串；空值返回 None。

    无时区标记的 ISO 字符串按 UTC 补齐 'Z'（ES date 字段默认按 UTC 解析，
    显式标记可避免与其它带 Z 的文档口径不一致）。
    """
    if value is None or value == '':
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc).isoformat().replace('+00:00', 'Z')
        return value.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')
    s = str(value)
    if _RE_NAIVE_ISO.match(s):
        return s + 'Z'
    return s


_RE_NAIVE_ISO = re.compile(r'^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?$')


def _clean(value):
    """ES 写入前的清洗：空字符串字段置 None（ip 类型拒空串，会导致整条文档写入失败）。"""
    if isinstance(value, str):
        return value if value.strip() else None
    if isinstance(value, dict):
        return {k: _clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_clean(v) for v in value]
    return value


def _norm_doc(doc: dict) -> dict:
    """标准化文档：时间字段转 ISO、丢弃 None、补齐 id/alert_id。"""
    out = {}
    for k, v in (doc or {}).items():
        if v is None:
            continue
        if k in ('first_seen', 'last_seen', 'created_at', 'updated_at'):
            iso = to_iso(v)
            if iso:
                out[k] = iso
            continue
        out[k] = _clean(v)
    alert_id = out.get('alert_id') or out.get('id')
    if alert_id:
        out['alert_id'] = alert_id
        out['id'] = alert_id
    elif out.get('id'):
        out['alert_id'] = out['id']
    # 与 Alert 模型默认值保持一致，避免工作台按 severity/status 过滤时漏掉无值文档
    out.setdefault('severity', 'medium')
    out.setdefault('status', 'new')
    return out


def _hit_to_alert(hit: dict, index: str = None) -> dict:
    """ES hit → 前端兼容的告警 dict（一定带 id）。"""
    src = dict(hit.get('_source') or {})
    src['id'] = hit.get('_id') or src.get('alert_id')
    src.setdefault('alert_id', src['id'])
    if index:
        src.setdefault('_index', index)
    return src


def _time_clause(start: str = None, end: str = None) -> Optional[dict]:
    rng = {}
    if start:
        rng['gte'] = start
    if end:
        rng['lte'] = end
    return {'range': {'first_seen': rng}} if rng else None


def _build_query(query_string: str = '', filters: dict = None,
                 start: str = None, end: str = None) -> dict:
    """组装 ES bool 查询：query_string 语义检索 + 结构化 filter。"""
    must: list[dict] = []
    flt: list[dict] = []

    q = (query_string or '').strip()
    if q:
        must.append({'query_string': {
            'query': q,
            'fields': DEFAULT_SEARCH_FIELDS,
            'default_operator': 'AND',
            'analyze_wildcard': True,
            'lenient': True,
        }})

    for field, value in (filters or {}).items():
        if value is None or value == '':
            continue
        if isinstance(value, (list, tuple, set)):
            vals = [v for v in value if v not in (None, '')]
            if vals:
                flt.append({'terms': {field: list(vals)}})
        elif isinstance(value, bool):
            flt.append({'term': {field: value}})
        else:
            flt.append({'term': {field: value}})

    t = _time_clause(start, end)
    if t:
        flt.append(t)

    if not must and not flt:
        return {'match_all': {}}
    body: dict[str, Any] = {}
    if must:
        body['must'] = must
    if flt:
        body['filter'] = flt
    return {'bool': body}


def _sort_clause(sort_field: str, sort_order: str) -> list:
    field = sort_field if sort_field in SORTABLE_FIELDS else 'first_seen'
    order = 'asc' if str(sort_order).lower() == 'asc' else 'desc'
    return [{field: {'order': order, 'unmapped_type': 'date' if 'seen' in field or '_at' in field else 'keyword'}}]


def search_hits(index: str, query: dict, size: int = 20, offset: int = 0,
                sort_field: str = 'first_seen', sort_order: str = 'desc',
                source_fields: list = None) -> dict:
    """底层检索：返回 {items, total, took_ms}。"""
    body: dict[str, Any] = {
        'query': query,
        'from': max(0, offset),
        'size': max(0, size),
        'sort': _sort_clause(sort_field, sort_order),
        'track_total_hits': True,
    }
    if source_fields:
        body['_source'] = list(source_fields)
    resp = client().search(index=index, body=body)
    hits = resp.get('hits') or {}
    total = hits.get('total')
    total = total.get('value') if isinstance(total, dict) else (total or 0)
    return {
        'items': [_hit_to_alert(h, index) for h in hits.get('hits', [])],
        'total': int(total or 0),
        'took_ms': resp.get('took', 0),
    }


# =============================================
# 检索
# =============================================

def search_alerts(query_string: str = '', filters: dict = None,
                  start: str = None, end: str = None, page: int = 1,
                  page_size: int = 20, sort_field: str = 'first_seen',
                  sort_order: str = 'desc', index: str = None) -> dict:
    """告警检索（分页）。"""
    index = index or INDEX_VALID
    ensure_index(index)
    page = max(1, int(page or 1))
    page_size = max(0, int(page_size if page_size is not None else 20))
    query = _build_query(query_string, filters, start, end)
    if page_size == 0:      # 仅取聚合时使用
        res = search_hits(index, query, size=0, offset=0,
                          sort_field=sort_field, sort_order=sort_order)
        res['page'] = page
        res['page_size'] = 0
        res['pages'] = 0
        return res
    res = search_hits(index, query, size=page_size, offset=(page - 1) * page_size,
                      sort_field=sort_field, sort_order=sort_order)
    res['page'] = page
    res['page_size'] = page_size
    res['pages'] = (res['total'] + page_size - 1) // page_size if page_size else 0
    return res


def get_alert(alert_id, index: str = None) -> Optional[dict]:
    """按 _id 取告警（默认先查 valid，再回退 invalid）。"""
    if alert_id in (None, ''):
        return None
    alert_id = str(alert_id)
    candidates = [index] if index else [INDEX_VALID, INDEX_INVALID]
    es = client()
    for idx in candidates:
        if not idx or not es.indices.exists(index=idx):
            continue
        try:
            resp = es.get(index=idx, id=alert_id)
            return _hit_to_alert(resp, idx)
        except Exception:
            pass
        # 回退：按 alert_code / alert_id 字段检索（兼容旧的是数字编号场景）
        try:
            res = search_hits(idx, {'bool': {'should': [
                {'term': {'alert_code': alert_id}},
                {'term': {'alert_id': alert_id}},
            ], 'minimum_should_match': 1}}, size=1)
            if res['items']:
                return res['items'][0]
        except Exception:
            pass
    return None


def count(index: str = None) -> int:
    index = index or INDEX_VALID
    try:
        if not client().indices.exists(index=index):
            return 0
        return int(client().count(index=index)['count'])
    except Exception:
        return 0


# =============================================
# 写入
# =============================================

def index_alert(doc: dict, index: str = None, refresh: str = 'wait_for') -> bool:
    """幂等写入告警（_id = alert_id）。"""
    index = index or INDEX_VALID
    ensure_index(index)
    body = _norm_doc(doc)
    doc_id = body.get('alert_id')
    if not doc_id:
        raise ValueError('告警缺少 alert_id，无法写入 ES')
    client().index(index=index, id=doc_id, body=body, refresh=refresh)
    return True


def update_alert(alert_id, fields: dict, index: str = None) -> bool:
    """部分更新告警文档（先定位实际所在索引）。"""
    if not fields:
        return True
    alert_id = str(alert_id)
    payload = dict(fields)
    payload['updated_at'] = to_iso(datetime.utcnow())
    candidates = [index] if index else [INDEX_VALID, INDEX_INVALID]
    es = client()
    for idx in candidates:
        if not idx or not es.indices.exists(index=idx):
            continue
        try:
            es.update(index=idx, id=alert_id, body={'doc': payload}, refresh='wait_for')
            return True
        except Exception:
            pass
    return False


def set_status(alert_id, status: str, index: str = None) -> bool:
    return update_alert(alert_id, {'status': status}, index=index)


def bulk_set_status(alert_ids: list, status: str, index: str = None) -> int:
    """批量更新状态：逐条定位索引后写入，返回成功条数。"""
    done = 0
    for aid in alert_ids or []:
        if set_status(aid, status, index=index):
            done += 1
    return done


def merge_extra(alert_id, patch: dict, index: str = None) -> bool:
    """合并写 extra_data（读改写，避免整体覆盖丢字段）。"""
    doc = get_alert(alert_id, index=index)
    if doc is None:
        return False
    extra = dict(doc.get('extra_data') or {})
    extra.update(patch or {})
    return update_alert(alert_id, {'extra_data': extra}, index=index)


def delete_alert(alert_id, index: str = None) -> bool:
    alert_id = str(alert_id)
    candidates = [index] if index else [INDEX_VALID, INDEX_INVALID]
    es = client()
    for idx in candidates:
        if not idx or not es.indices.exists(index=idx):
            continue
        try:
            es.delete(index=idx, id=alert_id, refresh='wait_for')
            return True
        except Exception:
            pass
    return False


def bulk_delete(alert_ids: list, index: str = None) -> int:
    done = 0
    for aid in alert_ids or []:
        if delete_alert(aid, index=index):
            done += 1
    return done


def reindex_from_pg_doc(doc: dict, index: str = None) -> bool:
    """回灌历史告警（补 processing_status / dispatch_branch 等缺失标记）。"""
    index = index or INDEX_VALID
    body = dict(doc)
    body.setdefault('processing_status', 'NORMAL')
    body.setdefault('dispatch_branch', _INDEX_BRANCH.get(index, 'valid'))
    body.setdefault('dispatch_policy', '历史回灌')
    return index_alert(body, index=index)


# =============================================
# 聚合
# =============================================

def quick_values(field: str = 'severity', query_string: str = '', filters: dict = None,
                 start: str = None, end: str = None, size: int = 10,
                 index: str = None) -> dict:
    """字段取值分布 TopN（返回 {total, buckets:[{key,count,percentage}]}）。

    注：ip 类型字段不支持 terms 聚合的 missing 占位（'N/A' 不是合法 IP 字面量），
    命中该错误时自动去掉 missing 重试。
    """
    index = index or INDEX_VALID
    ensure_index(index)
    query = _build_query(query_string, filters, start, end)

    def _body(with_missing: bool) -> dict:
        terms: dict[str, Any] = {'field': field, 'size': size}
        if with_missing:
            terms['missing'] = 'N/A'
        return {
            'size': 0,
            'track_total_hits': True,
            'query': query,
            'aggs': {'values': {'terms': terms}},
        }

    resp = None
    try:
        resp = client().search(index=index, body=_body(True))
    except Exception as e:
        if 'IP string literal' in str(e) or 'missing' in str(e):
            try:
                resp = client().search(index=index, body=_body(False))
            except Exception as e2:
                logger.warning(f"ES quick_values 失败 field={field}: {e2}")
                return {'total': 0, 'buckets': [], 'error': str(e2)}
        else:
            logger.warning(f"ES quick_values 失败 field={field}: {e}")
            return {'total': 0, 'buckets': [], 'error': str(e)}

    hits = resp.get('hits') or {}
    total = hits.get('total')
    total = total.get('value') if isinstance(total, dict) else (total or 0)
    buckets = ((resp.get('aggregations') or {}).get('values') or {}).get('buckets') or []
    return {
        'total': int(total or 0),
        'buckets': [{
            'key': b.get('key'),
            'count': b.get('doc_count', 0),
            'percentage': round(b.get('doc_count', 0) / total * 100, 1) if total else 0,
        } for b in buckets],
    }


def field_stats(field: str = 'severity', query_string: str = '',
                filters: dict = None, start: str = None, end: str = None,
                index: str = None) -> dict:
    """字段基数统计（总条数 + 去重值个数）。"""
    index = index or INDEX_VALID
    ensure_index(index)
    query = _build_query(query_string, filters, start, end)
    body = {
        'size': 0,
        'track_total_hits': True,
        'query': query,
        'aggs': {'distinct': {'cardinality': {'field': field}}},
    }
    try:
        resp = client().search(index=index, body=body)
    except Exception as e:
        logger.warning(f"ES field_stats 失败 field={field}: {e}")
        return {'field': field, 'total': 0, 'distinct': 0, 'error': str(e)}
    hits = resp.get('hits') or {}
    total = hits.get('total')
    total = total.get('value') if isinstance(total, dict) else (total or 0)
    distinct = ((resp.get('aggregations') or {}).get('distinct') or {}).get('value', 0)
    return {'field': field, 'total': int(total or 0), 'distinct': int(distinct or 0)}


def histogram(query_string: str = '', filters: dict = None, start: str = None,
              end: str = None, interval: str = 'auto', index: str = None) -> dict:
    """时间直方图（interval=auto 时按 ES 自适应，否则用固定 interval）。"""
    index = index or INDEX_VALID
    ensure_index(index)
    query = _build_query(query_string, filters, start, end)
    agg: dict[str, Any] = {'date_histogram': {'field': 'first_seen', 'min_doc_count': 0}}
    if interval and interval != 'auto':
        agg['date_histogram']['fixed_interval'] = interval
    else:
        agg['date_histogram']['calendar_interval'] = '1h'
    body = {'size': 0, 'track_total_hits': True, 'query': query,
            'aggs': {'timeline': agg}}
    try:
        resp = client().search(index=index, body=body)
    except Exception as e:
        logger.warning(f"ES histogram 失败: {e}")
        return {'buckets': [], 'error': str(e)}
    buckets = ((resp.get('aggregations') or {}).get('timeline') or {}).get('buckets') or []
    return {'buckets': [{
        'key': b.get('key'),
        'key_as_string': b.get('key_as_string'),
        'doc_count': b.get('doc_count', 0),
    } for b in buckets]}


def get_stats(query_string: str = '', filters: dict = None, start: str = None,
              end: str = None, index: str = None) -> dict:
    """总量 + 按 severity/status 分布。"""
    index = index or INDEX_VALID
    ensure_index(index)
    query = _build_query(query_string, filters, start, end)
    body = {
        'size': 0,
        'track_total_hits': True,
        'query': query,
        'aggs': {
            'by_severity': {'terms': {'field': 'severity', 'size': 20}},
            'by_status': {'terms': {'field': 'status', 'size': 20}},
        },
    }
    try:
        resp = client().search(index=index, body=body)
    except Exception as e:
        logger.warning(f"ES stats 失败: {e}")
        return {'total': 0, 'by_severity': {}, 'by_status': {}, 'error': str(e)}
    hits = resp.get('hits') or {}
    total = hits.get('total')
    total = total.get('value') if isinstance(total, dict) else (total or 0)
    aggs = resp.get('aggregations') or {}
    by_sev = {b['key']: b['doc_count'] for b in (aggs.get('by_severity') or {}).get('buckets', [])}
    by_st = {b['key']: b['doc_count'] for b in (aggs.get('by_status') or {}).get('buckets', [])}
    return {'total': int(total or 0), 'by_severity': by_sev, 'by_status': by_st}


def get_trend(days: int = 7, index: str = None) -> list:
    """近 N 天按天统计（返回 [{date, count}]）。"""
    index = index or INDEX_VALID
    ensure_index(index)
    start = (datetime.utcnow() - timedelta(days=max(1, int(days or 7)))).strftime('%Y-%m-%dT%H:%M:%SZ')
    body = {
        'size': 0,
        'query': {'range': {'first_seen': {'gte': start}}},
        'aggs': {'per_day': {'date_histogram': {
            'field': 'first_seen', 'calendar_interval': '1d', 'min_doc_count': 0}}},
    }
    try:
        resp = client().search(index=index, body=body)
    except Exception as e:
        logger.warning(f"ES trend 失败: {e}")
        return []
    buckets = ((resp.get('aggregations') or {}).get('per_day') or {}).get('buckets') or []
    return [{'date': (b.get('key_as_string') or '')[:10], 'count': b.get('doc_count', 0)}
            for b in buckets]


def related_alerts(alert_id, limit: int = 20, index: str = None) -> list:
    """关联告警：同源 IP / 同目标 IP / 同主机名 / 同产品+分类（排除自身）。"""
    base = get_alert(alert_id, index=index)
    if not base:
        return []
    should = []
    for field in ('src_ip', 'dst_ip', 'hostname'):
        val = base.get(field)
        if val:
            should.append({'term': {field: val}})
    if base.get('source_product') and base.get('category'):
        should.append({'bool': {'must': [
            {'term': {'source_product': base['source_product']}},
            {'term': {'category': base['category']}},
        ]}})
    if not should:
        return []
    idx = index or base.get('_index') or INDEX_VALID
    query = {'bool': {
        'should': should,
        'minimum_should_match': 1,
        'must_not': [{'ids': {'values': [str(alert_id)]}}],
    }}
    try:
        res = search_hits(idx, query, size=limit, sort_field='first_seen', sort_order='desc')
        return res['items']
    except Exception as e:
        logger.warning(f"ES related 查询失败: {e}")
        return []


def search_all(query_string: str = '', filters: dict = None, start: str = None,
               end: str = None, limit: int = 10000, sort_field: str = 'first_seen',
               sort_order: str = 'desc', index: str = None) -> list:
    """取一批告警（导出用，受 limit 约束）。"""
    index = index or INDEX_VALID
    res = search_hits(index, _build_query(query_string, filters, start, end),
                      size=min(limit, 10000), offset=0,
                      sort_field=sort_field, sort_order=sort_order)
    return res['items']


# =============================================
# 规则引擎支撑：映射展开 / 去重取值 / 裸查
# =============================================
#
# 检测规则（app/engine/rule_engine.py）需要知道每个字段在 ES 里的真实类型，
# 才能决定用 term / wildcard / match_phrase / range，以及文本字段要不要走
# `xxx.keyword` 子字段。这些信息直接从索引映射里读，不另建字段表。

_META_CACHE: dict[str, tuple[float, Any]] = {}
_META_TTL = 60.0        # 秒；映射与取值分布变化很慢，60s 足够且省查询


def _cache_get(key: str):
    item = _META_CACHE.get(key)
    if not item:
        return None
    ts, value = item
    if time.monotonic() - ts > _META_TTL:
        return None
    return value


def _cache_put(key: str, value):
    _META_CACHE[key] = (time.monotonic(), value)
    return value


def _flatten(props: dict, prefix: str = '') -> dict:
    """把 ES mapping 的 properties 递归展开成 {字段路径: 类型}。"""
    out: dict[str, str] = {}
    for name, spec in (props or {}).items():
        path = f'{prefix}{name}'
        if not isinstance(spec, dict):
            continue
        if spec.get('properties'):
            out.update(_flatten(spec['properties'], f'{path}.'))
            continue
        out[path] = spec.get('type', 'object')
        for sub in (spec.get('fields') or {}):
            out[f'{path}.{sub}'] = (spec['fields'][sub] or {}).get('type', 'keyword')
    return out


def flatten_mapping(index: str = None) -> dict:
    """索引里所有字段路径 → ES 类型（含 extra_data.* / parsed_data.* 等动态子字段）。

    返回如 {'src_ip': 'ip', 'extra_data.src_ip': 'ip', 'title': 'text',
            'title.keyword': 'keyword'}。索引不存在或 ES 不可用时返回 {}。
    """
    index = index or INDEX_VALID
    key = f'mapping:{index}'
    cached = _cache_get(key)
    if cached is not None:
        return cached
    try:
        es = client()
        if not es.indices.exists(index=index):
            return _cache_put(key, {})
        raw = es.indices.get_mapping(index=index) or {}
        node = raw.get(index) or (list(raw.values())[0] if raw else {})
        props = ((node.get('mappings') or {}).get('properties')) or {}
        return _cache_put(key, _flatten(props))
    except Exception as e:
        logger.warning(f"ES mapping 读取失败 {index}: {e}")
        return {}


def distinct_field_values(field: str = 'source_product', index: str = None,
                          size: int = 200) -> list:
    """字段去重取值（自动补 `.keyword` 子字段，text 字段直接用原路径）。"""
    index = index or INDEX_VALID
    key = f'distinct:{index}:{field}:{size}'
    cached = _cache_get(key)
    if cached is not None:
        return cached
    types = flatten_mapping(index)
    path = field
    if types.get(field) == 'text' and f'{field}.keyword' in types:
        path = f'{field}.keyword'
    body = {'size': 0, 'query': {'match_all': {}},
            'aggs': {'v': {'terms': {'field': path, 'size': size}}}}
    try:
        resp = raw_search(index, body)
        buckets = ((resp.get('aggregations') or {}).get('v') or {}).get('buckets') or []
        return _cache_put(key, [b.get('key') for b in buckets])
    except Exception as e:
        logger.warning(f"ES 去重取值失败 {field}: {e}")
        return []


def raw_search(index: str, body: dict) -> dict:
    """裸搜索：直接下发 body（供规则引擎做计数 / 聚合 / 取样）。

    索引不存在时抛异常，由调用方处理（避免把"索引没建"伪装成"0 条命中"）。
    """
    index = index or INDEX_VALID
    if not client().indices.exists(index=index):
        raise RuntimeError(f'ES 索引不存在: {index}')
    return client().search(index=index, body=body)


def total_hits(resp: dict) -> int:
    """从 ES 响应里取命中总数（兼容 7.x 之前的裸数字形式）。"""
    total = (resp.get('hits') or {}).get('total')
    total = total.get('value') if isinstance(total, dict) else (total or 0)
    return int(total or 0)


# =============================================
# 兼容 SQLAlchemy Alert 对象的 ES 适配器
# =============================================

class ESAlertRef:
    """把 ES 告警文档包装成与 SQLAlchemy Alert 相同的属性访问方式。

    供 AI 研判等原按 ORM 对象编写的模块复用：
        alert = load_alert('ALT-xxx')
        extra = alert.extra_data or {}
        extra['structured_analysis'] = {...}
        alert.extra_data = extra
        save_alert(alert)
    """

    _RESERVED = ('_doc', '_index', '_dirty')

    def __init__(self, doc: dict, index: str = None):
        object.__setattr__(self, '_doc', dict(doc or {}))
        object.__setattr__(self, '_index', index or doc.get('_index') or INDEX_VALID)
        object.__setattr__(self, '_dirty', set())

    # ---- 属性访问 ----
    @property
    def id(self):
        return self._doc.get('id') or self._doc.get('alert_id')

    @property
    def alert_id(self):
        return self.id

    def __getattr__(self, name):
        if name.startswith('_'):
            raise AttributeError(name)
        return self._doc.get(name)

    def __setattr__(self, name, value):
        if name in self._RESERVED:
            object.__setattr__(self, name, value)
            return
        self._doc[name] = value
        self._dirty.add(name)

    def __repr__(self):
        return f'<ESAlertRef {self.id}>'

    # ---- 写回 ----
    def save(self) -> bool:
        if not self._dirty:
            return True
        payload = {k: self._doc.get(k) for k in self._dirty}
        ok = update_alert(self.id, {k: v for k, v in payload.items() if v is not None},
                          index=self._index)
        if ok:
            self._dirty.clear()
        return ok

    def to_dict(self) -> dict:
        return dict(self._doc)


def load_alert(alert_id) -> Optional[ESAlertRef]:
    """按 id 载入告警（ES 文档 → ESAlertRef）。"""
    doc = get_alert(alert_id)
    return ESAlertRef(doc, doc.get('_index')) if doc else None


def save_alert(alert) -> bool:
    """统一保存入口：ESAlertRef → 写回 ES；其余对象（ORM）→ 交给调用方 commit。"""
    if isinstance(alert, ESAlertRef):
        return alert.save()
    return True
