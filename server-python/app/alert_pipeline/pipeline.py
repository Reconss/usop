"""
SOC 告警分阶段处理流水线（对齐分流式架构）

③ 标准化服务：消费设备告警 topic，解析 + 字段映射 + 统一时间(UTC ISO)，
   生成稳定告警唯一标识 alert_id（身份字段 sha256 指纹，内容相同必得同 id），
   发送至 standardized-alerts topic。
④ 过滤分流与出口（单层）：消费 standardized-alerts，命中过滤规则/白名单/Redis 去重
   （DUPLICATE）的告警归「被过滤」分支，全部未命中的（NORMAL）归「未过滤」分支；
   两个分支各自的落点 topic 由 AlertDispatchPolicy 的 AlertExit 子项给出（一个分支可挂
   多个出口实现多投，可选用字段模型裁剪字段），分支下无出口时回退内置默认
   （未过滤 → valid-alerts，被过滤 → invalid-alerts）。告警在此处只投递一次。
⑤ 告警存储：按 AlertStorageRoute 配置的任务持续消费 Kafka topic → 幂等写入指定 ES
   索引（可多条并存，告警持久化只写 ES）。

说明：实时关联分析（原关联分析）已移除，CorrelationRule 仅保留配置数据不再运行。

可靠性：消费失败重试间隔、异常消息记录日志不中断、去重状态持久化于 Redis
（服务重启不丢）、消费组独立、故障恢复后自动从提交位移继续。
"""

import json
import logging
import os
import re
import threading
import time
from collections import defaultdict
from datetime import datetime

from app.database import db

logger = logging.getLogger('alert_pipeline')

TOPIC_STANDARDIZED = 'standardized-alerts'
TOPIC_VALID = 'valid-alerts'
TOPIC_INVALID = 'invalid-alerts'
TOPIC_PROCESSED = 'processed-alerts'   # 保留的历史出口名（可作自定义出口目标，系统已不再默认使用）
INDEX_VALID = 'alerts-valid'
INDEX_INVALID = 'alerts-invalid'
DEDUP_WINDOW_SECONDS = int(os.getenv('DEDUP_WINDOW_SECONDS', '3600'))

# 流水线系统 topic：由流水线自身创建/消费，禁止作为数据源/设备 topic 占用
SYSTEM_TOPICS = ('raw-logs', TOPIC_STANDARDIZED, TOPIC_VALID, TOPIC_INVALID, TOPIC_PROCESSED)

# 出口禁止指向的 topic：这两个是流水线的输入侧，回投会造成环路
ENTRY_TOPICS = ('raw-logs', TOPIC_STANDARDIZED)

# 分流分支：valid=未过滤（通过），filtered=被过滤（含去重重复）
BRANCH_VALID = 'valid'
BRANCH_FILTERED = 'filtered'
BRANCHES = (BRANCH_VALID, BRANCH_FILTERED)

# 未配置任何分流策略/出口时的内置默认出口（等价于历史版本的 valid/invalid 双出口）
DEFAULT_POLICY = {
    'id': None, 'name': '默认分流（系统内置）', 'source_topic': '*',
    'dedup_enabled': True, 'whitelist_enabled': True,
    'enabled': True, 'sort_order': 0, 'exits': [],
}
DEFAULT_EXIT_TOPICS = {BRANCH_VALID: TOPIC_VALID, BRANCH_FILTERED: TOPIC_INVALID}


# ==================== 关联规则模型（业务配置，存 PG） ====================

class CorrelationRule(db.Model):
    """关联分析规则（业务配置，存 PG）——由 Flink 流作业执行，产出的事件写入 PG events 表。

    常规分析手段（analysis_type）：
      frequency  频次阈值：同一分组在窗口内出现次数 ≥ threshold
      distinct   去重计数：同一分组在窗口内不同 count_field 取值数 ≥ threshold
      aggregation 聚合统计：窗口内数值字段 SUM/AVG/MAX/MIN 达到 threshold
      sequence   时序关联：窗口内先出现 A（match_a）再出现 B（match_b）

    统一模型：
      field      分组维度（frequency/distinct/aggregation/sequence 都按它分组）
      config     各分析手段的专属参数（filter/count_field/agg_func/agg_field/match_*）
    """
    __tablename__ = 'correlation_rules'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(160), nullable=False)
    analysis_type = db.Column(db.String(20), nullable=False, default='frequency')
    source_topic = db.Column(db.String(100), nullable=False, default='valid-alerts')
    field = db.Column(db.String(60), nullable=False, default='src_ip')  # 分组维度
    window_seconds = db.Column(db.Integer, nullable=False, default=300)
    threshold = db.Column(db.Float, nullable=False, default=5)
    severity = db.Column(db.String(20), default='high')                 # 事件级别
    event_title = db.Column(db.String(200))                             # 自定义事件标题
    event_category = db.Column(db.String(50), default='correlation')    # 事件分类
    description = db.Column(db.String(300))
    config = db.Column(db.JSON, default=dict)                           # 各分析手段专属参数
    enabled = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name, 'field': self.field,
            'analysis_type': self.analysis_type or 'frequency',
            'source_topic': self.source_topic or 'valid-alerts',
            'window_seconds': self.window_seconds,
            'threshold': self.threshold,
            'severity': self.severity, 'enabled': bool(self.enabled),
            'event_title': self.event_title,
            'event_category': self.event_category,
            'description': self.description,
            'config': self.config or {},
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class AlertFilterRule(db.Model):
    """告警过滤规则：按 topic 维度对标准化后的告警做过滤，命中 → FILTERED 进 invalid。

    topic='*' 表示全局规则；operator: eq/contains/regex/gt/lt/in_ip_group/not_in_ip_group/
    in_domain_group/not_in_domain_group（资源组操作符 value=资源管理中的组名）。
    """
    __tablename__ = 'alert_filter_rules'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(160), nullable=False)
    topic = db.Column(db.String(100), nullable=False, default='*')   # 生效 topic，* 为全局
    field = db.Column(db.String(60), nullable=False)                 # 告警字段（src_ip/title/severity/…）
    operator = db.Column(db.String(20), nullable=False, default='eq')
    value = db.Column(db.String(300), nullable=False, default='')
    enabled = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name, 'topic': self.topic,
            'field': self.field, 'operator': self.operator,
            'value': self.value, 'enabled': bool(self.enabled),
        }

    def match(self, data: dict) -> bool:
        val = str(data.get(self.field) or '')
        v = self.value
        try:
            if self.operator == 'eq':
                return val == v
            if self.operator == 'contains':
                return v in val
            if self.operator == 'regex':
                return bool(re.search(v, val))
            if self.operator == 'gt':
                return float(val) > float(v)
            if self.operator == 'lt':
                return float(val) < float(v)
            # 资源组操作符：value = 资源管理中的组名
            if self.operator in ('in_ip_group', 'not_in_ip_group',
                                 'in_domain_group', 'not_in_domain_group'):
                from app.utils import resource_match
                if self.operator.endswith('ip_group'):
                    hit = resource_match.ip_in_group(v, val)
                else:
                    hit = resource_match.domain_in_group(v, val)
                return hit if self.operator.startswith('in_') else not hit
        except Exception:
            return False
        return False


def _grok_to_regex(pattern: str):
    """Grok 模式 → Python 正则（复用旧版 GrokParser 的模式库，修正其转义缺陷）。

    支持 %{PATTERN} 与 %{PATTERN:field_name}；未知模式按 \\S+ 处理。
    """
    from app.utils.parser import GrokParser

    pats = dict(getattr(GrokParser, 'PATTERNS', {}) or {})

    def _named(mo):
        """同时处理 %{PATTERN} 与 %{PATTERN:field}（命名与否两种写法）。"""
        name = mo.group(1)
        field = mo.group(2)
        body = pats.get(name, r'\S+')
        if field:
            return '(?P<' + field + '>' + body + ')'
        return '(' + body + ')'

    try:
        return re.sub(r'%\{\s*([A-Za-z0-9_]+)\s*(?::(\w+))?\s*\}', _named, pattern)
    except Exception as e:
        logger.error(f"Grok 模式转换失败: {e}")
        return None


