# ========================================
# 剧本运行时入参（声明式设计）
#
# 设计原则：执行剧本 = 提供剧本声明的「入参」，仅此而已。
# - 剧本作者在触发器节点 config.inputs 显式声明运行时入参：
#     [{key, label, type, required, placeholder, description}]
# - 节点的其余配置（封堵时长/通知渠道/提示词/查询条件等）是剧本本身
#   的一部分，在画布上配置，执行时不向操作人收集、也不接受执行期覆盖。
# - 入参在执行时注入引擎 params：{{ $json.<key> }} / {{ <key> }} /
#   {{ params.<key> }} 均可引用（触发器快照已合并 params，$json 优先命中）。
# - 入参留空时按 INPUT_PREFILL_RULES 从事件/告警上下文自动回填，
#   保证「事件工作台一键执行」与「自动化触发」两条路径都拿得到值。
# ========================================

import re
from typing import Dict, List

# 入参 key → 事件上下文预填规则（按序取第一个非空值；路径前缀 event./alert.）
INPUT_PREFILL_RULES: Dict[str, List[str]] = {
    'src_ip': ['event.src_ip', 'event.sourceIp', 'alert.src_ip'],
    'ip': ['event.src_ip', 'event.sourceIp', 'alert.src_ip'],
    'dst_ip': ['event.dst_ip', 'alert.dst_ip'],
    'event_code': ['event.event_code', 'event.eventCode'],
    'title': ['event.title'],
    'severity': ['event.severity'],
    'category': ['event.category', 'event.eventType'],
    'description': ['event.description'],
    'reason': ['event.description'],
    'hostname': ['alert.dst_host', 'alert.host'],
}
# 兜底规则：任意 key 都会尝试 event.<key> / alert.<key>


def _dig(event_ctx: Dict, alert_ctx: Dict, path: str):
    """按 'event.a.b.0' 路径取值，返回 (found, value)。"""
    source = event_ctx if path.startswith('event.') else alert_ctx
    cur = source
    for part in path.split('.', 1)[1].split('.'):
        if isinstance(cur, dict):
            cur = cur.get(part)
        elif isinstance(cur, list) and part.isdigit():
            cur = cur[int(part)] if int(part) < len(cur) else None
        else:
            return None
    return cur


def get_declared_inputs(playbook) -> List[Dict]:
    """读取触发器节点声明的运行时入参定义。"""
    for node in (playbook.nodes or []):
        if not isinstance(node, dict):
            continue
        if (node.get('typeId') or node.get('type')) != 'trigger':
            continue
        inputs = (node.get('config') or {}).get('inputs')
        if isinstance(inputs, list):
            return [i for i in inputs if isinstance(i, dict) and str(i.get('key') or '').strip()]
    return []


def build_playbook_param_schema(playbook, event_context: Dict = None,
                                alert: Dict = None) -> Dict:
    """声明式入参清单：定义 + 每个入参从事件上下文解析出的预填值。

    返回 {mode: 'declared'|'none', inputs: [...]}。
    mode='none' 表示剧本未声明入参 → 执行弹窗无需收集，直接按画布配置执行。
    """
    event_ctx = event_context or {}
    alert_ctx = alert or {}
    inputs = []
    for d in get_declared_inputs(playbook):
        key = str(d.get('key')).strip()
        default = str(d.get('default') or '').strip()
        prefill, prefill_source = '', ''
        for path in INPUT_PREFILL_RULES.get(key, []) + [f'event.{key}', f'alert.{key}']:
            try:
                v = _dig(event_ctx, alert_ctx, path)
            except Exception:
                v = None
            if v not in (None, '', 'N/A'):
                prefill, prefill_source = str(v), path
                break
        if not prefill and default:
            # 事件上下文没有值时回退作者声明的默认值（执行弹窗可修改）
            prefill, prefill_source = default, 'declared_default'
        inputs.append({
            'key': key,
            'label': d.get('label') or key,
            'type': d.get('type') or 'text',
            'required': bool(d.get('required')),
            'placeholder': d.get('placeholder') or '',
            'description': d.get('description') or '',
            'default': default,
            'prefill': prefill,
            'prefill_source': prefill_source,
        })
    return {'mode': 'declared' if inputs else 'none', 'inputs': inputs}


def collect_submitted_inputs(playbook, params) -> Dict:
    """只保留声明的入参 key；其余键一律丢弃（节点配置不接受执行期覆盖）。"""
    if not isinstance(params, dict):
        return {}
    allowed = {d['key'] for d in get_declared_inputs(playbook)}
    return {k: str(v).strip() for k, v in params.items()
            if k in allowed and str(v).strip()}


def resolve_effective_inputs(schema: Dict, submitted: Dict) -> Dict:
    """合并提交值与事件预填值：提交值优先，留空回退 prefill（自动化路径兜底）。"""
    submitted = submitted or {}
    out = {}
    for d in (schema or {}).get('inputs', []):
        v = str(submitted.get(d['key'], '') or '').strip()
        out[d['key']] = v or str(d.get('prefill', '') or '')
    return {k: v for k, v in out.items() if v != ''}


# ========================================
# 执行前置校验
#
# 两条硬规则（服务端强制，前端只做提示）：
#   1）触发类型为「告警事件」的剧本必须由真实事件/告警提供上下文。
#      手动执行没有数据可传（$json.* 全部为空），因此直接拒绝，
#      而不是让它带着空上下文跑一遍虚假的「执行成功」。
#   2）剧本声明的必填入参缺失（或 IP 类型格式错误）时拒绝执行。
# ========================================

