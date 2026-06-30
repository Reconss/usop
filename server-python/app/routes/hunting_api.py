"""
威胁狩猎 API - 查询 alerts 表进行威胁检测
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import Alert
from sqlalchemy import or_, and_, func, desc
from datetime import datetime, timedelta
import json
import re

hunting_api_bp = Blueprint('hunting_api', __name__)

# 预置威胁狩猎查询
HUNTING_TEMPLATES = [
    {
        'id': 'tpl_lateral_movement',
        'name': '横向移动检测',
        'description': '检测内网主机间的异常端口访问（SMB/RDP/SSH）',
        'category': '网络入侵',
        'severity': 'high',
        'query': 'protocol:SSH OR dst_port:445 OR dst_port:3389',
        'mitre': 'T1021',
        'tags': ['lateral_movement', 'network'],
    },
    {
        'id': 'tpl_brute_force',
        'name': '暴力破解检测',
        'description': '检测SSH/登录失败的暴力破解行为',
        'category': '暴力破解',
        'severity': 'critical',
        'query': 'category:暴力破解 OR title:暴力破解 OR title:brute',
        'mitre': 'T1110',
        'tags': ['brute_force', 'authentication'],
    },
    {
        'id': 'tpl_malware_download',
        'name': '恶意软件下载',
        'description': '检测网络木马下载和可疑文件传输',
        'category': '恶意软件',
        'severity': 'critical',
        'query': 'category:恶意软件 OR category:Malware OR title:Trojan OR title:malware',
        'mitre': 'T1105',
        'tags': ['malware', 'download'],
    },
    {
        'id': 'tpl_web_attack',
        'name': 'Web攻击检测',
        'description': '检测SQL注入、XSS、WebShell等Web攻击',
        'category': 'Web攻击',
        'severity': 'high',
        'query': 'category:Web攻击 OR category:SQL\\ Injection OR title:WebShell OR title:XSS',
        'mitre': 'T1190',
        'tags': ['web_attack', 'web'],
    },
    {
        'id': 'tpl_data_exfil',
        'name': '数据外泄检测',
        'description': '检测敏感数据大量传输和异常DNS查询',
        'category': '数据泄露',
        'severity': 'high',
        'query': 'category:数据泄露 OR category:异常流量 OR title:外泄',
        'mitre': 'T1048',
        'tags': ['data_exfil', 'exfiltration'],
    },
    {
        'id': 'tpl_c2',
        'name': 'C2通信检测',
        'description': '检测命令控制服务器通信和可疑进程',
        'category': '恶意软件',
        'severity': 'critical',
        'query': 'category:恶意软件 OR category:C2 OR title:C2 OR title:suspicious',
        'mitre': 'T1071',
        'tags': ['c2', 'command_control'],
    },
    {
        'id': 'tpl_privilege_escalation',
        'name': '权限提升检测',
        'description': '检测异常sudo使用和特权账户操作',
        'category': '权限异常',
        'severity': 'critical',
        'query': 'category:权限异常 OR title:权限提升 OR title:privilege',
        'mitre': 'T1548',
        'tags': ['privilege_escalation', 'authorization'],
    },
    {
        'id': 'tpl_network_scan',
        'name': '网络扫描检测',
        'description': '检测端口扫描和网络侦察行为',
        'category': '网络入侵',
        'severity': 'medium',
        'query': 'category:网络扫描 OR category:侦察 OR title:扫描',
        'mitre': 'T1046',
        'tags': ['reconnaissance', 'scanning'],
    },
    {
        'id': 'tpl_ddos',
        'name': 'DDoS攻击检测',
        'description': '检测拒绝服务攻击和流量异常',
        'category': '拒绝服务',
        'severity': 'high',
        'query': 'category:拒绝服务 OR title:DDoS OR title:Flood',
        'mitre': 'T1499',
        'tags': ['dos', 'ddos'],
    },
    {
        'id': 'tpl_db_anomaly',
        'name': '数据库异常检测',
        'description': '检测数据库异常查询和敏感数据访问',
        'category': '数据泄露',
        'severity': 'medium',
        'query': 'category:数据泄露 OR category:数据库 OR title:数据库',
        'mitre': 'T1005',
        'tags': ['database', 'anomaly'],
    },
]


def _parse_query_to_filters(query_string):
    """将查询字符串转为 SQLAlchemy 过滤条件"""
    if not query_string:
        return []

    conditions = []
    # 按 OR 分割
    or_groups = re.split(r'\s+OR\s+', query_string, flags=re.IGNORECASE)

    for group in or_groups:
        and_parts = re.split(r'\s+AND\s+', group.strip(), flags=re.IGNORECASE)
        group_conditions = []

        for part in and_parts:
            part = part.strip()
            if not part:
                continue

            # NOT field:value
            not_match = re.match(r'NOT\s+(\w+):(.+)', part, re.IGNORECASE)
            if not_match:
                field, value = not_match.group(1), not_match.group(2).strip('"')
                col = getattr(Alert, field, None)
                if col:
                    group_conditions.append(col != value)
                continue

            # field:value with wildcard
            match = re.match(r'(\w+):(.+)', part)
            if match:
                field, value = match.group(1), match.group(2).strip('"')
                col = getattr(Alert, field, None)
                if col is None:
                    continue
                if '*' in value:
                    group_conditions.append(col.like(value.replace('*', '%')))
                else:
                    # Exact term match on the column
                    group_conditions.append(col == value)
                continue

            # 全文搜索
            conditions.append(or_(
                Alert.title.ilike(f'%{part}%'),
                Alert.description.ilike(f'%{part}%'),
                Alert.category.ilike(f'%{part}%'),
            ))

        if group_conditions:
            conditions.append(and_(*group_conditions))

    return conditions


@hunting_api_bp.route('/templates', methods=['GET'])
@login_required
def get_templates():
    """获取预置威胁狩猎模板"""
    return jsonify({'success': True, 'data': HUNTING_TEMPLATES})


@hunting_api_bp.route('/search', methods=['POST'])
@login_required
def hunting_search():
    """执行威胁狩猎搜索"""
    data = request.get_json() or {}
    query = data.get('query', '')
    page = int(data.get('page', 1))
    page_size = int(data.get('page_size', 50))
    start_time = data.get('start_time')
    end_time = data.get('end_time')
    severity = data.get('severity')
    source = data.get('source')

    try:
        base = Alert.query

        # 应用查询条件
        if query:
            filters = _parse_query_to_filters(query)
            if filters:
                base = base.filter(or_(*filters))

        if severity:
            if ',' in severity:
                base = base.filter(Alert.severity.in_(severity.split(',')))
            else:
                base = base.filter(Alert.severity == severity)

        if source:
            base = base.filter(Alert.source_product.ilike(f'%{source}%'))

        if start_time:
            try:
                base = base.filter(Alert.first_seen >= datetime.fromisoformat(start_time.replace('Z', '+00:00')))
            except Exception:
                pass
        if end_time:
            try:
                base = base.filter(Alert.first_seen <= datetime.fromisoformat(end_time.replace('Z', '+00:00')))
            except Exception:
                pass

        total = base.count()
        results = base.order_by(desc(Alert.first_seen)).offset((page - 1) * page_size).limit(page_size).all()

        return jsonify({
            'success': True,
            'data': {
                'items': [a.to_dict() for a in results],
                'total': total,
                'page': page,
                'page_size': page_size,
                'query': query,
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@hunting_api_bp.route('/stats', methods=['GET'])
@login_required
def get_stats():
    """威胁狩猎统计"""
    total = Alert.query.count()
    critical = Alert.query.filter(Alert.severity == 'critical').count()
    high = Alert.query.filter(Alert.severity == 'high').count()
    since_24h = datetime.utcnow() - timedelta(hours=24)
    recent = Alert.query.filter(Alert.created_at >= since_24h).count()

    # 按产品分布
    products = db.session.query(Alert.source_product, func.count()).group_by(Alert.source_product).all()

    # 按分类分布
    categories = db.session.query(Alert.category, func.count()).group_by(Alert.category).all()

    return jsonify({
        'success': True,
        'data': {
            'total_alerts': total,
            'critical_alerts': critical,
            'high_alerts': high,
            'recent_24h': recent,
            'product_distribution': {k: v for k, v in products if k},
            'category_distribution': {k: v for k, v in categories if k},
        }
    })


@hunting_api_bp.route('/indicators', methods=['GET'])
@login_required
def get_indicators():
    """获取高危指标（IP、域名等）"""
    # 从 alerts 中提取高危 IP
    top_src_ips = db.session.query(
        Alert.src_ip, func.count().label('cnt')
    ).filter(
        Alert.severity.in_(['critical', 'high']),
        Alert.src_ip != '', Alert.src_ip.isnot(None)
    ).group_by(Alert.src_ip).order_by(desc('cnt')).limit(10).all()

    top_dst_ips = db.session.query(
        Alert.dst_ip, func.count().label('cnt')
    ).filter(
        Alert.severity.in_(['critical', 'high']),
        Alert.dst_ip != '', Alert.dst_ip.isnot(None)
    ).group_by(Alert.dst_ip).order_by(desc('cnt')).limit(10).all()

    top_hosts = db.session.query(
        Alert.hostname, func.count().label('cnt')
    ).filter(
        Alert.hostname != '', Alert.hostname.isnot(None)
    ).group_by(Alert.hostname).order_by(desc('cnt')).limit(10).all()

    return jsonify({
        'success': True,
        'data': {
            'src_ips': [{'value': ip, 'count': cnt} for ip, cnt in top_src_ips],
            'dst_ips': [{'value': ip, 'count': cnt} for ip, cnt in top_dst_ips],
            'hosts': [{'value': h, 'count': cnt} for h, cnt in top_hosts],
        }
    })
