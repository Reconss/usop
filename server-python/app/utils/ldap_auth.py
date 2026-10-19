"""
AD 域 LDAP 认证服务

配置持久化于 SystemConfig(key='ad_ldap_config')，JSON 结构：
{
    "enabled": bool,            # 是否启用 AD 认证
    "server_uri": "ldap://dc01.corp.com" | "ldaps://...",
    "port": 389 | 636,
    "use_ssl": bool,            # ldaps 时建议 true
    "bind_dn": "CN=svc,OU=Service,DC=corp,DC=com",   # 服务账号 DN（用于搜索用户；可空）
    "bind_password": "...",                            # 服务账号密码（可空）
    "base_dn": "DC=corp,DC=com",
    "user_filter": "(sAMAccountName={username})",      # 用户搜索过滤器
    "attr_map": {"upn": "userPrincipalName", "mail": "mail", "display": "displayName"}
}

认证策略（两段式，优先服务账号搜索，退化直连绑定）：
1. 配置了 bind_dn → 以服务账号 bind，按 user_filter 搜索用户 DN，再以用户 DN + 密码 bind 验证；
2. 未配置服务账号 → 直接以 ad_upn（或 username）作为 bind DN/UPN + 用户密码 bind 验证。

所有连接均为真实 LDAP 请求；连接失败/认证失败如实返回错误信息，不做任何模拟兜底。
"""
import json
import logging
from datetime import datetime

from app.database import db

logger = logging.getLogger(__name__)

LDAP_CONFIG_KEY = 'ad_ldap_config'

# AD 用户本地密码占位：不可通过本地口令校验（verify_password 对任意输入返回 False）
AD_PASSWORD_PLACEHOLDER = '!ad-ldap-auth-no-local-password'

DEFAULT_CONFIG = {
    'enabled': False,
    'server_uri': 'ldap://',
    'port': 389,
    'use_ssl': False,
    'bind_dn': '',
    'bind_password': '',
    'base_dn': '',
    'user_filter': '(sAMAccountName={username})',
    'attr_map': {'upn': 'userPrincipalName', 'mail': 'mail', 'display': 'displayName'},
}


def get_ldap_config(mask_password: bool = False) -> dict:
    """读取 AD 配置；mask_password=True 时打码服务账号密码"""
    from app.models import SystemConfig
    row = SystemConfig.query.filter_by(key=LDAP_CONFIG_KEY).first()
    cfg = dict(DEFAULT_CONFIG)
    if row and row.value:
        try:
            stored = json.loads(row.value)
            if isinstance(stored, dict):
                cfg.update(stored)
        except (ValueError, TypeError):
            logger.warning('AD LDAP 配置 JSON 解析失败，使用默认配置')
    if mask_password and cfg.get('bind_password'):
        cfg['bind_password'] = '******'
    return cfg


def save_ldap_config(cfg: dict) -> None:
    """保存 AD 配置（'******' 视为未修改，保留原密码）"""
    from app.models import SystemConfig
    row = SystemConfig.query.filter_by(key=LDAP_CONFIG_KEY).first()
    old = get_ldap_config()
    if cfg.get('bind_password') in (None, '', '******'):
        cfg['bind_password'] = old.get('bind_password', '')
    payload = json.dumps(cfg, ensure_ascii=False)
    if row:
        row.value = payload
        row.updated_at = datetime.utcnow()
    else:
        db.session.add(SystemConfig(key=LDAP_CONFIG_KEY, value=payload, category='auth'))
    db.session.commit()


def _build_server(cfg: dict):
    from ldap3 import Server, Tls
    import ssl
    use_ssl = bool(cfg.get('use_ssl'))
    tls = None
    if use_ssl:
        # 内网自签证书常见：不强制校验证书链（如需严格校验可扩展配置项）
        tls = Tls(validate=ssl.CERT_NONE)
    return Server(
        cfg.get('server_uri') or '',
        port=int(cfg.get('port') or (636 if use_ssl else 389)),
        use_ssl=use_ssl,
        tls=tls,
        connect_timeout=6,
        get_info=None,
    )