class ParseProfile(db.Model):
    """②日志解析配置：从 raw-logs / 设备 topic 读取不同类型日志，按配置的多种方式解析。

    match_type:
      auto     — 内置启发式设备识别 + 内置解析器（现有行为）
      json     — 消息本身即结构化告警（可选 template_id 按模板字段提取）
      regex    — match_value 命名分组正则，从文本日志提取字段
      template — 引用资源管理解析模板（content 中的 {{字段}} 占位符作为标准字段集）
      syslog   — RFC3164/RFC5424 syslog（复用旧版解析通道 SyslogParser）
      cef      — CEF/LEEF 扩展日志格式（同上）
      keyvalue — 键值对文本，parser_config.delimiter 指定分隔符
      csv      — CSV 文本，parser_config = {headers: [...], delimiter: ','}
      grok     — Grok 模式，match_value 或 parser_config.pattern（支持 %{IPV4:src_ip} 等）

    借鉴旧版解析通道能力：
    - 解析器层：复用 app/utils/parser.py 的 JSON/Syslog/KeyValue/CSV/Grok 解析器
      （不使用其 Normalizer 的 details 折叠，以保持现有「未映射字段原样透传」链路）
    - 字段映射层：借鉴 PipelineFieldMapping：两两映射 + field_type 强制类型转换 +
      default_value + is_required + 排序
    - 自动映射层：借鉴 auto-map 的「精确别名 + 模糊匹配 + 置信度」策略，
      别名表并入「安全告警模型」字段，保证解析结果能落到模型字段上

    field_mappings: [{source, target, field_type, default_value, required}]
      source 支持点路径（a.b.c）；target 取自安全告警模型字段 / 标准告警字段
    topic: 生效 topic（'raw-logs'、设备接入创建的 topic，或 '*' 全局兜底）
    """
    __tablename__ = 'parse_profiles'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(160), nullable=False)
    topic = db.Column(db.String(100), nullable=False, default='raw-logs')
    match_type = db.Column(db.String(20), nullable=False, default='auto')  # 见上
    match_value = db.Column(db.String(500), default='')                    # regex 模式 / grok 模式
    template_id = db.Column(db.Integer)                                    # 资源管理解析模板
    parser_config = db.Column(db.JSON, default=dict)                       # 解析器配置（借鉴 PipelineConfig.parser_config）
    field_mappings = db.Column(db.JSON, default=list)                      # 字段映射规则
    enabled = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {'id': self.id, 'name': self.name, 'topic': self.topic,
                'match_type': self.match_type, 'match_value': self.match_value,
                'template_id': self.template_id,
                'parser_config': self.parser_config or {},
                'field_mappings': self.field_mappings or [],
                'enabled': bool(self.enabled)}

    def matches(self, raw) -> bool:
        """判断本配置是否适用该 raw 消息。"""
        if self.match_type == 'regex' and self.match_value:
            try:
                text = raw if isinstance(raw, str) else json.dumps(raw, ensure_ascii=False, default=str)
                return bool(re.search(self.match_value, text))
            except re.error:
                return False
        return True   # json/template 对结构化消息默认适用；auto 作兜底

    def parse(self, raw) -> dict | None:
        """按配置方式解析，返回标准化前置 dict；失败返回 None。"""
        try:
            if self.match_type == 'regex':
                text = raw if isinstance(raw, str) else json.dumps(raw, ensure_ascii=False, default=str)
                m = re.search(self.match_value, text)
                if not m:
                    return None
                return {k: v for k, v in m.groupdict().items() if v is not None}
            if self.match_type in ('syslog', 'cef', 'keyvalue', 'csv', 'grok'):
                return self._parse_legacy(raw)
            if self.match_type == 'template' and self.template_id:
                return _parse_by_template(raw, self.template_id)
            if self.match_type == 'json':
                if not isinstance(raw, dict):
                    return None
                if self.template_id:
                    parsed = _parse_by_template(raw, self.template_id)
                    return parsed if parsed else raw
                return raw
        except Exception:
            return None
        return None

    def _parse_legacy(self, raw) -> dict | None:
        """复用旧版解析通道的解析器（app/utils/parser.py）。

        只取解析器层，不走其 Normalizer：Normalizer 会把未命中的字段折叠成 details，
        与当前流水线「未映射字段原样透传」的数据约定不一致。
        """
        from app.utils.parser import SyslogParser, KeyValueParser, CSVParser

        text = raw if isinstance(raw, str) else json.dumps(raw, ensure_ascii=False, default=str)
        cfg = dict(self.parser_config or {})
        mt = self.match_type

        if mt in ('syslog', 'cef'):
            out = SyslogParser().parse(text)
        elif mt == 'keyvalue':
            delim = str(cfg.get('delimiter') or '').strip()
            if delim:
                # 自定义分隔符：旧版 KeyValueParser 固定按 [\s,;]+ 切分，无法处理
                # 值中含空格的场景（如 msg=Port scan detected），故在此按需实现
                out = {'raw_log': text}
                for pair in text.split(delim):
                    if '=' not in pair:
                        continue
                    k, _, v = pair.partition('=')
                    k = k.strip()
                    if k:
                        out[k] = v.strip().strip('"\'')
                if len(out) <= 1:      # 仅 raw_log → 未解出有效键值对
                    return None
                out.setdefault('timestamp', datetime.utcnow().isoformat())
            else:
                out = KeyValueParser().parse(text)
        elif mt == 'csv':
            out = CSVParser(
                headers=cfg.get('headers') or [],
                delimiter=str(cfg.get('delimiter') or ','),
            ).parse(text)
        elif mt == 'grok':
            pattern = str(cfg.get('pattern') or self.match_value or '')
            if not pattern:
                return None
            # 旧版 GrokParser 用字符串形式 re.sub 做模式替换，repl 里的 \d 会被 Python
            # 当作转义解释而抛 bad escape——此处用 lambda 版本替代（同名旧解析器无法用于含
            # IPV4/NUMBER 等内置模式的表达式）。模式库仍取自 GrokParser.PATTERNS。
            rx = _grok_to_regex(pattern)
            if rx is None:
                return None
            m = re.match(rx, text)
            if not m:
                return None
            out = {'raw_log': text, **{k: v for k, v in m.groupdict().items() if v is not None}}
        else:
            return None

        if not isinstance(out, dict):
            return None
        # 去掉解析器内部时间戳，保留 raw_log（标准字段目录含 raw_log）
        out.pop('parsed_at', None)
        return {k: v for k, v in out.items() if v is not None} or None

    def map_fields(self, parsed: dict) -> dict | None:
        """解析结果 → 安全告警模型/标准告警字段。

        - field_mappings 非空：按显式映射转换（借鉴 PipelineFieldMapping：
          source 支持点路径、field_type 强制类型转换、default_value 兜底、required 缺失即失败）
        - field_mappings 为空：按标准字段/模型字段别名自动映射（未命中的原样保留）

        两类路径最后都过 _normalize_alert_fields()，保证落到模型字段上的取值是同一口径。
        """
        if not isinstance(parsed, dict):
            return None
        mappings = self.field_mappings or []
        if not mappings:
            return _normalize_alert_fields(_auto_map_fields(parsed))
        out: dict = {}
        for m in mappings:
            if not isinstance(m, dict):
                continue
            src, tgt = (m.get('source') or '').strip(), (m.get('target') or '').strip()
            if not src or not tgt:
                continue
            val = parsed
            for part in src.split('.'):
                if isinstance(val, dict) and part in val:
                    val = val[part]
                else:
                    val = None
                    break
            ftype = str(m.get('field_type') or '').strip().lower()
            if val is None or val == '':
                default = m.get('default_value')
                if default not in (None, ''):
                    out[tgt] = _cast_value(default, ftype)
                elif m.get('required'):
                    return None          # 必填字段缺失 → 本配置解析失败
                continue
            out[tgt] = _cast_value(val, ftype)
        # 未映射的原生字段原样保留（数据不丢失，供额外解析字段链路使用）
        for k, v in parsed.items():
            out.setdefault(k, v)
        return _normalize_alert_fields(out)


# ==================== 字段取值口径统一（借鉴旧版 Normalizer） ====================

# 严重级别归一化：设备侧数字/文本混用 → USOP 统一字符串口径
_SEVERITY_LEVELS = {
    'critical': 'critical', 'crit': 'critical', 'fatal': 'critical',
    'emergency': 'critical', 'emerg': 'critical', '1': 'critical',
    'high': 'high', 'error': 'high', 'major': 'high', '2': 'high',
    'medium': 'medium', 'moderate': 'medium', 'warning': 'medium', 'warn': 'medium', '3': 'medium',
    'low': 'low', 'minor': 'low', 'info': 'low', 'informational': 'low', '4': 'low',
    'debug': 'low', 'trace': 'low', 'verbose': 'low', '5': 'low',
}

_PORT_FIELDS = ('src_port', 'dst_port', 'source_port', 'destination_port')
_IP_FIELDS = ('src_ip', 'dst_ip', 'source_ip', 'destination_ip', 'client_ip')


def _cast_value(val, field_type: str):
    """按 field_type 强制类型转换（借鉴 PipelineFieldMapping.field_type，旧版仅存储未执行）。

    转换失败一律回退原值——解析阶段不做数据丢弃，交由下游/alerts 表类型自行处理。
    """
    if not field_type or field_type in ('string', 'str', 'text'):
        return val if not isinstance(val, (dict, list)) else json.dumps(val, ensure_ascii=False, default=str)
    try:
        if field_type in ('int', 'integer', 'number', 'numeric'):
            if isinstance(val, bool):
                return int(val)
            if isinstance(val, (int, float)):
                return int(val) if field_type in ('int', 'integer') else val
            return int(float(str(val).strip()))
        if field_type == 'float':
            return float(str(val).strip())
        if field_type in ('bool', 'boolean'):
            if isinstance(val, bool):
                return val
            return str(val).strip().lower() in ('1', 'true', 'yes', 'y', 'on', 'enabled')
        if field_type in ('ip', 'ipv4'):
            return _clean_ip(val)
        if field_type in ('datetime', 'time', 'timestamp'):
            return str(val).strip()
    except Exception:
        return val
    return val


def _clean_ip(val) -> str:
    """IP 清洗：去空白、去端口（借鉴 Normalizer._normalize_ip）。"""
    ip = str(val or '').strip()
    if not ip:
        return ''
    # IPv6 "addr:port" 形式（冒号多于 1 个）
    if ip.count(':') > 1 and '.' not in ip:
        return ip
    if ':' in ip:
        return ip.rsplit(':', 1)[0]
    return ip


def _normalize_alert_fields(data: dict) -> dict:
    """把落到标准/模型字段上的取值统一口径（severity / IP / 端口）。"""
    if not isinstance(data, dict):
        return data
    if 'severity' in data and data['severity'] not in (None, ''):
        sev = _SEVERITY_LEVELS.get(str(data['severity']).strip().lower())
        if sev:
            data['severity'] = sev
    for f in _IP_FIELDS:
        if data.get(f) not in (None, ''):
            data[f] = _clean_ip(data[f])
    for f in _PORT_FIELDS:
        v = data.get(f)
        if v not in (None, ''):
            try:
                data[f] = int(float(str(v).strip()))
            except Exception:
                pass
    return data


