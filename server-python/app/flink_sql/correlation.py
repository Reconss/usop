"""关联分析 Flink SQL 生成器。

把 PG 里的关联规则（correlation_rules）翻译成 Flink SQL 脚本：
  Kafka(valid-alerts) → 滑动窗口聚合 → 阈值判定 → JDBC sink 写入 PG events 表

支持四类「常规分析手段」：
  frequency    频次阈值
  distinct     去重计数
  aggregation  聚合统计（sum/avg/max/min）
  sequence     时序关联（先 A 后 B）

⚠️ 窗口使用 **处理时间（PROCTIME）**：
   源数据里 first_seen 是 ISO-8601 且带 'Z' 的字符串，Flink JSON 反序列化器
   无法直接把它转成 TIMESTAMP(3)（实测解析结果为 NULL），若用事件时间会导致
   全部数据被水位线丢弃。处理时间不依赖字段解析，行为稳定可预期。
"""
import os
import re

# ==================== 源 / 目标 ====================

_SRC_TABLE = 'corr_src'
_SINK_TABLE = 'corr_events'


def _pg_from_env():
    """从 DATABASE_URL 解出 JDBC 连接串（不知道就退回 compose 默认值）。"""
    url = os.getenv('DATABASE_URL', '')
    m = re.match(r'^postgresql(?:\+\w+)?://([^:]+):([^@]*)@([^:/]+):(\d+)/(.+)$', url or '')
    if m:
        user, pwd, host, port, db = m.groups()
    else:
        host = os.getenv('PG_HOST', 'postgres')
        port = os.getenv('PG_PORT', '5432')
        db = os.getenv('PG_DB', 'usop_security')
        user = os.getenv('PG_USER', 'usop')
        pwd = os.getenv('PG_PASSWORD', 'usop_password')
    # stringtype=unspecified：让 PG 把字符串参数按列类型隐式转换，
    # 否则写 json 列（extra_data）会报 "column is of type json but expression is of type character varying"
    return f'jdbc:postgresql://{host}:{port}/{db}?stringtype=unspecified', user, pwd


# 可参与分组/过滤/聚合的字段（与 JS 端 FIELD_CATALOG 保持一致）
STRING_FIELDS = [
    'alert_code', 'title', 'severity', 'category', 'source', 'source_product',
    'source_type', 'src_ip', 'dst_ip', 'protocol', 'hostname', 'username', 'operation',
]
NUMERIC_FIELDS = ['src_port', 'dst_port', 'confidence']
ALL_FIELDS = STRING_FIELDS + NUMERIC_FIELDS

FIELD_LABELS = {
    'alert_code': '告警编号', 'title': '告警标题', 'severity': '严重等级',
    'category': '告警分类', 'source': '告警来源', 'source_product': '来源产品',
    'source_type': '来源类型', 'src_ip': '源 IP', 'dst_ip': '目的 IP',
    'protocol': '协议', 'hostname': '主机名', 'username': '用户名',
    'operation': '操作', 'src_port': '源端口', 'dst_port': '目的端口',
    'confidence': '置信度',
}

ANALYSIS_TYPES = ['frequency', 'distinct', 'aggregation', 'sequence']
ANALYSIS_LABELS = {
    'frequency': '频次阈值',
    'distinct': '去重计数',
    'aggregation': '聚合统计',
    'sequence': '时序关联',
}
ANALYSIS_HINTS = {
    'frequency': '同一分组在窗口内出现次数 ≥ 阈值（如：同源 IP 5 分钟内触发 10 次告警）',
    'distinct': '同一分组在窗口内命中的**不同**取值数 ≥ 阈值（如：同源 IP 命中 3 个不同规则）',
    'aggregation': '窗口内数值字段聚合值达到阈值（如：目的端口 SUM ≥ 1000）',
    'sequence': '窗口内同时出现阶段 A 与阶段 B（基于处理时间窗口，不做严格先后排序）',
}
AGG_FUNCS = ['sum', 'avg', 'max', 'min']
STRING_OPS = ['eq', 'ne', 'contains', 'not_contains', 'regex']
NUMERIC_OPS = ['gt', 'gte', 'lt', 'lte', 'eq', 'ne']
FILTER_OPS = ['eq', 'ne', 'contains', 'not_contains', 'regex', 'gt', 'gte', 'lt', 'lte']
OP_LABELS = {
    'eq': '等于', 'ne': '不等于', 'contains': '包含', 'not_contains': '不包含',
    'regex': '正则匹配', 'gt': '大于', 'gte': '大于等于', 'lt': '小于', 'lte': '小于等于',
}

