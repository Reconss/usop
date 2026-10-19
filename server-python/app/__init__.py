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
            Vulnerability, AssetVulnerability, VulnerabilityAttachment, ScanProfile, ScanAgent, HuntingResult,
            AIInsight, AIChatSession, AIChatMessage, AIAgent, Role, AssetPort,
            ScanResult, DetectionRuleExtended, PlaybookExecution,
            AlertFieldDefinition
        )
        # 导入路由文件中定义的模型（需在 create_all 之前注册）
        from app.routes.storage_tables import StorageTable
        from app.models.ste_experience import STEExperience
        from app.routes.templates import AlertTemplate
        from app.alert_pipeline.pipeline import (CorrelationRule, AlertFilterRule, ParseProfile,
                                                 AlertExit, AlertDispatchPolicy, AlertStorageRoute)
        from app.models.resource_groups import IpGroup, IpGroupItem, DomainGroup, DomainGroupItem
        from app.models.ai_prompt import AIPrompt
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
        # 迁移：parse_profiles 表添加 field_mappings 列（幂等）
        if 'parse_profiles' in inspector.get_table_names():
            existing_cols = [c['name'] for c in inspector.get_columns('parse_profiles')]
            if 'field_mappings' not in existing_cols:
                with db.engine.begin() as conn:
                    conn.execute(sa_text('ALTER TABLE parse_profiles ADD COLUMN field_mappings JSON'))
                    print("✓ 迁移: parse_profiles 表添加 field_mappings 列")
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

        # 初始化默认角色（幂等）
        from app.models.extensions import Role as RoleModel
        default_roles = [
            {'id': 'admin', 'name': '超级管理员', 'description': '系统最高权限，可审批所有操作', 'permissions': ['*'], 'approval_level': 3, 'can_approve': ['*'], 'max_auto_approve': 0, 'is_system': True},
            {'id': 'senior_analyst', 'name': '安全主管', 'description': '高级安全分析师，可审批中高风险操作', 'permissions': ['alerts.read', 'alerts.write', 'events.read', 'events.write', 'approve.level2', 'approve.level3'], 'approval_level': 3, 'can_approve': ['block_ip', 'unblock_ip', 'isolate_host', 'quarantine_file', 'terminate_process', 'modify_firewall', 'whitelist_add'], 'max_auto_approve': 0, 'is_system': True},
            {'id': 'analyst', 'name': '安全分析师', 'description': '日常安全运营，可审批中风险操作', 'permissions': ['alerts.read', 'alerts.write', 'events.read', 'approve.level2'], 'approval_level': 2, 'can_approve': ['block_ip', 'unblock_ip', 'quarantine_file', 'whitelist_add'], 'max_auto_approve': 3, 'is_system': True},
            {'id': 'operator', 'name': '安全运维', 'description': '安全设备运维，仅可执行低风险操作', 'permissions': ['alerts.read', 'events.read'], 'approval_level': 1, 'can_approve': ['whitelist_add'], 'max_auto_approve': 5, 'is_system': True},
            {'id': 'auditor', 'name': '审计员', 'description': '只读权限，审计所有操作记录', 'permissions': ['alerts.read', 'events.read', 'audit.read'], 'approval_level': 1, 'can_approve': [], 'max_auto_approve': 0, 'is_system': True},
        ]
        for rd in default_roles:
            if not RoleModel.query.get(rd['id']):
                role = RoleModel(**rd)
                db.session.add(role)
        db.session.commit()
        
        # 运行存储表迁移（确保安全告警表存在）
        try:
            from app.routes.storage_tables import StorageTable
            from datetime import datetime
            import json
            
            # 安全告警表字段定义
            ALERTS_TABLE_COLUMNS = [
                {'name':'alert_code','label':'告警编号','type':'string','required':True},
                {'name':'title','label':'告警标题','type':'string','required':True},
                {'name':'description','label':'告警描述','type':'string','required':False},
                {'name':'severity','label':'严重程度','type':'string','required':True},
                {'name':'status','label':'状态','type':'string','required':True},
                {'name':'source','label':'数据源','type':'string','required':False},
                {'name':'source_product','label':'产品类型','type':'string','required':False},
                {'name':'category','label':'分类','type':'string','required':False},
                {'name':'src_ip','label':'源地址','type':'string','required':False},
                {'name':'src_port','label':'源端口','type':'number','required':False},
                {'name':'dst_ip','label':'目标地址','type':'string','required':False},
                {'name':'dst_port','label':'目标端口','type':'number','required':False},
                {'name':'protocol','label':'协议','type':'string','required':False},
                {'name':'hostname','label':'主机名','type':'string','required':False},
                {'name':'raw_log','label':'原始日志','type':'string','required':False},
                {'name':'extra_data','label':'扩展数据','type':'json','required':False},
            ]


            # 清理重复创建的预置表
            try:
                duplicates = StorageTable.query.filter(
                    StorageTable.name.in_(['security_alerts'])
                ).all()
                for dup in duplicates:
                    db.session.delete(dup)
                if duplicates:
                    db.session.commit()
                    print(f"✓ 已清理 {len(duplicates)} 个重复的预置存储表")
            except Exception:
                db.session.rollback()

            # 确保系统预置表存在（security_events / alerts）
            from app.models import DataTable
            for table_name in ['security_events', 'alerts']:
                st = StorageTable.query.filter_by(name=table_name).first()
                if not st:
                    st = StorageTable(
                        name=table_name,
                        display_name='Elasticsearch告警索引' if table_name == 'alerts' else '安全事件表',
                        data_source='系统',
                        log_type='elasticsearch' if table_name == 'alerts' else 'postgresql',
                        retention_days=90,
                        partition_interval='1天',
                        indexes=[{'field': 'alert_code', 'type': 'btree'}] if table_name == 'alerts' else [],
                        columns=ALERTS_TABLE_COLUMNS if table_name == 'alerts' else [],
                        row_count=0,
                        size='0 MB',
                        compression=True,
                        auto_created=True,
                        created_by_pipeline='system'
                    )
                    db.session.add(st)
                    db.session.flush()  # 获取 st.id
                
                # 同时在 data_tables 中创建对应记录（供 Pipeline 外键引用）
                dt_id = f'tbl_{table_name}'
                if not DataTable.query.get(dt_id):
                    dt = DataTable(
                        id=dt_id,
                        name=table_name,
                        code=table_name,
                        description=f'系统预置{table_name}表',
                        columns=ALERTS_TABLE_COLUMNS if table_name == 'alerts' else [],
                        retention_days=90,
                        status='active'
                    )
                    db.session.add(dt)
            
            db.session.commit()
            print("✓ 系统预置存储表初始化完成")
        except Exception as e:
            print(f"安全告警存储表初始化: {e}")


        # 初始化标准告警字段定义（幂等，已存在则跳过）
        from app.routes.alert_fields import _seed_standard_fields
        _seed_standard_fields()

        # 播种 AI 中心内置提示词（幂等；用户自建的同类型默认项不会被抢占）
        try:
            from app.utils.ai_prompts import seed_prompts
            n = seed_prompts()
            if n:
                print(f"✓ AI 提示词初始化完成（新增 {n} 条内置提示词）")
        except Exception as e:
            print(f"AI 提示词初始化: {e}")

    # Register blueprints
    from app.routes.auth import auth_bp
    from app.routes.config import config_bp
    from app.routes.notifications import notifications_bp
    from app.routes.alert_fields import alert_fields_bp
    from app.routes.storage_tables import storage_bp
    from app.routes.ai_judgment import ai_judgment_bp
    from app.routes.ai_center import ai_center_bp
    from app.routes.kpi import kpi_bp
    from app.routes.backup import backup_bp
    from app.routes.templates import templates_bp
    from app.routes.pipeline_api import pipeline_bp
    from app.routes.resources import resources_bp
    
    # 新增 API 蓝图
    from app.routes.dashboard_api import dashboard_api_bp
    from app.routes.alerts_api import alerts_api_bp
    from app.routes.assets_api import assets_api_bp
    from app.routes.scans_api import scans_api_bp
    from app.routes.rules_api import rules_api_bp
    from app.routes.hunting_api import hunting_api_bp
    from app.routes.users_api import users_api_bp
    from app.routes.ai_api import ai_api_bp
    from app.routes.ai_capabilities import ai_capabilities_bp
    from app.routes.vulnerabilities_api import vulnerabilities_api_bp
    from app.routes.playbooks_api import playbooks_api_bp
    from app.routes.integrations_api import integrations_api_bp
    from app.routes.audit_logs_api import audit_logs_api_bp
    from app.routes.data_sources_api import data_sources_api_bp
    from app.routes.system_status_api import system_status_bp
    from app.routes.events_api import events_api_bp
    from app.routes.roles_api import roles_api_bp
    from app.routes.vulnerability_assessment_api import assessment_api_bp

    app.register_blueprint(alert_fields_bp, url_prefix='/api/alert-fields')
    app.register_blueprint(storage_bp, url_prefix='/api/storage-tables')
    app.register_blueprint(ai_judgment_bp, url_prefix='/api/ai-judgment')
    app.register_blueprint(ai_center_bp, url_prefix='/api/ai-center')
    app.register_blueprint(kpi_bp, url_prefix='/api/kpi')
    app.register_blueprint(backup_bp, url_prefix='/api/backup')
    app.register_blueprint(templates_bp, url_prefix='/api/templates')
    app.register_blueprint(pipeline_bp, url_prefix='/api/pipeline')
    app.register_blueprint(resources_bp, url_prefix='/api/resources')
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(config_bp, url_prefix='/api/config')
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
    app.register_blueprint(ai_capabilities_bp, url_prefix='/api/ai-api')
    app.register_blueprint(vulnerabilities_api_bp, url_prefix='/api/vulnerabilities-api')
    app.register_blueprint(playbooks_api_bp, url_prefix='/api/playbooks-api')
    app.register_blueprint(integrations_api_bp, url_prefix='/api/integrations')
    app.register_blueprint(audit_logs_api_bp, url_prefix='/api/audit-logs-api')
    app.register_blueprint(data_sources_api_bp, url_prefix='/api/datasources-api')
    app.register_blueprint(system_status_bp, url_prefix='/api/system-status')
    app.register_blueprint(events_api_bp, url_prefix='/api/event-actions-api')
    app.register_blueprint(roles_api_bp, url_prefix='/api/roles-api')
    app.register_blueprint(assessment_api_bp, url_prefix='/api/vulnerabilities-api')

    # 角色权限：注册集中式写操作拦截 + 种子系统角色（admin/operator/analyst/auditor）。
    # rbac_seed_version 标记：版本变更（首次部署/默认分配调整）时强制同步为内置默认；
    # 之后管理员在角色页的调整持久生效，重启不覆盖。UI「恢复默认」走 POST /roles-api/roles/seed。
    from app.utils.permissions import register_write_guard, seed_system_roles, RBAC_SEED_VERSION
    register_write_guard(app)
    try:
        with app.app_context():
            from app.models import SystemConfig
            marker = SystemConfig.query.filter_by(key='rbac_seed_version').first()
            if not marker or str(marker.value) != RBAC_SEED_VERSION:
                seed_result = seed_system_roles(force=True)
                if marker:
                    marker.value = RBAC_SEED_VERSION
                else:
                    db.session.add(SystemConfig(key='rbac_seed_version', value=RBAC_SEED_VERSION))
                db.session.commit()
                print(f"系统角色权限已按 v{RBAC_SEED_VERSION} 分配: "
                      f"更新 {', '.join(seed_result['updated']) or '无'} / 新建 {', '.join(seed_result['created']) or '无'}")
    except Exception as e:
        print(f"系统角色种子化失败 (非致命): {e}")
        try:
            with app.app_context():
                db.session.rollback()
        except Exception:
            pass

    # 告警处理链路：默认走分阶段流水线（标准化→过滤去重→valid/invalid 分流→ES 双索引→关联分析→事件）；
    # ALERT_PIPELINE=0 时回退旧通用告警消费者（仅 PG 直写）
    if os.getenv('ALERT_PIPELINE', '1') == '1':
        try:
            from app.alert_pipeline import init_alert_pipeline
            init_alert_pipeline(app)
            print("告警分阶段流水线已启动（标准化/过滤去重/分流/ES 双索引/关联分析）")
        except Exception as e:
            print(f"告警流水线初始化失败 (非致命): {e}")
    else:
        try:
            from app.utils.alert_consumer import init_alert_consumer
            init_alert_consumer(app)
            print("通用告警消费者已按数据源配置启动")
        except Exception as e:
            print(f"通用告警消费者初始化失败 (非致命): {e}")

    # Health check
    @app.route('/api/health')
    def health():
        db_status = 'connected'

        try:
            db.session.execute(db.text('SELECT 1'))
        except Exception:
            db_status = 'disconnected'

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
                'postgresql': db_status
            },
            'components': components,
            'timestamp': datetime.now().isoformat()
        }

    # 告警处理链路：默认走分阶段流水线（标准化→过滤去重→valid/invalid 分流→ES 双索引→关联分析→事件）；
    if os.getenv('ALERT_PIPELINE', '1') == '1':
        try:
            from app.alert_pipeline import init_alert_pipeline
            init_alert_pipeline(app)
            print("告警分阶段流水线已启动（标准化/过滤去重/分流/ES 双索引/关联分析）")
        except Exception as e:
            print(f"⚠ 告警流水线初始化失败: {e}")
    else:
        try:
            from app.utils.alert_consumer import init_alert_consumer
            init_alert_consumer(app)
            print("通用告警消费者已按数据源配置启动")
        except Exception as e:
            print(f"⚠ 通用告警消费者初始化失败: {e}")

    # 启动 APScheduler 定时任务
    try:
        from app.scheduler import start_scheduler
        if start_scheduler(app):
            print('AI 告警批量研判定时任务已启动 (60s 间隔，开关见 AI 中心 → 告警监控)')
        else:
            print('AI 批量研判定时任务未启动（其它进程已持有锁或启动失败）')
    except Exception as e:
        print(f'AI 调度器启动失败 (非致命): {e}')

    # 404 handler
    @app.errorhandler(404)
    def not_found(e):
        return {'success': False, 'error': '接口不存在', 'path': str(e)}, 404

    # Error handler
    @app.errorhandler(500)
    def server_error(e):
        return {'success': False, 'error': '服务器内部错误'}, 500

    return app
