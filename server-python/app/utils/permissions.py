"""角色权限体系

设计要点：
- 权限点目录 PERMISSION_CATALOG 与前端 RoleManagement.tsx 的 allPermissions 严格对齐
- 4 个系统内置角色（id 与 users.role 字符串对齐）：admin / operator / analyst / auditor
- roles 表为权限真相源；表为空或角色缺失时回退 SYSTEM_ROLES 内置分配（避免全站拒绝）
- admin 角色恒为超集（全部权限）
- 集中式写操作拦截：register_write_guard(app) 注册 before_request，
  按 URL 前缀 + 方法解析所需权限点，读操作（GET）不拦截
"""
from flask import request, jsonify
from functools import wraps

from app.database import db
from app.models.extensions import Role

# ────────────────────────── 权限点目录 ──────────────────────────
# (id, 名称, 说明, 模块)
PERMISSION_CATALOG = [
    # dashboard
    ('dashboard.view', '查看仪表盘', '查看安全态势概览', 'dashboard'),
    # detection
    ('events.view', '查看事件', '查看安全事件列表和详情', 'detection'),
    ('events.create', '创建事件', '手动创建安全事件', 'detection'),
    ('events.edit', '编辑事件', '修改事件信息、状态与处置记录', 'detection'),
    ('events.delete', '删除事件', '删除安全事件', 'detection'),
    ('alerts.view', '查看告警', '查看安全告警', 'detection'),
    ('alerts.manage', '管理告警', '确认、关闭、标记误报、批量处置', 'detection'),
    ('hunting.view', '威胁狩猎', '执行威胁狩猎查询', 'detection'),
    ('ai.view', 'AI 中心', '使用 AI 分析与研判功能', 'detection'),
    # vulnerabilities
    ('vulns.view', '查看漏洞', '查看主机/应用漏洞', 'vulnerabilities'),
    ('vulns.manage', '管理漏洞', '录入、处置、重评、删除漏洞及附件', 'vulnerabilities'),
    # response
    ('playbooks.view', '查看剧本', '查看剧本编排与执行记录', 'response'),
    ('playbooks.manage', '管理剧本', '创建、编辑、删除剧本', 'response'),
    ('playbooks.execute', '执行剧本', '手动触发剧本执行与审批决策', 'response'),
    ('rules.view', '查看规则', '查看检测与关联规则', 'response'),
    ('rules.manage', '管理规则', '创建、编辑、删除、启停规则', 'response'),
    # assets
    ('assets.view', '查看资产', '查看资产清单与攻击面', 'assets'),
    ('assets.manage', '管理资产', '添加、编辑、删除资产', 'assets'),
    ('scans.view', '查看扫描', '查看扫描任务', 'assets'),
    ('scans.manage', '管理扫描', '创建、启动、停止扫描任务并同步结果', 'assets'),
    # data
    ('data.view', '查看数据配置', '查看数据源、解析与存储配置', 'data'),
    ('data.manage', '管理数据配置', '配置数据源、管道、存储与解析', 'data'),
    # system
    ('users.view', '查看用户', '查看用户列表', 'system'),
    ('users.manage', '管理用户', '创建、编辑、删除用户', 'system'),
    ('roles.view', '查看角色', '查看角色与权限分配', 'system'),
    ('roles.manage', '管理角色', '创建、编辑角色权限分配', 'system'),
    ('audit.view', '查看审计', '查看审计日志', 'system'),
    ('config.view', '查看配置', '查看系统配置', 'system'),
    ('config.manage', '管理配置', '修改系统配置与备份还原', 'system'),
]

PERMISSION_IDS = [p[0] for p in PERMISSION_CATALOG]

# 系统角色默认分配版本：调整 SYSTEM_ROLES 默认值时 bump，启动会自动推送新分配
RBAC_SEED_VERSION = '2026-10-19.1'

