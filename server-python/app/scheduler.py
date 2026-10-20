"""
APScheduler 定时任务管理 — AI 告警批量研判（AI 中心「告警监控」）+ 剧本定时执行

- 每 60 秒执行一次 run_batch_judgment（ES 为告警唯一真相源）
- 剧本「定时任务」触发器：每 60 秒轮询 enabled 且 trigger_type='定时任务' 的剧本，
  按触发器节点 config.schedule（5 段 Cron）匹配本地时间（UTC+8）执行，同一天只跑一次
- 任务常驻不暂停：运行开关持久化在 PG SystemConfig（ai_pipeline_state），每周期校验；
  debug 重载/多进程下持锁进程未必是处理 HTTP 请求的进程，故开关必须跨进程可改
- 累计统计同样持久化在 PG，容器重建不丢
- 关联分析作业看门狗（correlation_watchdog）：Flink 作业无自动重提机制，
  每 30s 巡检，无存活作业且有启用规则时自动重新部署（见下文看门狗小节）
- 使用文件锁防止多 worker 重复执行
"""
import os
import sys
import time
import json
import logging
import atexit
import fcntl
from datetime import datetime, timedelta
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

_scheduler: Optional[BackgroundScheduler] = None
_app_instance = None  # Flask app reference for background thread
_LOCK_FILE = os.path.join(os.path.dirname(__file__), '..', 'data', 'scheduler.lock')

# 批量研判定时任务 ID（与「告警监控」启动/停止开关联动）
JOB_ID = 'ai_alert_analysis'
JOB_INTERVAL_SECONDS = 60
# 剧本定时执行任务 ID（「定时任务」触发器）
PB_JOB_ID = 'playbook_schedule'
PB_JOB_INTERVAL_SECONDS = 60
# 运行开关 + 累计统计的持久化 key（PG SystemConfig）
_STATE_KEY = 'ai_pipeline_state'

# Cron 各字段取值范围（分 时 日 月；周单独处理，0 与 7 均为周日）
_CRON_RANGES = [(0, 59), (0, 23), (1, 31), (1, 12)]


def _cron_field_match(spec: str, value: int, lo: int, hi: int) -> bool:
    """单个 cron 字段匹配：支持 * / , - 与步长（如 1-5, */2, 0）。"""
    spec = (spec or '').strip()
    if spec in ('*', ''):
        return True
    for part in spec.split(','):
        part = part.strip()
        if not part:
            continue
        step = 1
        if '/' in part:
            part, _, step_s = part.partition('/')
            try:
                step = max(1, int(step_s))
            except ValueError:
                return False
        if part in ('*', ''):
            return lo <= value <= hi and (value - lo) % step == 0
        if '-' in part:
            a, _, b = part.partition('-')
            try:
                start, end = int(a), int(b)
            except ValueError:
                continue
            if start <= value <= end and (value - start) % step == 0:
                return True
        else:
            try:
                if int(part) == value:
                    return True
            except ValueError:
                continue
    return False


def _cron_week_match(spec: str, cron_weekday: int) -> bool:
    """周字段匹配（0 和 7 都代表周日）。"""
    spec = (spec or '').strip()
    if spec in ('*', ''):
        return True
    for part in spec.split(','):
        part = part.strip()
        if not part:
            continue
        step = 1
        if '/' in part:
            part, _, step_s = part.partition('/')
            try:
                step = max(1, int(step_s))
            except ValueError:
                continue
        if part in ('*', ''):
            return True
        if '-' in part:
            a, _, b = part.partition('-')
            try:
                start, end = int(a), int(b)
            except ValueError:
                continue
            if end == 7:
                end = 0 if start == 0 else 6
            if start == 7:
                start = 0
            if start <= cron_weekday <= end and (cron_weekday - start) % step == 0:
                return True
        else:
            try:
                v = int(part)
            except ValueError:
                continue
            if v == 7:
                v = 0
            if v == cron_weekday:
                return True
    return False


def _cron_matches(expr: str, dt) -> bool:
    """5 段 Cron（分 时 日 月 周）是否命中给定时间。"""
    fields = str(expr or '').split()
    if len(fields) != 5:
        return False
    cron_weekday = (dt.weekday() + 1) % 7  # Python 周一=0 → cron 周日=0
    values = [dt.minute, dt.hour, dt.day, dt.month]
    for spec, val, (lo, hi) in zip(fields[:4], values, _CRON_RANGES):
        if not _cron_field_match(spec, val, lo, hi):
            return False
    return _cron_week_match(fields[4], cron_weekday)


