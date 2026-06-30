"""
Dashboard API 路由 - 仪表盘数据接口
使用真实数据库数据
"""
from flask import Blueprint, jsonify, request
from app.routes.auth import login_required
from app.database import db
from app.models import Event, Alert, Asset, ScanTask, DetectionRuleExtended
from datetime import datetime, timedelta
from sqlalchemy import func, desc

dashboard_api_bp = Blueprint('dashboard_api', __name__)

@dashboard_api_bp.route('/metrics', methods=['GET'])
@login_required
def get_metrics():
    """获取仪表盘指标数据"""
    today = datetime.utcnow().date()
    
    # 总告警数
    total_alerts = Alert.query.count()
    
    # 今日告警数
    today_alerts = Alert.query.filter(
        func.date(Alert.created_at) == today
    ).count()
    
    # 待处理事件
    pending_events = Event.query.filter(
        Event.status.in_(['new', 'investigating'])
    ).count()
    
    # 高危资产数
    high_risk_assets = Asset.query.filter(
        Asset.risk_score >= 80
    ).count()
    
    # 资产总数
    total_assets = Asset.query.count()
    
    # 趋势计算 (基于真实数据对比昨天)
    yesterday = today - timedelta(days=1)
    yesterday_alerts = Alert.query.filter(
        func.date(Alert.created_at) == yesterday
    ).count()
    
    if yesterday_alerts > 0:
        alerts_trend = round((today_alerts - yesterday_alerts) / yesterday_alerts * 100, 1)
    else:
        alerts_trend = 0 if today_alerts == 0 else 100
    
    return jsonify({
        'success': True,
        'data': {
            'todayAlerts': today_alerts,
            'totalAlerts': total_alerts,
            'pendingEvents': pending_events,
            'totalAssets': total_assets,
            'highRiskAssets': high_risk_assets,
            'alertsTrend': alerts_trend,
            'pendingTrend': 0,
            'assetsTrend': 0,
            'healthTrend': 0
        }
    })

@dashboard_api_bp.route('/event-trend', methods=['GET'])
@login_required
def get_event_trend():
    """获取事件趋势数据 (24小时)"""
    now = datetime.utcnow()
    hours_ago = now - timedelta(hours=24)
    
    timestamps = []
    critical = []
    high = []
    medium = []
    low = []
    
    # 从 Alert 表按小时统计
    for i in range(24):
        hour_start = hours_ago + timedelta(hours=i)
        hour_end = hour_start + timedelta(hours=1)
        hour_time = hour_start.strftime('%H:00')
        
        timestamps.append(hour_time)
        
        # 按严重级别统计
        critical_cnt = Alert.query.filter(
            Alert.created_at >= hour_start,
            Alert.created_at < hour_end,
            Alert.severity == 'critical'
        ).count()
        
        high_cnt = Alert.query.filter(
            Alert.created_at >= hour_start,
            Alert.created_at < hour_end,
            Alert.severity == 'high'
        ).count()
        
        medium_cnt = Alert.query.filter(
            Alert.created_at >= hour_start,
            Alert.created_at < hour_end,
            Alert.severity == 'medium'
        ).count()
        
        low_cnt = Alert.query.filter(
            Alert.created_at >= hour_start,
            Alert.created_at < hour_end,
            Alert.severity == 'low'
        ).count()
        
        critical.append(critical_cnt)
        high.append(high_cnt)
        medium.append(medium_cnt)
        low.append(low_cnt)
    
    return jsonify({
        'success': True,
        'data': {
            'timestamps': timestamps,
            'critical': critical,
            'high': high,
            'medium': medium,
            'low': low
        }
    })

