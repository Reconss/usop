"""
结构化 AI 研判 + STE 经验库 路由

借鉴 EFF-Monitoring 的「结构化智能研判」与「STE 经验闭环沉淀」：
1. 结构化研判：证据包(来源+置信度)、互斥研判标签、风险等级、结论、证据链、处置建议。
2. 经验召回：研判时按 category/attack_type 召回高权重历史经验，注入提示词复用。
3. 闭环沉淀：告警被标记为 误报/真实攻击 后，可（批量）提取为 STE 经验并加权复用。
4. 反馈调权：人工 correct/wrong/useful/useless 调整 usefulness_score。
"""
import json
import re
import logging
from datetime import datetime
from flask import Blueprint, request, jsonify
from app.database import db
from app.models.ste_experience import STEExperience
from app.utils import es_alerts, event_enrichment
from app.routes.auth import login_required

logger = logging.getLogger(__name__)

ai_judgment_bp = Blueprint('ai_judgment', __name__)

VERDICT_MAP = {
    'true_attack': '真实攻击',
    'false_positive': '误报',
    'suspicious': '可疑待确认',
    'info': '信息',
}
RISK_LEVELS = ['critical', 'high', 'medium', 'low']


# =============================================
# 辅助：LLM 调用（复用现有网关，失败回退规则）
# =============================================

def _call_llm(messages, temperature=0.2, max_tokens=2048):
    """调用 LLM，返回文本；失败返回 None（交由规则兜底）。"""
    try:
        from app.routes.ai_api import _deepseek_request
        resp = _deepseek_request(messages=messages, temperature=temperature, max_tokens=max_tokens)
        return resp['choices'][0]['message']['content']
    except Exception as e:
        logger.warning(f"LLM 调用失败，转入规则兜底: {e}")
        return None


def _parse_judgment(content):
    """从 LLM 输出中稳健解析结构化研判 JSON。"""
    if not content:
        return None
    # 去掉 ```json 代码围栏
    cleaned = re.sub(r'```(?:json)?\s*', '', content).strip()
    # 截取第一个 { 到最后一个 }
    start = cleaned.find('{')
    end = cleaned.rfind('}')
    if start == -1 or end == -1 or end <= start:
        return None
    block = cleaned[start:end + 1]
    try:
        data = json.loads(block)
    except Exception:
        return None

    verdict = str(data.get('verdict', 'suspicious')).lower()
    if verdict not in VERDICT_MAP:
        verdict = 'suspicious'
    risk = str(data.get('risk_level', 'medium')).lower()
    if risk not in RISK_LEVELS:
        risk = 'medium'
    try:
        confidence = float(data.get('confidence', 0.5))
    except Exception:
        confidence = 0.5
    confidence = max(0.0, min(1.0, confidence))

    evidence = data.get('evidence') or []
    if not isinstance(evidence, list):
        evidence = []
    norm_evidence = []
    for e in evidence[:8]:
        if not isinstance(e, dict):
            continue
        try:
            ec = max(0.0, min(1.0, float(e.get('confidence', 0.5))))
        except Exception:
            ec = 0.5
        norm_evidence.append({
            'source': str(e.get('source', '未知来源')),
            'confidence': round(ec, 3),
            'detail': str(e.get('detail', '')),
        })

    steps = data.get('analysis_steps') or []
    if isinstance(steps, str):
        steps = [steps]

    return {
        'verdict': verdict,
        'verdict_label': VERDICT_MAP[verdict],
        'risk_level': risk,
        'confidence': round(confidence, 3),
        'conclusion': str(data.get('conclusion', '')),
        'evidence': norm_evidence,
        'analysis_steps': [str(s) for s in steps][:10],
        'suggested_action': str(data.get('suggested_action', '')),
        'attack_type': str(data.get('attack_type', '')),
        'is_ai': True,
        'analyzed_at': datetime.utcnow().isoformat(),
    }


