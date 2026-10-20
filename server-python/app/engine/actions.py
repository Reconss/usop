"""
剧本动作处理器 - 支持 IP 封堵、通知、Webhook、脚本执行等操作
"""
import subprocess
import json
import os
import re
from datetime import datetime
from typing import Any, Dict, Optional


def _parse_duration_str(expr: str) -> int:
    """解析时长表达式：30s / 5m / 2h / 1d，纯数字按秒；无法解析返回 0。"""
    m = re.fullmatch(r'(\d+)\s*([smhd]?)', str(expr or '').strip().lower())
    if not m:
        return 0
    return int(m.group(1)) * {'': 1, 's': 1, 'm': 60, 'h': 3600, 'd': 86400}[m.group(2)]


class ActionResult:
    """动作执行结果

    items: 可选的 n8n 风格输出项（[{json, paired_items}]）。
    动作若显式产出 items，引擎以其为准向下游传递；未产出时沿用
    「结果 data 合并进输入项」的累积语义。
    """

    def __init__(self, success: bool, message: str, data: Dict = None, items: list = None):
        self.success = success
        self.message = message
        self.data = data or {}
        # n8n 语义：查询类动作返回的 data.items（行列表）自动展开为逐行输出 items，
        # 让下游过滤/AI 节点能按 {{ $json.字段 }} 逐条处理（2026-10-18 缺陷修复：
        # 此前行被嵌在 data.items 里，下游只能拿到一个合并项）。
        if items is None and isinstance(self.data.get('items'), list):
            items = [{'json': (i.get('json') if isinstance(i, dict) and 'json' in i else i),
                      'paired_items': []} for i in self.data['items']]
        self.items = items
        self.timestamp = datetime.utcnow()

    def to_dict(self):
        d = {
            'success': self.success,
            'message': self.message,
            'data': self.data,
            'timestamp': self.timestamp.isoformat()
        }
        if self.items is not None:
            d['items'] = self.items
        return d


class NodeOutput:
    """n8n 风格的节点输出：一组 items，每个 item 为 {'json': {...}, 'paired_items': [...]}。

    paired_items 记录该 item 由上游哪些 item 产生（item linking），
    使 {{ $('上游节点').item.json.x }} 能追溯到真正产出当前数据项的源。
    """

    def __init__(self, items: list = None, node_name: str = ''):
        self.items = []
        for it in (items or []):
            self.items.append(self._coerce(it))
        self.node_name = node_name

    @staticmethod
    def _coerce(it):
        if not isinstance(it, dict):
            return {'json': {'value': it}, 'paired_items': []}
        if 'json' in it:
            return {'json': it['json'] if isinstance(it['json'], dict) else {'value': it['json']},
                    'paired_items': it.get('paired_items', []) or []}
        # 裸 dict 视为 json 负载
        return {'json': it, 'paired_items': []}

    @property
    def is_empty(self) -> bool:
        return len(self.items) == 0

    def all_items(self) -> list:
        return self.items

    def all_json(self) -> list:
        return [i['json'] for i in self.items]

    def first_json(self):
        return self.items[0]['json'] if self.items else None

    def last_json(self):
        return self.items[-1]['json'] if self.items else None

    def to_dict(self):
        return {'node_name': self.node_name, 'count': len(self.items),
                'items': self.items[:50]}


class ActionContext:
    """动作执行上下文 - 在节点间传递

    数据模型（对齐 n8n）：
      items        当前节点的输入项列表（[{json, paired_items}, ...]）
      node_outputs 已执行节点的输出注册表：{节点名/节点ID: NodeOutput}
    表达式：
      {{ $json.field }}                    当前输入项字段
      {{ $('节点名').json.field }}          指定节点的首个输出项
      {{ $('节点名').first().json.field }}  显式取首项
      {{ $('节点名').all().length }}        输出项数量
      {{ $items('节点名') }}                全部输出项（json 列表）
      {{ $input.item.json.field }}         直接上游项
    旧语法 {{src_ip}} / {{event.title}} / {{alert.src_ip}} 继续兼容。
    """

    def __init__(self, event: Dict = None, alert: Dict = None,
                 params: Dict = None, previous_results: list = None):
        self.event = event or {}
        self.alert = alert or {}
        self.params = params or {}
        self.previous_results = previous_results or []
        self.variables = {}  # 节点间共享变量
        self.items = []  # 当前节点输入项（n8n items）
        self.node_outputs = {}  # {节点名 或 节点ID: NodeOutput}
        self.current_node = ''  # 当前执行节点名（供 $input/$json 定位）
        self.current_node_id = ''
        self.playbook_id = None

    # 取值优先级（单级变量 {{src_ip}} 按此顺序查找）
    _SOURCES = ('event', 'alert', 'params', 'variables')

    def _lookup(self, source: str, field: str, default=''):
        mapping = {
            'event': self.event, 'alert': self.alert,
            'params': self.params, 'variables': self.variables,
        }
        return mapping.get(source, {}).get(field, default)

    def _lookup_auto(self, field: str, default=''):
        """单级变量：按 event > alert > params > variables 顺序取值"""
        for source in self._SOURCES:
            mapping = {
                'event': self.event, 'alert': self.alert,
                'params': self.params, 'variables': self.variables,
            }[source]
            if isinstance(mapping, dict) and field in mapping and mapping[field] not in (None, ''):
                return mapping[field]
        return default

    # ---------- n8n 风格节点输出引用 ----------
    _RE_CACHE = None

    @staticmethod
    def _patterns():
        import re as _re
        if ActionContext._RE_CACHE is None:
            ActionContext._RE_CACHE = {
                'node': _re.compile(
                    r"\{\{\s*\$\(\s*['\"]([^'\"]+)['\"]\s*\)\s*((?:\.[^}\s]+)*)\s*\}\}"),
                'items': _re.compile(
                    r"\{\{\s*\$items\(\s*['\"]([^'\"]+)['\"]\s*\)\s*((?:\.[^}\s]+)*)\s*\}\}"),
                'input': _re.compile(
                    r"\{\{\s*\$input\s*((?:\.[^}\s]+)*)\s*\}\}"),
                'json': _re.compile(
                    r"\{\{\s*\$json\s*((?:\.[^}\s]+|\[[^\]]+\])*)\s*\}\}"),
            }
        return ActionContext._RE_CACHE

    def set_node_output(self, name: str, node_id: str, items: list):
        """注册节点输出，供下游 {{ $('节点名').json.x }} 引用。"""
        out = NodeOutput(items, node_name=name or node_id or '')
        if name:
            self.node_outputs[str(name)] = out
        if node_id:
            self.node_outputs[str(node_id)] = out
        return out

    def get_node_output(self, name: str) -> 'NodeOutput':
        """按节点名或节点 ID 取输出；未执行过的节点返回空输出（不报错）。"""
        return self.node_outputs.get(str(name)) or NodeOutput([], node_name=str(name))

    def set_input_items(self, items: list):
        """设置当前节点的输入项。"""
        self.items = [NodeOutput._coerce(i) for i in (items or [])]

    def input_output(self) -> 'NodeOutput':
        return NodeOutput(self.items, node_name=self.current_node)

    def snapshot_json(self) -> dict:
        """无 items 时的回退负载：合并 event/alert/params/variables。"""
        merged = {}
        for src in (self.event, self.alert, self.params, self.variables):
            if isinstance(src, dict):
                merged.update(src)
        return merged

    def current_json(self) -> dict:
        """$json 基准：当前输入首项（若存在），并与上下文快照合并（输入项优先）。"""
        base = self.snapshot_json()
        if self.items:
            first = self.items[0].get('json')
            if isinstance(first, dict):
                base.update(first)
        return base

    def _walk(self, obj, tail: str):
        """沿 .a.b.c 路径取值，支持 first()/last()/all()/item/json/length。"""
        cur = obj
        segs = [s.replace('()', '') for s in (tail or '').split('.') if s and s != '()']
        for seg in segs:
            cur = self._step(cur, seg)
            if cur is None:
                return None
        return cur

    def _step(self, cur, seg: str):
        if isinstance(cur, NodeOutput):
            if seg in ('first', 'item'):
                return cur.items[0] if cur.items else None
            if seg == 'last':
                return cur.items[-1] if cur.items else None
            if seg == 'all':
                return cur.items
            if seg == 'json':
                return cur.first_json()
            if seg == 'length':
                return len(cur.items)
            return None
        if isinstance(cur, dict):
            return cur.get(seg)
        if isinstance(cur, (list, tuple)):
            if seg == 'length':
                return len(cur)
            if seg == 'json':  # 投影：取出每项的 json
                return [(x.get('json') if isinstance(x, dict) and 'json' in x else x) for x in cur]
            if seg.lstrip('-').isdigit():
                idx = int(seg)
                return cur[idx] if -len(cur) <= idx < len(cur) else None
            return [x.get(seg) for x in cur if isinstance(x, dict)]
        return None

    @staticmethod
    def _stringify(val) -> str:
        """取到的值转成可嵌入字符串的形式（dict/list 用 JSON）。"""
        if val is None:
            return ''
        if isinstance(val, (dict, list)):
            try:
                return json.dumps(val, ensure_ascii=False)
            except Exception:
                return str(val)
        if isinstance(val, bool):
            return 'true' if val else 'false'
        return str(val)

    def resolve(self, value: Any) -> Any:
        """解析模板变量。

        n8n 风格（节点间数据引用）：
          {{ $json.field }}                    当前输入项字段
          {{ $('节点名').json.field }}          指定节点输出的首项
          {{ $('节点名').first().json.field }}  显式首项
          {{ $('节点名').all().length }}        输出项数量
          {{ $items('节点名') }}                全部输出项
          {{ $input.item.json.field }}         直接上游项
        兼容旧语法：
          {{event.field}} {{alert.src_ip}} {{params.key}} {{variables.name}}
          {{src_ip}}                           自动按 event/alert/params/variables 查找
          {{event.data.foo}}                   多级路径
        未命中的表达式原样保留（不静默吞掉，便于排障）。
        """
        if not isinstance(value, str):
            return value

        import re as _re
        pats = self._patterns()
        result = value

        # 1) {{ $('节点名').xxx }}
        for m in pats['node'].finditer(value):
            full, name, tail = m.group(0), m.group(1), m.group(2)
            val = self._walk(self.get_node_output(name), tail)
            if val is None:
                continue
            result = result.replace(full, self._stringify(val))

        # 2) {{ $items('节点名').xxx }}
        for m in pats['items'].finditer(value):
            full, name, tail = m.group(0), m.group(1), m.group(2)
            val = self._walk(self.get_node_output(name).all_json(), tail)
            if val is None:
                continue
            result = result.replace(full, self._stringify(val))

        # 3) {{ $input.item.json.x }} / {{ $input.all() }}
        for m in pats['input'].finditer(value):
            full, tail = m.group(0), m.group(1)
            val = self._walk(self.input_output(), tail)
            if val is None:
                continue
            result = result.replace(full, self._stringify(val))

        # 4) {{ $json.field }}
        for m in pats['json'].finditer(value):
            full, tail = m.group(0), m.group(1)
            val = self._walk(self.current_json(), tail)
            if val is None:
                continue
            result = result.replace(full, self._stringify(val))

        # 4.5) Coze 风格 {{ 节点名.字段 }}：节点名命中已执行节点时按其输出解析。
        #     （节点名多为中文，旧语法的 ASCII 正则匹配不到，两者互不干扰）
        for m in _re.finditer(r'\{\{\s*([^{}$][^{}]*?)\s*\}\}', result):
            full, expr = m.group(0), m.group(1)
            if expr.startswith('$'):
                continue
            parts = expr.split('.')
            head = parts[0].strip().strip('\'"')
            if head not in self.node_outputs:
                continue
            # 节点引用默认取首项 json：{{ 节点.字段 }} 等价于 {{ 节点.json.字段 }}
            rest = parts[1:]
            if not rest:
                tail = '.json'
            elif rest[0].lower() == 'json':
                tail = '.' + '.'.join(rest)
            else:
                tail = '.json.' + '.'.join(rest)
            val = self._walk(self.get_node_output(head), tail)
            if val is None:
                continue
            result = result.replace(full, self._stringify(val))

        # 5) 旧语法：多级 {{a.b.c}}（允许空格：{{ src_ip }} / {{ event.category }} 是前端引用的常见写法）
        for match in _re.finditer(r'\{\{\s*(\w+)\s*((?:\.\s*\w+\s*)+)\}\}', result):
            full = match.group(0)
            source = match.group(1)
            path = [p.strip() for p in match.group(2).lstrip('.').split('.')]
            cur = self._lookup(source, path[0], None)
            for seg in path[1:]:
                if isinstance(cur, dict):
                    cur = cur.get(seg)
                else:
                    cur = None
                    break
            if cur is not None:
                result = result.replace(full, str(cur))

        # 6) 旧语法：单级 {{field}}（允许空格：{{ src_ip }} —— 2026-10-18 缺陷修复，
        #    原正则 \{\{(\w+)\}\} 匹配不到带空格的 {{ src_ip }}，导致表达式原样残留）
        for match in _re.finditer(r'\{\{\s*(\w+)\s*\}\}', result):
            full = match.group(0)
            field = match.group(1)
            val = self._lookup_auto(field, None)
            if val is None and self.items:
                # 上游节点产出的字段（如过滤/聚合后的结果）也允许裸引用
                val = self.items[0].get('json', {}).get(field)
            if val is not None:
                result = result.replace(full, self._stringify(val))

        return result

    def get(self, field: str, default=None):
        """从上下文取值，优先级: event > alert > params > variables"""
        for source in [self.event, self.alert, self.params, self.variables]:
            if isinstance(source, dict) and field in source:
                return source[field]
        return default


# ─── IP 封堵管理 ─────────────────────────────────────────────

