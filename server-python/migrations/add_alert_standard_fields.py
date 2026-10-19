"""
迁移：Alert 模型新增标准告警字段 alert_log_id / operation

对应 USOP 标准告警字段规范（alert log ID / status / operation 为核心标准字段）：
- alert_log_id: 关联原始日志/事件ID，用于回链原始日志源（Kafka 原始日志、SIEM 事件 ID 等）
- operation:    操作/动作类型代码（如 detect / investigate / block），表征该告警对应的操作类型

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
            "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS alert_log_id varchar(120);"
        ))
        db.session.execute(db.text(
            "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS operation varchar(50);"
        ))
        db.session.commit()
    print("[migrate] alerts: ensured columns alert_log_id, operation exist")


if __name__ == '__main__':
    upgrade()
