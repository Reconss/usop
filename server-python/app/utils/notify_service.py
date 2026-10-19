# -*- coding: utf-8 -*-
"""通知渠道服务：企业微信/钉钉/飞书/Slack webhook + 邮件默认收件人。

集中配置持久化在 SystemConfig（key=`notify_channels_config`），供：
  - 全局配置→通知渠道 页面读写与连通性测试
  - 剧本「发送通知」节点回退（节点未填 webhook_url 时用渠道默认值）
  - 邮件渠道默认收件人（节点未指定收件人时使用）

webhook URL 含敏感 key 参数，读时打码（`******`），写回 `******` 表示保留原值
（与 SMTP 授权码 / AD 服务账号密码同一约定）。
"""
import json
import re

from app.database import db
from app.models import SystemConfig

CONFIG_KEY = 'notify_channels_config'
MASK = '******'

# 前端渠道中文名 → 配置键
CHANNEL_ALIASES = {
    '企业微信': 'wecom', 'wecom': 'wecom', '企业微信机器人': 'wecom',
    '钉钉': 'dingtalk', 'dingtalk': 'dingtalk',
    '飞书': 'feishu', 'feishu': 'feishu', 'lark': 'feishu',
    'slack': 'slack', 'Slack': 'slack',
    'webhook': 'webhook', 'Webhook': 'webhook',
    '邮件': 'email', 'email': 'email', '邮件通知': 'email',
}

CHANNEL_LABELS = {
    'wecom': '企业微信',
    'dingtalk': '钉钉',
    'feishu': '飞书',
    'slack': 'Slack',
    'webhook': '通用 Webhook',
    'email': '邮件',
}

# webhook 渠道（不含 email）
WEBHOOK_CHANNELS = ('wecom', 'dingtalk', 'feishu', 'slack', 'webhook')

DEFAULT_CONFIG = {
    'wecom': {'enabled': False, 'webhook_url': ''},
    'dingtalk': {'enabled': False, 'webhook_url': ''},
    'feishu': {'enabled': False, 'webhook_url': ''},
    'slack': {'enabled': False, 'webhook_url': ''},
    'webhook': {'enabled': False, 'webhook_url': ''},
    'email': {'enabled': False, 'default_recipients': ''},
}


def normalize_channel(channel) -> str:
    """渠道名归一化：中文/大小写 → 配置键；未知渠道返回空串。"""
    return CHANNEL_ALIASES.get(str(channel or '').strip(), '')


def _load_raw() -> dict:
    row = SystemConfig.query.filter_by(key=CONFIG_KEY).first()
    if row and row.value:
        try:
            stored = json.loads(row.value)
            if isinstance(stored, dict):
                return stored
        except (ValueError, TypeError):
            pass
    return {}


def mask_webhook(url: str) -> str:
    """打码 webhook 中的敏感参数值（key/token/access_token/sign/secret）。"""
    if not url:
        return url
    return re.sub(
        r'((?:key|token|access_token|sign|secret|password)=)[^&\s]+',
        r'\1' + MASK, url, flags=re.IGNORECASE)


def get_notify_config(mask: bool = True) -> dict:
    """读取通知渠道配置；mask=True 时 webhook 敏感参数打码。"""
    cfg = json.loads(json.dumps(DEFAULT_CONFIG))  # deep copy
    stored = _load_raw()
    for ch, val in stored.items():
        if isinstance(val, dict) and ch in cfg:
            cfg[ch].update(val)
    has_webhook = {}
    if mask:
        for ch in WEBHOOK_CHANNELS:
            raw = cfg[ch].get('webhook_url') or ''
            has_webhook[ch] = bool(raw)
            cfg[ch]['webhook_url'] = mask_webhook(raw) if raw else ''
    else:
        for ch in WEBHOOK_CHANNELS:
            has_webhook[ch] = bool(cfg[ch].get('webhook_url'))
    cfg['has_webhook'] = has_webhook
    cfg['email'] = cfg.get('email') or {'enabled': False, 'default_recipients': ''}
    return cfg


