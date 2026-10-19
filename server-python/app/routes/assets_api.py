"""资产管理 API 路由

参考 TestNet 资产管理系统的攻击面视角：
- metadata 承载责任人/部门/位置/描述等业务属性（owner/department/location/description）
- stats 提供攻击面总览（开放端口、未修复漏洞、Web 暴露、子域名）
- topology 提供资产-服务攻击面关系图数据
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import Asset, AssetVulnerability, AssetPort, Vulnerability, AuditLog
from datetime import datetime
from sqlalchemy import or_

assets_api_bp = Blueprint('assets_api', __name__)

# extra_data 中的业务属性键（与前端表单一一对应）
META_KEYS = ('owner', 'department', 'location', 'description')


def _merge_meta(asset_dict: dict) -> dict:
    """把 extra_data 中的业务属性提到顶层，便于前端直接渲染"""
    meta = asset_dict.get('metadata') or {}
    for key in META_KEYS:
        if meta.get(key) is not None:
            asset_dict[key] = meta[key]
    return asset_dict


def _looks_like_ip(text: str) -> bool:
    parts = text.split('.')
    return len(parts) == 4 and all(p.isdigit() and 0 <= int(p) <= 255 for p in parts)


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
                Asset.ip.ilike(f'%{search}%'),
                Asset.domain.ilike(f'%{search}%'),
                Asset.hostname.ilike(f'%{search}%')
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
        asset_dict = _merge_meta(asset.to_dict())
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

    asset_dict = _merge_meta(asset.to_dict())

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

    if not (data.get('name') or '').strip():
        return jsonify({'success': False, 'error': '资产名称不能为空'}), 400

    name = data['name'].strip()
    # 业务属性统一进 metadata（extra_data），与扫描结果数据隔离
    meta_in = data.get('metadata') or {}
    metadata = {k: meta_in[k] for k in META_KEYS if meta_in.get(k)}

    asset = Asset(
        name=name,
        type=data.get('type', 'ip'),
        ip=data.get('ip') or (name if _looks_like_ip(name) else None),
        domain=data.get('domain'),
        hostname=data.get('hostname'),
        status=data.get('status', 'pending'),
        risk_score=data.get('risk_score', 0),
        tags=data.get('tags', []),
        extra_data=metadata
    )
    
    db.session.add(asset)
    db.session.commit()
    
    # 记录审计日志
    _cu = getattr(request, 'current_user', None) or {}
    audit = AuditLog(
        user_id=_cu.get('user_id', 1),
        username=(_cu.get('username') or 'system'),
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
        # 业务属性合并进 extra_data（保留 web_results/subdomains 等扫描数据）
        extra = dict(asset.extra_data or {})
        meta_in = data.get('metadata') or {}
        for key in META_KEYS:
            if key in meta_in:
                extra[key] = meta_in[key]
        asset.extra_data = extra

    asset.updated_at = datetime.utcnow()
    db.session.commit()

    return jsonify({
        'success': True,
        'data': _merge_meta(asset.to_dict())
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
    """获取攻击面总览统计"""
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

    # 攻击面扩展统计（全部真实查询）
    open_ports = AssetPort.query.filter(AssetPort.state == 'open').count()
    open_vulns = AssetVulnerability.query.filter(AssetVulnerability.status == 'open').count()

    web_assets = 0
    subdomain_total = 0
    for extra, in db.session.query(Asset.extra_data).all():
        if not extra:
            continue
        if extra.get('web_results'):
            web_assets += 1
        subdomain_total += len(extra.get('subdomains') or [])

    return jsonify({
        'success': True,
        'data': {
            'total': total,
            'by_type': dict(by_type),
            'by_status': dict(by_status),
            'risk_distribution': risk_distribution,
            'open_ports': open_ports,
            'open_vulns': open_vulns,
            'web_assets': web_assets,
            'subdomain_total': subdomain_total
        }
    })


@assets_api_bp.route('/assets/topology', methods=['GET'])
@login_required
def get_topology():
    """攻击面关系图数据：Top 风险资产与其开放端口/服务（ECharts 力导向图）"""
    limit = request.args.get('limit', 20, type=int)
    assets = Asset.query.order_by(
        db.func.coalesce(Asset.assessed_risk_score, Asset.risk_score).desc()
    ).limit(limit).all()

    nodes = []
    links = []
    seen_services = {}

    for asset in assets:
        score = asset.assessed_risk_score if asset.assessed_risk_score is not None else (asset.risk_score or 0)
        nodes.append({
            'id': f'asset-{asset.id}',
            'name': asset.name,
            'category': 0,
            'value': score,
            'symbolSize': 28 + min(score, 100) * 0.4
        })
        ports = AssetPort.query.filter_by(asset_id=asset.id, state='open').all()
        for p in ports:
            svc = p.service or f'{p.port}/{p.protocol}'
            node_id = f'svc-{asset.id}-{p.port}'
            if node_id not in seen_services:
                seen_services[node_id] = True
                nodes.append({
                    'id': node_id,
                    'name': f'{p.port} {svc}'.strip(),
                    'category': 1,
                    'symbolSize': 16
                })
            links.append({'source': f'asset-{asset.id}', 'target': node_id})

    return jsonify({
        'success': True,
        'data': {
            'nodes': nodes,
            'links': links,
            'asset_count': len(assets)
        }
    })


@assets_api_bp.route('/assets/sync-scan/<int:task_id>', methods=['POST'])
@login_required
def sync_scan_results(task_id):
    """将扫描任务结果同步到资产清单（端口、漏洞、HTTP指纹等）"""
    from app.models import ScanResult, ScanTask
    task = ScanTask.query.get(task_id)
    if not task:
        return jsonify({'success': False, 'error': '任务不存在'}), 404

    results = ScanResult.query.filter_by(task_id=task_id).all()
    imported = {"ports": 0, "vulns": 0, "web": 0, "subdomains": 0}
    errors = []

    for sr in results:
        target = sr.target
        data = sr.result_data or sr.data or {}
        scan_type = sr.result_type or sr.type or ""

        # 查找或创建资产
        asset = Asset.query.filter(
            db.or_(Asset.ip == target, Asset.name == target)
        ).first()
        if not asset:
            # 自动创建资产
            asset = Asset(
                name=target,
                type="ip" if target[0].isdigit() else "domain",
                ip=target if target[0].isdigit() else None,
                domain=target if not target[0].isdigit() else None,
                status="online"
            )
            db.session.add(asset)
            db.session.flush()

        try:
            if scan_type in ("port", "naabu", "masscan") and data.get("port"):
                port_num = data["port"]
                existing = AssetPort.query.filter_by(
                    asset_id=asset.id, port=port_num
                ).first()
                if not existing:
                    ap = AssetPort(
                        asset_id=asset.id,
                        port=port_num,
                        protocol=data.get("protocol", "tcp"),
                        service=data.get("service", ""),
                        version=data.get("version", ""),
                        state="open"
                    )
                    db.session.add(ap)
                    imported["ports"] += 1

            elif scan_type in ("web", "httpx") and data.get("url"):
                # 保存 HTTP 指纹到 extra_data
                web_info = {
                    "url": data.get("url", ""),
                    "status_code": data.get("status_code", 0),
                    "title": data.get("title", ""),
                    "tech": data.get("tech", []),
                    "server": data.get("server", ""),
                    "content_type": data.get("content_type", ""),
                    "discovered_at": datetime.utcnow().isoformat()
                }
                web_results = asset.extra_data.get("web_results", []) if asset.extra_data else []
                # 去重
                existing_urls = {w.get("url") for w in web_results}
                if web_info["url"] not in existing_urls:
                    web_results.append(web_info)
                extra = asset.extra_data or {}
                extra["web_results"] = web_results[:50]
                asset.extra_data = extra
                imported["web"] += 1

            elif scan_type in ("vuln", "nuclei") and data.get("name"):
                # 创建漏洞关联
                vuln_id = f"scan-{hash(data.get('template', data.get('name', ''))) % 10**8}"
                vuln = Vulnerability.query.get(vuln_id)
                if not vuln:
                    vuln = Vulnerability(
                        id=vuln_id,
                        name=data.get("name", "Unknown"),
                        severity=data.get("severity", "medium"),
                        description=data.get("description", ""),
                        category="scan"
                    )
                    db.session.add(vuln)
                    db.session.flush()

                existing_av = AssetVulnerability.query.filter_by(
                    asset_id=asset.id, vuln_id=vuln_id
                ).first()
                if not existing_av:
                    av = AssetVulnerability(
                        asset_id=asset.id,
                        vuln_id=vuln_id,
                        vulnerability=vuln,
                        severity=data.get("severity", "medium"),
                        status="open",
                        evidence=data.get("matched", ""),
                        plugin_name=data.get("template", "")
                    )
                    db.session.add(av)
                    imported["vulns"] += 1

            elif scan_type in ("subdomain", "dns") and data.get("subdomain"):
                sub = data["subdomain"]
                ip = data.get("ip", "")
                # 每个子域名创建独立资产
                sub_asset = Asset.query.filter(
                    db.or_(Asset.name == sub, Asset.ip == ip)
                ).first()
                if not sub_asset:
                    sub_asset = Asset(
                        name=sub,
                        type="domain",
                        ip=ip if ip else None,
                        domain=sub,
                        hostname=sub.split('.', 1)[1] if '.' in sub else sub,
                        status="online"
                    )
                    db.session.add(sub_asset)
                    db.session.flush()
                # 同时记录到主资产的子域名列表
                subs = asset.extra_data.get("subdomains", []) if asset.extra_data else []
                if sub not in subs:
                    subs.append(sub)
                extra = asset.extra_data or {}
                extra["subdomains"] = subs
                asset.extra_data = extra
                imported["subdomains"] += 1

        except Exception as e:
            errors.append({"target": target, "error": str(e)})

    if any(imported.values()):
        asset.last_scan_at = datetime.utcnow()
        asset.last_scan_id = task_id
        db.session.commit()

    return jsonify({
        "success": True,
        "data": {"imported": imported, "errors": errors if errors else None}
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
