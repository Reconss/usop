"""
扩展数据模型 - 补充前端功能所需的模型
"""
import json
from datetime import datetime
from app.database import db


def as_json_list(value):
    """把 JSON 列的值规范成 list。

    历史上种子脚本用 `json.dumps([1, 2])` 往 db.JSON 列里写，落库成了
    JSON **字符串** `"[1, 2]"`（双重编码）。前端拿到字符串后调 `.filter()`
    会抛 TypeError，把整个页面打成白屏。这里统一兜底：字符串先尝试解析，
    解析不出来再按单元素处理。
    """
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return list(value)
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return []
        try:
            parsed = json.loads(s)
        except (ValueError, TypeError):
            return [s]
        if isinstance(parsed, (list, tuple)):
            return list(parsed)
        return [] if parsed is None else [parsed]
    return [value]


def as_json_dict(value):
    """把 JSON 列的值规范成 dict（同样兼容双重编码的历史数据）。"""
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return {}
        try:
            parsed = json.loads(s)
        except (ValueError, TypeError):
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


class Vulnerability(db.Model):
    """漏洞定义表（漏洞知识库级别，一个漏洞可命中多个资产）"""
    __tablename__ = 'vulnerabilities'

    id = db.Column(db.String(64), primary_key=True)
    name = db.Column(db.String(300), nullable=False)
    cve_id = db.Column(db.String(50))
    cnvd_id = db.Column(db.String(50))       # 国家信息安全漏洞共享平台编号
    cnnvd_id = db.Column(db.String(50))      # 国家信息安全漏洞库编号
    cwe_id = db.Column(db.String(20))        # 弱点分类，如 CWE-89
    cvss_score = db.Column(db.Float, default=0.0)   # 主评分（v3 优先）
    cvss3_score = db.Column(db.Float)
    cvss2_score = db.Column(db.Float)
    cvss_vector = db.Column(db.String(120))  # CVSS 向量串，如 AV:N/AC:L/...
    severity = db.Column(db.String(20), default='medium')  # critical, high, medium, low
    vuln_type = db.Column(db.String(20), default='host')   # host / application / both
    vuln_class = db.Column(db.String(50))    # 漏洞类别：注入/跨站脚本/越权/弱口令/组件漏洞...
    description = db.Column(db.Text)
    solution = db.Column(db.Text)
    category = db.Column(db.String(50))      # 来源分类（nessus_host 等，历史保留）
    affected_product = db.Column(db.String(300))
    ref_links = db.Column(db.Text)           # 参考链接，换行分隔
    poc_public = db.Column(db.Boolean, default=False)      # POC/EXP 是否公开
    disclosure_date = db.Column(db.DateTime)
    source = db.Column(db.String(50), default='manual')    # manual / nessus / scanner / import
    published_at = db.Column(db.DateTime)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'cve_id': self.cve_id,
            'cnvd_id': self.cnvd_id,
            'cnnvd_id': self.cnnvd_id,
            'cwe_id': self.cwe_id,
            'cvss_score': self.cvss_score,
            'cvss3_score': self.cvss3_score,
            'cvss2_score': self.cvss2_score,
            'cvss_vector': self.cvss_vector,
            'severity': self.severity,
            'vuln_type': self.vuln_type,
            'vuln_class': self.vuln_class,
            'description': self.description,
            'solution': self.solution,
            'category': self.category,
            'affected_product': self.affected_product,
            'ref_links': self.ref_links,
            'poc_public': bool(self.poc_public),
            'disclosure_date': self.disclosure_date.isoformat() if self.disclosure_date else None,
            'source': self.source,
            'published_at': self.published_at.isoformat() if self.published_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


