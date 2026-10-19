"""迁移：playbooks 表增加 approval_required 列（剧本级「执行需审批」配置）。

幂等：重复执行无副作用。用法（容器内）：
    python migrations/add_playbook_approval_required.py
"""
import sqlalchemy as sa
from sqlalchemy import inspect

from app import create_app
from app.database import db

DDL = sa.text("""
ALTER TABLE playbooks
    ADD COLUMN IF NOT EXISTS approval_required BOOLEAN NOT NULL DEFAULT FALSE
""")

if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        db.session.execute(DDL)
        db.session.commit()
        has = inspect(db.engine).has_column('playbooks', 'approval_required')
        print(f"OK: playbooks.approval_required exists = {has}")
