# -*- coding: utf-8 -*-
"""迁移：IP 黑白名单（ip_lists）合并进资源管理 IP 组（ip_groups）。

1. ip_groups 表补 usage 列（general/blacklist/whitelist，默认 general）
2. 把 ip_lists + ip_list_items 数据迁入 ip_groups + ip_group_items：
   - list_type 'black' → usage='blacklist'；'white' → usage='whitelist'
   - 组名冲突时加前缀「[黑名单] 」/「[白名单] 」
   - 条目 value 原样迁移（ip_match 支持 简写范围，匹配逻辑同源）
3. 迁移完成后 ip_lists 表保留不再使用（模型已从 create_all 移除）

用法（容器内）: PYTHONPATH=/app python migrations/merge_ip_lists_into_groups.py
"""
import sys

sys.path.insert(0, '/app')

from app import create_app
from app.database import db
from sqlalchemy import text


def column_exists(conn, table, column):
    r = conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_schema='usop_security' AND table_name=:t AND column_name=:c"),
        {'t': table, 'c': column})
    return (r.scalar() or 0) > 0


def main():
    app = create_app()
    with app.app_context():
        conn = db.engine.connect()
        if not column_exists(conn, 'ip_groups', 'usage'):
            conn.execute(text("ALTER TABLE ip_groups ADD COLUMN usage VARCHAR(20) NOT NULL DEFAULT 'general'"))
            conn.commit()
            print("✓ ip_groups 添加 usage 列")
        else:
            print("· ip_groups.usage 已存在，跳过")

        # 检查旧表是否存在数据
        try:
            old_lists = conn.execute(text("SELECT id, name, description, list_type FROM ip_lists ORDER BY id")).fetchall()
        except Exception:
            print("· ip_lists 表不存在，无数据可迁移")
            conn.close()
            return
        if not old_lists:
            print("· ip_lists 无数据，跳过迁移")
            conn.close()
            return

        migrated = skipped = 0
        for lid, name, desc, ltype in old_lists:
            usage = 'whitelist' if str(ltype).startswith('w') else 'blacklist'
            prefix = '[白名单] ' if usage == 'whitelist' else '[黑名单] '
            target_name = name if name else f'{prefix.strip()} #{lid}'
            # 组名冲突（与现有组或其他迁移组）则加前缀
            exists = conn.execute(text("SELECT COUNT(*) FROM ip_groups WHERE name=:n"),
                                  {'n': target_name}).scalar()
            if exists:
                target_name = f'{prefix}{name}'
                exists2 = conn.execute(text("SELECT COUNT(*) FROM ip_groups WHERE name=:n"),
                                       {'n': target_name}).scalar()
                if exists2:
                    skipped += 1
                    print(f"  ! 跳过重名组: {target_name}")
                    continue
            conn.execute(text(
                "INSERT INTO ip_groups (name, description, usage, created_at) "
                "VALUES (:n, :d, :u, NOW())"),
                {'n': target_name, 'd': (desc or ''), 'u': usage})
            new_id = conn.execute(text("SELECT id FROM ip_groups WHERE name=:n"),
                                  {'n': target_name}).scalar()
            items = conn.execute(text(
                "SELECT value, note FROM ip_list_items WHERE list_id=:l ORDER BY id"),
                {'l': lid}).fetchall()
            n = 0
            for value, note in items:
                v = (value or '').strip()
                if not v:
                    continue
                conn.execute(text(
                    "INSERT INTO ip_group_items (group_id, entry, remark, created_at) "
                    "VALUES (:g, :e, :r, NOW())"),
                    {'g': new_id, 'e': v, 'r': (note or '')})
                n += 1
            migrated += 1
            print(f"  ✓ [{ltype}] {name} → {target_name}（{n} 条）")
        conn.commit()
        conn.close()
        print(f"完成：迁移 {migrated} 组，跳过 {skipped} 组（重名）。ip_lists 表已停用，可择期人工清理。")


if __name__ == '__main__':
    main()