# ────────────────────────── 系统内置角色 ──────────────────────────
# id 与 users.role 字符串严格对齐（admin/operator/analyst/auditor）
SYSTEM_ROLES = {
    'admin': {
        'name': '系统管理员',
        'description': '拥有平台全部功能的最高权限，负责用户、角色与系统配置管理。',
        'permissions': list(PERMISSION_IDS),
        'approval_level': 3,
        'can_approve': ['playbook', 'event_action', 'ip_block'],
        'max_auto_approve': 0,
    },
    'operator': {
        'name': '安全运营',
        'description': '一线安全运营与应急响应：告警/事件处置、漏洞修复跟踪、资产与扫描管理、剧本执行。',
        'permissions': [
            'dashboard.view',
            'events.view', 'events.create', 'events.edit',
            'alerts.view', 'alerts.manage',
            'hunting.view', 'ai.view',
            'vulns.view', 'vulns.manage',
            'assets.view', 'assets.manage',
            'scans.view', 'scans.manage',
            'playbooks.view', 'playbooks.execute',
            'rules.view', 'rules.manage',
            'data.view', 'data.manage',
            'users.view', 'roles.view', 'audit.view', 'config.view',
        ],
        'approval_level': 2,
        'can_approve': ['playbook', 'event_action', 'ip_block'],
        'max_auto_approve': 0,
    },
    'analyst': {
        'name': '安全分析师',
        'description': '分析研判为主：告警分诊、事件分析与跟进、威胁狩猎与 AI 研判；不可删除数据、不可管理配置。',
        'permissions': [
            'dashboard.view',
            'events.view', 'events.create', 'events.edit',
            'alerts.view', 'alerts.manage',
            'hunting.view', 'ai.view',
            'vulns.view',
            'assets.view', 'scans.view',
            'playbooks.view',
            'rules.view',
        ],
        'approval_level': 1,
        'can_approve': [],
        'max_auto_approve': 0,
    },
    'auditor': {
        'name': '审计员',
        'description': '合规审计只读角色：全平台只读访问 + 审计日志，无任何写操作。',
        'permissions': [
            'dashboard.view',
            'events.view', 'alerts.view',
            'hunting.view', 'ai.view',
            'vulns.view',
            'assets.view', 'scans.view',
            'playbooks.view', 'rules.view',
            'data.view',
            'users.view', 'roles.view', 'audit.view', 'config.view',
        ],
        'approval_level': 1,
        'can_approve': [],
        'max_auto_approve': 0,
    },
}


def seed_system_roles(force: bool = False) -> dict:
    """幂等种子系统角色。

    force=False：仅创建缺失的角色（不覆盖已有配置）。
    force=True ：将 4 个系统角色的权限/描述重置为内置默认（恢复默认语义）。
    """
    created, updated = [], []
    for role_id, spec in SYSTEM_ROLES.items():
        role = Role.query.get(role_id)
        if role is None:
            role = Role(
                id=role_id,
                name=spec['name'],
                description=spec['description'],
                permissions=list(spec['permissions']),
                approval_level=spec['approval_level'],
                can_approve=list(spec['can_approve']),
                max_auto_approve=spec['max_auto_approve'],
                is_system=True,
            )
            db.session.add(role)
            created.append(role_id)
        elif force:
            role.name = spec['name']
            role.description = spec['description']
            role.permissions = list(spec['permissions'])
            role.approval_level = spec['approval_level']
            role.can_approve = list(spec['can_approve'])
            role.max_auto_approve = spec['max_auto_approve']
            role.is_system = True
            updated.append(role_id)
    if created or updated:
        db.session.commit()
    return {'created': created, 'updated': updated}


def _role_row(role_key: str):
    if not role_key:
        return None
    return Role.query.get(role_key)


def has_permission(role_key: str, perm: str) -> bool:
    """判断角色是否拥有权限点。DB roles 表优先，缺失时回退内置分配；admin 恒全量。"""
    if role_key == 'admin':
        return True
    role = _role_row(role_key)
    if role is not None and role.permissions:
        return perm in (role.permissions or [])
    builtin = SYSTEM_ROLES.get(role_key)
    if builtin is not None:
        return perm in builtin['permissions']
    return False


def permissions_for_role(role_key: str) -> list:
    """返回角色的权限点列表（供 /me 与前端菜单过滤）。"""
    if role_key == 'admin':
        return list(PERMISSION_IDS)
    role = _role_row(role_key)
    if role is not None and role.permissions:
        return list(role.permissions)
    builtin = SYSTEM_ROLES.get(role_key)
    return list(builtin['permissions']) if builtin else []


# ────────────────────────── 集中式写操作拦截 ──────────────────────────
# (URL 前缀, 该前缀下写操作默认所需权限)。按前缀长度优先匹配。
WRITE_PERM_BY_PREFIX = [
    ('/api/event-actions-api', 'events.edit'),
    ('/api/alerts-api', 'alerts.manage'),
    ('/api/vulnerabilities-api', 'vulns.manage'),
    ('/api/assets-api', 'assets.manage'),
    ('/api/scans-api', 'scans.manage'),
    ('/api/rules-api', 'rules.manage'),
    ('/api/playbooks-api', 'playbooks.manage'),
    ('/api/integrations', 'playbooks.manage'),
    ('/api/users-api', 'users.manage'),
    ('/api/roles-api', 'roles.manage'),
    ('/api/datasources-api', 'data.manage'),
    ('/api/pipeline', 'data.manage'),
    ('/api/storage-tables', 'data.manage'),
    ('/api/templates', 'data.manage'),
    ('/api/resources', 'data.manage'),
    ('/api/alert-fields', 'data.manage'),
    ('/api/config', 'config.manage'),
    ('/api/notifications', 'config.manage'),
    ('/api/backup', 'config.manage'),
    ('/api/ai-api', 'ai.view'),
    ('/api/ai-center', 'ai.view'),
    ('/api/ai-judgment', 'ai.view'),
    ('/api/hunting-api', 'hunting.view'),
]