# 资产漏洞处置状态机
VULN_STATUS_FLOW = {
    # 当前状态 -> 允许流转到的状态集合
    'open': {'in_progress', 'fixed', 'ignored', 'risk_accepted'},
    'in_progress': {'fixed', 'open', 'ignored', 'risk_accepted'},
    'fixed': {'closed', 'in_progress'},   # 复测通过关闭；复测不通过退回修复中
    'closed': {'open'},                   # 复测复发可重开
    'ignored': {'open'},                  # 忽略可恢复
    'risk_accepted': {'open'},            # 风险接受可恢复
}


class AssetVulnerability(db.Model):
    """资产漏洞实例表（一次发现/一条处置跟踪记录）"""
    __tablename__ = 'asset_vulnerabilities'

    id = db.Column(db.Integer, primary_key=True)
    vuln_code = db.Column(db.String(64), unique=True)  # 对外展示编号 VH-YYYYMMDD-xxxx / VA-...
    asset_id = db.Column(db.Integer, db.ForeignKey('assets.id'), nullable=False)
    vuln_id = db.Column(db.String(64), db.ForeignKey('vulnerabilities.id'), nullable=False)
    vuln_type = db.Column(db.String(20), default='host')   # host / application
    vuln_class = db.Column(db.String(50))    # 漏洞类别：注入/弱口令/组件漏洞...
    status = db.Column(db.String(20), default='open')
    # open 未处理 / in_progress 修复中 / fixed 待复测(已修复) / closed 已关闭复测通过 / ignored 已忽略 / risk_accepted 风险接受

    # 原始（扫描器/录入）评级
    severity = db.Column(db.String(20), default='medium')
    cvss_score = db.Column(db.Float, default=0.0)
    cvss3_score = db.Column(db.Float)
    cvss2_score = db.Column(db.Float)

    # 重新评级（业务上下文双轨制）
    assessed_score = db.Column(db.Float)
    assessed_severity = db.Column(db.String(20))
    assess_factors = db.Column(db.JSON)      # 重评因子快照 {asset_importance, exploitability, ...}
    assess_reason = db.Column(db.Text)       # 重评理由
    assess_history = db.Column(db.JSON)      # 重评历史 [{at, by, old, new, reason}]

    # 位置与插件信息
    plugin_id = db.Column(db.String(50))
    plugin_name = db.Column(db.String(300))
    plugin_family = db.Column(db.String(100))
    hostname = db.Column(db.String(200))
    ip_address = db.Column(db.String(64))
    port = db.Column(db.Integer)
    protocol = db.Column(db.String(20))
    url_path = db.Column(db.String(500))     # 应用漏洞位置
    component_version = db.Column(db.String(200))  # 受影响组件版本
    evidence = db.Column(db.Text)

    # 处置跟踪
    assignee = db.Column(db.String(100))
    assigned_at = db.Column(db.DateTime)
    repair_plan = db.Column(db.Text)         # 处置/修复方案
    deadline = db.Column(db.DateTime)        # 计划完成时间
    notes = db.Column(db.Text)
    verified_by = db.Column(db.String(100))  # 复测人
    verified_at = db.Column(db.DateTime)
    verify_result = db.Column(db.String(20))  # pass / fail
    close_reason = db.Column(db.Text)
    source = db.Column(db.String(50), default='manual')   # manual / nessus / scanner
    discovered_at = db.Column(db.DateTime, default=datetime.utcnow)
    fixed_at = db.Column(db.DateTime)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    timeline = db.Column(db.JSON)            # 处置时间线 [{at, action, by, detail}]

    asset = db.relationship('Asset', backref='asset_vulnerabilities')
    vulnerability = db.relationship('Vulnerability', backref='asset_vulnerabilities')

    def to_dict(self):
        return {
            'id': self.id,
            'vuln_code': self.vuln_code,
            'asset_id': self.asset_id,
            'asset_name': self.asset.name if self.asset else None,
            'vuln_id': self.vuln_id,
            'vuln': self.vulnerability.to_dict() if self.vulnerability else None,
            'vuln_name': self.vulnerability.name if self.vulnerability else self.plugin_name,
            'cve_id': self.vulnerability.cve_id if self.vulnerability else None,
            'vuln_type': self.vuln_type,
            'vuln_class': self.vuln_class,
            'status': self.status,
            'severity': self.severity,
            'cvss_score': self.cvss_score,
            'cvss3_score': self.cvss3_score,
            'cvss2_score': self.cvss2_score,
            'assessed_score': self.assessed_score,
            'assessed_severity': self.assessed_severity,
            'assess_factors': as_json_dict(self.assess_factors),
            'assess_reason': self.assess_reason,
            'assess_history': as_json_list(self.assess_history),
            'plugin_id': self.plugin_id,
            'plugin_name': self.plugin_name,
            'plugin_family': self.plugin_family,
            'hostname': self.hostname,
            'ip_address': self.ip_address,
            'port': self.port,
            'protocol': self.protocol,
            'url_path': self.url_path,
            'component_version': self.component_version,
            'evidence': self.evidence,
            'assignee': self.assignee,
            'assigned_at': self.assigned_at.isoformat() if self.assigned_at else None,
            'repair_plan': self.repair_plan,
            'deadline': self.deadline.isoformat() if self.deadline else None,
            'notes': self.notes,
            'verified_by': self.verified_by,
            'verified_at': self.verified_at.isoformat() if self.verified_at else None,
            'verify_result': self.verify_result,
            'close_reason': self.close_reason,
            'source': self.source,
            'discovered_at': self.discovered_at.isoformat() if self.discovered_at else None,
            'fixed_at': self.fixed_at.isoformat() if self.fixed_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'timeline': as_json_list(self.timeline),
        }

    def append_timeline(self, action: str, by: str, detail: str = ''):
        entry = {
            'at': datetime.utcnow().isoformat(),
            'action': action,
            'by': by or 'system',
        }
        if detail:
            entry['detail'] = detail
        tl = as_json_list(self.timeline)
        tl.append(entry)
        self.timeline = tl  # 新对象赋值，确保 JSON 列标脏