def save_notify_config(data: dict) -> dict:
    """保存配置。webhook_url 含 `******` 表示该渠道保留原 URL。"""
    current = get_notify_config(mask=False)
    cfg = json.loads(json.dumps(current))
    cfg.pop('has_webhook', None)
    for ch in WEBHOOK_CHANNELS:
        ch_data = data.get(ch) or {}
        if not isinstance(ch_data, dict):
            continue
        url = (ch_data.get('webhook_url') or '').strip()
        if MASK in url:
            url = cfg[ch].get('webhook_url') or ''  # 保留原值
        cfg[ch] = {
            'enabled': bool(ch_data.get('enabled')),
            'webhook_url': url,
        }
    email_data = data.get('email') or {}
    if isinstance(email_data, dict):
        cfg['email'] = {
            'enabled': bool(email_data.get('enabled')),
            'default_recipients': (email_data.get('default_recipients') or '').strip(),
        }

    row = SystemConfig.query.filter_by(key=CONFIG_KEY).first()
    if not row:
        row = SystemConfig(key=CONFIG_KEY, value='', category='notify')
        db.session.add(row)
    row.value = json.dumps(cfg, ensure_ascii=False)
    row.category = 'notify'
    db.session.commit()
    return get_notify_config(mask=True)


def get_channel_webhook(channel) -> str:
    """取渠道默认 webhook（不打码，引擎回退用）；渠道名支持中文。未配置返回空串。"""
    key = normalize_channel(channel)
    if key not in WEBHOOK_CHANNELS:
        return ''
    raw = _load_raw().get(key) or {}
    return (raw.get('webhook_url') or '').strip()


def get_email_default_recipients() -> str:
    """邮件渠道默认收件人（逗号分隔）。"""
    raw = _load_raw().get('email') or {}
    return (raw.get('default_recipients') or '').strip()


def dispatch_webhook(channel, url: str, title: str, content: str) -> str:
    """按渠道把消息 POST 到 webhook。返回结果描述（HTTP 状态/错误）。

    企业微信/钉钉加签模式不支持（需关键词或 IP 白名单）。
    """
    import urllib.request
    import urllib.error
    text = f'{title}\n{content}' if content else str(title)
    key = normalize_channel(channel) or channel
    if key == 'feishu':
        payload = {'msg_type': 'text', 'content': {'text': text}}
    elif key in ('wecom', 'dingtalk'):
        payload = {'msgtype': 'text', 'text': {'content': text}}
    elif key == 'slack':
        payload = {'text': text}
    else:  # webhook 通用
        payload = {'title': title, 'content': content}
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, method='POST')
    req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            body = r.read().decode('utf-8', 'ignore')[:200]
            # 群机器人 HTTP 200 但业务码可能失败（企微 errcode、钉钉 errcode、飞书 code）
            try:
                bj = json.loads(body)
                errcode = bj.get('errcode', bj.get('code', 0))
                if errcode not in (0, None, '0'):
                    return f'业务失败 errcode={errcode}: {bj.get("errmsg", bj.get("msg", ""))[:80]}'
            except (ValueError, TypeError):
                pass
            return f'HTTP {r.status}'
    except urllib.error.HTTPError as e:
        return f'HTTP {e.code}'
    except Exception as e:
        return f'ERR {str(e)[:60]}'


