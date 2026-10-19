"""
数据库迁移：为 alert_templates 表添加 auto_render 列（入库时自动渲染模板）

告警入库(Kafka 消费)/事件创建时，自动渲染 auto_render=True 且场景匹配的
启用模板，结果写入 extra_data.rendered_templates。
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

        # 检查 auto_render 列是否存在
        cursor.execute("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'alert_templates' AND column_name = 'auto_render'
        """)
        if not cursor.fetchone():
            try:
                cursor.execute("""
                    ALTER TABLE alert_templates
                    ADD COLUMN auto_render BOOLEAN NOT NULL DEFAULT FALSE
                """)
                conn.commit()
                print("✅ alert_templates.auto_render 列已添加")
            except Exception as e:
                conn.rollback()
                print(f"❌ 添加 auto_render 列失败: {e}")
                raise
        else:
            print("⏭️  auto_render 列已存在，跳过")

        cursor.close()
        conn.close()


if __name__ == '__main__':
    run_migration()
