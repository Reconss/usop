"""
数据库迁移：添加安全告警系统存储表
确保系统存储表包含安全告警表定义，解析管道可以引用
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from app.database import db
import json


# 安全告警表字段定义（包含自动生成和被动接收字段）
SECURITY_ALERT_TABLE_COLUMNS = [
    # 自动生成的字段（系统自动填充）
    {'name': 'id', 'label': 'ID', 'type': 'number', 'category': '系统-自动生成', 'required': True, 'auto_generated': True},
    {'name': 'alert_code', 'label': '告警编号', 'type': 'string', 'category': '系统-自动生成', 'required': True, 'auto_generated': True},
    {'name': 'first_seen', 'label': '首次发现时间', 'type': 'datetime', 'category': '系统-自动生成', 'required': True, 'auto_generated': True},
    {'name': 'last_seen', 'label': '最近发现时间', 'type': 'datetime', 'category': '系统-自动生成', 'required': True, 'auto_generated': True},
    {'name': 'created_at', 'label': '创建时间', 'type': 'datetime', 'category': '系统-自动生成', 'required': True, 'auto_generated': True},
    {'name': 'updated_at', 'label': '更新时间', 'type': 'datetime', 'category': '系统-自动生成', 'required': False, 'auto_generated': True},
    
    # 需要被动接收的字段（需通过解析管道或手动输入）
    {'name': 'title', 'label': '告警标题', 'type': 'string', 'category': '告警属性-被动接收', 'required': True, 'auto_generated': False},
    {'name': 'description', 'label': '告警描述', 'type': 'string', 'category': '告警属性-被动接收', 'required': False, 'auto_generated': False},
    {'name': 'severity', 'label': '严重程度', 'type': 'string', 'category': '告警属性-被动接收', 'required': True, 'auto_generated': False},
    {'name': 'status', 'label': '状态', 'type': 'string', 'category': '告警属性-被动接收', 'required': True, 'auto_generated': False},
    {'name': 'source', 'label': '数据源', 'type': 'string', 'category': '数据源-被动接收', 'required': True, 'auto_generated': False},
    {'name': 'source_product', 'label': '产品类型', 'type': 'string', 'category': '数据源-被动接收', 'required': False, 'auto_generated': False},
    {'name': 'category', 'label': '告警分类', 'type': 'string', 'category': '告警属性-被动接收', 'required': False, 'auto_generated': False},
    {'name': 'confidence', 'label': '置信度', 'type': 'number', 'category': '告警属性-被动接收', 'required': False, 'auto_generated': False},
    
    # 网络五元组（被动接收）
    {'name': 'src_ip', 'label': '源地址', 'type': 'string', 'category': '网络-被动接收', 'required': False, 'auto_generated': False},
    {'name': 'src_port', 'label': '源端口', 'type': 'number', 'category': '网络-被动接收', 'required': False, 'auto_generated': False},
    {'name': 'dst_ip', 'label': '目标地址', 'type': 'string', 'category': '网络-被动接收', 'required': False, 'auto_generated': False},
    {'name': 'dst_port', 'label': '目标端口', 'type': 'number', 'category': '网络-被动接收', 'required': False, 'auto_generated': False},
    {'name': 'protocol', 'label': '协议', 'type': 'string', 'category': '网络-被动接收', 'required': False, 'auto_generated': False},
    {'name': 'hostname', 'label': '主机名', 'type': 'string', 'category': '资产-被动接收', 'required': False, 'auto_generated': False},
    {'name': 'username', 'label': '用户名', 'type': 'string', 'category': '身份-被动接收', 'required': False, 'auto_generated': False},
    
    # 原始数据（被动接收）
    {'name': 'raw_log', 'label': '原始日志', 'type': 'string', 'category': '原始数据-被动接收', 'required': False, 'auto_generated': False},
    {'name': 'parsed_data', 'label': '解析数据', 'type': 'json', 'category': '原始数据-被动接收', 'required': False, 'auto_generated': False},
    {'name': 'extra_data', 'label': '扩展数据', 'type': 'json', 'category': '原始数据-被动接收', 'required': False, 'auto_generated': False},
    
    # 规则和标签（被动接收）
    {'name': 'rule_id', 'label': '规则ID', 'type': 'string', 'category': '规则-被动接收', 'required': False, 'auto_generated': False},
    {'name': 'tags', 'label': '标签', 'type': 'json', 'category': '告警属性-被动接收', 'required': False, 'auto_generated': False},
    {'name': 'affected_assets', 'label': '受影响资产', 'type': 'json', 'category': '资产-被动接收', 'required': False, 'auto_generated': False},
    {'name': 'event_ids', 'label': '关联事件', 'type': 'json', 'category': '关联-被动接收', 'required': False, 'auto_generated': False},
]


def run_migration():
    app = create_app()

    with app.app_context():
        # 导入 StorageTable 模型
        from app.routes.storage_tables import StorageTable
        
        # 检查是否已存在安全告警存储表
        existing_table = StorageTable.query.filter(
            (StorageTable.name == 'alerts') | 
            (StorageTable.name == 'security_alerts')
        ).first()
        
        if existing_table:
            print(f"- 存储表已存在: {existing_table.name} (id={existing_table.id})")
            
            # 更新列定义（包含字段类型区分）
            existing_table.columns = SECURITY_ALERT_TABLE_COLUMNS
            existing_table.auto_created = True
            existing_table.created_by_pipeline = 'system'
            db.session.commit()
            print(f"✓ 已更新字段定义: {len(SECURITY_ALERT_TABLE_COLUMNS)} 个字段")
        else:
            # 创建新的安全告警存储表
            new_table = StorageTable(
                name='security_alerts',
                display_name='安全告警表',
                data_source='系统',
                log_type='security_alert',
                retention_days=90,
                partition_interval='1天',
                indexes=[
                    {'field': 'alert_code', 'type': 'btree'},
                    {'field': 'severity', 'type': 'btree'},
                    {'field': 'status', 'type': 'btree'},
                    {'field': 'first_seen', 'type': 'btree'},
                    {'field': 'src_ip', 'type': 'btree'}
                ],
                columns=SECURITY_ALERT_TABLE_COLUMNS,
                row_count=0,
                size='0 MB',
                compression=True,
                auto_created=True,
                created_by_pipeline='system'
            )
            db.session.add(new_table)
            db.session.commit()
            print(f"✓ 创建存储表: security_alerts (id={new_table.id})")
            
            # 创建一个名为 alerts 的别名表
            alerts_table = StorageTable(
                name='alerts',
                display_name='告警表(别名)',
                data_source='系统',
                log_type='security_alert',
                retention_days=90,
                partition_interval='1天',
                indexes=[],
                columns=SECURITY_ALERT_TABLE_COLUMNS,
                row_count=0,
                size='0 MB',
                compression=True,
                auto_created=True,
                created_by_pipeline='system'
            )
            db.session.add(alerts_table)
            db.session.commit()
            print(f"✓ 创建存储表别名: alerts (id={alerts_table.id})")

        print("\n迁移完成！")
        print("\n字段分类说明:")
        print("  - 系统-自动生成: 由系统自动填充，无需手动配置")
        print("  - *-被动接收: 需要通过解析管道或手动输入获取")


if __name__ == '__main__':
    print("=" * 60)
    print("添加安全告警系统存储表")
    print("=" * 60)
    run_migration()
    print("=" * 60)
