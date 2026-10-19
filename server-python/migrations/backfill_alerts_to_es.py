"""
迁移：告警持久化统一到 Elasticsearch

背景
----
告警不再同步写入 PostgreSQL：
  - 流水线存储任务只把 Kafka 消息写入指定 ES 索引（去掉 write_pg 开关）
  - 安全告警工作台 / 协作认领 / AI 研判统一读写 ES `alerts-valid`

本脚本完成三件事（幂等、可重复执行）：
  1. 备份现有 ES `alerts-valid` / `alerts-invalid` 全部文档到 JSON 文件
  2. 按 app/utils/es_alerts.py 的完整显式映射重建两个索引
     （旧索引是动态映射，severity/status 等字段是 text，term 精确匹配会失效）
  3. 把 PostgreSQL `alerts` 表的数据回灌到 `alerts-valid`
     （补 processing_status=NORMAL / dispatch_branch=valid / dispatch_policy=历史回灌），
     再把备份里 PG 没有的 ES 文档合并回去（不丢数据）
  4. 清空 PostgreSQL `alerts` 表（--keep-pg 可跳过）

用法（容器内）::

    python migrations/backfill_alerts_to_es.py            # 回灌 + 清空
    python migrations/backfill_alerts_to_es.py --keep-pg  # 回灌但保留 PG 数据
"""
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from app.database import db
from app.utils import es_alerts

BACKUP_DIR = os.getenv('ES_ALERT_BACKUP_DIR', '/tmp')


def _iso(v):
    if v is None or v == '':
        return None
    if isinstance(v, datetime):
        if v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc).isoformat().replace('+00:00', 'Z')
        return v.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')
    return str(v)


def backup_es_docs():
    """备份两个索引的全部文档，返回 {index: [docs]} 与备份文件路径。"""
    backup = {}
    es = es_alerts.client()
    for idx in (es_alerts.INDEX_VALID, es_alerts.INDEX_INVALID):
        docs = []
        if es.indices.exists(index=idx):
            resp = es.search(index=idx, body={'query': {'match_all': {}}, 'size': 10000})
            for h in resp['hits']['hits']:
                docs.append({'_id': h['_id'], '_source': h['_source']})
        backup[idx] = docs
        print(f"[backup] {idx}: {len(docs)} 条")

    path = os.path.join(BACKUP_DIR,
                        f"es_alert_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(backup, f, ensure_ascii=False, indent=1)
    print(f"[backup] 已写入备份文件: {path}")
    return backup, path


def recreate_indices():
    for idx in (es_alerts.INDEX_VALID, es_alerts.INDEX_INVALID):
        es_alerts.recreate_index(idx)
        print(f"[index] 已按完整映射重建: {idx}")


def backfill_from_pg():
    """PostgreSQL alerts → ES alerts-valid，返回写入的文档 id 集合。

    注意：文档 _id 取 alert_log_id（= ALT-{dedup_hash}）。历史库里存在同指纹的
    重复告警（同一 dedup_hash 多行），它们本就代表同一条告警，天然合并为一条文档；
    但为免误覆盖，这里对「id 已被占用且内容不同」的行追加 -{pg_id} 后缀保留。
    """
    from app.models import Alert
    rows = Alert.query.order_by(Alert.id).all()

    # 先把原始 PG 数据落盘备份，便于追溯/重放
    dump_path = os.path.join(
        BACKUP_DIR, f"pg_alerts_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    with open(dump_path, 'w', encoding='utf-8') as f:
        json.dump([a.to_dict() for a in rows], f, ensure_ascii=False, indent=1)
    print(f"[backup] PostgreSQL alerts 原始数据已备份: {dump_path}（{len(rows)} 条）")

    written, seen = set(), {}
    deduped = 0
    for a in rows:
        doc = a.to_dict()
        doc_id = doc.get('alert_log_id') or f"ALT-PG-{a.id}"
        prev = seen.get(doc_id)
        if prev is not None:
            # 同指纹重复行：内容一致 → 视为同一告警；内容不同 → 加后缀各自保留
            if prev == doc.get('dedup_hash'):
                deduped += 1
                continue
            doc_id = f"{doc_id}-{a.id}"
        seen[doc_id] = doc.get('dedup_hash')
        doc['alert_id'] = doc_id
        doc['id'] = doc_id
        if not doc.get('alert_code'):
            doc['alert_code'] = f"PG-{a.id}"
        doc['processing_status'] = 'NORMAL'
        doc['dispatch_branch'] = 'valid'
        doc['dispatch_policy'] = '历史回灌'
        es_alerts.index_alert(doc, index=es_alerts.INDEX_VALID, refresh='false')
        written.add(doc_id)

    es_alerts.client().indices.refresh(index=es_alerts.INDEX_VALID)
    print(f"[backfill] PostgreSQL alerts: {len(rows)} 条 → ES {es_alerts.INDEX_VALID}"
          f"（写入 {len(written)} 条，同指纹重复合并 {deduped} 条）")
    return written


def merge_backup(backup: dict, already: set):
    """把备份里 PG 未覆盖的 ES 文档合并回去（PG 数据优先）。"""
    merged = 0
    for idx, docs in backup.items():
        for d in docs:
            doc_id = d.get('_id')
            if not doc_id or doc_id in already:
                continue
            if idx == es_alerts.INDEX_VALID and doc_id in already:
                continue
            body = dict(d.get('_source') or {})
            body['alert_id'] = body.get('alert_id') or doc_id
            body['id'] = doc_id
            es_alerts.index_alert(body, index=idx, refresh='false')
            merged += 1
    if merged:
        for idx in (es_alerts.INDEX_VALID, es_alerts.INDEX_INVALID):
            try:
                es_alerts.client().indices.refresh(index=idx)
            except Exception:
                pass
    print(f"[merge] 备份中补回 ES-only 文档: {merged} 条")


def truncate_pg():
    db.session.execute(db.text('TRUNCATE TABLE alerts RESTART IDENTITY CASCADE;'))
    db.session.commit()
    print("[pg] alerts 表已清空（RESTART IDENTITY）")


def upgrade(keep_pg: bool = False):
    app = create_app()
    with app.app_context():
        es_alerts.ensure_indices()
        backup, path = backup_es_docs()
        recreate_indices()
        written = backfill_from_pg()
        merge_backup(backup, written)

        v = es_alerts.count(es_alerts.INDEX_VALID)
        i = es_alerts.count(es_alerts.INDEX_INVALID)
        print(f"[verify] {es_alerts.INDEX_VALID}={v}  {es_alerts.INDEX_INVALID}={i}")

        if not keep_pg:
            truncate_pg()
        else:
            print("[pg] 按参数要求保留 PostgreSQL alerts 数据")

    print(f"[done] 告警已统一持久化到 ES；备份文件: {path}")


if __name__ == '__main__':
    upgrade(keep_pg='--keep-pg' in sys.argv)
