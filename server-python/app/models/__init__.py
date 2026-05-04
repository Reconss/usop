from datetime import datetime
from app.database import db

# 导入扩展模型
from app.models.extensions import (
    Vulnerability,
    AssetVulnerability,
    ScanProfile,
    ScanAgent,
    HuntingResult,
    AIInsight,
    AIChatSession,
    AIChatMessage,
    AIAgent,
    Role,
    AssetPort,
    ScanResult,
    DetectionRuleExtended,
    PlaybookExecution
)


class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), default='analyst')
    status = db.Column(db.String(20), default='active')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'role': self.role,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class Event(db.Model):
    __tablename__ = 'events'

    id = db.Column(db.Integer, primary_key=True)
    event_code = db.Column(db.String(20), unique=True, nullable=False)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    severity = db.Column(db.String(20), default='medium')
    category = db.Column(db.String(50))
    source = db.Column(db.String(100))
    status = db.Column(db.String(20), default='new')
    raw_log = db.Column(db.Text)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'event_code': self.event_code,
            'title': self.title,
            'description': self.description,
            'severity': self.severity,
            'category': self.category,
            'source': self.source,
            'status': self.status,
            'raw_log': self.raw_log,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class Alert(db.Model):
    __tablename__ = 'alerts'

    id = db.Column(db.Integer, primary_key=True)
    alert_code = db.Column(db.String(20), unique=True, nullable=False)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    severity = db.Column(db.String(20), default='medium')
    status = db.Column(db.String(20), default='new')
    source = db.Column(db.String(100))
    assigned_to = db.Column(db.Integer, db.ForeignKey('users.id'))
    event_ids = db.Column(db.JSON, default=list)
    extra_data = db.Column(db.JSON, default=dict)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'alert_code': self.alert_code,
            'title': self.title,
            'description': self.description,
            'severity': self.severity,
            'status': self.status,
            'source': self.source,
            'assigned_to': self.assigned_to,
            'event_ids': self.event_ids or [],
            'metadata': self.extra_data or {},
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class Asset(db.Model):
    __tablename__ = 'assets'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    type = db.Column(db.String(50))
    ip = db.Column(db.String(50))
    status = db.Column(db.String(20), default='online')
    risk_score = db.Column(db.Integer, default=0)
    tags = db.Column(db.JSON, default=list)
    extra_data = db.Column(db.JSON, default=dict)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'type': self.type,
            'ip': self.ip,
            'status': self.status,
            'risk_score': self.risk_score,
            'tags': self.tags or [],
            'metadata': self.extra_data or {},
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class ScanTask(db.Model):
    __tablename__ = 'scan_tasks'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    type = db.Column(db.String(50))
    status = db.Column(db.String(20), default='pending')
    target = db.Column(db.String(200))
    progress = db.Column(db.Integer, default=0)
    results = db.Column(db.JSON, default=dict)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    started_at = db.Column(db.DateTime)
    completed_at = db.Column(db.DateTime)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'type': self.type,
            'status': self.status,
            'target': self.target,
            'progress': self.progress,
            'results': self.results or {},
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None
        }


class Rule(db.Model):
    __tablename__ = 'rules'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    type = db.Column(db.String(50))
    content = db.Column(db.Text)
    status = db.Column(db.String(20), default='active')
    severity = db.Column(db.String(20), default='medium')
    tags = db.Column(db.JSON, default=list)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'type': self.type,
            'content': self.content,
            'status': self.status,
            'severity': self.severity,
            'tags': self.tags or [],
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class Playbook(db.Model):
    __tablename__ = 'playbooks'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    nodes = db.Column(db.JSON, default=list)
    edges = db.Column(db.JSON, default=list)
    status = db.Column(db.String(20), default='draft')
    version = db.Column(db.String(20), default='1.0')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'nodes': self.nodes or [],
            'edges': self.edges or [],
            'status': self.status,
            'version': self.version,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class AuditLog(db.Model):
    __tablename__ = 'audit_logs'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer)
    username = db.Column(db.String(50))
    action = db.Column(db.String(50))
    module = db.Column(db.String(50))
    target = db.Column(db.String(100))
    details = db.Column(db.JSON, default=dict)
    ip = db.Column(db.String(50))
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'username': self.username,
            'action': self.action,
            'module': self.module,
            'target': self.target,
            'details': self.details or {},
            'ip': self.ip,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None
        }


