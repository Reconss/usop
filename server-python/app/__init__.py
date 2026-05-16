import os
from flask import Flask
from flask_cors import CORS
from app.database import db
from datetime import datetime


def create_app():
    app = Flask(__name__)

    # PostgreSQL 连接配置 (业务数据: 用户/事件/资产/规则等)
    # 端口: 5432, 用户: usop, 密码: usop_password, 库: usop_security
    database_url = os.getenv('DATABASE_URL', 'postgresql://usop:usop_password@localhost:5432/usop_security')
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'usop-secret-key-change-in-production')
    app.config['JWT_SECRET'] = os.getenv('JWT_SECRET', 'usop-jwt-secret-key')
    
    # TimescaleDB 连接配置 (时序数据: 告警日志/统计/聚合)
    # 端口: 5433, 用户: postgres, 密码: postgres, 库: postgres
    app.config['TSDB_USER'] = os.getenv('TSDB_USER', 'postgres')
    app.config['TSDB_PASSWORD'] = os.getenv('TSDB_PASSWORD', 'postgres')
    app.config['TSDB_NAME'] = os.getenv('TSDB_NAME', 'postgres')
    app.config['TSDB_HOST'] = os.getenv('TSDB_HOST', 'localhost')
    app.config['TSDB_PORT'] = os.getenv('TSDB_PORT', '5433')

    # Initialize extensions
    # CORS配置 - 允许所有来源以解决开发环境问题
    CORS(app, resources={
        r"/api/*": {
            "origins": ["*"],
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
            "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"],
            "expose_headers": ["Content-Range", "X-Content-Range"],
            "supports_credentials": False,
            "max_age": 3600
        }
    })
    db.init_app(app)

    # Request logging middleware
    @app.before_request
    def before_request():
        from flask import g
        g.start_time = datetime.now()

    @app.after_request
    def after_request(response):
        from flask import g, request
        # CORS headers 已由 flask-cors 处理，不要覆盖
        # 只添加请求日志

        if hasattr(g, 'start_time'):
            duration = (datetime.now() - g.start_time).total_seconds() * 1000
            print(f"{datetime.now().isoformat()} {request.method} {request.path} {response.status_code} {duration:.2f}ms")
        return response

    # Create tables and initialize default data
    with app.app_context():
        # Import all models to ensure they are registered with SQLAlchemy
        from app.models import (
            User, Event, Alert, Asset, ScanTask, Rule, Playbook,
            AuditLog, Notification, HuntingQuery, AIModel, AITask,
            DataSource, Product, Pipeline, AlertLog as AlertLogModel, SystemConfig,
            LogType, FormatTemplate, DataTable, LogClassifier, ClassifierRule, DataSourceConfig,
            Vulnerability, AssetVulnerability, ScanProfile, ScanAgent, HuntingResult,
            AIInsight, AIChatSession, AIChatMessage, AIAgent, Role, AssetPort,
            ScanResult, DetectionRuleExtended, PlaybookExecution,
            AlertFieldDefinition
        )
        # 导入路由文件中定义的模型（需在 create_all 之前注册）
        from app.routes.storage_tables import StorageTable
        db.create_all()
        # 迁移：为 detection_rules 表添加 playbook_id 列（幂等）
        from sqlalchemy import inspect as sa_inspect, text as sa_text
        inspector = sa_inspect(db.engine)
        if 'detection_rules' in inspector.get_table_names():
            existing_cols = [c['name'] for c in inspector.get_columns('detection_rules')]
            if 'playbook_id' not in existing_cols:
                with db.engine.begin() as conn:
                    conn.execute(sa_text('ALTER TABLE detection_rules ADD COLUMN playbook_id VARCHAR(50)'))
                    print("✓ 迁移: detection_rules 表添加 playbook_id 列")
        # Initialize default admin user if not exists
        from app.utils import hash_password
        if not User.query.filter_by(username='admin').first():
            admin = User(
                username='admin',
                email='admin@usop.local',
                password_hash=hash_password('admin123'),
                role='admin',
                status='active'
            )
            db.session.add(admin)
            db.session.commit()
            print("Default admin user created: admin / admin123")

        # 运行存储表迁移（确保安全告警表存在）
        try:
            from app.routes.storage_tables import StorageTable
            from datetime import datetime
            import json
            
            # 安全告警表字段定义
            SECURITY_ALERT_COLUMNS = [
                # 自动生成的字段
                {'name': 'id', 'label': 'ID', 'type': 'number', 'category': '系统-自动生成', 'required': True, 'auto_generated': True},
                {'name': 'alert_code', 'label': '告警编号', 'type': 'string', 'category': '系统-自动生成', 'required': True, 'auto_generated': True},
                {'name': 'first_seen', 'label': '首次发现时间', 'type': 'datetime', 'category': '系统-自动生成', 'required': True, 'auto_generated': True},
                {'name': 'last_seen', 'label': '最近发现时间', 'type': 'datetime', 'category': '系统-自动生成', 'required': True, 'auto_generated': True},
                {'name': 'created_at', 'label': '创建时间', 'type': 'datetime', 'category': '系统-自动生成', 'required': True, 'auto_generated': True},
                {'name': 'updated_at', 'label': '更新时间', 'type': 'datetime', 'category': '系统-自动生成', 'required': False, 'auto_generated': True},
                # 被动接收的字段
                {'name': 'title', 'label': '告警标题', 'type': 'string', 'category': '告警属性-被动接收', 'required': True, 'auto_generated': False},
                {'name': 'description', 'label': '告警描述', 'type': 'string', 'category': '告警属性-被动接收', 'required': False, 'auto_generated': False},
                {'name': 'severity', 'label': '严重程度', 'type': 'string', 'category': '告警属性-被动接收', 'required': True, 'auto_generated': False},
                {'name': 'status', 'label': '状态', 'type': 'string', 'category': '告警属性-被动接收', 'required': True, 'auto_generated': False},
                {'name': 'source', 'label': '数据源', 'type': 'string', 'category': '数据源-被动接收', 'required': True, 'auto_generated': False},
                {'name': 'source_product', 'label': '产品类型', 'type': 'string', 'category': '数据源-被动接收', 'required': False, 'auto_generated': False},
                {'name': 'src_ip', 'label': '源地址', 'type': 'string', 'category': '网络-被动接收', 'required': False, 'auto_generated': False},
                {'name': 'src_port', 'label': '源端口', 'type': 'number', 'category': '网络-被动接收', 'required': False, 'auto_generated': False},
                {'name': 'dst_ip', 'label': '目标地址', 'type': 'string', 'category': '网络-被动接收', 'required': False, 'auto_generated': False},
                {'name': 'dst_port', 'label': '目标端口', 'type': 'number', 'category': '网络-被动接收', 'required': False, 'auto_generated': False},
                {'name': 'protocol', 'label': '协议', 'type': 'string', 'category': '网络-被动接收', 'required': False, 'auto_generated': False},
                {'name': 'hostname', 'label': '主机名', 'type': 'string', 'category': '资产-被动接收', 'required': False, 'auto_generated': False},
                {'name': 'raw_log', 'label': '原始日志', 'type': 'string', 'category': '原始数据-被动接收', 'required': False, 'auto_generated': False},
                {'name': 'parsed_data', 'label': '解析数据', 'type': 'json', 'category': '原始数据-被动接收', 'required': False, 'auto_generated': False},
            ]
            
            # 确保安全告警存储表存在
            for table_name in ['alerts', 'security_alerts']:
                if not StorageTable.query.filter_by(name=table_name).first():
                    table = StorageTable(
                        name=table_name,
                        display_name='安全告警表' if table_name == 'security_alerts' else '告警表(别名)',
                        data_source='系统',
                        log_type='security_alert',
                        retention_days=90,
                        partition_interval='1天',
                        indexes=[{'field': 'alert_code', 'type': 'btree'}],
                        columns=SECURITY_ALERT_COLUMNS,
                        row_count=0,
                        size='0 MB',
                        compression=True,
                        auto_created=True,
                        created_by_pipeline='system'
                    )
                    db.session.add(table)
            db.session.commit()
            print("✓ 安全告警存储表初始化完成")
        except Exception as e:
            print(f"安全告警存储表初始化: {e}")


        # 初始化标准告警字段定义（幂等，已存在则跳过）
        from app.routes.alert_fields import _seed_standard_fields
        _seed_standard_fields()

    # Register blueprints
    from app.routes.dashboard import dashboard_bp
    from app.routes.events import events_bp
    from app.routes.alerts import alerts_bp
    from app.routes.assets import assets_bp
    from app.routes.scans import scans_bp
    from app.routes.rules import rules_bp
    from app.routes.playbooks import playbooks_bp
    from app.routes.users import users_bp
    from app.routes.auth import auth_bp
    from app.routes.audit_logs import audit_logs_bp
    from app.routes.config import config_bp
    from app.routes.hunting import hunting_bp
    from app.routes.ai import ai_bp
    from app.routes.notifications import notifications_bp
    from app.routes.data_sources import data_sources_bp
    from app.routes.products import products_bp
    from app.routes.pipelines import pipelines_bp
    from app.routes.alert_logs import alert_logs_bp
    from app.routes.ingestion import ingestion_bp
    from app.routes.log_management import log_management_bp
    from app.routes.intelligent_parse import intelligent_parse_bp
    from app.routes.alert_fields import alert_fields_bp
    from app.routes.pipeline_mappings import pipeline_mappings_bp
    from app.routes.storage_tables import storage_bp
    
    # 新增 API 蓝图
    from app.routes.dashboard_api import dashboard_api_bp
    from app.routes.alerts_api import alerts_api_bp
    from app.routes.assets_api import assets_api_bp
    from app.routes.scans_api import scans_api_bp
    from app.routes.rules_api import rules_api_bp
    from app.routes.hunting_api import hunting_api_bp
    from app.routes.users_api import users_api_bp
    from app.routes.ai_api import ai_api_bp
    from app.routes.vulnerabilities_api import vulnerabilities_api_bp
    from app.routes.playbooks_api import playbooks_api_bp
    from app.routes.audit_logs_api import audit_logs_api_bp
    from app.routes.products_api import products_api_bp
    from app.routes.data_sources_api import data_sources_api_bp
    from app.routes.log_types_api import log_types_api_bp
    from app.routes.log_search import log_search_bp
    from app.routes.events_api import events_api_bp
    from app.routes.roles_api import roles_api_bp

    app.register_blueprint(log_management_bp, url_prefix='/api/log-management')
    app.register_blueprint(data_sources_bp, url_prefix='/api/data-sources')
    app.register_blueprint(products_bp, url_prefix='/api/products')
    app.register_blueprint(pipelines_bp, url_prefix='/api/pipelines')
    app.register_blueprint(intelligent_parse_bp, url_prefix='/api/intelligent-parse')
    app.register_blueprint(alert_fields_bp, url_prefix='/api/alert-fields')
    app.register_blueprint(pipeline_mappings_bp, url_prefix='/api/pipeline-config')
    app.register_blueprint(storage_bp, url_prefix='/api/storage-tables')
    app.register_blueprint(alert_logs_bp, url_prefix='/api/alert-logs')
    app.register_blueprint(ingestion_bp, url_prefix='/api/ingestion')
    app.register_blueprint(dashboard_bp, url_prefix='/api/dashboard')
    app.register_blueprint(events_bp, url_prefix='/api/events')
    app.register_blueprint(alerts_bp, url_prefix='/api/alerts')
    app.register_blueprint(assets_bp, url_prefix='/api/assets')
    app.register_blueprint(scans_bp, url_prefix='/api/scans')
    app.register_blueprint(rules_bp, url_prefix='/api/rules')
    app.register_blueprint(playbooks_bp, url_prefix='/api/playbooks')
    app.register_blueprint(users_bp, url_prefix='/api/users')
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(audit_logs_bp, url_prefix='/api/audit-logs')
    app.register_blueprint(config_bp, url_prefix='/api/config')
    app.register_blueprint(hunting_bp, url_prefix='/api/hunting')
    app.register_blueprint(ai_bp, url_prefix='/api/ai')
    app.register_blueprint(notifications_bp, url_prefix='/api/notifications')
    
    # 注册新增 API 蓝图
    app.register_blueprint(dashboard_api_bp, url_prefix='/api/dashboard-api')
    app.register_blueprint(alerts_api_bp, url_prefix='/api/alerts-api')
    app.register_blueprint(assets_api_bp, url_prefix='/api/assets-api')
    app.register_blueprint(scans_api_bp, url_prefix='/api/scans-api')
    app.register_blueprint(rules_api_bp, url_prefix='/api/rules-api')
    app.register_blueprint(hunting_api_bp, url_prefix='/api/hunting-api')
    app.register_blueprint(users_api_bp, url_prefix='/api/users-api')
    app.register_blueprint(ai_api_bp, url_prefix='/api/ai-api')
    app.register_blueprint(vulnerabilities_api_bp, url_prefix='/api/vulnerabilities-api')
    app.register_blueprint(playbooks_api_bp, url_prefix='/api/playbooks-api')
    app.register_blueprint(audit_logs_api_bp, url_prefix='/api/audit-logs-api')
    app.register_blueprint(products_api_bp, url_prefix='/api/products-api')
    app.register_blueprint(data_sources_api_bp, url_prefix='/api/datasources-api')
    app.register_blueprint(log_types_api_bp, url_prefix='/api/log-types-api')
    app.register_blueprint(log_search_bp, url_prefix='/api/log-search')
    app.register_blueprint(events_api_bp, url_prefix='/api/event-actions-api')
    app.register_blueprint(roles_api_bp, url_prefix='/api/roles-api')


    # 初始化 WAF 日志消费者 (从 Kafka 消费 WAF 告警)
    try:
        from app.utils.waf_consumer import init_waf_consumer
        init_waf_consumer(app)
        print("WAF 日志消费者已启动，监听 topic: waf-alert")
    except Exception as e:
        print(f"WAF 消费者初始化失败 (非致命): {e}")

    # Health check
    @app.route('/api/health')
    def health():
        db_status = 'connected'
        tsdb_status = 'disconnected'
        
        try:
            db.session.execute(db.text('SELECT 1'))
        except Exception:
            db_status = 'disconnected'
        
        # 检查 TimescaleDB 连接
        try:
            from app.timescaledb import get_tsdb
            tsdb = get_tsdb()
            if tsdb.test_connection():
                tsdb_status = 'connected'
        except Exception as e:
            tsdb_status = f'disconnected: {str(e)}'
        
        # 检查大数据组件状态
        components = {}
        try:
            from app.utils.service_manager import check_all_components, ComponentStatus
            results = check_all_components(show_details=False)
            for key, status in results.items():
                components[key] = status.value
        except Exception:
            pass

        return {
            'status': 'healthy' if db_status == 'connected' else 'degraded',
            'service': 'USOP Backend API (Python)',
            'version': '1.0.0',
            'databases': {
                'postgresql': db_status,
                'timescaledb': tsdb_status
            },
            'components': components,
            'timestamp': datetime.now().isoformat()
        }

    # 404 handler
    @app.errorhandler(404)
    def not_found(e):
        return {'success': False, 'error': '接口不存在', 'path': str(e)}, 404

    # Error handler
    @app.errorhandler(500)
    def server_error(e):
        return {'success': False, 'error': '服务器内部错误'}, 500

    return app
