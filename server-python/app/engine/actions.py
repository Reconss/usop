"""
剧本动作处理器 - 支持 IP 封堵、通知、Webhook、脚本执行等操作
"""
import subprocess
import json
import os
from datetime import datetime
from typing import Any, Dict, Optional


class ActionResult:
    """动作执行结果"""

    def __init__(self, success: bool, message: str, data: Dict = None):
        self.success = success
        self.message = message
        self.data = data or {}
        self.timestamp = datetime.utcnow()

    def to_dict(self):
        return {
            'success': self.success,
            'message': self.message,
            'data': self.data,
            'timestamp': self.timestamp.isoformat()
        }


class ActionContext:
    """动作执行上下文 - 在节点间传递"""

    def __init__(self, event: Dict = None, alert: Dict = None,
                 params: Dict = None, previous_results: list = None):
        self.event = event or {}
        self.alert = alert or {}
        self.params = params or {}
        self.previous_results = previous_results or []
        self.variables = {}  # 节点间共享变量

    def resolve(self, value: Any) -> Any:
        """解析模板变量 {{event.field}} {{params.key}} {{variables.name}}"""
        if not isinstance(value, str):
            return value
        result = value
        for match in __import__('re').finditer(r'\{\{(\w+)\.(\w+)\}\}', value):
            full = match.group(0)
            source = match.group(1)
            field = match.group(2)
            if source == 'event':
                result = result.replace(full, str(self.event.get(field, '')))
            elif source == 'params':
                result = result.replace(full, str(self.params.get(field, '')))
            elif source == 'variables':
                result = result.replace(full, str(self.variables.get(field, '')))
            elif source == 'alert':
                result = result.replace(full, str(self.alert.get(field, '')))
        return result

    def get(self, field: str, default=None):
        """从上下文取值，优先级: event > alert > params > variables"""
        for source in [self.event, self.alert, self.params, self.variables]:
            if field in source:
                return source[field]
        return default


# ─── IP 封堵管理 ─────────────────────────────────────────────

class IPBlockManager:
    """IP 封堵管理器

    支持多种封堵方式:
    - iptables (本地)
    - API 回调 (外部防火墙/封堵设备)
    - 文件记录 (模拟/审计)
    """

    _blocked_ips = {}  # ip -> {reason, timestamp, source}

    @classmethod
    def block_ip(cls, ip: str, reason: str = "", source: str = "playbook",
                 device_api: str = None, device_token: str = None) -> ActionResult:
        """封堵 IP"""
        if not ip or ip in ('0.0.0.0', '127.0.0.1', '::1'):
            return ActionResult(False, f'不允许封堵保留 IP: {ip}')

        # 检查是否已封堵
        if ip in cls._blocked_ips:
            return ActionResult(False, f'IP {ip} 已被封堵', cls._blocked_ips[ip])

        block_entry = {
            'ip': ip,
            'reason': reason,
            'source': source,
            'timestamp': datetime.utcnow().isoformat(),
            'method': 'api'
        }

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

        cls._blocked_ips[ip] = block_entry

        # 记录到文件（持久化审计）
        cls._log_block_action('block', ip, reason, source)

        return ActionResult(True, f'IP {ip} 封堵成功 [{block_entry["method"]}]', block_entry)

    @classmethod
    def unblock_ip(cls, ip: str, reason: str = "") -> ActionResult:
        """解封 IP"""
        if ip not in cls._blocked_ips:
            return ActionResult(False, f'IP {ip} 未被封堵')

        block_entry = cls._blocked_ips.pop(ip)

        # 清理 iptables 规则
        if block_entry.get('method') == 'iptables':
            cls._unblock_via_iptables(ip)

        cls._log_block_action('unblock', ip, reason, block_entry.get('source', ''))

        return ActionResult(True, f'IP {ip} 解封成功', block_entry)

    @classmethod
    def is_blocked(cls, ip: str) -> bool:
        return ip in cls._blocked_ips

    @classmethod
    def list_blocks(cls) -> list:
        return [{'ip': ip, **info} for ip, info in cls._blocked_ips.items()]

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
    def execute(cls, config: Dict, context: ActionContext) -> ActionResult:
        raise NotImplementedError


