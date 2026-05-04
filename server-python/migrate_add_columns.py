#!/usr/bin/env python
"""
数据库迁移脚本 - 为 data_sources 表添加新字段
运行方式: python migrate_add_columns.py
"""
import os
import sys

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from app.database import db
from sqlalchemy import text

def migrate():
    app = create_app()
    
    with app.app_context():
        conn = db.engine.connect()
        
        # 要添加的字段
        migrations = [
            ("protocol", "VARCHAR(50)"),
            ("source_type", "VARCHAR(20)"),
            ("read_position", "JSON DEFAULT '{}'"),
            ("last_read_at", "TIMESTAMP"),
            ("last_error", "TEXT"),
        ]
        
        for column_name, column_type in migrations:
            try:
                # 检查列是否已存在
                result = conn.execute(text(f"""
                    SELECT column_name FROM information_schema.columns 
                    WHERE table_name = 'data_sources' AND column_name = '{column_name}'
                """))
                
                if result.fetchone() is None:
                    # 添加列
                    sql = f"ALTER TABLE data_sources ADD COLUMN {column_name} {column_type}"
                    conn.execute(text(sql))
                    print(f"✓ 添加列 {column_name} 成功")
                else:
                    print(f"- 列 {column_name} 已存在，跳过")
            except Exception as e:
                print(f"✗ 添加列 {column_name} 失败: {e}")
        
        conn.commit()
        conn.close()
        print("\n迁移完成!")

if __name__ == "__main__":
    migrate()
