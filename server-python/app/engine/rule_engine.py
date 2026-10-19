"""
规则评估引擎 —— 在 Elasticsearch 告警索引（alerts-valid）上执行检测规则

⚠️ 数据来源已从 TimescaleDB 换成 ES 告警（2026-10-17）：
   历史实现查 `parsed_logs` 表与数据源存储表，这两张表在现行架构里都已不存在
   （告警唯一真相源 = ES `alerts-valid` / `alerts-invalid`），导致评估必定
   报 `relation "parsed_logs" does not exist` / `column "timestamp" does not exist`。
   现统一走 `app/utils/es_alerts.py`。

支持的规则类型（rule.type）:
- single / threshold : 时间窗口内条件命中数 ≥ 阈值（可按字段分组）
- aggregation        : 窗口内数值字段的聚合统计（含去重计数）
- correlation        : 多条件组关联（读前端生成的 groups 结构，组间 AND / OR）
- sequence / query   : 已随多事件分析统一到「关联分析规则」（Flink），此处返回明确提示

规则内容格式 (rule_content JSON):
{
    "version": 2,
    "conditions": [
        {"field": "src_ip", "operator": "not_in_list", "value": "10.0.0.0/8,192.168.0.0/16"},
        {"field": "action", "operator": "equals", "value": "blocked"}
    ],
    "time_window": "5 minutes",
    "threshold": 200,
    "group_by": "src_ip",
    "severity": "high",
    "title_template": "{group_value} 在 {window} 内产生 {count} 次攻击",
    "description_template": "外部IP {group_value} 在 {time_window} 内触发 {count} 次安全事件"
}

字段位置回退：条件里的字段优先按告警顶层字段匹配（如 `src_ip`），顶层没有该字段时
再回退 `extra_data.<字段>` / `parsed_data.<字段>`（历史回灌数据把 IP 等放在 extra_data）。
多位置之间是 OR 关系；否定类操作符（not_equals / not_in_list / is_empty）则取整组取反。
"""

import json
import logging
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from app.database import db
from app.models import Event, DetectionRuleExtended, AuditLog, DataSource
from app.utils import es_alerts

logger = logging.getLogger(__name__)

# 时间窗口判定字段：优选告警事件时间 first_seen，缺失时回退入库时间 created_at
TIME_FIELDS = ('first_seen', 'created_at')

_NUMERIC_TYPES = {'integer', 'long', 'short', 'byte', 'double', 'float',
                  'half_float', 'scaled_float', 'unsigned_long'}

# 允许的条件字段：告警标准字段（ES 映射里显式声明的那批）
ALERT_FIELDS = tuple(es_alerts.ALERT_MAPPING['properties'].keys())

# 前端可选的告警字段（含中文名），顺序即下拉框顺序
FIELD_LABELS = {
    'alert_code': '告警编号', 'alert_id': '告警ID', 'alert_log_id': '告警日志ID',
    'title': '告警标题', 'description': '告警描述', 'severity': '严重等级',
    'status': '处理状态', 'operation': '操作动作', 'source': '来源', 'source_product': '来源产品',
    'source_type': '来源类型', 'category': '分类', 'confidence': '置信度',
    'src_ip': '源IP', 'src_port': '源端口', 'dst_ip': '目标IP', 'dst_port': '目标端口',
    'protocol': '协议', 'hostname': '主机名', 'tags': '标签',
    'processing_status': '处理标记', 'dispatch_policy': '分流策略',
    'assigned_to': '处置人ID', 'raw_log': '原始日志',
}


# ─── 条件解析 ────────────────────────────────────────────────

def _parse_time_window(window_str: str) -> timedelta:
    """解析时间窗口字符串, 返回 timedelta"""
    if not window_str:
        return timedelta(minutes=5)

    window_str = str(window_str).strip().lower()
    patterns = [
        (r'(\d+)\s*seconds?', 'seconds'),
        (r'(\d+)\s*minutes?', 'minutes'),
        (r'(\d+)\s*hours?', 'hours'),
        (r'(\d+)\s*days?', 'days'),
        (r'(\d+)\s*weeks?', 'weeks'),
    ]

    total = timedelta()
    for pattern, unit in patterns:
        match = re.search(pattern, window_str)
        if match:
            val = int(match.group(1))
            total += timedelta(**{unit: val})

    if total.total_seconds() == 0:
        try:
            return timedelta(minutes=int(window_str))
        except ValueError:
            return timedelta(minutes=5)

    return total


def _resolve_datasource(ds_id_or_name):
    """通过 ID 或名称查找数据源"""
    try:
        ds = DataSource.query.get(int(ds_id_or_name))
        if ds:
            return ds
    except (ValueError, TypeError):
        pass
    return DataSource.query.filter_by(name=str(ds_id_or_name)).first()


# ─── ES 查询构建 ──────────────────────────────────────────────
#
# 字段类型从索引映射实时读取（es_alerts.flatten_mapping，60s 缓存），据此决定：
#   keyword/ip → term / terms / wildcard / regexp
#   text       → 有 .keyword 子字段就走子字段，否则用 match_phrase 或 query_string
#   数值 / 日期 → term / terms / range（值做数值转换）

