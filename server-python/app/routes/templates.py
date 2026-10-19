"""
字段模型 — 数据管理下的告警/事件消息模型（借鉴 EFF-Monitoring 模板中心设计）

核心能力：
1. 模型 = 名称 + 类型(message/excel/csv) + 内容(由选中的字段构成) + 场景(告警/事件)绑定；
2. 字段模型借鉴 EFF 全部 7 大分类：系统基础 / 设备信息 / 解析分析 / 源资产详情 /
   目的资产详情 / 流程协作 / 运营效能统计（另含 USOP 特有的「安全事件」分类）；
   中文语义标签与英文字段键双轨可引用（{{源IP}} 等价 {{src_ip}}）；
3. 入库时自动调用：auto_render 模型在告警入库(Kafka 消费)/事件创建时自动渲染，
   结果写入 extra_data.rendered_templates；POST /render 仍保留供流程显式调用。
所有动态数据（资产/数据源/统计）均实时查询真实库，拒绝 mock。
"""

import json
import re
from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request
from sqlalchemy import func, text

from app.database import db
from app.routes.auth import login_required


# ==================== 模型 ====================

class AlertTemplate(db.Model):
    __tablename__ = 'alert_templates'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(160), nullable=False)
    type = db.Column(db.String(20), default='message')      # message / excel / csv
    scene = db.Column(db.String(20), default='universal')   # alert / event / universal
    content = db.Column(db.Text, nullable=False, default='')
    # 变量目录快照：[{key, label, source, category}]，创建/编辑时自动从 content 提取并标注来源
    variables = db.Column(db.JSON, default=list)
    description = db.Column(db.Text)
    is_default = db.Column(db.Boolean, default=False)
    enabled = db.Column(db.Boolean, default=True)
    # 入库时自动渲染：告警入库/事件创建时自动调用本模板，结果写入 extra_data.rendered_templates
    auto_render = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'type': self.type,
            'scene': self.scene,
            'content': self.content,
            'variables': self.variables or [],
            'description': self.description,
            'is_default': self.is_default,
            'enabled': self.enabled,
            'auto_render': bool(self.auto_render),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


templates_bp = Blueprint('templates_bp', __name__)


# ==================== 字段模型（借鉴 EFF 全部 7 大分类） ====================

# 每个字段：key(英文字段键) / label(中文语义标签，双轨可引用) / category(分类) / source(数据来源)
# 全部字段均映射到 USOP 真实数据；无真实数据来源的字段不提供（拒绝 mock）。

# —— 系统基础：告警记录本身的核心标识与生命周期字段 ——
SYSTEM_BASE_VARS = [
    {'key': 'id', 'label': '告警ID', 'category': '系统基础', 'source': 'alert'},
    {'key': 'alert_code', 'label': '告警编号', 'category': '系统基础', 'source': 'alert'},
    {'key': 'status', 'label': '处置状态', 'category': '系统基础', 'source': 'alert'},
    {'key': 'assigned_to', 'label': '负责人', 'category': '系统基础', 'source': 'alert'},
    {'key': 'first_seen', 'label': '首次发现时间', 'category': '系统基础', 'source': 'alert'},
    {'key': 'last_seen', 'label': '最近发现时间', 'category': '系统基础', 'source': 'alert'},
    {'key': 'created_at', 'label': '告警创建时间', 'category': '系统基础', 'source': 'alert'},
    {'key': 'updated_at', 'label': '告警更新时间', 'category': '系统基础', 'source': 'alert'},
    {'key': 'occurrences', 'label': '发生次数', 'category': '系统基础', 'source': 'dedup'},
    {'key': 'current_time', 'label': '当前时间', 'category': '系统基础', 'source': 'builtin'},
    {'key': 'current_date', 'label': '当前日期', 'category': '系统基础', 'source': 'builtin'},
]

# —— 设备信息：告警来源设备/数据源（渲染时按 source_product 匹配 DataSource 实时查询）——
DEVICE_VARS = [
    {'key': 'source', 'label': '告警来源', 'category': '设备信息', 'source': 'alert'},
    {'key': 'source_product', 'label': '来源产品', 'category': '设备信息', 'source': 'alert'},
    {'key': 'source_type', 'label': '来源类型', 'category': '设备信息', 'source': 'alert'},
    {'key': 'datasource_name', 'label': '数据源名称', 'category': '设备信息', 'source': 'datasource'},
    {'key': 'datasource_protocol', 'label': '接入协议', 'category': '设备信息', 'source': 'datasource'},
]

