"""
系统备份与还原（借鉴 EFF-Monitoring 的版本化 JSON 备份包）

设计：
- 导出：将核心 SOC 配置表序列化为带 version / exported_at 的 JSON 包（不导出 users / 时序告警，避免凭证与海量数据）。
- 还原：按主键 merge（存在则更新、不存在则插入），按依赖顺序导入，兼容字段级增量。
- 安全：排除 users 表（含密码哈希），避免凭证外泄。
"""
import json
import logging
from datetime import datetime
from flask import Blueprint, request, jsonify, Response
from app.database import db
from app.routes.auth import login_required

logger = logging.getLogger(__name__)

backup_bp = Blueprint('backup', __name__)

BACKUP_VERSION = 1


def _model_registry():
    from app.models import (
        DataSource, Product, Pipeline, LogType, FormatTemplate, DataTable,
        Rule, AlertFieldDefinition, SystemConfig, ClassifierRule, DataSourceConfig,
    )
    from app.models.extensions import Role
    from app.models.ste_experience import STEExperience
    from app.models.resource_groups import IpGroup, IpGroupItem, DomainGroup, DomainGroupItem

    # 按依赖顺序：被引用表先导入
    return [
        ('roles', Role),
        ('log_types', LogType),
        ('data_tables', DataTable),
        ('format_templates', FormatTemplate),
        ('pipelines', Pipeline),
        ('products', Product),
        ('data_sources', DataSource),
        ('classifier_rules', ClassifierRule),
        ('data_source_configs', DataSourceConfig),
        ('rules', Rule),
        ('alert_field_definitions', AlertFieldDefinition),
        ('system_config', SystemConfig),
        ('ste_experiences', STEExperience),
        ('ip_groups', IpGroup),
        ('ip_group_items', IpGroupItem),
        ('domain_groups', DomainGroup),
        ('domain_group_items', DomainGroupItem),
    ]


@backup_bp.route('/export', methods=['GET'])
@login_required
def export_backup():
    payload = {
        'schema': 'usop-backup',
        'version': BACKUP_VERSION,
        'exported_at': datetime.utcnow().isoformat(),
        'tables': {},
    }
    for name, model in _model_registry():
        try:
            rows = model.query.all()
            payload['tables'][name] = [r.to_dict() for r in rows]
        except Exception as e:
            logger.warning(f"备份导出表 {name} 失败: {e}")
            payload['tables'][name] = []
    return Response(
        json.dumps(payload, ensure_ascii=False, default=str),
        mimetype='application/json',
        headers={'Content-Disposition': f'attachment; filename=usop_backup_{datetime.utcnow().strftime("%Y%m%d%H%M%S")}.json'}
    )


@backup_bp.route('/import', methods=['POST'])
@login_required
def import_backup():
    data = request.get_json(silent=True)
    if not data or data.get('schema') != 'usop-backup':
        return jsonify({'success': False, 'error': '备份包格式不正确（缺少 schema）'}), 400
    version = data.get('version')
    if version is None:
        return jsonify({'success': False, 'error': '缺少版本号，无法校验兼容'}), 400

    tables = data.get('tables', {})
    summary = {}
    for name, model in _model_registry():
        rows = tables.get(name)
        if not rows:
            continue
        upserted = 0
        for row in rows:
            # 仅保留模型中存在的列，避免字段级不兼容
            cols = {c.key: c.type for c in model.__table__.columns}
            filtered = {k: v for k, v in row.items() if k in cols}
            try:
                pk = model.__table__.primary_key.columns.keys()
                if len(pk) == 1:
                    pk_val = filtered.get(pk[0])
                    existing = model.query.get(pk_val) if pk_val is not None else None
                    if existing:
                        for k, v in filtered.items():
                            setattr(existing, k, v)
                        upserted += 1
                        continue
                # 新建
                obj = model(**filtered)
                db.session.add(obj)
                upserted += 1
            except Exception as e:
                logger.warning(f"还原 {name} 行失败: {e}")
        summary[name] = upserted
    db.session.commit()
    return jsonify({'success': True, 'data': {'version': version, 'summary': summary}})
