import os
from flask import Flask
from flask_cors import CORS
from app.database import db
from datetime import datetime


def create_app():
    app = Flask(__name__)

    # Database configuration (default to PostgreSQL)
    database_url = os.getenv('DATABASE_URL', 'postgresql://usop:usop_password@localhost:5432/usop_security')
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'usop-secret-key-change-in-production')
    app.config['JWT_SECRET'] = os.getenv('JWT_SECRET', 'usop-jwt-secret-key')
    
    # TimescaleDB configuration for alert logs
    app.config['TSDB_USER'] = os.getenv('TSDB_USER', 'timescale')
    app.config['TSDB_PASSWORD'] = os.getenv('TSDB_PASSWORD', 'timescale_pass')
    app.config['TSDB_NAME'] = os.getenv('TSDB_NAME', 'alerts')
    app.config['TSDB_HOST'] = os.getenv('TSDB_HOST', 'localhost')
    app.config['TSDB_PORT'] = os.getenv('TSDB_PORT', '5433')

    # Initialize extensions
    CORS(app, resources={
        r"/api/*": {
            "origins": "*",
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"],
            "expose_headers": ["Content-Range", "X-Content-Range"],
            "supports_credentials": True
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
        # Add CORS headers to all responses
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        response.headers['Access-Control-Max-Age'] = '3600'
        
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
            ScanResult, DetectionRuleExtended, PlaybookExecution
        )
        db.create_all()
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

    app.register_blueprint(log_management_bp, url_prefix='/api/log-management')
    app.register_blueprint(data_sources_bp, url_prefix='/api/data-sources')
    app.register_blueprint(products_bp, url_prefix='/api/products')
    app.register_blueprint(pipelines_bp, url_prefix='/api/pipelines')
    app.register_blueprint(intelligent_parse_bp, url_prefix='/api/intelligent-parse')
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