# —— 解析分析：告警内容与解析产物 ——
PARSE_VARS = [
    {'key': 'title', 'label': '告警名称', 'category': '解析分析', 'source': 'alert'},
    {'key': 'description', 'label': '告警描述', 'category': '解析分析', 'source': 'alert'},
    {'key': 'category', 'label': '告警类别', 'category': '解析分析', 'source': 'alert'},
    {'key': 'severity', 'label': '严重级别', 'category': '解析分析', 'source': 'alert'},
    {'key': 'confidence', 'label': '告警置信度', 'category': '解析分析', 'source': 'alert'},
    {'key': 'protocol', 'label': '协议', 'category': '解析分析', 'source': 'alert'},
    {'key': 'src_ip', 'label': '源IP', 'category': '解析分析', 'source': 'alert'},
    {'key': 'src_port', 'label': '源端口', 'category': '解析分析', 'source': 'alert'},
    {'key': 'dst_ip', 'label': '目的IP', 'category': '解析分析', 'source': 'alert'},
    {'key': 'dst_port', 'label': '目的端口', 'category': '解析分析', 'source': 'alert'},
    {'key': 'hostname', 'label': '主机名', 'category': '解析分析', 'source': 'alert'},
    {'key': 'raw_log', 'label': '原始日志', 'category': '解析分析', 'source': 'alert'},
    {'key': 'ai_result', 'label': 'AI研判结果', 'category': '解析分析', 'source': 'analysis'},
]

# —— 源资产详情：按 src_ip 实时匹配资产清单（Asset）——
SRC_ASSET_VARS = [
    {'key': 'src_asset_name', 'label': '源资产名称', 'category': '源资产详情', 'source': 'asset'},
    {'key': 'src_asset_type', 'label': '源资产类型', 'category': '源资产详情', 'source': 'asset'},
    {'key': 'src_asset_status', 'label': '源资产状态', 'category': '源资产详情', 'source': 'asset'},
    {'key': 'src_asset_risk', 'label': '源资产风险分', 'category': '源资产详情', 'source': 'asset'},
    {'key': 'src_asset_os', 'label': '源资产系统', 'category': '源资产详情', 'source': 'asset'},
    {'key': 'src_asset_tags', 'label': '源资产标签', 'category': '源资产详情', 'source': 'asset'},
    {'key': 'src_asset_hostname', 'label': '源资产主机名', 'category': '源资产详情', 'source': 'asset'},
]

# —— 目的资产详情：按 dst_ip 实时匹配资产清单（Asset）——
DST_ASSET_VARS = [
    {'key': 'dst_asset_name', 'label': '目的资产名称', 'category': '目的资产详情', 'source': 'asset'},
    {'key': 'dst_asset_type', 'label': '目的资产类型', 'category': '目的资产详情', 'source': 'asset'},
    {'key': 'dst_asset_status', 'label': '目的资产状态', 'category': '目的资产详情', 'source': 'asset'},
    {'key': 'dst_asset_risk', 'label': '目的资产风险分', 'category': '目的资产详情', 'source': 'asset'},
    {'key': 'dst_asset_os', 'label': '目的资产系统', 'category': '目的资产详情', 'source': 'asset'},
    {'key': 'dst_asset_tags', 'label': '目的资产标签', 'category': '目的资产详情', 'source': 'asset'},
    {'key': 'dst_asset_hostname', 'label': '目的资产主机名', 'category': '目的资产详情', 'source': 'asset'},
]

# —— 流程协作：AI 研判上下文（extra_data 嵌套结构平铺）——
COLLAB_VARS = [
    {'key': 'structured_analysis.verdict_label', 'label': '研判结论标签', 'category': '流程协作', 'source': 'analysis'},
    {'key': 'structured_analysis.risk_level', 'label': '风险等级', 'category': '流程协作', 'source': 'analysis'},
    {'key': 'structured_analysis.confidence', 'label': '研判置信度', 'category': '流程协作', 'source': 'analysis'},
    {'key': 'structured_analysis.conclusion', 'label': '研判摘要', 'category': '流程协作', 'source': 'analysis'},
    {'key': 'structured_analysis.suggested_action', 'label': '处置建议', 'category': '流程协作', 'source': 'analysis'},
]

# —— 运营效能统计：渲染时按「今日」口径实时计算（与 routes/kpi.py 同口径）——
STATS_VARS = [
    {'key': 'stats_total', 'label': '今日告警总数', 'category': '运营效能统计', 'source': 'stats'},
    {'key': 'stats_pending', 'label': '今日待处理数', 'category': '运营效能统计', 'source': 'stats'},
    {'key': 'stats_resolved', 'label': '今日已办结数', 'category': '运营效能统计', 'source': 'stats'},
    {'key': 'stats_resolution_rate', 'label': '今日处置率(%)', 'category': '运营效能统计', 'source': 'stats'},
    {'key': 'stats_mttr', 'label': '今日平均处置耗时(小时)', 'category': '运营效能统计', 'source': 'stats'},
    {'key': 'stats_asset_hit_rate', 'label': '今日资产命中率(%)', 'category': '运营效能统计', 'source': 'stats'},
    {'key': 'stats_high_risk_rate', 'label': '今日高危告警占比(%)', 'category': '运营效能统计', 'source': 'stats'},
    {'key': 'stats_top_src_ips', 'label': '今日Top5攻击源', 'category': '运营效能统计', 'source': 'stats'},
    {'key': 'stats_top_assets', 'label': '今日Top5受攻击资产', 'category': '运营效能统计', 'source': 'stats'},
]

