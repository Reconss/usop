"""AI 提示词注册表（移植自 EFF-Monitoring 的 AI 中心「提示词管理」）。

用途：把原先硬编码在各处的提示词收敛成**可管理、可切换默认、可在运行时引用变量**的资源，
供告警研判、经验提取、对话助手等场景统一取用。

约定：
  prompt_key  决定提示词属于哪个「职责」，同一 key 下可有多条候选，其中一条为 is_default
  builtin     内置预置（可编辑，但删除后会被重新播种）
  variables   [{name, desc}]，仅用于前端给出可用变量提示
"""
from datetime import datetime

from app.database import db

# 提示词职责目录（与前端 promptKeyOptions 对应）
PROMPT_KEYS = {
    'alert_analysis': '告警研判',
    'event_analysis': '事件研判',
    'daily_report': '每日威胁运营日报',
    'ste_extract': 'STE 经验提取',
    'chat': '对话助手',
    'evidence_extract': '证据提取',
    'template_generate': '模板生成',
    'regex_generate': '正则生成',
}

# 每条提示词可引用的运行时变量（前端展示用）
PROMPT_VARIABLES = {
    'alert_analysis': [
        {'name': 'alert_code', 'desc': '告警编号'},
        {'name': 'title', 'desc': '告警标题'},
        {'name': 'description', 'desc': '告警描述'},
        {'name': 'severity', 'desc': '严重级别'},
        {'name': 'category', 'desc': '告警分类'},
        {'name': 'src_ip', 'desc': '源 IP'},
        {'name': 'dst_ip', 'desc': '目的 IP'},
        {'name': 'hostname', 'desc': '主机名'},
        {'name': 'source_product', 'desc': '来源产品'},
        {'name': 'raw_log', 'desc': '原始日志（截断 2000 字）'},
        {'name': 'experiences', 'desc': '按分类召回的历史研判经验（若模板未引用则自动追加）'},
    ],
    'event_analysis': [
        {'name': 'event_code', 'desc': '事件编号'},
        {'name': 'title', 'desc': '事件标题'},
        {'name': 'description', 'desc': '事件描述'},
        {'name': 'severity', 'desc': '严重级别'},
        {'name': 'category', 'desc': '事件分类'},
        {'name': 'source', 'desc': '事件来源（如 flink-correlation / ai-pipeline）'},
        {'name': 'related_alerts', 'desc': '关联告警摘要（编号/标题/级别/源IP，最多 20 条）'},
        {'name': 'alert_count', 'desc': '关联告警数量'},
        {'name': 'raw_log', 'desc': '原始日志（截断 2000 字）'},
        {'name': 'experiences', 'desc': '按分类召回的历史研判经验（若模板未引用则自动追加）'},
    ],
    'ste_extract': [
        {'name': 'alert_code', 'desc': '告警编号'},
        {'name': 'title', 'desc': '告警标题'},
        {'name': 'category', 'desc': '告警分类'},
        {'name': 'verdict', 'desc': '人工研判结论'},
        {'name': 'raw_log', 'desc': '原始日志'},
    ],
    'daily_report': [
        {'name': 'report_date', 'desc': '报告日期（YYYY-MM-DD）'},
        {'name': 'events_summary', 'desc': '当日事件清单摘要（JSON 数组字符串）'},
        {'name': 'alert_summary', 'desc': '当日告警统计摘要（JSON 字符串）'},
    ],
    'chat': [
        {'name': 'question', 'desc': '用户问题'},
        {'name': 'context', 'desc': '检索到的上下文'},
    ],
    'evidence_extract': [
        {'name': 'raw_log', 'desc': '原始日志'},
        {'name': 'fields', 'desc': '待抽取字段列表'},
    ],
    'template_generate': [
        {'name': 'catalog', 'desc': '可用字段目录'},
        {'name': 'requirement', 'desc': '用户需求描述'},
    ],
    'regex_generate': [
        {'name': 'sample', 'desc': '样本日志'},
        {'name': 'requirement', 'desc': '用户需求描述'},
    ],
}

