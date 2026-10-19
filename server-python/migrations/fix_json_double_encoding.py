"""修复 JSON 列「双重编码」（历史种子数据把 JSON 数组/对象序列化成字符串落库）

背景（第 16 波排查到的问题）：
    早期 seed_data.py 用 `json.dumps([1, 2])` 往 db.JSON 列里写值。SQLAlchemy 的
    JSON 类型会再序列化一次，于是 PG 里实际存的是一个 JSON **字符串** `"[1, 2]"`，
    而不是 JSON 数组 `[1, 2]`。后端 `to_dict()` 原样返回，前端拿到字符串后调用
    `.filter()` 抛 `TypeError: (e.dataSourceIds || []).filter is not a function`，
    React 18 直接卸载整棵树 —— 「响应与自动化 → 规则管理」整页白屏。

受影响列（扫描时实测）：
    detection_rules.data_source_ids   4/4      行
    detection_rules.tags              4/4      行
    event_actions.extra_data          6410/6480 行

处理方式：
    仅当 `jsonb_typeof(col) = 'string'` **且** 字符串内容能被 json.loads 解析成
    数组/对象时才转换（其余原样保留，不做破坏性改写）。脚本可重复执行（幂等）。

在容器内执行：
    docker exec usop_all python3 /app/migrations/fix_json_double_encoding.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402

TARGETS = [
    ('detection_rules', 'data_source_ids', list),
    ('detection_rules', 'tags', list),
    ('event_actions', 'extra_data', dict),
]


def rediscover_targets(engine):
    """扫描所有 json/jsonb 列，返回存在「JSON 字符串」行的列清单。"""
    with engine.connect() as conn:
        cols = conn.execute(text("""
            SELECT table_name, column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND data_type IN ('json', 'jsonb')
            ORDER BY table_name, column_name
        """)).fetchall()

    found = []
    with engine.connect() as conn:
        for table, col in cols:
            try:
                n = conn.execute(text(
                    f'SELECT count(*) FROM "{table}" '
                    f"WHERE jsonb_typeof(\"{col}\"::jsonb) = 'string'"
                )).scalar()
            except Exception:
                conn.rollback()
                continue
            if n:
                found.append((table, col, n))
    return found


def fix_column(engine, table, col, expect_type):
    """把该列中「本身是 JSON 字符串、且内容可解析为 expect_type」的值还原成真 JSON。"""
    with engine.connect() as conn:
        rows = conn.execute(text(
            f'SELECT ctid, "{col}" FROM "{table}" '
            f"WHERE jsonb_typeof(\"{col}\"::jsonb) = 'string'"
        )).fetchall()

    fixed, skipped = 0, 0
    with engine.begin() as conn:
        for ctid, raw in rows:
            if not isinstance(raw, str):
                # SQLAlchemy 已自动解出对象，跳过
                skipped += 1
                continue
            s = raw.strip()
            try:
                parsed = json.loads(s)
            except (ValueError, TypeError):
                skipped += 1
                continue
            if not isinstance(parsed, expect_type):
                skipped += 1
                continue
            conn.execute(
                text(f'UPDATE "{table}" SET "{col}" = CAST(:v AS jsonb) WHERE ctid = :c'),
                {'v': json.dumps(parsed, ensure_ascii=False), 'c': ctid},
            )
            fixed += 1
    return fixed, skipped


def main():
    from app import create_app
    from app.database import db

    app = create_app()
    with app.app_context():
        engine = db.engine

        print('== 修复前扫描 ==')
        before = rediscover_targets(engine)
        if not before:
            print('  未发现 JSON 双重编码，无需处理')
            return
        for t, c, n in before:
            print(f'  {t}.{c}: {n} 行')

        print('\n== 执行修复 ==')
        total_fixed = 0
        for t, c, expect in TARGETS:
            try:
                fixed, skipped = fix_column(engine, t, c, expect)
            except Exception as e:
                print(f'  !! {t}.{c} 修复失败: {e}')
                continue
            total_fixed += fixed
            print(f'  {t}.{c}: 转换 {fixed} 行，跳过 {skipped} 行')
        print(f'  合计转换 {total_fixed} 行')

        print('\n== 修复后复核 ==')
        after = rediscover_targets(engine)
        if not after:
            print('  ✓ 全库已无 JSON 双重编码')
        else:
            for t, c, n in after:
                print(f'  ⚠ {t}.{c}: 仍有 {n} 行（内容非 JSON 结构，已按原样保留）')

        # 抽样打印，便于人工确认
        with engine.connect() as conn:
            row = conn.execute(text(
                "SELECT id, data_source_ids, tags FROM detection_rules ORDER BY id LIMIT 2"
            )).fetchall()
            for r in row:
                print(f'  样例 detection_rules {r[0]}: data_source_ids={r[1]!r} tags={r[2]!r}')


if __name__ == '__main__':
    main()