# 标准字段别名映射缓存（30s）：parsed 字段名 → 目标字段名 + 模糊候选
_alias_map: dict = {}
_alias_candidates: dict = {}
_alias_at: float = 0.0

_MODEL_FIELDS_CACHE: list = []
_MODEL_FIELDS_AT: float = 0.0


def _alert_model_fields() -> list:
    """安全告警模型的字段清单 [{key,label,category}]——字段对齐的最终目标（30s 缓存）。

    优先取 scene=alert 的默认模型；无默认模型时取首条 alert 场景模型；
    再无则回退到 template_fields 目录（此时 user-agent 只有抽象字段）。
    """
    global _MODEL_FIELDS_CACHE, _MODEL_FIELDS_AT
    if _MODEL_FIELDS_CACHE and time.time() - _MODEL_FIELDS_AT < 30:
        return _MODEL_FIELDS_CACHE
    fields: list = []
    try:
        from app.routes.templates import AlertTemplate
        tpl = (AlertTemplate.query.filter_by(scene='alert', is_default=True, enabled=True).first()
               or AlertTemplate.query.filter_by(scene='alert', enabled=True).first())
        if tpl and tpl.variables:
            fields = [{'key': v.get('key'), 'label': v.get('label'),
                       'category': v.get('category') or ''}
                      for v in tpl.variables if v.get('key')]
    except Exception as e:
        logger.error(f"加载安全告警模型字段失败: {e}")
    if not fields:
        try:
            from app.routes.templates import TemplateField
            fields = [{'key': f.key, 'label': f.label, 'category': f.category or ''}
                      for f in TemplateField.query.filter_by(enabled=True).all()]
        except Exception:
            fields = []
    _MODEL_FIELDS_CACHE = fields
    _MODEL_FIELDS_AT = time.time()
    return fields


def _build_alias_index() -> tuple:
    """构建别名倒排表（借鉴旧版 auto-map 的多来源策略）。

    来源优先级：安全告警模型字段 > AlertFieldDefinition 标准字段 > 旧版 Normalizer 实战别名表
    返回 (exact_map, candidates)：
      exact_map  — alias.lower() -> 目标字段名（精确对齐用）
      candidates — alias.lower() -> {'target': 字段, 'weight': 权重}（模糊建议用）
    """
    entries: dict = {}

    def add(alias, target, weight):
        a = str(alias or '').strip().lower()
        t = str(target or '').strip()
        if not a or not t or len(a) < 2:
            return
        cur = entries.get(a)
        if cur is None or weight > cur['weight']:
            entries[a] = {'target': t, 'weight': weight}

    # ① 安全告警模型字段（最高优先级：用户要求解析结果落到模型字段）
    for v in _alert_model_fields():
        add(v['key'], v['key'], 1.0)
        add(v['label'], v['key'], 0.95)

    # ② 标准告警字段定义（含别名）
    try:
        from app.models import AlertFieldDefinition
        for f in AlertFieldDefinition.query.filter_by(enabled=True).all():
            add(f.name, f.name, 1.0)
            for a in (f.aliases or []):
                add(a, f.name, 0.95)
    except Exception as e:
        logger.error(f"加载标准字段别名失败: {e}")

    # ③ 旧版解析通道 Normalizer 的实战别名（覆盖 syslog/CEF/CSV/KV 场景）
    try:
        from app.utils.parser import Normalizer
        for std_field, alts in Normalizer.FIELD_MAPPING.items():
            for a in alts:
                add(a, std_field, 0.8)
    except Exception as e:
        logger.error(f"加载旧版 Normalizer 别名失败: {e}")

    exact = {a: c['target'] for a, c in entries.items()}
    return exact, entries


def _refresh_alias_index(force: bool = False):
    global _alias_map, _alias_candidates, _alias_at
    if force or not _alias_map or time.time() - _alias_at > 30:
        _alias_map, _alias_candidates = _build_alias_index()
        _alias_at = time.time()


def _auto_map_fields(parsed: dict) -> dict:
    """把解析出的字段自动对齐到安全告警模型/标准告警字段名。

    精确命中别名表的做改名；未命中的原样保留（避免丢失明细）。
    """
    _refresh_alias_index()
    out = {}
    for k, v in parsed.items():
        out[_alias_map.get(str(k).strip().lower(), k)] = v
    return out


def _suggest_mappings(parsed_fields: list) -> list:
    """借鉴旧版 auto-map：为解析出的每个字段推荐目标标准字段。

    parsed_fields: [{'name': 字段名, 'type'?: 推断类型}]
    返回 [{source, target, field_type, confidence, match}]，按置信度降序。
    精确（别名表）/子串双向匹配 → confidence 0.7~1.0，供界面一键采纳。
    只对长度 >= 3 的别名做模糊匹配，避免 'ip'、'src' 这类短名误命中。
    """
    _refresh_alias_index()
    suggestions = []
    for f in parsed_fields:
        name = str(f.get('name') or '').strip()
        if not name:
            continue
        low = name.lower()
        hit = _alias_candidates.get(low)
        if hit:
            suggestions.append({'source': name, 'target': hit['target'],
                                'field_type': f.get('type') or _infer_field_type(hit['target']),
                                'confidence': round(hit['weight'], 2), 'match': 'exact'})
            continue
        best = None
        for alias, ent in _alias_candidates.items():
            if len(alias) < 3:
                continue
            if alias in low or low in alias:
                if best is None or ent['weight'] > best['weight']:
                    best = ent
        if best:
            suggestions.append({'source': name, 'target': best['target'],
                                'field_type': f.get('type') or _infer_field_type(best['target']),
                                'confidence': 0.7, 'match': 'partial'})
    suggestions.sort(key=lambda x: (-x['confidence'], x['source']))
    return suggestions


_NUMERIC_FIELDS = {'src_port', 'dst_port', 'source_port', 'destination_port', 'confidence'}
_DATETIME_FIELDS = {'timestamp', 'first_seen', 'last_seen', 'created_at', 'updated_at', 'event_time'}


def _infer_field_type(target: str, value=None) -> str:
    """推断/归并字段类型：优先按目标字段语义，其次按样本取值。"""
    t = str(target or '').strip().lower()
    if t in _NUMERIC_FIELDS:
        return 'number'
    if t in _DATETIME_FIELDS:
        return 'datetime'
    if t.endswith('_ip') or t in ('ip', 'src_ip', 'dst_ip'):
        return 'ip'
    if isinstance(value, bool):
        return 'boolean'
    if isinstance(value, int):
        return 'number'
    if isinstance(value, float):
        return 'float'
    if isinstance(value, (dict, list)):
        return 'string'
    # 文本取值再猜一次：纯数字端口类、IP 类
    s = str(value or '').strip()
    if s:
        if re.match(r'^\d{1,5}$', s) and any(k in t for k in ('port', 'count', 'num')):
            return 'number'
        if re.match(r'^(?:\d{1,3}\.){3}\d{1,3}$', s):
            return 'ip'
    return 'string'


class AlertExit(db.Model):
    """③告警出口：分流判定后告警的最终落点 topic（一条 = 一个分支的一个目标 topic）。

    出口挂在分流策略下（policy_id），因此「判定」与「落点」是同一个配置对象，
    不再有「策略出口 topic → 输出路由再分发」的第二跳：
    每条告警只被投递一次，需要多投就在同一分支下加多个出口。

    branch       : valid（未过滤分支）/ filtered（被过滤分支）。
    target_topic : 该出口的目标 Kafka topic（流水线首次投递时自动创建）。
    template_id  : 可选字段模型；配置后仅投递该模型包含的字段（裁剪），为空则全字段。
    """
    __tablename__ = 'alert_exits'

    id = db.Column(db.Integer, primary_key=True)
    policy_id = db.Column(db.Integer, db.ForeignKey('alert_dispatch_policies.id', ondelete='CASCADE'),
                          nullable=False, index=True)
    name = db.Column(db.String(160))
    branch = db.Column(db.String(20), nullable=False, default='valid')   # valid/filtered
    target_topic = db.Column(db.String(100), nullable=False)
    template_id = db.Column(db.Integer)
    enabled = db.Column(db.Boolean, default=True)
    sort_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {'id': self.id, 'policy_id': self.policy_id, 'name': self.name,
                'branch': self.branch, 'target_topic': self.target_topic,
                'template_id': self.template_id, 'enabled': bool(self.enabled),
                'sort_order': self.sort_order or 0}


class AlertDispatchPolicy(db.Model):
    """③告警过滤分流策略：一个（或多个）来源 topic 的「判定开关 + 出口清单」。

    判定：过滤规则 → 白名单 → Redis 去重，命中任一项归「被过滤」分支，否则归「未过滤」分支。
    出口：两个分支各自的落点 topic 由子表 AlertExit 给出（一个分支可挂多个出口实现多投），
          分支下无出口时回退内置默认（未过滤 → valid-alerts，被过滤 → invalid-alerts）。

    dedup_enabled / whitelist_enabled : 该来源 topic 是否参与 Redis 去重与白名单过滤。
    source_topic : 逗号分隔的多个来源 topic（如 'waf-alert,suricata-alert'），
                   或 '*' 表示全局（'*' 不能与其他 topic 混用）。匹配时任一命中即生效。
    """
    __tablename__ = 'alert_dispatch_policies'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(160), nullable=False)
    source_topic = db.Column(db.String(512), nullable=False, default='*')
    dedup_enabled = db.Column(db.Boolean, default=True)
    whitelist_enabled = db.Column(db.Boolean, default=True)
    enabled = db.Column(db.Boolean, default=True)
    sort_order = db.Column(db.Integer, default=0)     # 同 topic 多策略时大者优先
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    exits = db.relationship(
        'AlertExit', backref='policy', lazy='select',
        order_by='AlertExit.sort_order, AlertExit.id',
        cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name, 'source_topic': self.source_topic,
            'source_topics': [t for t in (self.source_topic or '*').split(',') if t],
            'dedup_enabled': bool(self.dedup_enabled),
            'whitelist_enabled': bool(self.whitelist_enabled),
            'enabled': bool(self.enabled), 'sort_order': self.sort_order or 0,
            'exits': [e.to_dict() for e in self.exits],
        }