_WINDOW_MIN = 5
_WINDOW_MAX = 86400


# ==================== 基础工具 ====================

def quote_ident(name):
    """Flink SQL 标识符：一律加反引号，规避 source/timestamp 等关键字冲突。"""
    return '`' + str(name).replace('`', '') + '`'


def string_lit(value):
    return "'" + str(value).replace("'", "''") + "'"


def number_lit(value):
    try:
        return repr(float(value))
    except (TypeError, ValueError):
        raise ValueError(f'不是合法数字：{value!r}')


def _field(name):
    if name not in ALL_FIELDS:
        raise ValueError(f'不支持的字段：{name}')
    return quote_ident(name)


def build_condition(field, operator, value):
    """把 (字段, 操作符, 值) 翻成 SQL 条件表达式。"""
    if field not in ALL_FIELDS:
        raise ValueError(f'不支持的字段：{field}')
    expr = quote_ident(field)
    if operator in ('eq', 'ne'):
        if field in NUMERIC_FIELDS:
            sym = '=' if operator == 'eq' else '<>'
            return f'{expr} {sym} {number_lit(value)}'
        sym = '=' if operator == 'eq' else '<>'
        return f'{expr} {sym} {string_lit(value)}'
    if operator == 'contains':
        return f'{expr} LIKE {string_lit("%" + str(value) + "%")}'
    if operator == 'not_contains':
        return f'{expr} NOT LIKE {string_lit("%" + str(value) + "%")}'
    if operator == 'regex':
        return f'{expr} RLIKE {string_lit(value)}'
    if operator in ('gt', 'gte', 'lt', 'lte'):
        sym = {'gt': '>', 'gte': '>=', 'lt': '<', 'lte': '<='}[operator]
        return f'CAST({expr} AS DOUBLE) {sym} {number_lit(value)}'
    raise ValueError(f'不支持的操作符：{operator}')


def build_filter(config, rule_name=''):
    """前置筛选条件（AND 连接）。config['filter'] = [{field, operator, value}, …]"""
    parts = []
    for cond in (config or {}).get('filter') or []:
        if not cond or not cond.get('field'):
            continue
        parts.append(build_condition(cond['field'], cond.get('operator', 'eq'), cond.get('value', '')))
    return ' AND '.join(parts)


# ==================== DDL ====================

def source_ddl(topic='valid-alerts'):
    """Kafka 源表。PROCTIME 作为窗口时间属性。"""
    return f"""CREATE TABLE {_SRC_TABLE} (
  `alert_id`       STRING,
  `alert_code`     STRING,
  `title`          STRING,
  `description`    STRING,
  `severity`       STRING,
  `category`       STRING,
  `source`         STRING,
  `source_product` STRING,
  `source_type`    STRING,
  `src_ip`         STRING,
  `dst_ip`         STRING,
  `src_port`       INT,
  `dst_port`       INT,
  `protocol`       STRING,
  `hostname`       STRING,
  `username`       STRING,
  `operation`      STRING,
  `confidence`     DOUBLE,
  `first_seen`     STRING,  -- ISO-8601 事件时间：sequence 时序判定用（PROCTIME 时间属性不能参与普通聚合）
  `proc_time`      AS PROCTIME()
) WITH (
  'connector' = 'kafka',
  'topic' = '{topic}',
  'properties.bootstrap.servers' = '{os.getenv("KAFKA_BOOTSTRAP", "kafka:29092")}',
  'properties.group.id' = 'usop-flink-correlation',
  'scan.startup.mode' = 'latest-offset',
  'format' = 'json',
  'json.ignore-parse-errors' = 'true',
  'json.fail-on-missing-field' = 'false'
)"""