def _rule_based_judgment(alert):
    """确定性规则兜底（非 mock）：基于 severity/status 给出结构化研判。"""
    sev = (alert.severity or 'medium').lower()
    is_critical = sev in ('critical', 'high')
    verdict = 'true_attack' if is_critical else 'suspicious'
    risk = sev if sev in RISK_LEVELS else 'medium'
    return {
        'verdict': verdict,
        'verdict_label': VERDICT_MAP[verdict],
        'risk_level': risk,
        'confidence': 0.55,
        'conclusion': f'规则兜底研判：告警严重级别为 {sev}，暂未接入大模型，按级别给出初步研判。建议人工复核。',
        'evidence': [{
            'source': '规则引擎',
            'confidence': 0.55,
            'detail': f'severity={sev}，status={alert.status or "new"}',
        }],
        'analysis_steps': ['提取告警严重级别', '匹配规则阈值', '输出初步研判'],
        'suggested_action': 'block_ip' if is_critical else 'review',
        'attack_type': alert.category or 'unknown',
        'is_ai': False,
        'analyzed_at': datetime.utcnow().isoformat(),
    }


def _retrieve_ste_experiences(category, attack_type, limit=5):
    """召回相似经验，按权重降序。"""
    if not category and not attack_type:
        return []
    query = STEExperience.query
    if category:
        query = query.filter(STEExperience.category == category)
    elif attack_type:
        query = query.filter(STEExperience.attack_type == attack_type)
    exps = query.order_by(db.desc(STEExperience.usefulness_score),
                          db.desc(STEExperience.correct_count)).limit(limit).all()
    # 命中计数 +1（经验被使用）
    for e in exps:
        e.hit_count = (e.hit_count or 0) + 1
    if exps:
        db.session.commit()
    return exps


_FALLBACK_JUDGMENT_SYSTEM = (
    "你是一名资深安全运营(SOC)研判分析师。请根据告警信息与历史研判经验，"
    "输出【严格 JSON】结构化研判结论，不要输出多余说明。JSON 字段：\n"
    "{\n"
    '  "verdict": "true_attack|false_positive|suspicious|info",\n'
    '  "risk_level": "critical|high|medium|low",\n'
    '  "confidence": 0.0-1.0 的置信度,\n'
    '  "conclusion": "一句话结论",\n'
    '  "evidence": [{"source":"证据来源","confidence":0.0-1.0,"detail":"证据细节"}],\n'
    '  "analysis_steps": ["分析步骤1","分析步骤2"],\n'
    '  "suggested_action": "处置建议",\n'
    '  "attack_type": "攻击类型/规则名"\n'
    "}\n"
    "verdict 必须且只能是四项之一（互斥）。evidence 至少 2 条，每条带来源与置信度。"
)
_FALLBACK_JUDGMENT_USER = (
    "告警编号: {{alert_code}}\n"
    "标题: {{title}}\n"
    "描述: {{description}}\n"
    "严重级别: {{severity}}\n"
    "分类: {{category}}\n"
    "源IP: {{src_ip}}  目的IP: {{dst_ip}}\n"
    "主机: {{hostname}}\n"
    "来源产品: {{source_product}}\n"
    "原始日志: {{raw_log}}\n"
    "{{experiences}}"
)