# —— 事件基础：安全事件自身的属性字段（渲染侧由 _build_event_data 产出）——
# 说明：字段目录不再提供「表列映射」类分类（原告警表字段/安全事件表字段已移除）；
#       完整的告警表/事件表由模型从各类字段中选取组合而成。
EVENT_BASE_VARS = [
    {'key': 'event_id', 'label': '事件ID', 'category': '事件基础', 'source': 'event'},
    {'key': 'event_code', 'label': '事件编号', 'category': '事件基础', 'source': 'event'},
    {'key': 'event_title', 'label': '事件标题', 'category': '事件基础', 'source': 'event'},
    {'key': 'event_description', 'label': '事件描述', 'category': '事件基础', 'source': 'event'},
    {'key': 'event_severity', 'label': '事件级别', 'category': '事件基础', 'source': 'event'},
    {'key': 'event_category', 'label': '事件类别', 'category': '事件基础', 'source': 'event'},
    {'key': 'event_source', 'label': '事件来源', 'category': '事件基础', 'source': 'event'},
    {'key': 'event_status', 'label': '事件状态', 'category': '事件基础', 'source': 'event'},
    {'key': 'event_raw_log', 'label': '事件原始日志', 'category': '事件基础', 'source': 'event'},
    {'key': 'event_related_alerts', 'label': '关联告警数', 'category': '事件基础', 'source': 'event'},
    {'key': 'event_attachments', 'label': '附件数', 'category': '事件基础', 'source': 'event'},
    {'key': 'event_timestamp', 'label': '事件时间', 'category': '事件基础', 'source': 'event'},
    {'key': 'event_created_at', 'label': '事件创建时间', 'category': '事件基础', 'source': 'event'},
    {'key': 'event_updated_at', 'label': '事件更新时间', 'category': '事件基础', 'source': 'event'},
]

# —— 事件AI研判：events.extra_data.ai_analysis 真实研判产出（覆盖 6410+ 条真实事件）——
EVENT_AI_VARS = [
    {'key': 'event_ai_is_attack', 'label': '是否攻击', 'category': '事件AI研判', 'source': 'event_ai'},
    {'key': 'event_ai_is_false_positive', 'label': '是否误报', 'category': '事件AI研判', 'source': 'event_ai'},
    {'key': 'event_ai_category', 'label': '研判分类', 'category': '事件AI研判', 'source': 'event_ai'},
    {'key': 'event_ai_priority', 'label': '研判优先级', 'category': '事件AI研判', 'source': 'event_ai'},
    {'key': 'event_ai_reason', 'label': '研判原因', 'category': '事件AI研判', 'source': 'event_ai'},
    {'key': 'event_ai_suggested_action', 'label': '处置建议', 'category': '事件AI研判', 'source': 'event_ai'},
]

# —— 标准告警字段：USOP 规范核心标准字段（alert log ID / status / operation）——
STANDARD_ALERT_VARS = [
    {'key': 'alert_log_id', 'label': '告警日志ID', 'category': '标准告警字段', 'source': 'standard'},
    {'key': 'operation', 'label': '操作类型', 'category': '标准告警字段', 'source': 'standard'},
]

# 分类展示顺序（与 EFF 模板中心一致，最后为 USOP 特有）
CATEGORY_ORDER = ['系统基础', '设备信息', '解析分析', '源资产详情', '目的资产详情',
                  '流程协作', '运营效能统计', '标准告警字段', '事件基础', '事件AI研判']

_DEFAULT_CATALOG = (SYSTEM_BASE_VARS + DEVICE_VARS + PARSE_VARS + SRC_ASSET_VARS
                    + DST_ASSET_VARS + COLLAB_VARS + STATS_VARS
                    + STANDARD_ALERT_VARS + EVENT_BASE_VARS + EVENT_AI_VARS)


# ==================== 原始字段管理（字段目录持久化，可手动配置） ====================

class TemplateField(db.Model):
    """字段目录表：模板可引用的字段由本表管理（含系统基础/设备信息/解析分析/资产详情等分类）。

    首次访问时用内置默认字段播种；之后以本表为唯一事实来源，支持手动增删改。
    """
    __tablename__ = 'template_fields'
    __table_args__ = (db.UniqueConstraint('category', 'key', name='uq_template_fields_category_key'),)

    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(120), nullable=False)                  # 英文字段键 {{key}}（分类内唯一）
    label = db.Column(db.String(120), nullable=False)              # 中文语义标签（双轨可引用）
    category = db.Column(db.String(60), nullable=False)            # 分类（系统基础/设备信息/…）
    source = db.Column(db.String(30), default='custom')            # 数据来源标注
    description = db.Column(db.Text)                               # 字段说明（可选）
    enabled = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'key': self.key,
            'label': self.label,
            'category': self.category,
            'source': self.source,
            'description': self.description,
            'enabled': bool(self.enabled),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


