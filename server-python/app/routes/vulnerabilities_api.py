"""
漏洞管理 API 路由
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import Vulnerability, AssetVulnerability

vulnerabilities_api_bp = Blueprint('vulnerabilities_api', __name__)


@vulnerabilities_api_bp.route('/vulnerabilities', methods=['GET'])
@login_required
def get_vulnerabilities():
    """获取漏洞列表"""
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 20, type=int)
    severity = request.args.get('severity')
    search = request.args.get('search')
    
    query = Vulnerability.query
    
    if severity:
        query = query.filter(Vulnerability.severity == severity)
    if search:
        query = query.filter(
            db.or_(
                Vulnerability.name.ilike(f'%{search}%'),
                Vulnerability.id.ilike(f'%{search}%')
            )
        )
    
    query = query.order_by(Vulnerability.cvss_score.desc())
    pagination = query.paginate(page=page, per_page=page_size, error_out=False)
    
    items = []
    for vuln in pagination.items:
        vuln_dict = vuln.to_dict()
        # 添加受影响的资产数量
        affected_count = AssetVulnerability.query.filter_by(vuln_id=vuln.id).count()
        vuln_dict['affected_assets'] = affected_count
        items.append(vuln_dict)
    
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


@vulnerabilities_api_bp.route('/vulnerabilities/<vuln_id>', methods=['GET'])
@login_required
def get_vulnerability(vuln_id):
    """获取漏洞详情"""
    vuln = Vulnerability.query.get(vuln_id)
    if not vuln:
        return jsonify({'success': False, 'error': '漏洞不存在'}), 404
    
    vuln_dict = vuln.to_dict()
    
    # 添加受影响的资产列表
    affected = AssetVulnerability.query.filter_by(vuln_id=vuln_id).all()
    vuln_dict['affected_assets'] = [a.to_dict() for a in affected]
    
    return jsonify({
        'success': True,
        'data': vuln_dict
    })


@vulnerabilities_api_bp.route('/vulnerabilities/stats', methods=['GET'])
@login_required
def get_stats():
    """获取漏洞统计"""
    stats = {
        'total': Vulnerability.query.count(),
        'by_severity': {
            'critical': Vulnerability.query.filter(Vulnerability.severity == 'critical').count(),
            'high': Vulnerability.query.filter(Vulnerability.severity == 'high').count(),
            'medium': Vulnerability.query.filter(Vulnerability.severity == 'medium').count(),
            'low': Vulnerability.query.filter(Vulnerability.severity == 'low').count()
        },
        'total_affected': AssetVulnerability.query.count(),
        'open_vulnerabilities': AssetVulnerability.query.filter(AssetVulnerability.status == 'open').count(),
        'fixed_vulnerabilities': AssetVulnerability.query.filter(AssetVulnerability.status == 'fixed').count()
    }
    
    return jsonify({
        'success': True,
        'data': stats
    })


@vulnerabilities_api_bp.route('/vulnerabilities', methods=['POST'])
@login_required
def create_vulnerability():
    """创建漏洞"""
    data = request.get_json()
    
    vuln = Vulnerability(
        id=data.get('id'),
        name=data.get('name'),
        description=data.get('description'),
        cvss_score=data.get('cvss_score', 0),
        severity=data.get('severity', 'medium'),
        category=data.get('category'),
        cve_id=data.get('cve_id'),
        solution=data.get('solution')
    )
    
    db.session.add(vuln)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': vuln.to_dict()
    }), 201


@vulnerabilities_api_bp.route('/vulnerabilities/<vuln_id>', methods=['PUT'])
@login_required
def update_vulnerability(vuln_id):
    """更新漏洞"""
    vuln = Vulnerability.query.get(vuln_id)
    if not vuln:
        return jsonify({'success': False, 'error': '漏洞不存在'}), 404
    
    data = request.get_json()
    
    if 'name' in data:
        vuln.name = data['name']
    if 'description' in data:
        vuln.description = data['description']
    if 'cvss_score' in data:
        vuln.cvss_score = data['cvss_score']
    if 'severity' in data:
        vuln.severity = data['severity']
    if 'solution' in data:
        vuln.solution = data['solution']
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': vuln.to_dict()
    })


@vulnerabilities_api_bp.route('/vulnerabilities/<vuln_id>', methods=['DELETE'])
@login_required
def delete_vulnerability(vuln_id):
    """删除漏洞"""
    vuln = Vulnerability.query.get(vuln_id)
    if not vuln:
        return jsonify({'success': False, 'error': '漏洞不存在'}), 404
    
    # 删除关联的资产漏洞
    AssetVulnerability.query.filter_by(vuln_id=vuln_id).delete()
    
    db.session.delete(vuln)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': '漏洞已删除'
    })
