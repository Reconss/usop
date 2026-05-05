"""
Dashboard API 路由 - 仪表盘数据接口
"""
from flask import Blueprint, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import Event, Alert, Asset, ScanTask, DetectionRuleExtended
from datetime import datetime, timedelta
from sqlalchemy import func

dashboard_api_bp = Blueprint('dashboard_api', __name__)


@dashboard_api_bp.route('/metrics', methods=['GET'])
@login_required
def get_metrics():
    """获取仪表盘指标数据"""
    today = datetime.utcnow().date()
    today_start = datetime.combine(today, datetime.min.time())
    
    # 总告警数 (改为统计所有告警)
    total_alerts = Alert.query.count()
    
    # 今日告警数 (保留用于趋势分析)
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
    
    # 计算 Agent 健康率 (假设在线的为健康的)
    total_agents = 10  # 实际应该从数据库查询
    healthy_agents = 8
    
    # 趋势计算 (模拟)
    alerts_trend = 12.5
    pending_trend = -5.2
    assets_trend = 8.3
    health_trend = 2.1
    
    return jsonify({
        'success': True,
        'data': {
            'todayAlerts': total_alerts,  # 返回总告警数
            'pendingEvents': pending_events,
            'totalAssets': total_assets,
            'highRiskAssets': high_risk_assets,
            'agentHealthRate': healthy_agents / total_agents * 100 if total_agents > 0 else 0,
            'alertsTrend': alerts_trend,
            'pendingTrend': pending_trend,
            'assetsTrend': assets_trend,
            'healthTrend': health_trend
        }
    })


@dashboard_api_bp.route('/event-trend', methods=['GET'])
@login_required
def get_event_trend():
    """获取事件趋势数据 (24小时)"""
    now = datetime.utcnow()
    hours_ago = now - timedelta(hours=24)
    
    # 模拟趋势数据
    timestamps = []
    critical = []
    high = []
    medium = []
    low = []
    
    for i in range(24):
        hour_time = (hours_ago + timedelta(hours=i)).strftime('%H:00')
        timestamps.append(hour_time)
        critical.append(max(0, 5 + (hash(f'c{i}') % 10)))
        high.append(max(0, 15 + (hash(f'h{i}') % 20)))
        medium.append(max(0, 30 + (hash(f'm{i}') % 30)))
        low.append(max(0, 50 + (hash(f'l{i}') % 40)))
    
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
    # 模拟数据
    event_types = [
        {'name': '网络入侵', 'value': 35, 'color': '#EF4444'},
        {'name': '恶意软件', 'value': 25, 'color': '#F97316'},
        {'name': '数据泄露', 'value': 18, 'color': '#EAB308'},
        {'name': '权限异常', 'value': 12, 'color': '#22C55E'},
        {'name': '配置变更', 'value': 10, 'color': '#3B82F6'}
    ]
    
    return jsonify({
        'success': True,
        'data': event_types
    })


@dashboard_api_bp.route('/attack-sources', methods=['GET'])
@login_required
def get_attack_sources():
    """获取 Top 攻击源"""
    # 模拟数据
    attack_sources = [
        {'ip': '45.142.212.100', 'country': '俄罗斯', 'count': 1523},
        {'ip': '185.220.101.50', 'country': '德国', 'count': 892},
        {'ip': '103.253.145.20', 'country': '越南', 'count': 456},
        {'ip': '91.234.56.78', 'country': '乌克兰', 'count': 234},
        {'ip': '192.168.1.105', 'country': '内网', 'count': 89}
    ]
    
    return jsonify({
        'success': True,
        'data': attack_sources
    })


@dashboard_api_bp.route('/risk-assets', methods=['GET'])
@login_required
def get_risk_assets():
    """获取高风险资产"""
    assets = Asset.query.order_by(Asset.risk_score.desc()).limit(5).all()
    
    data = []
    for asset in assets:
        data.append({
            'id': str(asset.id),
            'name': asset.name,
            'type': asset.type or 'unknown',
            'riskScore': asset.risk_score,
            'lastSeen': asset.updated_at.isoformat() if asset.updated_at else None
        })
    
    # 如果数据库为空，添加模拟数据
    if not data:
        data = [
            {'id': '1', 'name': 'web-server-01.company.com', 'type': 'domain', 'riskScore': 85, 'lastSeen': '2026-04-27T10:00:00Z'},
            {'id': '2', 'name': '192.168.1.50', 'type': 'ip', 'riskScore': 72, 'lastSeen': '2026-04-27T09:30:00Z'},
            {'id': '3', 'name': 'api-gateway.company.com', 'type': 'domain', 'riskScore': 65, 'lastSeen': '2026-04-27T09:00:00Z'},
            {'id': '4', 'name': '192.168.1.100', 'type': 'ip', 'riskScore': 58, 'lastSeen': '2026-04-27T08:30:00Z'},
            {'id': '5', 'name': 'db-server-01.company.com', 'type': 'domain', 'riskScore': 45, 'lastSeen': '2026-04-27T08:00:00Z'}
        ]
    
    return jsonify({
        'success': True,
        'data': data
    })


@dashboard_api_bp.route('/recent-alerts', methods=['GET'])
@login_required
def get_recent_alerts():
    """获取最近告警"""
    alerts = Alert.query.order_by(Alert.created_at.desc()).limit(10).all()
    
    data = []
    for alert in alerts:
        data.append({
            'id': alert.alert_code,
            'title': alert.title,
            'severity': alert.severity,
            'status': alert.status,
            'source': alert.source,
            'created_at': alert.created_at.isoformat() if alert.created_at else None
        })
    
    return jsonify({
        'success': True,
        'data': data
    })


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
