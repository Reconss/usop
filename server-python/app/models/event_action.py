"""
事件处置记录模型
用于记录事件的完整生命周期操作
"""
from datetime import datetime
from app.database import db


class EventAction(db.Model):
    """事件处置记录表"""
    __tablename__ = 'event_actions'

    id = db.Column(db.Integer, primary_key=True)
    
    # 关联的事件ID (支持字符串和数字)
    event_id = db.Column(db.String(50), nullable=False, index=True)
    
    # 操作类型
    action = db.Column(db.String(50), nullable=False)  # created, status_changed, severity_changed, assigned, comment, attachment, playbook_triggered, enriched, merged, escalated
    
    # 操作内容
    content = db.Column(db.Text)  # 评论内容、描述等
    
    # 操作人
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    user_name = db.Column(db.String(50))  # 冗余存储用户名
    
    # 状态变更记录
    previous_status = db.Column(db.String(20))
    new_status = db.Column(db.String(20))
    
    # 严重度变更记录
    previous_severity = db.Column(db.String(20))
    new_severity = db.Column(db.String(20))
    
    # 分配记录
    assignee = db.Column(db.String(50))
    
    # 附件
    attachments = db.Column(db.JSON, default=list)
    
    # 剧本执行记录
    playbook_id = db.Column(db.Integer, db.ForeignKey('playbooks.id'))
    playbook_name = db.Column(db.String(100))
    playbook_execution_id = db.Column(db.String(100))
    playbook_result = db.Column(db.JSON, default=dict)
    
    # 元数据（用于存储其他扩展信息）
    extra_data = db.Column(db.JSON, default=dict)
    
    # 时间戳
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    
    # 关联关系
    user = db.relationship('User', foreign_keys=[user_id])
    playbook = db.relationship('Playbook', foreign_keys=[playbook_id])

    def to_dict(self):
        return {
            'id': self.id,
            'event_id': self.event_id,
            'action': self.action,
            'content': self.content,
            'user_id': self.user_id,
            'user_name': self.user_name,
            'previous_status': self.previous_status,
            'new_status': self.new_status,
            'previous_severity': self.previous_severity,
            'new_severity': self.new_severity,
            'assignee': self.assignee,
            'attachments': self.attachments or [],
            'playbook_id': self.playbook_id,
            'playbook_name': self.playbook_name,
            'playbook_execution_id': self.playbook_execution_id,
            'playbook_result': self.playbook_result or {},
            'extra_data': self.extra_data or {},
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
