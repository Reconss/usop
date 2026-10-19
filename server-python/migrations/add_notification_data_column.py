"""
数据库迁移：通知中心修复（2026-10-17）
1. notifications 表补充 data JSON 列（审批载荷 approval_id 等）
2. playbook_approvals 表补齐 engine 代码所需的缺失列
幂等：列已存在则跳过。
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from app.database import db

# playbook_approvals 缺失列: (列名, 类型)
APPROVAL_COLUMNS = [
    ('execution_id', 'VARCHAR(64)'),
    ('approval_type', 'VARCHAR(50)'),
    ('approval_level', 'INTEGER'),
    ('requester_id', 'INTEGER'),
    ('requester_name', 'VARCHAR(100)'),
    ('params', 'JSON'),
    ('reason', 'VARCHAR(500)'),
    ('related_event_id', 'VARCHAR(64)'),
    ('approver_name', 'VARCHAR(100)'),
    ('approved_at', 'TIMESTAMP'),
    ('result', 'JSON'),
]


def run_migration():
    app = create_app()

    with app.app_context():
        conn = db.engine.raw_connection()
        cursor = conn.cursor()

        # 1) notifications.data
        cursor.execute("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'notifications' AND column_name = 'data'
        """)
        if not cursor.fetchone():
            cursor.execute("ALTER TABLE notifications ADD COLUMN data JSON")
            print("✓ 添加列: notifications.data (JSON)")
        else:
            print("- 列已存在，跳过: notifications.data")

        # 2) playbook_approvals 缺失列
        for col, col_type in APPROVAL_COLUMNS:
            cursor.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'playbook_approvals' AND column_name = %s
            """, (col,))
            if not cursor.fetchone():
                cursor.execute(f"ALTER TABLE playbook_approvals ADD COLUMN {col} {col_type}")
                print(f"✓ 添加列: playbook_approvals.{col} ({col_type})")
            else:
                print(f"- 列已存在，跳过: playbook_approvals.{col}")

        conn.commit()
        cursor.close()
        conn.close()


if __name__ == '__main__':
    run_migration()
