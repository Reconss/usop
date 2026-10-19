"""迁移：template_fields.key 从全局唯一改为 (category, key) 联合唯一。

背景：模板中心新增「告警表字段」「安全事件表字段」两个分类，key 直接采用
PostgreSQL 表列名（如 title/status/severity），与既有分类的同名字段共存，
因此唯一性维度从 key 单列改为 category+key 联合。

幂等：重复执行安全（约束不存在则跳过）。
"""
from sqlalchemy import text
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from app.database import db

app = create_app()

with app.app_context():
    # 1. 去掉旧的 key 全局唯一约束
    db.session.execute(text(
        "ALTER TABLE template_fields DROP CONSTRAINT IF EXISTS template_fields_key_key"))
    # 2. 增加 (category, key) 联合唯一约束
    db.session.execute(text(
        "ALTER TABLE template_fields DROP CONSTRAINT IF EXISTS uq_template_fields_category_key"))
    db.session.execute(text(
        "ALTER TABLE template_fields ADD CONSTRAINT uq_template_fields_category_key "
        "UNIQUE (category, key)"))
    db.session.commit()
    print('OK: template_fields 唯一约束已改为 (category, key) 联合唯一')
