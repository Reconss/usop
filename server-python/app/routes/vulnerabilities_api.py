"""漏洞管理 API（主机漏洞 / 应用漏洞）

设计参考常规漏洞管理系统（Tenable/Qualys/RBVM 体系）：
- 漏洞定义（知识库）与资产漏洞实例（处置跟踪）双表
- 生命周期：发现/录入 → 评估定级 → 分派修复 → 复测验证 → 关闭，每步写时间线
- 评级：原始 CVSS + 业务因子重评，重评与自动定级共用同一套评级配置
  （vuln_assessment_rules，见 vulnerability_assessment_api），人工仅逐维度
  覆盖因子或整分覆盖，不再另设硬编码权重模型
"""
import json
import logging
import os
import uuid
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify, send_file
from werkzeug.utils import secure_filename

from app.routes.auth import login_required
from app.database import db
from app.models import Vulnerability, AssetVulnerability, Asset, VulnerabilityAttachment
from app.models.extensions import VULN_STATUS_FLOW

logger = logging.getLogger(__name__)
vulnerabilities_api_bp = Blueprint('vulnerabilities_api', __name__)

# 附件存储目录（/app/app 在容器里是 bind mount，落到宿主机 server-python/app/uploads）
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                          'uploads', 'vuln_attachments')
MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024  # 20MB
IMAGE_EXTS = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'}
ALLOWED_EXTS = IMAGE_EXTS | {'.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv',
                             '.txt', '.md', '.log', '.json', '.zip'}

SEVERITIES = ('critical', 'high', 'medium', 'low')
VULN_TYPES = ('host', 'application')

STATUS_LABEL = {
    'open': '未处理', 'in_progress': '修复中', 'fixed': '待复测',
    'closed': '已关闭', 'ignored': '已忽略', 'risk_accepted': '风险接受',
}


def _current_user():
    return getattr(request, 'current_user', {}) or {}


def _username() -> str:
    return _current_user().get('username', 'system')


def _severity_from_score(score: float) -> str:
    if score >= 9.0:
        return 'critical'
    if score >= 7.0:
        return 'high'
    if score >= 4.0:
        return 'medium'
    return 'low'


def _gen_vuln_code(vuln_type: str, av_id: int) -> str:
    prefix = 'VH' if vuln_type == 'host' else 'VA'
    return f"{prefix}-{datetime.utcnow().strftime('%Y%m%d')}-{av_id:04d}"


def _get_or_create_vuln_definition(data: dict, vuln_type: str) -> Vulnerability:
    """根据 CVE/名称 查找或创建漏洞定义。"""
    cve_id = (data.get('cve_id') or '').strip() or None
    name = (data.get('name') or '').strip() or '未命名漏洞'

    vuln = None
    if cve_id:
        vuln = Vulnerability.query.filter_by(cve_id=cve_id).first()
    if not vuln and data.get('vuln_id'):
        vuln = Vulnerability.query.get(data['vuln_id'])
    if not vuln:
        vuln = Vulnerability.query.filter_by(name=name, vuln_type=vuln_type).first()

    if not vuln:
        vid = data.get('vuln_id') or (
            f"cve-{cve_id}" if cve_id else f"mnl-{abs(hash(name + vuln_type)) % 10**10}")
        vuln = Vulnerability(
            id=vid, name=name, cve_id=cve_id,
            cvss_score=data.get('cvss_score') or 0,
            severity=data.get('severity') or 'medium',
            description=data.get('description'), solution=data.get('solution'),
            vuln_type=vuln_type, vuln_class=data.get('vuln_class'),
            affected_product=data.get('affected_product'),
            ref_links=data.get('ref_links'),
            source='manual',
        )
        db.session.add(vuln)
        db.session.flush()
    return vuln


# ==================== 列表 / 统计 ====================