def _build_judgment_messages(alert, experiences):
    """构建研判消息。

    提示词优先取 AI 中心「提示词管理」中 alert_analysis 的默认项（支持 {{变量}} 渲染），
    渲染异常或为空时回退内置文本；若所选模板未引用 {{experiences}}，则自动追加历史经验块。
    """
    exp_text = ""
    if experiences:
        lines = []
        for i, e in enumerate(experiences, 1):
            lines.append(
                f"{i}. [category={e.category}][verdict={VERDICT_MAP.get(e.verdict, e.verdict)}]"
                f" {e.conclusion or ''}（处置：{e.suggested_action or ''}）"
            )
        exp_text = "\n\n【历史相似研判经验（仅供参考，需独立判断）】:\n" + "\n".join(lines)

    ctx = {
        'alert_code': alert.alert_code or '',
        'title': alert.title or '',
        'description': alert.description or '',
        'severity': alert.severity or '',
        'category': alert.category or '未知',
        'src_ip': alert.src_ip or '',
        'dst_ip': alert.dst_ip or '',
        'hostname': alert.hostname or '',
        'source_product': alert.source_product or '',
        'raw_log': (alert.raw_log or '')[:2000],
        'experiences': exp_text,
    }

    system_tmpl = _FALLBACK_JUDGMENT_SYSTEM
    user_tmpl = _FALLBACK_JUDGMENT_USER
    try:
        from app.utils.ai_prompts import resolve_prompt, render_prompt, template_vars
        p = resolve_prompt('alert_analysis')
        if p:
            system_tmpl = (p.get('system_prompt') or '').strip() or system_tmpl
            user_tmpl = (p.get('user_prompt') or '').strip() or user_tmpl
        system = render_prompt(system_tmpl, ctx) or system_tmpl
        user = render_prompt(user_tmpl, ctx)
        if exp_text and 'experiences' not in template_vars(user_tmpl):
            user = user + exp_text
    except Exception as e:
        logger.warning(f"研判提示词渲染失败，回退内置提示词: {e}")
        system = _FALLBACK_JUDGMENT_SYSTEM
        user = (
            f"告警编号: {ctx['alert_code']}\n标题: {ctx['title']}\n描述: {ctx['description']}\n"
            f"严重级别: {ctx['severity']}\n分类: {ctx['category']}\n"
            f"源IP: {ctx['src_ip']}  目的IP: {ctx['dst_ip']}\n主机: {ctx['hostname']}\n"
            f"来源产品: {ctx['source_product']}\n原始日志: {ctx['raw_log']}\n{exp_text}"
        )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


_FALLBACK_EVENT_SYSTEM = (
    "你是一名资深安全运营(SOC)事件处置分析师。请根据安全事件及其关联告警，"
    "输出【严格 JSON】结构化研判结论，不要输出多余说明。JSON 字段：\n"
    "{\n"
    '  "verdict": "true_attack|false_positive|suspicious|info",\n'
    '  "risk_level": "critical|high|medium|low",\n'
    '  "confidence": 0.0-1.0 的置信度,\n'
    '  "conclusion": "一句话事件性质结论",\n'
    '  "evidence": [{"source":"证据来源","confidence":0.0-1.0,"detail":"证据细节"}],\n'
    '  "analysis_steps": ["分析步骤1","分析步骤2"],\n'
    '  "attack_type": "攻击类型/攻击链阶段",\n'
    '  "impact": "潜在影响面（资产/数据/业务）",\n'
    '  "suggested_action": "建议的处置动作（隔离/封禁/取证/升级/忽略）"\n'
    "}\n"
    "verdict 必须且只能是四项之一（互斥）。evidence 至少 2 条，"
    "不得编造未在输入中出现的事实；信息不足时如实降低 confidence。"
)