def _seed_default_fields() -> None:
    """按 (category, key) 幂等补播默认字段（新分类/新字段上线后自动补齐）。"""
    existing = {(r.category, r.key) for r in TemplateField.query.with_entities(
        TemplateField.category, TemplateField.key).all()}
    added = 0
    for v in _DEFAULT_CATALOG:
        if (v['category'], v['key']) not in existing:
            db.session.add(TemplateField(
                key=v['key'], label=v['label'], category=v['category'], source=v['source']))
            added += 1
    if added:
        db.session.commit()


def _category_sort_key(cat: str) -> int:
    try:
        return CATEGORY_ORDER.index(cat)
    except ValueError:
        return len(CATEGORY_ORDER)


def _load_fields_rows():
    _seed_default_fields()
    rows = TemplateField.query.all()
    rows.sort(key=lambda r: (_category_sort_key(r.category), r.id))
    return rows


def _full_catalog():
    """变量目录以 template_fields 表为事实来源（仅启用项）。"""
    try:
        rows = _load_fields_rows()
    except Exception:
        return list(_DEFAULT_CATALOG)
    return [{'key': r.key, 'label': r.label, 'category': r.category, 'source': r.source}
            for r in rows if r.enabled]


def _extract_placeholder_keys(content: str):
    """提取模板内容中的 {{变量}} 键（去重保序）。"""
    if not content:
        return []
    seen, keys = set(), []
    for m in re.finditer(r"\{\{\s*([^{}]+?)\s*\}\}", content):
        k = m.group(1).strip()
        if k not in seen:
            seen.add(k)
            keys.append(k)
    return keys


def _lookup_var(key: str):
    """按键或中文语义标签查变量目录（{{源IP}} 等价 {{src_ip}}）。"""
    for v in _full_catalog():
        if v['key'] == key or v['label'] == key:
            return v
    return None


def _nest_get(data: dict, dotted_key: str):
    cur = data
    for part in dotted_key.split('.'):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


RESOLVED_STATUSES = ['closed', 'false_positive', 'resolved', 'ai_analyzed']


def _asset_context(ip: str, prefix: str) -> dict:
    """按 IP 实时匹配资产清单，展开为 src_asset_* / dst_asset_* 前缀键（无命中则不注入）。"""
    if not ip:
        return {}
    from app.models import Asset
    asset = Asset.query.filter(Asset.ip == str(ip)).first()
    if not asset:
        return {}
    values = {
        'name': asset.name,
        'type': asset.type or '',
        'status': asset.status or '',
        'risk': asset.assessed_risk_score if asset.assessed_risk_score is not None else (asset.risk_score or 0),
        'os': asset.os_info or '',
        'tags': '、'.join(asset.tags or []) if isinstance(asset.tags, list) else '',
        'hostname': asset.hostname or '',
    }
    return {f'{prefix}_{k}': v for k, v in values.items()}


def _datasource_context(alert_data: dict) -> dict:
    """按来源产品匹配 DataSource（大小写不敏感），注入数据源名称/协议（无匹配则不注入）。"""
    product = (alert_data.get('source_product') or '').strip()
    if not product:
        return {}
    from app.models import DataSource
    ds = (DataSource.query.filter(func.lower(DataSource.product_type) == func.lower(product)).first()
          or DataSource.query.filter(DataSource.kafka_topic == (alert_data.get('source') or '')).first())
    if not ds:
        return {}
    return {'datasource_name': ds.name, 'datasource_protocol': ds.protocol or ''}


