"""
迁移：users 表增加 AD 域认证字段（幂等）
- auth_type: 账号来源 local/ad
- ad_upn:    域登录名（UPN 或 sAMAccountName）
- ad_domain: 域名（如 corp.com）
- ad_synced_at: 最近一次 AD 信息同步时间

用法（容器内）:
  PYTHONPATH=/app python3 migrations/add_user_ad_fields.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from app.database import db


def column_exists(conn, table, column):
    sql = """
        SELECT 1 FROM information_schema.columns
        WHERE table_name = :t AND column_name = :c
    """
    res = conn.execute(db.text(sql), {'t': table, 'c': column})
    return res.fetchone() is not None


def main():
    app = create_app()
    with app.app_context():
        conn = db.engine.connect()
        added = []
        ddl = [
            ("auth_type", "ALTER TABLE users ADD COLUMN auth_type VARCHAR(10) DEFAULT 'local'"),
            ("ad_upn", "ALTER TABLE users ADD COLUMN ad_upn VARCHAR(120)"),
            ("ad_domain", "ALTER TABLE users ADD COLUMN ad_domain VARCHAR(120)"),
            ("ad_synced_at", "ALTER TABLE users ADD COLUMN ad_synced_at TIMESTAMP"),
        ]
        for col, stmt in ddl:
            if not column_exists(conn, 'users', col):
                conn.execute(db.text(stmt))
                added.append(col)

        # 存量账号默认 local
        conn.execute(db.text("UPDATE users SET auth_type = 'local' WHERE auth_type IS NULL"))
        conn.commit()
        conn.close()

        print('added columns:', added or 'none (already exist)')
        print('OK')


if __name__ == '__main__':
    main()
