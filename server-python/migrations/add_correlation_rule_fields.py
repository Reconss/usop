"""关联分析规则表扩展（correlation_rules）

第 16 波：把 correlation_rules 从「单一频次阈值」扩展为支持常规分析手段
（frequency / distinct / aggregation / sequence），并支持自定义事件标题/分类与专属参数 config。

幂等：所有 ADD COLUMN / ALTER TYPE 都带 IF NOT EXISTS 语义（先探测再执行）。
在容器内执行：
    docker exec usop_all python3 /app/migrations/add_correlation_rule_fields.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402

COLS = [
    ("analysis_type", "VARCHAR(20) NOT NULL DEFAULT 'frequency'"),
    ("source_topic", "VARCHAR(100) NOT NULL DEFAULT 'valid-alerts'"),
    ("event_title", "VARCHAR(200)"),
    ("event_category", "VARCHAR(50) DEFAULT 'correlation'"),
    ("description", "VARCHAR(300)"),
    ("config", "JSONB NOT NULL DEFAULT '{}'::jsonb"),
    ("updated_at", "TIMESTAMP"),
]


def upgrade():
    from app import create_app
    from app.database import db

    app = create_app()
    with app.app_context():
        existing = {
            r[0] for r in db.session.execute(text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'correlation_rules'"
            )).fetchall()
        }
        print(f'现有列: {sorted(existing)}')

        added = []
        for name, ddl in COLS:
            if name in existing:
                print(f'  - {name} 已存在，跳过')
                continue
            db.session.execute(text(f'ALTER TABLE correlation_rules ADD COLUMN {name} {ddl}'))
            added.append(name)
            print(f'  + 新增列 {name} {ddl}')

        # field 由 varchar(40) 放宽到 varchar(60)（新增 hostname/operation 等分组维度）
        db.session.execute(text(
            "ALTER TABLE correlation_rules ALTER COLUMN field TYPE VARCHAR(60)"
        ))
        # threshold 由 int 放宽到 double precision（聚合统计类规则需要小数阈值）
        db.session.execute(text(
            "ALTER TABLE correlation_rules ALTER COLUMN threshold TYPE DOUBLE PRECISION"
        ))
        db.session.commit()
        print(f'完成，新增 {len(added)} 列: {added}')

        rows = db.session.execute(text(
            "SELECT id, name, analysis_type, source_topic, field, window_seconds, "
            "threshold, severity, enabled FROM correlation_rules ORDER BY id"
        )).fetchall()
        print(f'\n现有规则 {len(rows)} 条:')
        for r in rows:
            print(f'  #{r[0]} {r[1]} [{r[2]}] topic={r[3]} group={r[4]} '
                  f'window={r[5]}s thr={r[6]} sev={r[7]} enabled={r[8]}')


if __name__ == '__main__':
    upgrade()
