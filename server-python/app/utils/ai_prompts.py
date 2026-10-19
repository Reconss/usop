"""提示词解析工具（AI 中心「提示词管理」的运行时出口）。

用法：
    from app.utils.ai_prompts import resolve_prompt, render_prompt, seed_prompts

    p = resolve_prompt('alert_analysis')          # 取该职责的默认（或第一条启用的）提示词
    system = p['system_prompt']
    user = render_prompt(p['user_prompt'], {'alert_code': 'ALT-xxx', ...})

若数据库里没有该职责的提示词，resolve_prompt 会返回内置默认（与 BUILTIN_PROMPTS 同源），
保证功能在「还没人在界面上配提示词」时也能正常工作。
"""
import logging
import re

from app.database import db

logger = logging.getLogger(__name__)

_VAR_RE = re.compile(r'\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}')


def render_prompt(template, variables):
    """把 {{var}} 替换为实际值；未提供的变量替换为空串（避免把占位符发给模型）。"""
    if not template:
        return ''
    variables = variables or {}

    def _sub(m):
        key = m.group(1)
        val = variables.get(key)
        return '' if val is None else str(val)

    return _VAR_RE.sub(_sub, template)


def template_vars(template):
    """列出模板里引用到的变量名。"""
    return sorted(set(_VAR_RE.findall(template or '')))


def resolve_prompt(prompt_key, name=None):
    """取提示词：指定 name 优先，否则 is_default，再否则第一条启用的；都没有则用内置默认。"""
    try:
        from app.models.ai_prompt import AIPrompt, BUILTIN_PROMPTS, PROMPT_VARIABLES
    except Exception as e:  # 模型尚未注册（极少见）
        logger.warning('AIPrompt 模型不可用，使用内置提示词：%s', e)
        return None

    row = None
    if name:
        row = AIPrompt.query.filter_by(prompt_key=prompt_key, name=name).first()
    if row is None:
        row = (AIPrompt.query
               .filter_by(prompt_key=prompt_key, is_default=True, enabled=True)
               .first())
    if row is None:
        row = AIPrompt.query.filter_by(prompt_key=prompt_key, enabled=True).first()
    if row is not None:
        return row.to_dict()

    for item in BUILTIN_PROMPTS:
        if item['prompt_key'] == prompt_key:
            return {
                'id': None,
                'name': item['name'],
                'prompt_key': prompt_key,
                'category': item.get('category', ''),
                'description': item.get('description', ''),
                'system_prompt': item['system_prompt'],
                'user_prompt': item['user_prompt'],
                'variables': PROMPT_VARIABLES.get(prompt_key, []),
                'output_schema': {},
                'enabled': True,
                'is_default': True,
                'builtin': True,
            }
    return None


def seed_prompts(force=False):
    """播种内置提示词（幂等）。返回新增条数。"""
    try:
        from app.models.ai_prompt import AIPrompt, BUILTIN_PROMPTS
    except Exception as e:
        logger.warning('播种提示词失败（模型不可用）：%s', e)
        return 0

    created = 0
    for item in BUILTIN_PROMPTS:
        exists = AIPrompt.query.filter_by(
            prompt_key=item['prompt_key'], name=item['name']).first()
        if exists and not force:
            continue
        if exists:
            continue
        # 该职责下若已存在用户自建的默认项，尊重用户，不抢占 is_default
        has_default = AIPrompt.query.filter_by(
            prompt_key=item['prompt_key'], is_default=True).count() > 0
        row = AIPrompt(
            name=item['name'],
            prompt_key=item['prompt_key'],
            category=item.get('category', ''),
            description=item.get('description', ''),
            system_prompt=item['system_prompt'],
            user_prompt=item['user_prompt'],
            is_default=bool(item.get('is_default')) and not has_default,
            builtin=True,
            enabled=True,
        )
        db.session.add(row)
        created += 1
    if created:
        db.session.commit()
        logger.info('已播种 %d 条内置提示词', created)
    return created