def _today_stats() -> dict:
    """今日运营效能统计（与 routes/kpi.py 同口径），渲染时实时计算。"""
    from app.models import Alert
    day_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    total = Alert.query.filter(Alert.created_at >= day_start).count()
    resolved = Alert.query.filter(
        Alert.created_at >= day_start, Alert.status.in_(RESOLVED_STATUSES)).count()
    pending = total - resolved
    high = Alert.query.filter(
        Alert.created_at >= day_start, Alert.severity.in_(['high', 'critical'])).count()

    mttr_hours = 0.0
    if resolved:
        avg = db.session.query(
            func.avg(func.extract('epoch', Alert.updated_at - Alert.created_at))
        ).filter(Alert.created_at >= day_start,
                 Alert.status.in_(RESOLVED_STATUSES)).scalar()
        # func.avg 返回 Decimal，必须先转 float 再除（Decimal / float 会抛 TypeError）
        mttr_hours = round(float(avg) / 3600.0, 2) if avg is not None else 0.0

    asset_hit = 0
    if total:
        asset_hit = db.session.execute(text("""
            SELECT COUNT(*) FROM alerts
            WHERE created_at >= :since
              AND (src_ip IN (SELECT ip FROM assets WHERE ip IS NOT NULL)
                   OR dst_ip IN (SELECT ip FROM assets WHERE ip IS NOT NULL))
        """), {'since': day_start}).scalar() or 0

    top_ips = db.session.query(Alert.src_ip, func.count().label('c')).filter(
        Alert.created_at >= day_start, Alert.src_ip.isnot(None), Alert.src_ip != ''
    ).group_by(Alert.src_ip).order_by(func.count().desc()).limit(5).all()
    top_assets = db.session.query(Alert.dst_ip, func.count().label('c')).filter(
        Alert.created_at >= day_start, Alert.dst_ip.isnot(None), Alert.dst_ip != ''
    ).group_by(Alert.dst_ip).order_by(func.count().desc()).limit(5).all()

    return {
        'stats_total': total,
        'stats_pending': pending,
        'stats_resolved': resolved,
        'stats_resolution_rate': round(resolved / total * 100, 1) if total else 0.0,
        'stats_mttr': mttr_hours,
        'stats_asset_hit_rate': round(asset_hit / total * 100, 1) if total else 0.0,
        'stats_high_risk_rate': round(high / total * 100, 1) if total else 0.0,
        'stats_top_src_ips': '、'.join(f'{ip}({c}次)' for ip, c in top_ips) or '无',
        'stats_top_assets': '、'.join(f'{ip}({c}次)' for ip, c in top_assets) or '无',
    }


def _build_render_data(alert) -> dict:
    """把真实告警展开为渲染数据：标准字段平铺 + extra_data 嵌套结构平铺为前缀键
    + parsed_data 原样 + 资产/数据源/今日统计动态注入（全部实时查询）。"""
    from app.models import Alert
    base = alert.to_dict() if isinstance(alert, Alert) else dict(alert)
    data = dict(base)
    extra = base.get('extra_data') or {}
    # structured_analysis 平铺为前缀键
    for ns in ('structured_analysis',):
        ns_data = extra.get(ns)
        if isinstance(ns_data, dict):
            for k, v in ns_data.items():
                data[f'{ns}.{k}'] = v
    # occurrences 等标量上下文
    for k in ('occurrences',):
        if k in extra:
            data[k] = extra[k]
    # AI 研判结果（取研判摘要，供 {{ai_result}} / {{AI研判结果}}）
    sa = extra.get('structured_analysis') or {}
    if isinstance(sa, dict) and sa.get('conclusion'):
        data['ai_result'] = sa['conclusion']
    # parsed_data 键原样参与渲染（不覆盖标准字段）
    for k, v in (base.get('parsed_data') or {}).items():
        data.setdefault(k, v)
    # 源/目的资产详情（按 IP 实时匹配资产清单）
    data.update(_asset_context(base.get('src_ip'), 'src_asset'))
    data.update(_asset_context(base.get('dst_ip'), 'dst_asset'))
    # 数据源信息（按来源产品匹配）
    data.update(_datasource_context(base))
    # 今日运营效能统计（实时计算）
    data.update(_today_stats())
    now = datetime.utcnow()
    data.setdefault('current_time', now.strftime('%Y-%m-%d %H:%M:%S'))
    data.setdefault('current_date', now.strftime('%Y-%m-%d'))
    return data


