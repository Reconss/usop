"""
迁移：ParseProfile（parse_profiles 表）新增 parser_config 列

背景：日志解析需要借鉴旧版解析通道（app/utils/parser.py）的 CSV / KeyValue / Grok
等解析器，这些解析器需要额外配置：
  csv      → {headers: [...], delimiter: ','}
  keyvalue → {delimiter: ' '}
  grok     → {pattern: '%{IPV4:src_ip} ...'}
对标旧版 PipelineConfig.parser_config。

幂等：列已存在则跳过。无 Alembic，手动执行；也可由部署脚本统一调用 upgrade()。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import db
from app import create_app


def upgrade():
    app = create_app()
    with app.app_context():
        db.session.execute(db.text(
            "ALTER TABLE parse_profiles ADD COLUMN IF NOT EXISTS parser_config JSON DEFAULT '{}'::json;"
        ))
        db.session.commit()
        db.session.execute(db.text(
            "UPDATE parse_profiles SET parser_config = '{}'::json WHERE parser_config IS NULL;"
        ))
        db.session.commit()
    print("[migrate] parse_profiles: ensured column parser_config exists")


if __name__ == '__main__':
    upgrade()