def _numeric(value):
    """把用户输入的字符串转成数值（整数优先，便于 term 精确匹配）。"""
    s = str(value).strip()
    try:
        return int(s)
    except ValueError:
        try:
            return float(s)
        except ValueError:
            return None


def _split_list(value) -> List[str]:
    if isinstance(value, (list, tuple)):
        return [str(v).strip() for v in value if str(v).strip()]
    return [v.strip() for v in str(value or '').split(',') if v.strip()]


def _query_string_pattern(paths: List[str], pattern: str) -> dict:
    """text 字段的通配匹配：quoted wildcard，避免手写转义踩 query_string 语法。"""
    escaped = pattern.replace('\\', '\\\\').replace('"', '\\"')
    return {'query_string': {
        'query': f'"{escaped}"',
        'fields': list(paths),
        'analyze_wildcard': True,
        'lenient': True,
    }}


def _positive_clause(path: str, kind: str, operator: str, value) -> Optional[dict]:
    """把一个"肯定式"条件编译成单个 ES 子句。"""
    if operator == 'equals':
        if kind == 'numeric':
            num = _numeric(value)
            return {'term': {path: num}} if num is not None else None
        return {'term': {path: str(value)}}

    if operator == 'contains':
        if kind == 'text':
            return {'match_phrase': {path: str(value)}}
        return {'wildcard': {path: f'*{value}*'}}

    if operator == 'starts_with':
        if kind == 'text':
            return _query_string_pattern([path], f'{value}*')
        return {'wildcard': {path: f'{value}*'}}

    if operator == 'ends_with':
        if kind == 'text':
            return _query_string_pattern([path], f'*{value}')
        return {'wildcard': {path: f'*{value}'}}

    if operator == 'greater_than':
        num = _numeric(value)
        if num is None:
            return None
        return {'range': {path: {'gt': num}}} if kind == 'numeric' else {'range': {path: {'gt': str(value)}}}

    if operator == 'less_than':
        num = _numeric(value)
        if num is None:
            return None
        return {'range': {path: {'lt': num}}} if kind == 'numeric' else {'range': {path: {'lt': str(value)}}}

    if operator == 'in_list':
        vals = _split_list(value)
        if not vals:
            return None
        if kind == 'numeric':
            nums = [n for n in (_numeric(v) for v in vals) if n is not None]
            return {'terms': {path: nums}} if nums else None
        return {'terms': {path: vals}}

    if operator == 'is_not_empty':
        return {'exists': {'field': path}}

    if operator == 'regex_match':
        return {'regexp': {path: str(value)}}

    return None


def _path_kinds(field: str, types: dict) -> List[tuple]:
    """字段 → [(可查询路径, 语义类型)]，多位置（顶层 / extra_data / parsed_data）取并集。

    语义类型 kind ∈ {'exact','text','numeric','date'}；映射里查不到的路径直接丢弃
    （查了必然 0 条，留着只会放大 should 子句）。
    """
    paths = [field] if '.' in field else [field, f'extra_data.{field}', f'parsed_data.{field}']
    out = []
    for path in paths:
        t = types.get(path)
        if t is None:
            continue
        if t == 'text':
            kw = f'{path}.keyword'
            if kw in types:
                out.append((kw, 'exact'))
            else:
                out.append((path, 'text'))
        elif t in _NUMERIC_TYPES:
            out.append((path, 'numeric'))
        elif t in ('date', 'date_nanos'):
            out.append((path, 'date'))
        else:
            out.append((path, 'exact'))
    return out


def _condition_clause(cond: dict, types: dict) -> Optional[dict]:
    """单个条件 → ES 子句。"""
    field = str(cond.get('field') or '').strip()
    operator = str(cond.get('operator') or 'equals').strip()
    value = cond.get('value', '')

    if not field:
        return None
    if field not in ALERT_FIELDS and field not in types:
        return None

    locations = _path_kinds(field, types)
    if not locations:
        # 字段在选择集里但索引映射中没有（从未写入过）→ 该条件不成立
        return {'match_none': {}}

    # 否定类：先构造肯定式，再整体取反（"任一位置都不等于 / 不包含 X"）
    _NEGATIVE = {'not_equals': 'equals', 'not_in_list': 'in_list', 'not_contains': 'contains'}
    if operator in _NEGATIVE:
        base_op = _NEGATIVE[operator]
        clauses = [c for c in (_positive_clause(p, k, base_op, value) for p, k in locations) if c]
        if not clauses:
            return None
        if len(clauses) == 1:
            return {'bool': {'must_not': [clauses[0]]}}
        return {'bool': {'must_not': [{'bool': {'should': clauses}}]}}

    if operator == 'is_empty':
        exists = [{'exists': {'field': p}} for p, _ in locations]
        if len(exists) == 1:
            return {'bool': {'must_not': [exists[0]]}}
        return {'bool': {'must_not': [{'bool': {'should': exists}}]}}

    clauses = [c for c in (_positive_clause(p, k, operator, value) for p, k in locations) if c]
    if not clauses:
        return None
    if len(clauses) == 1:
        return clauses[0]
    return {'bool': {'should': clauses, 'minimum_should_match': 1}}