def _build_event_data(event) -> dict:
    """把真实安全事件展开为渲染数据（同时产出两套键）：

    - event_* 前缀键：历史模型向后兼容（已建模型不受字段目录调整影响）；
    - 裸列名键（id/title/severity/...）：与「安全事件表字段」分类一一对应，
      事件场景按该分类选字段时可直接取到真实值。
    """
    from app.models import Event
    base = event.to_dict() if isinstance(event, Event) else dict(event)
    extra = base.get('extra_data') or {}
    data = {
        'event_id': base.get('id'),
        'event_code': base.get('event_code'),
        'event_title': base.get('title'),
        'event_description': base.get('description'),
        'event_severity': base.get('severity'),
        'event_category': base.get('category'),
        'event_source': base.get('source'),
        'event_status': base.get('status'),
        'event_raw_log': base.get('raw_log'),
        'event_related_alerts': len(base.get('related_alerts') or []),
        'event_attachments': len(base.get('attachments') or []),
        'event_timestamp': base.get('timestamp'),
        'event_created_at': base.get('created_at'),
        'event_updated_at': base.get('updated_at'),
    }
    # 裸列名键：历史模型兼容（早期「安全事件表字段」分类遗留），不与上面 event_* 冲突
    for k in ('id', 'event_code', 'title', 'description', 'severity', 'category',
              'source', 'status', 'raw_log', 'extra_data', 'timestamp',
              'created_at', 'updated_at'):
        if k in base:
            data.setdefault(k, base.get(k))
    for k in ('related_alerts', 'attachments'):
        if k in base:
            data.setdefault(k, len(base.get(k) or []))
    # 事件AI研判：events.extra_data.ai_analysis 真实研判产出
    ai = extra.get('ai_analysis') or {}
    if isinstance(ai, dict):
        data.update({
            'event_ai_is_attack': ai.get('is_attack'),
            'event_ai_is_false_positive': ai.get('is_false_positive'),
            'event_ai_category': ai.get('category'),
            'event_ai_priority': ai.get('priority'),
            'event_ai_reason': ai.get('reason'),
            'event_ai_suggested_action': ai.get('suggested_action'),
        })
    # 事件 extra_data 中的标量键也参与渲染（如 assignee 等扩展字段）
    for k, v in extra.items():
        if isinstance(v, (str, int, float, bool)):
            data.setdefault(f'event_{k}', v)
    # 事件模板同样可用今日统计（全局口径）
    data.update(_today_stats())
    now = datetime.utcnow()
    data.setdefault('current_time', now.strftime('%Y-%m-%d %H:%M:%S'))
    data.setdefault('current_date', now.strftime('%Y-%m-%d'))
    return data


def _render(content: str, data: dict):
    """{{变量}} 渲染（键/中文标签双轨），返回 (渲染结果, 缺失变量列表)。"""
    missing = []

    def replace(m: re.Match) -> str:
        key = m.group(1).strip()
        val = data.get(key)
        if val is None:
            v = _lookup_var(key)
            if v is not None and v['key'] != key:
                val = data.get(v['key'])
        if val is None or val == '':
            missing.append(key)
            return ''
        return str(val)

    rendered = re.sub(r"\{\{\s*([^{}]+?)\s*\}\}", replace, content or '')
    return rendered, sorted(set(missing))


# ==================== 路由 ====================

@templates_bp.route('', methods=['GET'])
@login_required
def list_templates():
    q = AlertTemplate.query
    ttype = request.args.get('type')
    scene = request.args.get('scene')
    if ttype:
        q = q.filter(AlertTemplate.type == ttype)
    if scene:
        q = q.filter(AlertTemplate.scene.in_([scene, 'universal']))
    rows = q.order_by(db.desc(AlertTemplate.updated_at)).all()
    return jsonify({'success': True, 'data': [r.to_dict() for r in rows]})


@templates_bp.route('/<int:tid>', methods=['GET'])
@login_required
def get_template(tid):
    t = AlertTemplate.query.get(tid)
    if not t:
        return jsonify({'success': False, 'error': '模型不存在'}), 404
    return jsonify({'success': True, 'data': t.to_dict()})


def _snapshot_variables(content: str) -> list:
    """从模板内容提取 {{变量}} 并标注目录来源/分类（无法识别的记为 custom）。"""
    variables = []
    for key in _extract_placeholder_keys(content):
        v = _lookup_var(key)
        if v:
            variables.append({'key': v['key'], 'label': v['label'],
                              'source': v['source'], 'category': v.get('category', '')})
        else:
            variables.append({'key': key, 'label': key, 'source': 'custom', 'category': '自定义'})
    return variables


@templates_bp.route('', methods=['POST'])
@login_required
def create_template():
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    content = data.get('content') or ''
    if not name:
        return jsonify({'success': False, 'error': '模型名称不能为空'}), 400
    if not content.strip():
        return jsonify({'success': False, 'error': '模型内容不能为空'}), 400

    t = AlertTemplate(
        name=name,
        type=data.get('type') or 'message',
        scene=data.get('scene') or 'universal',
        content=content,
        variables=_snapshot_variables(content),
        description=data.get('description'),
        is_default=bool(data.get('is_default', False)),
        enabled=bool(data.get('enabled', True)),
        auto_render=bool(data.get('auto_render', False)),
    )
    if t.is_default:
        # 同「类型 + 场景」仅保留一个默认模型：告警场景与事件场景各自的默认互不顶替
        AlertTemplate.query.filter_by(type=t.type, scene=t.scene,
                                      is_default=True).update({'is_default': False})
    db.session.add(t)
    db.session.commit()
    return jsonify({'success': True, 'data': t.to_dict()}), 201


