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


@system_status_bp.route('/storage-status', methods=['GET'])
@login_required
def get_storage_status():
    """获取存储底座状态（真实探测：Kafka/Redis/PostgreSQL/Elasticsearch）"""
    status = {
        "kafka": {"status": "unknown", "topics": 0},
        "redis": {"status": "unknown"},
        "postgres": {"status": "unknown"},
        "elasticsearch": {"status": "unknown", "version": None, "indices": 0, "docs": 0}
    }

    # Kafka：列出 topic 验证连通
    try:
        from kafka import KafkaAdminClient
        admin = KafkaAdminClient(
            bootstrap_servers=os.getenv('KAFKA_BOOTSTRAP_SERVERS', 'kafka:29092'),
            request_timeout_ms=4000)
        topics = admin.list_topics()
        admin.close()
        status["kafka"] = {"status": "healthy", "topics": len(topics)}
    except Exception as e:
        status["kafka"] = {"status": "unhealthy", "error": str(e)[:80]}

    # Redis：ping
    try:
        import redis
        r = redis.Redis(
            host=os.getenv('REDIS_HOST', 'redis'),
            port=int(os.getenv('REDIS_PORT', '6379')),
            socket_timeout=3)
        r.ping()
        status["redis"] = {"status": "healthy"}
    except Exception as e:
        status["redis"] = {"status": "unhealthy", "error": str(e)[:80]}

    # PostgreSQL：业务库 SELECT 1
    try:
        from app.database import db
        from sqlalchemy import text
        with db.engine.connect() as conn:
            conn.execute(text('SELECT 1'))
        status["postgres"] = {"status": "healthy"}
    except Exception as e:
        status["postgres"] = {"status": "unhealthy", "error": str(e)[:80]}

    # Elasticsearch
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
        status["elasticsearch"]["status"] = f"unhealthy"

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
