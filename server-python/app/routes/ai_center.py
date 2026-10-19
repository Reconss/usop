"""AI 中心：提示词管理 + 经验库（移植自 EFF-Monitoring 的 AI 中心）

- 提示词管理：ai_prompts 表的 CRUD / 设为默认 / 渲染预览。
  落地后 `app/routes/ai_judgment.py` 的研判提示词改为从这里取，
  在「告警研判 / 对话 / 经验提取」等场景直接复用。
- 经验库：在既有 STEExperience（STE 经验闭环）之上补齐「编号 / 标题 / 标签 / 状态 / 发布」
  等管理维度，提供检索、编辑、批量发布/删除，供研判召回与人工复用。
"""
import logging
from datetime import datetime

from flask import Blueprint, jsonify, request

from app.database import db
from app.routes.auth import login_required
from app.models.ai_prompt import AIPrompt, PROMPT_KEYS, PROMPT_VARIABLES
from app.models.ste_experience import STEExperience
from app.utils import ai_prompts as prompt_utils

logger = logging.getLogger(__name__)

ai_center_bp = Blueprint('ai_center', __name__)

EXPERIENCE_STATUSES = ('draft', 'pending_publish', 'published', 'archived')
VERDICTS = ('true_attack', 'false_positive', 'suspicious', 'info')
RISK_LEVELS = ('critical', 'high', 'medium', 'low')


# ==================== 目录 ====================

@ai_center_bp.route('/catalog', methods=['GET'])
@login_required
def catalog():
    return jsonify({'success': True, 'data': {
        'prompt_keys': [{'key': k, 'label': v} for k, v in PROMPT_KEYS.items()],
        'prompt_variables': PROMPT_VARIABLES,
        'experience_statuses': [
            {'key': 'draft', 'label': '草稿'},
            {'key': 'pending_publish', 'label': '待发布'},
            {'key': 'published', 'label': '已发布'},
            {'key': 'archived', 'label': '已归档'},
        ],
        'verdicts': [
            {'key': 'true_attack', 'label': '真实攻击'},
            {'key': 'false_positive', 'label': '误报'},
            {'key': 'suspicious', 'label': '可疑待确认'},
            {'key': 'info', 'label': '信息'},
        ],
        'risk_levels': list(RISK_LEVELS),
    }})


# ==================== 提示词管理 ====================

@ai_center_bp.route('/prompts', methods=['GET'])
@login_required
def list_prompts():
    q = AIPrompt.query
    prompt_key = request.args.get('prompt_key')
    if prompt_key:
        q = q.filter(AIPrompt.prompt_key == prompt_key)
    keyword = (request.args.get('q') or '').strip()
    if keyword:
        like = f'%{keyword}%'
        q = q.filter(db.or_(AIPrompt.name.like(like),
                            AIPrompt.description.like(like),
                            AIPrompt.system_prompt.like(like)))
    rows = q.order_by(AIPrompt.prompt_key.asc(), AIPrompt.is_default.desc(),
                      AIPrompt.updated_at.desc()).all()
    return jsonify({'success': True, 'data': [r.to_dict() for r in rows]})


def _prompt_conflict(prompt_key, name, exclude_id=None):
    q = AIPrompt.query.filter_by(prompt_key=prompt_key, name=name)
    if exclude_id:
        q = q.filter(AIPrompt.id != exclude_id)
    return q.first() is not None


@ai_center_bp.route('/prompts', methods=['POST'])
@login_required
def create_prompt():
    data = request.get_json() or {}
    prompt_key = (data.get('prompt_key') or '').strip()
    name = (data.get('name') or '').strip()
    if prompt_key not in PROMPT_KEYS:
        return jsonify({'success': False, 'error': f'不支持的提示词类型：{prompt_key}'}), 400
    if not name:
        return jsonify({'success': False, 'error': '提示词名称不能为空'}), 400
    if _prompt_conflict(prompt_key, name):
        return jsonify({'success': False, 'error': '同类型下提示词名称已存在'}), 409

    is_default = bool(data.get('is_default'))
    if is_default:
        # 同一职责只能有一个默认
        AIPrompt.query.filter_by(prompt_key=prompt_key).update({'is_default': False})

    row = AIPrompt(
        name=name, prompt_key=prompt_key,
        category=(data.get('category') or '').strip(),
        description=(data.get('description') or '').strip(),
        system_prompt=data.get('system_prompt') or '',
        user_prompt=data.get('user_prompt') or '',
        output_schema=data.get('output_schema') or {},
        variables=data.get('variables') or PROMPT_VARIABLES.get(prompt_key, []),
        enabled=bool(data.get('enabled', True)),
        is_default=is_default,
        builtin=False,
    )
    db.session.add(row)
    db.session.commit()
    return jsonify({'success': True, 'data': row.to_dict()}), 201


@ai_center_bp.route('/prompts/<int:pid>', methods=['PATCH'])
@login_required
def update_prompt(pid):
    row = AIPrompt.query.get(pid)
    if not row:
        return jsonify({'success': False, 'error': '提示词不存在'}), 404
    data = request.get_json() or {}

    new_key = (data.get('prompt_key') or row.prompt_key).strip()
    if new_key not in PROMPT_KEYS:
        return jsonify({'success': False, 'error': f'不支持的提示词类型：{new_key}'}), 400
    new_name = (data.get('name') or row.name).strip()
    if not new_name:
        return jsonify({'success': False, 'error': '提示词名称不能为空'}), 400
    if _prompt_conflict(new_key, new_name, exclude_id=pid):
        return jsonify({'success': False, 'error': '同类型下提示词名称已存在'}), 409

    if data.get('is_default'):
        AIPrompt.query.filter(AIPrompt.prompt_key == new_key, AIPrompt.id != pid) \
            .update({'is_default': False})

    row.prompt_key = new_key
    row.name = new_name
    for f in ('category', 'description', 'system_prompt', 'user_prompt'):
        if f in data:
            setattr(row, f, data[f] or '')
    if 'output_schema' in data:
        row.output_schema = data['output_schema'] or {}
    if 'variables' in data:
        row.variables = data['variables'] or []
    if 'enabled' in data:
        row.enabled = bool(data['enabled'])
    if 'is_default' in data:
        row.is_default = bool(data['is_default'])
    db.session.commit()
    return jsonify({'success': True, 'data': row.to_dict()})


@ai_center_bp.route('/prompts/<int:pid>', methods=['DELETE'])
@login_required
def delete_prompt(pid):
    row = AIPrompt.query.get(pid)
    if not row:
        return jsonify({'success': False, 'error': '提示词不存在'}), 404
    # 不允许删掉某职责下最后一条启用中的默认提示词，避免研判链路失稳
    if row.is_default:
        others = AIPrompt.query.filter(
            AIPrompt.prompt_key == row.prompt_key,
            AIPrompt.id != pid, AIPrompt.enabled.is_(True)).count()
        if others == 0:
            return jsonify({'success': False,
                            'error': '这是该类型下唯一可用的默认提示词，删除后研判将回退内置默认；'
                                     '请先新增并设为默认'}), 400
    db.session.delete(row)
    db.session.commit()
    return jsonify({'success': True, 'data': {'id': pid}})


@ai_center_bp.route('/prompts/<int:pid>/set-default', methods=['POST'])
@login_required
def set_default_prompt(pid):
    row = AIPrompt.query.get(pid)
    if not row:
        return jsonify({'success': False, 'error': '提示词不存在'}), 404
    AIPrompt.query.filter_by(prompt_key=row.prompt_key).update({'is_default': False})
    row.is_default = True
    row.enabled = True
    db.session.commit()
    return jsonify({'success': True, 'data': row.to_dict()})


@ai_center_bp.route('/prompts/preview', methods=['POST'])
@login_required
def preview_prompt():
    """按给定变量渲染提示词，便于核对变量替换结果。"""
    data = request.get_json() or {}
    variables = data.get('variables') or {}
    system = prompt_utils.render_prompt(data.get('system_prompt') or '', variables)
    user = prompt_utils.render_prompt(data.get('user_prompt') or '', variables)
    return jsonify({'success': True, 'data': {
        'system': system,
        'user': user,
        'missing': [
            v for v in set(prompt_utils.template_vars(data.get('system_prompt') or '')
                           + prompt_utils.template_vars(data.get('user_prompt') or ''))
            if v not in variables
        ],
    }})


@ai_center_bp.route('/prompts/reset-builtin', methods=['POST'])
@login_required
def reset_builtin_prompts():
    """重新播种缺失的内置提示词（不覆盖用户已有的同类型同名称记录）。"""
    created = prompt_utils.seed_prompts(force=False)
    return jsonify({'success': True, 'data': {'created': created}})


# ==================== 经验库 ====================

def _next_knowledge_id():
    prefix = 'STE-' + datetime.utcnow().strftime('%Y%m%d') + '-'
    last = (STEExperience.query
            .filter(STEExperience.knowledge_id.like(prefix + '%'))
            .order_by(STEExperience.knowledge_id.desc()).first())
    seq = 1
    if last and last.knowledge_id:
        try:
            seq = int(last.knowledge_id.rsplit('-', 1)[1]) + 1
        except (ValueError, IndexError):
            seq = 1
    return f'{prefix}{seq:04d}'


@ai_center_bp.route('/experiences', methods=['GET'])
@login_required
def list_experiences():
    q = STEExperience.query
    keyword = (request.args.get('q') or '').strip()
    status = (request.args.get('status') or '').strip()
    verdict = (request.args.get('verdict') or '').strip()
    category = (request.args.get('category') or '').strip()
    if keyword:
        like = f'%{keyword}%'
        q = q.filter(db.or_(
            STEExperience.knowledge_id.like(like),
            STEExperience.title.like(like),
            STEExperience.conclusion.like(like),
            STEExperience.signature.like(like),
            STEExperience.source_alert_code.like(like),
        ))
    if status:
        q = q.filter(STEExperience.status == status)
    if verdict:
        q = q.filter(STEExperience.verdict == verdict)
    if category:
        q = q.filter(STEExperience.category == category)
    try:
        limit = min(int(request.args.get('limit', 200)), 500)
    except (TypeError, ValueError):
        limit = 200
    rows = q.order_by(db.desc(STEExperience.updated_at)).limit(limit).all()
    return jsonify({'success': True, 'data': [r.to_dict() for r in rows]})


@ai_center_bp.route('/experiences/stats', methods=['GET'])
@login_required
def experience_stats():
    total = STEExperience.query.count()
    by_status = dict(db.session.query(STEExperience.status, db.func.count(STEExperience.id))
                     .group_by(STEExperience.status).all())
    by_verdict = dict(db.session.query(STEExperience.verdict, db.func.count(STEExperience.id))
                      .group_by(STEExperience.verdict).all())
    avg_score = db.session.query(db.func.coalesce(db.func.avg(STEExperience.usefulness_score), 0)).scalar()
    hits = db.session.query(db.func.coalesce(db.func.sum(STEExperience.hit_count), 0)).scalar()
    return jsonify({'success': True, 'data': {
        'total': total,
        'by_status': {k or 'published': v for k, v in by_status.items()},
        'by_verdict': by_verdict,
        'avg_usefulness': round(float(avg_score or 0), 3),
        'total_hits': int(hits or 0),
    }})


@ai_center_bp.route('/experiences', methods=['POST'])
@login_required
def create_experience():
    data = request.get_json() or {}
    verdict = (data.get('verdict') or 'suspicious').strip()
    if verdict not in VERDICTS:
        return jsonify({'success': False, 'error': f'研判结论不支持：{verdict}'}), 400
    category = (data.get('category') or '').strip()
    if not category:
        return jsonify({'success': False, 'error': '告警分类不能为空（用于相似召回）'}), 400
    status = (data.get('status') or 'published').strip()
    if status not in EXPERIENCE_STATUSES:
        return jsonify({'success': False, 'error': f'经验状态不支持：{status}'}), 400

    row = STEExperience(
        knowledge_id=(data.get('knowledge_id') or '').strip() or _next_knowledge_id(),
        title=(data.get('title') or '').strip() or (data.get('conclusion') or '')[:60] or '未命名经验',
        tags=data.get('tags') or [],
        status=status,
        source_type='manual',
        category=category,
        attack_type=(data.get('attack_type') or '').strip() or None,
        signature=data.get('signature') or '',
        verdict=verdict,
        verdict_label=data.get('verdict_label') or None,
        risk_level=(data.get('risk_level') or 'medium').strip(),
        conclusion=data.get('conclusion') or '',
        evidence_summary=data.get('evidence_summary') or '',
        suggested_action=data.get('suggested_action') or '',
        source_alert_code=(data.get('source_alert_code') or '').strip() or None,
        usefulness_score=float(data.get('usefulness_score') or 0.5),
        quality=data.get('quality') or {},
    )
    db.session.add(row)
    db.session.commit()
    return jsonify({'success': True, 'data': row.to_dict()}), 201


@ai_center_bp.route('/experiences/<int:eid>', methods=['PATCH'])
@login_required
def update_experience(eid):
    row = STEExperience.query.get(eid)
    if not row:
        return jsonify({'success': False, 'error': '经验不存在'}), 404
    data = request.get_json() or {}
    if 'verdict' in data and data['verdict'] not in VERDICTS:
        return jsonify({'success': False, 'error': '研判结论不支持'}), 400
    if 'status' in data and data['status'] not in EXPERIENCE_STATUSES:
        return jsonify({'success': False, 'error': '经验状态不支持'}), 400
    for f in ('title', 'signature', 'conclusion', 'evidence_summary', 'suggested_action',
              'category', 'attack_type', 'risk_level', 'verdict', 'verdict_label',
              'source_alert_code', 'status', 'knowledge_id'):
        if f in data:
            setattr(row, f, data[f])
    if 'tags' in data:
        row.tags = data['tags'] or []
    if 'quality' in data:
        row.quality = data['quality'] or {}
    if 'usefulness_score' in data:
        try:
            row.usefulness_score = max(0.0, min(1.0, float(data['usefulness_score'])))
        except (TypeError, ValueError):
            pass
    db.session.commit()
    return jsonify({'success': True, 'data': row.to_dict()})


@ai_center_bp.route('/experiences/<int:eid>/publish', methods=['POST'])
@login_required
def publish_experience(eid):
    row = STEExperience.query.get(eid)
    if not row:
        return jsonify({'success': False, 'error': '经验不存在'}), 404
    row.status = 'published'
    if not row.knowledge_id:
        row.knowledge_id = _next_knowledge_id()
    db.session.commit()
    return jsonify({'success': True, 'data': row.to_dict()})


@ai_center_bp.route('/experiences/<int:eid>', methods=['DELETE'])
@login_required
def delete_experience(eid):
    row = STEExperience.query.get(eid)
    if not row:
        return jsonify({'success': False, 'error': '经验不存在'}), 404
    db.session.delete(row)
    db.session.commit()
    return jsonify({'success': True, 'data': {'id': eid}})


@ai_center_bp.route('/experiences/batch', methods=['POST'])
@login_required
def batch_experiences():
    """批量操作：action = delete | publish | archive"""
    data = request.get_json() or {}
    action = (data.get('action') or '').strip()
    ids = [int(i) for i in (data.get('ids') or []) if str(i).isdigit()]
    if action not in ('delete', 'publish', 'archive'):
        return jsonify({'success': False, 'error': 'action 仅支持 delete/publish/archive'}), 400
    if not ids:
        return jsonify({'success': False, 'error': '未选择经验'}), 400

    rows = STEExperience.query.filter(STEExperience.id.in_(ids)).all()
    if action == 'delete':
        for r in rows:
            db.session.delete(r)
    else:
        target = 'published' if action == 'publish' else 'archived'
        for r in rows:
            r.status = target
            if target == 'published' and not r.knowledge_id:
                r.knowledge_id = _next_knowledge_id()
    db.session.commit()
    return jsonify({'success': True, 'data': {'affected': len(rows), 'action': action}})
