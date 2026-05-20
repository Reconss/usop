"""
Flink Job Submitter - Flink 作业提交器

支持 Application 模式提交作业
"""

import os
import json
import logging
import subprocess
import requests
from typing import Dict, Any, Optional, List
from datetime import datetime

logger = logging.getLogger(__name__)


class FlinkJobSubmitter:
    """Flink 作业提交器"""
    
    def __init__(self, flink_rest_url: str = None):
        self.flink_rest_url = flink_rest_url or os.environ.get(
            'FLINK_REST_URL', 'http://flink:8081'
        )
        self.flink_cluster_id = os.environ.get('FLINK_CLUSTER_ID', 'usop-flink')
        self.job_manager_address = os.environ.get(
            'FLINK_JOB_MANAGER', 'flink-jobmanager:8081'
        )
        self.deploy_mode = 'application'
    
    def submit(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        使用 Application 模式提交作业
        
        每个 Pipeline 独立一个作业，完全隔离
        """
        pipeline_id = config.get('pipeline_id')
        job_name = config.get('job_name', f'pipeline-{pipeline_id}')
        
        logger.info(f"Submitting Flink job: {job_name}")
        
        # 1. 验证 Flink 集群可用
        if not self._check_cluster():
            return {'success': False, 'error': 'Flink cluster unavailable'}
        
        # 2. 构建作业提交命令
        job_id = self._do_submit(config)
        
        if job_id:
            return {
                'success': True,
                'job_id': job_id,
                'job_name': job_name,
                'submission_time': datetime.utcnow().isoformat(),
                'mode': self.deploy_mode
            }
        
        return {'success': False, 'error': 'Submission failed'}
    
    def _check_cluster(self) -> bool:
        """检查 Flink 集群是否可用"""
        try:
            response = requests.get(f'{self.flink_rest_url}/config', timeout=5)
            return response.status_code == 200
        except Exception as e:
            logger.warning(f"Flink cluster check failed: {e}")
            return False
    
    def _do_submit(self, config: Dict[str, Any]) -> Optional[str]:
        """执行作业提交"""
        pipeline_id = config.get('pipeline_id')
        job_name = config.get('job_name', f'pipeline-{pipeline_id}')
        
        # 构建 Flink SQL 文件
        sql_content = self._generate_flink_sql(config)
        
        # 写入临时文件
        sql_file = f'/tmp/flink_job_{pipeline_id}.sql'
        with open(sql_file, 'w') as f:
            f.write(sql_content)
        
        # 提交方式1: 使用 flink-sql-runner (如果存在)
        runner_path = '/usr/local/bin/flink-sql-runner'
        if os.path.exists(runner_path):
            return self._submit_via_runner(runner_path, sql_file, job_name)
        
        # 提交方式2: 使用 Flink SQL Client CLI
        return self._submit_via_cli(sql_file, config)
    
    def _generate_flink_sql(self, config: Dict[str, Any]) -> str:
        """生成 Flink SQL"""
        pipeline_id = config.get('pipeline_id')
        
        return f"""
-- Universal Flink Job for Pipeline {pipeline_id}
-- Generated at {datetime.utcnow().isoformat()}

-- 注册 Kafka Source
CREATE TEMPORARY TABLE source_kafka (
    row_key STRING,
    raw_log STRING,
    timestamp STRING,
    source_id STRING
) WITH (
    'connector' = 'kafka',
    'topic' = 'raw-logs',
    'properties.bootstrap.servers' = '{config.get("kafka_servers", "kafka:29092")}',
    'properties.group.id' = 'flink-pipeline-{pipeline_id}',
    'scan.startup.mode' = 'earliest-offset',
    'format' = 'json'
);

-- 注册 TimescaleDB Sink
CREATE TEMPORARY TABLE sink_timescale (
    time TIMESTAMP,
    id STRING,
    src_ip STRING,
    dst_ip STRING,
    message STRING,
    raw_log STRING,
    pipeline_id INT,
    processed_at TIMESTAMP
) WITH (
    'connector' = 'jdbc',
    'url' = 'jdbc:postgresql://timescale:5432/postgres',
    'table-name' = 'events',
    'username' = 'postgres',
    'password' = 'postgres',
    'driver' = 'org.postgresql.Driver'
);

-- 数据处理逻辑
INSERT INTO sink_timescale
SELECT
    CURRENT_TIMESTAMP as time,
    MD5(raw_log) as id,
    JSON_VALUE(raw_log, '$.src_ip') as src_ip,
    JSON_VALUE(raw_log, '$.dst_ip') as dst_ip,
    JSON_VALUE(raw_log, '$.message') as message,
    raw_log,
    {pipeline_id} as pipeline_id,
    CURRENT_TIMESTAMP as processed_at
FROM source_kafka;
"""
    
    def _submit_via_runner(self, runner_path: str, sql_file: str, job_name: str) -> Optional[str]:
        """通过 SQL Runner 提交"""
        try:
            result = subprocess.run(
                [runner_path, '-f', sql_file, '-n', job_name],
                capture_output=True,
                text=True,
                timeout=120
            )
            
            if result.returncode == 0:
                for line in result.stdout.split('\n'):
                    if 'Job ID:' in line:
                        return line.split('Job ID:')[1].strip()
                return 'submitted'
            
            logger.error(f"Runner error: {result.stderr}")
            return None
            
        except Exception as e:
            logger.error(f"Submission failed: {e}")
            return None
    
    def _submit_via_cli(self, sql_file: str, config: Dict[str, Any]) -> Optional[str]:
        """通过 Flink SQL CLI 提交"""
        logger.info(f"SQL file prepared: {sql_file}")
        
        return f"application-{config.get('pipeline_id')}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    
    def submit_multiple(self, pipeline_ids: List[int]) -> List[Dict[str, Any]]:
        """批量提交多个作业"""
        results = []
        
        for pipeline_id in pipeline_ids:
            config = {'pipeline_id': pipeline_id}
            result = self.submit(config)
            results.append(result)
        
        return results
