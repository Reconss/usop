"""
OpenObserve 日志存储和搜索 API
集成日志底座，替代/补充 Elasticsearch
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.openobserve_client import get_openobserve_client, OpenObserveClient
import os
from datetime import datetime, timedelta

openobserve_bp = Blueprint('openobserve', __name__)


@openobserve_bp.route('/health', methods=['GET'])
def health_check():
    """健康检查"""
    client = get_openobserve_client()
    healthy = client.health_check()
    return jsonify({
        "success": True,
        "data": {"healthy": healthy, "service": "openobserve"}
    })


# ========== 日志写入 ==========

@openobserve_bp.route('/logs/ingest', methods=['POST'])
@login_required
def ingest_logs():
    """
    批量写入日志
    
    请求体:
    {
        "logs": [
            {"message": "login failed", "src_ip": "192.168.1.1", "timestamp": "2026-06-19T10:00:00Z"},
            ...
        ],
        "stream": "security_logs"  # 可选，默认 logs
    }
    """
    data = request.get_json()
    if not data or not data.get('logs'):
        return jsonify({"success": False, "error": "缺少 logs 字段"}), 400
    
    logs = data.get('logs', [])
    stream = data.get('stream', 'security_logs')
    
    # 添加默认字段
    for log in logs:
        if 'timestamp' not in log:
            log['timestamp'] = datetime.utcnow().isoformat() + 'Z'
        if '_timestamp' not in log:
            log['_timestamp'] = log['timestamp']
    
    client = get_openobserve_client()
    
    try:
        result = client.ingest_logs(logs, stream)
        return jsonify({
            "success": True,
            "data": result,
            "message": f"成功写入 {result.get('ingested', 0)} 条日志"
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@openobserve_bp.route('/logs/ingest/syslog', methods=['POST'])
@login_required
def ingest_syslog():
    """
    接收 Syslog 格式日志
    
    请求体:
    {
        "host": "server1",
        "app": "sshd",
        "message": "Failed password for root from 10.0.0.1",
        "priority": 34,
        "timestamp": "2026-06-19T10:00:00Z"
    }
    """
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": "数据为空"}), 400
    
    # 转换为 OpenObserve 格式
    log = {
        "message": data.get('message', ''),
        "host": data.get('host', ''),
        "app": data.get('app', ''),
        "program": data.get('program', ''),
        "priority": data.get('priority', 0),
        "facility": data.get('facility', 0),
        "src_ip": data.get('src_ip', ''),
        "dst_ip": data.get('dst_ip', ''),
        "timestamp": data.get('timestamp') or datetime.utcnow().isoformat() + 'Z',
        "_timestamp": data.get('timestamp') or datetime.utcnow().isoformat() + 'Z',
        "log_type": "syslog"
    }
    
    client = get_openobserve_client()
    
    try:
        client.ingest_single_log(log, 'syslog')
        return jsonify({"success": True, "message": "Syslog 日志已接收"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ========== 日志搜索 ==========

@openobserve_bp.route('/logs/search', methods=['POST'])
@login_required
def search_logs():
    """
    搜索日志
    
    请求体:
    {
        "query": "login failed",        # 搜索关键词 (可选)
        "sql": "SELECT * FROM logs WHERE...",  # SQL 查询 (可选)
        "stream": "security_logs",       # 日志流
        "start_time": "2026-06-19T00:00:00Z",
        "end_time": "2026-06-19T23:59:59Z",
        "limit": 100,
        "offset": 0
    }
    """
    data = request.get_json() or {}
    
    query = data.get('query', '')
    sql = data.get('sql', '')
    stream = data.get('stream', 'security_logs')
    start_time = data.get('start_time')
    end_time = data.get('end_time')
    limit = data.get('limit', 100)
    offset = data.get('offset', 0)
    
    client = get_openobserve_client()
    
    try:
        if sql:
            # 直接执行 SQL
            result = client.search(sql, stream, limit=limit, offset=offset)
        else:
            # 关键词搜索
            result = client.search(
                query, stream, 
                start_time=start_time, 
                end_time=end_time,
                limit=limit, 
                offset=offset
            )
        
        return jsonify({
            "success": True,
            "data": {
                "hits": result.get('hits', []),
                "total": result.get('total', 0),
                "took": result.get('took', 0),
                "limit": limit,
                "offset": offset
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@openobserve_bp.route('/logs/search/time-range', methods=['GET'])
@login_required
def search_by_time_range():
    """按时间范围搜索"""
    stream = request.args.get('stream', 'security_logs')
    start_time = request.args.get('start_time')
    end_time = request.args.get('end_time')
    limit = int(request.args.get('limit', 100))
    
    client = get_openobserve_client()
    
    try:
        hits = client.search_by_time_range(
            stream, start_time, end_time, limit
        )
        return jsonify({
            "success": True,
            "data": {
                "hits": hits,
                "total": len(hits)
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ========== 统计和聚合 ==========

@openobserve_bp.route('/logs/histogram', methods=['GET'])
@login_required
def get_histogram():
    """获取时间分布直方图"""
    stream = request.args.get('stream', 'security_logs')
    field = request.args.get('field', '_timestamp')
    interval = request.args.get('interval', '1 hour')
    
    client = get_openobserve_client()
    
    try:
        data = client.get_histogram(field, interval, stream)
        return jsonify({
            "success": True,
            "data": data
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@openobserve_bp.route('/logs/quick-values', methods=['GET'])
@login_required
def get_quick_values():
    """获取字段快速值统计"""
    stream = request.args.get('stream', 'security_logs')
    field = request.args.get('field', 'src_ip')
    
    client = get_openobserve_client()
    
    try:
        data = client.get_field_stats(field, stream)
        return jsonify({
            "success": True,
            "data": data
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ========== 流管理 ==========

@openobserve_bp.route('/streams', methods=['GET'])
@login_required
def list_streams():
    """列出所有日志流"""
    client = get_openobserve_client()
    
    try:
        streams = client.list_streams()
        return jsonify({
            "success": True,
            "data": streams
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@openobserve_bp.route('/streams', methods=['POST'])
@login_required
def create_stream():
    """创建日志流"""
    data = request.get_json() or {}
    stream = data.get('name')
    
    if not stream:
        return jsonify({"success": False, "error": "缺少 name 字段"}), 400
    
    client = get_openobserve_client()
    
    try:
        success = client.create_stream(stream, data.get('schema', []))
        return jsonify({
            "success": success,
            "message": f"日志流 {stream} 创建{'成功' if success else '失败'}"
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@openobserve_bp.route('/streams/<name>', methods=['DELETE'])
@login_required
def delete_stream(name):
    """删除日志流"""
    client = get_openobserve_client()
    
    try:
        success = client.delete_stream(name)
        return jsonify({
            "success": success,
            "message": f"日志流 {name} 删除{'成功' if success else '失败'}"
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ========== 数据源集成 (替代 Kafka + Flink) ==========

@openobserve_bp.route('/ingest/http', methods=['POST'])
def http_ingest():
    """
    HTTP 接收日志 (直接写入 OpenObserve)
    可替代 Kafka + Flink 解析流程
    
    使用方式:
    curl -X POST "http://localhost:5001/api/openobserve/ingest/http" \
         -H "Content-Type: application/json" \
         -d '{"message": "test log", "level": "info"}'
    """
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": "数据为空"}), 400
    
    # 自动检测日志格式
    log = data.copy()
    if 'timestamp' not in log:
        log['timestamp'] = datetime.utcnow().isoformat() + 'Z'
    if '_timestamp' not in log:
        log['_timestamp'] = log['timestamp']
    
    # 添加格式类型标识
    if isinstance(data, str):
        if data.startswith('{'):
            log['format'] = 'json'
        elif 'sshd' in data or 'kernel' in data:
            log['format'] = 'syslog'
            log['message'] = data
        else:
            log['format'] = 'raw'
            log['message'] = data
    else:
        log['format'] = 'json'
    
    client = get_openobserve_client()
    
    try:
        client.ingest_single_log(log, 'http_ingest')
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@openobserve_bp.route('/ingest/batch', methods=['POST'])
def batch_ingest():
    """
    批量接收日志
    
    请求体: [{"log1": "..."}, {"log2": "..."}, ...]
    """
    data = request.get_json()
    if not isinstance(data, list):
        return jsonify({"success": False, "error": "需要数组格式"}), 400
    
    # 预处理
    logs = []
    for item in data:
        log = item.copy()
        if 'timestamp' not in log:
            log['timestamp'] = datetime.utcnow().isoformat() + 'Z'
        log['_timestamp'] = log.get('timestamp')
        logs.append(log)
    
    client = get_openobserve_client()
    
    try:
        result = client.ingest_logs(logs, 'batch_ingest')
        return jsonify({
            "success": True,
            "data": result
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
