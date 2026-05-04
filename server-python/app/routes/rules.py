from flask import Blueprint, request, jsonify
from app.database import db
from app.models import Rule, AuditLog
from app.routes.auth import login_required

rules_bp = Blueprint('rules', __name__)


@rules_bp.route('/', methods=['GET'])
@login_required
def list_rules():
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 10, type=int)
    rule_type = request.args.get('type')
    status = request.args.get('status')
    search = request.args.get('search', '')

    query = Rule.query
    if rule_type:
        query = query.filter(Rule.type == rule_type)
    if status:
        query = query.filter(Rule.status == status)
    if search:
        query = query.filter(Rule.name.contains(search))

    total = query.count()
    rules = query.order_by(Rule.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return jsonify({
        'success': True,
        'data': {
            'items': [r.to_dict() for r in rules],
            'total': total,
            'page': page,
            'limit': limit
        }
    })


@rules_bp.route('/<int:rule_id>', methods=['GET'])
@login_required
def get_rule(rule_id):
    rule = Rule.query.get(rule_id)
    if not rule:
        return jsonify({'success': False, 'error': '规则不存在'}), 404

    return jsonify({
        'success': True,
        'data': rule.to_dict()
    })


@rules_bp.route('/', methods=['POST'])
@login_required
def create_rule():
    data = request.get_json()
    rule = Rule(
        name=data.get('name'),
        type=data.get('type'),
        content=data.get('content'),
        status=data.get('status', 'active'),
        severity=data.get('severity', 'medium'),
        tags=data.get('tags', [])
    )
    db.session.add(rule)
    db.session.commit()

    return jsonify({
        'success': True,
        'data': rule.to_dict()
    }), 201


@rules_bp.route('/<int:rule_id>', methods=['PUT'])
@login_required
def update_rule(rule_id):
    rule = Rule.query.get(rule_id)
    if not rule:
        return jsonify({'success': False, 'error': '规则不存在'}), 404

    data = request.get_json()
    for key in ['name', 'type', 'content', 'status', 'severity', 'tags']:
        if key in data:
            setattr(rule, key, data[key])

    db.session.commit()

    return jsonify({
        'success': True,
        'data': rule.to_dict()
    })


@rules_bp.route('/<int:rule_id>/status', methods=['PATCH'])
@login_required
def update_rule_status(rule_id):
    rule = Rule.query.get(rule_id)
    if not rule:
        return jsonify({'success': False, 'error': '规则不存在'}), 404

    data = request.get_json()
    status = data.get('status')
    if status not in ['active', 'inactive', 'testing']:
        return jsonify({'success': False, 'error': '无效的状态'}), 400

    rule.status = status
    db.session.commit()

    return jsonify({
        'success': True,
        'data': rule.to_dict()
    })


@rules_bp.route('/<int:rule_id>', methods=['DELETE'])
@login_required
def delete_rule(rule_id):
    rule = Rule.query.get(rule_id)
    if not rule:
        return jsonify({'success': False, 'error': '规则不存在'}), 404

    db.session.delete(rule)
    db.session.commit()

    return jsonify({'success': True, 'message': '删除成功'})


@rules_bp.route('/<int:rule_id>/test', methods=['POST'])
@login_required
def test_rule(rule_id):
    rule = Rule.query.get(rule_id)
    if not rule:
        return jsonify({'success': False, 'error': '规则不存在'}), 404

    # Simulate rule testing
    return jsonify({
        'success': True,
        'data': {
            'matched': 0,
            'errors': [],
            'simulated_events': [
                {'id': 1, 'title': 'Test Event 1', 'severity': rule.severity},
                {'id': 2, 'title': 'Test Event 2', 'severity': rule.severity}
            ]
        }
    })