def _acquire_lock() -> bool:
    """获取文件锁，返回是否成功（仅第一个进程获得锁）"""
    try:
        os.makedirs(os.path.dirname(_LOCK_FILE), exist_ok=True)
        fd = os.open(_LOCK_FILE, os.O_CREAT | os.O_RDWR, 0o644)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            # 写入当前 PID 以便调试
            os.write(fd, str(os.getpid()).encode())
            os.fsync(fd)
            return True
        except (IOError, OSError):
            os.close(fd)
            return False
    except Exception as e:
        logger.warning(f"[调度器] 文件锁获取失败: {e}")
        return False


def _release_lock():
    """释放文件锁"""
    try:
        if os.path.exists(_LOCK_FILE):
            os.remove(_LOCK_FILE)
    except Exception:
        pass


# =============================================
# 告警监控（pipeline）运行状态 — PG SystemConfig 持久化
# =============================================

def _read_state() -> dict:
    """读取运行开关与累计统计。"""
    try:
        from app.models import SystemConfig
        cfg = SystemConfig.query.filter_by(key=_STATE_KEY).first()
        if cfg and cfg.value:
            return json.loads(cfg.value) or {}
    except Exception as e:
        logger.warning(f"[调度器] 读取运行状态失败: {e}")
    return {}


def _write_state(patch: dict):
    """合并更新运行开关与累计统计。"""
    try:
        from app.database import db
        from app.models import SystemConfig
        state = _read_state()
        state.update(patch or {})
        cfg = SystemConfig.query.filter_by(key=_STATE_KEY).first()
        if not cfg:
            cfg = SystemConfig(key=_STATE_KEY, value='{}', category='ai_config')
            db.session.add(cfg)
        cfg.value = json.dumps(state, ensure_ascii=False)
        db.session.commit()
    except Exception as e:
        logger.warning(f"[调度器] 写入运行状态失败: {e}")


def get_pipeline_status() -> dict:
    """「告警监控」状态：运行开关（PG 持久化，跨进程一致）+ 累计统计。"""
    state = _read_state()
    return {
        'running': bool(state.get('enabled')),
        'last_run': state.get('last_run'),
        'total_analyzed': state.get('total_analyzed', 0),
        'total_events': state.get('total_events', 0),
        'total_false_positives': state.get('total_false_positives', 0),
        'high_risk': state.get('high_risk', 0),
        'error': state.get('error'),
    }


def start_pipeline():
    """启动定时批量研判。

    开关以 PG 持久化状态为准（debug 重载/多进程下持锁进程未必是当前请求进程，
    因此任何进程都可改开关；持锁进程的调度任务常驻，下一周期自动生效）。
    返回 (success, message)。
    """
    _write_state({'enabled': True, 'error': None})
    return True, f'定时研判已启动（每 {JOB_INTERVAL_SECONDS} 秒）'


def stop_pipeline():
    """停止定时批量研判（下一周期起不再执行，已研判结论保留）。返回 (success, message)。"""
    _write_state({'enabled': False, 'error': None})
    return True, '已停止'


# =============================================
# 关联分析作业看门狗（correlation watchdog）
# =============================================
# 背景：Flink 关联作业经 SQL Gateway 提交，无重启策略、无自动重提。
# TaskManager 心跳超时（长 GC/宿主资源争抢）会导致作业直接 FAILED 且无人恢复，
# 「实时关联分析」静默中断数小时无人感知（2026-10-20 实际发生过）。
# 看门狗每 30s 检查一次：有启用规则但没有存活作业时自动重新部署；
# 冷却/指数退避防止死亡循环刷屏；用户手动「停止作业」后尊重意图不再自动重提，
# 直到用户再次手动部署（或前端一键恢复）。
CORR_JOB_ID = 'correlation_watchdog'
CORR_INTERVAL_SECONDS = 30
_WD_STATE_KEY = 'correlation_watchdog_state'
_WD_LIVE_STATES = ('RUNNING', 'RESTARTING', 'CREATED', 'INITIALIZING', 'RECONCILING')
_WD_BASE_BACKOFF = 60          # 首次失败后 60s 再试
_WD_MAX_BACKOFF = 600          # 退避上限 10 分钟
_WD_SUCCESS_COOLDOWN = 60      # 自动重提成功后的最小间隔（防止作业秒死时高频重提）


