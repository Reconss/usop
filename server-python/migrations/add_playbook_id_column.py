"""
数据库迁移：添加 detection_rules 表的 playbook_id 列
用于存储规则关联的剧本ID
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

        # 检查 playbook_id 列是否存在
        cursor.execute("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'detection_rules' AND column_name = 'playbook_id'
        """)
        if not cursor.fetchone():
            try:
                cursor.execute("ALTER TABLE detection_rules ADD COLUMN playbook_id VARCHAR(50)")
                print("✓ 添加列: playbook_id (VARCHAR(50))")
            except Exception as e:
                print(f"✗ 添加列失败: {e}")
        else:
            print("- 列已存在: playbook_id")

        conn.commit()
        cursor.close()
        conn.close()

        print("\n迁移完成！")


if __name__ == '__main__':
    print("=" * 50)
    print("添加 detection_rules.playbook_id 列")
    print("=" * 50)
    run_migration()
    print("=" * 50)