class AlertStorageRoute(db.Model):
    """④告警存储任务：持续消费指定 Kafka topic → 幂等写入指定 ES 索引。

    取代写死的两条存储线程（valid/invalid 双索引）：topic 与索引均可配置、可多条并存，
    每条任务一个独立消费线程，由监督线程按配置自动启停。

    id_field  : 用作 ES 文档 _id 的告警字段（默认 alert_id），保证重复告警覆盖更新而非堆积。

    告警持久化只写 ES（不再同步 PostgreSQL），安全告警工作台直接从 ES
    的 valid 索引读取。
    """
    __tablename__ = 'alert_storage_routes'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(160), nullable=False)
    source_topic = db.Column(db.String(100), nullable=False)
    index_name = db.Column(db.String(100), nullable=False)
    id_field = db.Column(db.String(64), nullable=False, default='alert_id')
    enabled = db.Column(db.Boolean, default=True)
    description = db.Column(db.String(300), default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name, 'source_topic': self.source_topic,
            'index_name': self.index_name, 'id_field': self.id_field,
            'enabled': bool(self.enabled),
            'description': self.description or '',
        }


def _parse_by_template(raw, template_id: int) -> dict | None:
    """按模板中心解析模板提取字段：模板 content 的 {{key}} 占位符为标准字段集，
    支持 'a.b.c' 点路径取嵌套 JSON 字段；模板字段全为空时视为解析失败。"""
    from app.routes.templates import AlertTemplate
    with alert_pipeline._app.app_context():
        tpl = db.session.get(AlertTemplate, template_id)
        if not tpl:
            return None
        keys = [k.strip() for k in re.findall(r"\{\{\s*([^{}]+?)\s*\}\}", tpl.content or '')]
    if not isinstance(raw, dict) or not keys:
        return None
    out = {}
    for k in keys:
        val = raw
        for part in k.split('.'):
            val = val.get(part) if isinstance(val, dict) else None
            if val is None:
                break
        if val is not None:
            out[k.split('.')[-1]] = val
    return out or None


def _template_fields(template_id: int) -> set:
    """取模板 content 的 {{字段}} 占位符集合（输出字段裁剪用）。"""
    from app.routes.templates import AlertTemplate
    try:
        with alert_pipeline._app.app_context():
            tpl = db.session.get(AlertTemplate, template_id)
        if not tpl:
            return set()
        return {k.strip() for k in re.findall(r"\{\{\s*([^{}]+?)\s*\}\}", tpl.content or '')}
    except Exception:
        return set()


# 设备识别启发式：raw-logs 汇聚消息 → 产品类型（供解析器选择）
def _detect_device(raw: dict) -> str | None:
    if not isinstance(raw, dict):
        return None
    alert = raw.get('alert') or {}
    if 'rule' in raw and ('agent' in raw or 'level' in (raw.get('rule') or {})):
        return 'wazuh'
    if isinstance(alert, dict) and alert.get('signature') and raw.get('event_type') == 'alert':
        return 'suricata'
    evt = raw.get('event') or {}
    if isinstance(evt, dict) and evt.get('DetectName'):
        return 'crowdstrike'
    text = (raw.get('raw') or raw.get('message') or json.dumps(raw, ensure_ascii=False))[:500]
    if 'SecureSphere' in text:
        return 'imperva'
    if 'ModSecurity' in text:
        return 'modsecurity'
    return None


# ==================== 流水线主体 ====================