@templates_bp.route('/<int:tid>', methods=['PATCH'])
@login_required
def update_template(tid):
    t = AlertTemplate.query.get(tid)
    if not t:
        return jsonify({'success': False, 'error': '模型不存在'}), 404
    data = request.get_json() or {}
    for f in ('name', 'type', 'scene', 'content', 'description'):
        if f in data:
            setattr(t, f, data[f])
    if 'is_default' in data:
        t.is_default = bool(data['is_default'])
        if t.is_default:
            AlertTemplate.query.filter(AlertTemplate.type == t.type,
                                       AlertTemplate.scene == t.scene,
                                       AlertTemplate.id != t.id).update({'is_default': False})
    if 'enabled' in data:
        t.enabled = bool(data['enabled'])
    if 'auto_render' in data:
        t.auto_render = bool(data['auto_render'])
    # 内容变化时重提变量
    if 'content' in data:
        t.variables = _snapshot_variables(t.content or '')
    db.session.commit()
    return jsonify({'success': True, 'data': t.to_dict()})


@templates_bp.route('/<int:tid>', methods=['DELETE'])
@login_required
def delete_template(tid):
    t = AlertTemplate.query.get(tid)
    if not t:
        return jsonify({'success': False, 'error': '模型不存在'}), 404
    db.session.delete(t)
    db.session.commit()
    return jsonify({'success': True, 'data': {'id': tid}})


# ==================== 原始字段管理路由 ====================

@templates_bp.route('/fields', methods=['GET'])
@login_required
def list_fields():
    """字段目录列表（按分类排序，含停用项），附带可选分类清单。"""
    rows = _load_fields_rows()
    categories = []
    for r in rows:
        if r.category not in categories:
            categories.append(r.category)
    return jsonify({'success': True, 'data': {
        'fields': [r.to_dict() for r in rows],
        'categories': categories,
    }})


@templates_bp.route('/fields', methods=['POST'])
@login_required
def create_field():
    data = request.get_json() or {}
    key = (data.get('key') or '').strip()
    label = (data.get('label') or '').strip()
    category = (data.get('category') or '').strip()
    if not re.fullmatch(r'[a-z0-9_.]+', key or ''):
        return jsonify({'success': False, 'error': '字段标识仅支持小写字母、数字、下划线和点'}), 400
    if not label or not category:
        return jsonify({'success': False, 'error': '字段名称与分类不能为空'}), 400
    if TemplateField.query.filter_by(key=key, category=category).first():
        return jsonify({'success': False, 'error': f'该分类下字段标识 {key} 已存在'}), 400
    f = TemplateField(
        key=key, label=label, category=category,
        source=data.get('source') or 'custom',
        description=data.get('description'),
        enabled=bool(data.get('enabled', True)),
    )
    db.session.add(f)
    db.session.commit()
    return jsonify({'success': True, 'data': f.to_dict()}), 201


@templates_bp.route('/fields/<int:fid>', methods=['PATCH'])
@login_required
def update_field(fid):
    f = TemplateField.query.get(fid)
    if not f:
        return jsonify({'success': False, 'error': '字段不存在'}), 404
    data = request.get_json() or {}
    if 'key' in data:
        new_key = (data['key'] or '').strip()
        if not re.fullmatch(r'[a-z0-9_.]+', new_key or ''):
            return jsonify({'success': False, 'error': '字段标识仅支持小写字母、数字、下划线和点'}), 400
        dup = TemplateField.query.filter(
            TemplateField.key == new_key, TemplateField.category == f.category,
            TemplateField.id != fid).first()
        if dup:
            return jsonify({'success': False, 'error': f'该分类下字段标识 {new_key} 已存在'}), 400
        f.key = new_key
    for field in ('label', 'category', 'description'):
        if field in data:
            setattr(f, field, (data[field] or '').strip() if field != 'description' else data[field])
    if 'enabled' in data:
        f.enabled = bool(data['enabled'])
    db.session.commit()
    return jsonify({'success': True, 'data': f.to_dict()})


@templates_bp.route('/fields/<int:fid>', methods=['DELETE'])
@login_required
def delete_field(fid):
    f = TemplateField.query.get(fid)
    if not f:
        return jsonify({'success': False, 'error': '字段不存在'}), 404
    db.session.delete(f)
    db.session.commit()
    return jsonify({'success': True, 'data': {'id': fid}})


@templates_bp.route('/variables', methods=['GET'])
@login_required
def variable_catalog():
    """变量目录：内置 + 告警标准 + 事件标准 + 协作/研判 + 样例的动态字段。

    样例参数：alert_id（告警样例→补 parsed_data 动态字段）或 event_id（事件样例）。
    """
    catalog = _full_catalog()
    known = {v['key'] for v in catalog}
    alert_id = request.args.get('alert_id', type=int)
    event_id = request.args.get('event_id', type=int)
    dynamic = []
    if alert_id:
        from app.models import Alert
        alert = Alert.query.get(alert_id)
        if not alert:
            return jsonify({'success': False, 'error': '样例告警不存在'}), 404
        data = _build_render_data(alert)
        for k in data:
            if k not in known and not k.startswith('structured_analysis.'):
                dynamic.append({'key': k, 'label': k, 'source': 'parsed',
                                'category': '解析字段(样例)'})
    if event_id:
        from app.models import Event
        event = Event.query.get(event_id)
        if not event:
            return jsonify({'success': False, 'error': '样例事件不存在'}), 404
        data = _build_event_data(event)
        for k in data:
            if k not in known:
                dynamic.append({'key': k, 'label': k, 'source': 'event_extra',
                                'category': '事件扩展字段(样例)'})
    return jsonify({'success': True,
                    'data': {'variables': catalog + dynamic, 'alert_id': alert_id,
                             'event_id': event_id}})


