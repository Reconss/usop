"""
数据源种子数据生成器
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from app.database import db
from app.models import DataSource
from datetime import datetime

def seed_data_sources():
    app = create_app()
    
    with app.app_context():
        # 检查是否已有数据源
        existing = DataSource.query.count()
        print(f"现有数据源数量: {existing}")
        
        if existing > 0:
            print("数据源已存在，跳过生成")
            return existing
        
        # 创建数据源
        data_sources = [
            {
                "name": "Kafka-安全日志",
                "protocol": "kafka",
                "source_type": "pull",
                "status": "active",
                "host": "kafka:29092",
                "port": 29092,
                "description": "从Kafka消费安全设备和应用产生的日志流",
                "message_count": 156729384,
                "log_type_id": None,
                "log_type_name": "安全日志",
                "storage_table_name": "logs_security",
                "storage_retention_days": 90,
                "storage_partition": "1d",
                "storage_compression": True,
            },
            {
                "name": "Syslog-网络设备",
                "protocol": "syslog",
                "source_type": "push",
                "status": "active",
                "host": "0.0.0.0",
                "port": 514,
                "description": "接收防火墙、路由器、交换机的Syslog日志",
                "message_count": 28473920,
                "log_type_id": None,
                "log_type_name": "网络设备日志",
                "storage_table_name": "logs_network",
                "storage_retention_days": 60,
                "storage_partition": "1d",
                "storage_compression": True,
            },
            {
                "name": "S3-审计日志",
                "protocol": "s3",
                "source_type": "pull",
                "status": "active",
                "host": "s3.amazonaws.com",
                "port": 443,
                "description": "从AWS S3拉取云服务的审计日志",
                "message_count": 89347291,
                "log_type_id": None,
                "log_type_name": "审计日志",
                "storage_table_name": "logs_audit",
                "storage_retention_days": 180,
                "storage_partition": "1d",
                "storage_compression": True,
            },
            {
                "name": "Webhook-告警推送",
                "protocol": "webhook",
                "source_type": "push",
                "status": "inactive",
                "host": "0.0.0.0",
                "port": 8080,
                "description": "接收第三方安全平台的告警推送",
                "message_count": 45238901,
                "log_type_id": None,
                "log_type_name": "告警日志",
                "storage_table_name": "logs_alerts",
                "storage_retention_days": 30,
                "storage_partition": "1h",
                "storage_compression": False,
            },
        ]
        
        for ds_data in data_sources:
            ds = DataSource(
                name=ds_data["name"],
                protocol=ds_data["protocol"],
                source_type=ds_data["source_type"],
                status=ds_data["status"],
                host=ds_data["host"],
                port=ds_data["port"],
                description=ds_data["description"],
                message_count=ds_data["message_count"],
                log_type_name=ds_data["log_type_name"],
                storage_table_name=ds_data["storage_table_name"],
                storage_retention_days=ds_data["storage_retention_days"],
                storage_partition=ds_data["storage_partition"],
                storage_compression=ds_data["storage_compression"],
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            db.session.add(ds)
            print(f"✓ 添加数据源: {ds_data['name']}")
        
        db.session.commit()
        
        total = DataSource.query.count()
        print(f"\n数据源生成完成！总数: {total}")
        return total

if __name__ == '__main__':
    print("=" * 50)
    print("开始生成数据源...")
    print("=" * 50)
    seed_data_sources()
    print("=" * 50)