class IPBlockManager:
    """IP 封堵管理器

    支持多种封堵方式:
    - iptables (本地)
    - API 回调 (外部防火墙/封堵设备)
    - 平台封堵名单 (SystemConfig 持久化，重启不丢，供「已封堵 IP」列表查询/解封)
    """

    _STORE_KEY = 'blocked_ips'   # SystemConfig key（JSON: ip -> entry）

    @classmethod
    def _load_blocks(cls) -> Dict:
        """从 SystemConfig 读取封堵名单（内存 dict 会在重启后丢失，导致解封/列表失真）。"""
        try:
            from app.models import SystemConfig
            row = SystemConfig.query.filter_by(key=cls._STORE_KEY).first()
            if row and row.value:
                data = json.loads(row.value)
                if isinstance(data, dict):
                    return data
        except Exception:
            pass
        return {}

    @classmethod
    def _purge_expired(cls, blocks: Dict) -> Dict:
        """清理已过封堵时长的条目（duration 到期自动失效，写回存储）。"""
        now = datetime.utcnow()
        alive = {}
        for ip, entry in blocks.items():
            exp = entry.get('expires_at') if isinstance(entry, dict) else None
            if exp:
                try:
                    if datetime.fromisoformat(exp) <= now:
                        continue
                except (ValueError, TypeError):
                    pass
            alive[ip] = entry
        if len(alive) != len(blocks):
            cls._save_blocks(alive)
        return alive

    @classmethod
    def _save_blocks(cls, blocks: Dict) -> None:
        try:
            from app.database import db
            from app.models import SystemConfig
            row = SystemConfig.query.filter_by(key=cls._STORE_KEY).first()
            if not row:
                row = SystemConfig(key=cls._STORE_KEY, value='', category='playbook')
                db.session.add(row)
            row.value = json.dumps(blocks, ensure_ascii=False)
            row.category = 'playbook'
            db.session.commit()
        except Exception:
            db.session.rollback()

    @classmethod
    def block_ip(cls, ip: str, reason: str = "", source: str = "playbook",
                 device_api: str = None, device_token: str = None,
                 duration: str = "") -> ActionResult:
        """封堵 IP（duration 形如 24h/30m/7d，到期自动失效；留空长期有效）"""
        if not ip or ip in ('0.0.0.0', '127.0.0.1', '::1'):
            return ActionResult(False, f'不允许封堵保留 IP: {ip}')

        blocks = cls._purge_expired(cls._load_blocks())
        # 检查是否已封堵
        if ip in blocks:
            return ActionResult(False, f'IP {ip} 已被封堵', blocks[ip])

        block_entry = {
            'ip': ip,
            'reason': reason,
            'source': source,
            'timestamp': datetime.utcnow().isoformat(),
            'method': 'api'
        }

        # 封堵时长 → 过期时间（节点「封堵时长」字段的真实落点）
        seconds = _parse_duration_str(duration)
        if seconds > 0:
            from datetime import timedelta
            block_entry['duration'] = duration
            block_entry['expires_at'] = (datetime.utcnow() + timedelta(seconds=seconds)).isoformat()

        # 尝试通过 iptables 封堵
        iptables_result = cls._block_via_iptables(ip, reason)
        if iptables_result:
            block_entry['method'] = 'iptables'
        elif device_api:
            # 通过外部设备 API 封堵
            api_result = cls._block_via_api(ip, reason, device_api, device_token)
            if not api_result.success:
                return api_result
            block_entry['method'] = 'device_api'

        blocks[ip] = block_entry
        cls._save_blocks(blocks)

        # 记录到文件（持久化审计）
        cls._log_block_action('block', ip, reason, source)

        return ActionResult(True, f'IP {ip} 封堵成功 [{block_entry["method"]}]'
                            + (f'（{duration} 后自动解除）' if seconds > 0 else ''),
                            block_entry)

    @classmethod
    def unblock_ip(cls, ip: str, reason: str = "") -> ActionResult:
        """解封 IP"""
        blocks = cls._purge_expired(cls._load_blocks())
        if ip not in blocks:
            return ActionResult(False, f'IP {ip} 未被封堵')

        block_entry = blocks.pop(ip)
        cls._save_blocks(blocks)

        # 清理 iptables 规则
        if block_entry.get('method') == 'iptables':
            cls._unblock_via_iptables(ip)

        cls._log_block_action('unblock', ip, reason, block_entry.get('source', ''))

        return ActionResult(True, f'IP {ip} 解封成功', block_entry)

    @classmethod
    def is_blocked(cls, ip: str) -> bool:
        """是否处于封堵状态（已过时长的不算）"""
        return ip in cls._purge_expired(cls._load_blocks())

    @classmethod
    def list_blocks(cls) -> list:
        """封堵名单（含剩余时长；过期条目自动清理）"""
        blocks = cls._purge_expired(cls._load_blocks())
        now = datetime.utcnow()
        out = []
        for ip, info in blocks.items():
            entry = {'ip': ip, **(info if isinstance(info, dict) else {})}
            exp = entry.get('expires_at')
            if exp:
                try:
                    entry['remaining_seconds'] = max(
                        0, int((datetime.fromisoformat(exp) - now).total_seconds()))
                except (ValueError, TypeError):
                    pass
            out.append(entry)
        return out

    @classmethod
    def _block_via_iptables(cls, ip: str, reason: str) -> bool:
        """通过 iptables 封堵"""
        try:
            comment = f"USOP-block: {reason[:50]}" if reason else "USOP-block"
            subprocess.run(
                ['iptables', '-A', 'INPUT', '-s', ip, '-j', 'DROP',
                 '-m', 'comment', '--comment', comment],
                capture_output=True, timeout=10, check=False
            )
            subprocess.run(
                ['iptables', '-A', 'FORWARD', '-s', ip, '-j', 'DROP',
                 '-m', 'comment', '--comment', comment],
                capture_output=True, timeout=10, check=False
            )
            return True
        except Exception:
            return False

    @classmethod
    def _unblock_via_iptables(cls, ip: str) -> bool:
        """通过 iptables 解封"""
        try:
            subprocess.run(
                ['iptables', '-D', 'INPUT', '-s', ip, '-j', 'DROP'],
                capture_output=True, timeout=10, check=False
            )
            subprocess.run(
                ['iptables', '-D', 'FORWARD', '-s', ip, '-j', 'DROP'],
                capture_output=True, timeout=10, check=False
            )
            return True
        except Exception:
            return False

    @classmethod
    def _block_via_api(cls, ip: str, reason: str, api_url: str, token: str) -> ActionResult:
        """通过外部设备 API 封堵"""
        try:
            import urllib.request
            import urllib.error

            payload = json.dumps({
                'action': 'block_ip',
                'ip': ip,
                'reason': reason,
                'timestamp': datetime.utcnow().isoformat()
            }).encode()

            req = urllib.request.Request(api_url, data=payload, method='POST')
            req.add_header('Content-Type', 'application/json')
            if token:
                req.add_header('Authorization', f'Bearer {token}')

            urllib.request.urlopen(req, timeout=15)
            return ActionResult(True, f'IP {ip} 已通过 API 提交封堵')
        except urllib.error.HTTPError as e:
            return ActionResult(False, f'API 封堵失败: HTTP {e.code}')
        except Exception as e:
            return ActionResult(False, f'API 封堵失败: {str(e)}')

    @classmethod
    def _log_block_action(cls, action: str, ip: str, reason: str, source: str):
        """记录封堵/解封动作到文件"""
        log_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'logs')
        os.makedirs(log_dir, exist_ok=True)
        log_file = os.path.join(log_dir, 'ip_blocks.log')
        entry = {
            'action': action,
            'ip': ip,
            'reason': reason,
            'source': source,
            'timestamp': datetime.utcnow().isoformat()
        }
        with open(log_file, 'a') as f:
            f.write(json.dumps(entry, ensure_ascii=False) + '\n')


# ─── 动作处理器注册 ──────────────────────────────────────────

class ActionHandler:
    """动作处理器基类"""

    name = ""
    description = ""

    @classmethod
    def _get_db_config(cls, key: str, default: str = '') -> str:
        """从 DB 获取 AI 提供商配置"""
        try:
            from app.models import SystemConfig
            cfg = SystemConfig.query.filter_by(key=f'ai_provider_{key}').first()
            if cfg and cfg.value:
                return cfg.value
        except Exception:
            pass
        return os.getenv(key.upper(), default)

    @classmethod
    def execute(cls, config: Dict, context: ActionContext) -> ActionResult:
        raise NotImplementedError


class BlockIPAction(ActionHandler):
    name = "block_ip"
    description = "封堵 IP 地址"

    @classmethod
    def _get_db_config(cls, key: str, default: str = '') -> str:
        """从 DB 获取 AI 提供商配置"""
        try:
            from app.models import SystemConfig
            cfg = SystemConfig.query.filter_by(key=f'ai_provider_{key}').first()
            if cfg and cfg.value:
                return cfg.value
        except Exception:
            pass
        return os.getenv(key.upper(), default)

    @classmethod
    def execute(cls, config: Dict, context: ActionContext) -> ActionResult:
        ip = context.resolve(config.get('ip', '')) or context.get('src_ip', '')
        reason = context.resolve(config.get('reason', '安全事件处置'))
        duration = context.resolve(config.get('duration', '') or '')

        if not ip:
            return ActionResult(False, '未指定要封堵的 IP 地址')

        # 前端字段名为 api_url / api_token，兼容旧 device_api / device_token
        device_api = config.get('device_api') or config.get('api_url')
        device_token = config.get('device_token') or config.get('api_token')

        return IPBlockManager.block_ip(
            ip, reason,
            device_api=device_api,
            device_token=device_token,
            duration=duration
        )


class UnblockIPAction(ActionHandler):
    name = "unblock_ip"
    description = "解封 IP 地址"

    @classmethod
    def _get_db_config(cls, key: str, default: str = '') -> str:
        """从 DB 获取 AI 提供商配置"""
        try:
            from app.models import SystemConfig
            cfg = SystemConfig.query.filter_by(key=f'ai_provider_{key}').first()
            if cfg and cfg.value:
                return cfg.value
        except Exception:
            pass
        return os.getenv(key.upper(), default)

    @classmethod
    def execute(cls, config: Dict, context: ActionContext) -> ActionResult:
        ip = context.resolve(config.get('ip', '')) or context.get('src_ip', '')
        if not ip:
            return ActionResult(False, '未指定要解封的 IP 地址')
        return IPBlockManager.unblock_ip(ip, config.get('reason', '手动解封'))


class QuarantineHostAction(ActionHandler):
    name = "quarantine_host"
    description = "隔离主机"

    @classmethod
    def _get_db_config(cls, key: str, default: str = '') -> str:
        """从 DB 获取 AI 提供商配置"""
        try:
            from app.models import SystemConfig
            cfg = SystemConfig.query.filter_by(key=f'ai_provider_{key}').first()
            if cfg and cfg.value:
                return cfg.value
        except Exception:
            pass
        return os.getenv(key.upper(), default)

    @classmethod
    def execute(cls, config: Dict, context: ActionContext) -> ActionResult:
        hostname = context.resolve(config.get('hostname', '')) or context.get('hostname', '')
        ip = context.resolve(config.get('ip', '')) or context.get('src_ip', '')
        duration = context.resolve(config.get('duration', '') or '')

        if not hostname and not ip:
            return ActionResult(False, '未指定要隔离的主机')

        target = hostname or ip

        # 优先走 EDR / SDN 隔离 API（真正的隔离）；未配置则降级为封 IP 并标注
        isolate_api = config.get('api_url') or config.get('isolate_api')
        if isolate_api:
            try:
                import urllib.request
                payload = json.dumps({
                    'hostname': hostname, 'ip': ip, 'action': 'isolate',
                    'duration': duration,
                }).encode()
                req = urllib.request.Request(isolate_api, data=payload, method='POST')
                req.add_header('Content-Type', 'application/json')
                token = config.get('api_token') or config.get('api_key')
                if token:
                    req.add_header('Authorization', f'Bearer {token}')
                with urllib.request.urlopen(req, timeout=15) as r:
                    return ActionResult(True, f'主机 {target} 已提交隔离（EDR API HTTP {r.status}）',
                                        {'hostname': hostname, 'ip': ip, 'method': 'edr_api',
                                         'duration': duration})
            except Exception as e:
                return ActionResult(False, f'EDR 隔离 API 调用失败: {str(e)[:120]}',
                                    {'hostname': hostname, 'ip': ip})

        # 降级：仅封 IP（非真正主机隔离，明确提示）
        if ip:
            IPBlockManager.block_ip(ip, f'主机隔离(降级为封IP): {target}', 'quarantine',
                                    duration=duration)
        return ActionResult(True, f'主机 {target} 已降级隔离（仅封 IP，未接 EDR，请在节点配置 api_url）',
                            {'hostname': hostname, 'ip': ip, 'method': 'block_ip_fallback',
                             'duration': duration})


class SendNotificationAction(ActionHandler):
    """发送通知动作：与「发送通知」节点共用 notify_service.execute_notification。

    config 兼容两种写法：
      节点风格 {channel, title, content, webhook_url, recipients}
      动作风格 {channel, title, message, url, to}
    渠道值支持中文（企业微信/钉钉/飞书/Slack/Webhook/邮件）。
    """

    name = "send_notification"
    description = "发送通知（企微/钉钉/飞书/Slack/Webhook/邮件，走全局配置→通知渠道默认值）"

    @classmethod
    def execute(cls, config: Dict, context: ActionContext) -> ActionResult:
        from app.utils import notify_service
        result = notify_service.execute_notification(config, context)
        return ActionResult(result.get('success', False),
                            result.get('message', ''),
                            result.get('data', {}))