def test_ldap_connection(cfg: dict | None = None) -> tuple[bool, str, list]:
    """
    真实连接测试：bind 服务账号（或匿名）+ 按 base_dn 搜索，返回 (ok, message, sample_users)
    sample_users 最多 3 条，仅含 display/upn，用于确认搜索范围正确。
    """
    try:
        from ldap3 import Connection, SUBTREE
    except ImportError:
        return False, '服务器未安装 ldap3 依赖', []

    cfg = cfg or get_ldap_config()
    if not cfg.get('server_uri') or not cfg.get('base_dn'):
        return False, '请先填写 LDAP 服务器地址与 Base DN', []

    server = _build_server(cfg)
    bind_dn = cfg.get('bind_dn') or None
    bind_pw = cfg.get('bind_password') or None
    try:
        conn = Connection(server, user=bind_dn, password=bind_pw,
                          auto_bind=True, receive_timeout=8)
    except Exception as e:
        return False, f'连接/绑定失败：{e}', []

    sample = []
    try:
        ok = conn.search(cfg['base_dn'], '(objectClass=user)', search_scope=SUBTREE,
                         attributes=['cn'], size_limit=3)
        if ok:
            for entry in conn.entries[:3]:
                sample.append(str(entry.cn) if entry.cn else str(entry.entry_dn))
        conn.unbind()
        mode = '服务账号' if bind_dn else '匿名'
        return True, f'连接成功（{mode}绑定，Base DN 可搜索）', sample
    except Exception as e:
        try:
            conn.unbind()
        except Exception:
            pass
        return False, f'连接成功但搜索失败，请检查 Base DN：{e}', []


def ldap_authenticate(username: str, password: str) -> tuple[bool, str, dict | None]:
    """
    真实 AD 认证。返回 (ok, message, user_info)
    user_info 包含从目录读取的 mail/displayName/upn（可能为空 dict）。
    """
    cfg = get_ldap_config()
    if not cfg.get('enabled'):
        return False, 'AD 域认证未启用', None
    if not cfg.get('server_uri') or not cfg.get('base_dn'):
        return False, 'AD 域认证未配置完整（缺少服务器地址或 Base DN）', None

    try:
        from ldap3 import Connection, SUBTREE
    except ImportError:
        return False, '服务器未安装 ldap3 依赖', None

    server = _build_server(cfg)
    search_dn = cfg.get('bind_dn') or None
    search_pw = cfg.get('bind_password') or None
    user_filter = (cfg.get('user_filter') or DEFAULT_CONFIG['user_filter']).replace('{username}', username.replace(')', ''))

    try:
        if search_dn:
            # 两段式：服务账号搜索用户 DN → 用户 DN bind
            svc = Connection(server, user=search_dn, password=search_pw,
                             auto_bind=True, receive_timeout=8)
            try:
                if not svc.search(cfg['base_dn'], user_filter, search_scope=SUBTREE,
                                  attributes=['cn'], size_limit=2):
                    svc.unbind()
                    return False, f'AD 目录中未找到用户 {username}', None
                entry = svc.entries[0]
                user_dn = entry.entry_dn
                info = {
                    'display': str(entry.cn) if entry.cn else '',
                    'dn': user_dn,
                }
            finally:
                try:
                    svc.unbind()
                except Exception:
                    pass
            bind_target = user_dn
        else:
            # 直连绑定：以 username（UPN 或域\账号或裸名）作为 bind 身份
            bind_target = username
            info = {'display': username, 'dn': username}

        user_conn = Connection(server, user=bind_target, password=password,
                               auto_bind=True, receive_timeout=8)
        try:
            # 读取属性（可能受目录权限限制，失败不影响认证结果）
            if search_dn:
                attrs = cfg.get('attr_map') or DEFAULT_CONFIG['attr_map']
                try:
                    user_conn.search(user_dn, '(objectClass=*)', search_scope='BASE',
                                     attributes=list(attrs.values()))
                    if user_conn.entries:
                        e = user_conn.entries[0]
                        info['upn'] = str(e[attrs['upn']]) if attrs.get('upn') in e else ''
                        info['mail'] = str(e[attrs['mail']]) if attrs.get('mail') in e else ''
                except Exception:
                    pass
            info.setdefault('upn', username)
            info.setdefault('mail', '')
            return True, '认证成功', info
        finally:
            try:
                user_conn.unbind()
            except Exception:
                pass
    except Exception as e:
        msg = str(e)
        if 'invalidCredentials' in msg or '49' in msg.split(',')[0:1]:
            return False, 'AD 认证失败：用户名或密码错误', None
        return False, f'AD 域连接失败：{msg}', None
