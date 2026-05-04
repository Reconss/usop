"""
资产管理 API 路由
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import Asset, AssetVulnerability, AssetPort, Vulnerability, AuditLog
from datetime import datetime
from sqlalchemy import or_

assets_api_bp = Blueprint('assets_api', __name__)


@assets_api_bp.route('/assets', methods=['GET'])
@login_required
def get_assets():
    """获取资产列表"""
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 20, type=int)
    search = request.args.get('search')
    asset_type = request.args.get('type')
    status = request.args.get('status')
    min_risk = request.args.get('min_risk', type=int)
    max_risk = request.args.get('max_risk', type=int)
    
    query = Asset.query
    
    if search:
        query = query.filter(
            or_(
                Asset.name.ilike(f'%{search}%'),
                Asset.ip.ilike(f'%{search}%')
            )
        )
    if asset_type:
        query = query.filter(Asset.type == asset_type)
    if status:
        query = query.filter(Asset.status == status)
    if min_risk is not None:
        query = query.filter(Asset.risk_score >= min_risk)
    if max_risk is not None:
        query = query.filter(Asset.risk_score <= max_risk)
    
    query = query.order_by(Asset.risk_score.desc())
    pagination = query.paginate(page=page, per_page=page_size, error_out=False)
    
    items = []
    for asset in pagination.items:
        asset_dict = asset.to_dict()
        # 添加漏洞统计
        vuln_stats = db.session.query(
            AssetVulnerability.severity,
            db.func.count(AssetVulnerability.id)
        ).filter(
            AssetVulnerability.asset_id == asset.id
        ).group_by(AssetVulnerability.severity).all()
        
        stats = {'critical': 0, 'high': 0, 'medium': 0, 'low': 0, 'total': 0}
        for severity, count in vuln_stats:
            if severity in stats:
                stats[severity] = count
                stats['total'] += count
        
        asset_dict['vulnStats'] = stats
        
        # 添加端口信息
        ports = AssetPort.query.filter_by(asset_id=asset.id).all()
        asset_dict['ports'] = [p.to_dict() for p in ports]
        
        items.append(asset_dict)
    
    return jsonify({
        'success': True,
        'data': {
            'items': items,
            'total': pagination.total,
            'page': page,
            'page_size': page_size,
            'pages': pagination.pages
        }
    })


@assets_api_bp.route('/assets/<int:asset_id>', methods=['GET'])
@login_required
def get_asset(asset_id):
    """获取资产详情"""
    asset = Asset.query.get(asset_id)
    if not asset:
        return jsonify({'success': False, 'error': '资产不存在'}), 404
    
    asset_dict = asset.to_dict()
    
    # 添加漏洞统计
    vuln_stats = db.session.query(
        AssetVulnerability.severity,
        db.func.count(AssetVulnerability.id)
    ).filter(
        AssetVulnerability.asset_id == asset.id
    ).group_by(AssetVulnerability.severity).all()
    
    stats = {'critical': 0, 'high': 0, 'medium': 0, 'low': 0, 'total': 0}
    for severity, count in vuln_stats:
        if severity in stats:
            stats[severity] = count
            stats['total'] += count
    
    asset_dict['vulnStats'] = stats
    
    # 添加端口信息
    ports = AssetPort.query.filter_by(asset_id=asset.id).all()
    asset_dict['ports'] = [p.to_dict() for p in ports]
    
    # 添加漏洞列表
    vulns = AssetVulnerability.query.filter_by(asset_id=asset.id).all()
    asset_dict['vulnerabilities'] = [v.to_dict() for v in vulns]
    
    return jsonify({
        'success': True,
        'data': asset_dict
    })


@assets_api_bp.route('/assets', methods=['POST'])
@login_required
def create_asset():
    """创建资产"""
    data = request.get_json()
    
    asset = Asset(
        name=data.get('name'),
        type=data.get('type', 'ip'),
        ip=data.get('ip'),
        status=data.get('status', 'pending'),
        risk_score=data.get('risk_score', 0),
        tags=data.get('tags', []),
        extra_data=data.get('metadata', {})
    )
    
    db.session.add(asset)
    db.session.commit()
    
    # 记录审计日志
    audit = AuditLog(
        user_id=getattr(request, 'user_id', 1),
        username=getattr(request, 'username', 'system'),
        action='创建资产',
        module='assets',
        target=asset.name,
        details={'asset_id': asset.id},
        ip=request.remote_addr
    )
    db.session.add(audit)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': asset.to_dict()
    }), 201


@assets_api_bp.route('/assets/<int:asset_id>', methods=['PUT'])
@login_required
def update_asset(asset_id):
    """更新资产"""
    data = request.get_json()
    
    asset = Asset.query.get(asset_id)
    if not asset:
        return jsonify({'success': False, 'error': '资产不存在'}), 404
    
    if 'name' in data:
        asset.name = data['name']
    if 'type' in data:
        asset.type = data['type']
    if 'ip' in data:
        asset.ip = data['ip']
    if 'status' in data:
        asset.status = data['status']
    if 'risk_score' in data:
        asset.risk_score = data['risk_score']
    if 'tags' in data:
        asset.tags = data['tags']
    if 'metadata' in data:
        asset.extra_data = data['metadata']
    
    asset.updated_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': asset.to_dict()
    })


@assets_api_bp.route('/assets/<int:asset_id>', methods=['DELETE'])
@login_required
def delete_asset(asset_id):
    """删除资产"""
    asset = Asset.query.get(asset_id)
    if not asset:
        return jsonify({'success': False, 'error': '资产不存在'}), 404
    
    # 删除关联数据
    AssetPort.query.filter_by(asset_id=asset.id).delete()
    AssetVulnerability.query.filter_by(asset_id=asset.id).delete()
    
    db.session.delete(asset)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': '资产已删除'
    })


@assets_api_bp.route('/assets/batch', methods=['DELETE'])
@login_required
def batch_delete():
    """批量删除资产"""
    data = request.get_json()
    asset_ids = data.get('asset_ids', [])
    
    if not asset_ids:
        return jsonify({'success': False, 'error': '缺少资产ID列表'}), 400
    
    # 删除关联数据
    AssetPort.query.filter(AssetPort.asset_id.in_(asset_ids)).delete(synchronize_session=False)
    AssetVulnerability.query.filter(AssetVulnerability.asset_id.in_(asset_ids)).delete(synchronize_session=False)
    
    deleted = Asset.query.filter(Asset.id.in_(asset_ids)).delete(synchronize_session=False)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': {'deleted_count': deleted}
    })


@assets_api_bp.route('/assets/<int:asset_id>/ports', methods=['GET'])
@login_required
def get_asset_ports(asset_id):
    """获取资产端口列表"""
    ports = AssetPort.query.filter_by(asset_id=asset_id).order_by(AssetPort.port).all()
    return jsonify({
        'success': True,
        'data': [p.to_dict() for p in ports]
    })


@assets_api_bp.route('/assets/<int:asset_id>/ports', methods=['POST'])
@login_required
def add_asset_port(asset_id):
    """添加资产端口"""
    data = request.get_json()
    
    port = AssetPort(
        asset_id=asset_id,
        port=data.get('port'),
        protocol=data.get('protocol', 'tcp'),
        service=data.get('service'),
        version=data.get('version'),
        state=data.get('state', 'open'),
        banner=data.get('banner')
    )
    
    db.session.add(port)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': port.to_dict()
    }), 201


@assets_api_bp.route('/assets/<int:asset_id>/vulnerabilities', methods=['GET'])
@login_required
def get_asset_vulnerabilities(asset_id):
    """获取资产漏洞列表"""
    vulns = AssetVulnerability.query.filter_by(asset_id=asset_id).all()
    return jsonify({
        'success': True,
        'data': [v.to_dict() for v in vulns]
    })


@assets_api_bp.route('/assets/<int:asset_id>/vulnerabilities/<vuln_id>', methods=['PUT'])
@login_required
def update_vulnerability_status(asset_id, vuln_id):
    """更新漏洞状态"""
    data = request.get_json()
    
    vuln = AssetVulnerability.query.filter_by(
        asset_id=asset_id, 
        vuln_id=vuln_id
    ).first()
    
    if not vuln:
        return jsonify({'success': False, 'error': '漏洞不存在'}), 404
    
    if 'status' in data:
        vuln.status = data['status']
        if data['status'] == 'fixed':
            vuln.fixed_at = datetime.utcnow()
    if 'assignee' in data:
        vuln.assignee = data['assignee']
    if 'notes' in data:
        vuln.notes = data['notes']
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': vuln.to_dict()
    })


@assets_api_bp.route('/assets/stats', methods=['GET'])
@login_required
def get_stats():
    """获取资产统计"""
    total = Asset.query.count()
    by_type = db.session.query(
        Asset.type,
        db.func.count(Asset.id)
    ).group_by(Asset.type).all()
    
    by_status = db.session.query(
        Asset.status,
        db.func.count(Asset.id)
    ).group_by(Asset.status).all()
    
    risk_distribution = {
        'critical': Asset.query.filter(Asset.risk_score >= 80).count(),
        'high': Asset.query.filter(Asset.risk_score >= 60, Asset.risk_score < 80).count(),
        'medium': Asset.query.filter(Asset.risk_score >= 40, Asset.risk_score < 60).count(),
        'low': Asset.query.filter(Asset.risk_score < 40).count()
    }
    
    return jsonify({
        'success': True,
        'data': {
            'total': total,
            'by_type': dict(by_type),
            'by_status': dict(by_status),
            'risk_distribution': risk_distribution
        }
    })


@assets_api_bp.route('/assets/export', methods=['GET'])
@login_required
def export_assets():
    """导出资产"""
    assets = Asset.query.order_by(Asset.risk_score.desc()).all()
    
    export_data = []
    for asset in assets:
        export_data.append({
            'id': asset.id,
            'name': asset.name,
            'type': asset.type,
            'ip': asset.ip,
            'status': asset.status,
            'risk_score': asset.risk_score,
            'tags': asset.tags,
            'created_at': asset.created_at.isoformat() if asset.created_at else None
        })
    
    return jsonify({
        'success': True,
        'data': export_data
    })
