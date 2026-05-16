# ========================================
# 存储表管理路由
# ========================================

from flask import Blueprint, request, jsonify
from app.database import db
from app.routes.auth import login_required
from datetime import datetime

storage_bp = Blueprint('storage', __name__)


class StorageTable(db.Model):
    """存储表模型"""
    __tablename__ = 'storage_tables'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    display_name = db.Column(db.String(100), nullable=False)
    data_source = db.Column(db.String(100))
    log_type = db.Column(db.String(50))
    retention_days = db.Column(db.Integer, default=90)
    partition_interval = db.Column(db.String(20), default='1天')
    indexes = db.Column(db.JSON, default=list)
    columns = db.Column(db.JSON, default=list)
    row_count = db.Column(db.BigInteger, default=0)
    size = db.Column(db.String(20))
    compression = db.Column(db.Boolean, default=True)
    auto_created = db.Column(db.Boolean, default=False)
    created_by_pipeline = db.Column(db.String(100))
    last_optimized = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': str(self.id),
            'name': self.name,
            'displayName': self.display_name,
            'dataSource': self.data_source,
            'logType': self.log_type,
            'retentionDays': self.retention_days,
            'partitionInterval': self.partition_interval,
            'indexes': self.indexes or [],
            'columns': self.columns or [],
            'rowCount': self.row_count or 0,
            'size': self.size or '0 MB',
            'compression': self.compression,
            'autoCreated': self.auto_created,
            'createdByPipeline': self.created_by_pipeline,
            'lastOptimized': self.last_optimized.isoformat() if self.last_optimized else None,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }


@storage_bp.route('', methods=['GET'])
@login_required
def get_storage_tables():
    """获取所有存储表"""
    auto_created = request.args.get('auto_created')
    query = StorageTable.query
    
    if auto_created is not None:
        query = query.filter_by(auto_created=auto_created.lower() == 'true')
    
    tables = query.order_by(StorageTable.created_at.desc()).all()
    return jsonify({
        'code': 200,
        'data': [t.to_dict() for t in tables]
    })


@storage_bp.route('/<int:table_id>', methods=['GET'])
@login_required
def get_storage_table(table_id):
    """获取单个存储表"""
    table = StorageTable.query.get_or_404(table_id)
    return jsonify({
        'code': 200,
        'data': table.to_dict()
    })


@storage_bp.route('', methods=['POST'])
@login_required
def create_storage_table():
    """创建存储表"""
    data = request.get_json()
    
    # 检查表名是否已存在
    if StorageTable.query.filter_by(name=data['name']).first():
        return jsonify({
            'code': 400,
            'message': '表名已存在'
        }), 400
    
    table = StorageTable(
        name=data['name'],
        display_name=data.get('displayName', data['name']),
        data_source=data.get('dataSource'),
        log_type=data.get('logType'),
        retention_days=data.get('retentionDays', 90),
        partition_interval=data.get('partitionInterval', '1天'),
        indexes=data.get('indexes', []),
        columns=data.get('columns', []),
        compression=data.get('compression', True),
        auto_created=False
    )
    
    db.session.add(table)
    db.session.commit()
    
    return jsonify({
        'code': 200,
        'message': '创建成功',
        'data': table.to_dict()
    })


@storage_bp.route('/<int:table_id>', methods=['PUT'])
@login_required
def update_storage_table(table_id):
    """更新存储表"""
    table = StorageTable.query.get_or_404(table_id)
    data = request.get_json()
    
    if 'displayName' in data:
        table.display_name = data['displayName']
    if 'retentionDays' in data:
        table.retention_days = data['retentionDays']
    if 'partitionInterval' in data:
        table.partition_interval = data['partitionInterval']
    if 'indexes' in data:
        table.indexes = data['indexes']
    if 'columns' in data:
        table.columns = data['columns']
    if 'compression' in data:
        table.compression = data['compression']
    
    db.session.commit()
    
    return jsonify({
        'code': 200,
        'message': '更新成功',
        'data': table.to_dict()
    })


@storage_bp.route('/<int:table_id>', methods=['DELETE'])
@login_required
def delete_storage_table(table_id):
    """删除存储表"""
    table = StorageTable.query.get_or_404(table_id)
    
    # 不允许删除自动创建的表
    if table.auto_created:
        return jsonify({
            'code': 403,
            'message': '自动创建的存储表不允许删除'
        }), 403
    
    db.session.delete(table)
    db.session.commit()
    
    return jsonify({
        'code': 200,
        'message': '删除成功'
    })


@storage_bp.route('/batch-delete', methods=['POST'])
@login_required
def batch_delete_storage_tables():
    """批量删除存储表"""
    data = request.get_json()
    table_ids = data.get('ids', [])
    
    # 过滤掉自动创建的表
    tables = StorageTable.query.filter(
        StorageTable.id.in_(table_ids),
        StorageTable.auto_created == False
    ).all()
    
    deleted_count = len(tables)
    for table in tables:
        db.session.delete(table)
    
    db.session.commit()
    
    return jsonify({
        'code': 200,
        'message': f'成功删除 {deleted_count} 个存储表'
    })
