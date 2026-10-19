"""
数据库迁移：为 alerts 表添加 dedup_hash 列（告警幂等去重指纹）

借鉴 EFF-Monitoring：Kafka 入流前按身份字段计算 sha256[:32] 指纹，
时间窗口内命中指纹则刷新既有告警而非重复插入。
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

        # 检查 dedup_hash 列是否存在
        cursor.execute("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'alerts' AND column_name = 'dedup_hash'
        """)
        if not cursor.fetchone():
            try:
                cursor.execute("ALTER TABLE alerts ADD COLUMN dedup_hash VARCHAR(32)")
                cursor.execute("CREATE INDEX ix_alerts_dedup_hash ON alerts (dedup_hash)")
                print("✓ 添加列: dedup_hash (VARCHAR(32)) + 索引")
            except Exception as e:
                print(f"✗ 添加列失败: {e}")
        else:
            print("- 列已存在: dedup_hash")

        conn.commit()
        cursor.close()
        conn.close()

        print("\n迁移完成！")


if __name__ == '__main__':
    print("=" * 50)
    print("添加 alerts.dedup_hash 列")
    print("=" * 50)
    run_migration()
    print("=" * 50)
