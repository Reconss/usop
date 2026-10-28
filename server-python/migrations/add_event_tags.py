"""events 表新增 tags 列（JSON），并从「资源管理 / IT 资源」IP 组
（ip_groups，usage=whitelist/blacklist）批量补打存量事件的黑白名单标签。

幂等：列已存在时跳过新增；回填只处理没有 ip: 前缀标签的事件。
用法：docker exec usop_all bash -c "cd /app && PYTHONPATH=/app python3 migrations/add_event_tags.py"
"""
import sys

from sqlalchemy import text

from app import create_app
from app.database import db


def ensure_column():
    """新增 tags JSON 列（若不存在）。"""
    db.session.execute(text(
        "ALTER TABLE events ADD COLUMN IF NOT EXISTS tags JSON"))
    db.session.commit()
    row = db.session.execute(text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name='events' AND column_name='tags'")).fetchone()
    print(f"[check] events.tags 存在: {bool(row)}")
    return bool(row)


def backfill():
    """从 IP 组批量补打存量事件的黑白名单标签（仅处理尚无 ip: 标签的事件）。"""
    from app.utils import event_ip_tags
    from app.models import Event

    pending = (Event.query
               .filter(text("(tags IS NULL OR json_array_length(tags) = 0 "
                            "OR tags::text NOT LIKE '%ip:%')"))
               .all())
    updated = 0
    for ev in pending:
        before = list(ev.tags or [])
        event_ip_tags.enrich_event_ip_tags(ev, commit=False)
        if list(ev.tags or []) != before:
            updated += 1
    db.session.commit()
    print(f"[backfill] 补打黑白名单标签的事件数: {updated} / 待处理 {len(pending)}")


def main():
    app = create_app()
    with app.app_context():
        if not ensure_column():
            print("[fail] tags 列创建失败")
            sys.exit(1)
        backfill()


if __name__ == '__main__':
    main()
