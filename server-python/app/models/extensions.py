"""
扩展数据模型 - 补充前端功能所需的模型
"""
from datetime import datetime
from app.database import db


class Vulnerability(db.Model):
    """漏洞信息表"""
    __tablename__ = 'vulnerabilities'

    id = db.Column(db.String(50), primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    cve_id = db.Column(db.String(50))
    cvss_score = db.Column(db.Float, default=0.0)
    severity = db.Column(db.String(20), default='medium')  # critical, high, medium, low
    description = db.Column(db.Text)
    solution = db.Column(db.Text)
    category = db.Column(db.String(50))
    affected_product = db.Column(db.String(100))
    published_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'cve_id': self.cve_id,
            'cvss_score': self.cvss_score,
            'severity': self.severity,
            'description': self.description,
            'solution': self.solution,
            'category': self.category,
            'affected_product': self.affected_product,
            'published_at': self.published_at.isoformat() if self.published_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class AssetVulnerability(db.Model):
    """资产漏洞关联表"""
    __tablename__ = 'asset_vulnerabilities'

    id = db.Column(db.Integer, primary_key=True)
    asset_id = db.Column(db.Integer, db.ForeignKey('assets.id'), nullable=False)
    vuln_id = db.Column(db.String(50), db.ForeignKey('vulnerabilities.id'), nullable=False)
    status = db.Column(db.String(20), default='open')  # open, in_progress, fixed, ignored
    severity = db.Column(db.String(20), default='medium')
    cvss_score = db.Column(db.Float, default=0.0)
    assessed_score = db.Column(db.Float)
    evidence = db.Column(db.Text)
    discovered_at = db.Column(db.DateTime, default=datetime.utcnow)
    fixed_at = db.Column(db.DateTime)
    assignee = db.Column(db.String(100))
    notes = db.Column(db.Text)

    asset = db.relationship('Asset', backref='asset_vulnerabilities')
    vulnerability = db.relationship('Vulnerability', backref='asset_vulnerabilities')

    def to_dict(self):
        return {
            'id': self.id,
            'asset_id': self.asset_id,
            'asset_name': self.asset.name if self.asset else None,
            'vuln_id': self.vuln_id,
            'vuln_name': self.vulnerability.name if self.vulnerability else None,
            'cve_id': self.vulnerability.cve_id if self.vulnerability else None,
            'status': self.status,
            'severity': self.severity,
            'cvss_score': self.cvss_score,
            'assessed_score': self.assessed_score,
            'evidence': self.evidence,
            'discovered_at': self.discovered_at.isoformat() if self.discovered_at else None,
            'fixed_at': self.fixed_at.isoformat() if self.fixed_at else None,
            'assignee': self.assignee,
            'notes': self.notes
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
    is_system = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'permissions': self.permissions or [],
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
            'data_source_ids': self.data_source_ids or [],
            'hit_count': self.hit_count,
            'last_hit_time': self.last_hit_time.isoformat() if self.last_hit_time else None,
            'false_positive_count': self.false_positive_count,
            'tags': self.tags or [],
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
