"""
迁移：存储任务去掉 PostgreSQL 镜像同步（alert_storage_routes.write_pg）

背景：告警持久化统一到 Elasticsearch —— 存储任务只把 Kafka 消息幂等写入指定 ES
索引，不再同步写 PostgreSQL alerts 表；安全告警工作台改为直接读取 ES 的
valid 索引（alerts-valid）。因此 write_pg 开关连同其运行时行为一并删除。

本脚本幂等：列不存在则跳过。无 Alembic，需手动执行。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import db
from app import create_app


def upgrade():
    app = create_app()
    with app.app_context():
        db.session.execute(db.text(
            "ALTER TABLE alert_storage_routes DROP COLUMN IF EXISTS write_pg;"
        ))
        db.session.commit()

        cols = db.session.execute(db.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'alert_storage_routes' ORDER BY ordinal_position"
        )).fetchall()
        print("[migrate] alert_storage_routes 现有列:",
              [c[0] for c in cols])
    print("[migrate] alert_storage_routes: 已移除 write_pg（告警只写 ES）")


if __name__ == '__main__':
    upgrade()