def build_event_judgment_messages(event, experiences=None, related_alerts=None):
    """构建事件研判消息（工作台事件处置用）。

    事件语义与告警不同（一条事件往往聚合多条告警），因此单独走 `event_analysis` 职责的
    提示词；同样支持 {{变量}} 渲染与历史经验自动追加。
    """
    related_alerts = related_alerts or []
    alert_count = len(related_alerts)
    lines = []
    for i, a in enumerate(related_alerts[:20], 1):
        if isinstance(a, dict):
            code = a.get('alert_code') or a.get('id') or ''
            title = a.get('title') or ''
            sev = a.get('severity') or ''
            src = a.get('src_ip') or ''
            lines.append(f"{i}. [{code}] [{sev}] {title}  src={src}")
        else:
            lines.append(f"{i}. {a}")
    related_text = "\n".join(lines) if lines else "（无关联告警记录）"

    exp_text = ""
    for e in (experiences or []):
        exp_text += (
            f"\n- [category={e.category}][verdict={VERDICT_MAP.get(e.verdict, e.verdict)}]"
            f" {e.conclusion or ''}（处置：{e.suggested_action or ''}）"
        )
    if exp_text:
        exp_text = "\n\n【历史相似研判经验（仅供参考，需独立判断）】" + exp_text

    ctx = {
        'event_code': getattr(event, 'event_code', '') or str(getattr(event, 'id', '')),
        'title': getattr(event, 'title', '') or '',
        'description': getattr(event, 'description', '') or '',
        'severity': getattr(event, 'severity', '') or '',
        'category': getattr(event, 'category', '') or '未知',
        'source': getattr(event, 'source', '') or '',
        'alert_count': alert_count,
        'related_alerts': related_text,
        'raw_log': (getattr(event, 'raw_log', '') or '')[:2000],
        'experiences': exp_text,
    }

    system_tmpl = _FALLBACK_EVENT_SYSTEM
    user_tmpl = (
        "事件编号: {{event_code}}\n标题: {{title}}\n描述: {{description}}\n"
        "严重级别: {{severity}}\n事件分类: {{category}}\n事件来源: {{source}}\n"
        "关联告警数: {{alert_count}}\n关联告警:\n{{related_alerts}}\n"
        "原始日志: {{raw_log}}\n{{experiences}}"
    )
    try:
        from app.utils.ai_prompts import resolve_prompt, render_prompt, template_vars
        p = resolve_prompt('event_analysis')
        if p:
            system_tmpl = (p.get('system_prompt') or '').strip() or system_tmpl
            user_tmpl = (p.get('user_prompt') or '').strip() or user_tmpl
        system = render_prompt(system_tmpl, ctx) or system_tmpl
        user = render_prompt(user_tmpl, ctx)
        if exp_text and 'experiences' not in template_vars(user_tmpl):
            user = user + exp_text
    except Exception as e:
        logger.warning(f"事件研判提示词渲染失败，回退内置提示词: {e}")
        system = _FALLBACK_EVENT_SYSTEM
        user = (
            f"事件编号: {ctx['event_code']}\n标题: {ctx['title']}\n描述: {ctx['description']}\n"
            f"严重级别: {ctx['severity']}\n事件分类: {ctx['category']}\n来源: {ctx['source']}\n"
            f"关联告警数: {alert_count}\n关联告警:\n{related_text}\n"
            f"原始日志: {ctx['raw_log']}\n{exp_text}"
        )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def run_event_judgment(event, related_alerts=None):
    """执行一次事件研判（LLM，失败回退确定性规则）。返回结构化结果 dict。"""
    related_alerts = related_alerts or (event.extra_data or {}).get('related_alerts', []) or []
    category = getattr(event, 'category', None) or ''
    experiences = _retrieve_ste_experiences(category, category)
    messages = build_event_judgment_messages(event, experiences, related_alerts)
    content = _call_llm(messages)
    result = _parse_judgment(content) if content else None
    if result is None:
        result = _rule_based_judgment(event)
    # 事件比单条告警多了「影响面」维度，规则兜底时补一个保守值
    result.setdefault('impact', '')
    result['related_alert_count'] = len(related_alerts)
    result['ste_used'] = [
        {'id': e.id, 'verdict': e.verdict, 'usefulness_score': e.usefulness_score}
        for e in experiences
    ]
    return result


