"""IP 封堵历史表初始化 + 历史数据回填（幂等）。

背景：封堵清单页需要「封禁时间 / 解封时间 / 封禁时长」全量历史，而此前
封堵状态只存 SystemConfig 的 blocked_ips 快照（无解封时间），解封即消失。
本迁移：
  1. 建表 ip_block_history（create_all，模型已注册）
  2. 从 logs/ip_blocks.log 的 block/unblock 动作流水回填历史（配对成
     「一次封禁 = 一行，解封回填解封时间与实际封禁时长」）
  3. 对仍处于封堵中、但日志里没有对应 block 记录的 IP（如早期写入），
     按 system_config.blocked_ips 快照补一条 active 历史

幂等：system_config 的 ip_block_history_backfill 标记 + (ip, blocked_at)
去重兜底；重复执行不会产生重复行。
"""
import json
import os
import sys
from datetime import datetime

BACKFILL_MARKER = 'ip_block_history_backfill'


def _parse_ts(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s)
    except (ValueError, TypeError):
        return None


def run():
    from app import create_app
    from app.database import db
    from app.models import IpBlockHistory, SystemConfig

    app = create_app()
    with app.app_context():
        db.create_all()  # 幂等建表（含 ip_block_history）

        marker = SystemConfig.query.filter_by(key=BACKFILL_MARKER).first()
        if marker and marker.value == '1':
            print('[回填] 已完成过（marker 存在），跳过。如日志有新条目可删除 marker 后重跑。')
            return 0

        existing = {(r.ip, r.blocked_at) for r in IpBlockHistory.query.all()}

        # ---------- 1. 解析动作日志，配对 block/unblock ----------
        # 日志路径：优先脚本同级的 ../logs（宿主机 migrations/ 布局），
        # 其次容器布局 /app/logs（脚本被 docker cp 到 /tmp 运行时）
        candidates = [
            os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'logs', 'ip_blocks.log'),
            '/app/logs/ip_blocks.log',
        ]
        log_file = next((p for p in candidates if os.path.exists(p)), candidates[0])
        added = 0
        if os.path.exists(log_file):
            open_rows = {}  # ip -> IpBlockHistory（未关闭）
            with open(log_file, encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        e = json.loads(line)
                    except ValueError:
                        continue
                    ip = e.get('ip')
                    ts = _parse_ts(e.get('timestamp'))
                    action = e.get('action')
                    if not ip or not ts or action not in ('block', 'unblock'):
                        continue
                    if action == 'block':
                        prev = open_rows.get(ip)
                        if prev is not None:
                            # 异常兜底：同一 IP 连续两次 block 无 unblock，先按上次 block 时间关闭
                            prev.unblocked_at = ts
                            prev.unblock_reason = '异常：再次封堵前自动关闭'
                            prev.status = 'unblocked'
                            if prev.blocked_at:
                                prev.block_seconds = max(0, int((ts - prev.blocked_at).total_seconds()))
                        if (ip, ts) in existing:
                            # 已回填过：视为已存在，继续维护打开态映射
                            row = (IpBlockHistory.query
                                   .filter_by(ip=ip, status='active')
                                   .order_by(IpBlockHistory.blocked_at.desc()).first())
                            open_rows[ip] = row
                            continue
                        row = IpBlockHistory(
                            ip=ip, reason=e.get('reason'), source=e.get('source'),
                            blocked_at=ts, status='active')
                        db.session.add(row)
                        added += 1
                        open_rows[ip] = row
                    else:  # unblock
                        row = open_rows.pop(ip, None)
                        if row is None:
                            # 日志早于回填起点：找库里该 IP 未关闭的最新一条
                            row = (IpBlockHistory.query
                                   .filter_by(ip=ip, status='active')
                                   .order_by(IpBlockHistory.blocked_at.desc()).first())
                        if row is not None:
                            row.unblocked_at = ts
                            row.unblock_reason = e.get('reason') or '手动解封'
                            row.status = 'unblocked'
                            if row.blocked_at:
                                row.block_seconds = max(0, int((ts - row.blocked_at).total_seconds()))
            db.session.commit()
            print(f'[回填] 日志解析完成：新增 {added} 条历史（{log_file}）')
        else:
            print(f'[回填] 未找到动作日志 {log_file}，跳过日志回填')

        # ---------- 2. 仍封堵中的 IP 补 active 历史 ----------
        sc = SystemConfig.query.filter_by(key='blocked_ips').first()
        blocks = {}
        if sc and sc.value:
            try:
                blocks = json.loads(sc.value)
            except ValueError:
                blocks = {}
        patched = 0
        now = datetime.utcnow()
        for ip, entry in (blocks or {}).items():
            if not isinstance(entry, dict):
                continue
            open_row = (IpBlockHistory.query
                        .filter_by(ip=ip, status='active')
                        .order_by(IpBlockHistory.blocked_at.desc()).first())
            if open_row:
                continue
            blocked_at = _parse_ts(entry.get('timestamp')) or now
            exp = _parse_ts(entry.get('expires_at'))
            # 预设时长已过的（快照尚未被 purge 清理）按到期处理
            if exp and exp <= now:
                db.session.add(IpBlockHistory(
                    ip=ip, reason=entry.get('reason'), source=entry.get('source'),
                    method=entry.get('method'), duration=entry.get('duration'),
                    blocked_at=blocked_at, expires_at=exp,
                    unblocked_at=exp, unblock_reason='到期自动解封',
                    block_seconds=max(0, int((exp - blocked_at).total_seconds())),
                    status='expired'))
            else:
                db.session.add(IpBlockHistory(
                    ip=ip, reason=entry.get('reason'), source=entry.get('source'),
                    method=entry.get('method'), duration=entry.get('duration'),
                    blocked_at=blocked_at, expires_at=exp, status='active'))
            patched += 1
        if patched:
            db.session.commit()
        print(f'[回填] 快照补登：{patched} 条（当前仍封堵）')

        # ---------- 2.5 对账：历史 active 但快照已移除的（开发期直接清过快照） ----------
        stale = (IpBlockHistory.query
                 .filter_by(status='active')
                 .filter(~IpBlockHistory.ip.in_(list(blocks.keys()) or ['__none__']))
                 .all())
        for row in stale:
            row.status = 'unblocked'
            row.unblock_reason = '历史清理（快照中已移除，无解封记录）'
        if stale:
            db.session.commit()
        print(f'[回填] 对账关闭：{len(stale)} 条（快照中已不存在）')

        # ---------- 3. 写标记 ----------
        if marker:
            marker.value = '1'
        else:
            db.session.add(SystemConfig(key=BACKFILL_MARKER, value='1', category='playbook'))
        db.session.commit()

        total = IpBlockHistory.query.count()
        active = IpBlockHistory.query.filter_by(status='active').count()
        print(f'[回填] 完成：历史共 {total} 条，其中封禁中 {active} 条')
        return 0


if __name__ == '__main__':
    sys.exit(run())
