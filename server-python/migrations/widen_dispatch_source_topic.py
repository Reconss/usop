"""迁移：alert_dispatch_policies.source_topic 加宽到 varchar(512)，支持逗号分隔多来源 topic。

幂等：重复执行无副作用。用法（容器内）：
    python migrations/widen_dispatch_source_topic.py
"""
import sqlalchemy as sa

from app import create_app
from app.database import db

DDL = sa.text("""
ALTER TABLE alert_dispatch_policies
    ALTER COLUMN source_topic TYPE varchar(512)
""")

if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        db.session.execute(DDL)
        db.session.commit()
        print('OK: alert_dispatch_policies.source_topic -> varchar(512)')
