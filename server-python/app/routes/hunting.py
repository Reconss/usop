from flask import Blueprint, request, jsonify
from app.database import db
from app.models import HuntingQuery, Event, AuditLog
from app.routes.auth import login_required
from datetime import datetime, timedelta
from sqlalchemy import func

hunting_bp = Blueprint('hunting', __name__)


@hunting_bp.route('/queries', methods=['GET'])
@login_required
def list_queries():
    queries = HuntingQuery.query.order_by(HuntingQuery.created_at.desc()).all()
    return jsonify({
        'success': True,
        'data': {
            'items': [q.to_dict() for q in queries],
            'total': len(queries)
        }
    })


@hunting_bp.route('/queries', methods=['POST'])
@login_required
def create_query():
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


@hunting_bp.route('/queries/<int:query_id>/execute', methods=['POST'])
@login_required
def execute_query(query_id):
    query_obj = HuntingQuery.query.get(query_id)
    if not query_obj:
        return jsonify({'success': False, 'error': '查询不存在'}), 404

    # Simulate query execution
    results = Event.query.limit(100).all()

    return jsonify({
        'success': True,
        'data': {
            'query_id': query_id,
            'query_name': query_obj.name,
            'executed_at': datetime.utcnow().isoformat(),
            'results_count': len(results),
            'results': [e.to_dict() for e in results[:10]]
        }
    })


@hunting_bp.route('/iocs', methods=['GET'])
@login_required
def get_iocs():
    # Simulated IOC data
    iocs = [
        {'type': 'ip', 'value': '192.168.1.100', 'threat_type': 'C2', 'confidence': 0.85},
        {'type': 'domain', 'value': 'malicious.example.com', 'threat_type': 'Phishing', 'confidence': 0.92},
        {'type': 'hash', 'value': 'abc123...', 'threat_type': 'Malware', 'confidence': 0.78}
    ]

    return jsonify({
        'success': True,
        'data': iocs
    })


@hunting_bp.route('/stats', methods=['GET'])
@login_required
def get_stats():
    total_events = Event.query.count()
    high_severity = Event.query.filter(Event.severity.in_(['critical', 'high'])).count()
    recent_24h = Event.query.filter(Event.timestamp >= datetime.utcnow() - timedelta(hours=24)).count()

    return jsonify({
        'success': True,
        'data': {
            'total_events': total_events,
            'high_severity_events': high_severity,
            'events_last_24h': recent_24h,
            'queries_count': HuntingQuery.query.count()
        }
    })