class Notification(db.Model):
    __tablename__ = 'notifications'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer)
    title = db.Column(db.String(200), nullable=False)
    message = db.Column(db.Text)
    type = db.Column(db.String(20), default='info')
    read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'title': self.title,
            'message': self.message,
            'type': self.type,
            'read': self.read,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class HuntingQuery(db.Model):
    __tablename__ = 'hunting_queries'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    query = db.Column(db.Text)
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'query': self.query,
            'description': self.description,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class AIModel(db.Model):
    __tablename__ = 'ai_models'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    type = db.Column(db.String(50))
    provider = db.Column(db.String(50))
    status = db.Column(db.String(20), default='active')
    config = db.Column(db.JSON, default=dict)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'type': self.type,
            'provider': self.provider,
            'status': self.status,
            'config': self.config or {},
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class AITask(db.Model):
    __tablename__ = 'ai_tasks'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    model_id = db.Column(db.Integer, db.ForeignKey('ai_models.id'))
    type = db.Column(db.String(50))
    input_data = db.Column(db.JSON, default=dict)
    output_data = db.Column(db.JSON, default=dict)
    status = db.Column(db.String(20), default='pending')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'model_id': self.model_id,
            'type': self.type,
            'input_data': self.input_data or {},
            'output_data': self.output_data or {},
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None
        }


class DataSource(db.Model):
    __tablename__ = 'data_sources'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    protocol = db.Column(db.String(50))  # kafka, syslog, es, jdbc, file, webhook, s3, api, snmp, sftp
    source_type = db.Column(db.String(20))  # pull, push
    description = db.Column(db.Text)
    status = db.Column(db.String(20), default='inactive')  # active, inactive, connected, error
    message_count = db.Column(db.Integer, default=0)
    
    # 通用连接配置
    host = db.Column(db.String(200))
    port = db.Column(db.Integer)
    username = db.Column(db.String(100))
    password = db.Column(db.String(255))
    
    # 协议特定配置 (JSON格式)
    config = db.Column(db.JSON, default=dict)
    
    # 读取位置追踪 (用于避免重复读取)
    read_position = db.Column(db.JSON, default=dict)  # {'file': '/path/file.log': {'offset': 12345, 'inode': 123456}}
    
    # 统计信息
    last_read_at = db.Column(db.DateTime)
    last_error = db.Column(db.Text)
    
    # 元数据
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 关联
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'))
    pipeline_id = db.Column(db.Integer, db.ForeignKey('pipelines.id'))
    product = db.relationship('Product', backref='data_sources')
    pipeline = db.relationship('Pipeline', backref='data_sources')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'protocol': self.protocol,
            'source_type': self.source_type,
            'description': self.description,
            'status': self.status,
            'message_count': self.message_count,
            'host': self.host,
            'port': self.port,
            'username': self.username,
            'config': self.config or {},
            'read_position': self.read_position or {},
            'last_read_at': self.last_read_at.isoformat() if self.last_read_at else None,
            'last_error': self.last_error,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'product_id': self.product_id,
            'pipeline_id': self.pipeline_id,
            'product_name': self.product.name if self.product else None,
            'pipeline_name': self.pipeline.name if self.pipeline else None
        }