def sink_ddl():
    """PG events 表 JDBC sink。"""
    jdbc_url, user, pwd = _pg_from_env()
    return f"""CREATE TABLE {_SINK_TABLE} (
  `event_code`  STRING,
  `title`       STRING,
  `description` STRING,
  `severity`    STRING,
  `category`    STRING,
  `source`      STRING,
  `status`      STRING,
  `src_ip`      STRING,
  `raw_log`     STRING,
  `extra_data`  STRING,
  `timestamp`   TIMESTAMP(3),
  `created_at`  TIMESTAMP(3),
  `updated_at`  TIMESTAMP(3)
) WITH (
  'connector' = 'jdbc',
  'url' = '{jdbc_url}',
  'table-name' = 'events',
  'username' = '{user}',
  'password' = '{pwd}',
  'sink.buffer-flush.max-rows' = '1',
  'sink.buffer-flush.interval' = '2s',
  'sink.max-retries' = '3'
)"""


def interval_literal(seconds):
    """把秒数转成**合法的** Flink 区间字面量。

    ⚠️ Flink 的 `INTERVAL 'n' SECOND` 默认精度只有 2 位（SECOND(2)），
    `INTERVAL '120' SECOND`、`INTERVAL '3600' SECOND(4)`、`INTERVAL '150' MINUTE`
    都会报 “exceeds precision”。因此按单位择优：
      整时  → INTERVAL 'n' HOUR
      整分且 ≤99 分钟 → INTERVAL 'n' MINUTE
      <1000 秒 → INTERVAL 'n' SECOND(位数)
    """
    s = int(seconds)
    if s <= 0:
        raise ValueError('窗口必须为正整数秒')
    if s % 3600 == 0:
        return f"INTERVAL '{s // 3600}' HOUR"
    if s % 60 == 0 and s // 60 <= 99:
        return f"INTERVAL '{s // 60}' MINUTE"
    if s < 1000:
        return f"INTERVAL '{s}' SECOND({max(1, len(str(s)))})"
    raise ValueError(
        f'窗口 {s} 秒无法表示：请用整时、≤99 的整分，或小于 1000 秒的值'
        f'（如 30、45、60、300、600、1800、3600）')


# ==================== 规则校验 ====================

def validate_rule(rule):
    """返回错误信息列表（空列表 = 合法）。rule 为 dict（来自 API 或模型）。"""
    errs = []
    atype = rule.get('analysis_type') or 'frequency'
    if atype not in ANALYSIS_TYPES:
        errs.append(f'分析手段不支持：{atype}')
    name = (rule.get('name') or '').strip()
    if not name:
        errs.append('规则名称不能为空')
    field = rule.get('field')
    if not field or field not in ALL_FIELDS:
        errs.append(f'分组字段不支持：{field}')
    try:
        win = int(rule.get('window_seconds') or 0)
        if win < _WINDOW_MIN or win > _WINDOW_MAX:
            errs.append(f'窗口需在 {_WINDOW_MIN}~{_WINDOW_MAX} 秒之间')
        else:
            # 提前把「Flink 区间字面量无法表示」的情况拦在保存阶段
            interval_literal(win)
    except (TypeError, ValueError) as e:
        errs.append(str(e) if '无法表示' in str(e) else '窗口需为整数秒')
    # 阈值：frequency/distinct/aggregation 必需；sequence 由「先 A 后 B」判定，阈值无意义
    thr = rule.get('threshold')
    if thr is None:
        if atype != 'sequence':
            errs.append('阈值不能为空')
    else:
        try:
            float(thr)
        except (TypeError, ValueError):
            errs.append('阈值需为数字')

    cfg = rule.get('config') or {}
    if atype == 'distinct':
        cf = cfg.get('count_field')
        if not cf:
            errs.append('「去重计数」需要选择去重统计字段（如 alert_code、dst_port）')
        elif cf not in ALL_FIELDS:
            errs.append(f'去重统计字段不支持：{cf}；可选：{"、".join(STRING_FIELDS[:8])} 等')
    if atype == 'aggregation':
        af = cfg.get('agg_field')
        if not af:
            errs.append('「聚合统计」需要选择聚合字段（数值字段）')
        elif af not in NUMERIC_FIELDS:
            errs.append(f'聚合字段需为数值字段（{"、".join(NUMERIC_FIELDS)}），当前为：{af}')
        if (cfg.get('agg_func') or 'sum').lower() not in AGG_FUNCS:
            errs.append(f'聚合函数不支持：{cfg.get("agg_func")}；可选：{"、".join(AGG_FUNCS)}')
    if atype == 'sequence':
        for slot in ('a', 'b'):
            label = 'A' if slot == 'a' else 'B'
            sf = cfg.get(f'match_{slot}_field')
            if not sf:
                errs.append(f'「时序关联」需要选择阶段 {label} 的匹配字段')
            elif sf not in ALL_FIELDS:
                errs.append(f'时序阶段 {label} 的字段不支持：{sf}')
    for op in {c.get('operator') for c in (cfg.get('filter') or []) if c}:
        if op and op not in FILTER_OPS:
            errs.append(f'筛选操作符不支持：{op}')
    return errs


