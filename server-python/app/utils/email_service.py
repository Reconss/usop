# -*- coding: utf-8 -*-
"""SMTP 邮件服务（安全运营报告发送等场景）。

配置持久化在 SystemConfig（key=`smtp_config`），密码读时打码、写时
`******` 表示未修改（与 AD 域配置同一约定）。
"""
import json
import smtplib
import ssl
from email.header import Header
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr

from app.database import db
from app.models import SystemConfig

CONFIG_KEY = 'smtp_config'
MASK = '******'

DEFAULT_CONFIG = {
    'enabled': False,
    'host': 'smtp.qq.com',
    'port': 465,
    'use_ssl': True,          # 465 → SSL 直连；587 → STARTTLS
    'username': '',           # 发件邮箱账号
    'password': '',           # SMTP 授权码（非登录密码）
    'sender_name': 'USOP安全运营平台',
    'sender_email': '',       # 发件人地址（默认同 username）
    'timeout': 20,
}


def get_smtp_config(mask_password: bool = True) -> dict:
    """读取 SMTP 配置；mask_password=True 时密码以 ****** 返回。"""
    cfg = dict(DEFAULT_CONFIG)
    row = SystemConfig.query.filter_by(key=CONFIG_KEY).first()
    if row and row.value:
        try:
            stored = json.loads(row.value)
            if isinstance(stored, dict):
                cfg.update(stored)
        except (ValueError, TypeError):
            pass
    if mask_password:
        if cfg.get('password'):
            cfg['password'] = MASK
        cfg['has_password'] = bool(
            row and row.value and json.loads(row.value).get('password')) if row and row.value else False
    else:
        cfg['has_password'] = bool(cfg.get('password'))
    return cfg


def save_smtp_config(data: dict) -> dict:
    """保存配置。password === '******' 表示保留原密码。"""
    current = get_smtp_config(mask_password=False)
    cfg = dict(current)
    cfg.update({
        'enabled': bool(data.get('enabled')),
        'host': (data.get('host') or '').strip(),
        'port': int(data.get('port') or 465),
        'use_ssl': bool(data.get('use_ssl', True)),
        'username': (data.get('username') or '').strip(),
        'sender_name': (data.get('sender_name') or '').strip() or 'USOP安全运营平台',
        'sender_email': (data.get('sender_email') or '').strip(),
        'timeout': min(int(data.get('timeout') or 20), 60),
    })
    pwd = data.get('password') or ''
    if pwd and pwd != MASK:
        cfg['password'] = pwd.strip()
    if not cfg['sender_email']:
        cfg['sender_email'] = cfg['username']
    row = SystemConfig.query.filter_by(key=CONFIG_KEY).first()
    if not row:
        row = SystemConfig(key=CONFIG_KEY, value='', category='email')
        db.session.add(row)
    row.value = json.dumps(cfg, ensure_ascii=False)
    row.category = 'email'
    db.session.commit()
    return get_smtp_config(mask_password=True)


def _build_message(sender: str, sender_name: str, to, subject: str,
                   body: str, html: bool, cc=None) -> MIMEMultipart:
    msg = MIMEMultipart('alternative')
    msg['From'] = formataddr((str(Header(sender_name, 'utf-8')), sender))
    msg['To'] = to if isinstance(to, str) else ', '.join(to)
    msg['Subject'] = Header(subject, 'utf-8')
    if cc:
        msg['Cc'] = cc if isinstance(cc, str) else ', '.join(cc)
    subtype = 'html' if html else 'plain'
    msg.attach(MIMEText(body, subtype, 'utf-8'))
    return msg


def send_email(to, subject: str, body: str, html: bool = False,
               cc=None, config: dict = None) -> dict:
    """真实发送邮件。

    to: 字符串或列表；subject/body 支持已由上游完成的表达式替换。
    返回 {'success': bool, 'message': str, 'message_id': str?, 'recipients': [...]}
    """
    cfg = config or get_smtp_config(mask_password=False)
    if not cfg.get('enabled'):
        return {'success': False, 'message': 'SMTP 邮件服务未启用（请到 全局配置→邮件服务 开启并保存配置）'}
    host = cfg.get('host') or ''
    username = cfg.get('username') or ''
    password = cfg.get('password') or ''
    sender = cfg.get('sender_email') or username
    if not host or not username or not password:
        return {'success': False, 'message': 'SMTP 配置不完整（缺少 服务器/账号/授权码）'}

    recipients = [to] if isinstance(to, str) else list(to or [])
    cc_list = [cc] if isinstance(cc, str) else list(cc or [])
    all_rcpt = recipients + cc_list
    if not all_rcpt:
        return {'success': False, 'message': '未指定收件人'}

    msg = _build_message(sender, cfg.get('sender_name') or 'USOP', to, subject, body, html, cc)

    timeout = min(int(cfg.get('timeout') or 20), 60)
    try:
        context = ssl.create_default_context()
        if cfg.get('use_ssl'):
            server = smtplib.SMTP_SSL(host, int(cfg.get('port') or 465), timeout=timeout, context=context)
        else:
            server = smtplib.SMTP(host, int(cfg.get('port') or 587), timeout=timeout)
            server.starttls(context=context)
        with server:
            server.login(username, password)
            server.sendmail(sender, all_rcpt, msg.as_string())
        return {
            'success': True,
            'message': f'邮件已发送至 {", ".join(recipients)}',
            'message_id': msg.get('Message-ID', ''),
            'recipients': recipients,
        }
    except smtplib.SMTPAuthenticationError as e:
        return {'success': False, 'message': f'SMTP 认证失败：{e.smtp_code} {e.smtp_error.decode("utf-8", "ignore") if isinstance(e.smtp_error, bytes) else e.smtp_error}（请确认使用授权码而非登录密码）'}
    except Exception as e:
        return {'success': False, 'message': f'SMTP 发送失败: {e}'}


def test_smtp_connection(config: dict) -> dict:
    """连接 + 登录测试（不发信）。password='******' 时用已存密码。"""
    cfg = get_smtp_config(mask_password=False)
    pwd = config.get('password') or ''
    if pwd and pwd != MASK:
        cfg['password'] = pwd.strip()
    if config.get('host'):
        cfg['host'] = config['host'].strip()
    if config.get('port'):
        cfg['port'] = int(config['port'])
    if config.get('username'):
        cfg['username'] = config['username'].strip()
    if not cfg.get('host') or not cfg.get('username') or not cfg.get('password'):
        return {'success': False, 'message': '配置不完整（需要 服务器/账号/授权码）'}
    timeout = min(int(cfg.get('timeout') or 20), 60)
    try:
        context = ssl.create_default_context()
        if cfg.get('use_ssl'):
            server = smtplib.SMTP_SSL(cfg['host'], int(cfg.get('port') or 465), timeout=timeout, context=context)
        else:
            server = smtplib.SMTP(cfg['host'], int(cfg.get('port') or 587), timeout=timeout)
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
        with server:
            server.login(cfg['username'], cfg['password'])
        return {'success': True, 'message': f'连接成功：{cfg["host"]}:{cfg.get("port")}，账号 {cfg["username"]} 认证通过'}
    except Exception as e:
        return {'success': False, 'message': f'连接失败: {e}'}