def _time_clause(start: Optional[datetime], end: Optional[datetime]) -> Optional[dict]:
    """时间窗口：first_seen 优先，缺失时按 created_at 判定。"""
    if not start and not end:
        return None
    rng = {}
    if start:
        rng['gte'] = es_alerts.to_iso(start)
    if end:
        rng['lte'] = es_alerts.to_iso(end)
    should = [{'range': {f: dict(rng)}} for f in TIME_FIELDS]
    return {'bool': {'should': should, 'minimum_should_match': 1}}


def _source_clause(data_source_ids) -> tuple:
    """数据源选择 → ES 过滤子句 + 提示信息。

    告警文档里没有 DataSource.id，只能按标识字段对齐：把所选数据源的
    product_type / source_type / name 与告警里实际出现的 source_product、
    source 取值做大小写不敏感的包含匹配（任一方包含另一方即视为同一来源）。
    匹配不到任何现有取值时返回 match_none —— 宁可 0 条，也不放宽成全量。
    """
    if not data_source_ids:
        return None, []

    wanted = set()
    labels = []
    for ds_id in data_source_ids:
        ds = _resolve_datasource(ds_id)
        if not ds:
            continue
        labels.append(ds.name)
        for v in (ds.product_type, ds.source_type, ds.name):
            if v and str(v).strip():
                wanted.add(str(v).strip().lower())
    if not wanted:
        return {'match_none': {}}, ['所选数据源缺少可用于匹配的标识，本次按空结果处理']

    present = {}
    for field in ('source_product', 'source'):
        for v in es_alerts.distinct_field_values(field):
            if v:
                present.setdefault(field, []).append(v)

    hits = {}
    for field, values in present.items():
        matched = [v for v in values if any(
            w and (w in str(v).lower() or str(v).lower() in w) for w in wanted)]
        if matched:
            hits[field] = matched

    if not hits:
        return {'match_none': {}}, [
            f"所选数据源（{'、'.join(labels) or '未知'}）在现有告警里找不到对应的 "
            f"source_product / source 取值，本次不做放宽处理，结果为空"
        ]

    should = [{'terms': {f: v}} for f, v in hits.items()]
    clause = should[0] if len(should) == 1 else {'bool': {'should': should, 'minimum_should_match': 1}}
    return clause, []


def _build_query(conditions, types, start=None, end=None, data_source_ids=None,
                 extra_must=None) -> tuple:
    """组装 ES 查询，返回 (query, warnings)。"""
    must: List[dict] = []
    warnings: List[str] = []

    unknown = []
    for cond in (conditions or []):
        field = str(cond.get('field') or '').strip()
        if field and field not in ALERT_FIELDS and field not in types:
            unknown.append(field)
    if unknown:
        warnings.append('以下条件字段不在告警索引里，已忽略：'
                        + '、'.join(sorted(set(unknown))))

    for cond in (conditions or []):
        clause = _condition_clause(cond, types)
        if clause:
            must.append(clause)

    t = _time_clause(start, end)
    if t:
        must.append(t)

    src_clause, warns = _source_clause(data_source_ids)
    warnings.extend(warns)
    if src_clause:
        must.append(src_clause)

    must.extend(extra_must or [])
    return ({'bool': {'must': must}} if must else {'match_all': {}}), warnings


def _agg_field(field: str, types: dict) -> Optional[str]:
    """分组 / 聚合用的 ES 字段路径（text 字段走 .keyword 子字段）。"""
    t = types.get(field)
    if t is None:
        return None
    if t == 'text':
        return f'{field}.keyword' if f'{field}.keyword' in types else None
    if t == 'object':
        return None
    return field


# ─── 规则内容解析 ─────────────────────────────────────────────

def parse_rule_content(rule: DetectionRuleExtended) -> Dict:
    """解析规则内容, 支持 JSON 和 Sigma 格式"""
    content = rule.rule_content or ''

    # 尝试 JSON 解析
    if content.strip().startswith('{'):
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            pass

    # 尝试 Sigma 格式解析 (基本)
    if 'title:' in content or 'detection:' in content:
        return _parse_sigma_rule(content, rule)

    # 返回空规则
    return {
        'conditions': [],
        'time_window': '5 minutes',
        'threshold': 1,
        'aggregation': 'count',
        'severity': rule.severity
    }