# ==================== 事件字段表达式 ====================

def _event_code_expr(rule_id):
    """事件编号：CE{id}-{窗口起 yyMMddHHmm}-{分组短哈希}，长度 ≤ 30（events.event_code 是 varchar(30)）。"""
    return (
        f"CONCAT('CE', CAST({int(rule_id)} AS STRING), '-', "
        f"DATE_FORMAT(`w_start`, 'yyMMddHHmm'), '-', "
        f"SUBSTR(MD5(CAST(`grp` AS STRING)), 1, 4))"
    )


def _window_note(window_seconds):
    return f'{window_seconds} 秒窗口'


def _src_ip_expr(gfield):
    """事件主责源 IP：
    规则按 src_ip 分组时直接取分组值；按其它字段（dst_ip/hostname/...）分组时
    取窗口内的一条样本源 IP，保证事件详情「源IP」不为空。
    依赖子查询输出 `sample_src_ip`。
    """
    if gfield == 'src_ip':
        return 'CAST(`grp` AS STRING)'
    return 'CAST(`sample_src_ip` AS STRING)'


def _sample_src_ip_line(comma=True):
    """子查询里取样本源 IP 的一行；放在 SELECT 列表末尾时 comma=False。"""
    return "    MIN(`src_ip`)     AS `sample_src_ip`" + ("," if comma else "")


# ==================== 四类规则 → INSERT ====================

def _insert_frequency(rule, rid_in_sql):
    cfg = rule.get('config') or {}
    win, thr = int(rule['window_seconds']), float(rule['threshold'])
    wind = interval_literal(win)
    gfield = rule['field']
    extra_where = build_filter(cfg, rule.get('name'))
    where = f'WHERE `{gfield}` IS NOT NULL'
    if extra_where:
        where += f' AND {extra_where}'
    label = FIELD_LABELS.get(gfield, gfield)
    return f"""INSERT INTO {_SINK_TABLE}
SELECT
  {_event_code_expr(rid_in_sql)},
  {string_lit(rule.get('event_title') or rule['name'])},
  CONCAT({string_lit(f'关联分析「{rule["name"]}」：')}, {string_lit(label)}, ' = ',
         COALESCE(CAST(`grp` AS STRING), '-'), ' 在 {_window_note(win)}内触发 ',
         CAST(`hit_cnt` AS STRING), ' 次（阈值 ', CAST({thr} AS STRING), '）；样本告警 ',
         COALESCE(`sample_code`, '-'), ' / ', COALESCE(`sample_title`, '-')),
  {string_lit(rule.get('severity') or 'high')},
  {string_lit(rule.get('event_category') or 'correlation')},
  'flink-correlation', 'new', {_src_ip_expr(gfield)},
  CONCAT('rule_id=', CAST({int(rid_in_sql)} AS STRING), '; type=frequency; group=', {string_lit(gfield)},
         '; window_start=', CAST(`w_start` AS STRING), '; window_end=', CAST(`w_end` AS STRING),
         '; count=', CAST(`hit_cnt` AS STRING), '; threshold=', CAST({thr} AS STRING)),
  CAST(NULL AS STRING),
  `w_end`, `w_end`, `w_end`
FROM (
  SELECT
    TUMBLE_START(`proc_time`, {wind}) AS `w_start`,
    TUMBLE_END(`proc_time`, {wind})   AS `w_end`,
    {quote_ident(gfield)} AS `grp`,
    COUNT(*)             AS `hit_cnt`,
{_sample_src_ip_line()}
    MIN(`alert_code`)    AS `sample_code`,
    MIN(`title`)         AS `sample_title`
  FROM {_SRC_TABLE}
  {where}
  GROUP BY TUMBLE(`proc_time`, {wind}), {quote_ident(gfield)}
)
WHERE `hit_cnt` >= {thr}"""