class VulnerabilityAttachment(db.Model):
    """漏洞附件（截图 / 报告等），挂在资产漏洞实例上"""
    __tablename__ = 'vulnerability_attachments'

    id = db.Column(db.Integer, primary_key=True)
    av_id = db.Column(db.Integer, db.ForeignKey('asset_vulnerabilities.id'), nullable=False, index=True)
    filename = db.Column(db.String(200), nullable=False)   # 落盘文件名（uuid 前缀防冲突）
    orig_name = db.Column(db.String(300), nullable=False)  # 原始文件名
    kind = db.Column(db.String(20), default='report')      # screenshot / report
    mime = db.Column(db.String(100))
    size = db.Column(db.Integer, default=0)                # 字节
    uploaded_by = db.Column(db.String(100))
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)

    asset_vulnerability = db.relationship(
        'AssetVulnerability', backref='attachments')

    def to_dict(self):
        return {
            'id': self.id,
            'av_id': self.av_id,
            'filename': self.filename,
            'orig_name': self.orig_name,
            'kind': self.kind,
            'mime': self.mime,
            'size': self.size,
            'uploaded_by': self.uploaded_by,
            'uploaded_at': self.uploaded_at.isoformat() if self.uploaded_at else None,
            'is_image': (self.mime or '').startswith('image/'),
        }