# 内置默认提示词（首次启动/数据库为空时播种；alert_analysis 即原硬编码研判提示词）
BUILTIN_PROMPTS = [
    {
        'prompt_key': 'alert_analysis',
        'name': '默认告警研判提示词',
        'category': '研判',
        'description': '结构化研判：互斥研判标签 + 风险等级 + 证据链 + 处置建议',
        'system_prompt': (
            '你是一名资深安全运营(SOC)研判分析师。请根据告警信息与历史研判经验，'
            '输出【严格 JSON】结构化研判结论，不要输出多余说明。JSON 字段：\n'
            '{\n'
            '  "verdict": "true_attack|false_positive|suspicious|info",\n'
            '  "risk_level": "critical|high|medium|low",\n'
            '  "confidence": 0.0-1.0 的置信度,\n'
            '  "conclusion": "一句话结论",\n'
            '  "evidence": [{"source":"证据来源","confidence":0.0-1.0,"detail":"证据细节"}],\n'
            '  "analysis_steps": ["分析步骤1","分析步骤2"],\n'
            '  "suggested_action": "处置建议",\n'
            '  "attack_type": "攻击类型/规则名"\n'
            '}\n'
            'verdict 必须且只能是四项之一（互斥）。evidence 至少 2 条，每条带来源与置信度。'
        ),
        'user_prompt': (
            '告警编号: {{alert_code}}\n'
            '标题: {{title}}\n'
            '描述: {{description}}\n'
            '严重级别: {{severity}}\n'
            '分类: {{category}}\n'
            '源IP: {{src_ip}}  目的IP: {{dst_ip}}\n'
            '主机: {{hostname}}\n'
            '来源产品: {{source_product}}\n'
            '原始日志: {{raw_log}}\n'
            '{{experiences}}'
        ),
        'is_default': True,
    },
    {
        'prompt_key': 'event_analysis',
        'name': '默认事件研判提示词',
        'category': '研判',
        'description': '在事件工作台对安全事件做结构化研判：性质判定 + 风险等级 + 证据链 + 处置动作',
        'system_prompt': (
            '你是一名资深安全运营(SOC)事件处置分析师。请根据安全事件及其关联告警，'
            '输出【严格 JSON】结构化研判结论，不要输出多余说明。JSON 字段：\n'
            '{\n'
            '  "verdict": "true_attack|false_positive|suspicious|info",\n'
            '  "risk_level": "critical|high|medium|low",\n'
            '  "confidence": 0.0-1.0 的置信度,\n'
            '  "conclusion": "一句话事件性质结论",\n'
            '  "evidence": [{"source":"证据来源","confidence":0.0-1.0,"detail":"证据细节"}],\n'
            '  "analysis_steps": ["分析步骤1","分析步骤2"],\n'
            '  "attack_type": "攻击类型/攻击链阶段",\n'
            '  "impact": "潜在影响面（资产/数据/业务）",\n'
            '  "suggested_action": "建议的处置动作（隔离/封禁/取证/升级/忽略）"\n'
            '}\n'
            'verdict 必须且只能是四项之一（互斥）。evidence 至少 2 条且来自事件与关联告警，'
            '不得编造未在输入中出现的事实；信息不足时如实降低 confidence 并给出待补充的排查方向。'
        ),
        'user_prompt': (
            '事件编号: {{event_code}}\n'
            '标题: {{title}}\n'
            '描述: {{description}}\n'
            '严重级别: {{severity}}\n'
            '事件分类: {{category}}\n'
            '事件来源: {{source}}\n'
            '关联告警数: {{alert_count}}\n'
            '关联告警:\n{{related_alerts}}\n'
            '原始日志: {{raw_log}}\n'
            '{{experiences}}'
        ),
        'is_default': True,
    },
    {
        'prompt_key': 'daily_report',
        'name': '默认每日威胁运营日报提示词',
        'category': '报告',
        'description': '每日威胁运营日报：按固定模板把当日事件/告警汇总成可直发邮件的 Markdown 报告',
        'system_prompt': (
            '你是一名安全运营中心(SOC)值班报告撰写助手。请严格按照下面的固定模板输出【Markdown 格式】'
            '的每日威胁运营日报，不要输出模板以外的额外说明，不要编造未在输入数据中出现的事实；'
            '某类数据为空时在对应小节写「今日无相关记录」。\n'
            '\n'
            '【固定日报模板】\n'
            '# 每日威胁运营日报（{{report_date}}）\n'
            '\n'
            '## 一、今日概览\n'
            '- 新增事件：N 起（高危 X / 中危 Y / 低危 Z）\n'
            '- 当前未闭环事件：N 起\n'
            '- 值班关注等级：高/中/低（一句话理由）\n'
            '\n'
            '## 二、事件明细\n'
            '| 事件编号 | 标题 | 级别 | 状态 | 分类 | 摘要 |\n'
            '|---|---|---|---|---|---|\n'
            '（逐行列出，无则写「今日无相关记录」）\n'
            '\n'
            '## 三、威胁趋势与研判\n'
            '- 主要威胁类型（按事件/告警分类聚合，列 Top3）\n'
            '- 值得关注的新出现行为或 IP/域名\n'
            '- 与前日对比的变化点（若无可对比数据则注明）\n'
            '\n'
            '## 四、处置与建议\n'
            '- 已处置：…\n'
            '- 待处置：…（按优先级排序，给出建议动作：封禁/隔离/取证/继续观察）\n'
            '\n'
            '## 五、附注\n'
            '- 数据来源：USOP 平台事件库与告警索引\n'
            '- 本报告由剧本编排自动生成，结论供值班人员复核'
        ),
        'user_prompt': (
            '报告日期: {{report_date}}\n'
            '当日事件清单:\n{{events_summary}}\n'
            '当日告警统计:\n{{alert_summary}}\n'
            '请按固定模板输出今日日报。'
        ),
        'is_default': True,
    },
    {
        'prompt_key': 'ste_extract',
        'name': '默认 STE 经验提取提示词',
        'category': '经验沉淀',
        'description': '从已闭环告警中提取可复用的结构化研判经验',
        'system_prompt': (
            '你是安全运营经验沉淀助手。请从已闭环的告警与人工结论中提取【可复用的研判经验】，'
            '输出严格 JSON：\n'
            '{\n'
            '  "title": "经验标题（一句话，描述这类告警的判断要点）",\n'
            '  "tags": ["标签1","标签2"],\n'
            '  "signature": "关键信号摘要（命中该经验时通常能观察到什么）",\n'
            '  "conclusion": "研判结论",\n'
            '  "evidence_summary": "证据摘要",\n'
            '  "suggested_action": "处置建议",\n'
            '  "risk_level": "critical|high|medium|low"\n'
            '}\n'
            '只输出 JSON。'
        ),
        'user_prompt': (
            '告警编号: {{alert_code}}\n标题: {{title}}\n分类: {{category}}\n'
            '人工结论: {{verdict}}\n原始日志: {{raw_log}}\n'
        ),
        'is_default': True,
    },
    {
        'prompt_key': 'chat',
        'name': '默认对话助手提示词',
        'category': '对话',
        'description': '安全运营助手对话风格与格式约束',
        'system_prompt': (
            '你是 USOP 安全运营平台的 AI 助手。回答要简洁、结构化、可执行；'
            '涉及告警、资产、漏洞时优先给出判断依据与下一步动作；不确定时明确说明不确定性，禁止编造数据。'
        ),
        'user_prompt': '{{question}}',
        'is_default': True,
    },
]