def _parse_sigma_rule(content: str, rule: DetectionRuleExtended) -> Dict:
    """解析 Sigma 规则格式 (简化版)"""
    result = {
        'conditions': [],
        'time_window': '5 minutes',
        'threshold': 1,
        'aggregation': 'count',
        'severity': rule.severity or 'medium'
    }

    # 提取 detection 中的 condition
    detection_match = re.search(r'detection:\s*\n(.*?)(?:\n\s*\n|\n\w+:)', content, re.DOTALL)
    if detection_match:
        detection_block = detection_match.group(1)
        # 提取 selection 匹配项
        for match in re.finditer(r'(\w+):\s*\n((?:\s+\w+:.*\n?)+)', detection_block):
            key = match.group(1)
            if key == 'condition':
                continue
            values_block = match.group(2)
            for field_match in re.finditer(r'(\w+):\s*[\'"]?([^\'"\n]+)[\'"]?', values_block):
                field = field_match.group(1)
                value = field_match.group(2).strip()
                if field in ('src_ip', 'dst_ip', 'action', 'log_type', 'protocol',
                             'hostname', 'username', 'result'):
                    result['conditions'].append({
                        'field': field,
                        'operator': 'contains' if '*' in value else 'equals',
                        'value': value.replace('*', '')
                    })

    # 提取时间窗口
    time_match = re.search(r'timeframe:\s*(\S+)', content)
    if time_match:
        result['time_window'] = time_match.group(1)

    # 提取严重度
    level_match = re.search(r'level:\s*(\S+)', content)
    if level_match:
        result['severity'] = level_match.group(1)

    # 如果有关键词 condition，提取阈值
    condition_match = re.search(r'condition:\s*(\S+)', content)
    if condition_match:
        cond_expr = condition_match.group(1)
        gt_match = re.search(r'>\s*(\d+)', cond_expr)
        if gt_match:
            result['threshold'] = int(gt_match.group(1))
        count_match = re.search(r'count\s*\(\s*\)\s*by\s*(\w+)', cond_expr)
        if count_match:
            result['group_by'] = count_match.group(1)
            result['aggregation'] = 'count'

    return result


# ─── 规则评估核心 ─────────────────────────────────────────────