@vulnerabilities_api_bp.route('/vulnerabilities', methods=['GET'])
@login_required
def get_vulnerabilities():
    """资产漏洞实例列表（支持 type/severity/status/search/分页，服务端分页）"""
    vuln_type = request.args.get('type')
    severity = request.args.get('severity')
    status = request.args.get('status')
    search = (request.args.get('search') or '').strip()
    page = request.args.get('page', 1, type=int)
    page_size = min(request.args.get('page_size', 20, type=int), 200)

    query = AssetVulnerability.query
    if vuln_type in VULN_TYPES:
        query = query.filter(AssetVulnerability.vuln_type == vuln_type)
    if severity in SEVERITIES:
        # 按重评等级优先过滤
        query = query.filter(db.or_(
            AssetVulnerability.assessed_severity == severity,
            db.and_(AssetVulnerability.assessed_severity.is_(None),
                    AssetVulnerability.severity == severity)))
    if status:
        query = query.filter(AssetVulnerability.status == status)
    if search:
        like = f'%{search}%'
        query = query.join(
            Vulnerability, AssetVulnerability.vuln_id == Vulnerability.id, isouter=True
        ).filter(db.or_(
            Vulnerability.name.ilike(like), Vulnerability.cve_id.ilike(like),
            AssetVulnerability.plugin_name.ilike(like),
            AssetVulnerability.ip_address.ilike(like),
            AssetVulnerability.hostname.ilike(like),
            AssetVulnerability.vuln_code.ilike(like),
        ))

    # 危急 > 高 > 中 > 低，同等级按发现时间倒序
    sev_col = db.func.coalesce(AssetVulnerability.assessed_severity, AssetVulnerability.severity)
    sev_order = db.case(
        (sev_col == 'critical', 0), (sev_col == 'high', 1),
        (sev_col == 'medium', 2), (sev_col == 'low', 3), else_=4)
    query = query.order_by(sev_order, AssetVulnerability.discovered_at.desc())
    pagination = query.paginate(page=page, per_page=page_size, error_out=False)

    return jsonify({
        'success': True,
        'data': {
            'items': [v.to_dict() for v in pagination.items],
            'total': pagination.total,
            'page': page,
            'page_size': page_size,
            'pages': pagination.pages,
        }
    })


@vulnerabilities_api_bp.route('/vulnerabilities/export', methods=['GET'])
@login_required
def export_vulnerabilities():
    """导出漏洞（支持 type/severity/status/search 筛选，返回全部匹配，不分页）"""
    vuln_type = request.args.get('type')
    severity = request.args.get('severity')
    status = request.args.get('status')
    search = (request.args.get('search') or '').strip()

    query = AssetVulnerability.query
    if vuln_type in VULN_TYPES:
        query = query.filter(AssetVulnerability.vuln_type == vuln_type)
    if severity in SEVERITIES:
        # 按重评等级优先过滤
        query = query.filter(db.or_(
            AssetVulnerability.assessed_severity == severity,
            db.and_(AssetVulnerability.assessed_severity.is_(None),
                    AssetVulnerability.severity == severity)))
    if status:
        query = query.filter(AssetVulnerability.status == status)
    if search:
        like = f'%{search}%'
        query = query.join(
            Vulnerability, AssetVulnerability.vuln_id == Vulnerability.id, isouter=True
        ).filter(db.or_(
            Vulnerability.name.ilike(like), Vulnerability.cve_id.ilike(like),
            AssetVulnerability.plugin_name.ilike(like),
            AssetVulnerability.ip_address.ilike(like),
            AssetVulnerability.hostname.ilike(like),
            AssetVulnerability.vuln_code.ilike(like),
        ))

    items = [v.to_dict() for v in query.all()]
    return jsonify({'success': True, 'data': items, 'total': len(items)})


@vulnerabilities_api_bp.route('/vulnerabilities/stats', methods=['GET'])
@login_required
def get_stats():
    """按漏洞类型统计（列表页顶部统计卡）"""
    out = {}
    for t in VULN_TYPES:
        base = AssetVulnerability.query.filter(AssetVulnerability.vuln_type == t)
        sev = {}
        for s in SEVERITIES:
            sev[s] = base.filter(db.func.coalesce(
                AssetVulnerability.assessed_severity, AssetVulnerability.severity) == s).count()
        st = {}
        for s, _label in STATUS_LABEL.items():
            st[s] = base.filter(AssetVulnerability.status == s).count()
        out[t] = {
            'total': base.count(),
            'by_severity': sev,
            'by_status': st,
            'open_total': base.filter(AssetVulnerability.status.in_(['open', 'in_progress'])).count(),
        }
    return jsonify({'success': True, 'data': out})


# ==================== 详情 / 录入 / 编辑 / 删除 ====================

@vulnerabilities_api_bp.route('/vulnerabilities/<int:av_id>', methods=['GET'])
@login_required
def get_vulnerability(av_id):
    av = AssetVulnerability.query.get(av_id)
    if not av:
        return jsonify({'success': False, 'error': '漏洞不存在'}), 404
    return jsonify({'success': True, 'data': av.to_dict()})


