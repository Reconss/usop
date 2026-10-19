"""
运营 KPI 统计（借鉴 EFF-Monitoring 的运营总览口径）

指标：
- 处置率 / 误报率
- 平均处置耗时 MTTR（已处置告警 updated_at - created_at 均值）
- 资产命中率（告警 IP 命中资产清单的比例）
- Top5 分类、Top5 源 IP
"""
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from sqlalchemy import func, text
from app.database import db
from app.models import Alert, Asset
from app.routes.auth import login_required

kpi_bp = Blueprint('kpi', __name__)

RESOLVED_STATUSES = ['closed', 'false_positive', 'resolved', 'ai_analyzed']


@kpi_bp.route('/overview', methods=['GET'])
@login_required
def overview():
    days = request.args.get('days', 30, type=int)
    since = datetime.utcnow() - timedelta(days=days)

    total = Alert.query.filter(Alert.created_at >= since).count()
    resolved = Alert.query.filter(
        Alert.created_at >= since, Alert.status.in_(RESOLVED_STATUSES)
    ).count()
    fp = Alert.query.filter(
        Alert.created_at >= since, Alert.status == 'false_positive'
    ).count()

    resolution_rate = round(resolved / total * 100, 1) if total else 0.0
    fp_rate = round(fp / total * 100, 1) if total else 0.0

    # MTTR：已处置告警的 (updated_at - created_at) 均值（小时）
    mttr_hours = 0.0
    if resolved:
        rows = db.session.query(
            func.avg(func.extract('epoch', Alert.updated_at - Alert.created_at))
        ).filter(Alert.created_at >= since, Alert.status.in_(RESOLVED_STATUSES)).scalar()
        # func.avg 返回 Decimal（直接除 float 会抛 TypeError），先转 float
        mttr_hours = round(float(rows or 0) / 3600.0, 2)

    # 资产命中率：告警 IP 命中资产清单
    asset_hit = 0
    if total:
        asset_hit = db.session.execute(text("""
            SELECT COUNT(*) FROM alerts
            WHERE created_at >= :since
              AND (src_ip IN (SELECT ip FROM assets WHERE ip IS NOT NULL)
                   OR dst_ip IN (SELECT ip FROM assets WHERE ip IS NOT NULL))
        """), {'since': since}).scalar() or 0
    asset_hit_rate = round(asset_hit / total * 100, 1) if total else 0.0

    # Top5 分类
    cat_rows = db.session.query(Alert.category, func.count().label('c')).filter(
        Alert.created_at >= since
    ).group_by(Alert.category).order_by(func.count().desc()).limit(5).all()
    top_categories = [{'category': (c or '未知'), 'count': cnt} for c, cnt in cat_rows]

    # Top5 源 IP
    ip_rows = db.session.query(Alert.src_ip, func.count().label('c')).filter(
        Alert.created_at >= since, Alert.src_ip.isnot(None)
    ).group_by(Alert.src_ip).order_by(func.count().desc()).limit(5).all()
    top_src_ips = [{'src_ip': ip, 'count': cnt} for ip, cnt in ip_rows]

    by_severity = dict(db.session.query(Alert.severity, func.count()).filter(
        Alert.created_at >= since).group_by(Alert.severity).all())

    return jsonify({
        'success': True,
        'data': {
            'days': days,
            'total_alerts': total,
            'resolved': resolved,
            'false_positives': fp,
            'resolution_rate': resolution_rate,
            'false_positive_rate': fp_rate,
            'mttr_hours': mttr_hours,
            'asset_hit_rate': asset_hit_rate,
            'by_severity': by_severity,
            'top_categories': top_categories,
            'top_src_ips': top_src_ips,
            'generated_at': datetime.utcnow().isoformat(),
        }
    })