# =============================================
# 批量结构化研判 + 自动闭环（AI 中心「告警监控」统一实现）
#
# 告警唯一真相源 = ES（alerts-valid）。批量研判链路：
#   选取未闭环告警 → STE 经验召回 + 提示词管理渲染
#   → LLM 结构化研判（失败回退规则）→ 结论写 extra_data.structured_analysis
#   → 按结论闭环：误报→false_positive；真实攻击且高危→创建事件并 closed；
#     其余（可疑/低危）保留原状态，留待人工处置。
# 白名单/误报拦截在数据采集分流阶段完成（pipeline dispatch：过滤规则→白名单→去重），
# 研判链路只处理已进入 alerts-valid 的告警，不再重复做白名单匹配。
# 单条研判（/analyze）与批量研判（/analyze-batch、告警监控定时任务）共用同一核心，
# 不再存在第二套「批量分析」实现。
# =============================================

# 未闭环状态：待处置/调查中的告警才参与自动研判；人工已处置（acknowledged/
# resolved/closed/false_positive）不再自动打扰，避免覆盖人工结论。
UNCLOSED_STATUSES = ('new', 'open', 'active', 'investigating')
# 真实攻击且风险级达到 high/critical 才自动创建事件
HIGH_RISK_LEVELS = ('high', 'critical')


def _select_unclosed_alerts(limit: int = 20) -> list:
    """从 ES alerts-valid 选取待研判告警（按 first_seen 倒序）：
    - 状态属于未闭环集合（无 status 字段的新入库告警同样命中）
    - 尚无结构化研判结论（extra_data.structured_analysis）
    - 尚未被事件关联（event_ids 为空）：已转事件的告警随事件生命周期联动
      （event_alert_link），不再重复自动研判
    """
    query = {'bool': {
        'should': [
            {'terms': {'status': list(UNCLOSED_STATUSES)}},
            {'bool': {'must_not': [{'exists': {'field': 'status'}}]}},
        ],
        'minimum_should_match': 1,
        'must_not': [
            {'exists': {'field': 'extra_data.structured_analysis'}},
            {'exists': {'field': 'event_ids'}},
        ],
    }}
    res = es_alerts.search_hits(es_alerts.INDEX_VALID, query, size=limit,
                                sort_field='first_seen', sort_order='desc')
    return [es_alerts.ESAlertRef(doc, doc.get('_index')) for doc in res.get('items', [])]


def judge_alert(alert) -> dict:
    """对单条告警执行结构化研判（STE 经验召回 → LLM → 规则兜底），不写库。

    alert 为 ESAlertRef（或具备同名字段访问的对象）。返回结构化研判 dict，
    附带 ste_used（本次召回的经验）。
    """
    experiences = _retrieve_ste_experiences(alert.category, alert.category)
    messages = _build_judgment_messages(alert, experiences)
    content = _call_llm(messages)
    result = _parse_judgment(content) if content else None
    if result is None:
        result = _rule_based_judgment(alert)
    result['ste_used'] = [
        {'id': e.id, 'verdict': e.verdict, 'usefulness_score': e.usefulness_score}
        for e in experiences
    ]
    return result


def _create_event_from_judgment(alert, judgment: dict) -> str:
    """按研判结论创建安全事件（PG events + 处置记录），返回事件编号。"""
    from app.database import db
    from app.models import Event
    from app.routes.events_api import generate_event_code, create_action_record

    ec = generate_event_code()

    # 告警富化：关联告警列表 / 统计摘要 / 主责源 IP / 自动描述（与人工聚合同一口径）
    alert_doc = (alert.to_dict() if hasattr(alert, 'to_dict') else None) or {}
    content = event_enrichment.build_event_content(
        {str(alert.id): alert_doc},
        origin='AI 批量研判',
        user_description=(f"研判结论：{judgment.get('conclusion', '')}\n"
                          f"处置建议：{judgment.get('suggested_action', '') or '人工复核'}"))

    evidence = judgment.get('evidence') or []
    evidence_text = '；'.join(
        f"[{e.get('source', '证据')}] {e.get('detail', '')}" for e in evidence[:3])
    description = content['description']
    if evidence_text:
        description += f"\n证据链：{evidence_text}"

    event = Event(
        event_code=ec,
        title=f"[AI研判] {judgment.get('attack_type') or alert.category or '安全告警'}"
              f" - {alert.src_ip or content['src_ip'] or ''}".rstrip(' -'),
        description=description,
        severity=judgment.get('risk_level', 'medium'),
        category=judgment.get('attack_type') or alert.category or '其他',
        source='ai_batch_judgment', status='new',
        src_ip=content['src_ip'] or None,
        extra_data={'source_alert': alert.id,
                    'alert_ids': [alert.id],
                    'related_alerts': content['related_alerts'],
                    'summary': content['summary'],
                    'ai_analysis': judgment},
        raw_log=alert.raw_log or '',
    )
    db.session.add(event)
    db.session.flush()
    create_action_record(ec, 'created', None, 'AI研判',
                         f'AI 从告警 {alert.id} 创建事件',
                         previous_status='new',
                         extra_data={'source': 'ai_batch_judgment'})
    db.session.commit()
    logger.info(f"创建事件: {ec} <- 告警 {alert.id}")
    return ec


