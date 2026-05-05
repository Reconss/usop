# ========================================
# 解析管道字段映射模型
# ========================================

from datetime import datetime
from app.database import db


class PipelineFieldMapping(db.Model):
    """解析管道字段映射表

    存储每个解析管道的字段映射配置，
    将原始日志中的字段映射到标准告警字段。
    """
    __tablename__ = 'pipeline_field_mappings'

    id = db.Column(db.Integer, primary_key=True)
    pipeline_id = db.Column(db.Integer, db.ForeignKey('pipelines.id'), nullable=False)
    target_field = db.Column(db.String(50), nullable=False)  # 目标标准字段名
    source_field = db.Column(db.String(100), nullable=False)  # 源字段名
    field_type = db.Column(db.String(20), default='string')
    default_value = db.Column(db.String(255))
    is_required = db.Column(db.Boolean, default=False)
    sort_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'pipeline_id': self.pipeline_id,
            'target_field': self.target_field,
            'source_field': self.source_field,
            'field_type': self.field_type,
            'default_value': self.default_value,
            'is_required': self.is_required,
            'sort_order': self.sort_order,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class PipelineConfig(db.Model):
    """解析管道配置表

    存储解析管道的解析配置、过滤规则等。
    """
    __tablename__ = 'pipeline_configs'

    id = db.Column(db.Integer, primary_key=True)
    pipeline_id = db.Column(db.Integer, db.ForeignKey('pipelines.id'), nullable=False, unique=True)
    parser_type = db.Column(db.String(20), nullable=False, default='json')
    parser_config = db.Column(db.JSON, default=dict)
    sample_log = db.Column(db.Text)
    filter_rules = db.Column(db.JSON, default=list)
    transform_rules = db.Column(db.JSON, default=list)
    detection_rule_ids = db.Column(db.JSON, default=list)
    format_template_id = db.Column(db.Integer)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'pipeline_id': self.pipeline_id,
            'parser_type': self.parser_type,
            'parser_config': self.parser_config or {},
            'sample_log': self.sample_log,
            'filter_rules': self.filter_rules or [],
            'transform_rules': self.transform_rules or [],
            'detection_rule_ids': self.detection_rule_ids or [],
            'format_template_id': self.format_template_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