class AIPrompt(db.Model):
    __tablename__ = 'ai_prompts'
    __table_args__ = (
        db.UniqueConstraint('prompt_key', 'name', name='uq_ai_prompt_key_name'),
    )

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(160), nullable=False)
    prompt_key = db.Column(db.String(60), nullable=False, index=True)
    category = db.Column(db.String(60), default='')
    description = db.Column(db.String(300))
    system_prompt = db.Column(db.Text, default='')
    user_prompt = db.Column(db.Text, default='')
    variables = db.Column(db.JSON, default=list)
    output_schema = db.Column(db.JSON, default=dict)
    enabled = db.Column(db.Boolean, default=True)
    is_default = db.Column(db.Boolean, default=False, index=True)
    builtin = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'prompt_key': self.prompt_key,
            'prompt_key_label': PROMPT_KEYS.get(self.prompt_key, self.prompt_key),
            'category': self.category or '',
            'description': self.description or '',
            'system_prompt': self.system_prompt or '',
            'user_prompt': self.user_prompt or '',
            'variables': self.variables or PROMPT_VARIABLES.get(self.prompt_key, []),
            'output_schema': self.output_schema or {},
            'enabled': bool(self.enabled),
            'is_default': bool(self.is_default),
            'builtin': bool(self.builtin),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