def _insert_distinct(rule, rid_in_sql):
    cfg = rule.get('config') or {}
    win, thr = int(rule['window_seconds']), float(rule['threshold'])
    wind = interval_literal(win)
    gfield = rule['field']
    cfield = cfg.get('count_field') or 'alert_code'
    extra_where = build_filter(cfg, rule.get('name'))
    where = f'WHERE `{gfield}` IS NOT NULL AND `{cfield}` IS NOT NULL'
    if extra_where:
        where += f' AND {extra_where}'
    label = FIELD_LABELS.get(gfield, gfield)
    clabel = FIELD_LABELS.get(cfield, cfield)
    return f"""INSERT INTO {_SINK_TABLE}
SELECT
  {_event_code_expr(rid_in_sql)},
  {string_lit(rule.get('event_title') or rule['name'])},
  CONCAT({string_lit(f'关联分析「{rule["name"]}」：')}, {string_lit(label)}, ' = ',
         COALESCE(CAST(`grp` AS STRING), '-'), ' 在 {_window_note(win)}内命中 ',
         CAST(`hit_cnt` AS STRING), ' 个不同的 ', {string_lit(clabel)}, '（阈值 ', CAST({thr} AS STRING), '）'),
  {string_lit(rule.get('severity') or 'high')},
  {string_lit(rule.get('event_category') or 'correlation')},
  'flink-correlation', 'new', {_src_ip_expr(gfield)},
  CONCAT('rule_id=', CAST({int(rid_in_sql)} AS STRING), '; type=distinct; group=', {string_lit(gfield)},
         '; distinct_field=', {string_lit(cfield)}, '; window_start=', CAST(`w_start` AS STRING),
         '; window_end=', CAST(`w_end` AS STRING), '; distinct_count=', CAST(`hit_cnt` AS STRING),
         '; threshold=', CAST({thr} AS STRING)),
  CAST(NULL AS STRING),
  `w_end`, `w_end`, `w_end`
FROM (
  SELECT
    TUMBLE_START(`proc_time`, {wind}) AS `w_start`,
    TUMBLE_END(`proc_time`, {wind})   AS `w_end`,
    {quote_ident(gfield)} AS `grp`,
    COUNT(DISTINCT {quote_ident(cfield)}) AS `hit_cnt`,
{_sample_src_ip_line(comma=False)}
  FROM {_SRC_TABLE}
  {where}
  GROUP BY TUMBLE(`proc_time`, {wind}), {quote_ident(gfield)}
)
WHERE `hit_cnt` >= {thr}"""