@vulnerabilities_api_bp.route('/vulnerabilities', methods=['POST'])
@login_required
def create_vulnerability():
    """手工录入漏洞（主机/应用），同时创建漏洞定义与资产漏洞实例"""
    data = request.get_json() or {}
    vuln_type = data.get('vuln_type') or data.get('type') or 'host'
    if vuln_type not in VULN_TYPES:
        return jsonify({'success': False, 'error': 'vuln_type 必须是 host 或 application'}), 400

    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'success': False, 'error': '漏洞名称必填'}), 400

    # 资产：按 ID 关联，或按 IP/名称自动匹配创建
    asset = None
    if data.get('asset_id'):
        asset = Asset.query.get(data['asset_id'])
    if not asset:
        ip = (data.get('ip_address') or '').strip()
        if ip:
            asset = Asset.query.filter_by(ip=ip).first()
    if not asset:
        ip = (data.get('ip_address') or '').strip() or ''
        asset = Asset(
            name=data.get('asset_name') or data.get('hostname') or ip or name[:50],
            type='host' if vuln_type == 'host' else 'webapp',
            ip=ip or None, status='online',
        )
        db.session.add(asset)
        db.session.flush()

    severity = data.get('severity') or 'medium'
    if severity not in SEVERITIES:
        severity = _severity_from_score(float(data.get('cvss_score') or 0))

    vuln = _get_or_create_vuln_definition(data, vuln_type)
    if severity and not data.get('vuln_id'):
        vuln.severity = severity
        if data.get('cvss_score') is not None:
            vuln.cvss_score = data['cvss_score']

    av = AssetVulnerability(
        asset_id=asset.id, vuln_id=vuln.id, vuln_type=vuln_type,
        status='open', severity=severity,
        cvss_score=data.get('cvss_score') or vuln.cvss_score or 0,
        cvss3_score=data.get('cvss3_score'),
        cvss2_score=data.get('cvss2_score'),
        vuln_class=data.get('vuln_class') or vuln.vuln_class,
        hostname=data.get('hostname'), ip_address=data.get('ip_address') or asset.ip,
        port=data.get('port'), protocol=data.get('protocol'),
        url_path=data.get('url_path'), component_version=data.get('component_version'),
        evidence=data.get('evidence'), source='manual',
        assignee=data.get('assignee') or None,
        assigned_at=datetime.utcnow() if data.get('assignee') else None,
        notes=data.get('notes'),
    )
    db.session.add(av)
    db.session.flush()
    av.vuln_code = _gen_vuln_code(vuln_type, av.id)
    av.append_timeline('created', _username(),
                       f'手工录入漏洞（{STATUS_LABEL["open"]}）')
    db.session.commit()

    return jsonify({'success': True, 'data': av.to_dict()}), 201


@vulnerabilities_api_bp.route('/vulnerabilities/<int:av_id>', methods=['PUT'])
@login_required
def update_vulnerability(av_id):
    """编辑处置信息（方案/责任人/期限/备注等），不做状态流转"""
    av = AssetVulnerability.query.get(av_id)
    if not av:
        return jsonify({'success': False, 'error': '漏洞不存在'}), 404

    data = request.get_json() or {}
    changed = []
    for field in ('repair_plan', 'notes', 'assignee', 'evidence',
                  'url_path', 'component_version'):
        if field in data and getattr(av, field) != data[field]:
            setattr(av, field, data[field])
            changed.append(field)
    if 'deadline' in data:
        av.deadline = datetime.fromisoformat(data['deadline']) if data['deadline'] else None
        changed.append('deadline')
    if 'assignee' in data and data['assignee']:
        av.assigned_at = av.assigned_at or datetime.utcnow()

    if changed:
        av.append_timeline('updated', _username(), '更新字段：' + '、'.join(changed))
    db.session.commit()
    return jsonify({'success': True, 'data': av.to_dict()})


@vulnerabilities_api_bp.route('/vulnerabilities/<int:av_id>', methods=['DELETE'])
@login_required
def delete_vulnerability(av_id):
    av = AssetVulnerability.query.get(av_id)
    if not av:
        return jsonify({'success': False, 'error': '漏洞不存在'}), 404
    # 先清附件（落盘 + 记录），避免 FK 置空违规
    for att in VulnerabilityAttachment.query.filter_by(av_id=av_id).all():
        try:
            os.remove(_attachment_path(att))
        except OSError:
            pass
        db.session.delete(att)
    db.session.delete(av)
    db.session.commit()
    return jsonify({'success': True, 'message': '漏洞记录已删除'})


# ==================== 状态流转（跟踪处理） ====================

