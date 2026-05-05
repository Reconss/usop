"""
数据库迁移：添加 data_sources 表缺失的列
用于修复 API 查询错误：column data_sources.log_type_id does not exist
"""

import sys
import os

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from app.database import db

def run_migration():
    app = create_app()
    
    with app.app_context():
        conn = db.engine.raw_connection()
        cursor = conn.cursor()
        
        # 需要添加的列
        columns_to_add = [
            # 关联日志类型
            ("log_type_id", "VARCHAR(50)"),
            ("log_type_name", "VARCHAR(100)"),
            
            # 关联解析管道（多个）
            ("pipeline_ids", "JSON DEFAULT '[]'"),
            ("pipeline_names", "JSON DEFAULT '[]'"),
            
            # 关联格式模板
            ("format_template_id", "VARCHAR(50)"),
            ("format_template_name", "VARCHAR(100)"),
            
            # 存储配置
            ("storage_table_name", "VARCHAR(100)"),
            ("storage_retention_days", "INTEGER DEFAULT 90"),
            ("storage_partition", "VARCHAR(50) DEFAULT '1d'"),
            ("storage_compression", "BOOLEAN DEFAULT TRUE"),
            ("storage_indexes", "JSON DEFAULT '[]'"),
            
            # Flink 任务状态
            ("flink_job_id", "VARCHAR(100)"),
            ("flink_job_status", "VARCHAR(20) DEFAULT 'stopped'"),
            ("flink_last_heartbeat", "TIMESTAMP"),
        ]
        
        # 先检查表结构
        cursor.execute("""
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'data_sources'
        """)
        existing_columns = {row[0] for row in cursor.fetchall()}
        print(f"现有列: {existing_columns}")
        
        added_count = 0
        for col_name, col_type in columns_to_add:
            if col_name not in existing_columns:
                try:
                    sql = f"ALTER TABLE data_sources ADD COLUMN {col_name} {col_type}"
                    cursor.execute(sql)
                    print(f"✓ 添加列: {col_name} ({col_type})")
                    added_count += 1
                except Exception as e:
                    print(f"✗ 添加列失败 {col_name}: {e}")
            else:
                print(f"- 列已存在: {col_name}")
        
        conn.commit()
        
        # 验证结果
        cursor.execute("""
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'data_sources'
        """)
        new_columns = {row[0] for row in cursor.fetchall()}
        print(f"\n迁移后列数: {len(new_columns)}")
        print(f"新增列数: {added_count}")
        
        cursor.close()
        conn.close()
        
        return added_count

if __name__ == '__main__':
    print("=" * 50)
    print("开始数据库迁移...")
    print("=" * 50)
    count = run_migration()
    print("=" * 50)
    print(f"迁移完成！共添加 {count} 个列")
    print("=" * 50)