def test_channel(channel, url: str = None) -> dict:
    """连通性测试：真实 POST 一条测试消息。url 为空用已保存的渠道默认值。"""
    key = normalize_channel(channel)
    if not key:
        return {'success': False, 'message': f'不支持的渠道: {channel}'}
    if key == 'email':
        # 邮件渠道测试 = 向默认收件人发测试邮件（SMTP 未配置时返回明确错误）
        from app.utils.email_service import send_email
        recipients = [x.strip() for x in (url or get_email_default_recipients()
                                          or '').replace(';', ',').split(',') if x.strip()]
        if not recipients:
            return {'success': False,
                    'message': '未指定测试收件人（可传 url 参数或先配置邮件默认收件人）'}
        result = send_email(recipients, 'USOP 通知渠道测试',
                            '这是一条来自 全局配置→通知渠道 的测试邮件。')
        return {'success': bool(result.get('success')), 'message': result.get('message', '')}

    target = (url or '').strip() or get_channel_webhook(key)
    if not target:
        return {'success': False, 'message': f'{CHANNEL_LABELS.get(key, key)} 未配置 Webhook URL'}
    if not target.startswith(('http://', 'https://')):
        return {'success': False, 'message': 'Webhook URL 必须以 http(s):// 开头'}
    result = dispatch_webhook(key, target, 'USOP 通知渠道测试',
                              '这是一条来自 全局配置→通知渠道 的测试消息。')
    ok = result.startswith('HTTP 2')
    return {'success': ok, 'message': f'{CHANNEL_LABELS.get(key, key)} 测试: {result}'}


def execute_notification(config: dict, context) -> dict:
    """剧本通知节点/发送通知动作的统一执行入口。

    config: {channel, title, message/content, webhook_url, recipients, to}
    context: 引擎 ActionContext（用于 {{ 表达式 }} 解析）

    行为：站内信始终落库（审计）；外部渠道按「节点值 → 全局默认」回退真实外发；
    外部失败（HTTP 5xx/业务 errcode≠0）节点判失败，不再假成功。

    返回引擎约定结构：{success, message, data}
    """
    title = config.get('title', '剧本通知')
    # 前端画布字段名为 content，动作约定为 message —— 两者都接受
    message = config.get('message', '') or config.get('content', '')
    raw_channel = config.get('channel', 'system')
    node_webhook = context.resolve(config.get('webhook_url', '') or '')

    channel_key = normalize_channel(raw_channel)
    display_channel = CHANNEL_LABELS.get(channel_key, raw_channel)

    resolved_title = context.resolve(title)
    resolved_msg = context.resolve(message)

    # 1) 持久化到站内信收件箱（保留审计）
    notif_id = None
    try:
        from app.models import Notification
        notif = Notification(title=resolved_title, message=resolved_msg, type='info')
        db.session.add(notif)
        db.session.commit()
        notif_id = notif.id
    except Exception:
        db.session.rollback()

    external = None
    if channel_key == 'email':
        # ── 邮件渠道：节点收件人 → 全局默认收件人，走 SMTP ──
        recipients_raw = (context.resolve(config.get('recipients') or '')
                          or context.resolve(config.get('to') or '')
                          or get_email_default_recipients())
        recipients = [x.strip() for x in
                      str(recipients_raw).replace(';', ',').split(',') if x.strip()]
        if not recipients:
            external = '未指定收件人（节点收件人与 全局配置→通知渠道 默认收件人均为空）'
        else:
            from app.utils.email_service import send_email
            result = send_email(recipients, resolved_title,
                                resolved_msg or resolved_title)
            external = result.get('message', '')[:120]
    elif channel_key in WEBHOOK_CHANNELS or channel_key == '':
        # ── webhook 渠道：节点级 URL → 渠道默认 URL ──
        webhook_url = node_webhook.strip() or get_channel_webhook(channel_key)
        if webhook_url:
            external = dispatch_webhook(
                channel_key or 'webhook', webhook_url, resolved_title, resolved_msg)
        else:
            external = '未配置 Webhook（节点与 全局配置→通知渠道 均为空，仅发站内信）'

    success = True
    if external and external.startswith(('HTTP 5', 'ERR', '业务失败', '收件人格式')):
        success = False

    return {
        'success': success,
        'message': f'通知已发送 [{display_channel}]'
                   + (f'（外部: {external}）' if external else '（仅站内信）'),
        'data': {'notification_id': notif_id, 'external': external,
                 'channel': display_channel},
    }
