"""
迁移：把「分流策略出口 topic + 分支输出路由」两层合并为单层「出口」

背景：分流策略的 pass_topic/filter_topic 已经把告警落到了具体 topic，
再让 OutputRoute 起第二个消费者读该 topic 再分发，属于重复的一跳。
合并后一条告警只投递一次，出口 = 分流策略的子项（分支 + 目标 topic + 可选字段模型）。

步骤（全部幂等）：
1) 补建 alert_exits 表（若 create_all 已建则跳过）
2) 把现有 alert_dispatch_policies 的 pass_topic/filter_topic 迁成两条出口
   （未过滤 → pass_topic；被过滤 → filter_topic）；已有出口的策略不重复迁
3) alert_dispatch_policies 删除 pass_topic / filter_topic 两列
4) alert_storage_routes 中源 topic = processed-alerts 的任务改为 valid-alerts
   （链路少一跳后，未过滤分支的默认出口就是 valid-alerts）
5) 删除 output_routes 表（分支输出路由已被出口取代）

无 Alembic，手动执行 upgrade()。执行前建议先备份：
  docker exec usop_all sh -c "python -c 'import subprocess'"
  或 pg_dump -U usop -d usop_security > backup.sql
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import db
from app import create_app


DDL_EXITS = """
CREATE TABLE IF NOT EXISTS alert_exits (
    id SERIAL PRIMARY KEY,
    policy_id INTEGER NOT NULL REFERENCES alert_dispatch_policies(id) ON DELETE CASCADE,
    name VARCHAR(160),
    branch VARCHAR(20) NOT NULL DEFAULT 'valid',
    target_topic VARCHAR(100) NOT NULL,
    template_id INTEGER,
    enabled BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_alert_exits_policy_id ON alert_exits (policy_id);
"""


def _columns(table: str):
    rows = db.session.execute(db.text(
        "SELECT column_name FROM information_schema.columns WHERE table_name = :t"
    ), {'t': table}).fetchall()
    return {r[0] for r in rows}


def _table_exists(table: str) -> bool:
    row = db.session.execute(db.text(
        "SELECT 1 FROM information_schema.tables WHERE table_name = :t"
    ), {'t': table}).fetchone()
    return bool(row)


def upgrade():
    app = create_app()
    with app.app_context():
        # 1) alert_exits 表
        for stmt in [s.strip() for s in DDL_EXITS.split(';') if s.strip()]:
            db.session.execute(db.text(stmt))
        db.session.commit()
        print('[migrate] alert_exits 表就绪')

        pol_cols = _columns('alert_dispatch_policies')

        # 2) 迁移旧的两个出口列 → 两条出口记录
        moved = 0
        if {'pass_topic', 'filter_topic'} <= pol_cols:
            rows = db.session.execute(db.text(
                "SELECT id, COALESCE(pass_topic, 'valid-alerts'), "
                "COALESCE(filter_topic, 'invalid-alerts') FROM alert_dispatch_policies"
            )).fetchall()
            for pid, pass_topic, filter_topic in rows:
                n = db.session.execute(db.text(
                    "SELECT COUNT(*) FROM alert_exits WHERE policy_id = :p"
                ), {'p': pid}).scalar()
                if n:
                    continue
                for branch, topic, label in (('valid', pass_topic, '未过滤分支出口（迁移自分流策略）'),
                                             ('filtered', filter_topic, '被过滤分支出口（迁移自分流策略）')):
                    db.session.execute(db.text(
                        "INSERT INTO alert_exits (policy_id, name, branch, target_topic, enabled, sort_order) "
                        "VALUES (:p, :n, :b, :t, TRUE, 0)"
                    ), {'p': pid, 'n': label, 'b': branch, 't': topic})
                    moved += 1
            db.session.commit()
            print(f'[migrate] 已迁移 {moved} 条出口记录')

            # 3) 删除已废弃的两列
            for col in ('pass_topic', 'filter_topic'):
                db.session.execute(db.text(
                    f"ALTER TABLE alert_dispatch_policies DROP COLUMN IF EXISTS {col}"
                ))
            db.session.commit()
            print('[migrate] 已删除 alert_dispatch_policies.pass_topic / filter_topic')
        else:
            print('[migrate] alert_dispatch_policies 无旧出口列，跳过（已迁移过）')

        # 4) 存储任务源 topic 对齐新的未过滤默认出口
        if _table_exists('alert_storage_routes'):
            res = db.session.execute(db.text(
                "UPDATE alert_storage_routes SET source_topic = 'valid-alerts' "
                "WHERE source_topic = 'processed-alerts'"
            ))
            db.session.commit()
            print(f'[migrate] 存储任务源 topic processed-alerts → valid-alerts：{res.rowcount} 条')

        # 5) 删除 output_routes 表
        if _table_exists('output_routes'):
            db.session.execute(db.text("DROP TABLE output_routes"))
            db.session.commit()
            print('[migrate] 已删除 output_routes 表')
        else:
            print('[migrate] output_routes 不存在，跳过')

    print('[migrate] merge_output_routes_into_exits: done')


if __name__ == '__main__':
    upgrade()
