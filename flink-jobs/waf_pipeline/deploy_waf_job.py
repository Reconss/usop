#!/usr/bin/env python3
"""
WAF 日志接入 - 部署脚本
用于提交 Flink 作业处理 WAF 日志
"""

import os
import sys
import json
import logging
import argparse
import requests
from datetime import datetime

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# 配置
FLINK_REST_URL = os.getenv('FLINK_REST_URL', 'http://flink-jobmanager:8081')
KAFKA_BOOTSTRAP = os.getenv('KAFKA_BOOTSTRAP_SERVERS', 'kafka:29092')
JOB_NAME = 'WAF-Alert-Processor'


def check_flink():
    """检查 Flink 集群状态"""
    try:
        resp = requests.get(f'{FLINK_REST_URL}/overview', timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            logger.info(f"✅ Flink 集群正常: {data.get('taskmanagers')} TaskManagers, {data.get('slots-available')}/{data.get('slots-total')} Slots")
            return True
    except Exception as e:
        logger.error(f"❌ Flink 集群不可用: {e}")
    return False


def read_sql_file(sql_file):
    """读取 SQL 文件"""
    with open(sql_file, 'r') as f:
        return f.read()


def submit_job(sql_content):
    """提交 Flink SQL 作业"""
    # 使用 Flink SQL Gateway API (如果可用) 或本地执行
    logger.info("提交 Flink 作业...")
    
    # 方式1: 通过 SQL Gateway (推荐)
    try:
        resp = requests.post(
            f'{FLINK_REST_URL}/sql/gateway',
            json={'statement': sql_content},
            headers={'Content-Type': 'application/json'},
            timeout=30
        )
        if resp.status_code == 200:
            result = resp.json()
            job_id = result.get('jobId')
            logger.info(f"✅ 作业提交成功! Job ID: {job_id}")
            return job_id
    except Exception as e:
        logger.warning(f"SQL Gateway 方式失败: {e}")
    
    # 方式2: 生成 SQL 文件供手动提交
    sql_file = f'/tmp/flink_waf_job_{datetime.now().strftime("%Y%m%d%H%M%S")}.sql'
    with open(sql_file, 'w') as f:
        f.write(sql_content)
    logger.info(f"✅ SQL 文件已生成: {sql_file}")
    logger.info("请通过 Flink SQL Client 执行: flink-sql -f {sql_file}")
    
    return None


def submit_via_cli(sql_file):
    """通过 Flink SQL CLI 提交"""
    import subprocess
    
    cmd = [
        'docker', 'exec', 'flink-jobmanager',
        'flink', 'sql',
        '-f', f'/opt/flink/jobs/waf_pipeline/{os.path.basename(sql_file)}'
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode == 0:
            logger.info("✅ 作业提交成功")
            return True
        else:
            logger.error(f"❌ 提交失败: {result.stderr}")
            return False
    except Exception as e:
        logger.error(f"❌ 执行失败: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description='WAF 日志接入 Flink 作业部署')
    parser.add_argument('--check', action='store_true', help='检查 Flink 集群状态')
    parser.add_argument('--sql-file', default='waf_alert_job.sql', help='SQL 文件路径')
    parser.add_argument('--dry-run', action='store_true', help='仅显示 SQL 不提交')
    args = parser.parse_args()
    
    # 检查集群
    if args.check or True:  # 默认先检查
        if not check_flink():
            logger.error("Flink 集群不可用，请先启动服务")
            return 1
    
    # 读取 SQL
    sql_file = args.sql_file
    if not os.path.exists(sql_file):
        sql_file = f'flink-jobs/waf_pipeline/{args.sql_file}'
    
    if not os.path.exists(sql_file):
        logger.error(f"SQL 文件不存在: {sql_file}")
        return 1
    
    sql_content = read_sql_file(sql_file)
    logger.info(f"读取 SQL 文件: {sql_file}")
    logger.info(f"SQL 内容长度: {len(sql_content)} 字符")
    
    if args.dry_run:
        print("\n" + "="*60)
        print("生成的 Flink SQL:")
        print("="*60)
        print(sql_content)
        return 0
    
    # 提交作业
    job_id = submit_job(sql_content)
    
    if job_id:
        logger.info(f"🎉 作业已提交! Job ID: {job_id}")
        logger.info(f"查看作业状态: {FLINK_REST_URL}/#/job/{job_id}")
    else:
        logger.info("请手动提交 SQL 文件到 Flink")
    
    return 0


if __name__ == '__main__':
    sys.exit(main())