def run_batch_judgment(limit: int = 20, create_events: bool = True) -> dict:
    """批量结构化研判 + 自动闭环（ES 为告警唯一真相源）。

    返回 {success, analyzed, events_created, false_positives, high_risk,
          items, message}；items 为逐条结论摘要（alert_id/verdict/risk_level/event_id）。
    """
    try:
        alerts = _select_unclosed_alerts(limit)
        if not alerts:
            return {'success': True, 'analyzed': 0, 'events_created': 0,
                    'false_positives': 0, 'high_risk': 0, 'items': [],
                    'message': '无待研判的未闭环告警'}

        items, events_created, false_positives, high_risk = [], 0, 0, 0
        for alert in alerts:
            try:
                judgment = judge_alert(alert)
            except Exception as e:
                logger.error(f"研判失败: {alert.id} - {e}")
                continue

            verdict = judgment.get('verdict')
            risk = judgment.get('risk_level', 'medium')

            extra = dict(alert.extra_data or {})
            extra['structured_analysis'] = judgment
            alert.extra_data = extra
            es_alerts.save_alert(alert)

            item = {'alert_id': alert.id, 'alert_code': alert.alert_code,
                    'title': alert.title, 'verdict': verdict,
                    'verdict_label': judgment.get('verdict_label'),
                    'risk_level': risk, 'is_ai': judgment.get('is_ai', False)}
            if verdict == 'false_positive':
                es_alerts.set_status(alert.id, 'false_positive')
                false_positives += 1
                item['closed'] = 'false_positive'
            elif verdict == 'true_attack' and risk in HIGH_RISK_LEVELS and create_events:
                try:
                    event_id = _create_event_from_judgment(alert, judgment)
                except Exception as e:
                    logger.error(f"创建事件失败: {alert.id} - {e}")
                    event_id = ''
                if event_id:
                    es_alerts.set_status(alert.id, 'closed')
                    # 统一联动：event_ids 回写（防止该告警再被其它链路重复分析）
                    try:
                        from app.utils import event_alert_link
                        event_alert_link.link_alerts_to_event(
                            [alert.id], event_id, 'closed')
                    except Exception:
                        pass
                    es_alerts.merge_extra(alert.id, {'incident_id': event_id,
                                                     'ai_verdict': 'true_attack'})
                    events_created += 1
                    high_risk += 1
                    item['event_id'] = event_id
                    item['closed'] = 'closed'
            items.append(item)

        return {
            'success': True, 'analyzed': len(items),
            'events_created': events_created, 'false_positives': false_positives,
            'high_risk': high_risk, 'items': items,
            'message': f"研判 {len(items)} 条, 创建事件 {events_created} 个, "
                       f"误报 {false_positives} 条",
        }
    except Exception as e:
        logger.error(f"批量研判失败: {e}")
        return {'success': False, 'error': str(e)}


