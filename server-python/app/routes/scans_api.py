"""
扫描任务 API 路由
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import ScanTask, ScanResult, ScanAgent, ScanProfile, Asset
from datetime import datetime
from sqlalchemy import or_

scans_api_bp = Blueprint('scans_api', __name__)


@scans_api_bp.route('/tasks', methods=['GET'])
@login_required
def get_tasks():
    """获取扫描任务列表"""
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 20, type=int)
    status = request.args.get('status')
    scan_type = request.args.get('type')
    
    query = ScanTask.query
    
    if status:
        query = query.filter(ScanTask.status == status)
    if scan_type:
        query = query.filter(ScanTask.type == scan_type)
    
    query = query.order_by(ScanTask.created_at.desc())
    pagination = query.paginate(page=page, per_page=page_size, error_out=False)
    
    return jsonify({
        'success': True,
        'data': {
            'items': [t.to_dict() for t in pagination.items],
            'total': pagination.total,
            'page': page,
            'page_size': page_size,
            'pages': pagination.pages
        }
    })


@scans_api_bp.route('/tasks', methods=['POST'])
@login_required
def create_task():
    """创建扫描任务"""
    data = request.get_json()
    
    # 生成任务ID
    year = datetime.utcnow().year
    task_count = ScanTask.query.filter(
        db.func.date(ScanTask.created_at) == datetime.utcnow().date()
    ).count() + 1
    task_code = f"SCAN-{year}-{task_count:03d}"
    
    task = ScanTask(
        name=data.get('name', task_code),
        type=data.get('type', 'port'),
        status='queued',
        target=data.get('target'),
        progress=0,
        results={}
    )
    
    db.session.add(task)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': task.to_dict()
    }), 201


@scans_api_bp.route('/tasks/<int:task_id>', methods=['GET'])
@login_required
def get_task(task_id):
    """获取任务详情"""
    task = ScanTask.query.get(task_id)
    if not task:
        return jsonify({'success': False, 'error': '任务不存在'}), 404
    
    task_dict = task.to_dict()
    
    # 添加扫描结果
    results = ScanResult.query.filter_by(task_id=task_id).all()
    task_dict['scan_results'] = [r.to_dict() for r in results]
    
    return jsonify({
        'success': True,
        'data': task_dict
    })


@scans_api_bp.route('/tasks/<int:task_id>', methods=['PUT'])
@login_required
def update_task(task_id):
    """更新任务"""
    data = request.get_json()
    
    task = ScanTask.query.get(task_id)
    if not task:
        return jsonify({'success': False, 'error': '任务不存在'}), 404
    
    if 'status' in data:
        task.status = data['status']
        if data['status'] == 'running' and not task.started_at:
            task.started_at = datetime.utcnow()
        elif data['status'] == 'completed':
            task.completed_at = datetime.utcnow()
            task.progress = 100
    if 'progress' in data:
        task.progress = data['progress']
    if 'results' in data:
        task.results = data['results']
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': task.to_dict()
    })


@scans_api_bp.route('/tasks/<int:task_id>', methods=['DELETE'])
@login_required
def delete_task(task_id):
    """删除任务"""
    task = ScanTask.query.get(task_id)
    if not task:
        return jsonify({'success': False, 'error': '任务不存在'}), 404
    
    # 删除扫描结果
    ScanResult.query.filter_by(task_id=task_id).delete()
    
    db.session.delete(task)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': '任务已删除'
    })


@scans_api_bp.route('/tasks/<int:task_id>/start', methods=['POST'])
@login_required
def start_task(task_id):
    """启动扫描任务"""
    task = ScanTask.query.get(task_id)
    if not task:
        return jsonify({'success': False, 'error': '任务不存在'}), 404
    
    if task.status not in ['queued', 'paused']:
        return jsonify({'success': False, 'error': '任务状态不允许启动'}), 400
    
    task.status = 'running'
    task.started_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': task.to_dict()
    })


@scans_api_bp.route('/tasks/<int:task_id>/pause', methods=['POST'])
@login_required
def pause_task(task_id):
    """暂停扫描任务"""
    task = ScanTask.query.get(task_id)
    if not task:
        return jsonify({'success': False, 'error': '任务不存在'}), 404
    
    if task.status != 'running':
        return jsonify({'success': False, 'error': '任务不在运行中'}), 400
    
    task.status = 'paused'
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': task.to_dict()
    })


@scans_api_bp.route('/tasks/<int:task_id>/resume', methods=['POST'])
@login_required
def resume_task(task_id):
    """恢复扫描任务"""
    task = ScanTask.query.get(task_id)
    if not task:
        return jsonify({'success': False, 'error': '任务不存在'}), 404
    
    if task.status != 'paused':
        return jsonify({'success': False, 'error': '任务不在暂停状态'}), 400
    
    task.status = 'running'
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': task.to_dict()
    })


@scans_api_bp.route('/tasks/<int:task_id>/retry', methods=['POST'])
@login_required
def retry_task(task_id):
    """重试扫描任务"""
    task = ScanTask.query.get(task_id)
    if not task:
        return jsonify({'success': False, 'error': '任务不存在'}), 404
    
    if task.status not in ['failed', 'completed']:
        return jsonify({'success': False, 'error': '任务状态不允许重试'}), 400
    
    task.status = 'queued'
    task.progress = 0
    task.started_at = None
    task.completed_at = None
    task.results = {}
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': task.to_dict()
    })


@scans_api_bp.route('/tasks/agents', methods=['GET'])
@login_required
def get_agents():
    """获取扫描代理列表"""
    agents = ScanAgent.query.all()
    return jsonify({
        'success': True,
        'data': [a.to_dict() for a in agents]
    })


@scans_api_bp.route('/tasks/profiles', methods=['GET'])
@login_required
def get_profiles():
    """获取扫描配置模板"""
    profiles = ScanProfile.query.all()
    return jsonify({
        'success': True,
        'data': [p.to_dict() for p in profiles]
    })


@scans_api_bp.route('/tasks/profiles', methods=['POST'])
@login_required
def create_profile():
    """创建扫描配置模板"""
    data = request.get_json()
    
    profile = ScanProfile(
        id=data.get('id', f"profile_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"),
        name=data.get('name'),
        type=data.get('type'),
        description=data.get('description'),
        config=data.get('config', {}),
        is_default=data.get('is_default', False)
    )
    
    db.session.add(profile)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': profile.to_dict()
    }), 201


@scans_api_bp.route('/tasks/stats', methods=['GET'])
@login_required
def get_stats():
    """获取扫描统计"""
    stats = {
        'total': ScanTask.query.count(),
        'running': ScanTask.query.filter(ScanTask.status == 'running').count(),
        'queued': ScanTask.query.filter(ScanTask.status == 'queued').count(),
        'completed': ScanTask.query.filter(ScanTask.status == 'completed').count(),
        'failed': ScanTask.query.filter(ScanTask.status == 'failed').count(),
        'by_type': {}
    }
    
    by_type = db.session.query(
        ScanTask.type,
        db.func.count(ScanTask.id)
    ).group_by(ScanTask.type).all()
    
    for scan_type, count in by_type:
        stats['by_type'][scan_type] = count
    
    return jsonify({
        'success': True,
        'data': stats
    })
