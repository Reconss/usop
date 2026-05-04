from flask import Blueprint, request, jsonify
from app.database import db
from app.models import ScanTask, AuditLog
from app.routes.auth import login_required
from datetime import datetime

scans_bp = Blueprint('scans', __name__)


@scans_bp.route('/', methods=['GET'])
@login_required
def list_scans():
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 10, type=int)
    scan_type = request.args.get('type')
    status = request.args.get('status')

    query = ScanTask.query
    if scan_type:
        query = query.filter(ScanTask.type == scan_type)
    if status:
        query = query.filter(ScanTask.status == status)

    total = query.count()
    scans = query.order_by(ScanTask.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return jsonify({
        'success': True,
        'data': {
            'items': [s.to_dict() for s in scans],
            'total': total,
            'page': page,
            'limit': limit
        }
    })


@scans_bp.route('/<int:scan_id>', methods=['GET'])
@login_required
def get_scan(scan_id):
    scan = ScanTask.query.get(scan_id)
    if not scan:
        return jsonify({'success': False, 'error': '扫描任务不存在'}), 404

    return jsonify({
        'success': True,
        'data': scan.to_dict()
    })


@scans_bp.route('/', methods=['POST'])
@login_required
def create_scan():
    data = request.get_json()
    scan = ScanTask(
        name=data.get('name'),
        type=data.get('type'),
        target=data.get('target'),
        status='pending',
        progress=0,
        results={}
    )
    db.session.add(scan)
    db.session.commit()

    return jsonify({
        'success': True,
        'data': scan.to_dict()
    }), 201


@scans_bp.route('/<int:scan_id>', methods=['PUT'])
@login_required
def update_scan(scan_id):
    scan = ScanTask.query.get(scan_id)
    if not scan:
        return jsonify({'success': False, 'error': '扫描任务不存在'}), 404

    data = request.get_json()
    for key in ['name', 'type', 'target', 'status', 'progress', 'results']:
        if key in data:
            setattr(scan, key, data[key])

    db.session.commit()

    return jsonify({
        'success': True,
        'data': scan.to_dict()
    })


@scans_bp.route('/<int:scan_id>', methods=['DELETE'])
@login_required
def delete_scan(scan_id):
    scan = ScanTask.query.get(scan_id)
    if not scan:
        return jsonify({'success': False, 'error': '扫描任务不存在'}), 404

    db.session.delete(scan)
    db.session.commit()

    return jsonify({'success': True, 'message': '删除成功'})


@scans_bp.route('/types/list', methods=['GET'])
@login_required
def list_scan_types():
    return jsonify({
        'success': True,
        'data': [
            {'id': 'vulnerability', 'name': '漏洞扫描'},
            {'id': 'port', 'name': '端口扫描'},
            {'id': 'config', 'name': '配置审计'},
            {'id': 'compliance', 'name': '合规检查'}
        ]
    })