"""
日志搜索与统计 API
使用 TimescaleDB 提供日志查询和统计功能
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from datetime import datetime, timedelta

log_search_bp = Blueprint('log_search', __name__)


@log_search_bp.route('/logs/search', methods=['POST'])
@login_required
def search_logs():
    """全文搜索解析后的日志"""
    data = request.get_json() or {}
    
    query = data.get('query', '')
    time_range = data.get('time_range', '24h')
    limit = data.get('limit', 100)
    offset = data.get('offset', 0)
    log_type = data.get('log_type')
    src_ip = data.get('src_ip')
    username = data.get('username')
    
    # 计算时间范围
    now = datetime.utcnow()
    if time_range.endswith('h'):
        hours = int(time_range[:-1])
        start_time = now - timedelta(hours=hours)
    elif time_range.endswith('d'):
        days = int(time_range[:-1])
        start_time = now - timedelta(days=days)
    else:
        start_time = now - timedelta(hours=24)
    
    try:
        from app.timescaledb import get_tsdb, full_text_search
        
        tsdb = get_tsdb()
        session = tsdb.get_session()
        
        try:
            result = full_text_search(
                session=session,
                search_query=query,
                start_time=start_time,
                end_time=now,
                log_type=log_type,
                src_ip=src_ip,
                username=username,
                limit=limit,
                offset=offset
            )
            
            return jsonify({
                'success': True,
                'data': result
            })
        finally:
            tsdb.close_session(session)
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 503


@log_search_bp.route('/logs/query', methods=['POST'])
@login_required
def query_logs():
    """条件查询日志"""
    data = request.get_json() or {}
    
    time_range = data.get('time_range', '24h')
    limit = data.get('limit', 100)
    offset = data.get('offset', 0)
    log_type = data.get('log_type')
    src_ip = data.get('src_ip')
    username = data.get('username')
    action = data.get('action')
    
    # 计算时间范围
    now = datetime.utcnow()
    if time_range.endswith('h'):
        hours = int(time_range[:-1])
        start_time = now - timedelta(hours=hours)
    elif time_range.endswith('d'):
        days = int(time_range[:-1])
        start_time = now - timedelta(days=days)
    else:
        start_time = now - timedelta(hours=24)
    
    try:
        from app.timescaledb import get_tsdb, query_parsed_logs
        
        tsdb = get_tsdb()
        session = tsdb.get_session()
        
        try:
            result = query_parsed_logs(
                session=session,
                start_time=start_time,
                end_time=now,
                log_type=log_type,
                src_ip=src_ip,
                username=username,
                action=action,
                limit=limit,
                offset=offset
            )
            
            return jsonify({
                'success': True,
                'data': result
            })
        finally:
            tsdb.close_session(session)
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 503


@log_search_bp.route('/logs/summary', methods=['GET'])
@login_required
def get_summary():
    """获取日志摘要统计"""
    time_range = request.args.get('time_range', '24h')
    
    now = datetime.utcnow()
    if time_range.endswith('h'):
        hours = int(time_range[:-1])
        start_time = now - timedelta(hours=hours)
    elif time_range.endswith('d'):
        days = int(time_range[:-1])
        start_time = now - timedelta(days=days)
    else:
        start_time = now - timedelta(hours=24)
    
    try:
        from app.timescaledb import get_tsdb, get_log_summary
        
        tsdb = get_tsdb()
        session = tsdb.get_session()
        
        try:
            result = get_log_summary(session, start_time, now)
            
            return jsonify({
                'success': True,
                'data': result
            })
        finally:
            tsdb.close_session(session)
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 503


@log_search_bp.route('/alerts/stats', methods=['GET'])
@login_required
def get_alert_stats():
    """获取告警统计"""
    view_name = request.args.get('view', 'alert_stats_5m')
    time_range = request.args.get('time_range', '24h')
    
    now = datetime.utcnow()
    if time_range.endswith('h'):
        hours = int(time_range[:-1])
        start_time = now - timedelta(hours=hours)
    elif time_range.endswith('d'):
        days = int(time_range[:-1])
        start_time = now - timedelta(days=days)
    else:
        start_time = now - timedelta(hours=24)
    
    try:
        from app.timescaledb import get_tsdb, get_continuous_aggregate_stats
        
        tsdb = get_tsdb()
        session = tsdb.get_session()
        
        try:
            result = get_continuous_aggregate_stats(
                session=session,
                view_name=view_name,
                start_time=start_time,
                end_time=now
            )
            
            return jsonify({
                'success': True,
                'data': {
                    'view': view_name,
                    'time_range': time_range,
                    'stats': result
                }
            })
        finally:
            tsdb.close_session(session)
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 503


@log_search_bp.route('/alerts/recent', methods=['GET'])
@login_required
def get_recent_alerts():
    """获取最近告警"""
    limit = request.args.get('limit', 50, type=int)
    
    try:
        from app.timescaledb import get_tsdb
        
        tsdb = get_tsdb()
        session = tsdb.get_session()
        
        try:
            from sqlalchemy import text
            
            query = text("""
                SELECT id, timestamp, rule_id, rule_name, severity, alert_type,
                       message, src_ip, dst_ip, username
                FROM alert_events
                ORDER BY timestamp DESC
                LIMIT :limit
            """)
            
            result = session.execute(query, {'limit': limit})
            
            alerts = [dict(row._mapping) for row in result]
            
            return jsonify({
                'success': True,
                'data': {
                    'total': len(alerts),
                    'alerts': alerts
                }
            })
        finally:
            tsdb.close_session(session)
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 503