@vulnerabilities_api_bp.route('/vulnerabilities/<int:av_id>/status', methods=['PUT'])
@login_required
def change_status(av_id):
    """状态流转：open→in_progress→fixed→closed；旁路 ignored/risk_accepted；
    fixed 可退回 in_progress（复测不通过）；closed/ignored/risk_accepted 可重开。"""
    av = AssetVulnerability.query.get(av_id)
    if not av:
        return jsonify({'success': False, 'error': '漏洞不存在'}), 404

    data = request.get_json() or {}
    new_status = data.get('status')
    if new_status not in STATUS_LABEL:
        return jsonify({'success': False, 'error': f'未知状态: {new_status}'}), 400

    allowed = VULN_STATUS_FLOW.get(av.status, set())
    if new_status not in allowed:
        return jsonify({
            'success': False,
            'error': f'不允许从「{STATUS_LABEL.get(av.status, av.status)}」流转到「{STATUS_LABEL[new_status]}」',
            'allowed': sorted(allowed),
        }), 400

    old = av.status
    av.status = new_status
    user = _username()
    detail = (data.get('comment') or '').strip()

    if new_status == 'in_progress':
        if data.get('repair_plan'):
            av.repair_plan = data['repair_plan']
        if data.get('deadline'):
            av.deadline = datetime.fromisoformat(data['deadline'])
        if data.get('assignee'):
            av.assignee = data['assignee']
            av.assigned_at = av.assigned_at or datetime.utcnow()
    elif new_status == 'fixed':
        av.fixed_at = datetime.utcnow()
    elif new_status == 'closed':
        av.verified_by = user
        av.verified_at = datetime.utcnow()
        av.verify_result = data.get('verify_result', 'pass')
        av.close_reason = detail or None
    elif new_status in ('ignored', 'risk_accepted'):
        if data.get('notes'):
            av.notes = data['notes']
    elif new_status == 'open' and old in ('closed', 'ignored', 'risk_accepted'):
        av.fixed_at = None
        av.verified_at = None
        av.verify_result = None

    av.append_timeline('status', user,
                       f'{STATUS_LABEL.get(old, old)} → {STATUS_LABEL[new_status]}' + (f'：{detail}' if detail else ''))
    db.session.commit()
    return jsonify({'success': True, 'data': av.to_dict()})


# ==================== 重新评级 ====================

# 旧版三数字入参 → 评级配置维度 id 的映射（兼容 2026-10-21 双轨合并前的调用方）
_LEGACY_FACTOR_RULE_MAP = {
    'asset_importance': 'asset-importance',
    'exploitability': 'exploitability',
    'fix_difficulty': 'remediation',
}


def _map_legacy_factors(config: dict, legacy: dict) -> dict:
    """旧版三数字入参（0-10 分值）就近映射为评级配置中的维度因子 id。"""
    rules = {r.get('id'): r for r in (config.get('rules') or [])}
    out = {}
    for legacy_key, rule_id in _LEGACY_FACTOR_RULE_MAP.items():
        val = legacy.get(legacy_key)
        if val is None:
            continue
        try:
            val = float(val)
        except (TypeError, ValueError):
            continue
        rule = rules.get(rule_id)
        if not rule:
            continue
        best, best_gap = None, None
        for f in rule.get('factors', []):
            try:
                gap = abs(float(f.get('score', 5)) - val)
            except (TypeError, ValueError):
                continue
            if best_gap is None or gap < best_gap:
                best, best_gap = f.get('id'), gap
        if best:
            out[rule_id] = best
    return out