class WebhookAction(ActionHandler):
    name = "webhook"
    description = "调用外部 Webhook"

    @classmethod
    def _coerce_headers(cls, raw: str) -> Dict:
        """把「每行一条 Name: value」或 JSON 文本解析成 dict。"""
        raw = (raw or '').strip()
        if not raw:
            return {}
        if raw.startswith('{'):
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, dict):
                    return parsed
            except (ValueError, TypeError):
                pass
        headers = {}
        for line in raw.splitlines():
            line = line.strip()
            if not line or ':' not in line:
                continue
            k, _, v = line.partition(':')
            k = k.strip()
            if k:
                headers[k] = v.strip()
        return headers

    @classmethod
    def _get_db_config(cls, key: str, default: str = '') -> str:
        """从 DB 获取 AI 提供商配置"""
        try:
            from app.models import SystemConfig
            cfg = SystemConfig.query.filter_by(key=f'ai_provider_{key}').first()
            if cfg and cfg.value:
                return cfg.value
        except Exception:
            pass
        return os.getenv(key.upper(), default)

    @classmethod
    def execute(cls, config: Dict, context: ActionContext) -> ActionResult:
        url = context.resolve(config.get('url', ''))
        method = config.get('method', 'POST').upper()
        headers = config.get('headers') or {}
        body = config.get('body')

        if not url:
            return ActionResult(False, '未指定 Webhook URL')

        # headers 兼容三种形态：dict / JSON 字符串 / 每行 "Key: value" 文本
        if isinstance(headers, str):
            headers = cls._coerce_headers(headers)

        # body 兼容 dict / JSON 字符串 / 任意文本（文本原样发送）
        raw_body: bytes
        if isinstance(body, str):
            s = context.resolve(body).strip()
            if not s:
                raw_body = b''
            elif s.startswith(('{', '[')):
                raw_body = s.encode()
                headers.setdefault('Content-Type', 'application/json')
            else:
                raw_body = s.encode()
        elif body:
            body_str = context.resolve(json.dumps(body))
            raw_body = body_str.encode()
            headers.setdefault('Content-Type', 'application/json')
        else:
            raw_body = b''

        try:
            import urllib.request
            import urllib.error

            req = urllib.request.Request(url, data=raw_body or None, method=method)
            for key, val in (headers or {}).items():
                req.add_header(str(key), context.resolve(str(val)))
            if raw_body and not req.has_header('Content-Type'):
                req.add_header('Content-Type', 'application/json')

            with urllib.request.urlopen(req, timeout=30) as resp:
                result_data = resp.read().decode()
                return ActionResult(True, f'Webhook 调用成功 (HTTP {resp.status})',
                                    {'status': resp.status, 'response': result_data[:500]})
        except urllib.error.HTTPError as e:
            return ActionResult(False, f'Webhook 失败: HTTP {e.code}')
        except Exception as e:
            return ActionResult(False, f'Webhook 失败: {str(e)}')


class RunScriptAction(ActionHandler):
    name = "run_script"
    description = "执行脚本"

    # 前端「语言」选项 → 实际执行器（容器无 node，Node.js 会明确报错而非静默走 bash）
    _LANG_MAP = {
        'python': 'python', 'py': 'python',
        'bash': 'bash', 'shell': 'bash', 'sh': 'bash',
        'node': 'node', 'node.js': 'node', 'js': 'node',
    }

    @classmethod
    def _get_db_config(cls, key: str, default: str = '') -> str:
        """从 DB 获取 AI 提供商配置"""
        try:
            from app.models import SystemConfig
            cfg = SystemConfig.query.filter_by(key=f'ai_provider_{key}').first()
            if cfg and cfg.value:
                return cfg.value
        except Exception:
            pass
        return os.getenv(key.upper(), default)

    @classmethod
    def execute(cls, config: Dict, context: ActionContext) -> ActionResult:
        script = config.get('script', '')
        # 语言来源：前端 language（Python/Bash）；兼容旧 script_type
        lang_raw = str(config.get('language') or config.get('script_type') or 'bash').strip()
        script_type = cls._LANG_MAP.get(lang_raw.lower(), 'bash')
        try:
            timeout = int(config.get('timeout') or 60)
        except (TypeError, ValueError):
            timeout = 60

        if not script:
            return ActionResult(False, '未指定要执行的脚本')

        # 将上下文变量注入脚本环境（USOP_EVENT_<字段> / USOP_PARAM_<字段>）
        env = os.environ.copy()
        for key, val in (context.event or {}).items():
            env[f'USOP_EVENT_{key.upper()}'] = str(val) if val else ''
        for key, val in (context.params or {}).items():
            env[f'USOP_PARAM_{key.upper()}'] = str(val) if val else ''

        try:
            if script_type == 'python':
                cmd = ['python3', '-c', script]
            elif script_type == 'node':
                cmd = ['node', '-e', script]
            else:
                cmd = ['bash', '-c', script]
            result = subprocess.run(
                cmd,
                capture_output=True, text=True,
                timeout=timeout, env=env
            )

            success = result.returncode == 0
            msg = '脚本执行成功' if success else f'脚本执行失败 (exit {result.returncode})'
            data = {
                'language': script_type,
                'stdout': result.stdout[-2000:] if result.stdout else '',
                'stderr': result.stderr[-2000:] if result.stderr else '',
                'returncode': result.returncode
            }
            return ActionResult(success, msg, data)
        except subprocess.TimeoutExpired:
            return ActionResult(False, f'脚本执行超时 ({timeout}s)')
        except FileNotFoundError:
            return ActionResult(False, f'执行器 {script_type} 不存在（容器内未安装），请改用 Python/Bash')
        except Exception as e:
            return ActionResult(False, f'脚本执行异常: {str(e)}')


class UpdateEventAction(ActionHandler):
    name = "update_event"
    description = "更新事件状态/严重度"

    @classmethod
    def _get_db_config(cls, key: str, default: str = '') -> str:
        """从 DB 获取 AI 提供商配置"""
        try:
            from app.models import SystemConfig
            cfg = SystemConfig.query.filter_by(key=f'ai_provider_{key}').first()
            if cfg and cfg.value:
                return cfg.value
        except Exception:
            pass
        return os.getenv(key.upper(), default)

    @classmethod
    def execute(cls, config: Dict, context: ActionContext) -> ActionResult:
        # 节点显式配置优先于上下文继承（否则引用 {{ event_code }} 缺失时会被上下文顶掉、
        # 而上下文里的 event_code 又会顶掉节点里想更新其它事件的显式编号）
        event_code = (context.resolve(config.get('event_code') or '')
                      or context.get('event_code') or '')

        if not event_code:
            return ActionResult(False, '未指定事件编号')

        updates = {}
        if 'status' in config:
            updates['status'] = context.resolve(config['status'])
        if 'severity' in config:
            updates['severity'] = context.resolve(config['severity'])
        # 分析结论回写：写入 event.extra_data.ai_analysis（事件工作台「AI 分析」展示位）
        if 'analysis' in config:
            analysis = context.resolve(config.get('analysis') or '')
            if analysis:
                updates['_analysis'] = analysis

        if not updates:
            return ActionResult(False, '未指定要更新的字段')

        try:
            from app.database import db
            from app.models import Event
            event = Event.query.filter_by(event_code=event_code).first()
            if not event:
                return ActionResult(False, f'事件 {event_code} 不存在')

            for key, val in updates.items():
                if key == '_analysis':
                    extra = dict(event.extra_data or {})
                    extra['ai_analysis'] = {
                        'conclusion': val,
                        'is_ai': False,
                        'source': 'playbook',
                        'updated_at': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S'),
                    }
                    event.extra_data = extra
                else:
                    setattr(event, key, val)
            db.session.commit()

            return ActionResult(True, f'事件 {event_code} 已更新'
                                + ('（含分析结论）' if '_analysis' in updates else ''), updates)
        except Exception as e:
            db.session.rollback()
            return ActionResult(False, f'事件更新失败: {str(e)}')


class AddTagAction(ActionHandler):
    name = "add_tag"
    description = "添加标签到事件"

    @classmethod
    def _get_db_config(cls, key: str, default: str = '') -> str:
        """从 DB 获取 AI 提供商配置"""
        try:
            from app.models import SystemConfig
            cfg = SystemConfig.query.filter_by(key=f'ai_provider_{key}').first()
            if cfg and cfg.value:
                return cfg.value
        except Exception:
            pass
        return os.getenv(key.upper(), default)

    @classmethod
    def execute(cls, config: Dict, context: ActionContext) -> ActionResult:
        # 节点显式配置优先，回退上下文事件编号
        event_code = (context.resolve(config.get('event_code') or '')
                      or context.get('event_code') or '')
        tag = context.resolve(config.get('tag', ''))

        if not event_code or not tag:
            return ActionResult(False, '缺少事件编号或标签')

        try:
            from app.database import db
            from app.models import Event
            from sqlalchemy.orm.attributes import flag_modified
            event = Event.query.filter_by(event_code=event_code).first()
            if not event:
                return ActionResult(False, f'事件 {event_code} 不存在')

            extra = dict(event.extra_data) if event.extra_data else {}
            tags = list(extra.get('tags', []))
            if tag not in tags:
                tags.append(tag)
            extra['tags'] = tags
            event.extra_data = extra
            flag_modified(event, 'extra_data')
            db.session.commit()

            return ActionResult(True, f'标签 "{tag}" 已添加到事件 {event_code}', {'tags': tags})
        except Exception as e:
            db.session.rollback()
            return ActionResult(False, f'添加标签失败: {str(e)}')


class EnrichIPAction(ActionHandler):
    name = "enrich_ip"
    description = "威胁情报富化（微步在线 / VirusTotal）"

    # provider 名 → 已导入集成应用的 app_key（用于自动取凭证）
    _APP_KEY_MAP = {
        '微步在线': '微步在线威胁情报',
        'threatbook': '微步在线威胁情报',
        'vt': 'virustotal',
        'virustotal': 'virustotal',
    }

    @classmethod
    def _resolve_credential(cls, provider: str, node_api_key: str) -> tuple:
        """凭证解析：节点 api_key → 已导入集成应用的 credential → 环境变量。

        返回 (base_url, api_key)。优先级：节点显式 key 最高；其次取「集成应用」
        里同名 App 的已配置凭证（这样在「集成应用-微步在线」填过 key 即可复用）；
        最后回退到环境变量（THREATBOOK_API_KEY / VT_API_KEY）。
        """
        if node_api_key:
            return None, node_api_key
        try:
            from app.models import IntegrationApp
            p = (provider or '').strip().lower()
            app_key = cls._APP_KEY_MAP.get(p)
            app = None
            if app_key:
                app = IntegrationApp.query.filter_by(app_key=app_key).first()
            if app is None and provider:
                app = IntegrationApp.query.filter(
                    IntegrationApp.name.like(f'%{provider}%')).first()
            if app and app.credential:
                return app.base_url, app.credential
        except Exception:
            pass
        env_key = 'VT_API_KEY' if 'virus' in (provider or '').lower() else 'THREATBOOK_API_KEY'
        return None, os.getenv(env_key, '')

    @classmethod
    def execute(cls, config: Dict, context: ActionContext) -> ActionResult:
        value = (context.resolve(config.get('value', ''))
                 or context.get('src_ip', '') or context.get('dst_ip', ''))
        if not value:
            return ActionResult(False, '未指定要查询的值（节点 value 或触发数据 src_ip/dst_ip）')

        intel_type = config.get('type', 'IP情报')
        provider = config.get('provider', '微步在线')
        base_url, api_key = cls._resolve_credential(provider, config.get('api_key', ''))

        if '微步' in provider or 'threatbook' in provider.lower():
            return cls._enrich_threatbook(value, intel_type, api_key, base_url)
        # 其余（VirusTotal / 自定义）走 VirusTotal
        return cls._enrich_vt(value, intel_type, api_key)

    @classmethod
    def _enrich_threatbook(cls, value: str, intel_type: str, api_key: str, base_url: str) -> ActionResult:
        if not api_key:
            return ActionResult(False, '未配置微步在线 API Key：可在节点填 api_key，或在「集成应用-微步在线」配置凭证')
        # base_url 已含 basePath（如 https://api.threatbook.cn/v3）；path 用相对路径避免重复
        base = (base_url or 'https://api.threatbook.cn/v3').rstrip('/')
        if intel_type == '域名情报':
            path, param = '/domain/query', 'resource'
        elif intel_type in ('URL情报', 'URL'):
            path, param = '/url/scan', 'url'
        else:  # 默认 IP情报
            path, param = '/ip/query', 'resource'
        import urllib.parse
        url = f'{base}{path}?{param}={urllib.parse.quote(value)}&apikey={urllib.parse.quote(api_key)}&lang=zh'
        try:
            import urllib.request
            with urllib.request.urlopen(url, timeout=12) as resp:
                data = json.loads(resp.read().decode('utf-8'))
            # 微步响应没有「危害等级」字段：归一化为 threat_level / threat_score，
            # 否则下游 condition 无法判定（响应是嵌套的 data.<ip>.xxx）
            summary = {}
            try:
                from app.utils.threat_intel import normalize_threatbook_ip
                summary = normalize_threatbook_ip(data, value) or {}
            except Exception:
                summary = {}
            level = summary.get('threat_level') or 'unknown'
            score = summary.get('threat_score', 0)
            return ActionResult(True,
                                f'微步情报查询完成: {value}（危害等级 {level}，评分 {score}）',
                                {'provider': '微步在线', 'type': intel_type, 'value': value,
                                 'data': data, 'summary': summary})
        except Exception as e:
            return ActionResult(False, f'微步查询失败: {str(e)[:120]}')

    @classmethod
    def _enrich_vt(cls, value: str, intel_type: str, api_key: str) -> ActionResult:
        if not api_key:
            return ActionResult(False, '未配置 VirusTotal API Key（节点 api_key 或环境变量 VT_API_KEY）')
        try:
            import urllib.request
            if intel_type == '域名情报':
                url = f'https://www.virustotal.com/api/v3/domains/{urllib.parse.quote(value)}'
            elif intel_type in ('文件哈希', 'URL情报', 'URL'):
                url = f'https://www.virustotal.com/api/v3/{("urls" if "URL" in intel_type else "files")}/{urllib.parse.quote(value)}'
            else:
                url = f'https://www.virustotal.com/api/v3/ip_addresses/{urllib.parse.quote(value)}'
            req = urllib.request.Request(url)
            req.add_header('x-apikey', api_key)
            with urllib.request.urlopen(req, timeout=12) as resp:
                vt = json.loads(resp.read().decode('utf-8'))
            attrs = vt.get('data', {}).get('attributes', {})
            info = {
                'provider': 'VirusTotal',
                'malicious': attrs.get('last_analysis_stats', {}).get('malicious', 0),
                'suspicious': attrs.get('last_analysis_stats', {}).get('suspicious', 0),
                'country': attrs.get('country'),
                'as_owner': attrs.get('as_owner'),
            }
            return ActionResult(True, f'VirusTotal 查询完成: {value}', info)
        except Exception as e:
            return ActionResult(False, f'VirusTotal 查询失败: {str(e)[:120]}')


def _match_kv(record: Dict, query: str) -> bool:
    """按 `field:value`（空格分隔 AND）过滤字典记录。"""
    if not query or not isinstance(record, dict):
        return True
    for token in query.split():
        if ':' not in token:
            continue
        field, _, want = token.partition(':')
        actual = record.get(field)
        if actual is None:
            # 兼容嵌套：顶层找不到时向下找一层
            for val in record.values():
                if isinstance(val, dict) and field in val:
                    actual = val[field]
                    break
        if str(actual).lower() != want.lower():
            return False
    return True


