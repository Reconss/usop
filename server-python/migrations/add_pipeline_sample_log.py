"""
数据库迁移：为 pipelines 表添加 sample_log 列（模型 __init__.py Pipeline.sample_log）

缺列时 /api/pipelines 查询 500，导致数据源关联配置弹窗的解析管道下拉为空。
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from app.database import db


def run_migration():
    app = create_app()
    with app.app_context():
        conn = db.engine.raw_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'pipelines' AND column_name = 'sample_log'
        """)
        if not cursor.fetchone():
            cursor.execute("ALTER TABLE pipelines ADD COLUMN sample_log TEXT DEFAULT ''")
            conn.commit()
            print("✅ pipelines.sample_log 列已添加")
        else:
            print("⏭️  sample_log 列已存在，跳过")
        cursor.close()
        conn.close()


if __name__ == '__main__':
    run_migration()
