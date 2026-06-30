#!/usr/bin/env python3
"""
TimescaleDB → Elasticsearch 告警数据迁移脚本

将 TimescaleDB alerts 表中的数据批量迁移到 ES usop-alerts-write 索引。

用法:
    python scripts/migrate_tsdb_to_es.py              # 全部迁移
    python scripts/migrate_tsdb_to_es.py --batch 500  # 每批500条
    python scripts/migrate_tsdb_to_es.py --days 7     # 仅迁移最近7天
"""
import sys
import os
import argparse
import logging
from datetime import datetime, timedelta

# 设置项目路径
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'server-python'))
os.environ.setdefault('DATABASE_URL', 'postgresql://usop:usop_password@localhost:5432/usop_security')

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger('migrate')


def migrate(batch_size: int = 500, days: int | None = None):
    """将 TimescaleDB alerts 数据迁移到 ES"""

    # 1. 连接 TimescaleDB
    from app.timescaledb import get_tsdb
    from sqlalchemy import text as sa_text

    tsdb = get_tsdb()
    tsess = tsdb.get_session()
    logger.info("✅ 已连接 TimescaleDB")

    # 2. 连接 ES
    from app.es_alert_store import es_store

    if not es_store.connected:
        logger.error("❌ ES 未连接，请先启动 ES")
        tsdb.close_session(tsess)
        return 1

    logger.info("✅ 已连接 Elasticsearch")

    # 3. 确保 ES 索引已创建
    es_store.init_all()
    logger.info("✅ ES 索引就绪")

    # 4. 统计源数据量
    count_query = sa_text("SELECT COUNT(*) FROM alerts")
    params = {}

    if days:
        since = (datetime.utcnow() - timedelta(days=days)).strftime('%Y-%m-%d')
        count_query = sa_text("SELECT COUNT(*) FROM alerts WHERE first_seen >= :since")
        params['since'] = since
        logger.info(f"📋 迁移范围: 最近 {days} 天 (since {since})")

    total = tsess.execute(count_query, params).scalar()
    if not total:
        logger.info("📭 TimescaleDB 中没有告警数据，无需迁移")
        tsdb.close_session(tsess)
        return 0

    logger.info(f"📋 待迁移告警总数: {total}")

    # 5. 分页迁移
    migrated = 0
    errors = 0
    page = 0

    while page * batch_size < total:
        offset = page * batch_size

        data_query = sa_text(f"""
            SELECT * FROM alerts
            ORDER BY first_seen ASC
            LIMIT :limit OFFSET :offset
        """)
        data_params = {'limit': batch_size, 'offset': offset}
        if days:
            data_query = sa_text(f"""
                SELECT * FROM alerts
                WHERE first_seen >= :since
                ORDER BY first_seen ASC
                LIMIT :limit OFFSET :offset
            """)
            data_params['since'] = since
            data_params['limit'] = batch_size
            data_params['offset'] = offset

        rows = tsess.execute(data_query, data_params).fetchall()

        batch = []
        for row in rows:
            d = dict(row._mapping)

            # 类型转换：PostgreSQL datetime → ISO 字符串
            for field in ('first_seen', 'last_seen', 'created_at', 'updated_at'):
                if d.get(field) and hasattr(d[field], 'isoformat'):
                    d[field] = d[field].isoformat()

            # 转换 JSON 字段
            for field in ('affected_assets', 'event_ids', 'extra_data', 'tags'):
                if d.get(field) is None:
                    d[field] = [] if field != 'extra_data' else {}
                elif not isinstance(d[field], (list, dict)):
                    import json
                    try:
                        d[field] = json.loads(d[field]) if isinstance(d[field], str) else d[field]
                    except (json.JSONDecodeError, TypeError):
                        d[field] = [] if field != 'extra_data' else {}

            # 确保 id 是整数
            if 'id' in d and d['id'] is not None:
                d['id'] = int(d['id'])

            batch.append(d)

        # 批量写入 ES
        if batch:
            count = es_store.bulk_insert(batch)
            migrated += count
            errors += len(batch) - count

        page += 1
        progress = min(100, int((page * batch_size) / total * 100))
        logger.info(f"  进度: {progress}% ({migrated}/{total})")

    tsdb.close_session(tsess)

    # 6. 刷新 ES 索引
    try:
        es_store.client.indices.refresh(index=es_store.write_alias)
        logger.info("✅ ES 索引已刷新")
    except Exception:
        pass

    logger.info(f"✅ 迁移完成! 成功: {migrated}, 失败: {errors}, 跳过 TSDB 旧数据: {total - migrated - errors}")
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='TimescaleDB → ES 告警数据迁移')
    parser.add_argument('--batch', type=int, default=500, help='每批处理数量（默认 500）')
    parser.add_argument('--days', type=int, default=None, help='仅迁移最近 N 天数据')
    args = parser.parse_args()
    sys.exit(migrate(batch_size=args.batch, days=args.days))
