#!/usr/bin/env python
"""迁移脚本：为 pipelines 表添加 format_id 字段"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from app.database import db
from sqlalchemy import text

def migrate():
    app = create_app()
    with app.app_context():
        conn = db.engine.connect()
        
        # 检查列是否存在
        result = conn.execute(text('''
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'pipelines' AND column_name = 'format_id'
        '''))
        
        if result.fetchone() is None:
            sql = 'ALTER TABLE pipelines ADD COLUMN format_id VARCHAR(50)'
            conn.execute(text(sql))
            print('✓ 添加列 format_id 到 pipelines 表成功')
        else:
            print('- 列 format_id 已存在')
        
        conn.commit()
        conn.close()
        print('迁移完成!')

if __name__ == "__main__":
    migrate()