def _apply_kv(query, model, expr: str):
    """把 `field:value` 条件应用到 SQLAlchemy 查询（AND）。"""
    if not expr:
        return query
    for token in expr.split():
        if ':' not in token:
            continue
        field, _, want = token.partition(':')
        col = getattr(model, field, None)
        if col is not None:
            query = query.filter(col == want)
    return query


# ── 数据查询节点：结构化条件（字段/运算符/值）→ lucene / SQLAlchemy ──
_LUCENE_SPECIALS = set('+-=!(){}[]^"~*?:\\/&|')

_QUERY_OP_SYMBOLS = {'大于': '>', '大于等于': '>=', '小于': '<', '小于等于': '<='}


def _lucene_quote(v: str) -> str:
    return '"' + str(v).replace('\\', '\\\\').replace('"', '\\"') + '"'


def _lucene_escape(v: str) -> str:
    return ''.join('\\' + ch if ch in _LUCENE_SPECIALS else ch for ch in str(v))


def _conditions_to_lucene(conditions) -> str:
    """结构化条件列表 → lucene query_string 片段（AND 连接）。

    支持：等于/不等于/包含/不包含/前缀/正则/大于(等于)/小于(等于)/存在/不存在。
    """
    parts = []
    for c in conditions or []:
        field = str((c or {}).get('field') or '').strip()
        op = str((c or {}).get('operator') or '等于').strip()
        value = (c or {}).get('value')
        v = '' if value is None else str(value).strip()
        if not field:
            continue
        if op == '存在':
            parts.append(f'_exists_:{field}')
        elif op == '不存在':
            parts.append(f'NOT _exists_:{field}')
        elif v:
            if op == '等于':
                parts.append(f'{field}:{_lucene_quote(v)}')
            elif op == '不等于':
                parts.append(f'NOT {field}:{_lucene_quote(v)}')
            elif op == '包含':
                parts.append(f'{field}:*{_lucene_escape(v)}*')
            elif op == '不包含':
                parts.append(f'NOT {field}:*{_lucene_escape(v)}*')
            elif op == '前缀':
                parts.append(f'{field}:{_lucene_escape(v)}*')
            elif op == '正则':
                parts.append(f'{field}:/{v}/')
            elif op in _QUERY_OP_SYMBOLS:
                parts.append(f'{field}:{_QUERY_OP_SYMBOLS[op]}{v}')
    return ' AND '.join(parts)


def _apply_conditions_pg(query, model, conditions):
    """结构化条件应用到 SQLAlchemy 查询（AND）；未知字段跳过，单条失败不阻断。"""
    for c in conditions or []:
        field = str((c or {}).get('field') or '').strip()
        op = str((c or {}).get('operator') or '等于').strip()
        value = (c or {}).get('value')
        if not field:
            continue
        col = getattr(model, field, None)
        if col is None:
            continue
        try:
            if op == '存在':
                query = query.filter(col.isnot(None))
                continue
            if op == '不存在':
                query = query.filter(col.is_(None))
                continue
            v = '' if value is None else str(value).strip()
            if not v:
                continue
            if op == '等于':
                query = query.filter(col == v)
            elif op == '不等于':
                query = query.filter(col != v)
            elif op == '包含':
                query = query.filter(col.ilike(f'%{v}%'))
            elif op == '不包含':
                query = query.filter(~col.ilike(f'%{v}%'))
            elif op == '前缀':
                query = query.filter(col.ilike(f'{v}%'))
            elif op == '正则':
                query = query.filter(col.op('~')(v))
            elif op in _QUERY_OP_SYMBOLS:
                try:
                    num = float(v)
                    cv = int(num) if num.is_integer() else num
                except ValueError:
                    cv = v
                query = query.filter(col.op(_QUERY_OP_SYMBOLS[op])(cv))
        except Exception:
            continue
    return query


class CreateTicketAction(ActionHandler):
    """创建安全工单节点。

    落点为 EventAction（与事件处置记录同表），使工单在事件时间线中可见；
    配置了外部工单系统 api_url 时同步推送，推送失败不阻断剧本。
    """
    name = "create_ticket"
    description = "创建安全工单"

    @classmethod
    def execute(cls, config: Dict, context: ActionContext) -> ActionResult:
        from app.database import db

        title = (context.resolve(config.get('title', ''))
                 or context.get('event_title', '')
                 or '安全事件处理工单')
        priority = context.resolve(config.get('priority', '中'))
        assignee = context.resolve(config.get('assignee', ''))
        system = context.resolve(config.get('system', '内部系统'))
        description = context.resolve(config.get('description', '') or config.get('content', ''))
        event_code = context.get('event_code') or config.get('event_code', '')

        details = {
            'ticket_system': system,
            'priority': priority,
            'assignee': assignee,
            'description': description,
        }

        api_url = context.resolve(config.get('api_url', ''))
        if api_url:
            try:
                import urllib.request
                payload = json.dumps({
                    'title': title, 'priority': priority,
                    'assignee': assignee, 'description': description,
                    'event_code': event_code,
                }).encode()
                req = urllib.request.Request(api_url, data=payload, method='POST')
                req.add_header('Content-Type', 'application/json')
                with urllib.request.urlopen(req, timeout=30) as resp:
                    details['external_status'] = f'HTTP {resp.status}'
            except Exception as e:
                details['external_error'] = str(e)

        try:
            from app.models import EventAction
            action = EventAction(
                event_id=str(event_code) if event_code else 'playbook-ticket',
                action='ticket_created',
                content=f'工单：{title}',
                user_name='剧本',
                extra_data={'ticket': details, 'event_code': event_code},
            )
            db.session.add(action)
            db.session.commit()
            details['ticket_id'] = action.id
            return ActionResult(True, f'工单已创建：{title}', details)
        except Exception as e:
            db.session.rollback()
            return ActionResult(False, f'工单创建失败: {str(e)}', details)


class QueryDataAction(ActionHandler):
    """数据查询节点：查询告警 / 资产 / 漏洞 / 事件 / 存储表注册表。

    两种查询方式可叠加（AND）：
    - 结构化条件 `conditions`: [{field, operator, value}]（画布条件构建器），
      运算符：等于/不等于/包含/不包含/前缀/正则/大于(等于)/小于(等于)/存在/不存在；
    - 高级查询 `query`: lucene `field:value` 自由文本（ES 原生 query_string）。
    hours 参数限定时间窗口，留空不限；limit 限制返回条数。
    """
    name = "query_data"
    description = "查询安全数据"

    @classmethod
    def _resolve_conditions(cls, raw, context: 'ActionContext') -> list:
        """conditions 支持 dict 列表（画布构建器）或行式字符串（field|运算符|value）。"""
        if isinstance(raw, str):
            entries = []
            for line in raw.splitlines():
                line = line.strip()
                if not line:
                    continue
                seg = [p.strip() for p in line.split('|')]
                entries.append({'field': seg[0],
                                'operator': seg[1] if len(seg) > 1 else '等于',
                                'value': seg[2] if len(seg) > 2 else ''})
        elif isinstance(raw, list):
            entries = [e for e in raw if isinstance(e, dict)]
        else:
            entries = []
        out = []
        for e in entries:
            field = str(context.resolve(e.get('field') or '') or '').strip()
            if not field:
                continue
            op = str(e.get('operator') or '等于').strip()
            value = context.resolve(e.get('value'))
            out.append({'field': field, 'operator': op,
                        'value': '' if value is None else str(value)})
        return out

    @classmethod
    def execute(cls, config: Dict, context: ActionContext) -> ActionResult:
        source = context.resolve(config.get('source', '告警表'))
        query = str(context.resolve(config.get('query', '')) or '').strip()
        conds = cls._resolve_conditions(config.get('conditions'), context)
        # 结构化条件 → lucene，与自由文本叠加（AND）
        lucene_extra = _conditions_to_lucene(conds)
        combined = ' AND '.join(x for x in (query, lucene_extra) if x)
        cond_desc = '；'.join(
            f"{c['field']} {c['operator']} {c['value']}".strip() for c in conds)
        try:
            limit = int(config.get('limit') or 20)
        except (TypeError, ValueError):
            limit = 20
        # 时间窗口（小时）：空/0 = 不限
        start_dt = None
        try:
            hours = int(float(config.get('hours') or 0))
        except (TypeError, ValueError):
            hours = 0
        if hours > 0:
            from datetime import timedelta
            start_dt = datetime.utcnow() - timedelta(hours=hours)
        start_iso = start_dt.strftime('%Y-%m-%dT%H:%M:%S') if start_dt else None
        end_iso = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S')
        suffix = (f'（条件: {cond_desc}）' if cond_desc else '') \
                 + (f'（近 {hours} 小时）' if hours else '')

        try:
            if source in ('告警表', 'alerts'):
                from app.utils import es_alerts
                # 条件直接下推 ES query_string（limit 之前过滤，语义准确）
                res = es_alerts.search_alerts(query_string=combined, page=1,
                                              page_size=limit,
                                              start=start_iso, end=end_iso)
                items = res.get('items', [])
                return ActionResult(True, f'查询到 {len(items)} 条告警{suffix}',
                                    {'source': source, 'count': len(items), 'items': items})
            if '资产' in source:
                from app.models import Asset
                q = _apply_kv(Asset.query, Asset, query)
                q = _apply_conditions_pg(q, Asset, conds)
                if start_dt is not None:
                    q = q.filter(Asset.created_at >= start_dt)
                items = [a.to_dict() for a in q.limit(limit).all()]
                return ActionResult(True, f'查询到 {len(items)} 条资产{suffix}',
                                    {'source': source, 'count': len(items), 'items': items})
            if '漏洞' in source:
                from app.models import Vulnerability
                q = _apply_kv(Vulnerability.query, Vulnerability, query)
                q = _apply_conditions_pg(q, Vulnerability, conds)
                if start_dt is not None:
                    q = q.filter(Vulnerability.created_at >= start_dt)
                items = [v.to_dict() for v in q.limit(limit).all()]
                return ActionResult(True, f'查询到 {len(items)} 条漏洞{suffix}',
                                    {'source': source, 'count': len(items), 'items': items})
            if '事件' in source:
                from app.models import Event
                q = _apply_kv(Event.query, Event, query)
                q = _apply_conditions_pg(q, Event, conds)
                if start_dt is not None:
                    q = q.filter(Event.created_at >= start_dt)
                items = [e.to_dict() for e in q.limit(limit).all()]
                return ActionResult(True, f'查询到 {len(items)} 条事件{suffix}',
                                    {'source': source, 'count': len(items), 'items': items})

            # ── 存储表注册表路由：source 匹配 storage_tables.name / display_name ──
            routed = cls._query_registered_table(source, query, conds, limit,
                                                 start_dt, end_iso)
            if routed is not None:
                return routed

            return ActionResult(False, f'不支持的数据源: {source}（可在存储表管理注册 elasticsearch/postgresql 表）')
        except Exception as e:
            from app.database import db
            db.session.rollback()
            return ActionResult(False, f'数据查询失败: {str(e)}')

    # ── 存储表注册表查询 ──────────────────────────────────────────────
    # 已知注册名 → 内部 ORM 模型（物理表名与注册名不同的映射）
    _PG_MODEL_MAP = {'security_events': ('app.models', 'Event')}

    @classmethod
    def _query_registered_table(cls, source: str, query: str, conds: list,
                                limit: int, start_dt, end_iso: str) -> 'ActionResult | None':
        """按 storage_tables 注册表把 source 路由到真实后端；未命中返回 None。"""
        from app.routes.storage_tables import StorageTable
        st = (StorageTable.query.filter_by(name=source).first()
              or StorageTable.query.filter_by(display_name=source).first())
        if st is None:
            return None
        backend = (st.log_type or '').strip().lower()
        label = st.display_name or st.name

        if backend == 'elasticsearch':
            from app.utils import es_alerts
            # ES 告警注册表（alerts）物理索引是 alerts-valid；其余注册名即索引名
            index = 'alerts-valid' if st.name == 'alerts' else st.name
            flt = {'start': start_dt.strftime('%Y-%m-%dT%H:%M:%S') if start_dt else None,
                   'end': end_iso}
            combined = ' AND '.join(x for x in (query, _conditions_to_lucene(conds)) if x)
            res = es_alerts.search_alerts(query_string=combined, filters=None,
                                          start=flt['start'], end=flt['end'],
                                          page=1, page_size=limit, index=index)
            items = res.get('items', [])
            return ActionResult(True, f'查询到 {len(items)} 条记录（{label} · ES {index}）',
                                {'source': source, 'index': index,
                                 'count': len(items), 'items': items})

        if backend == 'postgresql':
            model_map = cls._PG_MODEL_MAP.get(st.name)
            if model_map:
                import importlib
                mod = importlib.import_module(model_map[0])
                model = getattr(mod, model_map[1])
                q = _apply_kv(model.query, model, query)
                q = _apply_conditions_pg(q, model, conds)
                if start_dt is not None and hasattr(model, 'created_at'):
                    q = q.filter(model.created_at >= start_dt)
                items = [r.to_dict() for r in q.limit(limit).all()]
                return ActionResult(True, f'查询到 {len(items)} 条记录（{label}）',
                                    {'source': source, 'count': len(items), 'items': items})
            # 注册表里登记的其它 PG 表：白名单内直接按表名安全查询（表名来自注册表，非用户输入拼接）
            return cls._query_pg_table_raw(st.name, label, query, conds, limit, start_dt)

        return ActionResult(False, f'存储表 {label} 的后端 {backend} 暂不支持剧本查询')

    # 行式结构化条件在物理 PG 表上的运算符 SQL（列名经注册表/正则双重校验，值走参数绑定）
    _RAW_PG_OPS = {
        '等于': '=',
        '不等于': '!=',
        '包含': 'ILIKE',
        '不包含': 'NOT ILIKE',
        '前缀': 'ILIKE',
        '正则': '~',
    }

    @classmethod
    def _query_pg_table_raw(cls, table: str, label: str, query: str, conds: list,
                            limit: int, start_dt) -> 'ActionResult':
        """对注册表登记的 PG 物理表做受限查询：只允许 SELECT、列名经注册表/正则双重校验。"""
        import re as _re
        from sqlalchemy import text
        from app.database import db
        if not _re.fullmatch(r'[a-zA-Z_][a-zA-Z0-9_]*', table):
            return ActionResult(False, f'非法表名: {table}')
        where, params = [], {'limit': limit}
        if start_dt is not None:
            where.append('created_at >= :start')
            params['start'] = start_dt
        if query:
            for cond in str(query).split():
                if ':' not in cond:
                    continue
                k, v = cond.split(':', 1)
                if not _re.fullmatch(r'[a-zA-Z_][a-zA-Z0-9_]*', k):
                    return ActionResult(False, f'非法查询字段: {k}')
                params[f'p_{k}'] = v
                where.append(f'"{k}"::text = :p_{k}')
        pi = 0
        for c in conds or []:
            k = str(c.get('field') or '').strip()
            op = str(c.get('operator') or '等于').strip()
            v = '' if c.get('value') is None else str(c.get('value')).strip()
            if not k or not _re.fullmatch(r'[a-zA-Z_][a-zA-Z0-9_]*', k):
                return ActionResult(False, f'非法查询字段: {k}')
            if op == '存在':
                where.append(f'"{k}" IS NOT NULL')
                continue
            if op == '不存在':
                where.append(f'"{k}" IS NULL')
                continue
            if not v:
                continue
            pi += 1
            pname = f'c_{pi}'
            if op in ('包含', '不包含', '前缀'):
                params[pname] = f'%{v}%' if op != '前缀' else f'{v}%'
                where.append(f'"{k}"::text {cls._RAW_PG_OPS[op]} :{pname}')
            elif op in cls._RAW_PG_OPS:
                params[pname] = v
                where.append(f'"{k}"::text {cls._RAW_PG_OPS[op]} :{pname}')
            elif op in _QUERY_OP_SYMBOLS:
                params[pname] = v
                sym = _QUERY_OP_SYMBOLS[op]
                if _re.fullmatch(r'-?\d+(\.\d+)?', v):
                    # 数值比较走 numeric cast，避免文本比较 9 > 10 的错序
                    where.append(f'CAST("{k}" AS numeric) {sym} :{pname}')
                else:
                    where.append(f'"{k}"::text {sym} :{pname}')
            else:
                return ActionResult(False, f'不支持的运算符: {op}')
        sql = f'SELECT * FROM "{table}"' + (' WHERE ' + ' AND '.join(where) if where else '') + ' LIMIT :limit'
        try:
            rows = db.session.execute(text(sql), params).mappings().all()
        except Exception as e:
            db.session.rollback()
            return ActionResult(False, f'查询存储表 {label} 失败: {str(e)}')
        items = [dict(r) for r in rows]
        for r in items:  # datetime 等不可 JSON 序列化字段
            for k, v in list(r.items()):
                if hasattr(v, 'isoformat'):
                    r[k] = v.isoformat()
        return ActionResult(True, f'查询到 {len(items)} 条记录（{label}）',
                            {'source': table, 'count': len(items), 'items': items})