# 触发类型中文名（用于报错文案）
TRIGGER_LABELS = {
    'alert': '告警事件', 'manual': '手动触发',
    'schedule': '定时任务', 'webhook': 'Webhook',
}

# 判定「上下文里是否真有数据」的字段（event / alert 各一组）
_EVENT_DATA_KEYS = ('event_code', 'eventCode', 'id', 'title',
                    'src_ip', 'sourceIp', 'related_alerts', 'relatedAlerts')
_ALERT_DATA_KEYS = ('src_ip', 'dst_ip', 'alert_code', 'alertCode',
                    'id', 'title', 'hostname')

_IPV4_RE = re.compile(r'^(?:\d{1,3}\.){3}\d{1,3}$')
_IPV6_RE = re.compile(r'^(?:[0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$')


def _node_config(node) -> Dict:
    """取触发器节点配置：画布两种写法 node.config / node.data.config 都兼容。"""
    if not isinstance(node, dict):
        return {}
    cfg = node.get('config')
    if isinstance(cfg, dict) and cfg:
        return cfg
    data = node.get('data')
    if isinstance(data, dict):
        return data.get('config') or {}
    return {}


def _trigger_aliases() -> Dict:
    """触发类型别名表（单一来源：引擎的 PlaybookEngine.TRIGGER_TYPE_ALIASES）。"""
    try:
        from app.engine.playbook_engine import PlaybookEngine
        return dict(PlaybookEngine.TRIGGER_TYPE_ALIASES)
    except Exception:
        return {'告警事件': 'alert', 'alert': 'alert', 'event': 'alert', '告警': 'alert',
                '定时任务': 'schedule', 'schedule': 'schedule', 'cron': 'schedule',
                '手动触发': 'manual', 'manual': 'manual',
                'webhook': 'webhook', 'Webhook': 'webhook'}


def resolve_playbook_trigger_type(playbook) -> str:
    """剧本触发类型（归一为 alert / manual / schedule / webhook）。

    单一数据源：优先触发器节点 config.triggerType（旧数据 trigger_type），
    回退剧本顶层 trigger_type。
    """
    raw = ''
    for node in (playbook.nodes or []):
        if not isinstance(node, dict):
            continue
        if (node.get('typeId') or node.get('type')) != 'trigger':
            continue
        cfg = _node_config(node)
        raw = cfg.get('triggerType') or cfg.get('trigger_type') or ''
        if raw:
            break
    if not raw:
        raw = getattr(playbook, 'trigger_type', '') or ''
    key = str(raw).strip()
    return _trigger_aliases().get(key, key.lower())


def context_has_data(event, alert) -> bool:
    """event / alert 是否提供了实质数据（非空壳、非纯占位）。"""
    def _has(d, keys):
        d = d if isinstance(d, dict) else {}
        for k in keys:
            v = d.get(k)
            if isinstance(v, (list, tuple)):
                if len(v):
                    return True
            elif isinstance(v, dict):
                if v:
                    return True
            elif v not in (None, '', 'N/A'):
                return True
        return False
    return _has(event, _EVENT_DATA_KEYS) or _has(alert, _ALERT_DATA_KEYS)


def validate_execution_request(playbook, trigger_type: str = 'manual',
                               event: Dict = None, alert: Dict = None,
                               params: Dict = None):
    """执行前置校验，返回 (effective_params, error)；error 为 None 表示通过。

    error 结构：{code, message, missing[], invalid[], schema}
      code='trigger_context_required'：事件触发剧本没有可执行的上下文
      code='invalid_inputs'：必填入参缺失或格式错误
    """
    event = event if isinstance(event, dict) else {}
    alert = alert if isinstance(alert, dict) else {}

    pb_trigger = resolve_playbook_trigger_type(playbook)
    if pb_trigger == 'alert' and not context_has_data(event, alert):
        label = TRIGGER_LABELS.get(pb_trigger, pb_trigger)
        return None, {
            'code': 'trigger_context_required',
            'message': (f'剧本「{playbook.name}」触发类型为「{label}」，必须由安全事件或告警'
                        f'提供上下文才能执行；手动执行没有可传递的数据，请到事件工作台执行'),
            'trigger_type': pb_trigger,
        }

    schema = build_playbook_param_schema(playbook, event, alert)
    effective = resolve_effective_inputs(schema, collect_submitted_inputs(playbook, params))

    missing, invalid = [], []
    for d in schema.get('inputs', []):
        key = d.get('key')
        label = d.get('label') or key
        v = str(effective.get(key, '') or '').strip()
        if d.get('required') and not v:
            missing.append({'key': key, 'label': label, 'type': d.get('type') or 'text'})
            continue
        if v and d.get('type') == 'ip' and not (_IPV4_RE.match(v) or _IPV6_RE.match(v)):
            invalid.append({'key': key, 'label': label, 'value': v,
                            'reason': 'IP 格式不正确（示例：192.168.1.100）'})
    if missing or invalid:
        parts = []
        if missing:
            parts.append('缺少必填入参：' + '、'.join(
                f"「{m['label']}」" for m in missing))
        if invalid:
            parts.append('；'.join(f"入参「{i['label']}」{i['reason']}" for i in invalid))
        return None, {
            'code': 'invalid_inputs',
            'message': f'剧本「{playbook.name}」入参校验失败：' + '；'.join(parts),
            'missing': missing,
            'invalid': invalid,
            'schema': schema,
        }

    return effective, None