@vulnerabilities_api_bp.route('/vulnerabilities/<int:av_id>/reassess', methods=['PUT'])
@login_required
def reassess(av_id):
    """重新评级：按评级配置（vuln_assessment_rules）加权计算 + 可人工覆盖。

    与自动定级（/assessment/recalculate）共用同一套评级配置、权重与阈值：
    - factors: {rule_id: factor_id} 人工逐维度指定因子，未指定维度按漏洞
      真实属性自动挑选
    - 兼容旧版三数字入参（asset_importance/exploitability/fix_difficulty），
      按分值就近映射到对应维度因子
    - manual_score: 人工覆盖最终分数（0-10），等级仍按配置阈值推导（统一口径）
    - reason 必填（前端强制），写入时间线供审计
    """
    from app.routes.vulnerability_assessment_api import (
        _get_rating_config, _calculate_assessed_score,
        _severity_from_thresholds, _THRESHOLDS,
    )
    av = AssetVulnerability.query.get(av_id)
    if not av:
        return jsonify({'success': False, 'error': '漏洞不存在'}), 404

    data = request.get_json() or {}
    config = _get_rating_config()
    thresholds = config.get('thresholds') or _THRESHOLDS

    factors = data.get('factors')
    if not isinstance(factors, dict) or not factors:
        # 旧版三数字入参（或未指定因子=纯自动重算单条）
        factors = _map_legacy_factors(config, data)

    score, severity, choices = _calculate_assessed_score(av, config, factors)

    # 人工覆盖分数（可选）：分数直接采用，等级仍按配置阈值推导
    score_override = False
    manual_score = data.get('manual_score')
    if manual_score is not None and manual_score != '':
        try:
            score = round(min(10.0, max(0.0, float(manual_score))), 2)
        except (TypeError, ValueError):
            return jsonify({'success': False, 'error': 'manual_score 必须是数字'}), 400
        severity = _severity_from_thresholds(score, thresholds)
        score_override = True

    user = _username()
    history = []
    if av.assessed_score is not None:
        history.append({
            'at': datetime.utcnow().isoformat(), 'by': user,
            'old_score': av.assessed_score, 'old_severity': av.assessed_severity,
            'reason': av.assess_reason,
        })
    history = history + [h for h in av.assess_history or []]

    old_sev = av.assessed_severity or av.severity
    av.assessed_score = score
    av.assessed_severity = severity
    av.assess_factors = {
        'manual': True, 'choices': choices,
        'score': score, 'severity': severity, 'score_override': score_override,
    }
    av.assess_reason = (data.get('reason') or '').strip() or None
    av.assess_history = history
    av.append_timeline('reassess', user,
                       f'重评等级 {old_sev} → {severity}（{score} 分）'
                       + (f'：{av.assess_reason}' if av.assess_reason else ''))
    db.session.commit()
    return jsonify({'success': True, 'data': av.to_dict()})


# ==================== 漏洞定义知识库（保留原能力） ====================

@vulnerabilities_api_bp.route('/vulnerabilities/definitions', methods=['GET'])
@login_required
def get_definitions():
    page = request.args.get('page', 1, type=int)
    page_size = min(request.args.get('page_size', 20, type=int), 200)
    search = (request.args.get('search') or '').strip()
    vuln_type = request.args.get('type')

    query = Vulnerability.query
    if vuln_type in VULN_TYPES:
        query = query.filter(Vulnerability.vuln_type.in_([vuln_type, 'both']))
    if search:
        like = f'%{search}%'
        query = query.filter(db.or_(
            Vulnerability.name.ilike(like), Vulnerability.cve_id.ilike(like),
            Vulnerability.cnvd_id.ilike(like), Vulnerability.cnnvd_id.ilike(like)))
    pagination = query.order_by(Vulnerability.cvss_score.desc()).paginate(
        page=page, per_page=page_size, error_out=False)

    items = []
    for v in pagination.items:
        d = v.to_dict()
        d['affected_assets'] = AssetVulnerability.query.filter_by(vuln_id=v.id).count()
        items.append(d)

    return jsonify({
        'success': True,
        'data': {'items': items, 'total': pagination.total,
                 'page': page, 'page_size': page_size, 'pages': pagination.pages}
    })


@vulnerabilities_api_bp.route('/vulnerabilities/batch-status', methods=['PUT'])
@login_required
def batch_change_status():
    """批量状态流转（列表页批量操作）"""
    data = request.get_json() or {}
    ids = data.get('ids') or []
    new_status = data.get('status')
    if new_status not in STATUS_LABEL:
        return jsonify({'success': False, 'error': f'未知状态: {new_status}'}), 400
    if not ids:
        return jsonify({'success': False, 'error': 'ids 为空'}), 400

    user = _username()
    ok, failed = 0, []
    for av_id in ids:
        av = AssetVulnerability.query.get(av_id)
        if not av:
            failed.append({'id': av_id, 'reason': '不存在'})
            continue
        if new_status not in VULN_STATUS_FLOW.get(av.status, set()):
            failed.append({'id': av_id,
                           'reason': f'当前状态 {STATUS_LABEL.get(av.status, av.status)} 不允许该操作'})
            continue
        av.status = new_status
        if new_status == 'fixed':
            av.fixed_at = datetime.utcnow()
        elif new_status == 'closed':
            av.verified_by = user
            av.verified_at = datetime.utcnow()
            av.verify_result = 'pass'
        av.append_timeline('status', user, f'批量操作 → {STATUS_LABEL[new_status]}'
                           + (f'：{data.get("comment")}' if data.get('comment') else ''))
        ok += 1
    db.session.commit()
    return jsonify({'success': True, 'data': {'updated': ok, 'failed': failed}})