# =============================================
# 结构化研判
# =============================================

@ai_judgment_bp.route('/analyze', methods=['POST'])
@login_required
def analyze_alert():
    """对单条告警执行结构化研判，结果写入告警文档 extra_data.structured_analysis（ES）。"""
    data = request.get_json() or {}
    alert_id = data.get('alert_id')
    if not alert_id:
        return jsonify({'success': False, 'error': '缺少 alert_id'}), 400
    alert = es_alerts.load_alert(alert_id)
    if not alert:
        return jsonify({'success': False, 'error': '告警不存在'}), 404

    result = judge_alert(alert)

    extra = dict(alert.extra_data or {})
    extra['structured_analysis'] = result
    alert.extra_data = extra
    if not es_alerts.save_alert(alert):
        return jsonify({'success': False, 'error': '研判结果写入 ES 失败'}), 500

    return jsonify({'success': True, 'data': result,
                    'ste_used': len(result.get('ste_used', []))})


@ai_judgment_bp.route('/analyze-batch', methods=['POST'])
@login_required
def analyze_batch():
    """批量结构化研判未闭环告警（ES valid 索引）并自动闭环：
    误报→false_positive，真实攻击且高危→创建事件并 closed，其余保留待处置。"""
    data = request.get_json() or {}
    limit = int(data.get('limit', 20))
    result = run_batch_judgment(limit=limit)
    return jsonify({
        'success': result.get('success', False),
        'error': result.get('error'),
        'data': {
            'analyzed': result.get('analyzed', 0),
            'events_created': result.get('events_created', 0),
            'false_positives': result.get('false_positives', 0),
            'high_risk': result.get('high_risk', 0),
            'items': result.get('items', []),
            'message': result.get('message', ''),
        },
    })


# =============================================
# STE 经验库
# =============================================

@ai_judgment_bp.route('/ste', methods=['GET'])
@login_required
def list_ste():
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 20, type=int)
    category = request.args.get('category')
    verdict = request.args.get('verdict')
    sort = request.args.get('sort', 'usefulness')

    q = STEExperience.query
    if category:
        q = q.filter(STEExperience.category == category)
    if verdict:
        q = q.filter(STEExperience.verdict == verdict)
    if sort == 'usefulness':
        q = q.order_by(db.desc(STEExperience.usefulness_score))
    elif sort == 'recent':
        q = q.order_by(db.desc(STEExperience.created_at))
    else:
        q = q.order_by(db.desc(STEExperience.usefulness_score))

    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()
    return jsonify({
        'success': True,
        'data': {
            'items': [e.to_dict() for e in items],
            'total': total, 'page': page, 'page_size': page_size,
        }
    })


@ai_judgment_bp.route('/ste', methods=['POST'])
@login_required
def create_ste():
    data = request.get_json() or {}
    verdict = str(data.get('verdict', 'suspicious')).lower()
    if verdict not in VERDICT_MAP:
        return jsonify({'success': False, 'error': 'verdict 不合法'}), 400
    exp = STEExperience(
        category=data.get('category', '未知'),
        attack_type=data.get('attack_type', ''),
        signature=data.get('signature', ''),
        verdict=verdict,
        verdict_label=VERDICT_MAP[verdict],
        risk_level=str(data.get('risk_level', 'medium')).lower(),
        conclusion=data.get('conclusion', ''),
        evidence_summary=data.get('evidence_summary', ''),
        suggested_action=data.get('suggested_action', ''),
        source_alert_code=data.get('source_alert_code'),
        usefulness_score=float(data.get('usefulness_score', 0.5)),
    )
    db.session.add(exp)
    db.session.commit()
    return jsonify({'success': True, 'data': exp.to_dict()}), 201


@ai_judgment_bp.route('/ste/<int:exp_id>/feedback', methods=['POST'])
@login_required
def ste_feedback(exp_id):
    exp = STEExperience.query.get(exp_id)
    if not exp:
        return jsonify({'success': False, 'error': '经验不存在'}), 404
    data = request.get_json() or {}
    fb = data.get('feedback')
    hit = exp.hit_count or 0
    correct = exp.correct_count or 0
    score = exp.usefulness_score or 0.5

    if fb == 'correct':
        hit += 1; correct += 1
    elif fb == 'wrong':
        hit += 1
    elif fb == 'useful':
        score = min(1.0, score + 0.1)
    elif fb == 'useless':
        score = max(0.0, score - 0.1)
    else:
        return jsonify({'success': False, 'error': 'feedback 不合法'}), 400

    exp.hit_count = hit
    exp.correct_count = correct
    if fb in ('correct', 'wrong'):
        exp.usefulness_score = round(correct / hit, 3) if hit > 0 else 0.0
    else:
        exp.usefulness_score = round(score, 3)
    db.session.commit()
    return jsonify({'success': True, 'data': exp.to_dict()})


@ai_judgment_bp.route('/ste/auto-extract', methods=['POST'])
@login_required
def auto_extract_ste():
    """从已闭环告警（误报/真实攻击）自动提取 STE 经验。可传 alert_id 单条，或 scan=1 扫描。"""
    data = request.get_json() or {}
    alert_id = data.get('alert_id')
    scan = data.get('scan', False)

    if alert_id:
        alert = es_alerts.load_alert(alert_id)
        if not alert:
            return jsonify({'success': False, 'error': '告警不存在'}), 404
        alerts = [alert]
    elif scan:
        res = es_alerts.search_alerts(
            filters={'status': ['false_positive', 'closed']}, page=1,
            page_size=int(data.get('limit', 200)), sort_field='first_seen',
            sort_order='desc')
        alerts = [es_alerts.ESAlertRef(doc, doc.get('_index')) for doc in res['items']
                  if (doc.get('extra_data') or {})]
    else:
        return jsonify({'success': False, 'error': '需提供 alert_id 或 scan=1'}), 400

    extracted = 0
    for alert in alerts:
        extra = alert.extra_data or {}
        analysis = extra.get('structured_analysis') or {}
        # 优先使用已落库的结构化研判；否则使用告警最终状态推导
        if analysis.get('verdict'):
            verdict = analysis['verdict']
            risk = analysis.get('risk_level', 'medium')
            conclusion = analysis.get('conclusion', '')
            action = analysis.get('suggested_action', '')
            attack_type = analysis.get('attack_type', alert.category or '')
        else:
            if alert.status == 'false_positive':
                verdict, risk = 'false_positive', 'low'
            else:
                verdict, risk = 'true_attack', (alert.severity or 'medium')
            conclusion = f'闭环结论：{alert.status}'
            action = 'review'
            attack_type = alert.category or 'unknown'

        if verdict not in VERDICT_MAP:
            continue

        signature = (alert.category or '') + '|' + (attack_type or '')
        # 去重：同一 signature + verdict 已存在则更新计数与结论
        exist = STEExperience.query.filter_by(
            category=alert.category or '未知', verdict=verdict,
            attack_type=attack_type or ''
        ).first()
        if exist:
            exist.signature = signature
            exist.conclusion = conclusion or exist.conclusion
            exist.suggested_action = action or exist.suggested_action
            exist.risk_level = risk
            exist.updated_at = datetime.utcnow()
        else:
            exp = STEExperience(
                category=alert.category or '未知',
                attack_type=attack_type or '',
                signature=signature,
                verdict=verdict,
                verdict_label=VERDICT_MAP[verdict],
                risk_level=risk,
                conclusion=conclusion,
                suggested_action=action,
                source_alert_code=alert.alert_code,
                usefulness_score=0.6,
            )
            db.session.add(exp)
        extracted += 1

    db.session.commit()
    return jsonify({'success': True, 'data': {'extracted': extracted}})
