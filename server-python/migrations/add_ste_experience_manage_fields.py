"""STE 经验库管理字段扩展 + AI 提示词表（ste_experiences / ai_prompts）

第 16 波：移植 EFF-Monitoring「AI 中心」的经验库与提示词管理。
- ste_experiences 增加经验编号 / 标题 / 标签 / 状态 / 来源 / 质量元信息 6 列，
  并回填历史行的 knowledge_id / title / status，避免存量经验在管理界面显示为空。
- ai_prompts 为新增表，由 db.create_all() 建；此处兜底再建一次（幂等）。

幂等：所有 ADD COLUMN 先探测 information_schema 再执行；CREATE TABLE 用 IF NOT EXISTS。
在容器内执行：
    docker exec usop_all python3 /app/migrations/add_ste_experience_manage_fields.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402

COLS = [
    ("knowledge_id", "VARCHAR(80)"),
    ("title", "VARCHAR(255)"),
    ("tags", "JSONB DEFAULT '[]'::jsonb"),
    ("status", "VARCHAR(40) DEFAULT 'published'"),
    ("source_type", "VARCHAR(20) DEFAULT 'manual'"),
    ("quality", "JSONB DEFAULT '{}'::jsonb"),
]

AI_PROMPTS_DDL = """
CREATE TABLE IF NOT EXISTS ai_prompts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    prompt_key VARCHAR(60) NOT NULL,
    category VARCHAR(60) DEFAULT '',
    description VARCHAR(300),
    system_prompt TEXT DEFAULT '',
    user_prompt TEXT DEFAULT '',
    variables JSONB DEFAULT '[]'::jsonb,
    output_schema JSONB DEFAULT '{}'::jsonb,
    enabled BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    builtin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT uq_ai_prompt_key_name UNIQUE (prompt_key, name)
)
"""


def upgrade():
    from app import create_app
    from app.database import db

    app = create_app()
    with app.app_context():
        # ---- 1. ai_prompts 兜底建表（create_all 通常已建） ----
        db.session.execute(text(AI_PROMPTS_DDL))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_ai_prompts_prompt_key ON ai_prompts (prompt_key)"
        ))
        db.session.commit()
        print('ai_prompts 表就绪')

        # ---- 2. ste_experiences 补列 ----
        existing = {
            r[0] for r in db.session.execute(text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'ste_experiences'"
            )).fetchall()
        }
        print(f'ste_experiences 现有列: {sorted(existing)}')

        added = []
        for name, ddl in COLS:
            if name in existing:
                print(f'  - {name} 已存在，跳过')
                continue
            db.session.execute(text(f'ALTER TABLE ste_experiences ADD COLUMN {name} {ddl}'))
            added.append(name)
            print(f'  + 新增列 {name} {ddl}')
        db.session.commit()
        print(f'完成，新增 {len(added)} 列: {added}')

        # ---- 3. 回填历史经验的管理字段（只在为空时写，幂等） ----
        db.session.execute(text(
            "UPDATE ste_experiences "
            "SET knowledge_id = 'STE-' || TO_CHAR(created_at, 'YYYYMMDD') || '-' || LPAD(id::text, 4, '0') "
            "WHERE knowledge_id IS NULL OR knowledge_id = ''"
        ))
        db.session.execute(text(
            "UPDATE ste_experiences "
            "SET title = COALESCE(NULLIF(signature, ''), NULLIF(conclusion, ''), category) "
            "WHERE title IS NULL OR title = ''"
        ))
        db.session.execute(text(
            "UPDATE ste_experiences SET status = 'published' WHERE status IS NULL OR status = ''"
        ))
        db.session.execute(text(
            "UPDATE ste_experiences SET source_type = 'auto' WHERE source_type IS NULL OR source_type = ''"
        ))
        db.session.commit()

        total = db.session.execute(text("SELECT COUNT(*) FROM ste_experiences")).scalar()
        prompts = db.session.execute(text("SELECT COUNT(*) FROM ai_prompts")).scalar()
        print(f'\nste_experiences 共 {total} 条（已回填管理字段）；ai_prompts 共 {prompts} 条')


if __name__ == '__main__':
    upgrade()