# ═══════════════════════════════════════════════════════════════════
# AI 节点（对齐 Coze「大模型 / 知识库」节点）
# ═══════════════════════════════════════════════════════════════════

class LLMAction(ActionHandler):
    """AI 大模型节点

    Coze 语义：上游数据 → 提示词（可引用任意上游字段）→ 大模型 → 按「输出契约」
    产出结构化字段，下游用 {{ 节点名.字段 }} 直接引用。

    config:
      provider       auto / local / hermes / deepseek（默认 auto）
      model          模型名（留空用平台默认）
      temperature    默认 0.2
      max_tokens     默认 2048
      system_prompt  系统提示词（支持 {{...}} 表达式）
      user_prompt    用户提示词（支持 {{...}}）
      include_input  是否把当前数据项 JSON 追加进用户提示词（默认 是）
      output_format  text / json
      output_fields  JSON 数组 [{"name":"verdict","type":"string","desc":"..."}]
      on_error       continue（默认，规则兜底并继续）/ fail
      max_items      最多处理的数据项数（默认 20）
    """

    name = 'ai_llm'
    description = '调用大模型分析当前数据，并按输出契约产出结构化字段供下游引用'

    DEFAULT_SYSTEM = (
        '你是安全运营(SOC)分析助手。请基于给定的数据进行分析，'
        '只输出要求的格式，不要附加解释。'
    )

    # ---------- 输出契约解析 ----------

    @staticmethod
    def parse_fields(raw) -> list:
        """输出字段定义：[{name,type,desc}] —— 兼容 JSON 串、对象数组、逗号/换行串。"""
        fields = []
        if isinstance(raw, str) and raw.strip():
            try:
                raw = json.loads(raw)
            except Exception:
                raw = [r.strip() for r in re.split(r'[,\n]', raw) if r.strip()]
        if isinstance(raw, dict):
            raw = [{'name': k, 'type': v} for k, v in raw.items()]
        for f in (raw or []):
            if isinstance(f, str):
                if not f.strip():
                    continue
                seg = f.split(':')
                fields.append({'name': seg[0].strip(),
                               'type': (seg[1].strip() if len(seg) > 1 else 'string'),
                               'desc': (seg[2].strip() if len(seg) > 2 else '')})
            elif isinstance(f, dict) and f.get('name'):
                fields.append({'name': str(f['name']).strip(),
                               'type': str(f.get('type') or 'string').strip(),
                               'desc': str(f.get('desc') or '')})
        return fields

    # ---------- 大模型调用链 ----------

    @classmethod
    def _llm_chat(cls, system: str, user: str, temperature: float,
                  max_tokens: int, provider: str = 'auto', model: str = ''):
        """依次尝试各通道，返回 (content, source, is_ai)；全部失败返回 (None, '', False)。"""
        messages = [{'role': 'system', 'content': system},
                    {'role': 'user', 'content': user}]
        provider = provider or 'auto'

        # 1) 平台统一 LLM 通道（AI 中心配置的 DeepSeek 网关）
        if provider in ('auto', 'deepseek'):
            try:
                from app.routes.ai_judgment import _call_llm
                content = _call_llm(messages, temperature=temperature, max_tokens=max_tokens)
                if content:
                    return content, 'deepseek', True
            except Exception:
                pass

        # 2) 本地大模型（Ollama / LM Studio / OpenAI 兼容）
        if provider in ('auto', 'local'):
            try:
                r = AIAnalysisAction._call_local_ai(system, user, model or 'deepseek-chat', temperature)
                if r is not None and r.success:
                    return r.data.get('analysis', ''), r.data.get('source', 'local'), True
            except Exception:
                pass

        # 3) Hermes 代理
        if provider in ('auto', 'hermes'):
            try:
                url = AIAnalysisAction._get_db_config('hermes_base_url', 'http://hermes-agent:8080')
                r = AIAnalysisAction._call_hermes(url, system, user)
                if r is not None and r.success:
                    return r.data.get('analysis', ''), 'hermes', True
            except Exception:
                pass

        return None, '', False

    @staticmethod
    def _extract_json(content: str):
        """从模型输出中稳健截取 JSON 对象（容忍 ```json 围栏与前后说明）。"""
        if not content:
            return None
        cleaned = re.sub(r'```(?:json)?\s*', '', content).strip()
        start, end = cleaned.find('{'), cleaned.rfind('}')
        if start == -1 or end <= start:
            return None
        try:
            return json.loads(cleaned[start:end + 1])
        except Exception:
            return None

    # ---------- 规则兜底（LLM 不可用时的确定性推导，非 mock） ----------

    @staticmethod
    def _rule_value(name: str, ftype: str, item: Dict):
        """按字段名语义 + 数据项内容确定性推导取值。

        LLM 不可用时仍要给出可用的下游字段，否则整条链路断流；
        结果会在 ai_meta 中标注 source=rule_fallback，UI 可显式降级提示。
        """
        sev = str(item.get('severity') or item.get('risk_level') or 'medium').lower()
        if sev not in ('critical', 'high', 'medium', 'low'):
            sev = 'medium'
        n = (name or '').lower()

        if 'verdict' in n or '判定' in name or '判断' in name:
            return 'true_attack' if sev in ('critical', 'high') else ('suspicious' if sev == 'medium' else 'info')
        if 'suspicious' in n or '可疑' in name:
            # 规则兜底启发：高危/严重告警默认需要立案研判（LLM 通道恢复后由模型精判）
            return sev in ('critical', 'high')
        if 'risk' in n or 'severity' in n or '等级' in name or '级别' in name:
            return sev
        if 'confidence' in n or '置信' in name:
            return 0.55
        if 'action' in n or '建议' in name or '处置' in name:
            return {
                'critical': '立即隔离受影响主机、封堵源IP，并上报应急小组',
                'high': '封堵源IP并创建高优先级工单，2小时内复核',
                'medium': '加入观察名单，关联历史告警后人工复核',
                'low': '记录留痕，暂不处置，纳入周期性复盘',
            }[sev]
        if any(k in n for k in ('summary', 'conclusion', 'abstract', '摘要', '结论', '分析')):
            keys = ['title', 'alert_code', 'category', 'attack_type', 'severity',
                    'src_ip', 'dst_ip', 'hostname', 'status']
            parts = [f'{k}={item[k]}' for k in keys if item.get(k) not in (None, '')]
            return '[规则兜底] ' + ('；'.join(parts) or '无可用字段') + f'；按 severity={sev} 推导，建议人工复核'
        if 'report' in n or '报告' in name or '日报' in name or '周报' in name:
            return LLMAction._fallback_report(item)
        # 其它字段：数据项里同名则取，否则按声明类型给空值
        if name in item and item[name] not in (None, ''):
            return item[name]
        return {'number': 0, 'boolean': False, 'object': {}, 'array': []}.get(ftype, '')

    @classmethod
    def _fallback_report(cls, item: Dict) -> str:
        """LLM 不可用时基于数据项确定性生成 Markdown 运营报告。

        输入数据项通常由「查询 + 代码精简」节点产出：含 event_count /
        severity_stats / status_stats / events 等字段；缺省时尽力从
        items / 顶层告警字段推导，保证报告不空流。
        """
        events = item.get('events') or item.get('items') or []
        if not isinstance(events, list):
            events = []
        sev = item.get('severity_stats') or {}
        st = item.get('status_stats') or {}
        if not sev and events:
            for e in events:
                k = str(e.get('severity') or 'unknown')
                sev[k] = sev.get(k, 0) + 1
        if not st and events:
            for e in events:
                k = str(e.get('status') or 'unknown')
                st[k] = st.get(k, 0) + 1

        def _fmt(d):
            return '，'.join(f'{k} {v} 起' for k, v in d.items()) if d else '无'

        high_n = sum(v for k, v in sev.items() if str(k).lower() in ('critical', 'high'))
        open_n = sum(v for k, v in st.items() if str(k).lower() in ('new', 'acknowledged', 'investigating'))

        lines = [
            '> 本报告由规则兜底生成（大模型通道不可用），数据均来自平台真实查询；通道恢复后将自动切换为 AI 深度分析。',
            '',
            '## 一、总体概况',
            f'- 周期内事件总数：{item.get("event_count") or len(events)}',
            f'- 严重程度分布：{_fmt(sev)}',
            f'- 处置状态分布：{_fmt(st)}',
            '',
            '## 二、事件明细（按严重程度排序，最多 20 条）',
        ]
        rank = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
        evs = sorted(events, key=lambda e: rank.get(str(e.get('severity') or '').lower(), 9))[:20]
        for e in evs:
            lines.append(f'- [{str(e.get("severity") or "?").upper()}] {e.get("title") or e.get("code") or "未命名事件"}'
                         f'（状态 {e.get("status") or "?"}，{str(e.get("time") or "")[:19]}）')
        if not evs:
            lines.append('- 本周期内无事件记录')
        lines += [
            '',
            '## 三、风险研判与处置建议',
        ]
        if high_n:
            lines.append(f'- 存在 {high_n} 起高危/严重事件，建议优先处置并复核闭环情况')
        if open_n:
            lines.append(f'- {open_n} 起事件未闭环，建议明确责任人与处置时限')
        if not high_n and not open_n:
            lines.append('- 当前无高危、未闭环事件，保持常规监控节奏')
        lines += [
            '- 对误报事件及时归因，持续优化检测规则置信度',
            '',
            '## 四、后续关注事项',
            '- 跟踪高危事件处置进展，24 小时内复查',
            '- 关注新增告警源与异常登录行为',
            '',
            '*本邮件由 USOP 安全运营平台「剧本编排」自动生成*',
        ]
        return '\n'.join(lines)

    @staticmethod
    def _rule_daily_report(item: Dict) -> str:
        """每日威胁运营日报兜底：按固定模板由数据确定性生成 Markdown（LLM 不可用时仍可直发）。"""
        def _loads(v):
            try:
                v = json.loads(v) if isinstance(v, str) else (v or [])
                return v if isinstance(v, list) else []
            except Exception:
                return []

        events = _loads(item.get('events_summary'))
        try:
            alert_stat = json.loads(item.get('alert_summary')) if isinstance(item.get('alert_summary'), str) else (item.get('alert_summary') or {})
        except Exception:
            alert_stat = {}
        report_date = item.get('report_date') or datetime.utcnow().strftime('%Y-%m-%d')

        sev_rank = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
        events = sorted(events, key=lambda e: sev_rank.get(str(e.get('severity') or 'medium').lower(), 2))
        sev_cnt = {'critical': 0, 'high': 0, 'medium': 0, 'low': 0}
        for e in events:
            s = str(e.get('severity') or 'medium').lower()
            sev_cnt[s] = sev_cnt.get(s, 0) + 1
        open_cnt = sum(1 for e in events if str(e.get('status') or '') not in ('closed', 'resolved', 'false_positive'))
        cats = {}
        for e in events:
            c = str(e.get('category') or '其他')
            cats[c] = cats.get(c, 0) + 1
        top_cats = sorted(cats.items(), key=lambda kv: -kv[1])[:3]

        lines = [
            f'# 每日威胁运营日报（{report_date}）',
            '',
            '## 一、今日概览',
            f'- 新增事件：{len(events)} 起（高危 {sev_cnt["critical"] + sev_cnt["high"]} / 中危 {sev_cnt["medium"]} / 低危 {sev_cnt["low"]}）',
            f'- 当前未闭环事件：{open_cnt} 起',
            f'- 值班关注等级：{"高" if sev_cnt["critical"] else ("中" if sev_cnt["high"] else "低")}（基于今日事件最高级别）',
            '',
            '## 二、事件明细',
            '| 事件编号 | 标题 | 级别 | 状态 | 分类 | 摘要 |',
            '|---|---|---|---|---|---|',
        ]
        if events:
            for e in events:
                desc = str(e.get('description') or '').replace('|', '/').replace('\n', ' ')[:80]
                lines.append(f"| {e.get('event_code') or '-'} | {str(e.get('title') or '')[:40]} "
                             f"| {e.get('severity') or '-'} | {e.get('status') or '-'} "
                             f"| {e.get('category') or '-'} | {desc or '-'} |")
        else:
            lines.append('| - | - | - | - | - | 今日无相关记录 |')
        lines += ['', '## 三、威胁趋势与研判']
        if top_cats:
            lines += [f"- 主要威胁类型 Top{len(top_cats)}：" + '、'.join(f'{k}（{v} 起）' for k, v in top_cats)]
        else:
            lines.append('- 主要威胁类型：今日无相关记录')
        lines += [
            '- 值得关注的新出现行为或 IP/域名：以事件明细中的源/目的 IP 为准',
            '- 与前日对比的变化点：本剧本未接入前日数据，需人工对比',
            '',
            '## 四、处置与建议',
            '- 已处置：状态为 resolved/closed 的事件详见事件明细',
            '- 待处置：未闭环事件按级别排序（高→低），建议按「封禁/隔离/取证/继续观察」推进',
            '',
            '## 五、附注',
            f"- 告警统计：{json.dumps(alert_stat, ensure_ascii=False) if alert_stat else '无'}",
            '- 数据来源：USOP 平台事件库与告警索引',
            '- 本报告由剧本编排自动生成（规则模板模式，非 LLM 生成），结论供值班人员复核',
        ]
        return '\n'.join(lines)

    @staticmethod
    def _coerce(value, ftype: str):
        try:
            if ftype == 'number':
                return float(value) if value not in (None, '') else 0
            if ftype == 'boolean':
                return str(value).lower() in ('true', '1', 'yes', '是')
            if ftype == 'object':
                return value if isinstance(value, dict) else {}
            if ftype == 'array':
                return value if isinstance(value, list) else []
        except Exception:
            pass
        return value

    @classmethod
    def execute(cls, config: Dict, context: ActionContext) -> ActionResult:
        cfg = config or {}
        # ── AI 中心提示词接入（prompt_key）──
        # 配置了 prompt_key 时从「AI 中心-提示词管理」解析该职责的提示词：
        #   system  ← 解析结果的 system_prompt（节点未显式填写 system_prompt 才覆盖）
        #   user    ← render_prompt(解析结果.user_prompt, 变量=触发上下文 ∪ 当前数据项)，
        #             模板渲染后为空则回退节点自带的 user_prompt
        prompt_key = (cfg.get('prompt_key') or '').strip()
        p_resolved = None
        if prompt_key:
            try:
                from app.utils.ai_prompts import resolve_prompt
                p_resolved = resolve_prompt(prompt_key)
            except Exception:
                p_resolved = None
        # system：AI 中心提示词优先（节点未显式填写时）；user：模板逐项渲染（见循环内）
        if p_resolved and not (cfg.get('system_prompt') or '').strip():
            system_tpl = p_resolved.get('system_prompt') or ''
        else:
            system_tpl = cfg.get('system_prompt') or ''
        system = context.resolve(system_tpl) or cls.DEFAULT_SYSTEM
        node_user = cfg.get('user_prompt') or ''
        p_user_tpl = (p_resolved or {}).get('user_prompt') or ''
        output_format = str(cfg.get('output_format') or 'text').lower()
        fields = cls.parse_fields(cfg.get('output_fields'))
        include_input = str(cfg.get('include_input', '是')) not in ('否', 'false', 'False', '0', 'no', 'off')
        provider = cfg.get('provider') or 'auto'
        model = cfg.get('model') or ''
        on_error = cfg.get('on_error') or 'continue'
        try:
            temperature = float(cfg.get('temperature') or 0.2)
        except Exception:
            temperature = 0.2
        try:
            max_tokens = int(cfg.get('max_tokens') or 2048)
        except Exception:
            max_tokens = 2048
        try:
            max_items = max(1, min(int(cfg.get('max_items') or 20), 100))
        except Exception:
            max_items = 20

        src_items = context.items or [{'json': context.snapshot_json(), 'paired_items': []}]
        if output_format == 'json' and fields:
            contract = '，'.join(f'{f["name"]}({f["type"]})' for f in fields)
            system = (system + f'\n\n【输出要求】只输出 JSON 对象，必须包含字段：{contract}。'
                      f'{"（" + "；".join(f["name"] + "：" + f["desc"] for f in fields if f["desc"]) + "）" if any(f["desc"] for f in fields) else ""}')

        out, sources, errors = [], [], []
        for it in src_items[:max_items]:
            data = dict(it.get('json') or {})
            payload = json.dumps(data, ensure_ascii=False, default=str)[:6000]
            base_user = context.resolve(node_user) if node_user else ''
            if not base_user and p_user_tpl:
                # AI 中心提示词模板：变量 = 触发上下文 ∪ 当前数据项
                try:
                    from app.utils.ai_prompts import render_prompt
                    base_user = render_prompt(p_user_tpl, {**(context.snapshot_json() or {}), **data})
                except Exception:
                    base_user = ''
            prompt_user = (base_user + '\n\n【当前数据项】\n' + payload) if (include_input and base_user) else (base_user or payload)

            content, source, is_ai = cls._llm_chat(system, prompt_user, temperature,
                                                   max_tokens, provider, model)
            meta = {'is_ai': is_ai, 'source': source or 'rule_fallback',
                    'model': model or (source or 'default'), 'format': output_format}
            if not is_ai:
                meta['reason'] = '大模型通道不可用，已按规则确定性推导（需人工复核）'
                errors.append(meta['reason'])

            if output_format == 'json':
                parsed = cls._extract_json(content) if content else None
                for f in fields:
                    if parsed and f['name'] in parsed:
                        data[f['name']] = cls._coerce(parsed[f['name']], f['type'])
                    else:
                        data[f['name']] = cls._coerce(cls._rule_value(f['name'], f['type'], data), f['type'])
                        meta.setdefault('fallback_fields', []).append(f['name'])
                data['ai_json'] = parsed or {}
            else:
                if content:
                    data['ai_text'] = content
                elif prompt_key == 'daily_report':
                    # 日报兜底：无 LLM 时按固定模板用数据确定性生成完整 Markdown 报告
                    data['ai_text'] = cls._rule_daily_report(data)
                else:
                    data['ai_text'] = cls._rule_value('conclusion', 'string', data)

            data['ai_meta'] = meta
            sources.append(meta['source'])
            out.append({'json': data, 'paired_items': it.get('paired_items', [])})

        uniq_sources = sorted(set(sources)) or ['rule_fallback']
        success = (not errors) or on_error == 'continue'
        return ActionResult(
            success=success,
            message=f'AI 节点完成：{len(out)} 项 · 来源 {"/".join(uniq_sources)}'
                    + (f' · {len(fields)} 个输出字段' if fields else '')
                    + ('' if not errors else ' · 已按规则兜底'),
            data={'count': len(out), 'source': '/'.join(uniq_sources),
                  'is_ai': not errors,
                  'fields': [f['name'] for f in fields],
                  'preview': out[0]['json'] if out else {}},
            items=out)


