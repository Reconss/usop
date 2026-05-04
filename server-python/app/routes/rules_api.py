"""
检测规则 API 路由
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import DetectionRuleExtended, AuditLog
from datetime import datetime

rules_api_bp = Blueprint('rules_api', __name__)


@rules_api_bp.route('/rules', methods=['GET'])
@login_required
def get_rules():
    """获取检测规则列表"""
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 20, type=int)
    rule_type = request.args.get('type')
    status = request.args.get('status')
    search = request.args.get('search')
    
    query = DetectionRuleExtended.query
    
    if rule_type:
        query = query.filter(DetectionRuleExtended.type == rule_type)
    if status:
        query = query.filter(DetectionRuleExtended.status == status)
    if search:
        query = query.filter(
            db.or_(
                DetectionRuleExtended.name.ilike(f'%{search}%'),
                DetectionRuleExtended.id.ilike(f'%{search}%')
            )
        )
    
    query = query.order_by(DetectionRuleExtended.hit_count.desc())
    pagination = query.paginate(page=page, per_page=page_size, error_out=False)
    
    return jsonify({
        'success': True,
        'data': {
            'items': [r.to_dict() for r in pagination.items],
            'total': pagination.total,
            'page': page,
            'page_size': page_size,
            'pages': pagination.pages
        }
    })


@rules_api_bp.route('/rules', methods=['POST'])
@login_required
def create_rule():
    """创建检测规则"""
    data = request.get_json()
    
    year = datetime.utcnow().year
    rule_count = DetectionRuleExtended.query.count() + 1
    rule_id = f"RULE-{year}-{rule_count:03d}"
    
    rule = DetectionRuleExtended(
        id=rule_id,
        name=data.get('name'),
        type=data.get('type', 'single'),
        description=data.get('description'),
        rule_content=data.get('rule_content'),
        rule_language=data.get('rule_language', 'sigma'),
        severity=data.get('severity', 'medium'),
        status=data.get('status', 'disabled'),
        data_source_ids=data.get('data_source_ids', []),
        tags=data.get('tags', []),
        author=getattr(request, 'username', 'system')
    )
    
    db.session.add(rule)
    db.session.commit()
    
    # 记录审计日志
    audit = AuditLog(
        user_id=getattr(request, 'user_id', 1),
        username=getattr(request, 'username', 'system'),
        action='创建规则',
        module='rules',
        target=rule_id,
        details={'name': rule.name},
        ip=request.remote_addr
    )
    db.session.add(audit)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': rule.to_dict()
    }), 201


@rules_api_bp.route('/rules/<rule_id>', methods=['GET'])
@login_required
def get_rule(rule_id):
    """获取规则详情"""
    rule = DetectionRuleExtended.query.get(rule_id)
    if not rule:
        return jsonify({'success': False, 'error': '规则不存在'}), 404
    
    return jsonify({
        'success': True,
        'data': rule.to_dict()
    })


@rules_api_bp.route('/rules/<rule_id>', methods=['PUT'])
@login_required
def update_rule(rule_id):
    """更新规则"""
    data = request.get_json()
    
    rule = DetectionRuleExtended.query.get(rule_id)
    if not rule:
        return jsonify({'success': False, 'error': '规则不存在'}), 404
    
    if 'name' in data:
        rule.name = data['name']
    if 'type' in data:
        rule.type = data['type']
    if 'description' in data:
        rule.description = data['description']
    if 'rule_content' in data:
        rule.rule_content = data['rule_content']
    if 'rule_language' in data:
        rule.rule_language = data['rule_language']
    if 'severity' in data:
        rule.severity = data['severity']
    if 'status' in data:
        rule.status = data['status']
    if 'data_source_ids' in data:
        rule.data_source_ids = data['data_source_ids']
    if 'tags' in data:
        rule.tags = data['tags']
    
    rule.updated_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': rule.to_dict()
    })


@rules_api_bp.route('/rules/<rule_id>', methods=['DELETE'])
@login_required
def delete_rule(rule_id):
    """删除规则"""
    rule = DetectionRuleExtended.query.get(rule_id)
    if not rule:
        return jsonify({'success': False, 'error': '规则不存在'}), 404
    
    db.session.delete(rule)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': '规则已删除'
    })


@rules_api_bp.route('/rules/<rule_id>/toggle', methods=['POST'])
@login_required
def toggle_rule(rule_id):
    """启用/禁用规则"""
    rule = DetectionRuleExtended.query.get(rule_id)
    if not rule:
        return jsonify({'success': False, 'error': '规则不存在'}), 404
    
    rule.status = 'enabled' if rule.status == 'disabled' else 'disabled'
    rule.updated_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': rule.to_dict()
    })


@rules_api_bp.route('/rules/<rule_id>/test', methods=['POST'])
@login_required
def test_rule(rule_id):
    """测试规则"""
    rule = DetectionRuleExtended.query.get(rule_id)
    if not rule:
        return jsonify({'success': False, 'error': '规则不存在'}), 404
    
    data = request.get_json()
    test_data = data.get('test_data', [])
    
    # 模拟规则测试
    # 实际应该根据 rule_language 执行对应规则引擎
    test_results = []
    for item in test_data[:10]:  # 限制测试数据量
        test_results.append({
            'input': item,
            'matched': True,
            'timestamp': datetime.utcnow().isoformat()
        })
    
    return jsonify({
        'success': True,
        'data': {
            'rule_id': rule_id,
            'test_results': test_results,
            'total_tested': len(test_data)
        }
    })


@rules_api_bp.route('/rules/<rule_id>/hit', methods=['POST'])
@login_required
def record_hit(rule_id):
    """记录规则命中"""
    rule = DetectionRuleExtended.query.get(rule_id)
    if not rule:
        return jsonify({'success': False, 'error': '规则不存在'}), 404
    
    rule.hit_count += 1
    rule.last_hit_time = datetime.utcnow()
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': {'hit_count': rule.hit_count}
    })


@rules_api_bp.route('/rules/stats', methods=['GET'])
@login_required
def get_stats():
    """获取规则统计"""
    stats = {
        'total': DetectionRuleExtended.query.count(),
        'enabled': DetectionRuleExtended.query.filter(
            DetectionRuleExtended.status == 'enabled'
        ).count(),
        'by_type': {},
        'by_severity': {}
    }
    
    by_type = db.session.query(
        DetectionRuleExtended.type,
        db.func.count(DetectionRuleExtended.id)
    ).group_by(DetectionRuleExtended.type).all()
    stats['by_type'] = dict(by_type)
    
    by_severity = db.session.query(
        DetectionRuleExtended.severity,
        db.func.count(DetectionRuleExtended.id)
    ).group_by(DetectionRuleExtended.severity).all()
    stats['by_severity'] = dict(by_severity)
    
    return jsonify({
        'success': True,
        'data': stats
    })