def _read_wd_state() -> dict:
    """读取看门狗状态（开关/手动停止标志/统计）。"""
    try:
        from app.models import SystemConfig
        cfg = SystemConfig.query.filter_by(key=_WD_STATE_KEY).first()
        if cfg and cfg.value:
            return json.loads(cfg.value) or {}
    except Exception as e:
        logger.warning(f"[看门狗] 读取状态失败: {e}")
    return {}


def _write_wd_state(patch: dict):
    """合并更新看门狗状态（PG 持久化，跨进程生效）。"""
    try:
        from app.database import db
        from app.models import SystemConfig
        state = _read_wd_state()
        state.update(patch or {})
        cfg = SystemConfig.query.filter_by(key=_WD_STATE_KEY).first()
        if not cfg:
            cfg = SystemConfig(key=_WD_STATE_KEY, value='{}', category='ai_config')
            db.session.add(cfg)
        cfg.value = json.dumps(state, ensure_ascii=False)
        db.session.commit()
    except Exception as e:
        logger.warning(f"[看门狗] 写入状态失败: {e}")


def wd_get_status() -> dict:
    """看门狗状态（供 /pipeline/correlation/status 与前端展示）。"""
    state = _read_wd_state()
    return {
        'enabled': bool(state.get('enabled', True)),
        'user_stopped': bool(state.get('user_stopped')),
        'interval': CORR_INTERVAL_SECONDS,
        'last_check': state.get('last_check'),
        'last_auto_deploy': state.get('last_auto_deploy'),
        'auto_deploy_count': state.get('auto_deploy_count', 0),
        'consecutive_failures': state.get('consecutive_failures', 0),
        'last_error': state.get('last_error'),
    }


def wd_set_enabled(enabled: bool):
    """开启/关闭自动守护（HTTP 端点调用，立即持久化）。"""
    _write_wd_state({'enabled': bool(enabled), 'last_error': None})
    logger.info(f"[看门狗] 自动守护已{'开启' if enabled else '关闭'}")


def wd_mark_user_stopped():
    """用户手动停止作业：暂停自动重提，直到再次手动部署。"""
    _write_wd_state({'user_stopped': True})
    logger.info("[看门狗] 已记录用户手动停止，自动重提暂停（重新部署后恢复）")


def wd_clear_user_stopped():
    """用户手动部署：恢复自动守护。"""
    state = _read_wd_state()
    if state.get('user_stopped'):
        _write_wd_state({'user_stopped': False, 'consecutive_failures': 0,
                         'next_attempt_after': None, 'last_error': None})


def _run_correlation_watchdog():
    """每 30s：有启用规则但无存活关联作业时自动重新部署（看门狗）。"""
    global _app_instance
    if _app_instance is None:
        return
    try:
        with _app_instance.app_context():
            from app.flink_sql import gateway as gw

            state = _read_wd_state()
            now = datetime.utcnow()
            patch = {'last_check': now.isoformat()}

            # 1) 守护开关（PG 持久化，跨进程一致）
            if not state.get('enabled', True):
                _write_wd_state(patch)
                return

            # 2) 没有启用规则 → 无可守护对象
            from app.alert_pipeline.pipeline import CorrelationRule
            if CorrelationRule.query.filter(CorrelationRule.enabled.is_(True)).count() == 0:
                _write_wd_state(patch)
                return

            # 3) 用户手动停止 → 尊重意图，不自动重提
            if state.get('user_stopped'):
                _write_wd_state(patch)
                return

            # 4) 已有存活作业 → 正常运行，重置失败计数
            try:
                live = [j for j in gw.list_jobs()
                        if j.get('name') == gw.CORRELATION_JOB_NAME
                        and j.get('state') in _WD_LIVE_STATES]
            except Exception as e:
                patch['last_error'] = f'作业列表查询失败: {e}'
                _write_wd_state(patch)
                return
            if live:
                if state.get('consecutive_failures'):
                    patch['consecutive_failures'] = 0
                    patch['next_attempt_after'] = None
                    patch['last_error'] = None
                _write_wd_state(patch)
                return

            # 5) 作业已停止且非用户主动 → 冷却判定后自动重提
            next_after = state.get('next_attempt_after')
            if next_after:
                try:
                    if datetime.fromisoformat(next_after) > now:
                        _write_wd_state(patch)   # 冷却中，仅更新检查时间
                        return
                except ValueError:
                    pass

            logger.warning("[看门狗] 关联分析作业无存活实例（有启用规则），自动重新部署")
            # 网关瞬时不可用（如正在处理手动部署的提交）不计入连续失败，下轮自然重试
            try:
                if not gw.gateway_available():
                    patch['last_error'] = 'Flink SQL Gateway 瞬时不可达，下轮重试'
                    _write_wd_state(patch)
                    return
            except Exception as e:
                patch['last_error'] = f'网关探测异常: {e}'
                _write_wd_state(patch)
                return
            from app.routes.pipeline_api import _deploy_correlation_job_internal
            out = _deploy_correlation_job_internal(source='watchdog')

            patch['last_check'] = datetime.utcnow().isoformat()
            if out.get('ok'):
                patch.update({
                    'last_auto_deploy': patch['last_check'],
                    'auto_deploy_count': int(state.get('auto_deploy_count', 0)) + 1,
                    'consecutive_failures': 0,
                    'next_attempt_after': (
                        datetime.utcnow() + timedelta(seconds=_WD_SUCCESS_COOLDOWN)
                    ).isoformat(),
                    'last_error': None,
                })
                logger.info("[看门狗] 自动重提成功 job_id=%s（累计自动恢复 %d 次）",
                            out['data'].get('job_id'), patch['auto_deploy_count'])
            elif out.get('skipped'):
                # 并发部署中（用户刚点了手动部署/另一路径正在提交）：跳过本轮，不计失败
                logger.info("[看门狗] 检测到并发部署，跳过本轮自动重提")
            else:
                failures = int(state.get('consecutive_failures', 0)) + 1
                backoff = min(_WD_BASE_BACKOFF * (2 ** (failures - 1)), _WD_MAX_BACKOFF)
                patch.update({
                    'consecutive_failures': failures,
                    'last_error': out.get('error'),
                    'next_attempt_after': (
                        datetime.utcnow() + timedelta(seconds=backoff)
                    ).isoformat(),
                })
                logger.error("[看门狗] 自动重提失败（第 %d 次，%.0fs 后重试）: %s",
                             failures, backoff, out.get('error'))
            _write_wd_state(patch)
    except Exception as e:
        logger.error(f"[看门狗] 巡检异常: {e}")