class RuleEngine:
    """规则评估引擎（ES 告警）"""

    # ---------- 公共入口 ----------

    def evaluate_rule(self, rule: DetectionRuleExtended, dry_run: bool = False,
                      max_samples: int = 0, time_range_minutes: int = None) -> Dict:
        """评估单条规则。

        dry_run=True（测试/预览）时只读不写：不创建事件、不累加命中数。
        max_samples>0 时额外返回命中样本与来源分布，供前端测试面板展示。
        """
        parsed = parse_rule_content(rule)
        rule_type = (rule.type or parsed.get('type') or 'single').strip().lower()

        if rule_type in ('sequence',):
            return self._unsupported(rule, '时序规则类型已下线：多事件时序分析请使用「关联分析规则」（Flink 流作业）')
        if rule_type == 'query':
            return self._unsupported(rule, '自定义 SQL 规则类型已下线：请改用字段条件，或使用「关联分析规则」')

        handlers = {
            'aggregation': self._evaluate_aggregation,
            'correlation': self._evaluate_correlation,
        }
        handler = handlers.get(rule_type, self._evaluate_threshold)
        return handler(rule, parsed, dry_run=dry_run, max_samples=max_samples,
                       time_range_minutes=time_range_minutes)

    def evaluate_rule_on_storage(self, rule, max_samples: int = 20,
                                 time_range_minutes: int = None) -> Dict:
        """兼容旧调用名：等价于在 ES 上做一次只读评估（原先查数据源存储表）。

        存储表（TimescaleDB）已不再承载告警数据，保留该方法只为不改调用方。
        """
        return self.evaluate_rule(rule, dry_run=True, max_samples=max_samples,
                                  time_range_minutes=time_range_minutes)

    def evaluate_all_enabled(self) -> Dict:
        """评估所有启用的规则（会创建事件，供手动批量评估入口调用）"""
        rules = DetectionRuleExtended.query.filter(
            DetectionRuleExtended.status == 'enabled'
        ).all()

        results = []
        events_total = 0
        for rule in rules:
            result = self.evaluate_rule(rule)
            results.append(result)
            events_total += len(result.get('events_created', []))
            if not self._stats_noop(rule):
                self._bump_hit(rule, result)

        return {
            'total_rules': len(rules),
            'evaluated': len(results),
            'events_created': events_total,
            'results': results,
            'evaluated_at': datetime.utcnow().isoformat()
        }

    # ---------- 内部工具 ----------

    @staticmethod
    def _stats_noop(rule) -> bool:
        return not isinstance(rule, DetectionRuleExtended)

    def _bump_hit(self, rule, result):
        """命中后累加 hit_count —— 有事件的写入由 _create_event_from_match 处理。"""
        try:
            if result.get('matched'):
                rule.hit_count = (rule.hit_count or 0) + 1
                rule.last_hit_time = datetime.utcnow()
                db.session.commit()
        except Exception as e:
            db.session.rollback()
            logger.warning(f'规则 {rule.id} 命中计数更新失败: {e}')

    def _unsupported(self, rule, message: str) -> Dict:
        return {
            'rule_id': rule.id,
            'rule_name': rule.name,
            'matched': False,
            'matched_count': 0,
            'error': message,
            'evaluated_at': datetime.utcnow().isoformat(),
        }

    def _window(self, parsed, time_range_minutes):
        now = datetime.utcnow()
        if time_range_minutes:
            window = timedelta(minutes=int(time_range_minutes))
            label = f'{int(time_range_minutes)} minutes'
        else:
            label = parsed.get('time_window') or '5 minutes'
            window = _parse_time_window(label)
        return now, now - window, label

    def _samples_and_sources(self, query: dict, max_samples: int, index: str = None):
        """命中样本 + 来源分布（仅测试路径需要）。"""
        samples, sources = [], {}
        if max_samples <= 0:
            return samples, sources
        try:
            res = es_alerts.search_hits(index or es_alerts.INDEX_VALID, query,
                                        size=max_samples, offset=0,
                                        sort_field='first_seen', sort_order='desc')
            samples = res.get('items', [])
        except Exception as e:
            logger.warning(f'规则取样失败: {e}')

        try:
            types = es_alerts.flatten_mapping(index)
            path = _agg_field('source_product', types)
            body = {'size': 0, 'query': query,
                    'aggs': {'src': {'terms': {'field': path or 'source_product', 'size': 10}}}}
            resp = es_alerts.raw_search(index or es_alerts.INDEX_VALID, body)
            for b in ((resp.get('aggregations') or {}).get('src') or {}).get('buckets', []):
                key = str(b.get('key'))
                sources[key] = {'data_source_name': key, 'matched_count': b.get('doc_count', 0)}
        except Exception as e:
            logger.warning(f'规则来源分布失败: {e}')
        return samples, sources

    # ---------- 各类型评估 ----------

    def _evaluate_threshold(self, rule, parsed, dry_run=False, max_samples=0,
                            time_range_minutes=None) -> Dict:
        """单事件（阈值）规则：窗口内条件命中数 ≥ threshold，可按字段分组。"""
        conditions = parsed.get('conditions', [])
        threshold = int(parsed.get('threshold', 1) or 1)
        group_by = (parsed.get('group_by') or '').strip()
        now, start, window_label = self._window(parsed, time_range_minutes)

        types = es_alerts.flatten_mapping()
        query, warnings = _build_query(conditions, types, start, now, rule.data_source_ids)

        agg_field = _agg_field(group_by, types) if group_by else None
        group_note = ''
        if group_by and not agg_field:
            group_note = f'分组字段 {group_by} 不在告警索引里，已按整体计数评估'
            group_by, agg_field = '', ''

        body: Dict[str, Any] = {'size': 0, 'track_total_hits': True, 'query': query}
        if agg_field:
            body['aggs'] = {'groups': {'terms': {
                'field': agg_field, 'size': 50,
                'min_doc_count': threshold, 'order': {'_count': 'desc'}}}}

        try:
            resp = es_alerts.raw_search(es_alerts.INDEX_VALID, body)
        except Exception as e:
            return self._error(rule, str(e), window_label)

        total = es_alerts.total_hits(resp)
        matches: List[Dict[str, Any]] = []
        if agg_field:
            for b in ((resp.get('aggregations') or {}).get('groups') or {}).get('buckets', []):
                matches.append({
                    'group_value': b.get('key_as_string') or str(b.get('key')),
                    'count': b.get('doc_count', 0),
                    'threshold': threshold,
                    'exceeded': True,
                })
        elif total >= threshold:
            matches.append({'count': total, 'threshold': threshold, 'exceeded': True})

        matched = bool(matches)
        samples, sources = self._samples_and_sources(query, max_samples)

        events_created = []
        if matched and not dry_run:
            link_ids = self._collect_alert_ids([query])
            for match in matches:
                event = self._create_event_from_match(
                    rule, match, parsed, start.isoformat(), now.isoformat(),
                    alert_ids=link_ids)
                if event:
                    events_created.append(event.to_dict())

        result = {
            'rule_id': rule.id,
            'rule_name': rule.name,
            'rule_type': 'single',
            'matched': matched,
            'matched_count': total,
            'total_matched': total,
            'match_count': len(matches),
            'matches': matches,
            'matched_logs': samples,
            'threshold': threshold,
            'time_window': window_label,
            'start_time': start.isoformat(),
            'end_time': now.isoformat(),
            'evaluated_at': now.isoformat(),
            'events_created': events_created,
            'warnings': [w for w in warnings + ([group_note] if group_note else []) if w],
        }
        if sources:
            result['sources'] = sources
        return result

    def _evaluate_aggregation(self, rule, parsed, dry_run=False, max_samples=0,
                              time_range_minutes=None) -> Dict:
        """聚合规则：窗口内数值字段 SUM / AVG / MAX / MIN / 去重计数。"""
        aggregation = (parsed.get('aggregation') or 'count').lower()
        agg_field_name = (parsed.get('agg_field') or parsed.get('group_by') or '').strip()
        group_by = (parsed.get('group_by') or '').strip()
        threshold = _numeric(parsed.get('threshold', 0)) or 0
        now, start, window_label = self._window(parsed, time_range_minutes)

        types = es_alerts.flatten_mapping()
        query, warnings = _build_query(parsed.get('conditions', []), types,
                                      start, now, rule.data_source_ids)

        if not agg_field_name:
            return self._error(rule, '聚合规则缺少聚合字段（agg_field）', window_label)
        es_agg_field = _agg_field(agg_field_name, types)
        if not es_agg_field:
            return self._error(rule, f'聚合字段 {agg_field_name} 不在告警索引里', window_label)

        metric_map = {
            'sum': {'sum': {'field': es_agg_field}},
            'avg': {'avg': {'field': es_agg_field}},
            'max': {'max': {'field': es_agg_field}},
            'min': {'min': {'field': es_agg_field}},
            'distinct_count': {'cardinality': {'field': es_agg_field}},
            'count': {'value_count': {'field': es_agg_field}},
        }
        metric = metric_map.get(aggregation, metric_map['count'])

        body: Dict[str, Any] = {'size': 0, 'track_total_hits': True, 'query': query,
                                'aggs': {'metric': dict(metric)}}
        es_group = _agg_field(group_by, types) if group_by and group_by != agg_field_name else None
        if es_group:
            body['aggs'] = {'groups': {'terms': {'field': es_group, 'size': 50,
                                                 'order': {'metric': 'desc'}},
                                       'aggs': {'metric': dict(metric)}}}

        try:
            resp = es_alerts.raw_search(es_alerts.INDEX_VALID, body)
        except Exception as e:
            return self._error(rule, str(e), window_label)

        results = []
        aggs = resp.get('aggregations') or {}
        if es_group:
            for b in (aggs.get('groups') or {}).get('buckets', []):
                results.append({
                    'group_value': b.get('key_as_string') or str(b.get('key')),
                    'agg_value': (b.get('metric') or {}).get('value', 0),
                })
        else:
            results.append({'agg_value': (aggs.get('metric') or {}).get('value', 0)})

        values = [float(r.get('agg_value') or 0) for r in results]
        matched = any(v >= float(threshold) for v in values) if threshold else any(v > 0 for v in values)
        total = es_alerts.total_hits(resp)
        samples, sources = self._samples_and_sources(query, max_samples)

        events_created = []
        if matched and not dry_run:
            link_ids = self._collect_alert_ids([query])
            event = self._create_event_from_match(
                rule, {'aggregation': aggregation, 'agg_field': agg_field_name,
                       'agg_value': max(values) if values else 0, 'results': results[:5]},
                parsed, start.isoformat(), now.isoformat(),
                alert_ids=link_ids)
            if event:
                events_created.append(event.to_dict())

        result = {
            'rule_id': rule.id,
            'rule_name': rule.name,
            'rule_type': 'aggregation',
            'matched': matched,
            'matched_count': total,
            'total_matched': total,
            'aggregation': aggregation,
            'agg_field': agg_field_name,
            'results': results,
            'matched_logs': samples,
            'threshold': threshold,
            'time_window': window_label,
            'evaluated_at': now.isoformat(),
            'events_created': events_created,
            'warnings': warnings,
        }
        if sources:
            result['sources'] = sources
        return result

    def _evaluate_correlation(self, rule, parsed, dry_run=False, max_samples=0,
                              time_range_minutes=None) -> Dict:
        """关联规则：多条件组按组间 AND / OR 判定（读前端生成的 groups 结构）。

        兼容三种写法：
          groups + group_logic（前端生成）
          rules  + correlation_operator（早期手写）
          仅 conditions（退化为单事件阈值判定）
        """
        groups = parsed.get('groups')
        if groups:
            logic = str(parsed.get('group_logic') or 'AND').upper()
            group_specs = [{
                'label': g.get('label') or f"条件组 {i + 1}",
                'conditions': g.get('conditions') or [],
                'time_window': g.get('time_window') or parsed.get('overall_time_window'),
                'data_source_ids': g.get('data_source_ids') or rule.data_source_ids,
            } for i, g in enumerate(groups)]
        elif parsed.get('rules'):
            logic = 'OR' if str(parsed.get('correlation_operator') or 'and').lower() == 'or' else 'AND'
            group_specs = [{
                'label': f"子规则 {i + 1}",
                'conditions': sr.get('conditions') or [],
                'time_window': sr.get('time_window') or parsed.get('time_window'),
                'data_source_ids': rule.data_source_ids,
            } for i, sr in enumerate(parsed['rules'])]
        else:
            if not parsed.get('conditions'):
                return self._error(rule, '关联规则没有任何条件组，无法评估', parsed.get('time_window'))
            return self._evaluate_threshold(rule, parsed, dry_run=dry_run,
                                            max_samples=max_samples,
                                            time_range_minutes=time_range_minutes)

        group_specs = [g for g in group_specs if g['conditions']]
        if not group_specs:
            return self._error(rule, '关联规则的各条件组均为空，已跳过（不会判定命中）',
                               parsed.get('overall_time_window'))

        types = es_alerts.flatten_mapping()
        now = datetime.utcnow()
        sub_results = []
        group_queries: List[dict] = []
        warnings: List[str] = []

        for i, spec in enumerate(group_specs):
            if time_range_minutes:
                window = timedelta(minutes=int(time_range_minutes))
            else:
                window = _parse_time_window(spec.get('time_window') or parsed.get('overall_time_window'))
            start = now - window
            query, warns = _build_query(spec['conditions'], types, start, now,
                                        spec['data_source_ids'])
            group_queries.append(query)
            warnings.extend([f"{spec['label']}: {w}" for w in warns])
            try:
                resp = es_alerts.raw_search(es_alerts.INDEX_VALID,
                                            {'size': 0, 'track_total_hits': True, 'query': query})
                count = es_alerts.total_hits(resp)
                err = None
            except Exception as e:
                count, err = 0, str(e)
            sub_results.append({
                'rule_index': i,
                'label': spec['label'],
                'matched': count > 0,
                'count': count,
                'time_window': spec.get('time_window'),
                'conditions': spec['conditions'],
                'error': err,
            })

        flags = [s['matched'] for s in sub_results]
        matched = any(flags) if logic == 'OR' else all(flags)
        total = sum(s['count'] for s in sub_results)

        samples, sources = ([], {})
        if max_samples > 0:
            # 取样仍按"整体时间窗 + 首组条件"给出可读样本
            first = group_specs[0]
            window = _parse_time_window(first.get('time_window') or parsed.get('overall_time_window'))
            q, _ = _build_query(first['conditions'], types, now - window, now,
                                first['data_source_ids'])
            samples, sources = self._samples_and_sources(q, max_samples)

        events_created = []
        if matched and not dry_run:
            link_ids = self._collect_alert_ids(group_queries)
            event = self._create_event_from_match(
                rule, {'correlation_matched': True, 'sub_results': sub_results},
                parsed, '', now.isoformat(), alert_ids=link_ids)
            if event:
                events_created.append(event.to_dict())

        result = {
            'rule_id': rule.id,
            'rule_name': rule.name,
            'rule_type': 'correlation',
            'matched': matched,
            'matched_count': total,
            'total_matched': total,
            'group_logic': logic,
            'sub_results': sub_results,
            'matched_logs': samples,
            'time_window': parsed.get('overall_time_window') or parsed.get('time_window'),
            'evaluated_at': now.isoformat(),
            'events_created': events_created,
            'warnings': warnings,
        }
        if sources:
            result['sources'] = sources
        return result

    def _error(self, rule, message: str, window_label=None) -> Dict:
        return {
            'rule_id': rule.id,
            'rule_name': rule.name,
            'matched': False,
            'matched_count': 0,
            'total_matched': 0,
            'matches': [],
            'matched_logs': [],
            'error': message,
            'time_window': window_label,
            'evaluated_at': datetime.utcnow().isoformat(),
            'events_created': [],
            'warnings': [],
        }

    # ---------- 事件落库 ----------

    def _collect_alert_ids(self, queries: list, limit: int = 100) -> List[str]:
        """按各条件组查询收集命中的告警 id（供事件关联与状态联动）。

        只收「还没被事件关联过」的告警（无 event_ids 且非终态）：
        - 同一批告警不会被重复生成的事件再次拉回 investigating（防重复分析）
        - 已人工处置的告警不参与联动
        """
        ids: List[str] = []
        seen = set()
        must_not = [
            {'terms': {'status': ['closed', 'resolved', 'false_positive']}},
            {'exists': {'field': 'event_ids'}},
        ]
        for q in queries or []:
            if not q:
                continue
            body = {
                'size': limit,
                'query': {'bool': {'must': q, 'must_not': must_not}},
                '_source': False,
                'sort': [{'first_seen': {'order': 'desc'}}],
            }
            try:
                resp = es_alerts.raw_search(es_alerts.INDEX_VALID, body)
                for h in (resp.get('hits') or {}).get('hits', []):
                    aid = h.get('_id')
                    if aid and aid not in seen:
                        seen.add(aid)
                        ids.append(aid)
            except Exception as e:
                logger.warning(f'规则命中告警收集失败: {e}')
        return ids

    def _create_event_from_match(self, rule: DetectionRuleExtended,
                                  match: Dict, parsed: Dict,
                                  start_time: str, end_time: str,
                                  alert_ids: List[str] = None) -> Optional[Event]:
        """根据规则匹配结果创建事件（PG events 表）。"""
        try:
            title_tpl = parsed.get('title_template') or f'规则 "{rule.name}" 触发'
            desc_tpl = parsed.get('description_template') or rule.description or ''
            severity = parsed.get('severity', rule.severity or 'medium')
            time_window = parsed.get('time_window', '5 minutes')

            # 生成事件编号
            today = datetime.utcnow().strftime('%Y%m%d')
            max_code = db.session.query(
                __import__('sqlalchemy').func.max(Event.event_code)
            ).filter(
                Event.event_code.like(f'EVT-{today}%')
            ).scalar()

            if max_code:
                try:
                    seq = int(max_code.split('-')[-1]) + 1
                except (ValueError, IndexError):
                    seq = 1
            else:
                seq = 1

            event_code = f"EVT-{today}-{seq:03d}"

            # 模板替换
            title = title_tpl
            description = desc_tpl
            for key, val in match.items():
                if isinstance(val, (dict, list)):
                    continue
                placeholder = f'{{{key}}}'
                title = title.replace(placeholder, str(val))
                description = description.replace(placeholder, str(val))
            description = description.replace('{time_window}', str(time_window))
            description = description.replace('{threshold}', str(parsed.get('threshold', '')))
            description = description.replace('{rule_name}', rule.name)

            # 获取匹配数据中的关键 IP 信息
            group_value = match.get('group_value', '')
            src_ip = group_value if _is_ip(group_value) else None
            if not src_ip and 'results' in match:
                for r in (match.get('results') or [])[:1]:
                    ip = r.get('src_ip') or r.get('group_value') or r.get('dst_ip')
                    if ip and _is_ip(str(ip)):
                        src_ip = str(ip)
                        break

            extra_data = {
                'event_type': 'rule_match',
                'rule_id': rule.id,
                'rule_name': rule.name,
                'rule_type': rule.type,
                'severity': severity,
                'matched_at': datetime.utcnow().isoformat(),
                'time_window': time_window,
                'start_time': start_time,
                'end_time': end_time,
                'match_details': _serialize_match(match)
            }
            if src_ip:
                extra_data['src_ip'] = src_ip
            link_ids = [str(a) for a in (alert_ids or []) if a]
            if link_ids:
                extra_data['alert_ids'] = link_ids
                extra_data['alert_count'] = len(link_ids)

            event = Event(
                event_code=event_code,
                title=title[:200],
                description=description[:2000],
                severity=severity,
                src_ip=src_ip,
                category='规则匹配',
                source='rule_engine',
                # 有关联告警时直接落「调查中」（与人工聚合同口径）
                status='investigating' if link_ids else 'new',
                extra_data=extra_data
            )

            if src_ip:
                event.raw_log = f'触发 IP: {src_ip}'

            db.session.add(event)
            db.session.flush()

            audit = AuditLog(
                user_id=1,
                username='rule_engine',
                action='规则生成事件',
                module='rules',
                target=event_code,
                details={'rule_id': rule.id, 'rule_name': rule.name, 'severity': severity},
                ip='127.0.0.1'
            )
            db.session.add(audit)
            db.session.commit()

            # 联动：命中的告警转 investigating + event_ids 回写（失败不影响事件落库）
            if link_ids:
                try:
                    from app.utils import event_alert_link
                    event_alert_link.link_alerts_to_event(
                        link_ids, event_code, 'investigating')
                except Exception as link_err:
                    logger.warning(f'规则事件 {event_code} 联动告警失败: {link_err}')

            # 自动触发剧本：失败只记日志，绝不回滚已落库的事件
            _trigger_playbook_for_event(event, rule)

            return event

        except Exception as e:
            db.session.rollback()
            logger.warning(f'规则 {getattr(rule, "id", "?")} 创建事件失败: {e}')
            return None


def _trigger_playbook_for_event(event, rule) -> None:
    """规则命中后按 rule.playbook_id 触发剧本（未配置 / 未发布则跳过）。"""
    playbook_id = getattr(rule, 'playbook_id', None)
    if not playbook_id:
        return
    try:
        from app.models import Playbook
        from app.engine.playbook_engine import playbook_engine as engine
        playbook = Playbook.query.get(playbook_id)
        if not playbook or playbook.status not in ('published', 'enabled'):
            return
        engine.execute(
            playbook=playbook,
            trigger_type='rule',
            event=event.to_dict(),
            alert=None,
            params={'rule_id': rule.id, 'event_code': event.event_code},
            executor='rule_engine',
            request_info={'user_id': 0, 'username': 'rule_engine', 'ip': '127.0.0.1'}
        )
    except Exception as e:
        logger.warning(f'规则 {getattr(rule, "id", "?")} 触发剧本失败: {e}')


def _is_ip(value: str) -> bool:
    """检查字符串是否为 IP 地址"""
    if not value:
        return False
    ipv4 = r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$'
    return bool(re.match(ipv4, str(value).strip()))


def _serialize_match(match: Dict) -> Dict:
    """序列化匹配结果, 处理不可 JSON 序列化的类型"""
    result = {}
    for key, val in match.items():
        if isinstance(val, (str, int, float, bool, type(None))):
            result[key] = val
        elif isinstance(val, (list, tuple)):
            result[key] = [_serialize_match(v) if isinstance(v, dict) else str(v) for v in val]
        elif isinstance(val, dict):
            result[key] = _serialize_match(val)
        else:
            result[key] = str(val)
    return result


# 全局引擎实例
rule_engine = RuleEngine()