# (URL 前缀, HTTP 方法, tail 匹配规则, 权限点)：比默认映射更具体的覆盖。
# tail 匹配规则为「去掉 URL 前缀后的路径」：^ 开头=精确相等，~ 开头=后缀匹配，否则=前缀匹配。
WRITE_PERM_OVERRIDES = [
    # 事件：创建/删除/处置细分
    ('/api/event-actions-api', 'POST', '^/events', 'events.create'),
    ('/api/event-actions-api', 'DELETE', '^/events', 'events.delete'),
    ('/api/event-actions-api', 'DELETE', '/events', 'events.delete'),
    ('/api/event-actions-api', 'POST', '/events/', 'events.edit'),   # ai-analyze / actions / execute 均属处置
    ('/api/event-actions-api', 'POST', '/approvals', 'events.edit'),
    # 剧本：触发/审批决策/单剧本执行/解封 → playbooks.execute
    ('/api/playbooks-api', 'POST', '/playbooks/trigger', 'playbooks.execute'),
    ('/api/playbooks-api', 'POST', '/playbooks/approvals', 'playbooks.execute'),
    ('/api/playbooks-api', 'POST', '/playbooks/blocked-ips', 'playbooks.execute'),
    ('/api/playbooks-api', 'POST', '~/execute', 'playbooks.execute'),
    ('/api/playbooks-api', 'POST', '~/retry', 'playbooks.execute'),
    # 扫描代理配置
    ('/api/scans-api', 'POST', '/tasks/proxy', 'scans.manage'),
]

# 纯查询语义的 POST 端点豁免（不带副作用，不要求写权限）
WRITE_EXEMPT_PATHS = [
    ('/api/alerts-api', '/alerts/search'),
    ('/api/alerts-api', '/alerts/aggregate'),
]

_WRITE_METHODS = {'POST', 'PUT', 'DELETE', 'PATCH'}


def _tail_matches(tail: str, rule: str) -> bool:
    if rule.startswith('^'):
        return tail == rule[1:]
    if rule.startswith('~'):
        return tail.endswith(rule[1:])
    return tail.startswith(rule)


def _resolve_write_permission(full_path: str, method: str):
    """解析请求所需的写权限点；返回 None 表示不拦截。"""
    if method not in _WRITE_METHODS:
        return None
    # 豁免（查询语义的 POST）
    for prefix, path in WRITE_EXEMPT_PATHS:
        if full_path.startswith(prefix) and _tail_matches(full_path[len(prefix):], path):
            return None
    # 覆盖规则优先（更具体的路径规则）
    for prefix, m, rule, perm in WRITE_PERM_OVERRIDES:
        if full_path.startswith(prefix) and method == m and _tail_matches(full_path[len(prefix):], rule):
            return perm
    for prefix, perm in WRITE_PERM_BY_PREFIX:
        if full_path.startswith(prefix + '/') or full_path == prefix:
            return perm
    return None


def register_write_guard(app):
    """注册 before_request 集中式写权限拦截。须在登录态可用后执行（自行解析 JWT）。"""
    from app.routes.auth import decode_token

    @app.before_request
    def _guard_write_permissions():
        if request.method not in _WRITE_METHODS:
            return None
        # CORS 预检放行
        if request.method == 'OPTIONS':
            return None
        full_path = request.path
        # 权限管理与种子接口仅校验登录（roles.manage 语义在 roles_api 内自查，避免循环依赖）
        perm = _resolve_write_permission(full_path, request.method)
        if perm is None:
            return None

        auth_header = request.headers.get('Authorization', '')
        token = auth_header.replace('Bearer ', '') if auth_header else ''
        payload = decode_token(token) if token else None
        if not payload:
            return None  # 未登录场景交给 login_required 返回 401
        role_key = _resolve_role_from_payload(payload)
        if not has_permission(role_key, perm):
            resp = jsonify({
                'success': False,
                'error': f'权限不足：当前角色「{role_key}」缺少 {perm} 权限',
                'code': 'PERMISSION_DENIED',
                'required_permission': perm,
            })
            resp.status_code = 403
            return resp
        return None


def _resolve_role_from_payload(payload) -> str:
    """从 JWT payload 解析真实角色：payload.role → DB users.role（真相源）→ analyst 兜底。

    登录签发的 JWT 仅含 user_id/username，必须回表查 users.role；
    仅携带 role 的历史/测试 token 可直接使用。
    """
    if not payload:
        return 'analyst'
    role_key = payload.get('role')
    if role_key:
        return role_key
    from app.models import User
    user = User.query.get(payload.get('user_id'))
    return user.role if user else 'analyst'


def permission_required(perm: str):
    """装饰器形态的权限校验（用于需要显式声明的端点）。须套在 login_required 之内。"""
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            cu = getattr(request, 'current_user', None) or {}
            role_key = _resolve_role_from_payload(cu)
            if not has_permission(role_key, perm):
                resp = jsonify({
                    'success': False,
                    'error': f'权限不足：需要 {perm} 权限',
                    'code': 'PERMISSION_DENIED',
                })
                resp.status_code = 403
                return resp
            return f(*args, **kwargs)
        return wrapper
    return decorator
