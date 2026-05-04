from flask import Blueprint, request, jsonify
from app.database import db
from app.models import Asset, AuditLog
from app.routes.auth import login_required

assets_bp = Blueprint('assets', __name__)


@assets_bp.route('/', methods=['GET'])
@login_required
def list_assets():
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 10, type=int)
    asset_type = request.args.get('type')
    status = request.args.get('status')
    search = request.args.get('search', '')

    query = Asset.query
    if asset_type:
        query = query.filter(Asset.type == asset_type)
    if status:
        query = query.filter(Asset.status == status)
    if search:
        query = query.filter(Asset.name.contains(search) | Asset.ip.contains(search))

    total = query.count()
    assets = query.order_by(Asset.risk_score.desc()).offset((page - 1) * limit).limit(limit).all()

    return jsonify({
        'success': True,
        'data': {
            'items': [a.to_dict() for a in assets],
            'total': total,
            'page': page,
            'limit': limit
        }
    })


@assets_bp.route('/<int:asset_id>', methods=['GET'])
@login_required
def get_asset(asset_id):
    asset = Asset.query.get(asset_id)
    if not asset:
        return jsonify({'success': False, 'error': '资产不存在'}), 404

    return jsonify({
        'success': True,
        'data': asset.to_dict()
    })


@assets_bp.route('/', methods=['POST'])
@login_required
def create_asset():
    data = request.get_json()
    asset = Asset(
        name=data.get('name'),
        type=data.get('type'),
        ip=data.get('ip'),
        status=data.get('status', 'online'),
        risk_score=data.get('risk_score', 0),
        tags=data.get('tags', []),
        metadata=data.get('metadata', {})
    )
    db.session.add(asset)
    db.session.commit()

    return jsonify({
        'success': True,
        'data': asset.to_dict()
    }), 201


@assets_bp.route('/<int:asset_id>', methods=['PUT'])
@login_required
def update_asset(asset_id):
    asset = Asset.query.get(asset_id)
    if not asset:
        return jsonify({'success': False, 'error': '资产不存在'}), 404

    data = request.get_json()
    for key in ['name', 'type', 'ip', 'status', 'risk_score', 'tags', 'metadata']:
        if key in data:
            setattr(asset, key, data[key])

    db.session.commit()

    return jsonify({
        'success': True,
        'data': asset.to_dict()
    })


@assets_bp.route('/<int:asset_id>', methods=['DELETE'])
@login_required
def delete_asset(asset_id):
    asset = Asset.query.get(asset_id)
    if not asset:
        return jsonify({'success': False, 'error': '资产不存在'}), 404

    db.session.delete(asset)
    db.session.commit()

    return jsonify({'success': True, 'message': '删除成功'})


@assets_bp.route('/<int:asset_id>/tags', methods=['POST'])
@login_required
def update_asset_tags(asset_id):
    asset = Asset.query.get(asset_id)
    if not asset:
        return jsonify({'success': False, 'error': '资产不存在'}), 404

    data = request.get_json()
    tags = data.get('tags', [])
    asset.tags = tags
    db.session.commit()

    return jsonify({
        'success': True,
        'data': asset.to_dict()
    })
