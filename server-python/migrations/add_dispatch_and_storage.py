"""
迁移：告警「过滤 + 输出」重新设计 与 Kafka→ES 可配置存储

⚠️ 已被 migrations/merge_output_routes_into_exits.py 取代（出口合并为单层后，
   本脚本引用的 output_routes / pass_topic / filter_topic 均已不存在），仅作历史记录保留，请勿再执行。

1) output_routes 新增 branch 列（valid/filtered/all，默认 valid）
   —— 输出路由作用于哪个分流分支；历史数据保持 valid，等价旧行为（只分发有效告警）。
2) 新建 alert_dispatch_policies 表（分流策略：来源 topic → 未过滤出口 / 被过滤出口）
3) 新建 alert_storage_routes 表（Kafka topic → ES 索引的存储任务）
4) 播种默认分流策略：全局 '*' → 未过滤 valid-alerts / 被过滤 invalid-alerts
   （等价于历史写死的双出口，保证升级后行为不回退）

幂等：列/表已存在则跳过；策略已存在不重复插入。无 Alembic，手动执行 upgrade()。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import db
from app import create_app


def upgrade():
    app = create_app()
    with app.app_context():
        # 1) output_routes.branch
        db.session.execute(db.text(
            "ALTER TABLE output_routes ADD COLUMN IF NOT EXISTS branch VARCHAR(20) NOT NULL DEFAULT 'valid';"
        ))
        db.session.commit()
        db.session.execute(db.text(
            "UPDATE output_routes SET branch = 'valid' WHERE branch IS NULL OR branch = '';"
        ))
        db.session.commit()

        # 2)(3) 新表：已注册模型时由 create_all 补建（幂等）
        from app.alert_pipeline.pipeline import (AlertDispatchPolicy, AlertStorageRoute,
                                                 TOPIC_VALID, TOPIC_INVALID, TOPIC_PROCESSED,
                                                 INDEX_VALID, INDEX_INVALID)
        db.create_all()
        db.session.commit()

        # 4) 默认分流策略（与内置默认一致，便于页面可读、可被用户接管修改）
        if AlertDispatchPolicy.query.count() == 0:
            db.session.add(AlertDispatchPolicy(
                name='默认分流（全局）', source_topic='*',
                pass_topic=TOPIC_VALID, filter_topic=TOPIC_INVALID,
                dedup_enabled=True, whitelist_enabled=True, enabled=True, sort_order=0))
            db.session.commit()
            print("[migrate] 已播种默认分流策略")

        # 存储任务：首次播种内置双任务（存储监督线程亦会兜底，这里提前落库便于立即可见）
        if AlertStorageRoute.query.count() == 0:
            db.session.add(AlertStorageRoute(
                name='有效告警存储（系统）', source_topic=TOPIC_PROCESSED,
                index_name=INDEX_VALID, id_field='alert_id', write_pg=True,
                description='消费处理后 topic，写入 ES alerts-valid，并镜像同步告警工作台'))
            db.session.add(AlertStorageRoute(
                name='无效告警隔离存储（系统）', source_topic=TOPIC_INVALID,
                index_name=INDEX_INVALID, id_field='alert_id', write_pg=False,
                description='被过滤/重复的告警隔离索引，供审计回溯'))
            db.session.commit()
            print("[migrate] 已播种内置存储任务 2 条")

    print("[migrate] dispatch/storage: done")


if __name__ == '__main__':
    upgrade()