class ScanProfile(db.Model):
    """扫描配置模板"""
    __tablename__ = 'scan_profiles'

    id = db.Column(db.String(50), primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    type = db.Column(db.String(50), nullable=False)  # port, vuln, web, service
    description = db.Column(db.Text)
    config = db.Column(db.JSON, default=dict)
    is_default = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'type': self.type,
            'description': self.description,
            'config': self.config or {},
            'is_default': self.is_default,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class ScanAgent(db.Model):
    """扫描代理节点"""
    __tablename__ = 'scan_agents'

    id = db.Column(db.String(50), primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    ip = db.Column(db.String(50))
    status = db.Column(db.String(20), default='offline')  # online, offline, busy
    cpu_usage = db.Column(db.Float, default=0)
    memory_usage = db.Column(db.Float, default=0)
    current_task = db.Column(db.String(100))
    location = db.Column(db.String(100))
    capabilities = db.Column(db.JSON, default=list)
    last_heartbeat = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'ip': self.ip,
            'status': self.status,
            'cpu_usage': self.cpu_usage,
            'memory_usage': self.memory_usage,
            'current_task': self.current_task,
            'location': self.location,
            'capabilities': self.capabilities or [],
            'last_heartbeat': self.last_heartbeat.isoformat() if self.last_heartbeat else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class HuntingResult(db.Model):
    """威胁狩猎结果"""
    __tablename__ = 'hunting_results'

    id = db.Column(db.String(50), primary_key=True)
    query_id = db.Column(db.Integer, db.ForeignKey('hunting_queries.id'))
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    severity = db.Column(db.String(20), default='medium')
    indicators = db.Column(db.JSON, default=list)
    affected_assets = db.Column(db.JSON, default=list)
    raw_data = db.Column(db.JSON, default=dict)
    status = db.Column(db.String(20), default='new')  # new, investigating, resolved, false_positive
    assignee = db.Column(db.String(100))
    resolved_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    query = db.relationship('HuntingQuery', backref='results')

    def to_dict(self):
        return {
            'id': self.id,
            'query_id': self.query_id,
            'query_name': self.query.name if self.query else None,
            'title': self.title,
            'description': self.description,
            'severity': self.severity,
            'indicators': self.indicators or [],
            'affected_assets': self.affected_assets or [],
            'raw_data': self.raw_data or {},
            'status': self.status,
            'assignee': self.assignee,
            'resolved_at': self.resolved_at.isoformat() if self.resolved_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class AIInsight(db.Model):
    """AI 安全洞察"""
    __tablename__ = 'ai_insights'

    id = db.Column(db.String(50), primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    severity = db.Column(db.String(20), default='medium')
    category = db.Column(db.String(50))
    confidence = db.Column(db.Float, default=0.0)
    related_events = db.Column(db.JSON, default=list)
    related_alerts = db.Column(db.JSON, default=list)
    recommendations = db.Column(db.Text)
    status = db.Column(db.String(20), default='new')  # new, acknowledged, resolved
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    acknowledged_at = db.Column(db.DateTime)
    resolved_at = db.Column(db.DateTime)

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'severity': self.severity,
            'category': self.category,
            'confidence': self.confidence,
            'related_events': self.related_events or [],
            'related_alerts': self.related_alerts or [],
            'recommendations': self.recommendations,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'acknowledged_at': self.acknowledged_at.isoformat() if self.acknowledged_at else None,
            'resolved_at': self.resolved_at.isoformat() if self.resolved_at else None
        }


class AIChatSession(db.Model):
    """AI 对话会话"""
    __tablename__ = 'ai_chat_sessions'

    id = db.Column(db.String(50), primary_key=True)
    title = db.Column(db.String(200))
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    model_id = db.Column(db.Integer, db.ForeignKey('ai_models.id'))
    messages = db.Column(db.JSON, default=list)
    context = db.Column(db.JSON, default=dict)
    status = db.Column(db.String(20), default='active')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship('User', backref='chat_sessions')
    model = db.relationship('AIModel', backref='chat_sessions')

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'user_id': self.user_id,
            'username': self.user.username if self.user else None,
            'model_id': self.model_id,
            'model_name': self.model.name if self.model else None,
            'messages': self.messages or [],
            'context': self.context or {},
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class AIChatMessage(db.Model):
    """AI 对话消息"""
    __tablename__ = 'ai_chat_messages'

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.String(50), db.ForeignKey('ai_chat_sessions.id'))
    role = db.Column(db.String(20), nullable=False)  # user, assistant, system
    content = db.Column(db.Text)
    model = db.Column(db.String(100))
    tokens_used = db.Column(db.Integer, default=0)
    attachments = db.Column(db.JSON, default=list)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    session = db.relationship('AIChatSession', backref='chat_messages')

    def to_dict(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'role': self.role,
            'content': self.content,
            'model': self.model,
            'tokens_used': self.tokens_used,
            'attachments': self.attachments or [],
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class AIAgent(db.Model):
    """AI Agent 配置"""
    __tablename__ = 'ai_agents'

    id = db.Column(db.String(50), primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    agent_type = db.Column(db.String(50))  # threat_analysis, log_parser, investigator, compliance
    icon = db.Column(db.String(50))
    status = db.Column(db.String(20), default='idle')  # active, idle, busy, disabled
    capabilities = db.Column(db.JSON, default=list)
    system_prompt = db.Column(db.Text)
    model_id = db.Column(db.Integer, db.ForeignKey('ai_models.id'))
    config = db.Column(db.JSON, default=dict)
    last_active = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    model = db.relationship('AIModel', backref='agents')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'agent_type': self.agent_type,
            'icon': self.icon,
            'status': self.status,
            'capabilities': self.capabilities or [],
            'system_prompt': self.system_prompt,
            'model_id': self.model_id,
            'model_name': self.model.name if self.model else None,
            'config': self.config or {},
            'last_active': self.last_active.isoformat() if self.last_active else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class Role(db.Model):
    """角色表"""
    __tablename__ = 'roles'

    id = db.Column(db.String(50), primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    permissions = db.Column(db.JSON, default=list)
    approval_level = db.Column(db.Integer, default=1)  # 1=普通, 2=主管, 3=高级管理
    can_approve = db.Column(db.JSON, default=list)  # 可审批的操作类型列表
    max_auto_approve = db.Column(db.Integer, default=0)
    is_system = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'permissions': self.permissions or [],
            'approval_level': self.approval_level,
            'can_approve': self.can_approve or [],
            'max_auto_approve': self.max_auto_approve,
            'is_system': self.is_system,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class AssetPort(db.Model):
    """资产端口信息"""
    __tablename__ = 'asset_ports'

    id = db.Column(db.Integer, primary_key=True)
    asset_id = db.Column(db.Integer, db.ForeignKey('assets.id'), nullable=False)
    port = db.Column(db.Integer, nullable=False)
    protocol = db.Column(db.String(10), default='tcp')
    service = db.Column(db.String(100))
    version = db.Column(db.String(100))
    state = db.Column(db.String(20), default='open')  # open, closed, filtered
    banner = db.Column(db.Text)
    discovered_at = db.Column(db.DateTime, default=datetime.utcnow)

    asset = db.relationship('Asset', backref='ports')

    def to_dict(self):
        return {
            'id': self.id,
            'asset_id': self.asset_id,
            'port': self.port,
            'protocol': self.protocol,
            'service': self.service,
            'version': self.version,
            'state': self.state,
            'banner': self.banner,
            'discovered_at': self.discovered_at.isoformat() if self.discovered_at else None
        }


class ScanResult(db.Model):
    """扫描结果详情"""
    __tablename__ = 'scan_results'

    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('scan_tasks.id'))
    target = db.Column(db.String(200))
    result_type = db.Column(db.String(50))  # port, service, vulnerability, info
    result_data = db.Column(db.JSON, default=dict)
    severity = db.Column(db.String(20))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    task = db.relationship('ScanTask', backref=db.backref('scan_result_items', lazy='dynamic'))

    def to_dict(self):
        return {
            'id': self.id,
            'task_id': self.task_id,
            'target': self.target,
            'result_type': self.result_type,
            'result_data': self.result_data or {},
            'severity': self.severity,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class DetectionRuleExtended(db.Model):
    """扩展的检测规则"""
    __tablename__ = 'detection_rules'

    id = db.Column(db.String(50), primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    type = db.Column(db.String(50), default='single')  # single, correlation, sequence
    description = db.Column(db.Text)
    rule_content = db.Column(db.Text)  # 规则内容 (SQL, Sigma, YARA等)
    rule_language = db.Column(db.String(20), default='sigma')  # sigma, yara, sql, elasticql
    severity = db.Column(db.String(20), default='medium')
    status = db.Column(db.String(20), default='disabled')  # enabled, disabled, testing
    data_source_ids = db.Column(db.JSON, default=list)
    playbook_id = db.Column(db.String(50))
    hit_count = db.Column(db.Integer, default=0)
    last_hit_time = db.Column(db.DateTime)
    false_positive_count = db.Column(db.Integer, default=0)
    tags = db.Column(db.JSON, default=list)
    author = db.Column(db.String(100))
    version = db.Column(db.String(20), default='1.0')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'type': self.type,
            'description': self.description,
            'rule_content': self.rule_content,
            'rule_language': self.rule_language,
            'severity': self.severity,
            'status': self.status,
            'data_source_ids': as_json_list(self.data_source_ids),
            'playbook_id': self.playbook_id,
            'hit_count': self.hit_count,
            'last_hit_time': self.last_hit_time.isoformat() if self.last_hit_time else None,
            'false_positive_count': self.false_positive_count,
            'tags': as_json_list(self.tags),
            'author': self.author,
            'version': self.version,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class PlaybookExecution(db.Model):
    """剧本执行记录"""
    __tablename__ = 'playbook_executions'

    id = db.Column(db.String(50), primary_key=True)
    playbook_id = db.Column(db.Integer, db.ForeignKey('playbooks.id'))
    trigger_type = db.Column(db.String(50))  # event, manual, schedule, webhook
    trigger_data = db.Column(db.JSON, default=dict)
    status = db.Column(db.String(20), default='running')  # running, completed, failed, cancelled
    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime)
    duration = db.Column(db.Integer)  # 秒
    executor = db.Column(db.String(100))
    result_summary = db.Column(db.JSON, default=dict)
    error_message = db.Column(db.Text)

    playbook = db.relationship('Playbook', backref='executions')

    def to_dict(self):
        return {
            'id': self.id,
            'playbook_id': self.playbook_id,
            'playbook_name': self.playbook.name if self.playbook else None,
            'trigger_type': self.trigger_type,
            'trigger_data': self.trigger_data or {},
            'status': self.status,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'duration': self.duration,
            'executor': self.executor,
            'result_summary': self.result_summary or {},
            'error_message': self.error_message
        }


class Playbook(db.Model):
    """剧本：可视化编排的安全事件处置流程。

    数据契约：前端自建画布用 `nodes[].outputs[]`（下游节点 ID 数组）表达连线，
    持久化到后端时统一转换为 `edges[]`（`{id, source, target}`）图结构。
    列表接口默认不下发图数据（体积），详情接口下完整图。

    状态语义：`status` = 生命周期（draft/published/archived），
    `enabled` = 运行开关，两者独立。
    """
    __tablename__ = 'playbooks'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(160), nullable=False)
    description = db.Column(db.Text)
    nodes = db.Column(db.JSON, default=list)
    edges = db.Column(db.JSON, default=list)
    trigger_type = db.Column(db.String(50), default='告警事件')
    status = db.Column(db.String(20), default='draft')   # draft / published / archived
    version = db.Column(db.String(20), default='1.0')
    category = db.Column(db.String(50), default='其他')
    enabled = db.Column(db.Boolean, default=True)
    # 执行需审批（剧本配置项，作者在画布设置）：事件工作台执行时自动走审批流，不由执行人勾选
    approval_required = db.Column(db.Boolean, default=False)
    execution_count = db.Column(db.Integer, default=0)
    last_executed_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self, include_graph: bool = True):
        data = {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'trigger_type': self.trigger_type,
            'status': self.status,
            'version': self.version,
            'category': self.category,
            'enabled': bool(self.enabled),
            'approval_required': bool(self.approval_required),
            'execution_count': self.execution_count or 0,
            'node_count': len(self.nodes or []),
            'last_executed_at': self.last_executed_at.isoformat() if self.last_executed_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_graph:
            data['nodes'] = self.nodes or []
            data['edges'] = self.edges or []
        return data


# 存根类 - PlaybookApproval
class PlaybookApproval(db.Model):
    """剧本人工审批记录"""
    __tablename__ = 'playbook_approvals'

    id = db.Column(db.Integer, primary_key=True)
    playbook_id = db.Column(db.Integer)
    execution_id = db.Column(db.String(64))
    approval_type = db.Column(db.String(50))
    approval_level = db.Column(db.Integer, default=2)
    status = db.Column(db.String(20), default='pending')
    requester_id = db.Column(db.Integer)
    requester_name = db.Column(db.String(100))
    params = db.Column(db.JSON)
    reason = db.Column(db.String(500))
    related_event_id = db.Column(db.String(64))
    approver_id = db.Column(db.Integer)
    approver_name = db.Column(db.String(100))
    approved_at = db.Column(db.DateTime)
    result = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'playbook_id': self.playbook_id,
            'execution_id': self.execution_id,
            'approval_type': self.approval_type,
            'approval_level': self.approval_level,
            'status': self.status,
            'requester_id': self.requester_id,
            'requester_name': self.requester_name,
            'params': self.params,
            'reason': self.reason,
            'related_event_id': self.related_event_id,
            'approver_id': self.approver_id,
            'approver_name': self.approver_name,
            'approved_at': self.approved_at.isoformat() if self.approved_at else None,
            'result': self.result,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class IntegrationApp(db.Model):
    """第三方安全工具集成（从 Shuffle / 标准 OpenAPI 规范导入）。

    一个 App = 一组动作（actions），每个动作最终由引擎的 `http_request`
    动作执行；认证信息（API Key / Bearer / Basic）按 App 维度配置一次，
    该 App 下所有动作共用。规范来源 Shuffle/security-openapis（MIT）。
    """
    __tablename__ = 'integration_apps'

    id = db.Column(db.Integer, primary_key=True)
    app_key = db.Column(db.String(100), unique=True, nullable=False)   # 唯一标识，如 tenable_was
    name = db.Column(db.String(200), nullable=False)                  # 展示名
    description = db.Column(db.Text)
    version = db.Column(db.String(50))
    categories = db.Column(db.JSON, default=list)                     # ['VMS', 'Assets']
    base_url = db.Column(db.String(500))                              # servers[0].url 或 host+schemes 推导
    auth_type = db.Column(db.String(20), default='none')              # none / apiKey / bearer / basic
    auth_config = db.Column(db.JSON, default=dict)                    # apiKey:{in,name} / bearer:{prefix} / basic:{}
    credential = db.Column(db.String(1000))                           # 密钥（本地部署，to_dict 打码）
    actions = db.Column(db.JSON, default=list)                        # 解析后的动作列表
    source = db.Column(db.String(50), default='shuffle')              # 规范来源
    spec_format = db.Column(db.String(20))                            # openapi3 / openapi2 / shuffle-app
    enabled = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self, include_actions: bool = True, mask_credential: bool = True):
        data = {
            'id': self.id,
            'app_key': self.app_key,
            'name': self.name,
            'description': self.description,
            'version': self.version,
            'categories': self.categories or [],
            'base_url': self.base_url,
            'auth_type': self.auth_type or 'none',
            'auth_config': self.auth_config or {},
            'has_credential': bool(self.credential),
            'credential_masked': ('*' * 8 + (self.credential[-4:] if self.credential and len(self.credential) > 4 else '')) if self.credential else '',
            'action_count': len(self.actions or []),
            'source': self.source,
            'spec_format': self.spec_format,
            'enabled': bool(self.enabled),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_actions:
            data['actions'] = self.actions or []
        return data
