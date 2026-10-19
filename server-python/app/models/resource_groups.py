# ========================================
# 资源管理 — IT 资产信息配置（供解析/过滤/研判等模块调用）
# 借鉴 EFF-Monitoring IP 黑白名单模型，扩展为通用资源组：
#   - IP 组：单 IP / CIDR / 范围（10.0.0.1-10.0.0.50）条目
#   - 域名组：精确域名 / 通配后缀（.example.com 或 *.example.com）
# ========================================

from datetime import datetime

from app.database import db


class IpGroup(db.Model):
    """IP 资源组：一组 IP/CIDR/范围条目的命名集合。

    usage 用途：general（通用资源）/ blacklist（黑名单，封禁参考）/ whitelist（白名单，放行/静默参考）。
    合并自原 IP 黑白名单（ip_lists）模块。
    """
    __tablename__ = 'ip_groups'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)
    description = db.Column(db.String(500), default='')
    usage = db.Column(db.String(20), nullable=False, default='general')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    items = db.relationship('IpGroupItem', backref='group',
                            cascade='all, delete-orphan', lazy='joined')

    def to_dict(self):
        return {'id': self.id, 'name': self.name, 'description': self.description,
                'usage': self.usage or 'general',
                'created_at': self.created_at.isoformat() if self.created_at else None,
                'items': [i.to_dict() for i in self.items]}


class IpGroupItem(db.Model):
    """IP 组条目：单 IP、CIDR（10.0.0.0/24）或范围（10.0.0.1-10.0.0.50）。"""
    __tablename__ = 'ip_group_items'

    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey('ip_groups.id'), nullable=False)
    entry = db.Column(db.String(200), nullable=False)
    remark = db.Column(db.String(300), default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {'id': self.id, 'group_id': self.group_id, 'entry': self.entry,
                'remark': self.remark,
                'created_at': self.created_at.isoformat() if self.created_at else None}


class DomainGroup(db.Model):
    """域名资源组：一组域名条目的命名集合。"""
    __tablename__ = 'domain_groups'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)
    description = db.Column(db.String(500), default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    items = db.relationship('DomainGroupItem', backref='group',
                            cascade='all, delete-orphan', lazy='joined')

    def to_dict(self):
        return {'id': self.id, 'name': self.name, 'description': self.description,
                'created_at': self.created_at.isoformat() if self.created_at else None,
                'items': [i.to_dict() for i in self.items]}


class DomainGroupItem(db.Model):
    """域名组条目：精确域名（api.example.com）或通配后缀（.example.com / *.example.com）。"""
    __tablename__ = 'domain_group_items'

    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey('domain_groups.id'), nullable=False)
    domain = db.Column(db.String(255), nullable=False)
    remark = db.Column(db.String(300), default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {'id': self.id, 'group_id': self.group_id, 'domain': self.domain,
                'remark': self.remark,
                'created_at': self.created_at.isoformat() if self.created_at else None}