class RecallExperienceAction(ActionHandler):
    """经验库召回节点（Coze「知识库」的 USOP 版本）

    从 STE 经验库按 category / attack_type 召回高权重历史研判经验，
    写进数据项供 AI 节点或决策节点引用，避免每次都从零分析。
    """

    name = 'recall_experience'
    description = '从 STE 经验库召回相似处置经验，注入上下文供 AI/决策节点复用'

    @classmethod
    def execute(cls, config: Dict, context: ActionContext) -> ActionResult:
        cfg = config or {}
        category = str(context.resolve(cfg.get('category', '') or '') or '').strip()
        attack_type = str(context.resolve(cfg.get('attack_type', '') or '') or '').strip()
        try:
            limit = max(1, min(int(cfg.get('limit') or 5), 20))
        except Exception:
            limit = 5
        field = cfg.get('output_field') or 'experiences'

        payload, err = [], ''
        if category or attack_type:
            try:
                from app.routes.ai_judgment import _retrieve_ste_experiences
                exps = _retrieve_ste_experiences(category, attack_type, limit) or []
                payload = [{
                    'knowledge_id': e.knowledge_id or f'STE-{e.id}',
                    'title': e.title or '',
                    'category': e.category or '',
                    'attack_type': e.attack_type or '',
                    'verdict': e.verdict or '',
                    'risk_level': e.risk_level or '',
                    'conclusion': e.conclusion or '',
                    'suggested_action': e.suggested_action or '',
                    'usefulness_score': e.usefulness_score,
                } for e in exps]
            except Exception as e:
                err = str(e)

        src_items = context.items or [{'json': context.snapshot_json(), 'paired_items': []}]
        out = []
        for it in src_items:
            data = dict(it.get('json') or {})
            data[field] = payload
            data['experience_count'] = len(payload)
            if payload:
                data['ste_conclusion'] = payload[0].get('conclusion', '')
                data['ste_suggested_action'] = payload[0].get('suggested_action', '')
                data['ste_verdict'] = payload[0].get('verdict', '')
            out.append({'json': data, 'paired_items': it.get('paired_items', [])})

        return ActionResult(
            success=not err,
            message=f'经验召回：命中 {len(payload)} 条' + (f'（{err}）' if err else '')
                    + ('' if (category or attack_type) else '（未指定 category/attack_type，跳过召回）'),
            data={'count': len(payload), 'category': category,
                  'attack_type': attack_type, 'knowledge': payload[:5]},
            items=out)


class AIAnalysisAction:
    """AI 分析动作 - 调用 AI 分析事件内容及关联告警（支持远程/本地多种提供商）"""
    name = 'ai_analysis'
    description = 'AI智能分析事件内容，判断攻击类型、影响范围和处置建议'

    @classmethod
    def _build_prompt(cls, event: Dict, include_alerts: bool) -> str:
        title = event.get('title', '未知事件')
        description = event.get('description', '')
        severity = event.get('severity', 'medium')
        event_type = event.get('eventType', event.get('category', ''))
        source_ip = event.get('sourceIp', event.get('source', ''))
        affected_assets = event.get('affectedAssets', [])
        
        extra = event.get('extra_data', {})
        if isinstance(extra, str):
            try: extra = json.loads(extra)
            except: extra = {}
        related_alerts = event.get('relatedAlerts', []) or extra.get('related_alerts', [])
        
        alert_text = ''
        if include_alerts and related_alerts:
            lines = [f'- [{a.get("severity","?")}] {a.get("alert_code",a.get("id",""))}: {a.get("title","")}' for a in related_alerts[:20]]
            alert_text = '\n\n## 关联告警\n' + '\n'.join(lines)
        
        return f"""## 安全事件分析请求

### 事件基本信息
- **标题**: {title}
- **类型**: {event_type}
- **严重程度**: {severity}
- **源IP**: {source_ip}
- **影响资产**: {', '.join(affected_assets) if affected_assets else '无'}
- **描述**: {description}{alert_text}

### 分析要求
请按以下格式输出分析结果：

**1. 攻击判断**
- 是否为真实攻击：
- 攻击类型：
- 置信度：

**2. 影响评估**
- 受影响资产：
- 影响范围：
- 风险等级：

**3. 处置建议**
- 立即措施：
- 后续措施：
- 预防建议：

**4. 优先级建议**
- 处理优先级：
- 建议响应时间："""

    @classmethod
    def _get_db_config(cls, key: str, default: str = '') -> str:
        """从 DB 获取 AI 提供商配置"""
        try:
            from app.models import SystemConfig
            cfg = SystemConfig.query.filter_by(key=f'ai_provider_{key}').first()
            if cfg and cfg.value:
                return cfg.value
        except Exception:
            pass
        return os.getenv(key.upper(), default)

    @classmethod
    def execute(cls, config: Dict, context: ActionContext) -> ActionResult:
        import requests as http_requests
        
        system_prompt = config.get('systemPrompt', '你是一个安全分析专家。请分析以下安全事件，判断是否为真实攻击、影响范围、严重程度以及建议的处置措施。')
        model = config.get('model', 'deepseek-chat')
        temperature = float(config.get('temperature', 0.3))
        include_alerts = config.get('includeAlerts', True)
        provider = config.get('provider', 'auto')  # auto, deepseek, hermes, local
        
        event = context.event or {}
        user_message = cls._build_prompt(event, include_alerts)
        
        # 判断是否启用全局 Hermes 代理（优先 DB 配置）
        use_hermes_global = cls._get_db_config('use_hermes_proxy', 'false').lower() == 'true'
        hermes_url = cls._get_db_config('hermes_base_url', 'http://hermes-agent:8080')
        
        # 优先使用本地 AI（优先 DB 配置）
        local_ai_type = cls._get_db_config('local_ai_type', '')
        if provider in ('auto', 'local') and local_ai_type:
            try:
                result = cls._call_local_ai(system_prompt, user_message, model, temperature)
                if result:
                    return result
            except Exception:
                pass  # fallback
        
        # 尝试 Hermes（远程代理）- 如果 provider 指定或全局启用
        if provider in ('auto', 'hermes') or (provider == 'auto' and use_hermes_global):
            try:
                result = cls._call_hermes(hermes_url, system_prompt, user_message)
                if result:
                    return result
            except Exception:
                pass  # fallback
        
        # 兜底 DeepSeek 云端 API
        return cls._call_deepseek(system_prompt, user_message, model, temperature)

    @classmethod
    def _call_local_ai(cls, system_prompt: str, user_message: str, model: str, temperature: float) -> Optional[ActionResult]:
        import requests as http_requests
        ai_type = cls._get_db_config('local_ai_type', '')
        base_url = cls._get_db_config('local_ai_base_url', 'http://localhost:11434')
        local_model = cls._get_db_config('local_ai_model', 'llama3')
        api_key = cls._get_db_config('local_ai_api_key', '')
        
        messages = [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': user_message}
        ]
        
        if ai_type == 'ollama':
            resp = http_requests.post(f'{base_url}/api/chat', json={
                'model': local_model, 'messages': messages, 'stream': False,
                'options': {'temperature': temperature}
            }, timeout=120)
            resp.raise_for_status()
            data = resp.json()
            return ActionResult(success=True, message='AI分析完成（本地Ollama）', data={
                'analysis': data['message']['content'],
                'model': f'ollama/{local_model}', 'source': 'local'
            })
        elif ai_type in ('lm_studio', 'openai'):
            headers = {'Content-Type': 'application/json'}
            if api_key: headers['Authorization'] = f'Bearer {api_key}'
            resp = http_requests.post(f'{base_url}/v1/chat/completions', headers=headers, json={
                'model': model if ai_type == 'openai' else local_model,
                'messages': messages, 'temperature': temperature, 'max_tokens': 4096,
            }, timeout=120)
            resp.raise_for_status()
            data = resp.json()
            return ActionResult(success=True, message='AI分析完成（本地）', data={
                'analysis': data['choices'][0]['message']['content'],
                'model': local_model, 'source': 'local'
            })
        return None

    @classmethod
    def _call_hermes(cls, hermes_url: str, system_prompt: str, user_message: str) -> Optional[ActionResult]:
        import requests as http_requests
        resp = http_requests.post(f'{hermes_url}/v1/chat/completions', json={
            'messages': [
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_message}
            ]
        }, timeout=120)
        resp.raise_for_status()
        data = resp.json()
        return ActionResult(success=True, message='AI分析完成（Hermes）', data={
            'analysis': data['choices'][0]['message']['content'],
            'source': 'hermes'
        })

    @classmethod
    def _call_deepseek(cls, system_prompt: str, user_message: str, model: str, temperature: float) -> ActionResult:
        import requests as http_requests
        try:
            api_key = cls._get_db_config('deepseek_api_key', 'sk-bf41b5f890024a739325b3f765129dbc')
            api_base = cls._get_db_config('deepseek_base_url', 'https://api.deepseek.com/v1')
            resp = http_requests.post(f'{api_base}/chat/completions',
                headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
                json={'model': model, 'messages': [
                    {'role': 'system', 'content': system_prompt},
                    {'role': 'user', 'content': user_message}
                ], 'temperature': temperature, 'max_tokens': 4096}, timeout=120)
            resp.raise_for_status()
            result = resp.json()
            return ActionResult(success=True, message='AI分析完成（DeepSeek）', data={
                'analysis': result['choices'][0]['message']['content'],
                'model': model, 'source': 'deepseek',
                'usage': result.get('usage', {})
            })
        except Exception as e:
            return ActionResult(success=False, message=f'AI分析失败: {str(e)}', data={'error': str(e)})