def _run_analysis():
    """执行 AI 批量研判（供 APScheduler 调用）"""
    global _app_instance
    if _app_instance is None:
        logger.warning("[调度器] 应用未初始化，跳过分析")
        return
    try:
        with _app_instance.app_context():
            # 开关校验：可能被其它进程（HTTP 请求）停止
            if not _read_state().get('enabled'):
                return
            from app.routes.ai_judgment import run_batch_judgment
            logger.info("[调度器] 开始 AI 告警批量研判...")
            result = run_batch_judgment(limit=50)
            _write_state({
                'last_run': datetime.utcnow().isoformat(),
                'total_analyzed': _read_state().get('total_analyzed', 0) + result.get('analyzed', 0),
                'total_events': _read_state().get('total_events', 0) + result.get('events_created', 0),
                'total_false_positives': _read_state().get('total_false_positives', 0) + result.get('false_positives', 0),
                'high_risk': _read_state().get('high_risk', 0) + result.get('high_risk', 0),
                'error': result.get('error'),
            })
            if result.get('analyzed', 0) > 0:
                logger.info(f"[调度器] 研判完成: {result.get('message', '')}")
    except Exception as e:
        logger.error(f"[调度器] 分析异常: {e}")


def _run_scheduled_playbooks():
    """执行「定时任务」剧本（供 APScheduler 调用）。

    每 60 秒轮询：trigger_type='定时任务' 且 enabled 的剧本，按触发器节点
    config.schedule（5 段 Cron，按 UTC+8 本地时间解释）命中即执行；
    同一剧本同一本地日只执行一次（按 playbook_executions 去重）。
    """
    global _app_instance
    if _app_instance is None:
        logger.warning("[调度器] 应用未初始化，跳过剧本定时执行")
        return
    try:
        with _app_instance.app_context():
            from datetime import timedelta
            from app.models import Playbook, PlaybookExecution
            from app.engine.playbook_engine import PlaybookEngine

            local_now = datetime.utcnow() + timedelta(hours=8)  # 容器 UTC → 北京时间

            playbooks = Playbook.query.filter_by(trigger_type='定时任务', enabled=True).all()
            for pb in playbooks:
                nodes = pb.nodes or []
                trigger = next((n for n in nodes
                                if (n.get('typeId') or n.get('type')) == 'trigger'), None)
                if not trigger:
                    continue
                cfg = trigger.get('config') or (trigger.get('data') or {}).get('config') or {}
                cron = str(cfg.get('schedule') or '').strip()
                if not cron or not _cron_matches(cron, local_now):
                    continue
                # 防重复：最近 5 分钟内已按 schedule 执行过则跳过（覆盖 60s 轮询重叠/
                # 多进程并发）。旧逻辑按「同一本地日只执行一次」去重，会把
                # 0 */2 * * * 这类日内多次 cron 误杀成一天一跑 —— 2026-10-18 修复。
                recent_cutoff = local_now - timedelta(minutes=5) - timedelta(hours=8)
                already = PlaybookExecution.query.filter(
                    PlaybookExecution.playbook_id == pb.id,
                    PlaybookExecution.trigger_type == 'schedule',
                    PlaybookExecution.started_at >= recent_cutoff,
                ).first()
                if already:
                    continue
                logger.info(f"[调度器] 定时执行剧本: {pb.name} (cron={cron})")
                try:
                    engine = PlaybookEngine()
                    engine.execute(pb, trigger_type='schedule', executor='scheduler')
                except Exception as e:
                    logger.error(f"[调度器] 剧本 {pb.name} 执行异常: {e}")
    except Exception as e:
        logger.error(f"[调度器] 剧本定时轮询异常: {e}")


