"""
APScheduler 定时任务管理 — AI 告警自动分析
使用文件锁防止多 worker 重复执行
"""
import os
import sys
import time
import json
import logging
import atexit
import fcntl
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

_scheduler: Optional[BackgroundScheduler] = None
_app_instance = None  # Flask app reference for background thread
_LOCK_FILE = os.path.join(os.path.dirname(__file__), '..', 'data', 'scheduler.lock')


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




def _run_playbook_scheduled():
    """执行定时触发的剧本"""
    try:
        global _app_instance
        if _app_instance is None:
            logger.warning("[调度器] 应用未初始化，跳过剧本执行")
            return
        with _app_instance.app_context():
            from app.models import Playbook
            from app.engine.playbook_engine import playbook_engine as engine
            from datetime import datetime
            
            # 查找已发布且配置了定时触发的剧本
            playbooks = Playbook.query.filter(
                Playbook.status.in_(['published', 'enabled'])
            ).all()
            
            executed = 0
            for playbook in playbooks:
                trigger_config = playbook.trigger_config or {}
                if trigger_config.get('trigger_type') == 'schedule':
                    schedule = trigger_config.get('schedule')
                    if not schedule:
                        continue
                    
                    # 检查是否应该执行 (简化: 每隔指定分钟执行)
                    last_run = trigger_config.get('last_run')
                    interval_minutes = trigger_config.get('interval_minutes', 60)
                    
                    should_run = True
                    if last_run:
                        try:
                            last_time = datetime.fromisoformat(last_run)
                            minutes_since = (datetime.utcnow() - last_time).total_seconds() / 60
                            if minutes_since < interval_minutes:
                                should_run = False
                        except:
                            pass
                    
                    if should_run:
                        try:
                            result = engine.execute(
                                playbook=playbook,
                                trigger_type='schedule',
                                event={},
                                alert={},
                                params={'trigger': 'scheduled', 'skip_approval': True},
                                executor='scheduler',
                                request_info={'user_id': 0, 'username': 'scheduler', 'ip': '127.0.0.1'}
                            )
                            # 更新最后执行时间
                            trigger_config['last_run'] = datetime.utcnow().isoformat()
                            playbook.trigger_config = trigger_config
                            from app.database import db
                            db.session.commit()
                            executed += 1
                            logger.info(f"[调度器] 定时执行剧本: {playbook.name}")
                        except Exception as e:
                            logger.error(f"[调度器] 剧本执行失败: {playbook.name}, {e}")
            
            if executed > 0:
                logger.info(f"[调度器] 定时剧本执行完成: {executed} 个剧本")
    except Exception as e:
        logger.error(f"[调度器] 定时剧本执行异常: {e}")


def _run_analysis():
    """执行 AI 告警分析（供 APScheduler 调用）"""
    try:
        import os
        if os.getenv('AI_ANALYSIS_ENABLED', 'false').lower() != 'true':
            logger.info("[调度器] AI分析已禁用，跳过")
            return
        global _app_instance
        if _app_instance is None:
            logger.warning("[调度器] 应用未初始化，跳过分析")
            return
        with _app_instance.app_context():
            from app.ai_analysis.alert_analyzer import analyze_alert_batch
            logger.info("[调度器] 开始 AI 告警自动分析...")
            result = analyze_alert_batch(limit=50)
        analyzed = result.get('analyzed', 0)
        events = result.get('events_created', 0)
        if analyzed > 0:
            logger.info(f"[调度器] 分析完成: {analyzed} 条告警, {events} 个事件")
    except Exception as e:
        logger.error(f"[调度器] 分析异常: {e}")


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

        # 每 60 秒执行一次 AI 告警分析
        _scheduler.add_job(
            func=_run_analysis,
            trigger=IntervalTrigger(seconds=60),
            id='ai_alert_analysis',
            name='AI告警自动分析',
            replace_existing=True,
        )
        
        # 每 60 秒检查并执行定时触发的剧本
        _scheduler.add_job(
            func=_run_playbook_scheduled,
            trigger=IntervalTrigger(seconds=60),
            id='playbook_scheduled',
            name='定时剧本执行',
            replace_existing=True,
        )

        _scheduler.start()
        logger.info("[调度器] APScheduler 已启动，AI 告警分析每 60 秒执行一次")

        # 注册退出时清理
        atexit.register(shutdown_scheduler)

    except Exception as e:
        logger.error(f"[调度器] 启动失败: {e}")
        _release_lock()


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