class AlertPipeline:
    """四个阶段各占一个消费/生产线程，统一由本管理器启停与汇报状态。"""
    _instance = None

    def __new__(cls, *a, **kw):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._threads = {}
        self._running = False
        self._app = None
        self._stats = defaultdict(int)   # consumed/normalized/valid/filtered/duplicate/stored/es_errors
        self._lock = threading.Lock()
        self._bootstrap = os.getenv('KAFKA_BOOTSTRAP_SERVERS', 'kafka:29092')
        self._es = None
        self._redis = None
        self._topic_threads = {}     # topic -> Thread（标准化阶段，运行时可增删）
        self._topic_active = {}      # topic -> bool（运行时接入/摘除开关）
        self._profiles = []          # ParseProfile 缓存（30s，设备 topic 标准化线程用）
        self._profiles_at = 0.0
        # ③分流策略缓存 + ④存储线程（按配置动态起停）
        self._policies = []          # 启用的 AlertDispatchPolicy dict
        self._policies_at = 0.0
        self._store_threads = {}     # route_id -> Thread
        self._store_active = {}      # route_id -> bool
        self._store_sig = {}         # route_id -> (topic, index, id_field)
        self._store_cfg = {}         # route_id -> route dict
        self._store_stats = defaultdict(lambda: {'stored': 0, 'errors': 0,
                                                 'last_error': '', 'last_doc_id': '',
                                                 'last_at': None})
        self._known_topics = set()   # 已确认存在的 Kafka topic（避免重复 ensure）

    # ---------- 基础设施 ----------
    def _es_client(self):
        if self._es is None:
            from elasticsearch import Elasticsearch
            self._es = Elasticsearch(
                os.getenv('ES_URL', 'http://elasticsearch:9200').split(','),
                request_timeout=10)
        return self._es

    def _redis_client(self):
        if self._redis is None:
            import redis
            self._redis = redis.Redis.from_url(
                os.getenv('REDIS_URL', 'redis://redis:6379/0'),
                decode_responses=True, socket_timeout=5)
        return self._redis

    def _ensure_topics(self):
        try:
            from kafka.admin import KafkaAdminClient, NewTopic
            admin = KafkaAdminClient(bootstrap_servers=self._bootstrap, request_timeout_ms=10000)
            existing = set(admin.list_topics())
            self._known_topics |= existing
            new = [NewTopic(name=t, num_partitions=1, replication_factor=1)
                   for t in (TOPIC_STANDARDIZED, TOPIC_VALID, TOPIC_INVALID, TOPIC_PROCESSED) if t not in existing]
            if new:
                admin.create_topics(new)
                logger.info(f"已创建 topic: {[t.name for t in new]}")
            admin.close()
        except Exception as e:
            logger.warning(f"topic 创建跳过（可能已存在）: {e}")

    def _ensure_topic(self, topic: str):
        """确保单个出口 topic 存在（用户自定义的分流/输出 topic 首次出现时自动建）。"""
        if not topic or topic in self._known_topics:
            return
        try:
            from kafka.admin import KafkaAdminClient, NewTopic
            admin = KafkaAdminClient(bootstrap_servers=self._bootstrap, request_timeout_ms=10000)
            existing = set(admin.list_topics())
            self._known_topics |= existing
            if topic not in existing:
                admin.create_topics([NewTopic(name=topic, num_partitions=1, replication_factor=1)])
                logger.info(f"[topic] 已自动创建出口 topic: {topic}")
            self._known_topics.add(topic)
            admin.close()
        except Exception as e:
            logger.warning(f"[topic] 自动创建 {topic} 失败（若已创建将于下次重试）: {e}")

    def _es_index_stats(self, index: str):
        """查询单个 ES 索引的文档数与健康状态（异常返回 None）。"""
        try:
            es = self._es_client()
            if not es.indices.exists(index=index):
                return {'docs': 0, 'exists': False}
            cnt = es.count(index=index)['count']
            return {'docs': cnt, 'exists': True}
        except Exception:
            return None

    def _ensure_index(self, index: str, create: bool = True):
        """存储任务索引初始化（幂等）。create=False 时仅检查是否存在。"""
        try:
            es = self._es_client()
            if es.indices.exists(index=index):
                return True
            if not create:
                return False
            es.indices.create(index=index, body={
                'mappings': {'properties': {
                    'alert_id': {'type': 'keyword'},
                    'alert_code': {'type': 'keyword'},
                    'processing_status': {'type': 'keyword'},
                    'status_reason': {'type': 'text'},
                    'dispatch_branch': {'type': 'keyword'},
                    'dispatch_policy': {'type': 'keyword'},
                    'title': {'type': 'text'},
                    'signature': {'type': 'text'},
                    'severity': {'type': 'keyword'},
                    'status': {'type': 'keyword'},
                    'operation': {'type': 'keyword'},
                    'src_ip': {'type': 'ip'},
                    'dst_ip': {'type': 'ip'},
                    'src_port': {'type': 'integer'},
                    'dst_port': {'type': 'integer'},
                    'protocol': {'type': 'keyword'},
                    'source_product': {'type': 'keyword'},
                    'source_topic': {'type': 'keyword'},
                    'category': {'type': 'keyword'},
                    'first_seen': {'type': 'date'},
                    'last_seen': {'type': 'date'},
                    'created_at': {'type': 'date'},
                    'updated_at': {'type': 'date'},
                }}})
            logger.info(f"已创建 ES 索引: {index}")
            return True
        except Exception as e:
            logger.warning(f"ES 索引 {index} 初始化异常: {e}")
            return False

    def _ensure_indexes(self):
        """确保告警索引存在（映射定义统一收敛到 app/utils/es_alerts.py）。"""
        try:
            from app.utils import es_alerts
            es_alerts.ensure_indices()
        except Exception as e:
            logger.warning(f"ES 索引初始化异常: {e}")

    # ---------- ③ 标准化 ----------
    def _cached_profiles(self):
        """启用的解析配置（30s 刷新），供标准化阶段各 topic 线程共享。"""
        if time.time() - self._profiles_at > 30:
            try:
                with self._app.app_context():
                    self._profiles = ParseProfile.query.filter_by(enabled=True).all()
                self._profiles_at = time.time()
            except Exception as e:
                logger.error(f"[解析配置] 加载失败: {e}")
                self._profiles_at = time.time()
        return self._profiles or []

    def _profiles_for_topic(self, topic: str):
        """命中该 topic 的解析配置（'*' 为全局兜底）。"""
        return [p for p in self._cached_profiles() if p.topic in ('*', topic)]

    def _apply_topic_profiles(self, raw, topic: str):
        """按 topic 应用解析配置：命中返回 (alert_data, profile_name)，未命中返回 (None, None)。

        与 raw-logs 路由线程同策略——依次尝试、解析成功才算命中，必填映射缺失视为失败，
        保证「topic 上有配置」时设备消息一定能被解析，而不是被无解析器跳过。
        """
        for p in self._profiles_for_topic(topic):
            try:
                got = p.parse(raw)
            except Exception:
                got = None
            if not got:
                continue
            try:
                mapped = p.map_fields(got)
            except Exception:
                mapped = None
            if mapped is None:      # 必填字段缺失 → 换下一条配置
                continue
            return mapped, p.name
        return None, None

    def _run_standardizer(self, topic: str):
        from kafka import KafkaConsumer, KafkaProducer
        from app.utils.alert_parsers import PARSER_REGISTRY
        parser = PARSER_REGISTRY.get(topic)
        if not parser:
            # 自定义设备 topic：topic 名不含解析器约定（{device}-alert）时，
            # 回退按数据源登记的 product_type 选择解析器
            try:
                with self._app.app_context():
                    from app.models import DataSource
                    ds = DataSource.query.filter_by(kafka_topic=topic).first()
                    pt = (ds.product_type or '').lower() if ds else ''
                parser = PARSER_REGISTRY.get(f'{pt}-alert') if pt else None
            except Exception:
                parser = None
        # 无内置解析器时，若该 topic 配了②日志解析配置，仍应消费并按配置解析；
        # 只有两者都缺时才跳过（否则「设备接入 topic + 解析配置」链路形同虚设）
        has_profiles = bool(self._profiles_for_topic(topic))
        if not parser and not has_profiles:
            logger.warning(f"[标准化] topic {topic} 无可用解析器且无解析配置（topic 名与数据源产品类型均未匹配），跳过")
            return

        def _deserialize(v):
            """设备日志未必是 JSON（纯文本 syslog/KV/CSV），JSON 解析失败时按原文保留。"""
            if not v:
                return None
            try:
                return json.loads(v.decode('utf-8'))
            except Exception:
                return v.decode('utf-8', 'replace')

        try:
            consumer = KafkaConsumer(
                topic, bootstrap_servers=self._bootstrap,
                group_id=f'pipeline-std-{topic}',
                auto_offset_reset='latest', enable_auto_commit=True,
                value_deserializer=_deserialize,
                consumer_timeout_ms=1000)
            producer = KafkaProducer(bootstrap_servers=self._bootstrap,
                                     value_serializer=lambda v: json.dumps(v, ensure_ascii=False, default=str).encode('utf-8'))
            logger.info(f"[标准化] 已启动: topic={topic} "
                        f"({'内置解析器' if parser else '无内置解析器'}"
                        f"{' + 解析配置' if has_profiles else ''})")
            while self._running and self._topic_active.get(topic, True):
                batch = consumer.poll(timeout_ms=1000, max_records=50)
                for _tp, msgs in batch.items():
                    for msg in msgs:
                        try:
                            raw = msg.value
                            if not raw:
                                continue
                            # ①解析配置优先（用户在「日志解析」里针对该 topic 配的规则）
                            alert_data, profile_name = self._apply_topic_profiles(raw, topic)
                            if alert_data is None:
                                alert_data = parser(raw) if parser else None
                            if not alert_data:
                                # 无法解析 → 隔离进 invalid（原因记录），不中断
                                self._branch_out(producer, self._policy_for(topic), {
                                    'source_topic': topic,
                                    'raw_log': json.dumps(raw, ensure_ascii=False, default=str)[:8000],
                                }, BRANCH_FILTERED, 'FILTERED', f'unparseable message on {topic}')
                                with self._lock:
                                    self._stats['unparseable'] = self._stats.get('unparseable', 0) + 1
                                continue
                            # 统一时间格式 + 稳定 alert_id
                            data = self._normalize(alert_data)
                            if profile_name:
                                data['parse_profile'] = profile_name
                                # 解析配置路径：保留原始日志，否则「原始日志」标签无法核对（曾遗漏 raw_log）
                                data['raw_log'] = json.dumps(raw, ensure_ascii=False, default=str)[:8000]
                            data['source_topic'] = topic
                            self._send(producer, TOPIC_STANDARDIZED, data)
                            with self._lock:
                                self._stats['normalized'] += 1
                        except Exception as e:
                            logger.error(f"[标准化] 处理消息失败 topic={topic}: {e}")
                time.sleep(0.1)
            consumer.close(); producer.close()
            logger.info(f"[标准化] 已停止: topic={topic}")
        except Exception as e:
            logger.error(f"[标准化] 消费者异常 topic={topic}: {e}")

    @staticmethod
    def _normalize(data: dict) -> dict:
        """统一时间格式（UTC ISO8601）+ 生成稳定 alert_id + 清洗空 IP。"""
        from app.utils.dedup import compute_dedup_hash
        now = datetime.utcnow()
        for k in ('first_seen', 'last_seen'):
            v = data.get(k)
            if isinstance(v, datetime):
                data[k] = v.isoformat() + 'Z'
            elif not v:
                data[k] = now.isoformat() + 'Z'
        data.setdefault('created_at', now.isoformat() + 'Z')
        # ES ip 类型字段拒绝空字符串：置 None（映射时跳过该字段）
        for ipf in ('src_ip', 'dst_ip'):
            if data.get(ipf) == '':
                data[ipf] = None
        data['alert_id'] = f"ALT-{compute_dedup_hash(data)}"
        return data

    @staticmethod
    def _send(producer, topic: str, msg: dict):
        fut = producer.send(topic, msg)
        try:
            fut.get(timeout=10)
        except Exception as e:
            logger.error(f"[生产] 消息发送失败 topic={topic}: {e}")

    # ---------- ②raw-logs 路由：从汇聚 topic 识别设备并解析 ----------
    def _run_raw_router(self):
        """消费 raw-logs：识别设备类型 → 选择解析器 → 标准化汇入主流水线；
        无法识别设备的消息隔离进 invalid（审计保留）。"""
        from kafka import KafkaConsumer, KafkaProducer
        from app.utils.alert_parsers import PARSER_REGISTRY
        try:
            consumer = KafkaConsumer(
                'raw-logs', bootstrap_servers=self._bootstrap,
                group_id='pipeline-raw-router',
                auto_offset_reset='latest', enable_auto_commit=True,
                value_deserializer=lambda v: json.loads(v.decode('utf-8')) if v else None,
                consumer_timeout_ms=1000)
            producer = KafkaProducer(bootstrap_servers=self._bootstrap,
                                     value_serializer=lambda v: json.dumps(v, ensure_ascii=False, default=str).encode('utf-8'))
            logger.info("[raw-logs 路由] 已启动")
            profiles = []            # ②解析配置，30s 刷新
            profiles_at = 0.0

            while self._running:
                if time.time() - profiles_at > 30:
                    try:
                        with self._app.app_context():
                            profiles = ParseProfile.query.filter_by(enabled=True).all()
                        profiles_at = time.time()
                    except Exception as e:
                        logger.error(f"[raw-logs 路由] 加载解析配置失败: {e}")
                batch = consumer.poll(timeout_ms=1000, max_records=50)
                for _tp, msgs in batch.items():
                    for msg in msgs:
                        try:
                            raw = msg.value
                            if not raw:
                                continue
                            # ②优先尝试显式解析配置（regex/json/template），依次尝试、解析成功才命中；
                            #   全部未命中再回退内置启发式识别（保证设备消息不被误抢）
                            profile_hit, parsed = None, None
                            for p in profiles:
                                if p.topic not in ('*', 'raw-logs') or p.match_type == 'auto':
                                    continue
                                try:
                                    got = p.parse(raw)
                                except Exception:
                                    got = None
                                if got:
                                    profile_hit, parsed = p, got
                                    break
                            if profile_hit:
                                mapped = profile_hit.map_fields(parsed)
                                if mapped is None:
                                    # 必填映射字段缺失 → 该配置解析失败，尝试下一配置/回退
                                    with self._lock:
                                        self._stats['parse_failed'] = self._stats.get('parse_failed', 0) + 1
                                    continue
                                parsed = mapped
                                data = self._normalize(parsed)
                                data['source_topic'] = 'raw-logs'
                                data.setdefault('device_type', profile_hit.name)  # 显式映射优先
                                data['parse_profile'] = profile_hit.name
                                # 解析配置路径（raw-logs 路由）：同样保留原始日志
                                data['raw_log'] = json.dumps(raw, ensure_ascii=False, default=str)[:8000]
                                self._send(producer, TOPIC_STANDARDIZED, data)
                                with self._lock:
                                    self._stats['raw_normalized'] = self._stats.get('raw_normalized', 0) + 1
                                continue
                            # 回退：内置启发式设备识别 + 内置解析器
                            device = _detect_device(raw)
                            parser = PARSER_REGISTRY.get(f'{device}-alert') if device else None
                            if not (device and parser):
                                self._branch_out(producer, self._policy_for('raw-logs'), {
                                    'source_topic': 'raw-logs',
                                    'raw_log': json.dumps(raw, ensure_ascii=False, default=str)[:8000],
                                }, BRANCH_FILTERED, 'FILTERED',
                                    f'raw-logs 消息无法识别设备类型（识别结果: {device}）')
                                with self._lock:
                                    self._stats['raw_unidentified'] = self._stats.get('raw_unidentified', 0) + 1
                                continue
                            data = parser(raw)
                            if not data:
                                continue
                            data = self._normalize(data)
                            data['source_topic'] = 'raw-logs'
                            data['device_type'] = device
                            self._send(producer, TOPIC_STANDARDIZED, data)
                            with self._lock:
                                self._stats['raw_normalized'] = self._stats.get('raw_normalized', 0) + 1
                        except Exception as e:
                            logger.error(f"[raw-logs 路由] 处理消息失败: {e}")
                time.sleep(0.1)
            consumer.close(); producer.close()
        except Exception as e:
            logger.error(f"[raw-logs 路由] 消费者异常: {e}")

    @staticmethod
    def _extract_topic_configs(cfg_result) -> dict:
        """从 describe_configs 返回中提取可写配置（兼容 kafka-python 各版本的返回结构）。

        结构A（2.3.x）：[response_obj]，配置在 resources[i] = (err_code, err_msg, rtype, name,
        [(config_name, value, read_only, source, sensitive, synonyms), ...])
        结构B（新版 dict）：{ConfigResource: {name: ConfigEntry}}
        """
        items = []
        if isinstance(cfg_result, list):
            for obj in cfg_result:
                for res in getattr(obj, 'resources', None) or []:
                    for entry in (res[4] if len(res) > 4 else []):
                        items.append(entry if isinstance(entry, (tuple, list)) else (entry.name, entry.value, entry.is_read_only))
        elif isinstance(cfg_result, dict):
            for _res, entries in cfg_result.items():
                if hasattr(entries, 'items'):
                    for name, e in entries.items():
                        items.append((name, e.value, e.is_read_only))
                else:
                    for e in entries:
                        items.append((e.name, e.value, e.is_read_only))
        out = {}
        for it in items:
            try:
                name, value = it[0], it[1]
                read_only = bool(it[2]) if len(it) > 2 else False
            except (TypeError, IndexError):
                continue
            if name and not read_only:
                out[name] = value
        return out


    @staticmethod
    def create_device_topic(topic: str, num_partitions: int = 1,
                            retention_ms: int | None = None,
                            retention_bytes: int | None = None,
                            max_message_bytes: int | None = None) -> bool:
        """创建设备告警存储 topic（幂等，供设备直发接入流水线）。

        支持基础 Kafka 配置：分片数、数据有效期（retention.ms）、
        单分区容量上限（retention.bytes）、单条消息大小上限（max.message.bytes）。
        """
        try:
            from kafka.admin import KafkaAdminClient, NewTopic
            admin = KafkaAdminClient(bootstrap_servers=alert_pipeline._bootstrap,
                                     request_timeout_ms=10000)
            existing = set(admin.list_topics())
            if topic not in existing:
                config = {}
                if retention_ms is not None:
                    config['retention.ms'] = str(int(retention_ms))
                if retention_bytes is not None:
                    config['retention.bytes'] = str(int(retention_bytes))
                if max_message_bytes is not None:
                    config['max.message.bytes'] = str(int(max_message_bytes))
                admin.create_topics([NewTopic(name=topic, num_partitions=num_partitions,
                                              replication_factor=1, topic_configs=config or None)])
            admin.close()
            return True
        except Exception as e:
            logger.error(f"创建 topic 失败: {e}")
            return False

    @staticmethod
    def describe_device_topic(topic: str) -> dict | None:
        """查询 topic 配置（分片/有效期/容量等）与分区信息。"""
        try:
            from kafka.admin import KafkaAdminClient, ConfigResource, ConfigResourceType
            admin = KafkaAdminClient(bootstrap_servers=alert_pipeline._bootstrap,
                                     request_timeout_ms=10000)
            if topic not in set(admin.list_topics()):
                admin.close()
                return None
            cfg = admin.describe_configs([ConfigResource(ConfigResourceType.TOPIC, topic)])
            configs = AlertPipeline._extract_topic_configs(cfg)
            # kafka-python describe_topics 返回 [{topic, partitions}, ...]
            meta = admin.describe_topics([topic])
            info = next((t for t in meta if isinstance(t, dict) and t.get('topic') == topic), None)
            partitions = (info or {}).get('partitions') or []
            admin.close()
            return {
                'config': configs,
                'partitions': [{'partition': p.get('partition'), 'leader': p.get('leader'),
                                'replicas': p.get('replicas')} for p in partitions],
            }
        except Exception as e:
            logger.error(f"查询 topic 配置失败: {e}")
            return None

    @staticmethod
    def alter_device_topic(topic: str, retention_ms: int | None = None,
                           retention_bytes: int | None = None,
                           max_message_bytes: int | None = None,
                           num_partitions: int | None = None) -> tuple[bool, str]:
        """修改 topic 配置（retention/max.message.bytes 可动态调整；分区只能增加）。

        kafka-python 的 alter_configs 为全量覆盖语义，先读回当前配置再合并，
        避免未提及的配置项被清空。
        """
        try:
            from kafka.admin import KafkaAdminClient, ConfigResource, ConfigResourceType, NewPartitions
            admin = KafkaAdminClient(bootstrap_servers=alert_pipeline._bootstrap,
                                     request_timeout_ms=10000)
            if topic not in set(admin.list_topics()):
                admin.close()
                return False, 'topic 不存在'
            # 1. 读回当前全部配置，与本次修改合并（全量覆盖语义保护）
            updates = {}
            if retention_ms is not None:
                updates['retention.ms'] = str(int(retention_ms))
            if retention_bytes is not None:
                updates['retention.bytes'] = str(int(retention_bytes))
            if max_message_bytes is not None:
                updates['max.message.bytes'] = str(int(max_message_bytes))
            if updates:
                cur = AlertPipeline._extract_topic_configs(admin.describe_configs(
                    [ConfigResource(ConfigResourceType.TOPIC, topic)]))
                cur.update(updates)
                admin.alter_configs([ConfigResource(ConfigResourceType.TOPIC, topic, configs=cur)])
            # 2. 分区只能增加不能减少
            if num_partitions is not None:
                meta = admin.describe_topics([topic])
                info = next((t for t in meta if isinstance(t, dict) and t.get('topic') == topic), None)
                current = len((info or {}).get('partitions') or [])
                if num_partitions > current:
                    admin.create_partitions({topic: NewPartitions(total_count=num_partitions)})
                elif num_partitions < current:
                    admin.close()
                    return False, f'分区数只能增加不能减少（当前 {current}）'
            admin.close()
            return True, ''
        except Exception as e:
            logger.error(f"修改 topic 配置失败: {e}")
            return False, str(e)

    @staticmethod
    def delete_device_topic(topic: str) -> tuple[bool, str]:
        """删除 Kafka topic 本体（真实远程删除，幂等）。

        调用方负责先停止该 topic 的消费线程，否则删除后消费组会持续报错。
        幂等：topic 不存在时同样返回成功。
        返回 (是否成功, 说明)；说明为空串表示正常删除。
        """
        try:
            from kafka.admin import KafkaAdminClient
            admin = KafkaAdminClient(bootstrap_servers=alert_pipeline._bootstrap,
                                     request_timeout_ms=10000)
            try:
                existing = set(admin.list_topics())
                if topic not in existing:
                    return True, 'topic 在 Kafka 中已不存在'
                fut = admin.delete_topics([topic], timeout_ms=15000)
                # kafka-python 返回 {topic: future}，需逐一 get 才能触发真实错误
                if isinstance(fut, dict):
                    for _t, f in fut.items():
                        if hasattr(f, 'get'):
                            f.get()
            finally:
                admin.close()
        except Exception as e:
            logger.error(f"删除 topic 失败: {e}")
            return False, str(e)

        # 二次确认（broker 侧删除是标记 + 异步清理，需要复查）
        try:
            verify = KafkaAdminClient(bootstrap_servers=alert_pipeline._bootstrap,
                                      request_timeout_ms=10000)
            try:
                still = topic in set(verify.list_topics())
            finally:
                verify.close()
        except Exception:
            return True, ''
        return (True, '') if not still else (False, 'Kafka 已受理，但 topic 仍存在，请稍候重试')

    @staticmethod
    def read_topic_messages(topic: str, limit: int = 50) -> list[dict] | None:
        """回读 topic 最近 limit 条消息（按 offset 倒序返回，供页面查看数据）。"""
        try:
            from kafka import KafkaConsumer
            from kafka.structs import TopicPartition
            consumer = KafkaConsumer(bootstrap_servers=alert_pipeline._bootstrap,
                                     request_timeout_ms=10000, consumer_timeout_ms=5000)
            parts = consumer.partitions_for_topic(topic)
            if not parts:
                consumer.close()
                return []
            tps = [TopicPartition(topic, p) for p in parts]
            consumer.assign(tps)
            ends = consumer.end_offsets(tps)
            # 每个分区从 end-limit 处开始读
            per = max(1, limit // max(1, len(tps)))
            for tp in tps:
                end = ends[tp]
                consumer.seek(tp, max(0, end - per))
            out = []
            poll_deadline = time.time() + 6
            while len(out) < limit and time.time() < poll_deadline:
                batch = consumer.poll(timeout_ms=800, max_records=limit)
                for _tp, msgs in batch.items():
                    for m in msgs:
                        out.append({
                            'partition': m.partition,
                            'offset': m.offset,
                            'timestamp': m.timestamp,
                            'key': m.key.decode('utf-8', 'ignore') if m.key else None,
                            'value': m.value,
                        })
                if any(m.timestamp for _tp, msgs in batch.items() for m in msgs):
                    continue
                break
            consumer.close()
            out.sort(key=lambda x: (x.get('timestamp') or 0), reverse=True)
            return out[:limit]
        except Exception as e:
            logger.error(f"读取 topic 消息失败: {e}")
            return None

    # ---------- ③ 过滤分流：未过滤 / 被过滤 → 两个不同出口 topic ----------
    def _cached_policies(self):
        """启用的分流策略（15s 刷新，dict 形态，避免跨线程持有 ORM 对象）。"""
        if time.time() - self._policies_at > 15:
            try:
                with self._app.app_context():
                    rows = AlertDispatchPolicy.query.filter_by(enabled=True).all()
                    self._policies = [p.to_dict() for p in rows]
                self._policies_at = time.time()
            except Exception as e:
                logger.error(f"[分流] 加载策略失败: {e}")
                self._policies_at = time.time()
        return self._policies or []

    @staticmethod
    def _pick_policy(policies, src_topic: str) -> dict | None:
        """为告警挑选分流策略：精确 source_topic 优先（支持逗号分隔多 topic，任一命中），
        其次全局 '*'。"""
        def sources(p: dict) -> list:
            return [t.strip() for t in (p.get('source_topic') or '*').split(',') if t.strip()]

        exact = [p for p in policies if src_topic in sources(p)]
        if exact:
            return max(exact, key=lambda p: p.get('sort_order') or 0)
        glob = [p for p in policies if '*' in sources(p)]
        if glob:
            return max(glob, key=lambda p: p.get('sort_order') or 0)
        return None

    def _policy_for(self, src_topic: str) -> dict:
        """取该来源 topic 的分流策略；无配置时用内置默认策略。"""
        return self._pick_policy(self._cached_policies(), src_topic) or dict(DEFAULT_POLICY)

    @staticmethod
    def _exits_for(pol: dict, branch: str) -> list:
        """取策略在该分支下启用的出口；无配置时回退内置默认出口。

        返回 [{target_topic, template_id, ...}]，一个分支可挂多个出口实现多投。
        """
        exits = [e for e in (pol.get('exits') or [])
                 if e.get('branch') == branch and e.get('enabled', True) and e.get('target_topic')]
        if exits:
            return exits
        return [{'target_topic': DEFAULT_EXIT_TOPICS[branch], 'template_id': None}]

    def _branch_out(self, producer, pol: dict, data: dict, branch: str,
                    status: str, reason: str = ''):
        """把告警投递到该分支的全部出口 topic（单层出口，一跳到位）。

        每个出口独立裁剪（配置字段模型时仅保留模型字段），目标 topic 首次出现自动创建。
        """
        data['processing_status'] = status
        if reason:
            data['status_reason'] = reason
        data['dispatch_policy'] = pol.get('name')
        data['dispatch_branch'] = branch
        for ex in self._exits_for(pol, branch):
            topic = ex['target_topic']
            out = data
            if ex.get('template_id'):
                fields = _template_fields(ex['template_id'])
                if fields:
                    out = {k: v for k, v in data.items() if k in fields}
                    out['alert_id'] = data.get('alert_id')
            self._ensure_topic(topic)
            self._send(producer, topic, out)
            with self._lock:
                self._stats['output_sent'] = self._stats.get('output_sent', 0) + 1

    def _run_dispatch(self):
        """消费 standardized-alerts → 过滤/去重判定 → 两个分支发往各自出口 topic。

        判定顺序：过滤规则 → 白名单 → Redis 去重；命中任一项即进「被过滤出口」，
        全部未命中进「未过滤出口」。出口 topic 由分流策略按来源 topic 决定，不再写死。
        """
        from kafka import KafkaConsumer, KafkaProducer
        from app.ai_analysis.whitelist import match_alert
        try:
            consumer = KafkaConsumer(
                TOPIC_STANDARDIZED, bootstrap_servers=self._bootstrap,
                group_id='pipeline-dispatch',
                auto_offset_reset='latest', enable_auto_commit=True,
                value_deserializer=lambda v: json.loads(v.decode('utf-8')) if v else None,
                consumer_timeout_ms=1000)
            producer = KafkaProducer(bootstrap_servers=self._bootstrap,
                                     value_serializer=lambda v: json.dumps(v, ensure_ascii=False, default=str).encode('utf-8'))
            logger.info("[过滤分流] 已启动")
            filter_rules = []       # [(topic, rule)]，30s 刷新
            rules_loaded_at = 0.0

            def _load_filter_rules():
                nonlocal filter_rules, rules_loaded_at
                try:
                    with self._app.app_context():
                        rules = AlertFilterRule.query.filter_by(enabled=True).all()
                        filter_rules = [(r.topic, r) for r in rules]
                    rules_loaded_at = time.time()
                except Exception as e:
                    logger.error(f"[过滤分流] 加载过滤规则失败: {e}")

            while self._running:
                if time.time() - rules_loaded_at > 30:
                    _load_filter_rules()
                    try:      # 资源组缓存随规则一起刷新（match 时无 app context）
                        from app.utils import resource_match
                        with self._app.app_context():
                            resource_match.refresh_cache()
                    except Exception:
                        pass
                policies = self._cached_policies()
                batch = consumer.poll(timeout_ms=1000, max_records=50)
                for _tp, msgs in batch.items():
                    for msg in msgs:
                        try:
                            data = msg.value
                            if not data:
                                continue
                            with self._lock:
                                self._stats['consumed'] += 1
                            alert_id = data.get('alert_id') or ''
                            if not alert_id:
                                # 兜底生成稳定告警标识：直接投递到 standardized-alerts 的
                                # 消息可能不带 alert_id，若留空会让去重键塌缩成同一个
                                # "dedup:"，导致后续告警被误判为重复。
                                alert_id = self._ensure_alert_id(data)
                            # topic 维度过滤规则（'*' 为全局规则）
                            src_topic = data.get('source_topic') or ''
                            pol = self._pick_policy(policies, src_topic) or dict(DEFAULT_POLICY)
                            hit_rule = next(
                                (r for tp, r in filter_rules
                                 if tp in ('*', src_topic) and r.match(data)), None)
                            if hit_rule:
                                self._branch_out(producer, pol, data, 'filtered', 'FILTERED',
                                                 f"命中过滤规则: {hit_rule.name}")
                                with self._lock:
                                    self._stats['filtered'] += 1
                                continue
                            # 白名单过滤
                            if pol.get('whitelist_enabled', True):
                                hit = match_alert(data)
                                if hit:
                                    self._branch_out(
                                        producer, pol, data, 'filtered', 'FILTERED',
                                        f"命中白名单规则: {hit.get('rule') or hit.get('name') or hit.get('rule_name') or 'unknown'}")
                                    with self._lock:
                                        self._stats['filtered'] += 1
                                    continue
                            # Redis 持久化去重（重启不丢；窗口内同 alert_id 视为重复）
                            if pol.get('dedup_enabled', True):
                                r = self._redis_client()
                                key = f"dedup:{alert_id}"
                                if not r.set(key, '1', nx=True, ex=DEDUP_WINDOW_SECONDS):
                                    self._branch_out(producer, pol, data, 'filtered', 'DUPLICATE',
                                                     f'{DEDUP_WINDOW_SECONDS}s 窗口内重复上报')
                                    with self._lock:
                                        self._stats['duplicate'] += 1
                                    continue
                            self._branch_out(producer, pol, data, 'valid', 'NORMAL')
                            with self._lock:
                                self._stats['valid'] += 1
                        except Exception as e:
                            logger.error(f"[过滤分流] 处理消息失败: {e}")
                time.sleep(0.1)
            consumer.close(); producer.close()
        except Exception as e:
            logger.error(f"[过滤分流] 消费者异常: {e}")

    # ---------- ⑤ 告警存储：Kafka → ES 持续化（按存储任务配置） ----------
    def _run_storage_supervisor(self):
        """存储任务监督线程：按 AlertStorageRoute 配置动态起停消费线程（10s 轮询）。

        首次运行且无任何配置时播种内置双任务（有效/无效告警各自索引），保持与历史行为一致。
        """
        while self._running:
            try:
                with self._app.app_context():
                    if AlertStorageRoute.query.count() == 0:
                        db.session.add(AlertStorageRoute(
                            name='有效告警存储（系统）', source_topic=TOPIC_VALID,
                            index_name=INDEX_VALID, id_field='alert_id',
                            description='消费未过滤分支出口 topic(valid-alerts)，'
                                        '写入 ES alerts-valid（安全告警工作台读取源）'))
                        db.session.add(AlertStorageRoute(
                            name='无效告警隔离存储（系统）', source_topic=TOPIC_INVALID,
                            index_name=INDEX_INVALID, id_field='alert_id',
                            description='被过滤/重复的告警隔离索引，供审计回溯'))
                        db.session.commit()
                        logger.info("[存储] 已播种内置存储任务 2 条")
                    rows = AlertStorageRoute.query.filter_by(enabled=True).all()
                    cfgs = {r.id: r.to_dict() for r in rows}

                for rid, cfg in cfgs.items():
                    sig = (cfg['source_topic'], cfg['index_name'], cfg['id_field'])
                    th = self._store_threads.get(rid)
                    if self._store_sig.get(rid) != sig or th is None or not th.is_alive():
                        self._store_active[rid] = False
                        if th and th.is_alive():
                            th.join(timeout=5)
                        self._store_sig[rid] = sig
                        self._store_cfg[rid] = cfg
                        self._store_active[rid] = True
                        self._ensure_topic(cfg['source_topic'])
                        self._ensure_index(cfg['index_name'])
                        t = threading.Thread(target=self._run_storage_route, args=(rid,),
                                             daemon=True, name=f'store-{rid}')
                        t.start()
                        self._store_threads[rid] = t
                        self._threads[f'store-{rid}'] = t
                    else:
                        self._store_cfg[rid] = cfg      # 配置更新在下次循环即生效
                for rid in list(self._store_active):
                    if rid not in cfgs:
                        self._store_active[rid] = False
            except Exception as e:
                logger.error(f"[存储] 监督线程异常: {e}")
            time.sleep(10)

    @staticmethod
    def _fallback_doc_id(data: dict) -> str:
        """内容指纹兜底文档 id（SHA-前缀），保证同内容幂等，避免 ES 随机生成 id。"""
        import hashlib
        try:
            raw = json.dumps(data, sort_keys=True, ensure_ascii=False, default=str)
        except Exception:
            raw = str(data)
        return 'SHA-' + hashlib.sha256(raw.encode('utf-8')).hexdigest()[:32]

    def _ensure_alert_id(self, data: dict) -> str:
        """确保告警携带稳定 alert_id（内容指纹），并回写 data['alert_id'] / data['id']。"""
        try:
            from app.utils.dedup import compute_dedup_hash
            alert_id = f"ALT-{compute_dedup_hash(data)}"
        except Exception:
            alert_id = self._fallback_doc_id(data)
        data['alert_id'] = alert_id
        data.setdefault('id', alert_id)
        logger.warning(f"[过滤分流] 消息缺少 alert_id，已按内容指纹生成: {alert_id}")
        return alert_id

    def _run_storage_route(self, route_id: int):
        """单条存储任务：持续消费 source_topic → 幂等写入 ES index_name。"""
        from kafka import KafkaConsumer
        cfg = self._store_cfg.get(route_id) or {}
        topic, index = cfg.get('source_topic'), cfg.get('index_name')
        if not topic or not index:
            return
        try:
            consumer = KafkaConsumer(
                topic, bootstrap_servers=self._bootstrap,
                group_id=f'pipeline-store-{route_id}',
                auto_offset_reset='latest', enable_auto_commit=True,
                value_deserializer=lambda v: json.loads(v.decode('utf-8')) if v else None,
                consumer_timeout_ms=1000)
            logger.info(f"[存储#{route_id}] 已启动: {topic} → ES {index}")
            while self._running and self._store_active.get(route_id):
                batch = consumer.poll(timeout_ms=1000, max_records=50)
                for _tp, msgs in batch.items():
                    for msg in msgs:
                        try:
                            data = msg.value
                            if not data:
                                continue
                            cfg_now = self._store_cfg.get(route_id) or cfg
                            es = self._es_client()
                            id_field = cfg_now.get('id_field') or 'alert_id'
                            # 幂等文档 id：优先取配置的幂等字段；缺失时用内容指纹兜底，
                            # 绝不允许留空（留空会让 ES 自动生成 id，去重与回查全部失效）
                            doc_id = data.get(id_field) or ''
                            if not doc_id:
                                doc_id = self._fallback_doc_id(data)
                                data.setdefault('alert_id', doc_id)
                                data.setdefault('id', doc_id)
                                logger.warning(
                                    f"[存储#{route_id}] 消息缺少幂等字段 {id_field}，"
                                    f"已按内容指纹生成文档 id={doc_id}")
                            # 幂等写入：同一 key 覆盖更新，不产生重复文档
                            es.index(index=cfg_now['index_name'], id=doc_id, body=data,
                                     refresh='wait_for')
                            st = self._store_stats[route_id]
                            st['stored'] += 1
                            st['last_doc_id'] = doc_id
                            st['last_at'] = datetime.utcnow().isoformat() + 'Z'
                            with self._lock:
                                self._stats['stored'] = self._stats.get('stored', 0) + 1
                        except Exception as e:
                            st = self._store_stats[route_id]
                            st['errors'] += 1
                            st['last_error'] = str(e)[:300]
                            logger.error(f"[存储#{route_id}] 写入失败 topic={topic}: {e}")
                time.sleep(0.1)
            consumer.close()
            logger.info(f"[存储#{route_id}] 已停止: {topic}")
        except Exception as e:
            st = self._store_stats[route_id]
            st['errors'] += 1
            st['last_error'] = str(e)[:300]
            logger.error(f"[存储#{route_id}] 消费者异常 topic={topic}: {e}")

    def list_kafka_topics(self) -> dict:
        """列举 Kafka 内的业务 topic（排除 __consumer_offsets 等内部 topic）。"""
        try:
            from kafka.admin import KafkaAdminClient
            admin = KafkaAdminClient(bootstrap_servers=self._bootstrap, request_timeout_ms=8000)
            try:
                topics = sorted(t for t in admin.list_topics() if not t.startswith('__'))
                self._known_topics |= set(topics)
            finally:
                admin.close()
            return {'topics': topics, 'system': list(SYSTEM_TOPICS), 'kafka_reachable': True}
        except Exception as e:
            logger.error(f"[topic] 列举 Kafka topic 失败: {e}")
            return {'topics': [], 'system': list(SYSTEM_TOPICS),
                    'kafka_reachable': False, 'error': str(e)}

    def list_es_indexes(self) -> list:
        """列举 ES 索引（排除 .kibana 等系统索引），附文档数，供存储任务下拉选择。"""
        try:
            es = self._es_client()
            stats = es.indices.stats().get('indices') or {}
            out = []
            for name, st in stats.items():
                if name.startswith('.'):
                    continue
                out.append({'name': name,
                            'docs': ((st.get('total') or {}).get('docs') or {}).get('count', 0)})
            return sorted(out, key=lambda x: x['name'])
        except Exception as e:
            logger.error(f"[ES] 列举索引失败: {e}")
            return []

    def storage_route_stats(self, route_id: int) -> dict:
        """单条存储任务的运行统计（线程存活 + 写入计数 + 最近错误 + ES 文档数）。"""
        st = dict(self._store_stats.get(route_id) or {'stored': 0, 'errors': 0,
                                                      'last_error': '', 'last_doc_id': '',
                                                      'last_at': None})
        th = self._store_threads.get(route_id)
        st['running'] = bool(th and th.is_alive() and self._store_active.get(route_id))
        return st


    # ---------- 生命周期 ----------
    def start(self, app):
        if self._running:
            return
        self._app = app
        self._running = True
        self._ensure_topics()
        self._ensure_indexes()
        with app.app_context():
            from app.models import DataSource
            topics = [t.kafka_topic for t in DataSource.query.filter_by(status='active').all()
                      if t.kafka_topic]
        for topic in dict.fromkeys(topics):
            self.start_topic(topic)
        for name, target in (
                ('raw-router', self._run_raw_router),
                ('dispatch', self._run_dispatch),
                # 存储阶段由监督线程按配置动态起停消费线程
                ('storage-supervisor', self._run_storage_supervisor)):
            t = threading.Thread(target=target, daemon=True, name=f'pipe-{name}')
            t.start(); self._threads[f'pipe-{name}'] = t
        logger.info(f"告警流水线已启动: raw-logs 路由(解析配置) + 标准化 topic={topics} "
                    f"+ 过滤分流(按策略出口直接投递) + 可配置 Kafka→ES 存储")

    def start_topic(self, topic: str) -> bool:
        """运行时接入一个数据源 topic 的标准化消费（幂等）。"""
        if not topic or self._topic_active.get(topic):
            return False
        self._topic_active[topic] = True
        if topic not in self._topic_threads or not self._topic_threads[topic].is_alive():
            t = threading.Thread(target=self._run_standardizer, args=(topic,),
                                 daemon=True, name=f'std-{topic}')
            t.start()
            self._topic_threads[topic] = t
            self._threads[f'std-{topic}'] = t
        return True

    def stop_topic(self, topic: str) -> bool:
        """运行时摘除一个 topic 的标准化消费（消费组位移保留，重新接入续传）。"""
        if not topic or not self._topic_active.get(topic):
            return False
        self._topic_active[topic] = False
        return True

    def stop(self):
        self._running = False
        self._topic_active = {k: False for k in self._topic_active}
        self._store_active = {k: False for k in self._store_active}

    def status(self) -> dict:
        es_docs = {}
        try:
            es = self._es_client()
            for idx in (INDEX_VALID, INDEX_INVALID):
                if es.indices.exists(index=idx):
                    es_docs[idx] = es.count(index=idx)['count']
        except Exception:
            pass
        dedup_keys = 0
        try:
            dedup_keys = self._redis_client().dbsize()
        except Exception:
            pass
        # 出口汇总：每条策略两个分支的实际去向（含回退到内置默认的 topic）
        exits = []
        try:
            for p in self._cached_policies():
                exits.append({
                    'policy_id': p.get('id'), 'name': p.get('name'),
                    'source_topic': p.get('source_topic'),
                    'valid': [e['target_topic'] for e in self._exits_for(p, BRANCH_VALID)],
                    'filtered': [e['target_topic'] for e in self._exits_for(p, BRANCH_FILTERED)],
                })
        except Exception:
            pass
        return {
            'running': self._running,
            'threads': {n: t.is_alive() for n, t in self._threads.items()},
            'topics': dict(self._topic_active),
            'stats': dict(self._stats),
            'es_indexes': es_docs,
            'dedup_keys': dedup_keys,
            'dedup_window_seconds': DEDUP_WINDOW_SECONDS,
            'exits': exits,
            'default_policy': dict(DEFAULT_POLICY),
            'default_exits': dict(DEFAULT_EXIT_TOPICS),
        }


alert_pipeline = AlertPipeline()


def init_alert_pipeline(app):
    alert_pipeline.start(app)
    return alert_pipeline
