"""
系统状态 API - 获取存储底座和数据采集状态
"""
from flask import Blueprint, jsonify
from app.routes.auth import login_required
import requests
import os
from datetime import datetime

system_status_bp = Blueprint('system_status_api', __name__)

# Elasticsearch 配置
ES_HOSTS = os.getenv('ES_HOSTS', 'http://localhost:9200')

# TimescaleDB 配置
TSDB_HOST = os.getenv('TSDB_HOST', 'localhost')
TSDB_PORT = os.getenv('TSDB_PORT', '5433')

# OpenObserve 配置 (如果可用)
OPENOBSERVE_URL = os.getenv('OPENOBSERVE_URL', 'http://localhost:19080')


@system_status_bp.route('/storage-status', methods=['GET'])
@login_required
def get_storage_status():
    """获取存储底座状态"""
    status = {
        "elasticsearch": {"status": "unknown", "version": None, "indices": 0, "docs": 0},
        "timescaledb": {"status": "unknown", "version": None, "size_mb": 0},
        "openobserve": {"status": "unavailable", "version": None, "streams": 0}
    }
    
    # 检查 Elasticsearch
    try:
        es_resp = requests.get(f"{ES_HOSTS}/", timeout=5)
        if es_resp.status_code == 200:
            data = es_resp.json()
            status["elasticsearch"] = {
                "status": "healthy",
                "version": data.get("version", {}).get("number", "unknown"),
                "cluster_name": data.get("cluster_name", "unknown")
            }
            
            # 获取索引统计
            try:
                indices_resp = requests.get(f"{ES_HOSTS}/_stats", timeout=5)
                if indices_resp.status_code == 200:
                    stats = indices_resp.json()
                    status["elasticsearch"]["indices"] = len(stats.get("indices", {}))
                    status["elasticsearch"]["docs"] = stats.get("_all", {}).get("total", {}).get("docs", {}).get("count", 0)
            except:
                pass
    except Exception as e:
        status["elasticsearch"]["status"] = f"error: {str(e)[:50]}"
    
    # 检查 OpenObserve (如果可用)
    try:
        oo_resp = requests.get(f"{OPENOBSERVE_URL}/health", timeout=3)
        if oo_resp.status_code in (200, 401):  # 401 表示服务运行但需认证
            status["openobserve"]["status"] = "running"
    except:
        status["openobserve"]["status"] = "unavailable"
    
    return jsonify({
        "success": True,
        "data": status,
        "timestamp": datetime.utcnow().isoformat()
    })


@system_status_bp.route('/data-flow-status', methods=['GET'])
@login_required
def get_data_flow_status():
    """获取数据流状态"""
    # 从数据库获取数据采集统计
    from app.database import db
    from app.models import DataSource, Pipeline
    
    try:
        sources = DataSource.query.all()
        pipelines = Pipeline.query.all()
        
        active_sources = sum(1 for s in sources if s.status == 'active')
        active_pipelines = sum(1 for p in pipelines if p.status == 'active')
        
        return jsonify({
            "success": True,
            "data": {
                "data_sources": {
                    "total": len(sources),
                    "active": active_sources,
                    "inactive": len(sources) - active_sources
                },
                "pipelines": {
                    "total": len(pipelines),
                    "active": active_pipelines,
                    "inactive": len(pipelines) - active_pipelines
                },
                "last_update": datetime.utcnow().isoformat()
            }
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        })


@system_status_bp.route('/quick-stats', methods=['GET'])
@login_required
def get_quick_stats():
    """快速统计信息"""
    from app.database import db
    from app.models import Alert, Event, Asset
    
    try:
        # 告警统计
        total_alerts = Alert.query.count()
        
        # 事件统计
        total_events = Event.query.count()
        
        # 资产统计
        total_assets = Asset.query.count()
        
        return jsonify({
            "success": True,
            "data": {
                "total_alerts": total_alerts,
                "total_events": total_events,
                "total_assets": total_assets
            }
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        })