# ==================== 附件（截图 / 报告） ====================

@vulnerabilities_api_bp.route('/vulnerabilities/<int:av_id>/attachments', methods=['GET'])
@login_required
def list_attachments(av_id):
    av = AssetVulnerability.query.get(av_id)
    if not av:
        return jsonify({'success': False, 'error': '漏洞不存在'}), 404
    atts = (VulnerabilityAttachment.query.filter_by(av_id=av_id)
            .order_by(VulnerabilityAttachment.uploaded_at.desc()).all())
    return jsonify({'success': True, 'data': [a.to_dict() for a in atts]})


@vulnerabilities_api_bp.route('/vulnerabilities/<int:av_id>/attachments', methods=['POST'])
@login_required
def upload_attachment(av_id):
    """上传截图/报告（multipart，字段名 file）"""
    av = AssetVulnerability.query.get(av_id)
    if not av:
        return jsonify({'success': False, 'error': '漏洞不存在'}), 404

    f = request.files.get('file')
    if not f or not f.filename:
        return jsonify({'success': False, 'error': '缺少文件（字段名 file）'}), 400

    orig_name = f.filename
    ext = os.path.splitext(orig_name)[1].lower()
    if ext not in ALLOWED_EXTS:
        return jsonify({'success': False,
                        'error': f'不支持的文件类型 {ext}，允许：图片/png/jpg/gif/webp、pdf、doc(x)、xls(x)、csv、txt、md、log、json、zip'}), 400

    f.seek(0, os.SEEK_END)
    size = f.tell()
    f.seek(0)
    if size > MAX_ATTACHMENT_SIZE:
        return jsonify({'success': False, 'error': '文件超过 20MB 限制'}), 400

    kind = 'screenshot' if ext in IMAGE_EXTS else 'report'
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    # secure_filename 会剥掉中文，中文文件名落盘用 uuid 兜底，展示仍用原始名
    safe = secure_filename(orig_name)
    filename = f"{uuid.uuid4().hex[:12]}_{safe}" if safe else f"{uuid.uuid4().hex[:12]}_file{ext}"
    f.save(os.path.join(UPLOAD_DIR, filename))

    att = VulnerabilityAttachment(
        av_id=av_id, filename=filename, orig_name=orig_name[:300],
        kind=kind, mime=f.mimetype or ('image/' + ext[1:] if ext in IMAGE_EXTS else 'application/octet-stream'),
        size=size, uploaded_by=_username(),
    )
    db.session.add(att)
    av.append_timeline('attachment', _username(),
                       f'上传{"截图" if kind == "screenshot" else "报告/附件"}：{orig_name}')
    db.session.commit()
    return jsonify({'success': True, 'data': att.to_dict()}), 201


def _attachment_path(att) -> str:
    return os.path.join(UPLOAD_DIR, att.filename)


@vulnerabilities_api_bp.route('/vulnerabilities/<int:av_id>/attachments/<int:att_id>', methods=['GET'])
@login_required
def download_attachment(av_id, att_id):
    """下载/预览附件（前端用 fetch+blob 展示图片预览）"""
    att = VulnerabilityAttachment.query.filter_by(id=att_id, av_id=av_id).first()
    if not att:
        return jsonify({'success': False, 'error': '附件不存在'}), 404
    path = _attachment_path(att)
    if not os.path.exists(path):
        return jsonify({'success': False, 'error': '文件已丢失'}), 404
    return send_file(path, mimetype=att.mime or 'application/octet-stream',
                     as_attachment=False, download_name=att.orig_name)


@vulnerabilities_api_bp.route('/vulnerabilities/<int:av_id>/attachments/<int:att_id>', methods=['DELETE'])
@login_required
def delete_attachment(av_id, att_id):
    att = VulnerabilityAttachment.query.filter_by(id=att_id, av_id=av_id).first()
    if not att:
        return jsonify({'success': False, 'error': '附件不存在'}), 404
    try:
        os.remove(_attachment_path(att))
    except OSError:
        pass
    av = AssetVulnerability.query.get(av_id)
    if av:
        av.append_timeline('attachment', _username(), f'删除附件：{att.orig_name}')
    db.session.delete(att)
    db.session.commit()
    return jsonify({'success': True, 'message': '附件已删除'})
