"""
Flink Job Manager - Flink 作业运维管理

功能：
- 作业状态监控
- 作业启停管理
- 日志收集
- 资源配额管理
- 版本升级
"""

import os
import json
import logging
import time
import requests
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)


class JobStatus(Enum):
    """作业状态"""
    INITIALIZING = "initializing"
    RUNNING = "running"
    CANCELING = "canceling"
    CANCELED = "canceled"
    FAILED = "failed"
    FINISHED = "finished"
    RESTARTING = "restarting"
    SUSPENDED = "suspended"


@dataclass
class FlinkJob:
    """Flink 作业信息"""
    job_id: str
    job_name: str
    pipeline_id: int
    status: JobStatus
    start_time: datetime = None
    end_time: datetime = None
    last_update: datetime = field(default_factory=datetime.utcnow)
    parallelism: int = 1
    memory: str = "1024m"
    metrics: Dict[str, Any] = field(default_factory=dict)
    version: str = "1.0.0"


class FlinkJobManager:
    """Flink 作业管理器"""
    
    def __init__(self, flink_rest_url: str = None):
        self.flink_rest_url = flink_rest_url or os.environ.get(
            'FLINK_REST_URL', 'http://flink:8081'
        )
        self.jobs: Dict[str, FlinkJob] = {}
        self.api_version = 'v1'
    
    # ==================== 作业管理 ====================
    
    def list_jobs(self, status: JobStatus = None) -> List[FlinkJob]:
        """列出所有作业"""
        try:
            response = requests.get(
                f'{self.flink_rest_url}/jobs',
                timeout=10
            )
            
            if response.status_code != 200:
                return []
            
            data = response.json()
            jobs = []
            
            for job_data in data.get('jobs', []):
                job = FlinkJob(
                    job_id=job_data.get('id'),
                    job_name=job_data.get('name'),
                    pipeline_id=self._extract_pipeline_id(job_data.get('name', '')),
                    status=JobStatus(job_data.get('status', 'UNKNOWN'))
                )
                jobs.append(job)
            
            if status:
                jobs = [j for j in jobs if j.status == status]
            
            return jobs
            
        except Exception as e:
            logger.error(f"Failed to list jobs: {e}")
            return []
    
    def get_job(self, job_id: str) -> Optional[FlinkJob]:
        """获取作业详情"""
        try:
            response = requests.get(
                f'{self.flink_rest_url}/jobs/{job_id}',
                timeout=10
            )
            
            if response.status_code != 200:
                return None
            
            data = response.json()
            
            return FlinkJob(
                job_id=data.get('id'),
                job_name=data.get('name'),
                pipeline_id=self._extract_pipeline_id(data.get('name', '')),
                status=JobStatus(data.get('status', 'UNKNOWN')),
                start_time=datetime.fromisoformat(data.get('start-time')) if data.get('start-time') else None,
                parallelism=data.get('parallelism', 1)
            )
            
        except Exception as e:
            logger.error(f"Failed to get job {job_id}: {e}")
            return None
    
    def cancel_job(self, job_id: str) -> bool:
        """取消作业"""
        try:
            response = requests.patch(
                f'{self.flink_rest_url}/jobs/{job_id}/cancel',
                timeout=30
            )
            
            return response.status_code in (200, 202)
            
        except Exception as e:
            logger.error(f"Failed to cancel job {job_id}: {e}")
            return False
    
    def restart_job(self, job_id: str) -> bool:
        """重启作业"""
        try:
            # 先取消
            if not self.cancel_job(job_id):
                return False
            
            time.sleep(2)
            
            # TODO: 重新提交作业
            logger.info(f"Job {job_id} cancelled, please resubmit")
            return True
            
        except Exception as e:
            logger.error(f"Failed to restart job {job_id}: {e}")
            return False
    
    # ==================== 监控 ====================
    
    def get_job_metrics(self, job_id: str) -> Dict[str, Any]:
        """获取作业指标"""
        try:
            response = requests.get(
                f'{self.flink_rest_url}/jobs/{job_id}/metrics',
                timeout=10
            )
            
            if response.status_code != 200:
                return {}
            
            return response.json()
            
        except Exception as e:
            logger.error(f"Failed to get metrics for job {job_id}: {e}")
            return {}
    
    def get_overview(self) -> Dict[str, Any]:
        """获取集群概览"""
        try:
            response = requests.get(
                f'{self.flink_rest_url}/overview',
                timeout=10
            )
            
            if response.status_code != 200:
                return {}
            
            return response.json()
            
        except Exception as e:
            logger.error(f"Failed to get overview: {e}")
            return {}
    
    # ==================== 资源管理 ====================
    
    def update_job_parallelism(self, job_id: str, parallelism: int) -> bool:
        """更新作业并行度"""
        try:
            response = requests.patch(
                f'{self.flink_rest_url}/jobs/{job_id}',
                json={'parallelism': parallelism},
                timeout=30
            )
            
            return response.status_code == 200
            
        except Exception as e:
            logger.error(f"Failed to update parallelism: {e}")
            return False
    
    def get_task_managers(self) -> List[Dict[str, Any]]:
        """获取 Task Manager 列表"""
        try:
            response = requests.get(
                f'{self.flink_rest_url}/taskmanagers',
                timeout=10
            )
            
            if response.status_code != 200:
                return []
            
            data = response.json()
            return data.get('taskmanagers', [])
            
        except Exception as e:
            logger.error(f"Failed to get task managers: {e}")
            return []
    
    # ==================== 运维 ====================
    
    def save_job_state(self, filepath: str = '/tmp/flink_jobs_state.json'):
        """保存作业状态"""
        state = {
            'timestamp': datetime.utcnow().isoformat(),
            'jobs': [
                {
                    'job_id': j.job_id,
                    'job_name': j.job_name,
                    'pipeline_id': j.pipeline_id,
                    'status': j.status.value,
                    'version': j.version
                }
                for j in self.jobs.values()
            ]
        }
        
        with open(filepath, 'w') as f:
            json.dump(state, f, indent=2)
        
        logger.info(f"Job state saved to {filepath}")
    
    def _extract_pipeline_id(self, job_name: str) -> int:
        """从作业名称提取 Pipeline ID"""
        import re
        match = re.search(r'pipeline-(\d+)', job_name)
        if match:
            return int(match.group(1))
        return 0


class JobMonitor:
    """作业监控器"""
    
    def __init__(self, manager: FlinkJobManager, interval: int = 60):
        self.manager = manager
        self.interval = interval
        self.running = False
    
    def start(self):
        """启动监控"""
        self.running = True
        logger.info("Job monitor started")
        
        while self.running:
            try:
                self._check_jobs()
                self._check_alerts()
            except Exception as e:
                logger.error(f"Monitor error: {e}")
            
            time.sleep(self.interval)
    
    def stop(self):
        """停止监控"""
        self.running = False
        logger.info("Job monitor stopped")
    
    def _check_jobs(self):
        """检查作业状态"""
        jobs = self.manager.list_jobs()
        
        failed_jobs = [j for j in jobs if j.status == JobStatus.FAILED]
        if failed_jobs:
            logger.warning(f"Found {len(failed_jobs)} failed jobs: {[j.job_id for j in failed_jobs]}")
    
    def _check_alerts(self):
        """检查告警"""
        # TODO: 集成告警系统
        pass