@templates_bp.route('/render', methods=['POST'])
@login_required
def render_template_api():
    """按真实告警或真实事件渲染模板（事件/告警后续统一调用此端点）。

    取数优先级：显式 event_id > 显式 alert_id > 按 scene 缺省
    （scene=event 取最新事件，其余取最新告警）。
    """
    payload = request.get_json() or {}
    tid = payload.get('template_id')
    if not tid:
        return jsonify({'success': False, 'error': '缺少 template_id'}), 400
    t = AlertTemplate.query.get(tid)
    if not t:
        return jsonify({'success': False, 'error': '模型不存在'}), 404
    if not t.enabled:
        return jsonify({'success': False, 'error': '模型已停用'}), 400

    from app.models import Alert, Event
    event_id = payload.get('event_id')
    alert_id = payload.get('alert_id')

    if event_id:
        event = Event.query.get(event_id)
        if not event:
            return jsonify({'success': False, 'error': '事件不存在'}), 404
        data = _build_event_data(event)
        subject = {'event_id': event.id, 'event_code': event.event_code}
    elif alert_id:
        alert = Alert.query.get(alert_id)
        if not alert:
            return jsonify({'success': False, 'error': '告警不存在'}), 404
        data = _build_render_data(alert)
        subject = {'alert_id': alert.id, 'alert_code': alert.alert_code}
    elif (t.scene or '') == 'event':
        event = Event.query.order_by(db.desc(Event.updated_at)).first()
        if not event:
            return jsonify({'success': False,
                            'error': '库中暂无真实安全事件可用于渲染，请先创建事件或显式指定 event_id'}), 400
        data = _build_event_data(event)
        subject = {'event_id': event.id, 'event_code': event.event_code}
    else:
        alert = Alert.query.order_by(db.desc(Alert.last_seen)).first()
        if not alert:
            return jsonify({'success': False,
                            'error': '库中暂无真实告警可用于渲染，请先接入数据或显式指定 alert_id'}), 400
        data = _build_render_data(alert)
        subject = {'alert_id': alert.id, 'alert_code': alert.alert_code}

    rendered, missing = _render(t.content, data)
    return jsonify({'success': True, 'data': {
        'template_id': t.id,
        'template_name': t.name,
        'type': t.type,
        'scene': t.scene,
        **subject,
        'rendered': rendered,
        'missing_vars': missing,
        'variables': t.variables or [],
    }})


# ==================== 入库时自动调用（告警消费/事件创建挂钩） ====================

def render_templates_for_alert(alert_id: int) -> None:
    """告警入库后自动渲染所有 auto_render 且场景匹配的启用模板，
    结果写入 extra_data.rendered_templates = {模板名: 渲染文本}。"""
    from app.models import Alert
    alert = Alert.query.get(alert_id)
    if not alert:
        return
    tpls = AlertTemplate.query.filter(
        AlertTemplate.auto_render.is_(True),
        AlertTemplate.enabled.is_(True),
        AlertTemplate.scene.in_(['alert', 'universal']),
    ).all()
    if not tpls:
        return
    data = _build_render_data(alert)
    rendered_map = dict((alert.extra_data or {}).get('rendered_templates') or {})
    for t in tpls:
        text_out, _missing = _render(t.content, data)
        rendered_map[t.name] = text_out
    extra = dict(alert.extra_data or {})
    extra['rendered_templates'] = rendered_map
    # 整体重新赋值以触发 SQLAlchemy JSON 列 dirty 标记
    alert.extra_data = extra
    db.session.commit()


def render_templates_for_event(event_id: int) -> None:
    """事件创建后自动渲染 auto_render 事件模板，结果写入事件 extra_data。"""
    from app.models import Event
    event = Event.query.get(event_id)
    if not event:
        return
    tpls = AlertTemplate.query.filter(
        AlertTemplate.auto_render.is_(True),
        AlertTemplate.enabled.is_(True),
        AlertTemplate.scene.in_(['event', 'universal']),
    ).all()
    if not tpls:
        return
    data = _build_event_data(event)
    rendered_map = {}
    for t in tpls:
        text_out, _missing = _render(t.content, data)
        rendered_map[t.name] = text_out
    extra = dict(event.extra_data or {})
    extra['rendered_templates'] = rendered_map
    event.extra_data = extra
    db.session.commit()