def start_scheduler(app=None):
    """
    启动 APScheduler（仅在获取到文件锁的进程中运行）
    在 Flask create_app() 中调用
    """
    global _scheduler, _app_instance
    
    _app_instance = app

    if _scheduler is not None and _scheduler.running:
        return  # 已经启动

    # 尝试获取文件锁（仅主进程启动调度器）
    locked = _acquire_lock()
    if not locked:
        logger.info("[调度器] 未获取到文件锁（另一个进程已持有），跳过")
        return

    try:
        _scheduler = BackgroundScheduler(
            daemon=True,
            job_defaults={
                'coalesce': True,           # 合并积压的未执行任务
                'max_instances': 1,          # 同一时刻只运行一个实例
                'misfire_grace_time': 30,    # 错过执行后 30 秒内仍可触发
            }
        )

        # 每 60 秒执行一次 AI 告警批量研判
        _scheduler.add_job(
            func=_run_analysis,
            trigger=IntervalTrigger(seconds=JOB_INTERVAL_SECONDS),
            id=JOB_ID,
            name='AI告警批量研判',
            replace_existing=True,
        )

        # 每 60 秒轮询一次「定时任务」剧本（Cron 命中即执行，同日去重）
        _scheduler.add_job(
            func=_run_scheduled_playbooks,
            trigger=IntervalTrigger(seconds=PB_JOB_INTERVAL_SECONDS),
            id=PB_JOB_ID,
            name='剧本定时执行',
            replace_existing=True,
        )

        # 每 30 秒巡检一次关联分析作业（无存活实例且有启用规则时自动重提）
        _scheduler.add_job(
            func=_run_correlation_watchdog,
            trigger=IntervalTrigger(seconds=CORR_INTERVAL_SECONDS),
            id=CORR_JOB_ID,
            name='关联作业看门狗',
            replace_existing=True,
        )

        _scheduler.start()
        logger.info(f"[调度器] APScheduler 已启动，AI 告警批量研判每 {JOB_INTERVAL_SECONDS} 秒执行一次，"
                    f"剧本定时任务每 {PB_JOB_INTERVAL_SECONDS} 秒轮询一次，"
                    f"关联作业看门狗每 {CORR_INTERVAL_SECONDS} 秒巡检一次")

        # 任务常驻不暂停：运行开关以 PG 状态为准，每个周期校验（debug 重载/多进程下
        # 持锁进程未必是处理 HTTP 请求的进程，暂停/恢复无法跨进程生效）
        enabled = False
        try:
            with app.app_context():
                enabled = bool(_read_state().get('enabled'))
        except Exception as e:
            logger.warning(f"[调度器] 读取开关状态失败: {e}")
        logger.info(f"[调度器] 批量研判开关当前状态: {'已启动' if enabled else '已停止'}"
                    "（可在「AI 中心 → 告警监控」切换）")

        # 注册退出时清理
        atexit.register(shutdown_scheduler)

        return _scheduler.running

    except Exception as e:
        logger.error(f"[调度器] 启动失败: {e}")
        _release_lock()
        return False


def shutdown_scheduler():
    """优雅关闭调度器"""
    global _scheduler
    if _scheduler and _scheduler.running:
        try:
            _scheduler.shutdown(wait=False)
            logger.info("[调度器] 已关闭")
        except Exception as e:
            logger.warning(f"[调度器] 关闭异常: {e}")
    _release_lock()


def get_scheduler() -> Optional[BackgroundScheduler]:
    """获取当前调度器实例"""
    return _scheduler