class BlockIPAction(ActionHandler):
    name = "block_ip"
    description = "封堵 IP 地址"

    @classmethod
    def execute(cls, config: Dict, context: ActionContext) -> ActionResult:
        ip = context.resolve(config.get('ip', '')) or context.get('src_ip', '')
        reason = context.resolve(config.get('reason', '安全事件处置'))

        if not ip:
            return ActionResult(False, '未指定要封堵的 IP 地址')

        device_api = config.get('device_api')
        device_token = config.get('device_token')

        return IPBlockManager.block_ip(
            ip, reason,
            device_api=device_api,
            device_token=device_token
        )


class UnblockIPAction(ActionHandler):
    name = "unblock_ip"
    description = "解封 IP 地址"

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
    def execute(cls, config: Dict, context: ActionContext) -> ActionResult:
        hostname = context.resolve(config.get('hostname', '')) or context.get('hostname', '')
        ip = context.resolve(config.get('ip', '')) or context.get('src_ip', '')

        if not hostname and not ip:
            return ActionResult(False, '未指定要隔离的主机')

        target = hostname or ip
        # 先封堵 IP
        if ip:
            IPBlockManager.block_ip(ip, f'主机隔离: {target}', 'quarantine')

        return ActionResult(True, f'主机 {target} 已隔离', {
            'hostname': hostname, 'ip': ip, 'quarantined': True
        })


class SendNotificationAction(ActionHandler):
    name = "send_notification"
    description = "发送通知"

    @classmethod
    def execute(cls, config: Dict, context: ActionContext) -> ActionResult:
        title = context.resolve(config.get('title', '安全通知'))
        message = context.resolve(config.get('message', ''))

        # 尝试通过系统通知
        notification = {
            'title': title,
            'message': message,
            'type': config.get('type', 'info'),
            'channel': config.get('channel', 'system'),
            'recipients': config.get('recipients', [])
        }

        # 写入通知到数据库
        try:
            from app.database import db
            from app.models import Notification
            notif = Notification(
                title=title,
                message=message,
                type=config.get('type', 'info')
            )
            db.session.add(notif)
            db.session.commit()
            notification['id'] = notif.id
        except Exception:
            pass

        return ActionResult(True, f'通知已发送: {title}', notification)


class WebhookAction(ActionHandler):
    name = "webhook"
    description = "调用外部 Webhook"

    @classmethod
    def execute(cls, config: Dict, context: ActionContext) -> ActionResult:
        url = context.resolve(config.get('url', ''))
        method = config.get('method', 'POST').upper()
        headers = config.get('headers', {})
        body = config.get('body', {})

        if not url:
            return ActionResult(False, '未指定 Webhook URL')

        # 解析 body 中的模板变量
        body_str = json.dumps(body)
        body_str = context.resolve(body_str)
        body = json.loads(body_str)

        try:
            import urllib.request
            import urllib.error

            payload = json.dumps(body).encode() if body else None
            req = urllib.request.Request(url, data=payload, method=method)
            req.add_header('Content-Type', 'application/json')
            for key, val in (headers or {}).items():
                req.add_header(key, context.resolve(str(val)))

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

    @classmethod
    def execute(cls, config: Dict, context: ActionContext) -> ActionResult:
        script = config.get('script', '')
        script_type = config.get('script_type', 'shell')
        timeout = config.get('timeout', 60)

        if not script:
            return ActionResult(False, '未指定要执行的脚本')

        # 将上下文变量注入脚本环境
        env = os.environ.copy()
        for key, val in context.event.items():
            env[f'USOP_EVENT_{key.upper()}'] = str(val) if val else ''
        for key, val in context.params.items():
            env[f'USOP_PARAM_{key.upper()}'] = str(val) if val else ''

        try:
            if script_type == 'python':
                result = subprocess.run(
                    ['python3', '-c', script],
                    capture_output=True, text=True,
                    timeout=timeout, env=env
                )
            else:
                result = subprocess.run(
                    ['bash', '-c', script],
                    capture_output=True, text=True,
                    timeout=timeout, env=env
                )

            success = result.returncode == 0
            msg = '脚本执行成功' if success else f'脚本执行失败 (exit {result.returncode})'
            data = {
                'stdout': result.stdout[-2000:] if result.stdout else '',
                'stderr': result.stderr[-2000:] if result.stderr else '',
                'returncode': result.returncode
            }
            return ActionResult(success, msg, data)
        except subprocess.TimeoutExpired:
            return ActionResult(False, f'脚本执行超时 ({timeout}s)')
        except Exception as e:
            return ActionResult(False, f'脚本执行异常: {str(e)}')


