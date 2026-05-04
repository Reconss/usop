from flask import Blueprint, jsonify
from app.database import db
from app.models import Event, Alert, Asset, User, AuditLog
from app.routes.auth import login_required
from sqlalchemy import func
from datetime import datetime, timedelta

dashboard_bp = Blueprint('dashboard', __name__)


@dashboard_bp.route('/metrics', methods=['GET'])
@login_required
def get_metrics():
    # Get today's date range
    today = datetime.utcnow().date()
    today_start = datetime.combine(today, datetime.min.time())
    today_end = datetime.combine(today + timedelta(days=1), datetime.min.time())

    # 告警总数: 安全告警页面当天所有的数据
    today_alerts = Alert.query.filter(
        Alert.created_at >= today_start,
        Alert.created_at < today_end
    ).count()

    # 待处置事件: 工作台中当天未处置的事件 (status='new' and created today)
    pending_events = Event.query.filter(
        Event.status == 'new',
        Event.timestamp >= today_start,
        Event.timestamp < today_end
    ).count()

    # 资产总数: 资产清单中资产的数据 (all assets)
    total_assets = Asset.query.count()

    # 高危资产: 资产清单中有风险的资产 (risk_score > 0)
    high_risk_assets = Asset.query.filter(Asset.risk_score > 0).count()

    return jsonify({
        'success': True,
        'data': {
            'todayAlerts': today_alerts,
            'pendingEvents': pending_events,
            'totalAssets': total_assets,
            'highRiskAssets': high_risk_assets,
            'alertChange': 0,
            'eventChange': 0,
            'assetChange': 0,
            'riskChange': 0
        }
    })


@dashboard_bp.route('/event-trend', methods=['GET'])
@login_required
def get_event_trend():
    days = 7
    today = datetime.utcnow().date()
    trend_data = []

    for i in range(days):
        day = today - timedelta(days=days - i - 1)
        day_start = datetime.combine(day, datetime.min.time())
        day_end = datetime.combine(day + timedelta(days=1), datetime.min.time())

        critical = Event.query.filter(
            Event.timestamp >= day_start,
            Event.timestamp < day_end,
            Event.severity == 'critical'
        ).count()
        high = Event.query.filter(
            Event.timestamp >= day_start,
            Event.timestamp < day_end,
            Event.severity == 'high'
        ).count()
        medium = Event.query.filter(
            Event.timestamp >= day_start,
            Event.timestamp < day_end,
            Event.severity == 'medium'
        ).count()
        low = Event.query.filter(
            Event.timestamp >= day_start,
            Event.timestamp < day_end,
            Event.severity == 'low'
        ).count()

        trend_data.append({
            'date': day.isoformat(),
            'critical': critical,
            'high': high,
            'medium': medium,
            'low': low
        })

    return jsonify({
        'success': True,
        'data': trend_data
    })


@dashboard_bp.route('/event-types', methods=['GET'])
@login_required
def get_event_types():
    types = db.session.query(
        Event.category,
        func.count(Event.id).label('count')
    ).group_by(Event.category).all()

    return jsonify({
        'success': True,
        'data': [
            {'name': t[0] or 'Unknown', 'value': t[1]}
            for t in types
        ]
    })


@dashboard_bp.route('/attack-sources', methods=['GET'])
@login_required
def get_attack_sources():
    sources = db.session.query(
        Event.source,
        func.count(Event.id).label('count')
    ).filter(Event.source.isnot(None)).group_by(Event.source).order_by(
        func.count(Event.id).desc()
    ).limit(10).all()

    return jsonify({
        'success': True,
        'data': [
            {'country': s[0] or 'Unknown', 'count': s[1]}
            for s in sources
        ]
    })


@dashboard_bp.route('/risk-assets', methods=['GET'])
@login_required
def get_risk_assets():
    assets = Asset.query.order_by(Asset.risk_score.desc()).limit(10).all()

    return jsonify({
        'success': True,
        'data': [
            {'name': a.name, 'ip': a.ip, 'riskScore': a.risk_score, 'type': a.type}
            for a in assets
        ]
    })