def _insert_aggregation(rule, rid_in_sql):
    cfg = rule.get('config') or {}
    win, thr = int(rule['window_seconds']), float(rule['threshold'])
    wind = interval_literal(win)
    gfield = rule['field']
    fn = (cfg.get('agg_func') or 'sum').lower()
    afield = cfg.get('agg_field') or 'confidence'
    cmp_op = '<=' if cfg.get('compare') == 'lte' else '>='
    extra_where = build_filter(cfg, rule.get('name'))
    where = f'WHERE `{gfield}` IS NOT NULL AND `{afield}` IS NOT NULL'
    if extra_where:
        where += f' AND {extra_where}'
    label = FIELD_LABELS.get(gfield, gfield)
    alabel = FIELD_LABELS.get(afield, afield)
    return f"""INSERT INTO {_SINK_TABLE}
SELECT
  {_event_code_expr(rid_in_sql)},
  {string_lit(rule.get('event_title') or rule['name'])},
  CONCAT({string_lit(f'关联分析「{rule["name"]}」：')}, {string_lit(label)}, ' = ',
         COALESCE(CAST(`grp` AS STRING), '-'), ' 在 {_window_note(win)}内 ', {string_lit(alabel)},
         ' 的 ', {string_lit(fn.upper())}, ' 为 ', CAST(ROUND(`agg_val`, 3) AS STRING),
         '（阈值 ', CAST({thr} AS STRING), '）'),
  {string_lit(rule.get('severity') or 'high')},
  {string_lit(rule.get('event_category') or 'correlation')},
  'flink-correlation', 'new', {_src_ip_expr(gfield)},
  CONCAT('rule_id=', CAST({int(rid_in_sql)} AS STRING), '; type=aggregation; group=', {string_lit(gfield)},
         '; agg_func=', {string_lit(fn)}, '; agg_field=', {string_lit(afield)},
         '; window_start=', CAST(`w_start` AS STRING), '; window_end=', CAST(`w_end` AS STRING),
         '; value=', CAST(ROUND(`agg_val`, 4) AS STRING), '; threshold=', CAST({thr} AS STRING),
         '; compare=', {string_lit(cmp_op)}),
  CAST(NULL AS STRING),
  `w_end`, `w_end`, `w_end`
FROM (
  SELECT
    TUMBLE_START(`proc_time`, {wind}) AS `w_start`,
    TUMBLE_END(`proc_time`, {wind})   AS `w_end`,
    {quote_ident(gfield)} AS `grp`,
    {fn.upper()}(CAST({quote_ident(afield)} AS DOUBLE)) AS `agg_val`,
{_sample_src_ip_line(comma=False)}
  FROM {_SRC_TABLE}
  {where}
  GROUP BY TUMBLE(`proc_time`, {wind}), {quote_ident(gfield)}
)
WHERE `agg_val` {cmp_op} {thr}"""


def _insert_sequence(rule, rid_in_sql):
    cfg = rule.get('config') or {}
    win = int(rule['window_seconds'])
    wind = interval_literal(win)
    gfield = rule['field']
    af, ao, av = cfg.get('match_a_field'), cfg.get('match_a_operator', 'eq'), cfg.get('match_a_value', '')
    bf, bo, bv = cfg.get('match_b_field'), cfg.get('match_b_operator', 'eq'), cfg.get('match_b_value', '')
    cond_a = build_condition(af, ao, av)
    cond_b = build_condition(bf, bo, bv)
    extra_where = build_filter(cfg, rule.get('name'))
    where = f'WHERE `{gfield}` IS NOT NULL'
    if extra_where:
        where += f' AND {extra_where}'
    label = FIELD_LABELS.get(gfield, gfield)
    a_desc = f'{FIELD_LABELS.get(af, af)} {OP_LABELS.get(ao, ao)} {av}'
    b_desc = f'{FIELD_LABELS.get(bf, bf)} {OP_LABELS.get(bo, bo)} {bv}'
    return f"""INSERT INTO {_SINK_TABLE}
SELECT
  {_event_code_expr(rid_in_sql)},
  {string_lit(rule.get('event_title') or rule['name'])},
  CONCAT({string_lit(f'时序关联「{rule["name"]}」：')}, {string_lit(label)}, ' = ',
         COALESCE(CAST(`grp` AS STRING), '-'), ' 在 {_window_note(win)}内同时出现 ',
         {string_lit(a_desc)}, '（', CAST(`a_cnt` AS STRING), ' 次）与 ',
         {string_lit(b_desc)}, '（', CAST(`b_cnt` AS STRING), ' 次）'),
  {string_lit(rule.get('severity') or 'high')},
  {string_lit(rule.get('event_category') or 'correlation')},
  'flink-correlation', 'new', {_src_ip_expr(gfield)},
  CONCAT('rule_id=', CAST({int(rid_in_sql)} AS STRING), '; type=sequence; group=', {string_lit(gfield)},
         '; stage_a=', {string_lit(a_desc)}, '; stage_b=', {string_lit(b_desc)},
         '; window_start=', CAST(`w_start` AS STRING), '; window_end=', CAST(`w_end` AS STRING),
         '; a_count=', CAST(`a_cnt` AS STRING), '; b_count=', CAST(`b_cnt` AS STRING)),
  CAST(NULL AS STRING),
  `w_end`, `w_end`, `w_end`
FROM (
  SELECT
    TUMBLE_START(`proc_time`, {wind}) AS `w_start`,
    TUMBLE_END(`proc_time`, {wind})   AS `w_end`,
    {quote_ident(gfield)} AS `grp`,
    SUM(CASE WHEN {cond_a} THEN 1 ELSE 0 END) AS `a_cnt`,
    SUM(CASE WHEN {cond_b} THEN 1 ELSE 0 END) AS `b_cnt`,
{_sample_src_ip_line()}
    MIN(CASE WHEN {cond_a} THEN `first_seen` END) AS `a_at`,
    MIN(CASE WHEN {cond_b} THEN `first_seen` END) AS `b_at`
  FROM {_SRC_TABLE}
  {where}
  GROUP BY TUMBLE(`proc_time`, {wind}), {quote_ident(gfield)}
)
-- A 不晚于 B 即算命中：first_seen 为 ISO-8601 字符串，字典序=时间序；
-- 两边任一为 NULL（无 first_seen）时不命中；同刻到达按并列处理（<=），
-- 用严格 < 会把「同一批上报里的先扫后打」全部漏掉。
-- ⚠️ 不能用 proc_time 做 MIN：PROCTIME 是时间属性，CASE 里引用会恒为 NULL。
WHERE `a_cnt` >= 1 AND `b_cnt` >= 1 AND `a_at` IS NOT NULL
  AND `b_at` IS NOT NULL AND `a_at` <= `b_at`"""