class HttpRequestAction(ActionHandler):
    """通用 HTTP 请求动作（Shuffle App 动作与手动 API 调用的执行体）。

    config:
        url/method/headers/query/body 均支持 {{ 表达式 }}（含 $json、$('节点名').json）
        headers/query/body 接受 dict 或 JSON 字符串（值里的表达式会被解析）
        auth_app_id: 可选，关联 IntegrationApp，执行时按其 auth_type/auth_config
                     注入认证（apiKey→header/query，bearer→Authorization，basic→Basic）
        timeout: 秒，默认 15，上限 60
    输出 items: [{json: {status_code, ok, url, method, response}}]
    """

    name = "http_request"
    description = "调用外部 HTTP API（集成应用动作 / 手动 API）"

    @classmethod
    def _load_auth(cls, app_id) -> dict:
        """加载集成应用的认证配置 → {headers: {}, query: {}}"""
        if not app_id:
            return {}
        try:
            from app.models import IntegrationApp
            app = IntegrationApp.query.get(int(app_id))
            if not app or not app.enabled:
                return {}
            auth_type = app.auth_type or 'none'
            cfg = app.auth_config or {}
            credential = app.credential or ''
            if auth_type == 'apiKey' and credential:
                loc = cfg.get('in', 'header')
                name = cfg.get('name', 'X-Api-Key')
                if loc == 'query':
                    return {'query': {name: credential}}
                return {'headers': {name: credential}}
            if auth_type == 'bearer' and credential:
                prefix = cfg.get('prefix', 'Bearer')
                return {'headers': {'Authorization': f'{prefix} {credential}'}}
            if auth_type == 'basic' and credential:
                import base64
                token = base64.b64encode(credential.encode()).decode()
                return {'headers': {'Authorization': f'Basic {token}'}}
        except Exception:
            pass
        return {}

    @classmethod
    def _coerce_mapping(cls, raw, context) -> dict:
        """dict / JSON 字符串 / 'k: v' 多行文本 → dict（值过表达式解析）"""
        if not raw:
            return {}
        if isinstance(raw, str):
            text = context.resolve(raw)
            text = text.strip()
            if not text:
                return {}
            if text.startswith('{'):
                try:
                    parsed = json.loads(text)
                    return parsed if isinstance(parsed, dict) else {}
                except Exception:
                    return {}
            result = {}
            for line in text.splitlines():
                if ':' in line:
                    k, v = line.split(':', 1)
                    result[k.strip()] = v.strip()
            return result
        if isinstance(raw, dict):
            return {k: context.resolve(v) if isinstance(v, str) else v for k, v in raw.items()}
        return {}

    @classmethod
    def _coerce_body(cls, raw, context):
        if raw is None or raw == '':
            return None
        if isinstance(raw, str):
            text = context.resolve(raw).strip()
            if not text:
                return None
            try:
                return json.loads(text)
            except Exception:
                return text
        if isinstance(raw, (dict, list)):
            text = context.resolve(json.dumps(raw, ensure_ascii=False))
            try:
                return json.loads(text)
            except Exception:
                return raw
        return raw

    @classmethod
    def execute(cls, config: Dict, context: ActionContext) -> ActionResult:
        url = str(context.resolve(config.get('url', '')) or '').strip()
        method = str(config.get('method', 'GET') or 'GET').upper()
        if not url:
            return ActionResult(success=False, message='未指定请求 URL',
                                data={'error': 'missing_url'})
        if not url.startswith(('http://', 'https://')):
            return ActionResult(success=False, message=f'URL 必须以 http(s):// 开头: {url[:60]}',
                                data={'error': 'invalid_url'})

        try:
            timeout = min(max(int(config.get('timeout') or 15), 1), 60)
        except (TypeError, ValueError):
            timeout = 15

        headers = cls._coerce_mapping(config.get('headers'), context)
        query = cls._coerce_mapping(config.get('query'), context)
        body = cls._coerce_body(config.get('body'), context)

        # 集成应用认证注入（显式配置的同名 header/query 优先）
        auth = cls._load_auth(config.get('auth_app_id'))
        merged_query = dict(auth.get('query') or {})
        merged_query.update(query)
        merged_headers = dict(auth.get('headers') or {})
        merged_headers.update(headers)

        try:
            import requests as http_requests
            resp = http_requests.request(
                method, url,
                headers=merged_headers or None,
                params=merged_query or None,
                json=body if isinstance(body, (dict, list)) else None,
                data=body if isinstance(body, str) else None,
                timeout=timeout,
                verify=False,
                allow_redirects=True,
            )
            # 响应解析：JSON 优先，否则截断文本
            try:
                payload = resp.json()
            except Exception:
                payload = resp.text[:2000]

            item = {
                'json': {
                    'status_code': resp.status_code,
                    'ok': 200 <= resp.status_code < 300,
                    'url': resp.url,
                    'method': method,
                    'response': payload,
                },
                'paired_items': [],
            }
            ok = 200 <= resp.status_code < 300
            return ActionResult(
                success=ok,
                message=f'HTTP {resp.status_code} {method} {url[:80]}',
                data={'status_code': resp.status_code, 'url': url},
                items=[item],
            )
        except Exception as e:
            return ActionResult(success=False, message=f'HTTP 请求失败: {str(e)[:200]}',
                                data={'error': str(e)[:500]})


# ═══════════════════════════════════════════════════════════
# 邮件发送节点（SMTP，配置见 全局配置→邮件服务）
# ═══════════════════════════════════════════════════════════

class SendEmailAction(ActionHandler):
    """邮件发送节点：通过平台 SMTP 配置发送邮件。

    config:
      to       收件人（多个用逗号分隔，支持 {{...}} 表达式）
      cc       抄送（可选）
      subject  主题（支持表达式）
      body     正文（支持表达式；下游报告节点用 {{ 节点名.report_markdown }} 引用）
      html     是否 HTML 正文（默认 否=纯文本）
    产出：items[0].json = {to, subject, ok, message_id, message}
    """
    name = 'send_email'
    description = '通过平台 SMTP 配置发送邮件（安全运营报告推送等场景）'

    @classmethod
    def execute(cls, config: Dict, context: ActionContext) -> ActionResult:
        to_raw = context.resolve(config.get('to', '') or '')
        cc_raw = context.resolve(config.get('cc', '') or '')
        subject = context.resolve(config.get('subject', '') or '') or 'USOP 通知'
        body = context.resolve(config.get('body', '') or config.get('content', '') or '')
        html = str(config.get('html', '否')).strip() in ('是', 'yes', 'true', 'True', '1')

        recipients = [x.strip() for x in str(to_raw).replace(';', ',').split(',') if x.strip()]
        cc_list = [x.strip() for x in str(cc_raw).replace(';', ',').split(',') if x.strip()] or None
        if not recipients:
            return ActionResult(False, '未指定收件人', {'to': to_raw})

        # 收件人格式粗校验
        bad = [r for r in recipients if '@' not in r]
        if bad:
            return ActionResult(False, f'收件人格式不正确: {", ".join(bad)}', {'to': to_raw})

        from app.utils.email_service import send_email
        result = send_email(recipients, subject, body, html=html, cc=cc_list)
        payload = {
            'to': ', '.join(recipients),
            'cc': ', '.join(cc_list) if cc_list else '',
            'subject': subject,
            'ok': bool(result.get('success')),
            'message_id': result.get('message_id', ''),
            'message': result.get('message', ''),
        }
        if result.get('success'):
            return ActionResult(True, result['message'], payload, items=[{'json': payload}])
        return ActionResult(False, result['message'], payload, items=[{'json': payload}])


class CreateEventAction(ActionHandler):
    """生成事件节点：把上游告警聚合成工作台事件（含去重）。

    config:
      title        事件标题（支持 {{...}} 表达式；默认「剧本自动生成事件」）
      severity     critical/high/medium/low（默认 high）
      category     事件分类（默认 其他）
      description  事件描述（支持表达式）
      dedupe       是/否（默认 是）：告警已在某事件的 alert_ids 里则跳过该告警
      mark_status  告警状态回写（默认 investigating，与「聚合生成事件」一致）

    告警来源（自动收集，按序去重）：
      1. config.alert_ids 表达式（如 {{ 聚合.collect_id }}）
      2. 输入 items 的 json.id（过滤节点放行的逐条告警）
      3. 输入 items 中形如列表的值里以 ALT- 开头的字符串（聚合 collect 节点输出）
    全部告警都已生成过事件时返回 success=True + skipped=True（剧本继续走通）。
    产出：items[0].json = {event_code, event_id, created, skipped, new_alert_ids, dup_alert_ids}
    """
    name = 'create_event'
    description = '把告警聚合生成工作台事件（已生成过事件的告警自动跳过）'

    @classmethod
    def _collect_alert_ids(cls, config: Dict, context: 'ActionContext') -> list:
        ids: list = []
        expr = context.resolve(config.get('alert_ids') or '')
        if expr:
            if isinstance(expr, (list, tuple)):
                ids.extend(str(x) for x in expr)
            else:
                ids.extend(x.strip() for x in re.split(r'[,\s]+', str(expr)) if x.strip())
        for it in (context.items or []):
            data = it.get('json') or {}
            if isinstance(data, dict):
                if data.get('id'):
                    ids.append(str(data['id']))
                for v in data.values():
                    if isinstance(v, (list, tuple)):
                        ids.extend(str(x) for x in v
                                   if isinstance(x, str) and x.startswith('ALT-'))
        seen, uniq = set(), []
        for x in ids:
            if x and x not in seen:
                seen.add(x)
                uniq.append(x)
        return uniq

    @classmethod
    def execute(cls, config: Dict, context: ActionContext) -> ActionResult:
        from app.database import db
        from app.models import Event
        from app.utils import es_alerts

        alert_ids = cls._collect_alert_ids(config, context)
        if not alert_ids:
            return ActionResult(False, '未指定要生成事件的告警（需要上游查询/过滤节点提供告警 id）',
                                {'created': False})

        dedupe = str(config.get('dedupe', '是')).strip() not in ('否', 'false', 'False', '0', 'no')
        dup_ids, new_ids = [], list(alert_ids)
        if dedupe:
            new_ids = []
            events = Event.query.all()
            referenced = set()
            for ev in events:
                extra = ev.extra_data or {}
                for x in (extra.get('alert_ids') or []):
                    referenced.add(str(x))
            for aid in alert_ids:
                (dup_ids if aid in referenced else new_ids).append(aid)

        title = context.resolve(config.get('title') or '') or '剧本自动生成事件'
        severity = context.resolve(config.get('severity') or '') or 'high'
        category = context.resolve(config.get('category') or '') or '其他'
        description = context.resolve(config.get('description') or '')
        mark_status = context.resolve(config.get('mark_status') or '') or 'investigating'

        if not new_ids:
            return ActionResult(True, f'所有 {len(alert_ids)} 条告警均已生成过事件，跳过',
                                {'created': False, 'skipped': True,
                                 'dup_alert_ids': dup_ids},
                                items=[{'json': {'created': False, 'skipped': True,
                                                 'dup_alert_ids': dup_ids}}])

        # 关联告警详情 + 统计 + 主责源 IP + 自动描述（与人工聚合同一口径）
        alert_docs = {aid: (es_alerts.get_alert(aid) or {}) for aid in new_ids}
        from app.utils import event_enrichment
        content = event_enrichment.build_event_content(
            alert_docs, origin='剧本自动生成', user_description=description)

        event_code = f"EVT-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
        event = Event(
            event_code=event_code,
            title=title,
            description=content['description'],
            severity=severity,
            src_ip=content['src_ip'] or None,
            source='playbook',
            status='investigating',   # 状态机合法态（关联告警同批转 investigating）
            category=category,
            extra_data={'alert_ids': new_ids,
                        'related_alerts': content['related_alerts'],
                        'summary': content['summary'],
                        'alert_count': len(new_ids),
                        'source': 'playbook',
                        'dup_alert_ids': dup_ids},
        )
        db.session.add(event)
        db.session.flush()
        event_id = event.id
        db.session.commit()
        try:
            from app.utils import event_alert_link
            event_alert_link.link_alerts_to_event(new_ids, event_code, mark_status)
        except Exception:
            pass  # 状态回写失败不阻断事件创建

        payload = {'created': True, 'skipped': False, 'event_code': event_code,
                   'event_id': event_id, 'new_alert_ids': new_ids,
                   'dup_alert_ids': dup_ids, 'alerts_count': len(new_ids)}
        return ActionResult(True, f'事件 {event_code} 已生成（{len(new_ids)} 条告警'
                            + (f'；{len(dup_ids)} 条已生成过跳过' if dup_ids else '') + '）',
                            payload, items=[{'json': payload}])