class Product(db.Model):
    """安全产品配置表"""
    __tablename__ = 'products'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
    code = db.Column(db.String(50), nullable=False, unique=True)
    category = db.Column(db.String(50))  # 网络安全、主机安全、应用安全、数据安全
    vendor = db.Column(db.String(100))  # 厂商
    description = db.Column(db.Text)
    icon = db.Column(db.String(50))  # 图标标识
    default_severity = db.Column(db.Integer, default=3)  # 默认严重级别
    config = db.Column(db.JSON, default=dict)  # 产品特定配置
    status = db.Column(db.String(20), default='active')
    
    # 关联默认解析管道
    default_pipeline_id = db.Column(db.Integer, db.ForeignKey('pipelines.id'))
    default_pipeline = db.relationship('Pipeline', foreign_keys=[default_pipeline_id], backref='default_for_products')
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 关系
    pipelines = db.relationship('Pipeline', backref='product', foreign_keys='Pipeline.product_id')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'code': self.code,
            'category': self.category,
            'vendor': self.vendor,
            'description': self.description,
            'icon': self.icon,
            'default_severity': self.default_severity,
            'config': self.config or {},
            'status': self.status,
            'default_pipeline_id': self.default_pipeline_id,
            'default_pipeline_name': self.default_pipeline.name if self.default_pipeline else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class Pipeline(db.Model):
    """数据解析管道配置
    
    关联关系：
    - Pipeline.log_type_id → LogType (定义处理的日志类型)
    - Pipeline.format_id → FormatTemplate (定义如何解析)
    - Pipeline.output_table_id → DataTable (定义存储位置)
    """
    __tablename__ = 'pipelines'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)

    # 关联产品（可选，管道可属于特定产品）
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'))

    # ===== 核心关联 =====
    # 关联日志类型（定义这是处理什么类型的日志）
    log_type_id = db.Column(db.String(50), db.ForeignKey('log_types.id'))
    
    # 关联格式模板（定义如何解析）
    format_id = db.Column(db.String(50), db.ForeignKey('format_templates.id'))
    
    # 关联输出表（定义存储到哪里）
    output_table_id = db.Column(db.String(50), db.ForeignKey('data_tables.id'))

    # 解析配置（当没有引用格式模板时使用）
    input_format = db.Column(db.String(50), default='json')  # json, syslog, keyvalue, csv, grok, 或 custom_xxx
    input_config = db.Column(db.JSON, default=dict)  # 解析器配置

    # 字段映射
    field_mapping = db.Column(db.JSON, default=dict)  # 字段映射规则

    # 过滤规则
    filter_rules = db.Column(db.JSON, default=list)  # 过滤规则列表

    # 转换规则
    transform_rules = db.Column(db.JSON, default=list)  # 转换规则

    # 输出配置
    output_target = db.Column(db.String(50), default='alerts')  # alerts, logs, metrics
    output_config = db.Column(db.JSON, default=dict)  # 输出配置

    # 处理配置
    batch_size = db.Column(db.Integer, default=100)
    parallel_workers = db.Column(db.Integer, default=4)

    status = db.Column(db.String(20), default='active')
    priority = db.Column(db.Integer, default=100)  # 处理优先级

    # 多规则解析配置
    match_conditions = db.Column(db.JSON, default=list)
    rule_type = db.Column(db.String(20), default='exclusive')
    next_pipeline_id = db.Column(db.Integer, db.ForeignKey('pipelines.id'), nullable=True)
    next_pipeline = db.relationship('Pipeline', remote_side=[id], backref='prev_pipeline')
    
    # 关联关系
    log_type = db.relationship('LogType', foreign_keys=[log_type_id])
    format_template = db.relationship('FormatTemplate', foreign_keys=[format_id])
    output_table = db.relationship('DataTable', foreign_keys=[output_table_id])

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'product_id': self.product_id,
            'product_name': self.product.name if self.product else None,
            'log_type_id': self.log_type_id,
            'log_type_name': self.log_type.name if self.log_type else None,
            'format_id': self.format_id,
            'format_name': self.format_template.name if self.format_template else None,
            'format_type': self.format_template.type if self.format_template else None,
            'output_table_id': self.output_table_id,
            'output_table_name': self.output_table.name if self.output_table else None,
            'input_format': self.input_format,
            'input_config': self.input_config or {},
            'field_mapping': self.field_mapping or {},
            'filter_rules': self.filter_rules or [],
            'transform_rules': self.transform_rules or [],
            'output_target': self.output_target,
            'output_config': self.output_config or {},
            'batch_size': self.batch_size,
            'parallel_workers': self.parallel_workers,
            'status': self.status,
            'priority': self.priority,
            'match_conditions': self.match_conditions or [],
            'rule_type': self.rule_type or 'exclusive',
            'next_pipeline_id': self.next_pipeline_id,
            'next_pipeline_name': self.next_pipeline.name if self.next_pipeline else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class DataFormat(db.Model):
    """自定义数据解析格式模板"""
    __tablename__ = 'data_formats'

    id = db.Column(db.String(50), primary_key=True)  # 如 'custom_abc123' 或 'huawei_waf'
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    type = db.Column(db.String(50), default='custom')  # json, csv, syslog, grok, regex, custom

    # 格式示例
    sample = db.Column(db.Text)
    example = db.Column(db.Text)

    # 解析配置
    default_config = db.Column(db.JSON, default=dict)  # 默认解析器配置
    input_config = db.Column(db.JSON, default=dict)  # 输入配置
    default_mapping = db.Column(db.JSON, default=dict)  # 默认字段映射

    # 字段定义
    fields = db.Column(db.JSON, default=list)  # 字段列表
    standard_fields = db.Column(db.JSON, default=list)  # 标准字段列表

    # 状态
    status = db.Column(db.String(20), default='active')

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'type': self.type,
            'sample': self.sample,
            'example': self.example,
            'default_config': self.default_config or {},
            'input_config': self.input_config or {},
            'default_mapping': self.default_mapping or {},
            'fields': self.fields or [],
            'standard_fields': self.standard_fields or [],
            'status': self.status,
            'is_custom': True,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class AlertLog(db.Model):
    """告警日志表（用于TimescaleDB风格存储）"""
    __tablename__ = 'alert_logs'

    id = db.Column(db.BigInteger, primary_key=True)
    
    # 数据源和产品信息
    source_id = db.Column(db.Integer, db.ForeignKey('data_sources.id'))
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'))
    product_code = db.Column(db.String(50))  # 冗余字段，加速查询
    pipeline_id = db.Column(db.Integer, db.ForeignKey('pipelines.id'))
    
    # 告警基本信息
    alert_name = db.Column(db.String(200))
    alert_type = db.Column(db.String(100))
    severity = db.Column(db.Integer, default=3)  # 1-5级
    status = db.Column(db.String(20), default='open')
    
    # 网络信息
    src_ip = db.Column(db.String(50))
    dst_ip = db.Column(db.String(50))
    src_port = db.Column(db.Integer)
    dst_port = db.Column(db.Integer)
    protocol = db.Column(db.String(20))
    hostname = db.Column(db.String(200))
    username = db.Column(db.String(100))
    
    # 原始和详情数据
    raw_log = db.Column(db.Text)
    details = db.Column(db.JSON, default=dict)
    recommendation = db.Column(db.Text)
    
    # 关联分析字段
    rule_id = db.Column(db.Integer)
    attack_chain = db.Column(db.String(50))  # 攻击链阶段
    ioc_type = db.Column(db.String(50))  # IOC类型：IP/Domain/Hash
    ioc_value = db.Column(db.String(500))  # IOC值
    
    # 统计字段
    event_count = db.Column(db.Integer, default=1)  # 关联事件数
    
    # 时间戳（时序分区键）
    time = db.Column(db.DateTime, default=datetime.utcnow, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # 关系
    source = db.relationship('DataSource', backref='alert_logs')
    product = db.relationship('Product', backref='alert_logs')
    pipeline = db.relationship('Pipeline', backref='alert_logs')

    def to_dict(self):
        return {
            'id': self.id,
            'source_id': self.source_id,
            'product_id': self.product_id,
            'product_code': self.product_code,
            'pipeline_id': self.pipeline_id,
            'alert_name': self.alert_name,
            'alert_type': self.alert_type,
            'severity': self.severity,
            'status': self.status,
            'src_ip': self.src_ip,
            'dst_ip': self.dst_ip,
            'src_port': self.src_port,
            'dst_port': self.dst_port,
            'protocol': self.protocol,
            'hostname': self.hostname,
            'username': self.username,
            'raw_log': self.raw_log,
            'details': self.details or {},
            'recommendation': self.recommendation,
            'rule_id': self.rule_id,
            'attack_chain': self.attack_chain,
            'ioc_type': self.ioc_type,
            'ioc_value': self.ioc_value,
            'event_count': self.event_count,
            'time': self.time.isoformat() if self.time else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class SystemConfig(db.Model):
    __tablename__ = 'system_config'

    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(100), unique=True, nullable=False)
    value = db.Column(db.Text)
    category = db.Column(db.String(50))
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'key': self.key,
            'value': self.value,
            'category': self.category,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class LogType(db.Model):
    """日志类型配置"""
    __tablename__ = 'log_types'

    id = db.Column(db.String(50), primary_key=True)  # 如 'waf_alert'
    name = db.Column(db.String(100), nullable=False)  # 如 'WAF告警'
    code = db.Column(db.String(50), nullable=False, unique=True)
    description = db.Column(db.Text)
    category = db.Column(db.String(50), default='security')  # security, audit, access, network, system, application, custom
    icon = db.Column(db.String(50))
    color = db.Column(db.String(20))
    default_severity = db.Column(db.Integer, default=3)  # 1-5级
    retention_days = db.Column(db.Integer, default=90)
    status = db.Column(db.String(20), default='active')
    tags = db.Column(db.JSON, default=list)
    pipeline_id = db.Column(db.String(50))  # 关联的解析管道
    pipeline_name = db.Column(db.String(100))  # 管道名称（冗余存储便于显示）
    patterns = db.Column(db.JSON, default=list)  # 日志匹配模式
    log_count = db.Column(db.BigInteger, default=0)  # 日志数量统计
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'code': self.code,
            'description': self.description,
            'category': self.category,
            'icon': self.icon,
            'color': self.color,
            'default_severity': self.default_severity,
            'retention_days': self.retention_days,
            'status': self.status,
            'tags': self.tags or [],
            'pipeline_id': self.pipeline_id,
            'pipeline_name': self.pipeline_name,
            'patterns': self.patterns or [],
            'log_count': self.log_count or 0,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }


class FormatTemplate(db.Model):
    """格式模板配置"""
    __tablename__ = 'format_templates'

    id = db.Column(db.String(50), primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    log_type_id = db.Column(db.String(50), db.ForeignKey('log_types.id'))
    type = db.Column(db.String(50), default='json')  # json, csv, xml, syslog, cef, leef, grok, regex, keyvalue, custom
    priority = db.Column(db.Integer, default=100)
    sample = db.Column(db.Text)
    fields = db.Column(db.JSON, default=list)
    input_config = db.Column(db.JSON, default=dict)
    grok_pattern = db.Column(db.Text)
    regex_pattern = db.Column(db.Text)
    delimiter = db.Column(db.String(10))
    is_system = db.Column(db.Boolean, default=False)
    is_custom = db.Column(db.Boolean, default=True)
    used_by_count = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    log_type = db.relationship('LogType', backref='formats')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'log_type_id': self.log_type_id,
            'type': self.type,
            'priority': self.priority,
            'sample': self.sample,
            'fields': self.fields or [],
            'input_config': self.input_config or {},
            'grok_pattern': self.grok_pattern,
            'regex_pattern': self.regex_pattern,
            'delimiter': self.delimiter,
            'is_system': self.is_system,
            'is_custom': self.is_custom,
            'used_by_count': self.used_by_count,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }


class DataTable(db.Model):
    """目标存储表配置"""
    __tablename__ = 'data_tables'

    id = db.Column(db.String(50), primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    code = db.Column(db.String(50), nullable=False, unique=True)
    description = db.Column(db.Text)
    log_type_id = db.Column(db.String(50), db.ForeignKey('log_types.id'))
    columns = db.Column(db.JSON, default=list)
    retention_days = db.Column(db.Integer, default=90)
    partition_by = db.Column(db.String(50))
    index_fields = db.Column(db.JSON, default=list)
    record_count = db.Column(db.BigInteger, default=0)
    data_size_mb = db.Column(db.Float, default=0)
    status = db.Column(db.String(20), default='active')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    log_type = db.relationship('LogType', backref='tables')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'code': self.code,
            'description': self.description,
            'log_type_id': self.log_type_id,
            'columns': self.columns or [],
            'retention_days': self.retention_days,
            'partition_by': self.partition_by,
            'index_fields': self.index_fields or [],
            'record_count': self.record_count,
            'data_size_mb': self.data_size_mb,
            'status': self.status,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }


class LogClassifier(db.Model):
    """日志分类器配置"""
    __tablename__ = 'log_classifiers'

    id = db.Column(db.String(50), primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    data_source_id = db.Column(db.Integer, db.ForeignKey('data_sources.id'))
    default_log_type_id = db.Column(db.String(50), db.ForeignKey('log_types.id'))
    match_mode = db.Column(db.String(20), default='first_match')  # first_match, best_match, all_match
    priority = db.Column(db.Integer, default=100)
    status = db.Column(db.String(20), default='active')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    data_source = db.relationship('DataSource', backref='classifiers')
    default_log_type = db.relationship('LogType', foreign_keys=[default_log_type_id])

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'data_source_id': self.data_source_id,
            'default_log_type_id': self.default_log_type_id,
            'match_mode': self.match_mode,
            'priority': self.priority,
            'status': self.status,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }


class ClassifierRule(db.Model):
    """分类器规则配置
    
    关联关系：
    - ClassifierRule.log_type_id → LogType (目标日志类型)
    
    注意：规则只指定目标日志类型，不直接关联格式/管道
    系统根据日志类型自动查找对应的解析管道
    """
    __tablename__ = 'classifier_rules'

    id = db.Column(db.String(50), primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    classifier_id = db.Column(db.String(50), db.ForeignKey('log_classifiers.id'))
    
    # 核心关联：只关联日志类型
    log_type_id = db.Column(db.String(50), db.ForeignKey('log_types.id'))
    
    # 匹配条件
    conditions = db.Column(db.JSON, default=list)
    condition_logic = db.Column(db.String(10), default='AND')  # AND, OR
    
    # 统计
    priority = db.Column(db.Integer, default=100)
    enabled = db.Column(db.Boolean, default=True)
    match_count = db.Column(db.BigInteger, default=0)
    last_match_at = db.Column(db.DateTime)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    classifier = db.relationship('LogClassifier', backref='rules')
    log_type = db.relationship('LogType', backref='classifier_rules')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'classifier_id': self.classifier_id,
            'log_type_id': self.log_type_id,
            'log_type_name': self.log_type.name if self.log_type else None,
            'priority': self.priority,
            'enabled': self.enabled,
            'conditions': self.conditions or [],
            'condition_logic': self.condition_logic,
            'match_count': self.match_count,
            'last_match_at': self.last_match_at.isoformat() if self.last_match_at else None,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }


class DataSourceConfig(db.Model):
    """数据源配置（数据源与处理配置的关联）
    
    关联关系：
    - DataSourceConfig.data_source_id → DataSource
    - DataSourceConfig.classifier_id → LogClassifier (智能分类模式)
    - DataSourceConfig.pipeline_id → Pipeline (直接解析模式)
    
    两种处理模式：
    1. 智能分类模式：数据源 → 分类器 → 规则匹配 → 日志类型 → 解析管道
    2. 直接解析模式：数据源 → 解析管道 → 格式模板 → 输出表
    """
    __tablename__ = 'data_source_configs'

    id = db.Column(db.String(50), primary_key=True)
    data_source_id = db.Column(db.Integer, db.ForeignKey('data_sources.id'))
    
    # 处理模式选择（二选一）
    classifier_id = db.Column(db.String(50), db.ForeignKey('log_classifiers.id'))  # 智能分类模式
    pipeline_id = db.Column(db.Integer, db.ForeignKey('pipelines.id'))  # 直接解析模式
    
    enabled = db.Column(db.Boolean, default=True)
    priority = db.Column(db.Integer, default=100)
    description = db.Column(db.Text)
    pre_filters = db.Column(db.JSON, default=list)
    processed_count = db.Column(db.BigInteger, default=0)
    error_count = db.Column(db.BigInteger, default=0)
    last_processed_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关联关系
    data_source = db.relationship('DataSource', backref='configs')
    classifier = db.relationship('LogClassifier', backref='source_configs')
    pipeline = db.relationship('Pipeline', backref='source_configs')

    def to_dict(self):
        return {
            'id': self.id,
            'data_source_id': self.data_source_id,
            'data_source_name': self.data_source.name if self.data_source else None,
            'classifier_id': self.classifier_id,
            'classifier_name': self.classifier.name if self.classifier else None,
            'pipeline_id': self.pipeline_id,
            'pipeline_name': self.pipeline.name if self.pipeline else None,
            'enabled': self.enabled,
            'priority': self.priority,
            'description': self.description,
            'pre_filters': self.pre_filters or [],
            'processed_count': self.processed_count,
            'error_count': self.error_count,
            'last_processed_at': self.last_processed_at.isoformat() if self.last_processed_at else None,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }
