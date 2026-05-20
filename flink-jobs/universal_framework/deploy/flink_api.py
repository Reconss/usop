#!/usr/bin/env python3
"""
Flink Job Platform API

提供 REST API 用于平台化提交和管理 Flink 作业
"""

import os
import sys
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS

# 添加路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from deploy.job_submitter import FlinkJobSubmitter
from deploy.job_manager import FlinkJobManager

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# 初始化
submitter = FlinkJobSubmitter()
manager = FlinkJobManager()


@app.route('/health', methods=['GET'])
def health():
    """健康检查"""
    return jsonify({'status': 'ok'})


@app.route('/api/flink/jobs', methods=['POST'])
def submit_job():
    """提交 Flink 作业"""
    data = request.get_json()
    
    if not data or not data.get('pipeline_id'):
        return jsonify({
            'success': False,
            'error': 'pipeline_id is required'
        }), 400
    
    result = submitter.submit(data)
    
    return jsonify(result)


@app.route('/api/flink/jobs', methods=['GET'])
def list_jobs():
    """列出所有作业"""
    status = request.args.get('status')
    
    jobs = manager.list_jobs()
    
    # 过滤状态
    if status:
        jobs = [j for j in jobs if j.status.value == status]
    
    return jsonify({
        'success': True,
        'data': [
            {
                'job_id': j.job_id,
                'job_name': j.job_name,
                'pipeline_id': j.pipeline_id,
                'status': j.status.value,
                'start_time': j.start_time.isoformat() if j.start_time else None,
                'parallelism': j.parallelism
            }
            for j in jobs
        ]
    })


@app.route('/api/flink/jobs/<job_id>', methods=['GET'])
def get_job(job_id):
    """获取作业详情"""
    job = manager.get_job(job_id)
    
    if not job:
        return jsonify({
            'success': False,
            'error': 'Job not found'
        }), 404
    
    return jsonify({
        'success': True,
        'data': {
            'job_id': job.job_id,
            'job_name': job.job_name,
            'pipeline_id': job.pipeline_id,
            'status': job.status.value,
            'start_time': job.start_time.isoformat() if job.start_time else None,
            'parallelism': job.parallelism
        }
    })


@app.route('/api/flink/jobs/<job_id>/cancel', methods=['POST'])
def cancel_job(job_id):
    """取消作业"""
    success = manager.cancel_job(job_id)
    
    return jsonify({
        'success': success,
        'message': 'Job cancelled' if success else 'Failed to cancel job'
    })


@app.route('/api/flink/jobs/<job_id>/restart', methods=['POST'])
def restart_job(job_id):
    """重启作业"""
    success = manager.restart_job(job_id)
    
    return jsonify({
        'success': success,
        'message': 'Job restarted' if success else 'Failed to restart job'
    })


@app.route('/api/flink/overview', methods=['GET'])
def overview():
    """集群概览"""
    data = manager.get_overview()
    
    return jsonify({
        'success': True,
        'data': data
    })


@app.route('/api/flink/taskmanagers', methods=['GET'])
def task_managers():
    """Task Manager 列表"""
    tms = manager.get_task_managers()
    
    return jsonify({
        'success': True,
        'data': tms
    })


@app.route('/api/flink/jobs/<job_id>/metrics', methods=['GET'])
def job_metrics(job_id):
    """作业指标"""
    metrics = manager.get_job_metrics(job_id)
    
    return jsonify({
        'success': True,
        'data': metrics
    })


if __name__ == '__main__':
    port = int(os.environ.get('FLINK_API_PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=False)