ACTIONS = {
    'block_ip': BlockIPAction,
    'unblock_ip': UnblockIPAction,
    'quarantine_host': QuarantineHostAction,
    'send_notification': SendNotificationAction,
    'webhook': WebhookAction,
    'run_script': RunScriptAction,
    'update_event': UpdateEventAction,
    'add_tag': AddTagAction,
    'enrich_ip': EnrichIPAction,
    'ai_analysis': AIAnalysisAction,
    'ai_llm': LLMAction,
    'recall_experience': RecallExperienceAction,
    'create_ticket': CreateTicketAction,
    'query_data': QueryDataAction,
    'http_request': HttpRequestAction,
    'send_email': SendEmailAction,
    'create_event': CreateEventAction,
}

# ── 动作参数配置 Schema（通用动作节点的「具体配置页面」数据源）────────────────
# 每项：{name, label, type, required?, placeholder?, options?, dynamic?, default?, desc?}
# type: text | textarea | number | select | boolean
# dynamic: querySources=存储表数据源选项 / promptKeys=AI 中心提示词职责选项
ACTION_PARAM_SCHEMAS: Dict[str, list] = {
    'block_ip': [
        {'name': 'ip', 'label': 'IP 地址', 'type': 'text', 'required': True,
         'placeholder': '{{ $json.src_ip }}', 'desc': '要封堵的 IP，支持 {{ 表达式 }}'},
        {'name': 'duration', 'label': '封堵时长', 'type': 'text', 'placeholder': '24h',
         'desc': '30s/5m/2h/1d，到期自动解除；留空长期有效'},
        {'name': 'reason', 'label': '封堵原因', 'type': 'text', 'placeholder': '恶意攻击自动封堵'},
        {'name': 'api_url', 'label': '防火墙 API', 'type': 'text',
         'placeholder': 'https://fw.internal/api/block', 'desc': '留空用平台默认封堵（落封堵名单）'},
        {'name': 'api_token', 'label': 'API Token', 'type': 'text', 'placeholder': ''},
    ],
    'unblock_ip': [
        {'name': 'ip', 'label': 'IP 地址', 'type': 'text', 'required': True,
         'placeholder': '{{ $json.src_ip }}'},
        {'name': 'reason', 'label': '解封原因', 'type': 'text', 'placeholder': '手动解封'},
    ],
    'quarantine_host': [
        {'name': 'hostname', 'label': '主机名', 'type': 'text',
         'placeholder': '{{ $json.hostname }}', 'desc': '与 IP 二选一即可'},
        {'name': 'ip', 'label': 'IP 地址', 'type': 'text', 'placeholder': '{{ $json.src_ip }}'},
        {'name': 'duration', 'label': '隔离时长', 'type': 'text', 'placeholder': '2h'},
        {'name': 'api_url', 'label': 'EDR/隔离 API', 'type': 'text',
         'placeholder': 'https://edr.internal/api/isolate', 'desc': '留空降级为封 IP 并明确标注'},
        {'name': 'api_token', 'label': 'API Token', 'type': 'text', 'placeholder': ''},
    ],
    'send_notification': [
        {'name': 'channel', 'label': '通知渠道', 'type': 'select', 'required': True,
         'options': ['企业微信', '钉钉', '飞书', 'Slack', 'Webhook', '邮件']},
        {'name': 'title', 'label': '标题', 'type': 'text', 'placeholder': '安全告警通知'},
        {'name': 'content', 'label': '内容', 'type': 'textarea', 'placeholder': '告警详情...'},
        {'name': 'webhook_url', 'label': 'Webhook URL', 'type': 'text',
         'placeholder': '留空用 全局配置→通知渠道 默认值'},
        {'name': 'recipients', 'label': '收件人', 'type': 'text',
         'placeholder': '留空用全局默认收件人；多个用逗号分隔'},
    ],
    'webhook': [
        {'name': 'url', 'label': 'Webhook URL', 'type': 'text', 'required': True,
         'placeholder': 'https://example.com/hook'},
        {'name': 'method', 'label': '方法', 'type': 'select',
         'options': ['GET', 'POST', 'PUT', 'DELETE'], 'default': 'POST'},
        {'name': 'headers', 'label': 'Headers', 'type': 'textarea',
         'placeholder': '每行一条：Authorization: Bearer xxx'},
        {'name': 'body', 'label': '请求体（JSON）', 'type': 'textarea',
         'placeholder': '{"key": "{{ $json.src_ip }}"}'},
    ],
    'run_script': [
        {'name': 'language', 'label': '语言', 'type': 'select',
         'options': ['Python', 'Bash'], 'default': 'Bash'},
        {'name': 'script', 'label': '脚本内容', 'type': 'textarea', 'required': True,
         'placeholder': '上下文变量以环境变量注入：USOP_EVENT_SRC_IP / USOP_PARAM_XXX'},
        {'name': 'timeout', 'label': '超时（秒）', 'type': 'number', 'default': 60},
    ],
    'update_event': [
        {'name': 'event_code', 'label': '事件编号', 'type': 'text', 'required': True,
         'placeholder': '{{ $json.event_code }}'},
        {'name': 'status', 'label': '事件状态', 'type': 'select',
         'options': ['', 'new', 'acknowledged', 'investigating', 'resolved', 'closed', 'false_positive']},
        {'name': 'severity', 'label': '严重级别', 'type': 'select',
         'options': ['', 'critical', 'high', 'medium', 'low']},
        {'name': 'analysis', 'label': '分析结论', 'type': 'textarea',
         'placeholder': "{{ $('AI事件研判').json.conclusion }}",
         'desc': '回写到事件 extra_data.ai_analysis（工作台展示位）'},
    ],
    'add_tag': [
        {'name': 'event_code', 'label': '事件编号', 'type': 'text', 'required': True,
         'placeholder': '{{ $json.event_code }}'},
        {'name': 'tag', 'label': '标签', 'type': 'text', 'required': True,
         'placeholder': '已自动处置'},
    ],
    'enrich_ip': [
        {'name': 'value', 'label': '查询值', 'type': 'text', 'required': True,
         'placeholder': '{{ $json.src_ip }}'},
        {'name': 'provider', 'label': '情报源', 'type': 'select',
         'options': ['微步在线', 'VirusTotal'], 'default': '微步在线',
         'desc': '响应本身没有危害等级字段；节点会自动归一化，'
                 '下游条件/通知可直接用 {{ threat_level }}（critical/high/medium/low/none）、'
                 '{{ threat_score }}、{{ is_malicious }}、{{ threat_tags }}、{{ threat_reason }}'},
        {'name': 'type', 'label': '情报类型', 'type': 'select',
         'options': ['IP情报', '域名情报', 'URL情报', '文件哈希'], 'default': 'IP情报'},
        {'name': 'api_key', 'label': 'API Key', 'type': 'text',
         'placeholder': '留空用「集成应用」已配置凭证'},
    ],
    'ai_analysis': [
        {'name': 'model', 'label': '模型', 'type': 'text', 'default': 'deepseek-chat'},
        {'name': 'temperature', 'label': '温度', 'type': 'number', 'default': 0.3},
        {'name': 'includeAlerts', 'label': '附带关联告警', 'type': 'select',
         'options': ['是', '否'], 'default': '是'},
        {'name': 'systemPrompt', 'label': '系统提示词', 'type': 'textarea'},
    ],
    'ai_llm': [
        {'name': 'prompt_key', 'label': 'AI 中心提示词职责', 'type': 'select',
         'dynamic': 'promptKeys', 'desc': '选用 AI 中心已编排的提示词模板'},
        {'name': 'system_prompt', 'label': '系统提示词', 'type': 'textarea',
         'placeholder': '你是安全运营分析助手…'},
        {'name': 'user_prompt', 'label': '用户提示词', 'type': 'textarea',
         'placeholder': '请分析：{{ $json.title }}'},
        {'name': 'output_format', 'label': '输出格式', 'type': 'select',
         'options': ['json', 'text'], 'default': 'json'},
        {'name': 'temperature', 'label': '温度', 'type': 'number', 'default': 0.2},
        {'name': 'max_tokens', 'label': '最大 Token', 'type': 'number', 'default': 2048},
    ],
    'recall_experience': [
        {'name': 'category', 'label': '告警分类', 'type': 'text',
         'placeholder': '{{ $json.category }}'},
        {'name': 'attack_type', 'label': '攻击类型', 'type': 'text',
         'placeholder': '{{ $json.attack_type }}'},
        {'name': 'limit', 'label': '召回条数', 'type': 'number', 'default': 5},
        {'name': 'output_field', 'label': '输出字段名', 'type': 'text', 'default': 'experiences'},
    ],
    'create_ticket': [
        {'name': 'title', 'label': '工单标题', 'type': 'text', 'required': True,
         'placeholder': '安全事件处理工单'},
        {'name': 'priority', 'label': '优先级', 'type': 'select',
         'options': ['高', '中', '低'], 'default': '中'},
        {'name': 'assignee', 'label': '指派人', 'type': 'text', 'placeholder': '安全运维'},
        {'name': 'system', 'label': '工单系统', 'type': 'select',
         'options': ['内部系统', 'ServiceNow', 'Jira', '自定义'], 'default': '内部系统'},
        {'name': 'description', 'label': '工单描述', 'type': 'textarea'},
        {'name': 'api_url', 'label': '工单系统 API', 'type': 'text',
         'placeholder': 'https://itsm.internal/api/tickets', 'desc': '留空只落平台工单记录'},
    ],
    'query_data': [
        {'name': 'source', 'label': '数据源', 'type': 'select', 'dynamic': 'querySources',
         'options': ['告警表', '资产表', '漏洞表', '事件表'], 'default': '告警表',
         'desc': '含存储表管理注册的数据库表'},
        {'name': 'conditions', 'label': '查询条件', 'type': 'textarea',
         'placeholder': '每行一条：字段|运算符|值\n例：severity|等于|critical',
         'desc': '运算符：等于/不等于/包含/不包含/前缀/正则/大于/小于/存在/不存在；值支持 {{ 表达式 }}'},
        {'name': 'query', 'label': '高级查询（lucene）', 'type': 'text',
         'placeholder': 'severity:critical AND NOT src_ip:10.*',
         'desc': '与查询条件叠加（AND）；field:value 语法'},
        {'name': 'hours', 'label': '时间窗口（小时）', 'type': 'number',
         'desc': '留空不限；24=当天'},
        {'name': 'limit', 'label': '返回条数', 'type': 'number', 'default': 20},
    ],
    'http_request': [
        {'name': 'method', 'label': '方法', 'type': 'select',
         'options': ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], 'default': 'GET'},
        {'name': 'url', 'label': 'URL', 'type': 'text', 'required': True,
         'placeholder': 'https://api.example.com/...（支持 {{ 表达式 }}）'},
        {'name': 'headers', 'label': 'Headers', 'type': 'textarea',
         'placeholder': '每行一条：名称: 值'},
        {'name': 'query', 'label': 'Query 参数', 'type': 'textarea',
         'placeholder': '每行一条：名称: 值'},
        {'name': 'body', 'label': '请求体', 'type': 'textarea',
         'placeholder': 'JSON，如 {"ip": "{{ $json.src_ip }}"}'},
        {'name': 'timeout', 'label': '超时（秒）', 'type': 'number', 'default': 15},
        {'name': 'success_path', 'label': '业务成败字段', 'type': 'text',
         'placeholder': 'response.success',
         'desc': '设备常以 200 + 响应体错误码表示失败，填响应体里的点路径作为真正的成败依据'},
        {'name': 'intel_profile', 'label': '情报源归一化', 'type': 'select',
         'options': ['无', 'auto', 'threatbook_ip', 'virustotal_ip'], 'default': '无',
         'desc': '微步/VirusTotal 响应没有危害等级字段；选 auto 或具体源后，'
                 '自动算成 threat_level（critical/high/medium/low/none）与 threat_score，'
                 '下游条件节点可直接判 threat_level'},
    ],
    'send_email': [
        {'name': 'to', 'label': '收件人', 'type': 'text', 'required': True,
         'placeholder': '多个用逗号分隔；支持 {{ 表达式 }}'},
        {'name': 'cc', 'label': '抄送', 'type': 'text', 'placeholder': '可选'},
        {'name': 'subject', 'label': '主题', 'type': 'text', 'required': True,
         'placeholder': 'USOP 安全运营报告'},
        {'name': 'body', 'label': '正文', 'type': 'textarea',
         'placeholder': "{{ $('安全运营报告').json.report_markdown }}"},
        {'name': 'html', 'label': 'HTML 正文', 'type': 'select',
         'options': ['否', '是'], 'default': '否'},
    ],
    'create_event': [
        {'name': 'title', 'label': '事件标题', 'type': 'text', 'required': True,
         'placeholder': '可疑告警自动处置 - {{ $json.src_ip }}'},
        {'name': 'severity', 'label': '严重级别', 'type': 'select',
         'options': ['critical', 'high', 'medium', 'low'], 'default': 'high'},
        {'name': 'category', 'label': '事件分类', 'type': 'text', 'placeholder': '可疑行为'},
        {'name': 'description', 'label': '事件描述', 'type': 'textarea'},
        {'name': 'dedupe', 'label': '已生成过事件的告警跳过', 'type': 'select',
         'options': ['是', '否'], 'default': '是'},
    ],
}


def get_action_schema(name: str) -> list:
    """取动作参数 schema（无 schema 的动作返回空列表，前端回退原始参数框）。"""
    return ACTION_PARAM_SCHEMAS.get(name, [])


def get_action(name: str):
    """获取动作处理器"""
    return ACTIONS.get(name)


def list_actions() -> list:
    """列出所有可用动作（含参数 schema，供「通用动作」节点渲染具体配置页面）"""
    return [{'name': cls.name, 'description': cls.description,
             'params': ACTION_PARAM_SCHEMAS.get(cls.name, [])}
            for cls in ACTIONS.values()]