_BUILDERS = {
    'frequency': _insert_frequency,
    'distinct': _insert_distinct,
    'aggregation': _insert_aggregation,
    'sequence': _insert_sequence,
}


def build_rule_insert(rule, rid_in_sql=None):
    """生成单条规则对应的 INSERT 语句。"""
    rid = rid_in_sql if rid_in_sql is not None else rule.get('id')
    atype = rule.get('analysis_type') or 'frequency'
    builder = _BUILDERS.get(atype)
    if not builder:
        raise ValueError(f'不支持的分析手段：{atype}')
    return builder(rule, rid)


# ==================== 整脚本 ====================

def _check_balanced(insert_sql, rule_name):
    """提交前自检括号平衡：生成器里的括号笔误会产出无法解析的 SQL，
    而 Flink 的报错只给「第 N 行第 M 列」，排查成本高，这里提前拦住。"""
    stripped = re.sub(r"'(?:[^']|'')*'", "''", insert_sql)
    if stripped.count('(') != stripped.count(')'):
        raise ValueError(
            f'规则「{rule_name}」生成的 SQL 括号不平衡'
            f'（( {stripped.count("(")} 个 / ) {stripped.count(")")} 个），请检查规则配置')


def build_statements(rules, topic='valid-alerts'):
    """把多条规则合成一个 Flink SQL 脚本（EXECUTE STATEMENT SET → 单个作业）。

    ⚠️ 全部规则共用同一个源表连接，因此 source_topic 取第一条规则的（UI 上按作业统一设置）。
    """
    enabled = [r for r in rules if (r.get('enabled', True) if isinstance(r, dict) else True)]
    if not enabled:
        raise ValueError('没有已启用的关联分析规则，无法生成作业')
    for r in enabled:
        errs = validate_rule(r)
        if errs:
            raise ValueError(f'规则「{r.get("name")}」不合法：{"; ".join(errs)}')

    inserts = []
    for r in enabled:
        sql = build_rule_insert(r)
        _check_balanced(sql, r.get('name'))
        inserts.append(sql)
    statements = [
        source_ddl(topic),
        sink_ddl(),
        'EXECUTE STATEMENT SET\nBEGIN\n' + ';\n\n'.join(inserts) + ';\nEND',
    ]
    return statements, inserts


def build_sql_text(rules, topic='valid-alerts'):
    """生成人类可读的完整 SQL 文本（预览 / 落盘）。"""
    statements, _ = build_statements(rules, topic)
    header = (
        '-- USOP 关联分析 Flink 作业（由「响应与自动化 → 规则管理 → 关联分析规则」自动生成）\n'
        f'-- 规则数：{len([r for r in rules if r.get("enabled", True)])}\n'
        '-- 窗口时间属性：处理时间 PROCTIME（不依赖 first_seen 字段解析）\n'
        '-- 目标：Kafka valid-alerts → 窗口聚合 → PG events 表（JDBC sink）\n\n'
    )
    body = '\n\n'.join(s + ';' for s in statements)
    return header + body + '\n'