class UpdateEventAction(ActionHandler):
    name = "update_event"
    description = "更新事件状态/严重度"

    @classmethod
    def execute(cls, config: Dict, context: ActionContext) -> ActionResult:
        event_code = context.get('event_code') or config.get('event_code', '')

        if not event_code:
            return ActionResult(False, '未指定事件编号')

        updates = {}
        if 'status' in config:
            updates['status'] = context.resolve(config['status'])
        if 'severity' in config:
            updates['severity'] = context.resolve(config['severity'])

        if not updates:
            return ActionResult(False, '未指定要更新的字段')

        try:
            from app.database import db
            from app.models import Event
            event = Event.query.filter_by(event_code=event_code).first()
            if not event:
                return ActionResult(False, f'事件 {event_code} 不存在')

            for key, val in updates.items():
                setattr(event, key, val)
            db.session.commit()

            return ActionResult(True, f'事件 {event_code} 已更新', updates)
        except Exception as e:
            db.session.rollback()
            return ActionResult(False, f'事件更新失败: {str(e)}')


class AddTagAction(ActionHandler):
    name = "add_tag"
    description = "添加标签到事件"

    @classmethod
    def execute(cls, config: Dict, context: ActionContext) -> ActionResult:
        event_code = context.get('event_code') or config.get('event_code', '')
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
    description = "IP 威胁情报富化"

    @classmethod
    def execute(cls, config: Dict, context: ActionContext) -> ActionResult:
        ip = context.resolve(config.get('ip', '')) or context.get('src_ip', '')

        if not ip:
            return ActionResult(False, '未指定要查询的 IP')

        # 基础 IP 信息
        info = {
            'ip': ip,
            'is_private': ip.startswith(('10.', '172.16.', '172.17.', '172.18.',
                                         '172.19.', '172.20.', '172.21.', '172.22.',
                                         '172.23.', '172.24.', '172.25.', '172.26.',
                                         '172.27.', '172.28.', '172.29.', '172.30.',
                                         '172.31.', '192.168.', '127.', '0.'))
        }

        # 尝试调用外部威胁情报 API
        vt_api_key = config.get('virustotal_api_key') or os.getenv('VT_API_KEY')
        if vt_api_key and not info['is_private']:
            try:
                import urllib.request
                url = f'https://www.virustotal.com/api/v3/ip_addresses/{ip}'
                req = urllib.request.Request(url)
                req.add_header('x-apikey', vt_api_key)
                with urllib.request.urlopen(req, timeout=10) as resp:
                    vt_data = json.loads(resp.read())
                    attrs = vt_data.get('data', {}).get('attributes', {})
                    info['virustotal'] = {
                        'malicious': attrs.get('last_analysis_stats', {}).get('malicious', 0),
                        'suspicious': attrs.get('last_analysis_stats', {}).get('suspicious', 0),
                        'country': attrs.get('country'),
                        'as_owner': attrs.get('as_owner')
                    }
            except Exception:
                info['virustotal'] = {'error': '查询失败或不可用'}

        return ActionResult(True, f'IP {ip} 情报查询完成', info)


# 注册所有动作处理器
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
}


def get_action(name: str):
    """获取动作处理器"""
    return ACTIONS.get(name)


def list_actions() -> list:
    """列出所有可用动作"""
    return [{'name': cls.name, 'description': cls.description} for cls in ACTIONS.values()]
