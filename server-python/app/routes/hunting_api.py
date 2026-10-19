"""
威胁狩猎 API

⚠️ 第 15 波起告警的唯一真相源是 Elasticsearch（`alerts-valid` / `alerts-invalid`），
PG 里那张 `alerts` 表只剩空壳。本模块原先全部按 `Alert.query` 写 SQL，
迁移后所有统计恒为 0、检索恒为空，且「威胁狩猎」页拿到空的 stats 后
`value.toLocaleString()` 抛 TypeError 把整页打崩。现统一改走 app.utils.es_alerts。
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.utils import es_alerts
from sqlalchemy import or_, and_, func, desc
from datetime import datetime, timedelta
import json
import re

hunting_api_bp = Blueprint('hunting_api', __name__)


def _es_total(filters=None, query_string='', start=None, end=None):
    """ES 里符合条件的告警条数（page_size=0 只取聚合，不取文档）。"""
    try:
        res = es_alerts.search_alerts(query_string=query_string, filters=filters or {},
                                      start=start, end=end, page_size=0)
        return int(res.get('total') or 0)
    except Exception:
        return 0


def _es_dist(field, filters=None, size=12):
    """字段取值分布 → {值: 条数}。"""
    try:
        res = es_alerts.quick_values(field=field, filters=filters or {}, size=size)
        return {b.get('key'): b.get('count', 0) for b in (res.get('buckets') or []) if b.get('key')}
    except Exception:
        return {}


def _es_top(field, filters=None, size=10):
    """字段 TopN → [{value, count}]。

    过滤掉 ES 的缺失值占位 'N/A' —— 那是「该字段没值」，不是真实指标，
    展示成主机名/IP 会误导。
    """
    try:
        res = es_alerts.quick_values(field=field, filters=filters or {}, size=size + 1)
        return [{'value': b.get('key'), 'count': b.get('count', 0)}
                for b in (res.get('buckets') or [])
                if b.get('key') and b.get('key') != 'N/A'][:size]
    except Exception:
        return []

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


# 注：原先的 _parse_query_to_filters 把查询串手工翻译成 SQLAlchemy 条件。
# 改走 ES 后不再需要——ES 的 query_string 原生支持 field:value / AND / OR / 通配符，
# 且语义比手写的这版更完整。已删除，避免继续引用已废弃的 Alert 模型。

@hunting_api_bp.route('/templates', methods=['GET'])
@login_required
def get_templates():
    """获取预置威胁狩猎模板"""
    return jsonify({'success': True, 'data': HUNTING_TEMPLATES})


@hunting_api_bp.route('/search', methods=['POST'])
@login_required
def hunting_search():
    """执行威胁狩猎搜索（走 ES alerts-valid）"""
    data = request.get_json() or {}
    query = data.get('query', '')
    page = int(data.get('page', 1))
    page_size = int(data.get('page_size', 50))
    start_time = data.get('start_time')
    end_time = data.get('end_time')
    severity = data.get('severity')
    source = data.get('source')

    filters = {}
    if severity:
        filters['severity'] = [s.strip() for s in str(severity).split(',') if s.strip()]

    # source 是模糊匹配，ES 的 term 做不到子串，拼进 query_string
    q = (query or '').strip()
    if source:
        src_clause = f'source_product:*{source}*'
        q = f'({q}) AND {src_clause}' if q else src_clause

    try:
        res = es_alerts.search_alerts(
            query_string=q, filters=filters,
            start=start_time or None, end=end_time or None,
            page=page, page_size=page_size, sort_field='first_seen', sort_order='desc')
        return jsonify({
            'success': True,
            'data': {
                'items': res.get('items') or [],
                'total': int(res.get('total') or 0),
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
    """威胁狩猎统计（ES alerts-valid）"""
    since_24h = es_alerts.to_iso(datetime.utcnow() - timedelta(hours=24))

    total = _es_total()
    critical = _es_total(filters={'severity': 'critical'})
    high = _es_total(filters={'severity': 'high'})
    recent = _es_total(start=since_24h)

    return jsonify({
        'success': True,
        'data': {
            'total_alerts': total,
            'critical_alerts': critical,
            'high_alerts': high,
            'recent_24h': recent,
            'product_distribution': _es_dist('source_product'),
            'category_distribution': _es_dist('category'),
        }
    })


@hunting_api_bp.route('/indicators', methods=['GET'])
@login_required
def get_indicators():
    """获取高危指标（IP、主机）——只统计 critical/high 告警"""
    hot = {'severity': ['critical', 'high']}
    return jsonify({
        'success': True,
        'data': {
            'src_ips': _es_top('src_ip', hot),
            'dst_ips': _es_top('dst_ip', hot),
            'hosts': _es_top('hostname', hot),
        }
    })
