"""剧本模型升级迁移：补齐编排图与生命周期字段。

背景：Playbook 此前是「存根类」，仅有 id/name/description/enabled/created_at/updated_at，
而 playbooks 表实际存在 nodes/edges/status/version 列，API 层却在构造 Playbook 时传入
这些关键字 → TypeError: 'nodes' is an invalid keyword argument for Playbook。
编排图因此完全无法持久化（创建即 500）。

本迁移幂等，可重复执行：
  - 补齐缺失列（nodes/edges/trigger_type/status/version/category/execution_count/last_executed_at）
  - 修正历史 name 列长度（100 → 160）
  - 为已有剧本回填默认值
"""
import os
import sys


DDL_STATEMENTS = [
    # 编排图：nodes 存画布节点（含 position/config），edges 存权威拓扑关系
    "ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS nodes json",
    "ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS edges json",
    "ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS trigger_type varchar(50)",
    # 生命周期：draft（草稿）/ published（已发布）/ archived（已归档）
    "ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS status varchar(20)",
    "ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS version varchar(20)",
    "ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS category varchar(50)",
    "ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS execution_count integer",
    "ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS last_executed_at timestamp",
    # 名称放宽，避免长剧本名被截断
    "ALTER TABLE playbooks ALTER COLUMN name TYPE varchar(160)",
]

BACKFILL_STATEMENTS = [
    "UPDATE playbooks SET nodes = '[]'::json WHERE nodes IS NULL",
    "UPDATE playbooks SET edges = '[]'::json WHERE edges IS NULL",
    "UPDATE playbooks SET trigger_type = '告警事件' WHERE trigger_type IS NULL OR trigger_type = ''",
    "UPDATE playbooks SET status = 'published' WHERE status IS NULL OR status = ''",
    "UPDATE playbooks SET version = '1.0' WHERE version IS NULL OR version = ''",
    "UPDATE playbooks SET category = '其他' WHERE category IS NULL OR category = ''",
    "UPDATE playbooks SET execution_count = 0 WHERE execution_count IS NULL",
]


def run(database_url: str = None):
    """执行迁移。database_url 形如 postgresql://user:pass@host:5432/db"""
    try:
        import psycopg2
    except ImportError:
        print("[迁移] 需要 psycopg2，容器内执行：pip install psycopg2-binary")
        return 1

    database_url = database_url or os.environ.get('DATABASE_URL')
    if not database_url:
        print("[迁移] 缺少 DATABASE_URL")
        return 1

    conn = psycopg2.connect(database_url)
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            for sql in DDL_STATEMENTS:
                try:
                    cur.execute(sql)
                    print(f"[迁移] OK  {sql}")
                except Exception as e:
                    conn.rollback()
                    print(f"[迁移] 跳过 {sql} → {e}")
                    conn.autocommit = False

            for sql in BACKFILL_STATEMENTS:
                try:
                    cur.execute(sql)
                    print(f"[迁移] 回填 OK  {sql.split('SET')[1].split('WHERE')[0].strip()}")
                except Exception as e:
                    conn.rollback()
                    print(f"[迁移] 回填跳过 → {e}")
                    conn.autocommit = False

        conn.commit()
        print("[迁移] 完成")
        return 0
    finally:
        conn.close()


if __name__ == '__main__':
    sys.exit(run(sys.argv[1] if len(sys.argv) > 1 else None))
