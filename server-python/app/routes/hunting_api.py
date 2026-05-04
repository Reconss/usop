"""
威胁狩猎 API 路由
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import HuntingQuery, HuntingResult, Alert
from datetime import datetime

hunting_api_bp = Blueprint('hunting_api', __name__)


@hunting_api_bp.route('/queries', methods=['GET'])
@login_required
def get_queries():
    """获取狩猎查询列表"""
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 20, type=int)
    category = request.args.get('category')
    status = request.args.get('status')
    search = request.args.get('search')
    
    q = db.session.query(HuntingQuery)
    
    if search:
        q = q.filter(
            db.or_(
                HuntingQuery.name.ilike(f'%{search}%'),
                HuntingQuery.description.ilike(f'%{search}%')
            )
        )
    
    q = q.order_by(HuntingQuery.created_at.desc())
    pagination = q.paginate(page=page, per_page=page_size, error_out=False)
    
    items = []
    for item in pagination.items:
        item_dict = item.to_dict()
        # 添加命中统计
        hit_count = db.session.query(HuntingResult).filter_by(query_id=item.id).count()
        item_dict['hitCount'] = hit_count
        items.append(item_dict)
    
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


@hunting_api_bp.route('/queries', methods=['POST'])
@login_required
def create_query():
    """创建狩猎查询"""
    data = request.get_json()
    
    query = HuntingQuery(
        name=data.get('name'),
        query=data.get('query'),
        description=data.get('description')
    )
    
    db.session.add(query)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': query.to_dict()
    }), 201


@hunting_api_bp.route('/queries/<int:query_id>', methods=['GET'])
@login_required
def get_query(query_id):
    """获取查询详情"""
    query = db.session.get(HuntingQuery, query_id)
    if not query:
        return jsonify({'success': False, 'error': '查询不存在'}), 404
    
    return jsonify({
        'success': True,
        'data': query.to_dict()
    })


@hunting_api_bp.route('/queries/<int:query_id>', methods=['PUT'])
@login_required
def update_query(query_id):
    """更新狩猎查询"""
    query = db.session.get(HuntingQuery, query_id)
    if not query:
        return jsonify({'success': False, 'error': '查询不存在'}), 404
    
    data = request.get_json()
    if 'name' in data:
        query.name = data['name']
    if 'query' in data:
        query.query = data['query']
    if 'description' in data:
        query.description = data['description']
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': query.to_dict()
    })


@hunting_api_bp.route('/queries/<int:query_id>', methods=['DELETE'])
@login_required
def delete_query(query_id):
    """删除狩猎查询"""
    query = db.session.get(HuntingQuery, query_id)
    if not query:
        return jsonify({'success': False, 'error': '查询不存在'}), 404
    
    # 删除关联结果
    db.session.query(HuntingResult).filter_by(query_id=query_id).delete()
    
    db.session.delete(query)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': '查询已删除'
    })


@hunting_api_bp.route('/queries/<int:query_id>/results', methods=['GET'])
@login_required
def get_query_results(query_id):
    """获取查询结果"""
    query = db.session.get(HuntingQuery, query_id)
    if not query:
        return jsonify({'success': False, 'error': '查询不存在'}), 404
    
    results = db.session.query(HuntingResult).filter_by(query_id=query_id).order_by(
        HuntingResult.created_at.desc()
    ).all()
    
    return jsonify({
        'success': True,
        'data': [r.to_dict() for r in results]
    })


@hunting_api_bp.route('/queries/<int:query_id>/execute', methods=['POST'])
@login_required
def execute_query(query_id):
    """执行狩猎查询"""
    query = db.session.get(HuntingQuery, query_id)
    if not query:
        return jsonify({'success': False, 'error': '查询不存在'}), 404
    
    # 模拟执行查询 - 实际应该调用 Elasticsearch/Splunk 等
    mock_results = [
        {
            'timestamp': datetime.utcnow().isoformat(),
            'source_ip': '192.168.1.100',
            'dest_ip': '10.0.0.50',
            'event_type': 'network_connection',
            'severity': 'high'
        },
        {
            'timestamp': (datetime.utcnow() - datetime.timedelta(hours=1)).isoformat(),
            'source_ip': '192.168.1.105',
            'dest_ip': '10.0.0.100',
            'event_type': 'authentication_failure',
            'severity': 'medium'
        }
    ]
    
    return jsonify({
        'success': True,
        'data': {
            'query_id': query_id,
            'query_name': query.name,
            'total_hits': len(mock_results),
            'results': mock_results,
            'executed_at': datetime.utcnow().isoformat()
        }
    })


@hunting_api_bp.route('/results', methods=['GET'])
@login_required
def get_results():
    """获取狩猎结果列表"""
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 20, type=int)
    severity = request.args.get('severity')
    status = request.args.get('status')
    query_id = request.args.get('query_id')
    
    q = db.session.query(HuntingResult)
    
    if severity:
        q = q.filter(HuntingResult.severity == severity)
    if status:
        q = q.filter(HuntingResult.status == status)
    if query_id:
        q = q.filter(HuntingResult.query_id == query_id)
    
    q = q.order_by(HuntingResult.created_at.desc())
    pagination = q.paginate(page=page, per_page=page_size, error_out=False)
    
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


@hunting_api_bp.route('/search', methods=['POST'])
@login_required
def search():
    """执行高级搜索"""
    data = request.get_json()
    
    query_string = data.get('query')
    time_range = data.get('time_range', '24h')
    limit = data.get('limit', 100)
    
    # 模拟搜索结果 - 实际应该调用数据源
    mock_events = []
    for i in range(min(limit, 10)):
        mock_events.append({
            'id': f'evt_{i}',
            'timestamp': datetime.utcnow().isoformat(),
            'source': 'simulated',
            'message': f'Simulated event {i}',
            'severity': ['low', 'medium', 'high', 'critical'][i % 4]
        })
    
    return jsonify({
        'success': True,
        'data': {
            'query': query_string,
            'time_range': time_range,
            'total_hits': len(mock_events),
            'events': mock_events,
            'searched_at': datetime.utcnow().isoformat()
        }
    })
