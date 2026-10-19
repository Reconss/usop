"""
STE 经验库模型（Security Triage Experience）

借鉴 EFF-Monitoring 的「研判经验沉淀与复用」设计：
- 告警闭环（标记为误报/真实攻击）后自动提取结构化研判经验
- 新告警研判时按 category/attack_type 召回相似经验，加权注入提示词
- 通过人工反馈（correct/wrong/useful/useless）动态调整 usefulness_score
"""
from datetime import datetime
from app.database import db


class STEExperience(db.Model):
    __tablename__ = 'ste_experiences'

    id = db.Column(db.Integer, primary_key=True)

    # 经验指纹：用于相似度召回
    category = db.Column(db.String(100), nullable=False, index=True)      # 告警分类
    attack_type = db.Column(db.String(100), index=True)                   # 攻击类型/规则名
    signature = db.Column(db.Text)                                       # 关键信号摘要（用于匹配）

    # 结构化研判结论
    verdict = db.Column(db.String(20), nullable=False)                    # true_attack / false_positive / suspicious / info
    verdict_label = db.Column(db.String(50))                             # 中文标签
    risk_level = db.Column(db.String(20), default='medium')              # critical / high / medium / low
    conclusion = db.Column(db.Text)                                      # 研判结论
    evidence_summary = db.Column(db.Text)                                # 证据摘要
    suggested_action = db.Column(db.Text)                                # 处置建议

    # 来源与权重
    source_alert_code = db.Column(db.String(20))                          # 来源告警编号
    usefulness_score = db.Column(db.Float, default=0.5)                  # 有用度权重 [0,1]
    hit_count = db.Column(db.Integer, default=0)                         # 被召回次数
    correct_count = db.Column(db.Integer, default=0)                     # 被采纳/正确的次数

    # ---- 经验库管理字段（移植 EFF「经验库」：编号 / 标题 / 标签 / 状态 / 来源） ----
    knowledge_id = db.Column(db.String(80), index=True)               # 经验编号（可读，如 STE-20261017-0001）
    title = db.Column(db.String(255))                                 # 经验标题
    tags = db.Column(db.JSON, default=list)                           # 标签
    status = db.Column(db.String(40), default='published', index=True)  # published / pending_publish / draft / archived
    source_type = db.Column(db.String(20), default='manual')          # manual / auto / import
    quality = db.Column(db.JSON, default=dict)                        # 质量元信息（证据数、完整性等）

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'knowledge_id': self.knowledge_id,
            'title': self.title,
            'tags': self.tags or [],
            'status': self.status or 'published',
            'source_type': self.source_type or 'manual',
            'quality': self.quality or {},
            'category': self.category,
            'attack_type': self.attack_type,
            'signature': self.signature,
            'verdict': self.verdict,
            'verdict_label': self.verdict_label,
            'risk_level': self.risk_level,
            'conclusion': self.conclusion,
            'evidence_summary': self.evidence_summary,
            'suggested_action': self.suggested_action,
            'source_alert_code': self.source_alert_code,
            'usefulness_score': round(self.usefulness_score or 0.5, 3),
            'hit_count': self.hit_count or 0,
            'correct_count': self.correct_count or 0,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
