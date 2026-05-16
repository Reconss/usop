"""
规则评估引擎 - 对 TimescaleDB 中的解析日志执行检测规则

支持的规则类型:
- threshold: 时间窗口内计数超过阈值
- aggregation: 统计聚合 (count/sum/avg/distinct)
- correlation: 多条件关联检测
- sequence: 序列事件检测
- query: 自定义 SQL 查询

规则内容格式 (rule_content JSON):
{
    "conditions": [
        {"field": "src_ip", "operator": "not_in_list", "value": "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"},
        {"field": "action", "operator": "equals", "value": "blocked"},
        {"field": "log_type", "operator": "contains", "value": "WAF"}
    ],
    "time_window": "5 minutes",
    "threshold": 200,
    "group_by": "src_ip",
    "aggregation": "count",
    "severity": "high",
    "title_template": "{group_value} 在 {window} 内产生 {count} 次攻击",
    "description_template": "外部IP {group_value} 在 {time_window} 内触发了 {count} 次安全事件，超过阈值 {threshold}"
}
"""

import json
import re
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from app.database import db
from app.models import Event, DetectionRuleExtended, AuditLog, DataSource, FormatTemplate, DataTable
from app.timescaledb import get_tsdb


# ─── 条件解析 ────────────────────────────────────────────────

def _parse_time_window(window_str: str) -> timedelta:
    """解析时间窗口字符串, 返回 timedelta"""
    if not window_str:
        return timedelta(minutes=5)

    window_str = window_str.strip().lower()
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

# ─── 动态字段解析 ──────────────────────────────────────────────

def _resolve_datasource(ds_id_or_name):
    """通过 ID 或名称查找数据源"""
    try:
        ds = DataSource.query.get(int(ds_id_or_name))
        if ds:
            return ds
    except (ValueError, TypeError):
        pass
    return DataSource.query.filter_by(name=str(ds_id_or_name)).first()


FALLBACK_FIELDS = {
    'src_ip', 'dst_ip', 'src_port', 'dst_port', 'protocol',
    'hostname', 'username', 'action', 'result', 'log_type',
    'source_id'
}


def resolve_fields_for_sources(data_source_ids):
    """从数据源的 FormatTemplate 或 DataTable 解析允许的字段集合"""
    if not data_source_ids:
        return set(FALLBACK_FIELDS)

    fields = set()
    for ds_id in data_source_ids:
        ds = _resolve_datasource(ds_id)
        if not ds:
            continue

        resolved = False

        if ds.format_template_id:
            ft = FormatTemplate.query.get(ds.format_template_id)
            if ft and ft.fields:
                for f in ft.fields:
                    fname = f.get('name') or f.get('field')
                    if fname:
                        fields.add(fname)
                resolved = True

        if not resolved and ds.log_type_id:
            dt = DataTable.query.filter_by(log_type_id=ds.log_type_id).first()
            if dt and dt.columns:
                for c in dt.columns:
                    cname = c.get('name') or c.get('field')
                    if cname:
                        fields.add(cname)
                resolved = True

        if not resolved:
            fields.update(FALLBACK_FIELDS)

    return fields if fields else set(FALLBACK_FIELDS)


def _build_condition_clause(conditions, params,
                            param_prefix='cond',
                            data_source_ids=None):
    """构建 SQL WHERE 条件子句"""
    if not conditions:
        return '1=1', params

    clauses = []
    for i, cond in enumerate(conditions):
        field = cond.get('field', '')
        operator = cond.get('operator', 'equals')
        value = cond.get('value', '')

        # 字段名白名单, 防止 SQL 注入
        allowed_fields = resolve_fields_for_sources(data_source_ids) if data_source_ids else FALLBACK_FIELDS
        if field not in allowed_fields:
            continue

        param_name = f'{param_prefix}_{i}'
        col = field

        if operator == 'equals':
            clauses.append(f"{col} = :{param_name}")
            params[param_name] = str(value)
        elif operator == 'not_equals':
            clauses.append(f"{col} != :{param_name}")
            params[param_name] = str(value)
        elif operator == 'contains':
            clauses.append(f"{col}::text ILIKE :{param_name}")
            params[param_name] = f'%{value}%'
        elif operator == 'not_contains':
            clauses.append(f"{col}::text NOT ILIKE :{param_name}")
            params[param_name] = f'%{value}%'
        elif operator == 'starts_with':
            clauses.append(f"{col}::text ILIKE :{param_name}")
            params[param_name] = f'{value}%'
        elif operator == 'ends_with':
            clauses.append(f"{col}::text ILIKE :{param_name}")
            params[param_name] = f'%{value}'
        elif operator == 'greater_than':
            clauses.append(f"{col}::numeric > :{param_name}")
            params[param_name] = value
        elif operator == 'less_than':
            clauses.append(f"{col}::numeric < :{param_name}")
            params[param_name] = value
        elif operator == 'in_list':
            vals = [v.strip() for v in str(value).split(',')]
            placeholders = [f':{param_name}_{j}' for j in range(len(vals))]
            clauses.append(f"{col} IN ({', '.join(placeholders)})")
            for j, v in enumerate(vals):
                params[f'{param_name}_{j}'] = v
        elif operator == 'not_in_list':
            vals = [v.strip() for v in str(value).split(',')]
            placeholders = [f':{param_name}_{j}' for j in range(len(vals))]
            clauses.append(f"{col} NOT IN ({', '.join(placeholders)})")
            for j, v in enumerate(vals):
                params[f'{param_name}_{j}'] = v
        elif operator == 'is_empty':
            clauses.append(f"({col} IS NULL OR {col}::text = '')")
        elif operator == 'is_not_empty':
            clauses.append(f"({col} IS NOT NULL AND {col}::text != '')")
        elif operator == 'regex_match':
            clauses.append(f"{col}::text ~ :{param_name}")
            params[param_name] = value

    if not clauses:
        return '1=1', params

    return ' AND '.join(clauses), params


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
    """规则评估引擎"""

    def __init__(self):
        self.results = []

    def evaluate_rule(self, rule: DetectionRuleExtended) -> Dict:
        """评估单条规则"""
        parsed = parse_rule_content(rule)

        rule_type = rule.type or parsed.get('type', 'threshold')

        if rule_type == 'threshold':
            return self._evaluate_threshold(rule, parsed)
        elif rule_type == 'aggregation':
            return self._evaluate_aggregation(rule, parsed)
        elif rule_type == 'correlation':
            return self._evaluate_correlation(rule, parsed)
        elif rule_type == 'query':
            return self._evaluate_query(rule, parsed)
        else:
            return self._evaluate_threshold(rule, parsed)

    def evaluate_rule_on_storage(self, rule, max_samples=10, time_range_minutes=None):
        """Evaluate rule by querying data source storage tables directly"""
        from sqlalchemy import text
        parsed = parse_rule_content(rule)
        conditions = parsed.get('conditions', [])
        now = datetime.utcnow()

        if time_range_minutes:
            start_time = now - timedelta(minutes=time_range_minutes)
        else:
            time_window_str = parsed.get('time_window', '5 minutes')
            window = _parse_time_window(time_window_str)
            start_time = now - window

        ds_ids = rule.data_source_ids or []
        sources = {}
        total_matched = 0

        for ds_id in ds_ids:
            ds = _resolve_datasource(ds_id)
            if not ds or not ds.storage_table_name:
                continue

            table = ds.storage_table_name
            tsdb = get_tsdb()
            session = tsdb.get_session()
            try:
                params = {'start_time': start_time.isoformat(), 'end_time': now.isoformat()}
                where_clause, params = _build_condition_clause(
                    conditions, params, f'ds{ds_id}',
                    data_source_ids=[ds_id]
                )

                count_sql = text(f"""
                    SELECT COUNT(*) FROM {table}
                    WHERE timestamp >= :start_time AND timestamp <= :end_time AND ({where_clause})
                """)
                count = session.execute(count_sql, params).scalar() or 0

                sample_params = {**params, 'limit': max_samples}
                sample_sql = text(f"""
                    SELECT * FROM {table}
                    WHERE timestamp >= :start_time AND timestamp <= :end_time AND ({where_clause})
                    ORDER BY timestamp DESC LIMIT :limit
                """)
                samples = session.execute(sample_sql, sample_params)
                sample_rows = [dict(r._mapping) for r in samples]

                sources[str(ds_id)] = {
                    'data_source_id': ds.id,
                    'data_source_name': ds.name,
                    'storage_table': table,
                    'matched_count': count,
                    'samples': sample_rows
                }
                total_matched += count
            except Exception as e:
                sources[str(ds_id)] = {
                    'data_source_id': ds.id,
                    'data_source_name': ds.name,
                    'error': str(e)
                }
            finally:
                tsdb.close_session(session)

        return {
            'rule_id': rule.id,
            'rule_name': rule.name,
            'matched': total_matched > 0,
            'total_matched': total_matched,
            'sources': sources,
            'evaluated_at': now.isoformat()
        }

    def _evaluate_threshold(self, rule: DetectionRuleExtended, parsed: Dict) -> Dict:
        """评估阈值规则

        rule_content 格式:
        {
            "conditions": [{"field": "action", "operator": "equals", "value": "blocked"}],
            "time_window": "5 minutes",
            "threshold": 200,
            "group_by": "src_ip",
            "severity": "high",
            "title_template": "...",
            "description_template": "..."
        }
        """
        conditions = parsed.get('conditions', [])
        time_window_str = parsed.get('time_window', '5 minutes')
        threshold = int(parsed.get('threshold', 1))
        group_by = parsed.get('group_by', '')
        severity = parsed.get('severity', rule.severity or 'medium')
        title_tpl = parsed.get('title_template', f'规则 {rule.name} 触发')
        desc_tpl = parsed.get('description_template', '')

        window = _parse_time_window(time_window_str)
        now = datetime.utcnow()
        start_time = now - window

        tsdb = get_tsdb()
        session = tsdb.get_session()

        try:
            params = {
                'start_time': start_time.isoformat(),
                'end_time': now.isoformat(),
                'threshold': threshold
            }

            where_clause, params = _build_condition_clause(conditions, params, data_source_ids=rule.data_source_ids or None)

            if group_by:
                # 分组计数查询
                query = f"""
                    SELECT {group_by} as group_value, COUNT(*) as cnt
                    FROM parsed_logs
                    WHERE timestamp >= :start_time
                      AND timestamp <= :end_time
                      AND ({where_clause})
                    GROUP BY {group_by}
                    HAVING COUNT(*) >= :threshold
                    ORDER BY cnt DESC
                    LIMIT 50
                """
            else:
                # 整体计数查询
                query = f"""
                    SELECT COUNT(*) as cnt
                    FROM parsed_logs
                    WHERE timestamp >= :start_time
                      AND timestamp <= :end_time
                      AND ({where_clause})
                """

            result = session.execute(
                __import__('sqlalchemy').text(query), params
            )

            matches = []
            rows = result.fetchall()

            if group_by:
                for row in rows:
                    group_val = str(row[0]) if row[0] else 'unknown'
                    count = int(row[1])
                    matches.append({
                        'group_value': group_val,
                        'count': count,
                        'threshold': threshold,
                        'exceeded': count >= threshold
                    })
            else:
                for row in rows:
                    count = int(row[0])
                    matches.append({
                        'count': count,
                        'threshold': threshold,
                        'exceeded': count >= threshold
                    })

            # 生成事件
            events_created = []
            if matches:
                for match in matches:
                    if match.get('exceeded', True):
                        event = self._create_event_from_match(
                            rule, match, parsed,
                            start_time.isoformat(), now.isoformat()
                        )
                        if event:
                            events_created.append(event.to_dict())

            # 更新规则命中
            if matches:
                rule.hit_count = (rule.hit_count or 0) + 1
                rule.last_hit_time = now
                db.session.commit()

            return {
                'rule_id': rule.id,
                'rule_name': rule.name,
                'matched': len(matches) > 0,
                'match_count': len(matches),
                'matches': matches,
                'events_created': events_created,
                'time_window': time_window_str,
                'evaluated_at': now.isoformat()
            }

        except Exception as e:
            db.session.rollback()
            return {
                'rule_id': rule.id,
                'rule_name': rule.name,
                'matched': False,
                'error': str(e),
                'evaluated_at': now.isoformat()
            }
        finally:
            tsdb.close_session(session)

    def _evaluate_aggregation(self, rule: DetectionRuleExtended, parsed: Dict) -> Dict:
        """评估聚合规则 - 统计聚合 (sum/avg/distinct_count)"""
        aggregation = parsed.get('aggregation', 'count')
        agg_field = parsed.get('agg_field', '*')
        conditions = parsed.get('conditions', [])

        window = _parse_time_window(parsed.get('time_window', '15 minutes'))
        now = datetime.utcnow()
        start_time = now - window

        tsdb = get_tsdb()
        session = tsdb.get_session()

        try:
            params = {
                'start_time': start_time.isoformat(),
                'end_time': now.isoformat()
            }
            where_clause, params = _build_condition_clause(conditions, params, data_source_ids=rule.data_source_ids or None)

            if aggregation == 'distinct_count':
                agg_expr = f'COUNT(DISTINCT {agg_field})'
            elif aggregation == 'sum':
                agg_expr = f'SUM({agg_field}::numeric)'
            elif aggregation == 'avg':
                agg_expr = f'AVG({agg_field}::numeric)'
            else:
                agg_expr = f'COUNT({agg_field})'

            group_by = parsed.get('group_by', '')
            group_clause = f'GROUP BY {group_by}' if group_by else ''

            query = f"""
                SELECT {group_by + ',' if group_by else ''} {agg_expr} as agg_value
                FROM parsed_logs
                WHERE timestamp >= :start_time
                  AND timestamp <= :end_time
                  AND ({where_clause})
                {group_clause}
                ORDER BY agg_value DESC
                LIMIT 20
            """

            result = session.execute(
                __import__('sqlalchemy').text(query), params
            )

            matches = []
            for row in result.fetchall():
                if group_by:
                    matches.append({
                        'group_value': str(row[0]),
                        'agg_value': float(row[1]) if row[1] else 0
                    })
                else:
                    matches.append({
                        'agg_value': float(row[0]) if row[0] else 0
                    })

            return {
                'rule_id': rule.id,
                'rule_name': rule.name,
                'matched': len(matches) > 0,
                'aggregation': aggregation,
                'results': matches,
                'time_window': parsed.get('time_window', '15 minutes'),
                'evaluated_at': now.isoformat()
            }
        except Exception as e:
            return {
                'rule_id': rule.id,
                'rule_name': rule.name,
                'matched': False,
                'error': str(e),
                'evaluated_at': now.isoformat()
            }
        finally:
            tsdb.close_session(session)

    def _evaluate_correlation(self, rule: DetectionRuleExtended, parsed: Dict) -> Dict:
        """评估关联规则 - 多条件从不同数据源匹配"""
        rules = parsed.get('rules', [])
        window = _parse_time_window(parsed.get('time_window', '30 minutes'))
        operator = parsed.get('correlation_operator', 'and')  # and / or
        now = datetime.utcnow()
        start_time = now - window

        tsdb = get_tsdb()
        session = tsdb.get_session()

        try:
            sub_results = []
            all_matched = True
            any_matched = False

            for i, sub_rule in enumerate(rules):
                conditions = sub_rule.get('conditions', [])
                params = {
                    'start_time': start_time.isoformat(),
                    'end_time': now.isoformat()
                }
                where_clause, params = _build_condition_clause(conditions, params, f'sr{i}', data_source_ids=rule.data_source_ids or None)

                query = f"""
                    SELECT COUNT(*) as cnt
                    FROM parsed_logs
                    WHERE timestamp >= :start_time
                      AND timestamp <= :end_time
                      AND ({where_clause})
                """
                result = session.execute(
                    __import__('sqlalchemy').text(query), params
                )
                count = result.scalar() or 0
                sub_matched = count > 0
                sub_results.append({
                    'rule_index': i,
                    'matched': sub_matched,
                    'count': count,
                    'conditions': conditions
                })

                if not sub_matched:
                    all_matched = False
                if sub_matched:
                    any_matched = True

            if operator == 'and':
                matched = all_matched
            elif operator == 'or':
                matched = any_matched
            else:
                matched = all_matched

            events_created = []
            if matched:
                event = self._create_event_from_match(
                    rule,
                    {'correlation_matched': True, 'sub_results': sub_results},
                    parsed,
                    start_time.isoformat(),
                    now.isoformat()
                )
                if event:
                    events_created.append(event.to_dict())

            return {
                'rule_id': rule.id,
                'rule_name': rule.name,
                'matched': matched,
                'sub_results': sub_results,
                'events_created': events_created,
                'time_window': parsed.get('time_window', '30 minutes'),
                'evaluated_at': now.isoformat()
            }
        except Exception as e:
            return {
                'rule_id': rule.id,
                'rule_name': rule.name,
                'matched': False,
                'error': str(e),
                'evaluated_at': now.isoformat()
            }
        finally:
            tsdb.close_session(session)

    def _evaluate_query(self, rule: DetectionRuleExtended, parsed: Dict) -> Dict:
        """评估自定义 SQL 查询规则"""
        sql = parsed.get('sql', '')
        if not sql and rule.rule_content:
            sql = rule.rule_content.strip()

        if not sql:
            return {
                'rule_id': rule.id,
                'rule_name': rule.name,
                'matched': False,
                'error': '未定义 SQL 查询',
                'evaluated_at': datetime.utcnow().isoformat()
            }

        tsdb = get_tsdb()
        session = tsdb.get_session()

        try:
            result = session.execute(__import__('sqlalchemy').text(sql), {
                'now': datetime.utcnow().isoformat(),
                'rule_id': rule.id
            })

            rows = result.fetchall()
            columns = result.keys() if rows else []

            results = []
            for row in rows[:100]:
                results.append(dict(zip(columns, row)))

            matched = len(results) > 0
            events_created = []
            if matched and parsed.get('auto_create_event', True):
                event = self._create_event_from_match(
                    rule,
                    {'query_results': results[:5], 'total_rows': len(results)},
                    parsed,
                    '', ''
                )
                if event:
                    events_created.append(event.to_dict())

            return {
                'rule_id': rule.id,
                'rule_name': rule.name,
                'matched': matched,
                'row_count': len(results),
                'results': results[:10],
                'events_created': events_created,
                'evaluated_at': datetime.utcnow().isoformat()
            }
        except Exception as e:
            return {
                'rule_id': rule.id,
                'rule_name': rule.name,
                'matched': False,
                'error': str(e),
                'evaluated_at': datetime.utcnow().isoformat()
            }
        finally:
            tsdb.close_session(session)

    def _create_event_from_match(self, rule: DetectionRuleExtended,
                                  match: Dict, parsed: Dict,
                                  start_time: str, end_time: str) -> Optional[Event]:
        """根据规则匹配结果创建事件"""
        try:
            title_tpl = parsed.get('title_template', f'规则 "{rule.name}" 触发')
            desc_tpl = parsed.get('description_template', rule.description or '')
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

            event = Event(
                event_code=event_code,
                title=title[:200],
                description=description[:2000],
                severity=severity,
                category='规则匹配',
                source='rule_engine',
                status='new',
                extra_data=extra_data
            )

            if src_ip:
                event.raw_log = f'触发 IP: {src_ip}'

            db.session.add(event)
            db.session.flush()

            # 记录审计日志
            audit = AuditLog(
                user_id=1,
                username='rule_engine',
                action='规则生成事件',
                module='rules',
                target=event_code,
                details={
                    'rule_id': rule.id,
                    'rule_name': rule.name,
                    'severity': severity
                },
                ip='127.0.0.1'
            )
            db.session.add(audit)
            db.session.commit()

            return event
        except Exception:
            db.session.rollback()
            return None

    def evaluate_all_enabled(self) -> Dict:
        """评估所有启用的规则"""
        rules = DetectionRuleExtended.query.filter(
            DetectionRuleExtended.status == 'enabled'
        ).all()

        results = []
        events_total = 0
        for rule in rules:
            result = self.evaluate_rule(rule)
            results.append(result)
            events_total += len(result.get('events_created', []))

        return {
            'total_rules': len(rules),
            'evaluated': len(results),
            'events_created': events_total,
            'results': results,
            'evaluated_at': datetime.utcnow().isoformat()
        }


def _is_ip(value: str) -> bool:
    """检查字符串是否为 IP 地址"""
    if not value:
        return False
    import re as _re
    ipv4 = r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$'
    return bool(_re.match(ipv4, str(value).strip()))


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
