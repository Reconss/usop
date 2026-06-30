"""
搜索 API - 集成 ES/ClickHouse 进行全文搜索和调查
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import Alert
from datetime import datetime, timedelta
from sqlalchemy import or_, and_

search_api_bp = Blueprint('search_api', __name__)

# 搜索服务
class SearchService:
    """搜索服务 - 优先用PostgreSQL，兼容ES/ClickHouse"""
    
    @staticmethod
    def search_by_keyword(keyword: str, limit: int = 100) -> dict:
        """关键词搜索"""
        try:
            # 优先使用 PostgreSQL 全文搜索
            query = Alert.query.filter(
                or_(
                    Alert.title.ilike(f'%{keyword}%'),
                    Alert.description.ilike(f'%{keyword}%'),
                    Alert.raw_log.ilike(f'%{keyword}%'),
                    Alert.source.ilike(f'%{keyword}%')
                )
            ).order_by(Alert.created_at.desc()).limit(limit)
            
            alerts = query.all()
            
            return {
                'total': len(alerts),
                'hits': [a.to_dict() for a in alerts]
            }
        except Exception as e:
            return {'total': 0, 'hits': [], 'error': str(e)}
    
    @staticmethod
    def search_by_ip(ip: str, limit: int = 100) -> dict:
        """IP搜索"""
        try:
            query = Alert.query.filter(
                or_(
                    Alert.src_ip == ip,
                    Alert.dst_ip == ip
                )
            ).order_by(Alert.created_at.desc()).limit(limit)
            
            alerts = query.all()
            
            # 聚合统计
            actions = {}
            severities = {}
            for a in alerts:
                actions[a.action] = actions.get(a.action, 0) + 1
                severities[a.severity] = severities.get(a.severity, 0) + 1
            
            return {
                'total': len(alerts),
                'hits': [a.to_dict() for a in alerts],
                'aggregations': {
                    'actions': actions,
                    'severities': severities
                }
            }
        except Exception as e:
            return {'total': 0, 'hits': [], 'error': str(e)}
    
    @staticmethod
    def advanced_search(conditions: dict, limit: int = 100) -> dict:
        """高级搜索"""
        try:
            query = Alert.query
            
            if conditions.get('ip'):
                ip = conditions['ip']
                query = query.filter(or_(Alert.src_ip == ip, Alert.dst_ip == ip))
            
            if conditions.get('keyword'):
                kw = conditions['keyword']
                query = query.filter(or_(
                    Alert.title.ilike(f'%{kw}%'),
                    Alert.description.ilike(f'%{kw}%'),
                    Alert.raw_log.ilike(f'%{kw}%')
                ))
            
            if conditions.get('severity'):
                query = query.filter(Alert.severity == conditions['severity'])
            
            if conditions.get('category'):
                query = query.filter(Alert.category == conditions['category'])
            
            if conditions.get('status'):
                query = query.filter(Alert.status == conditions['status'])
            
            if conditions.get('start_time') and conditions.get('end_time'):
                start = datetime.fromisoformat(conditions['start_time'])
                end = datetime.fromisoformat(conditions['end_time'])
                query = query.filter(Alert.created_at.between(start, end))
            
            # 排序
            sort_field = conditions.get('sort_field', 'created_at')
            sort_order = conditions.get('sort_order', 'desc')
            if sort_order == 'desc':
                query = query.order_by(getattr(Alert, sort_field, Alert.created_at).desc())
            else:
                query = query.order_by(getattr(Alert, sort_field, Alert.created_at).asc())
            
            alerts = query.limit(limit).all()
            
            return {
                'total': query.count(),
                'hits': [a.to_dict() for a in alerts]
            }
        except Exception as e:
            return {'total': 0, 'hits': [], 'error': str(e)}
    
    @staticmethod
    def investigate_ip(ip: str) -> dict:
        """IP调查 - 关联分析"""
        try:
            alerts = Alert.query.filter(
                or_(Alert.src_ip == ip, Alert.dst_ip == ip)
            ).order_by(Alert.created_at.desc()).all()
            
            # 统计
            action_counts = {}
            severity_counts = {}
            target_ips = set()
            categories = {}
            
            for a in alerts:
                action_counts[a.action] = action_counts.get(a.action, 0) + 1
                severity_counts[a.severity] = severity_counts.get(a.severity, 0) + 1
                if a.dst_ip and a.dst_ip != ip:
                    target_ips.add(a.dst_ip)
                categories[a.category] = categories.get(a.category, 0) + 1
            
            return {
                'ip': ip,
                'total_events': len(alerts),
                'action_distribution': action_counts,
                'severity_distribution': severity_counts,
                'unique_targets': len(target_ips),
                'target_ips': list(target_ips)[:20],
                'category_distribution': categories,
                'first_seen': alerts[-1].created_at.isoformat() if alerts else None,
                'last_seen': alerts[0].created_at.isoformat() if alerts else None
            }
        except Exception as e:
            return {'error': str(e)}


# API 路由
@search_api_bp.route('/search', methods=['GET'])
@login_required
def search():
    """通用搜索接口"""
    keyword = request.args.get('q', '') or request.args.get('query', '')
    limit = request.args.get('limit', 100, type=int)
    
    if not keyword:
        return jsonify({'success': False, 'error': '缺少搜索关键词'}), 400
    
    result = SearchService.search_by_keyword(keyword, limit)
    return jsonify({'success': True, 'data': result})


@search_api_bp.route('/search/ip', methods=['GET'])
@login_required
def search_by_ip():
    """IP搜索"""
    ip = request.args.get('ip', '')
    limit = request.args.get('limit', 100, type=int)
    
    if not ip:
        return jsonify({'success': False, 'error': '缺少IP地址'}), 400
    
    result = SearchService.search_by_ip(ip, limit)
    return jsonify({'success': True, 'data': result})


@search_api_bp.route('/search/investigate-ip', methods=['GET'])
@login_required
def investigate_ip():
    """IP调查"""
    ip = request.args.get('ip', '')
    
    if not ip:
        return jsonify({'success': False, 'error': '缺少IP地址'}), 400
    
    result = SearchService.investigate_ip(ip)
    return jsonify({'success': True, 'data': result})


@search_api_bp.route('/search/advanced', methods=['POST'])
@login_required
def advanced_search():
    """高级搜索"""
    data = request.get_json() or {}
    limit = data.get('limit', 100)
    
    result = SearchService.advanced_search(data, limit)
    return jsonify({'success': True, 'data': result})