@dashboard_api_bp.route('/event-types', methods=['GET'])
@login_required
def get_event_types():
    """获取事件类型分布"""
    category_stats = db.session.query(
        Alert.category,
        func.count(Alert.id).label('count')
    ).filter(
        Alert.category.isnot(None),
        Alert.category != ''
    ).group_by(
        Alert.category
    ).order_by(
        func.count(Alert.id).desc()
    ).limit(10).all()
    
    colors = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6', '#F59E0B', '#6366F1']
    
    event_types = []
    for i, row in enumerate(category_stats):
        severity = 'medium'
        category_lower = (row.category or '').lower()
        if any(kw in category_lower for kw in ['attack', 'malware', 'intrusion', 'exploit']):
            severity = 'critical'
        elif any(kw in category_lower for kw in ['brute', 'dos', 'ddos']):
            severity = 'high'
        
        event_types.append({
            'name': row.category or '未知',
            'value': row.count,
            'color': colors[i % len(colors)]
        })
    
    if not event_types:
        event_types = [{'name': '无数据', 'value': 1, 'color': '#6366F1'}]
    
    return jsonify({'success': True, 'data': event_types})

@dashboard_api_bp.route('/attack-sources', methods=['GET'])
@login_required
def get_attack_sources():
    """获取 Top 攻击源"""
    ip_stats = db.session.query(
        Alert.src_ip,
        func.count(Alert.id).label('count')
    ).filter(
        Alert.src_ip.isnot(None),
        Alert.src_ip != ''
    ).group_by(
        Alert.src_ip
    ).order_by(
        func.count(Alert.id).desc()
    ).limit(10).all()
    
    attack_sources = []
    for row in ip_stats:
        ip = str(row[0]) if row[0] else ''
        first_octet = int(ip.split('.')[0]) if ip and '.' in ip else 0
        country = '海外' if 1 <= first_octet <= 223 else '内网'
        
        attack_sources.append({
            'ip': ip,
            'country': country,
            'count': row[1]
        })
    
    if not attack_sources:
        attack_sources = [{'ip': '192.168.1.100', 'country': '内网', 'count': 0}]
    
    return jsonify({'success': True, 'data': attack_sources})

@dashboard_api_bp.route('/risk-assets', methods=['GET'])
@login_required
def get_risk_assets():
    """获取高风险资产"""
    assets = Asset.query.filter(
        Asset.risk_score.isnot(None),
        Asset.risk_score > 0
    ).order_by(
        Asset.risk_score.desc()
    ).limit(10).all()
    
    data = []
    for asset in assets:
        data.append({
            'id': str(asset.id),
            'name': asset.name or asset.hostname or asset.ip or '未知',
            'type': asset.type or 'unknown',
            'riskScore': asset.risk_score or 0,
            'lastSeen': asset.updated_at.isoformat() if asset.updated_at else None
        })
    
    if not data:
        data = [{'id': '1', 'name': '无风险资产数据', 'type': 'unknown', 'riskScore': 0, 'lastSeen': None}]
    
    return jsonify({'success': True, 'data': data})

@dashboard_api_bp.route('/recent-alerts', methods=['GET'])
@login_required
def get_recent_alerts():
    """获取最近告警"""
    limit = request.args.get('limit', 10, type=int)
    
    alerts = Alert.query.order_by(
        Alert.created_at.desc()
    ).limit(limit).all()
    
    data = []
    for alert in alerts:
        data.append({
            'id': alert.alert_code,
            'title': alert.title,
            'severity': alert.severity,
            'status': alert.status,
            'source': alert.source,
            'category': alert.category,
            'src_ip': alert.src_ip,
            'created_at': alert.created_at.isoformat() if alert.created_at else None
        })
    
    return jsonify({'success': True, 'data': data})

@dashboard_api_bp.route('/summary', methods=['GET'])
@login_required
def get_summary():
    """获取仪表盘汇总数据"""
    total_events = Event.query.count()
    total_alerts = Alert.query.count()
    open_alerts = Alert.query.filter(Alert.status == 'new').count()
    total_assets = Asset.query.count()
    total_rules = DetectionRuleExtended.query.filter(
        DetectionRuleExtended.status == 'enabled'
    ).count()
    running_tasks = ScanTask.query.filter(
        ScanTask.status == 'running'
    ).count()
    
    return jsonify({
        'success': True,
        'data': {
            'totalEvents': total_events,
            'totalAlerts': total_alerts,
            'openAlerts': open_alerts,
            'totalAssets': total_assets,
            'activeRules': total_rules,
            'runningTasks': running_tasks,
            'timestamp': datetime.utcnow().isoformat()
        }
    })
