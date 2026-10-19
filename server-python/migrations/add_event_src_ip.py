"""events 表新增 src_ip 列，并从存量事件的关联告警/扩展数据回填主责源 IP。

幂等：列已存在时跳过新增；回填只处理 src_ip 为空的事件。
用法：docker exec usop_all bash -c "cd /app && PYTHONPATH=/app python3 migrations/add_event_src_ip.py"
"""
import re
import sys

from sqlalchemy import text

from app import create_app
from app.database import db

# 关联分析（Flink）事件的描述形如「源 IP = 1.2.3.4 在 60 秒窗口内 ...」
_IP_IN_TEXT = re.compile(r'(?:源\s*IP|src_ip)\s*[=:：]?\s*'
                         r'(\d{1,3}(?:\.\d{1,3}){3})')
_IP_ANY = re.compile(r'\b(\d{1,3}(?:\.\d{1,3}){3})\b')


def ensure_column():
    db.session.execute(text(
        "ALTER TABLE events ADD COLUMN IF NOT EXISTS src_ip VARCHAR(50)"))
    db.session.commit()
    row = db.session.execute(text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name='events' AND column_name='src_ip'")).fetchone()
    print(f"[check] events.src_ip 存在: {bool(row)}")
    return bool(row)


def _ip_from_extra(extra) -> str:
    """从事件扩展数据里挖源 IP。"""
    if not isinstance(extra, dict):
        return ''
    if extra.get('src_ip'):
        return str(extra['src_ip'])
    summary = extra.get('summary') or {}
    if isinstance(summary, dict):
        ips = summary.get('src_ips')
        if isinstance(ips, list) and ips:
            return str(ips[0])
        if isinstance(summary.get('src_ip'), str):
            return summary['src_ip']
    for item in (extra.get('related_alerts') or []):
        if isinstance(item, dict) and item.get('src_ip'):
            return str(item['src_ip'])
    return ''


def _ip_from_text(text_value: str) -> str:
    """从描述/原始日志文本里挖源 IP（关联分析事件主要走这条路）。"""
    if not text_value:
        return ''
    m = _IP_IN_TEXT.search(text_value)
    if m:
        return m.group(1)
    m = _IP_ANY.search(text_value)
    return m.group(1) if m else ''


def backfill():
    """回填顺序：扩展数据 → 描述/原始日志里的「源 IP = x.x.x.x」。"""
    rows = db.session.execute(text(
        "SELECT id, extra_data, description, raw_log FROM events "
        "WHERE src_ip IS NULL OR src_ip = ''"
    )).fetchall()
    updated = 0
    for rid, extra, desc, raw in rows:
        src_ip = _ip_from_extra(extra)
        if not src_ip:
            src_ip = _ip_from_text(desc or '')
        if not src_ip:
            src_ip = _ip_from_text((raw or '')[:500])
        if not src_ip:
            continue
        db.session.execute(
            text("UPDATE events SET src_ip = :ip WHERE id = :id"),
            {'ip': str(src_ip)[:50], 'id': rid})
        updated += 1
    db.session.commit()
    print(f"[backfill] 回填源 IP 的事件数: {updated} / 待处理 {len(rows)}")


def main():
    app = create_app()
    with app.app_context():
        if not ensure_column():
            print("[fail] src_ip 列创建失败")
            sys.exit(1)
        backfill()


if __name__ == '__main__':
    main()
