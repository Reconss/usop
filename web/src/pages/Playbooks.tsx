import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Button, ContentContainer, PageHeader, StatCard, Switch, Modal, Segmented } from '../components/ui';
import { playbooksApi, integrationsApi, aiCenterApi } from '../services/api';
import PlaybookExecutions from './PlaybookExecutions';
import { useConfirmDialog, ConfirmDialog } from '../components/Dialogs';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Play, Edit2, Trash2, Copy, X, Save, Clock, Zap, GitBranch, AlertCircle, Mail,
  Shield, Ban, FileText, Globe, Server, Code, Settings, ChevronRight,
  ChevronDown, ChevronLeft, LayoutGrid, Download, Eye, EyeOff, Check, RefreshCw,
  ArrowRight, Minus, Info, Box, Cpu, Workflow,
  Search, RotateCcw, ExternalLink, Database,
  SlidersHorizontal, Braces, GitMerge, Scissors, Sigma, Filter,
  Sparkles, BookOpen, Wand2, Plug, Send, Siren
} from 'lucide-react';

// ==================== 集成应用类型（Shuffle / OpenAPI 导入）====================

interface AppParam {
  name: string; in: string; type: string; required: boolean; desc: string; default?: any;
}
interface AppAction {
  id: string; name: string; description: string; method: string; path: string;
  params: AppParam[]; body: any;
}
interface IntegrationApp {
  id: number; app_key: string; name: string; description: string; version: string;
  categories: string[]; base_url: string; auth_type: string; auth_config: any;
  has_credential: boolean; credential_masked: string; action_count: number;
  source: string; spec_format: string; enabled: boolean;
  created_at: string; updated_at: string; actions?: AppAction[];
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-primary/15 text-primary',
  POST: 'bg-success/15 text-success',
  PUT: 'bg-warning/15 text-warning',
  DELETE: 'bg-danger/15 text-danger',
  PATCH: 'bg-warning/15 text-warning',
};

// 剧本执行审批记录（playbook_approvals）
interface ApprovalRecord {
  id: number; playbook_id: number; approval_type: string; approval_level: number;
  status: 'pending' | 'approved' | 'rejected';
  requester_id: number; requester_name: string;
  params: Record<string, string>; reason: string; related_event_id: string;
  approver_id: number; approver_name: string; approved_at: string | null;
  result: Record<string, any> | null; created_at: string;
}

// ==================== 节点类型定义 ====================

interface NodeType {
  id: string;
  name: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  category: string;
  desc: string;
  fields: { name: string; label: string; type: 'text' | 'select' | 'textarea' | 'number' | 'conditions' | 'inputs'; placeholder?: string; options?: string[]; required?: boolean; dynamic?: string; showIf?: { field: string; values: string[] } }[];
}

const NODE_TYPES: NodeType[] = [
  { id: 'trigger', name: '触发器', icon: Zap, color: '#10B981', bg: '#10B98115', category: '基础', desc: '剧本执行入口',
    fields: [{ name: 'triggerType', label: '触发类型', type: 'select', options: ['告警事件', '定时任务', '手动触发', 'Webhook'], required: true }, { name: 'schedule', label: '执行周期（Cron）', type: 'text', placeholder: '0 8 * * * = 每天 08:00；仅定时任务生效' }, { name: 'inputs', label: '运行时入参', type: 'inputs' }] },
  { id: 'condition', name: '条件判断', icon: GitBranch, color: '#F59E0B', bg: '#F59E0B15', category: '控制', desc: 'IF/ELSE 分支',
    fields: [{ name: 'field', label: '字段', type: 'text', placeholder: 'severity 或 summary.threat_level（也支持 {{ }} 引用）' }, { name: 'operator', label: '运算符', type: 'select', options: ['等于', '不等于', '包含', '大于', '小于', '属于', '不属于'] }, { name: 'value', label: '值', type: 'text', placeholder: 'critical' }] },
  { id: 'script', name: '执行脚本', icon: Code, color: '#3B82F6', bg: '#3B82F615', category: '动作', desc: 'Python/Bash 脚本',
    fields: [{ name: 'language', label: '语言', type: 'select', options: ['Python', 'Bash'] }, { name: 'script', label: '脚本内容', type: 'textarea', placeholder: 'Python/Bash 脚本。上下文变量以环境变量注入：USOP_EVENT_<字段>（如 USOP_EVENT_SRC_IP）、USOP_PARAM_<字段>；stdout 会作为节点输出交给下游' }] },
  { id: 'action', name: '通用动作', icon: Settings, color: '#64748B', bg: '#64748B15', category: '动作', desc: '调用平台内置动作（封堵/隔离/工单/情报等，选动作后按参数表单配置）',
    fields: [
      { name: 'action', label: '动作', type: 'select', dynamic: 'actions', required: true },
      { name: 'params', label: '高级参数（JSON 或每行 key=value，支持 {{ 表达式 }}；一般用上方表单即可）', type: 'textarea', placeholder: '例：\nip = {{ $json.src_ip }}\nreason = 恶意攻击自动封堵\n或 JSON：{"ip": "{{ $json.src_ip }}", "duration": "24h"}' },
    ] },
  { id: 'api', name: 'API 调用', icon: Globe, color: '#EC4899', bg: '#EC489915', category: '集成', desc: 'HTTP REST 请求',
    fields: [{ name: 'method', label: '方法', type: 'select', options: ['GET', 'POST', 'PUT', 'DELETE'] }, { name: 'url', label: 'URL', type: 'text', placeholder: '{{ $json.url }} 或完整 URL' }, { name: 'body', label: '请求体', type: 'textarea', placeholder: 'JSON 文本，如 {"ip": "{{ $json.src_ip }}"}' }, { name: 'headers', label: '自定义 Headers', type: 'text', placeholder: '每行一条：Authorization: Bearer xxx' }] },
  { id: 'http_request', name: 'HTTP 请求', icon: Plug, color: '#EC4899', bg: '#EC489915', category: '集成', desc: '调用外部 API（可绑定集成应用动作）',
    fields: [
      { name: 'method', label: '方法', type: 'select', options: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
      { name: 'url', label: 'URL', type: 'text', placeholder: 'https://api.example.com/...（支持 {{ 表达式 }}）' },
      { name: 'headers', label: 'Headers', type: 'textarea', placeholder: '每行一条：名称: 值' },
      { name: 'query', label: 'Query 参数', type: 'textarea', placeholder: '每行一条：名称: 值' },
      { name: 'body', label: '请求体', type: 'textarea', placeholder: 'JSON，如 {"ip": "{{ $json.src_ip }}"}' },
      { name: 'timeout', label: '超时（秒）', type: 'number', placeholder: '15' },
    ] },
  { id: 'block', name: 'IP 封堵', icon: Ban, color: '#EF4444', bg: '#EF444415', category: '动作', desc: '封堵恶意 IP',
    fields: [{ name: 'ip', label: 'IP 地址', type: 'text', placeholder: '{{ $json.src_ip }}', required: true }, { name: 'duration', label: '封堵时长', type: 'text', placeholder: '24h（过期自动解除；留空长期有效）' }, { name: 'reason', label: '原因', type: 'text', placeholder: '恶意攻击封堵' }, { name: 'api_url', label: '防火墙 API', type: 'text', placeholder: 'https://fw.internal/api/block (留空用默认)' }, { name: 'api_token', label: 'API Token', type: 'text', placeholder: '' }] },
  { id: 'isolate', name: '主机隔离', icon: Shield, color: '#F97316', bg: '#F9731615', category: '动作', desc: '隔离受感染主机',
    fields: [{ name: 'hostname', label: '主机名', type: 'text', placeholder: '{{ $json.hostname }}', required: true }, { name: 'duration', label: '隔离时长', type: 'text', placeholder: '2h' }, { name: 'api_url', label: '隔离 API', type: 'text', placeholder: 'https://sdn.controller/isolate (留空用默认)' }] },
  { id: 'ticket', name: '创建工单', icon: FileText, color: '#06B6D4', bg: '#06B6D415', category: '动作', desc: '创建安全工单',
    fields: [{ name: 'title', label: '工单标题', type: 'text', placeholder: '安全事件处理工单', required: true }, { name: 'priority', label: '优先级', type: 'select', options: ['高', '中', '低'] }, { name: 'assignee', label: '指派人', type: 'text', placeholder: '安全运维' }, { name: 'system', label: '工单系统', type: 'select', options: ['内部系统', 'ServiceNow', 'Jira', '自定义'] }, { name: 'api_url', label: '系统 API', type: 'text', placeholder: 'https://itsm.internal/api/tickets' }] },
  { id: 'notify', name: '发送通知', icon: Mail, color: '#8B5CF6', bg: '#8B5CF615', category: '动作', desc: '多渠道消息通知（基础配置：全局配置→通知渠道）',
    fields: [
      { name: 'channel', label: '通知渠道', type: 'select', options: ['企业微信', '钉钉', '飞书', 'Slack', 'Webhook', '邮件'], required: true },
      { name: 'title', label: '标题', type: 'text', placeholder: '安全告警通知' },
      { name: 'content', label: '内容', type: 'textarea', placeholder: '告警详情...' },
      { name: 'webhook_url', label: 'Webhook URL（留空用全局配置→通知渠道 默认值）', type: 'text', placeholder: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx', showIf: { field: 'channel', values: ['企业微信', '钉钉', '飞书', 'Slack', 'Webhook'] } },
      { name: 'recipients', label: '收件人（留空用全局配置→通知渠道 默认收件人）', type: 'text', placeholder: '多个用逗号分隔；支持 {{ ... }}', showIf: { field: 'channel', values: ['邮件'] } },
    ] },
  { id: 'query', name: '数据查询', icon: Database, color: '#6366F1', bg: '#6366F115', category: '数据', desc: '查询安全数据',
    fields: [
      { name: 'source', label: '数据源', type: 'select', dynamic: 'querySources', options: ['告警表', '资产表', '漏洞表', '事件表'] },
      { name: 'conditions', label: '查询条件', type: 'conditions' },
      { name: 'query', label: '高级查询（lucene，可选）', type: 'text', placeholder: 'severity:critical AND NOT src_ip:10.*（与上方条件叠加）' },
      { name: 'hours', label: '时间窗口（小时）', type: 'number', placeholder: '24 = 当天；留空不限' },
      { name: 'limit', label: '返回条数', type: 'number', placeholder: '20' },
    ] },
  { id: 'enrich', name: '情报补全', icon: Search, color: '#0EA5E9', bg: '#0EA5E915', category: '分析', desc: '威胁情报查询',
    fields: [
      { name: 'provider', label: '情报源', type: 'select', options: ['微步在线', 'VirusTotal'], required: true },
      { name: 'type', label: '情报类型', type: 'select', options: ['IP情报', '域名情报', 'URL情报', '文件哈希'] },
      { name: 'value', label: '查询值', type: 'text', placeholder: '{{ $json.src_ip }}', required: true },
      { name: 'api_key', label: 'API Key（留空用「集成应用-微步在线」凭证）', type: 'text', placeholder: '微步/VirusTotal 密钥' },
    ] },
  // ---- 数据处理节点（对齐 n8n 数据流：items 在节点间流动，下游可引用上游输出）----
  { id: 'transform', name: '字段整形', icon: SlidersHorizontal, color: '#14B8A6', bg: '#14B8A615', category: '数据', desc: '重命名字段/派生新字段/裁剪负载',
    fields: [
      { name: 'assignments', label: '字段赋值', type: 'textarea', placeholder: '每行一条 name = 值\n例：\nrisk_label = {{ $json.severity }}\nblock_target = {{ $json.src_ip }}' },
      { name: 'keep_only', label: '只保留上述字段', type: 'select', options: ['否', '是'] },
      { name: 'remove_fields', label: '删除字段', type: 'text', placeholder: '逗号分隔，如：raw_data,debug' },
    ] },
  { id: 'code', name: '代码处理', icon: Braces, color: '#8B5CF6', bg: '#8B5CF615', category: '数据', desc: 'Python 片段处理整组数据项',
    fields: [
      { name: 'code', label: 'Python 代码', type: 'textarea', placeholder: '# 可用变量：items(输入项列表) data(首项) alert/event/vars\n# 把结果写入 result（dict→单项，list→多项）\nresult = [i for i in items if i.get(\"score\", 0) > 80]' },
    ] },
  { id: 'filter', name: '数据过滤', icon: Filter, color: '#F43F5E', bg: '#F43F5E15', category: '数据', desc: '只放行满足条件的数据项',
    fields: [
      { name: 'field', label: '字段', type: 'text', placeholder: 'severity', required: true },
      { name: 'operator', label: '运算符', type: 'select', options: ['等于', '不等于', '包含', '大于', '小于', '为空', '不为空'] },
      { name: 'value', label: '值', type: 'text', placeholder: 'critical' },
    ] },
  { id: 'split', name: '列表拆分', icon: Scissors, color: '#F59E0B', bg: '#F59E0B15', category: '数据', desc: '把数组字段拆成多个数据项',
    fields: [
      { name: 'field', label: '数组字段', type: 'text', placeholder: 'alerts', required: true },
      { name: 'include_fields', label: '保留字段', type: 'text', placeholder: '逗号分隔，留空保留除该字段外全部' },
    ] },
  { id: 'aggregate', name: '聚合统计', icon: Sigma, color: '#0EA5E9', bg: '#0EA5E915', category: '数据', desc: '计数/求和/均值/极值/归集',
    fields: [
      { name: 'operation', label: '聚合方式', type: 'select', options: ['count', 'sum', 'avg', 'min', 'max', 'collect', 'first', 'last'], required: true },
      { name: 'field', label: '统计字段', type: 'text', placeholder: 'risk_score（count 可留空）' },
      { name: 'group_by', label: '分组字段', type: 'text', placeholder: '留空则整体聚合，如 src_ip' },
    ] },
  { id: 'merge', name: '数据合并', icon: GitMerge, color: '#6366F1', bg: '#6366F115', category: '数据', desc: '多分支数据合并',
    fields: [
      { name: 'mode', label: '合并模式', type: 'select', options: ['append', 'combine_by_position', 'combine_by_field'], required: true },
      { name: 'field', label: '连接字段', type: 'text', placeholder: 'combine_by_field 时的 join key，如 src_ip' },
    ] },
  // ---- AI 节点（对齐 Coze「大模型 / 知识库」：提示词可引用上游字段，输出契约供下游引用）----
  { id: 'ai', name: 'AI 分析', icon: Sparkles, color: '#7C3AED', bg: '#7C3AED15', category: 'AI', desc: '大模型分析/生成，输出字段可供下游引用',
    fields: [
      { name: 'provider', label: '模型通道', type: 'select', options: ['自动', '本地', 'Hermes', 'DeepSeek'] },
      { name: 'model', label: '模型', type: 'text', placeholder: '留空用平台默认（deepseek-chat）' },
      { name: 'temperature', label: '温度', type: 'number', placeholder: '0.2' },
      { name: 'max_tokens', label: '最大 Token', type: 'number', placeholder: '2048' },
      { name: 'system_prompt', label: '系统提示词', type: 'textarea', placeholder: '你是安全运营分析助手…（支持 {{ $json.字段 }} / {{ 上游节点.字段 }}）' },
      { name: 'user_prompt', label: '用户提示词', type: 'textarea', placeholder: '请分析：{{ $json.title }}（源IP {{ $json.src_ip }}）' },
      { name: 'include_input', label: '附加当前数据项', type: 'select', options: ['是', '否'] },
      { name: 'output_format', label: '输出格式', type: 'select', options: ['json', 'text'] },
      { name: 'output_fields', label: '输出字段（JSON 数组）', type: 'textarea', placeholder: '[{"name":"verdict","type":"string","desc":"研判结论"}]' },
      { name: 'on_error', label: '失败策略', type: 'select', options: ['continue', 'fail'] },
      { name: 'prompt_key', label: 'AI 中心提示词职责', type: 'select', dynamic: 'promptKeys', options: [] },
    ] },
  { id: 'recall', name: '经验召回', icon: BookOpen, color: '#0D9488', bg: '#0D948815', category: 'AI', desc: '召回 STE 经验库相似处置经验',
    fields: [
      { name: 'category', label: '告警分类', type: 'text', placeholder: '{{ $json.category }}' },
      { name: 'attack_type', label: '攻击类型', type: 'text', placeholder: '{{ $json.attack_type }}' },
      { name: 'limit', label: '召回条数', type: 'number', placeholder: '5' },
      { name: 'output_field', label: '输出字段名', type: 'text', placeholder: 'experiences' },
    ] },
  // ---- 邮件推送 ----
  { id: 'email', name: '发送邮件', icon: Send, color: '#EA580C', bg: '#EA580C15', category: '动作', desc: 'SMTP 邮件发送（配置见 全局配置→邮件服务）',
    fields: [
      { name: 'to', label: '收件人', type: 'text', placeholder: '多个用逗号分隔；支持 {{ ... }}', required: true },
      { name: 'cc', label: '抄送', type: 'text', placeholder: '可选' },
      { name: 'subject', label: '主题', type: 'text', placeholder: 'USOP 安全运营报告', required: true },
      { name: 'body', label: '正文', type: 'textarea', placeholder: "{{ $('安全运营报告').json.report_markdown }}" },
      { name: 'html', label: 'HTML 正文', type: 'select', options: ['否', '是'] },
    ] },
  { id: 'create_event', name: '生成事件', icon: Siren, color: '#DC2626', bg: '#DC262615', category: '动作', desc: '把告警聚合生成工作台事件（去重）',
    fields: [
      { name: 'title', label: '事件标题', type: 'text', placeholder: '可疑告警自动处置 - {{ $json.src_ip }}', required: true },
      { name: 'severity', label: '严重级别', type: 'select', options: ['critical', 'high', 'medium', 'low'] },
      { name: 'category', label: '事件分类', type: 'text', placeholder: '可疑行为' },
      { name: 'description', label: '事件描述', type: 'textarea', placeholder: '支持 {{ ... }} 引用上游分析结论' },
      { name: 'dedupe', label: '已生成过事件的告警跳过', type: 'select', options: ['是', '否'] },
    ] },
  { id: 'update_event', name: '回写分析结论', icon: FileText, color: '#7C2D12', bg: '#7C2D1215', category: '动作', desc: '把分析结论写回事件（extra_data.ai_analysis）',
    fields: [
      { name: 'event_code', label: '事件编号', type: 'text', placeholder: '{{ $json.event_code }}', required: true },
      { name: 'analysis', label: '分析结论', type: 'textarea', placeholder: "{{ $('AI事件研判').json.conclusion }}" },
    ] },
  { id: 'delay', name: '延迟等待', icon: Clock, color: '#6B7280', bg: '#6B728015', category: '控制', desc: '等待指定时间',
    fields: [{ name: 'duration', label: '等待时间', type: 'text', placeholder: '5m' }] },
  { id: 'parallel', name: '并行执行', icon: LayoutGrid, color: '#A855F7', bg: '#A855F715', category: '控制', desc: '并行分支执行',
    fields: [{ name: 'branches', label: '分支数', type: 'number', placeholder: '2' }] },
  { id: 'approval', name: '审批节点', icon: Shield, color: '#DC2626', bg: '#DC262615', category: '控制', desc: '需审批通过后继续（按动作类型自动定级通知审批人）',
    fields: [{ name: 'approvalType', label: '审批类型', type: 'select', options: ['IP封禁', '主机隔离', '密码重置', '防火墙修改'], required: true }, { name: 'reason', label: '申请原因', type: 'textarea', placeholder: '请输入申请原因...' }] },
  { id: 'loop', name: '循环执行', icon: RefreshCw, color: '#059669', bg: '#05966915', category: '控制', desc: '循环遍历执行',
    fields: [{ name: 'iterable', label: '遍历对象', type: 'text', placeholder: '{{ $json.ips }}' }, { name: 'maxIterations', label: '最大次数', type: 'number', placeholder: '10' }] },
  { id: 'switch', name: '多分支', icon: GitBranch, color: '#D97706', bg: '#D9770615', category: '控制', desc: '多条件分支选择',
    fields: [{ name: 'field', label: '判断字段', type: 'text', placeholder: 'severity' }, { name: 'cases', label: '分支配置', type: 'textarea', placeholder: 'critical:高危处理\nhigh:中危处理\ndefault:默认处理' }] },
];

const CATEGORIES = ['基础', '控制', '动作', '集成', '数据', '分析', 'AI'];

/** 节点卡片副标题：从 config 抽取一句话关键信息（Coze 节点摘要思路） */
const nodeSummary = (node: NodeInstance): string => {
  const c = node.config || {};
  switch (node.typeId) {
    case 'trigger': return c.triggerType ? `触发方式：${c.triggerType}` : '剧本入口';
    case 'condition': return c.field ? `${c.field} ${c.operator || ''} ${c.value || ''}`.trim() : 'IF / ELSE 分支';
    case 'script': return c.language ? `${c.language} 脚本` : '脚本执行';
    case 'action': return c.action ? `动作：${c.action}` : '通用动作';
    case 'api': case 'http_request': return c.method ? `${c.method} ${c.url || ''}`.trim() : 'HTTP 请求';
    case 'block': return c.ip ? `封禁 ${c.ip}` : 'IP 封堵';
    case 'isolate': return c.hostname ? `隔离 ${c.hostname}` : '主机隔离';
    case 'ticket': return c.title ? `工单：${c.title}` : '创建工单';
    case 'notify': return c.channel ? `通知 → ${c.channel}` : '发送通知';
    case 'query': return c.source ? `查询：${c.source}` : '数据查询';
    case 'enrich': return c.provider ? `情报：${c.provider}` : '情报补全';
    case 'transform': return '字段整形';
    case 'code': return '代码处理';
    case 'filter': return c.field ? `过滤 ${c.field}` : '数据过滤';
    case 'split': return c.field ? `拆分 ${c.field}` : '列表拆分';
    case 'aggregate': return c.operation ? `聚合 ${c.operation}` : '聚合统计';
    case 'merge': return c.mode ? `合并 ${c.mode}` : '数据合并';
    case 'ai': return c.model ? `AI：${c.model}` : (c.provider ? `AI：${c.provider}` : 'AI 分析');
    case 'recall': return '经验召回';
    case 'email': return c.subject ? `邮件：${c.subject}` : '发送邮件';
    case 'create_event': return c.title ? `事件：${c.title}` : '生成事件';
    case 'update_event': return c.event_code ? `回写 ${c.event_code}` : '回写结论';
    case 'delay': return c.duration ? `等待 ${c.duration}` : '延迟等待';
    case 'parallel': return '并行执行';
    case 'approval': return c.approvalType ? `审批：${c.approvalType}` : '审批节点';
    case 'loop': return '循环执行';
    case 'switch': return c.field ? `分支 ${c.field}` : '多分支';
    default: return '';
  }
};

/** 触发类型单一数据源：优先读触发器节点 config.triggerType，回退顶层字段，避免两处表示不一致 */
const getTriggerType = (pb: { nodes?: any[]; triggerType?: string }): string => {
  const trig = (pb.nodes || []).find(n => n.typeId === 'trigger' || n.type === 'trigger');
  const t = trig?.config?.triggerType;
  return t || pb.triggerType || '告警事件';
};

/** 事件/告警触发的剧本：必须由真实事件或告警提供上下文，不允许「无数据手动执行」 */
const isEventTriggered = (pb: { nodes?: any[]; triggerType?: string }): boolean =>
  ['告警事件', '告警', 'alert', 'event'].includes(String(getTriggerType(pb)).trim());

/** 入参校验：必填非空 + IP 类型格式（与后端 node_params.validate_execution_request 对齐） */
function validateInputs(inputs: any[] | null, params: Record<string, string>): { valid: boolean; error?: string } {
  for (const f of inputs || []) {
    const v = (params[f.key] ?? f.prefill ?? '').trim();
    if (f.required && !v) return { valid: false, error: `请填写入参「${f.label || f.key}」（必填）` };
    if (v && f.type === 'ip' && !/^([0-9]{1,3}\.){3}[0-9]{1,3}$|^([0-9a-fA-F:]+:+)+[0-9a-fA-F]+$/.test(v)) {
      return { valid: false, error: `入参「${f.label || f.key}」IP 格式不正确（示例：192.168.1.100）` };
    }
  }
  return { valid: true };
}

// AI 节点场景预设：一键填充提示词与输出契约（Coze「大模型节点」的提示词模板思路）
const AI_SCENARIOS: { id: string; name: string; patch: Record<string, string> }[] = [
  { id: 'judgment', name: '安全研判', patch: {
      output_format: 'json', include_input: '是', temperature: '0.2',
      system_prompt: '你是资深 SOC 研判分析师。基于给定告警与数据，输出严格 JSON 结构化研判结论；verdict 只能是 true_attack / false_positive / suspicious / info 之一；risk_level 只能是 critical / high / medium / low 之一。不要输出 JSON 以外的内容。',
      user_prompt: '请研判以下告警是否为真实攻击：\n标题：{{ $json.title }}\n分类：{{ $json.category }}\n级别：{{ $json.severity }}\n源IP：{{ $json.src_ip }}\n目的IP：{{ $json.dst_ip }}\n主机：{{ $json.hostname }}\n描述：{{ $json.description }}',
      output_fields: '[{"name":"verdict","type":"string","desc":"true_attack/false_positive/suspicious/info"},{"name":"risk_level","type":"string","desc":"critical/high/medium/low"},{"name":"confidence","type":"number","desc":"0-1 置信度"},{"name":"conclusion","type":"string","desc":"一句话结论"},{"name":"suggested_action","type":"string","desc":"处置建议"}]',
    } },
  { id: 'summary', name: '告警摘要', patch: {
      output_format: 'json', include_input: '是', temperature: '0.3',
      system_prompt: '你是安全告警摘要助手。用中文输出严格 JSON，把原始告警压缩成可快速阅读的要点。',
      user_prompt: '请为以下告警生成摘要：\n{{ $json.title }}\n{{ $json.description }}',
      output_fields: '[{"name":"summary","type":"string","desc":"100 字内摘要"},{"name":"attack_type","type":"string","desc":"攻击类型"},{"name":"risk_level","type":"string","desc":"风险等级"}]',
    } },
  { id: 'advice', name: '处置建议', patch: {
      output_format: 'json', include_input: '是', temperature: '0.4',
      system_prompt: '你是安全应急响应专家。结合告警上下文给出可执行的处置步骤，输出严格 JSON。',
      user_prompt: '请给出处置建议：\n告警：{{ $json.title }}\n级别：{{ $json.severity }}\n资产：{{ $json.hostname }}\n研判结论：{{ $json.conclusion }}',
      output_fields: '[{"name":"immediate_action","type":"string","desc":"立即措施"},{"name":"follow_up","type":"string","desc":"后续措施"},{"name":"prevention","type":"string","desc":"预防建议"}]',
    } },
  { id: 'intent', name: '意图识别', patch: {
      output_format: 'json', include_input: '是', temperature: '0.1',
      system_prompt: '你是安全运营意图分类器。从给定文本中识别处置意图，只输出严格 JSON。',
      user_prompt: '请识别意图并抽取关键实体：\n{{ $json.text }}',
      output_fields: '[{"name":"intent","type":"string","desc":"block_ip/isolate_host/create_ticket/notify/query/unknown"},{"name":"entities","type":"array","desc":"抽取的实体列表"},{"name":"confidence","type":"number","desc":"0-1 置信度"}]',
    } },
];

// 触发数据常用字段（供引用选择器直接插入）
const TRIGGER_FIELDS = ['src_ip', 'dst_ip', 'hostname', 'severity', 'category',
  'attack_type', 'title', 'alert_code', 'status', 'event_code', 'description'];

// ==================== 类型定义 ====================

interface NodeInstance {
  id: string;
  typeId: string;
  name: string;
  config: Record<string, any>;
  position: { x: number; y: number };
  outputs: string[]; // IDs of connected nodes
}

interface PlaybookData {
  id: string;
  name: string;
  description: string;
  triggerType: string;
  nodes: NodeInstance[];
  enabled: boolean;
  /** 执行需审批（剧本配置项）：事件工作台执行时自动走审批流 */
  approval_required?: boolean;
}

// ==================== 样式常量 ====================

const NODE_W = 160;
const NODE_H = 60;

// ==================== 主组件 ====================

export default function Playbooks() {
  const { ask, confirmProps } = useConfirmDialog();
  const [playbooks, setPlaybooks] = useState<PlaybookData[]>([
    { id: 'PB-001', name: '暴力破解自动封堵', description: '检测到暴力破解告警后自动封堵源IP并通知安全团队', triggerType: '告警事件',
      nodes: [
        { id: 'n1', typeId: 'trigger', name: '暴力破解告警', config: { triggerType: '告警事件' }, position: { x: 40, y: 80 }, outputs: ['n2'] },
        { id: 'n2', typeId: 'condition', name: '检查严重程度', config: { field: 'severity', operator: '等于', value: 'critical' }, position: { x: 240, y: 80 }, outputs: ['n3', 'n4'] },
        { id: 'n3', typeId: 'block', name: '封堵源IP', config: { ip: '{{ $json.src_ip }}', duration: '24h', reason: '暴力破解封堵' }, position: { x: 440, y: 30 }, outputs: ['n5'] },
        { id: 'n4', typeId: 'notify', name: '低危通知', config: { channel: '企业微信', title: '低危告警', content: '' }, position: { x: 440, y: 140 }, outputs: ['n5'] },
        { id: 'n5', typeId: 'ticket', name: '创建工单', config: { title: '暴力破解事件处理', priority: '高', assignee: '安全运维' }, position: { x: 640, y: 80 }, outputs: [] },
      ], enabled: true },
    { id: 'PB-002', name: 'C2 通信自动隔离', description: '检测到C2通信后自动隔离受感染主机并启动应急响应', triggerType: '告警事件',
      nodes: [
        { id: 'n1', typeId: 'trigger', name: 'C2通信告警', config: { triggerType: '告警事件' }, position: { x: 40, y: 80 }, outputs: ['n2'] },
        { id: 'n2', typeId: 'isolate', name: '隔离主机', config: { hostname: '{{ $json.hostname }}', duration: '4h' }, position: { x: 240, y: 80 }, outputs: ['n3'] },
        { id: 'n3', typeId: 'enrich', name: '情报查询', config: { type: 'IP情报', value: '{{ $json.dst_ip }}' }, position: { x: 440, y: 80 }, outputs: ['n4', 'n5'] },
        { id: 'n4', typeId: 'ticket', name: '创建应急工单', config: { title: 'C2通信应急响应', priority: '高' }, position: { x: 640, y: 30 }, outputs: [] },
        { id: 'n5', typeId: 'notify', name: '通知SOC', config: { channel: '企业微信', title: '紧急: C2通信', content: '' }, position: { x: 640, y: 140 }, outputs: [] },
      ], enabled: true },
    { id: 'PB-003', name: 'Web攻击溯源分析', description: '检测Web攻击后自动查询资产信息、关联历史告警、生成分析报告', triggerType: '告警事件',
      nodes: [
        { id: 'n1', typeId: 'trigger', name: 'Web攻击告警', config: { triggerType: '告警事件' }, position: { x: 40, y: 80 }, outputs: ['n2'] },
        { id: 'n2', typeId: 'query', name: '查询资产信息', config: { source: '资产表', query: 'ip={{ $json.src_ip }}' }, position: { x: 240, y: 80 }, outputs: ['n3'] },
        { id: 'n3', typeId: 'enrich', name: 'IP情报查询', config: { type: 'IP情报', value: '{{ $json.src_ip }}' }, position: { x: 440, y: 80 }, outputs: ['n4'] },
        { id: 'n4', typeId: 'notify', name: '输出报告', config: { channel: '邮件', title: 'Web攻击溯源报告' }, position: { x: 640, y: 80 }, outputs: [] },
      ], enabled: false },
  ]);

  const [editingPb, setEditingPb] = useState<PlaybookData | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  // 拖拽连线：从输出端口按住拖出预览虚线，松手落在目标节点上完成连接
  const [dragLine, setDragLine] = useState<{ fromId: string; x: number; y: number } | null>(null);
  // 画布顶部短暂反馈（连线成功/重复/条件分支提示）
  const [canvasFlash, setCanvasFlash] = useState<{ text: string; kind: 'success' | 'warn' } | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);               // 画布缩放（Coze 风格：滚轮缩放 + 拖拽平移）
  const didPanRef = useRef(false);                     // 背景是否发生平移（避免平移后误触取消选中）
  const libMouseDown = useRef<{ x: number; y: number } | null>(null); // 节点库点击/拖拽判定
  const [nodeSearch, setNodeSearch] = useState('');   // 左侧节点库搜索过滤
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runningManual, setRunningManual] = useState(false);
  const [execMsg, setExecMsg] = useState('');
  // ===== 审批中心（剧本执行审批）=====
  const [showApprovals, setShowApprovals] = useState(false);
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [approvalTab, setApprovalTab] = useState<'pending' | 'processed'>('pending');
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [processingApproval, setProcessingApproval] = useState<string | null>(null);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  // 视图切换：剧本列表 / 执行记录
  const [viewMode, setViewMode] = useState<'list' | 'records'>('list');
  // 数据查询节点「数据源」动态选项：来自存储表注册表（/playbooks-api/query-sources）
  // location=物理位置（ES 索引/PG 表名），columns=注册表字段（条件构建器联想）
  const [querySources, setQuerySources] = useState<
    { value: string; label: string; backend?: string; location?: string; columns?: string[] }[]>([]);
  // AI 节点「提示词职责」动态选项：来自 AI 中心目录（/ai-center/catalog）
  const [promptKeys, setPromptKeys] = useState<{ value: string; label: string }[]>([]);
  // 通用动作节点「动作」动态选项：引擎真实动作列表（/playbooks-api/actions/list）
  const [actionOptions, setActionOptions] = useState<{ value: string; label: string }[]>([]);
  // 通用动作参数 schema：{动作名: 参数定义[]}，选中动作后渲染具体配置页
  const [actionSchemas, setActionSchemas] = useState<Record<string, any[]>>({});
  const editorOptionsLoaded = useRef(false);
  const loadEditorOptions = () => {
    if (editorOptionsLoaded.current) return;
    editorOptionsLoaded.current = true;
    playbooksApi.getQuerySources()
      .then((res: any) => setQuerySources(res?.data?.sources || []))
      .catch(() => { editorOptionsLoaded.current = false; }); // 失败回退 field.options 静态列表
    aiCenterApi.catalog()
      .then((res: any) => setPromptKeys((res?.data?.prompt_keys || []).map((k: any) => ({ value: k.key, label: `${k.label}（${k.key}）` }))))
      .catch(() => { editorOptionsLoaded.current = false; });
    playbooksApi.listActions()
      .then((res: any) => {
        const list = res?.data || [];
        setActionOptions(list.map((a: any) => ({
          value: a.name,
          label: `${a.name} · ${a.description}${a.params?.length ? `（${a.params.length} 个参数）` : ''}`,
        })));
        const schemas: Record<string, any[]> = {};
        list.forEach((a: any) => { schemas[a.name] = a.params || []; });
        setActionSchemas(schemas);
      })
      .catch(() => { editorOptionsLoaded.current = false; });
  };
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLDivElement>(null);

  // 试运行：执行剧本并展示节点间数据流（items 如何被加工、传递）
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<any>(null);
  const [showRunPanel, setShowRunPanel] = useState(false);
  // 事件触发剧本的「试运行」：先收集模拟上下文（告警数据 + 声明入参），再执行
  const [simOpen, setSimOpen] = useState(false);
  const [simInputs, setSimInputs] = useState<any[]>([]);
  const [simParams, setSimParams] = useState<Record<string, string>>({});
  const [simAlert, setSimAlert] = useState({ src_ip: '203.0.113.10', dst_ip: '10.0.0.5', title: '模拟告警（试运行）', severity: 'high' });
  const [simErr, setSimErr] = useState('');
  const [simLoading, setSimLoading] = useState(false);
  const simInitRef = useRef<Record<string, string>>({});
  // 手动执行入参弹窗（提示输入 → 校验 → 执行）
  const [manualOpen, setManualOpen] = useState(false);
  const [manualInputs, setManualInputs] = useState<any[]>([]);
  const [manualParams, setManualParams] = useState<Record<string, string>>({});
  const [manualErr, setManualErr] = useState('');
  const [manualTarget, setManualTarget] = useState<{ id: number; name: string } | null>(null);

  // 首次挂载时从后端加载剧本（此前列表是硬编码 mock，刷新即丢）
  useEffect(() => {
    let cancelled = false;
    // 后端可能存两种节点格式：画布格式 {typeId,name,position,outputs} 与
    // 引擎格式 {type,label,config}（种子数据）—— 统一归一为画布格式
    const toCanvasNode = (raw: any, i: number, edges: any[] = []): NodeInstance => {
      const known = NODE_TYPES.some(t => t.id === (raw.typeId || raw.type));
      return {
        id: String(raw.id ?? `n${i + 1}`),
        typeId: known ? (raw.typeId || raw.type) : 'action',
        name: raw.name || raw.label || '节点',
        config: raw.config && typeof raw.config === 'object' ? raw.config : {},
        position: raw.position || { x: 40 + (i % 4) * 200, y: 80 + Math.floor(i / 4) * 110 },
        outputs: Array.isArray(raw.outputs)
          ? raw.outputs.map(String)
          : (edges || []).filter((e: any) => String(e.source) === String(raw.id)).map((e: any) => String(e.target)),
      };
    };
    (async () => {
      setLoading(true);
      try {
        const res = await playbooksApi.getPlaybooks({ page: 1, page_size: 100 });
        if (cancelled) return;
        const items = res?.data?.items || [];
        if (!items.length) return;
        // 列表接口轻量不下发图数据 —— 逐个拉详情补齐编排图
        const details = await Promise.all(
          items.map((p: any) => playbooksApi.getPlaybook(p.id).catch(() => null))
        );
        const full = items.map((p: any, i: number) => {
          const d = details[i]?.data || p;
          const edges = Array.isArray(d.edges) ? d.edges : [];
          const rawNodes = Array.isArray(d.nodes) ? d.nodes : [];
          return {
            id: String(d.id),
            name: d.name || '',
            description: d.description || '',
            triggerType: d.trigger_type || '告警事件',
            nodes: rawNodes.map((n: any, j: number) => toCanvasNode(n, j, edges)),
            enabled: d.enabled !== false,
            approval_required: !!d.approval_required,
          };
        });
        setPlaybooks(full);
      } catch (e) {
        console.warn('[剧本] 后端加载失败，保留内置示例:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 获取当前编辑的节点列表
  const nodes = editingPb?.nodes || [];
  const selectedNode = nodes.find(n => n.id === selectedNodeId) || null;

  // 画布内容尺寸：覆盖所有节点的最大扩展范围（而非仅可视视口），
  // 否则 SVG 以视口尺寸渲染、右侧/下方连线会被 overflow:hidden 裁掉，且滚动时 SVG 随内容移出可视区导致连线消失。
  const canvasContentW = nodes.length
    ? Math.max(1200, ...nodes.map(n => (n.position?.x || 0) + NODE_W)) + 240
    : 1200;
  const canvasContentH = nodes.length
    ? Math.max(700, ...nodes.map(n => (n.position?.y || 0) + NODE_H)) + 240
    : 700;

  // ===== 集成应用（Shuffle / OpenAPI 导入的动作）=====
  const [integrationApps, setIntegrationApps] = useState<IntegrationApp[]>([]);
  const [expandedAppId, setExpandedAppId] = useState<number | null>(null);
  // 动作列表按需懒加载缓存（列表接口不下发 actions，展开应用时才拉）
  const [appActionsCache, setAppActionsCache] = useState<Record<number, AppAction[]>>({});
  const [appActionDetail, setAppActionDetail] = useState<{ app: IntegrationApp; action: AppAction } | null>(null);

  // 编辑器打开时拉取集成应用列表（画布左侧「集成应用动作」面板）
  useEffect(() => {
    if (!showEditor) return;
    let cancelled = false;
    integrationsApi.getApps()
      .then(res => { if (!cancelled && res.success) setIntegrationApps(res.data.items || []); })
      .catch(() => { /* 无集成应用时静默，面板显示引导文案 */ });
    return () => { cancelled = true; };
  }, [showEditor]);

  /** 展开/收起集成应用；首次展开时懒加载该应用的动作列表 */
  const toggleAppExpand = async (appId: number) => {
    if (expandedAppId === appId) { setExpandedAppId(null); return; }
    setExpandedAppId(appId);
    if (appActionsCache[appId]) return;
    try {
      const res = await integrationsApi.getApp(appId);
      if (res.success) {
        setAppActionsCache(prev => ({ ...prev, [appId]: res.data.actions || [] }));
      }
    } catch { /* 拉取失败时保留空列表，展开区显示为空 */ }
  };

  // 选中绑定了集成应用动作的节点时，拉取动作定义（动态参数表单）
  const boundAppId = selectedNode?.config?._app_id ? Number(selectedNode.config._app_id) : null;
  const boundActionId = selectedNode?.config?._action_id || null;
  useEffect(() => {
    if (!boundAppId || !boundActionId) { setAppActionDetail(null); return; }
    let cancelled = false;
    integrationsApi.getApp(boundAppId)
      .then(res => {
        if (cancelled || !res.success) return;
        const action = (res.data.actions || []).find((a: AppAction) => a.id === boundActionId);
        setAppActionDetail(action ? { app: res.data, action } : null);
      })
      .catch(() => setAppActionDetail(null));
    return () => { cancelled = true; };
  }, [boundAppId, boundActionId]);

  /** 从集成应用动作插入 HTTP 请求节点（参数表单按动作定义动态渲染） */
  const addIntegrationNode = (app: IntegrationApp, action: AppAction) => {
    if (!editingPb) return;
    const id = `n${Date.now()}`;
    const values: Record<string, string> = {};
    (action.params || []).forEach(p => {
      if (p.default != null) values[p.name] = String(p.default);
    });
    const config: Record<string, any> = {
      _app_id: app.id,
      _app_key: app.app_key,
      _app_name: app.name,
      _action_id: action.id,
      _action_name: action.name,
      _action_method: action.method,
      _action_path: action.path,
      values,
      timeout: '15',
    };
    const newNode = {
      id,
      typeId: 'http_request',
      name: action.name,
      config,
      position: { x: 220 + Math.random() * 140, y: 120 + Math.random() * 180 },
      outputs: [] as string[],
    };
    setEditingPb({ ...editingPb, nodes: [...editingPb.nodes, newNode] });
    setSelectedNodeId(id);
  };

  /** 更新集成动作节点的参数值（写入 config.values） */
  const updateIntegrationValue = (nodeId: string, name: string, value: string) => {
    if (!editingPb) return;
    setEditingPb({
      ...editingPb,
      nodes: editingPb.nodes.map(n => n.id === nodeId
        ? { ...n, config: { ...n.config, values: { ...(n.config.values || {}), [name]: value } } }
        : n),
    });
  };

  /** 解除集成绑定，节点回到手动 URL 配置模式 */
  const unbindIntegration = (nodeId: string) => {
    if (!editingPb) return;
    setEditingPb({
      ...editingPb,
      nodes: editingPb.nodes.map(n => {
        if (n.id !== nodeId) return n;
        const config = { ...n.config };
        delete config._app_id; delete config._app_key; delete config._app_name;
        delete config._action_id; delete config._action_name;
        delete config._action_method; delete config._action_path;
        delete config.values;
        return { ...n, config };
      }),
    });
    setAppActionDetail(null);
  };

  // ===== 剧本操作 =====
  const openEditor = (pb: PlaybookData) => {
    setEditingPb({ ...pb, nodes: pb.nodes.map(n => ({ ...n })) });
    setSelectedNodeId(null);
    setConnectingFrom(null);
    setShowEditor(true);
    loadEditorOptions();
  };

  const newPlaybook = () => {
    const pb: PlaybookData = {
      id: `PB-${Date.now()}`,
      name: '新建剧本',
      description: '',
      triggerType: '告警事件',
      nodes: [{ id: `n1`, typeId: 'trigger', name: '触发器', config: { triggerType: '告警事件' }, position: { x: 40, y: 80 }, outputs: [] }],
      enabled: false,
      approval_required: false,
    };
    openEditor(pb);
  };

  // ===== 剧本操作（持久化到后端） =====
  // 仅数字 id 是后端主键；`PB-xxx` 这类是未落库的前端草稿
  const isPersisted = (id: string) => /^\d+$/.test(String(id));

  const savePlaybook = async () => {
    if (!editingPb) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: editingPb.name,
        description: editingPb.description,
        trigger_type: getTriggerType(editingPb),
        // 后端以 nodes[].outputs 还原 edges 拓扑
        nodes: editingPb.nodes,
        enabled: editingPb.enabled,
        approval_required: !!editingPb.approval_required,
      };
      if (isPersisted(String(editingPb.id))) {
        const res = await playbooksApi.updatePlaybook(Number(editingPb.id), payload);
        const saved = res?.data ?? editingPb;
        setPlaybooks(prev => prev.map(p => String(p.id) === String(saved.id) ? { ...editingPb, id: String(saved.id) } : p));
      } else {
        const res = await playbooksApi.createPlaybook(payload);
        const saved = res?.data;
        if (!saved?.id) throw new Error('保存失败：后端未返回剧本 ID');
        setPlaybooks(prev => [{ ...editingPb, id: String(saved.id) }, ...prev.filter(p => String(p.id) !== String(editingPb.id))]);
      }
      setShowEditor(false);
    } catch (e: any) {
      console.error('保存剧本失败:', e);
      setError(e?.message || '保存剧本失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  /** 手动触发：从列表卡片直接运行一个已发布剧本（手动触发的入口）。
   *  需要入参时弹窗提示输入 → 校验 → 执行；无入参直接执行。 */
  const runManual = async (pb: PlaybookData) => {
    if (!isPersisted(String(pb.id))) { setExecMsg('请先在编辑器中保存该剧本'); return; }
    if (isEventTriggered(pb)) {
      setExecMsg(`「${pb.name}」为事件触发剧本，需由安全事件/告警提供数据，请在事件工作台执行或改用「试运行」提供模拟数据`);
      setTimeout(() => setExecMsg(''), 6000);
      return;
    }
    await openManualRun(
      async () => {
        // 确保已发布（草稿/未启用时后端拒绝执行）
        await playbooksApi.updatePlaybook(Number(pb.id), {
          name: pb.name, description: pb.description,
          trigger_type: getTriggerType(pb), nodes: pb.nodes, enabled: true, status: 'published',
        });
        return Number(pb.id);
      },
      pb.name,
    );
  };

  /** 编辑器内手动运行当前剧本 */
  const runManualEditor = async () => {
    if (!editingPb) return;
    if (isEventTriggered(editingPb)) {
      setExecMsg(`「${editingPb.name}」为事件触发剧本，需由安全事件/告警提供数据，请在事件工作台执行或改用「试运行」提供模拟数据`);
      setTimeout(() => setExecMsg(''), 6000);
      return;
    }
    setRunningManual(true);
    try {
      const pid = await ensurePlaybookPersisted();
      await openManualRun(async () => Number(pid), editingPb.name);
    } catch (e: any) {
      setExecMsg(`执行失败：${e?.message || '请求错误'}`);
      setTimeout(() => setExecMsg(''), 6000);
    } finally {
      setRunningManual(false);
    }
  };

  /** 确保当前编辑中的剧本已持久化并发布，返回剧本 id */
  const ensurePlaybookPersisted = async (): Promise<string> => {
    if (!editingPb) throw new Error('未选择剧本');
    const payload = {
      name: editingPb.name,
      description: editingPb.description,
      trigger_type: getTriggerType(editingPb),
      nodes: editingPb.nodes,
      enabled: true,
      status: 'published',
      approval_required: !!editingPb.approval_required,
    };
    if (isPersisted(String(editingPb.id))) {
      await playbooksApi.updatePlaybook(Number(editingPb.id), payload);
      return String(editingPb.id);
    }
    const res = await playbooksApi.createPlaybook(payload);
    const saved = (res as any)?.data;
    if (!saved?.id) throw new Error('保存失败：后端未返回剧本 ID');
    const pid = String(saved.id);
    setEditingPb({ ...editingPb, id: pid });
    setPlaybooks(prev => [{ ...editingPb, id: pid }, ...prev.filter(p => String(p.id) !== String(editingPb.id))]);
    return pid;
  };

  /** 试运行：事件触发剧本先提供模拟上下文再执行；
   *  其它触发类型与「运行」一致——需要入参弹窗收集，无需入参直接执行。 */
  const runPlaybook = async () => {
    if (!editingPb) return;
    setError('');
    if (isEventTriggered(editingPb)) {
      await openSimulateRun();
      return;
    }
    setRunning(true);
    try {
      const pid = await ensurePlaybookPersisted();
      await openManualRun(async () => Number(pid), editingPb.name);
    } finally {
      setRunning(false);
    }
  };

  /** 手动执行落盘后的公共执行体：带 params 调执行接口并展示结果 */
  const executeManualPlaybook = async (pid: number, name: string, params: Record<string, string>) => {
    try {
      const res = await playbooksApi.executePlaybook(pid, {
        trigger_type: 'manual', event: { title: name, manual: true }, params,
      });
      const d = (res as any)?.data || {};
      if (d.status === 'pending_approval') {
        setExecMsg(`「${name}」含需审批操作，已提交审批`);
      } else if ((res as any)?.success) {
        setExecMsg(`「${name}」已执行`);
        setRunResult(d);
        setShowRunPanel(true);
      } else {
        setExecMsg(`「${name}」执行失败：${d.error || '未知错误'}`);
      }
    } catch (e: any) {
      setExecMsg(`「${name}」执行失败：${e?.payload?.error || e?.message || '请求错误'}`);
    }
    setTimeout(() => setExecMsg(''), 6000);
  };

  /** 手动执行入口：需要入参时弹窗收集（提示 → 校验 → 执行），无需入参直接执行 */
  const openManualRun = async (getPid: () => Promise<number>, pbName: string) => {
    setManualErr('');
    try {
      const pid = await getPid();
      const res = await playbooksApi.getParams(pid);
      const inputs = (res as any)?.data?.inputs || [];
      if (!inputs.length) {
        await executeManualPlaybook(pid, pbName, {});
        return;
      }
      setManualTarget({ id: pid, name: pbName });
      setManualInputs(inputs);
      const init: Record<string, string> = {};
      for (const f of inputs) init[f.key] = f.prefill || '';
      setManualParams(init);
      setManualOpen(true);
    } catch (e: any) {
      setExecMsg(`执行失败：${e?.message || '获取剧本入参失败'}`);
      setTimeout(() => setExecMsg(''), 6000);
    }
  };

  /** 提交手动执行：本地校验（必填 + IP 格式）后执行，服务端同样强制校验 */
  const confirmManualRun = async () => {
    if (!manualTarget) return;
    const v = validateInputs(manualInputs, manualParams);
    if (!v.valid) { setManualErr(v.error || '入参校验失败'); return; }
    setRunning(true);
    setManualErr('');
    try {
      await executeManualPlaybook(manualTarget.id, manualTarget.name, manualParams);
      setManualOpen(false);
    } finally {
      setRunning(false);
    }
  };

  /** 打开「模拟运行」弹窗：拉取剧本声明的入参，准备模拟告警上下文 */
  const openSimulateRun = async (preload?: any[]) => {
    setSimErr('');
    setSimLoading(true);
    try {
      await ensurePlaybookPersisted();
      let inputs = preload || [];
      if (!preload) {
        const res = await playbooksApi.getParams(Number(editingPb!.id));
        inputs = (res as any)?.data?.inputs || [];
      }
      setSimInputs(inputs);
      const init: Record<string, string> = {};
      for (const f of inputs) init[f.key] = f.prefill || '';
      simInitRef.current = init;
      setSimParams(init);
      setSimOpen(true);
    } catch (e: any) {
      console.error('获取剧本入参失败:', e);
      setError(e?.message || '获取剧本入参失败');
    } finally {
      setSimLoading(false);
    }
  };

  /** 声明入参 key → 模拟告警字段的映射（同语义字段联动显示） */
  const SIM_KEY_TO_ALERT: Record<string, string> = {
    src_ip: 'src_ip', ip: 'src_ip', dst_ip: 'dst_ip', title: 'title', severity: 'severity',
  };

  /** 更新模拟告警上下文，并联动刷新「预填自事件/告警或默认值、且未被手动改过」的声明入参显示，
   *  保证弹窗里看到的值 = 实际执行值（未被改过的入参不随请求提交，由服务端按上下文>默认值解析）。 */
  const updateSimAlert = (patch: Partial<typeof simAlert>) => {
    const nextAlert = { ...simAlert, ...patch };
    setSimAlert(nextAlert);
    const init = simInitRef.current || {};
    setSimParams(p => {
      const next = { ...p };
      for (const f of simInputs) {
        if ((next[f.key] ?? '') !== (init[f.key] ?? '')) continue; // 手动改过 → 不覆盖
        const src = f.prefill_source || '';
        const ctxBased = src.startsWith('event.') || src.startsWith('alert.') || src === 'declared_default';
        const field = SIM_KEY_TO_ALERT[f.key] as keyof typeof nextAlert | undefined;
        const v = field ? nextAlert[field] : undefined;
        if (ctxBased && field && typeof v === 'string' && v) next[f.key] = v;
      }
      return next;
    });
  };

  /** 提交模拟运行：带上模拟事件/告警上下文 + 入参执行 */
  const confirmSimulateRun = async () => {
    if (!editingPb) return;
    const v = validateInputs(simInputs, simParams);
    if (!v.valid) { setSimErr(v.error || '入参校验失败'); return; }
    if (!(simAlert.src_ip || '').trim()) { setSimErr('请填写模拟告警的源 IP'); return; }
    setRunning(true);
    setSimErr('');
    try {
      const pid = await ensurePlaybookPersisted();
      // 只提交用户真正改过的入参；保持初始预填值不动的字段不提交，
      // 交给服务端按「事件上下文 > 声明默认值」重新解析，
      // 避免「模拟告警源IP」与「声明入参」两个同名字段互相覆盖造成执行值不一致。
      const init = simInitRef.current || {};
      const changedParams: Record<string, string> = {};
      for (const [k, val] of Object.entries(simParams)) {
        const s = (val ?? '').trim();
        if (s && s !== (init[k] ?? '')) changedParams[k] = s;
      }
      const res = await playbooksApi.executePlaybook(Number(pid), {
        trigger_type: isEventTriggered(editingPb) ? 'alert' : 'manual',
        simulate: true,
        event: {
          event_code: 'SIM-RUN', title: simAlert.title || '模拟运行事件',
          severity: simAlert.severity || 'high', src_ip: simAlert.src_ip,
          simulated: true,
        },
        alert: {
          src_ip: simAlert.src_ip, dst_ip: simAlert.dst_ip,
          title: simAlert.title || '模拟告警', severity: simAlert.severity || 'high',
        },
        params: changedParams,
        executor: 'admin',
      });
      setSimOpen(false);
      setRunResult(res?.data ?? res);
      setShowRunPanel(true);
    } catch (e: any) {
      console.error('模拟运行失败:', e);
      setSimErr(e?.message || '模拟运行失败');
    } finally {
      setRunning(false);
    }
  };

  const deletePlaybook = async (id: string) => {
    const ok = await ask({
      message: '删除剧本后，其编排图与执行记录将一并移除。确认删除？',
      danger: true, confirmText: '删除',
    });
    if (!ok) return;
    try {
      if (isPersisted(String(id))) {
        await playbooksApi.deletePlaybook(Number(id));
      }
      setPlaybooks(prev => prev.filter(p => String(p.id) !== String(id)));
    } catch (e: any) {
      console.error('删除剧本失败:', e);
      setError(e?.message || '删除剧本失败，请重试');
    }
  };

  // 复制剧本：持久化为新剧本（draft），刷新不丢
  const duplicatePlaybook = async (pb: PlaybookData) => {
    setError('');
    try {
      const res = await playbooksApi.createPlaybook({
        name: `${pb.name} (副本)`,
        description: pb.description,
        trigger_type: pb.triggerType || getTriggerType(pb),
        nodes: pb.nodes,
        enabled: false,
        status: 'draft',
      });
      const saved = res?.data;
      if (!saved?.id) throw new Error('后端未返回剧本 ID');
      setPlaybooks(prev => [{
        ...pb,
        id: String(saved.id),
        name: `${pb.name} (副本)`,
        enabled: false,
      }, ...prev]);
    } catch (e: any) {
      console.error('复制剧本失败:', e);
      setError(e?.message || '复制剧本失败，请重试');
    }
  };

  const toggleEnabled = async (id: string) => {
    const target = playbooks.find(p => String(p.id) === String(id));
    if (!target) return;
    const next = !target.enabled;
    // 先本地乐观更新，失败再回滚
    setPlaybooks(prev => prev.map(p => String(p.id) === String(id) ? { ...p, enabled: next } : p));
    if (!isPersisted(String(id))) return;
    try {
      await playbooksApi.updatePlaybook(Number(id), { enabled: next });
    } catch (e: any) {
      setPlaybooks(prev => prev.map(p => String(p.id) === String(id) ? { ...p, enabled: !next } : p));
      console.error('切换启用状态失败:', e);
      setError(e?.message || '切换启用状态失败，请重试');
    }
  };

  // ===== 节点操作 =====
  const addNode = (typeId: string, x: number, y: number) => {
    if (!editingPb) return;
    const nt = NODE_TYPES.find(n => n.id === typeId);
    if (!nt) return;
    const id = `n${Date.now()}`;
    const newNode: NodeInstance = { id, typeId, name: nt.name, config: {}, position: { x, y }, outputs: [] };
    setEditingPb({ ...editingPb, nodes: [...editingPb.nodes, newNode] });
    setSelectedNodeId(id);
  };

  const removeNode = (id: string) => {
    if (!editingPb) return;
    const newNodes = editingPb.nodes.filter(n => n.id !== id).map(n => ({ ...n, outputs: n.outputs.filter(o => o !== id) }));
    setEditingPb({ ...editingPb, nodes: newNodes });
    if (selectedNodeId === id) setSelectedNodeId(null);
  };

  const updateNodeConfig = (nodeId: string, key: string, value: any) => {
    if (!editingPb) return;
    const node = editingPb.nodes.find(n => n.id === nodeId);
    // 触发器类型既是节点配置，也是剧本顶层 trigger_type；改此处要双向同步，
    // 否则画布卡片与列表「触发:」永远读不到最新选择。
    const isTriggerType = node?.typeId === 'trigger' && key === 'triggerType';
    setEditingPb(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        triggerType: isTriggerType ? value : prev.triggerType,
        nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, config: { ...n.config, [key]: value } } : n),
      };
    });
  };

  const updateNodeName = (nodeId: string, name: string) => {
    if (!editingPb) return;
    setEditingPb({
      ...editingPb,
      nodes: editingPb.nodes.map(n => n.id === nodeId ? { ...n, name } : n),
    });
  };

  // ===== 数据查询节点：结构化条件构建器（field/operator/value 行，行间 AND）=====
  const QUERY_OPERATORS = ['等于', '不等于', '包含', '不包含', '前缀', '正则', '大于', '大于等于', '小于', '小于等于', '存在', '不存在'];

  const getQueryConditions = (nodeId: string): { field: string; operator: string; value: string }[] => {
    const node = editingPb?.nodes.find(n => n.id === nodeId);
    const raw = node?.config?.conditions;
    return Array.isArray(raw) ? raw : [];
  };
  const updateQueryConditions = (nodeId: string, rows: { field: string; operator: string; value: string }[]) => {
    setEditingPb(prev => prev ? {
      ...prev,
      nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, config: { ...n.config, conditions: rows } } : n),
    } : prev);
  };
  const setQueryCondition = (nodeId: string, idx: number, patch: Partial<{ field: string; operator: string; value: string }>) => {
    const rows = getQueryConditions(nodeId).map((r, i) => i === idx ? { ...r, ...patch } : r);
    updateQueryConditions(nodeId, rows);
  };
  const addQueryCondition = (nodeId: string) => {
    updateQueryConditions(nodeId, [...getQueryConditions(nodeId), { field: '', operator: '等于', value: '' }]);
  };
  const removeQueryCondition = (nodeId: string, idx: number) => {
    updateQueryConditions(nodeId, getQueryConditions(nodeId).filter((_, i) => i !== idx));
  };

  // ===== 参数引用（Coze 风格：可视化选择上游输出，不用手敲表达式）=====
  const [refField, setRefField] = useState<string | null>(null);
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});

  /** 试运行实测到的节点输出字段（最准） */
  const realKeys = (nodeId: string): string[] => {
    const r = (runResult?.node_results || []).find((n: any) => String(n.node_id) === String(nodeId));
    if (!r) return [];
    if (Array.isArray(r.output_keys) && r.output_keys.length) return r.output_keys;
    const first = (r.items || [])[0];
    return first && typeof first === 'object' ? Object.keys(first) : [];
  };

  /** 试运行实测到的节点输出首项样本（用于展开嵌套字段） */
  const nodeSample = (nodeId: string): Record<string, any> | null => {
    const r = (runResult?.node_results || []).find((n: any) => String(n.node_id) === String(nodeId));
    const first = (r?.items || [])[0];
    return first && typeof first === 'object' && !Array.isArray(first) ? first : null;
  };

  /**
   * 把一个输出样本展开成可引用的点路径（含嵌套层）。
   * 后端 resolve() 支持 a.b.c 逐级取值，所以嵌套字段是可以直接引用的，
   * 选择器必须把它们列出来，否则用户只能选到整个对象（如 summary 而非 summary.threat_level）。
   * - 深度上限 MAX_DEPTH，条目上限 MAX_PATHS，避免大响应体（如微步 data.<ip>）刷屏
   * - key 含「.」的分支不可寻址（后端按点切段），直接跳过
   */
  const MAX_PATH_DEPTH = 3;
  const MAX_PATHS = 60;
  const expandPaths = (sample: any): { label: string; path: string; depth: number }[] => {
    if (!sample || typeof sample !== 'object' || Array.isArray(sample)) return [];
    const out: { label: string; path: string; depth: number }[] = [];
    const walk = (obj: any, prefix: string, depth: number) => {
      for (const [k, v] of Object.entries(obj)) {
        if (out.length >= MAX_PATHS) return;
        if (k.includes('.')) continue;
        const path = prefix ? `${prefix}.${k}` : k;
        out.push({ label: k, path, depth });
        // 原始响应体 / 摘要副本不展开：子键多为 IP（含点，不可寻址），列出来只会噪音
        const leafOnly = k === 'data' || k === 'intel_summary' || k === 'raw_log';
        if (!leafOnly && depth < MAX_PATH_DEPTH && v && typeof v === 'object' && !Array.isArray(v)) {
          walk(v, path, depth + 1);
        }
      }
    };
    walk(sample, '', 0);
    return out;
  };

  /** 节点可引用路径：优先试运行样本展开（含嵌套），否则退回顶层键名 */
  const refPaths = (n: NodeInstance): { label: string; path: string; depth: number }[] => {
    const sample = nodeSample(n.id);
    const expanded = expandPaths(sample);
    if (expanded.length) return expanded;
    return Array.from(new Set([...realKeys(n.id), ...staticKeys(n)]))
      .map(k => ({ label: k, path: k, depth: 0 }));
  };

  /** 未试运行时按节点配置静态推断输出字段 */
  const staticKeys = (n: NodeInstance): string[] => {
    if (n.typeId === 'ai') {
      try {
        const fs = JSON.parse(n.config.output_fields || '[]');
        if (Array.isArray(fs) && fs.length) {
          return fs.map((f: any) => String(f.name)).concat(['ai_text', 'ai_meta']);
        }
      } catch { /* 非法 JSON 时回退默认字段 */ }
      return ['ai_text', 'ai_meta'];
    }
    if (n.typeId === 'recall') return ['experiences', 'experience_count', 'ste_conclusion', 'ste_suggested_action', 'ste_verdict'];
    if (n.typeId === 'transform') {
      return String(n.config.assignments || '').split('\n').map((l: string) => l.split('=')[0].trim()).filter(Boolean);
    }
    if (n.typeId === 'aggregate') {
      const op = n.config.operation || 'count';
      return [n.config.field ? `${op}_${n.config.field}` : op, 'count',
        ...(n.config.group_by ? [n.config.group_by] : [])];
    }
    return [];
  };

  /** 当前选中节点可引用的变量分组：触发数据 / 当前输入 / 各上游节点输出
   *  统一表达式语法（点击插入=文档说明，全部为引擎支持的标准写法）：
   *    {{ $json.字段 }}                     当前输入项（直接上游输出）
   *    {{ $('节点名').json.字段 }}           指定上游节点的输出（含触发器）
   *    {{ $items('节点名') }}               指定节点的全部输出项
   */
  /** 路径 → 可点击变量（父路径作灰色前缀，depth 用于缩进） */
  const toVars = (paths: { label: string; path: string; depth: number }[], base: string) =>
    paths.map(p => ({
      label: p.label,
      expr: `{{ ${base}${p.path} }}`,
      prefix: p.path.slice(0, Math.max(0, p.path.length - p.label.length)),
      depth: p.depth,
    }));

  const refGroups = useMemo(() => {
    if (!selectedNode) return [] as { title: string; vars: { label: string; expr: string; prefix?: string; depth?: number }[] }[];
    const groups: { title: string; vars: { label: string; expr: string; prefix?: string; depth?: number }[] }[] = [];
    const ups = nodes.filter(n => n.outputs.includes(selectedNode.id));

    // 触发数据：直接上游是触发器时字段已在当前输入里（$json），否则按节点名引用触发器输出
    const trigNode = nodes.find(n => n.typeId === 'trigger');
    const directTrig = ups.find(u => u.typeId === 'trigger');
    if (trigNode) {
      const exprFor = (f: string) => directTrig ? `{{ $json.${f} }}` : `{{ $('${trigNode.name}').json.${f} }}`;
      groups.push({ title: '触发数据', vars: TRIGGER_FIELDS.map(f => ({ label: f, expr: exprFor(f), depth: 0 })) });
    }

    const cur = (runResult?.node_results || []).find((n: any) => String(n.node_id) === String(selectedNode.id));
    const inputKeys: string[] = (cur && Array.isArray(cur.input_keys) && cur.input_keys.length) ? cur.input_keys : [];
    let curPaths: { label: string; path: string; depth: number }[] = [];
    if (ups.length) {
      const upSample = nodeSample(ups[0].id);
      if (upSample) curPaths = expandPaths(upSample);
    }
    if (!curPaths.length && inputKeys.length) {
      curPaths = inputKeys.map(k => ({ label: k, path: k, depth: 0 }));
    }
    if (!curPaths.length && ups.length) curPaths = refPaths(ups[0]);
    if (curPaths.length) {
      groups.push({ title: '当前输入 $json', vars: toVars(curPaths, '$json.') });
    }

    ups.forEach(u => {
      const paths = refPaths(u);
      groups.push({
        title: `上游 · ${u.name}`,
        vars: paths.length
          ? toVars(paths, `$('${u.name}').json.`)
          : [{ label: '试运行后显示字段', expr: `{{ $('${u.name}').json }}`, depth: 0 }],
      });
    });
    return groups;
  }, [selectedNode, nodes, runResult]);

  /** 变量 chip 的显示：父路径灰色前缀 + 末段正常色，并按层级缩进 */
  const renderVarLabel = (v: { label: string; prefix?: string; depth?: number }) => (
    <span className="inline-flex items-baseline whitespace-nowrap" style={{ marginLeft: (v.depth || 0) * 8 }}>
      {v.prefix ? <span className="text-text-muted/70">{v.prefix}</span> : null}
      <span>{v.label}</span>
    </span>
  );

  /** 把引用表达式插入到指定字段的光标位置 */
  const insertRef = (fieldName: string, expr: string) => {
    if (!selectedNode) return;
    const el = fieldRefs.current[fieldName];
    const cur = selectedNode.config[fieldName] || '';
    let next = cur;
    if (el && typeof el.selectionStart === 'number') {
      const s = el.selectionStart ?? cur.length;
      const e = el.selectionEnd ?? cur.length;
      next = cur.slice(0, s) + expr + cur.slice(e);
      requestAnimationFrame(() => {
        el.focus();
        const p = s + expr.length;
        try { el.setSelectionRange(p, p); } catch { /* number 输入不支持光标定位 */ }
      });
    } else {
      next = cur + expr;
    }
    updateNodeConfig(selectedNode.id, fieldName, next);
  };

  /** 把引用表达式插入集成动作参数值（写入 config.values） */
  const insertIntegrationRef = (name: string, expr: string) => {
    if (!selectedNode) return;
    const el = fieldRefs.current[`iv_${name}`];
    const cur = selectedNode.config.values?.[name] || '';
    let next = cur;
    if (el && typeof el.selectionStart === 'number') {
      const s = el.selectionStart ?? cur.length;
      const e = el.selectionEnd ?? cur.length;
      next = cur.slice(0, s) + expr + cur.slice(e);
      requestAnimationFrame(() => {
        el.focus();
        const p = s + expr.length;
        try { el.setSelectionRange(p, p); } catch { /* number 输入不支持光标定位 */ }
      });
    } else {
      next = cur + expr;
    }
    updateIntegrationValue(selectedNode.id, name, next);
  };

  /** 把引用表达式插入通用动作参数值（写入 config.values，键前缀 ap_） */
  const insertActionParamRef = (name: string, expr: string) => {
    if (!selectedNode) return;
    const el = fieldRefs.current[`ap_${name}`];
    const cur = selectedNode.config.values?.[name] || '';
    let next = cur;
    if (el && typeof el.selectionStart === 'number') {
      const s = el.selectionStart ?? cur.length;
      const e = el.selectionEnd ?? cur.length;
      next = cur.slice(0, s) + expr + cur.slice(e);
      requestAnimationFrame(() => {
        el.focus();
        const p = s + expr.length;
        try { el.setSelectionRange(p, p); } catch { /* number 输入不支持光标定位 */ }
      });
    } else {
      next = cur + expr;
    }
    updateIntegrationValue(selectedNode.id, name, next);
  };

  /** 应用 AI 场景预设（提示词 + 输出契约） */
  const applyScenario = (patch: Record<string, string>) => {
    if (!selectedNode || !editingPb) return;
    setEditingPb({
      ...editingPb,
      nodes: editingPb.nodes.map(n => n.id === selectedNode.id
        ? { ...n, config: { ...n.config, ...patch } } : n),
    });
  };

  // ===== 连线操作 =====
  const flashCanvas = (text: string, kind: 'success' | 'warn' = 'success') => {
    setCanvasFlash({ text, kind });
  };

  // flash 自动消失
  useEffect(() => {
    if (!canvasFlash) return;
    const t = setTimeout(() => setCanvasFlash(null), 2200);
    return () => clearTimeout(t);
  }, [canvasFlash]);

  /** 建立连线（带重复检测与提示）；返回是否成功 */
  const completeConnection = (fromId: string, toId: string): boolean => {
    if (!editingPb || fromId === toId) return false;
    const fromNode = editingPb.nodes.find(n => n.id === fromId);
    if (!fromNode) return false;
    const outputs = Array.isArray(fromNode.outputs) ? fromNode.outputs : [];
    if (outputs.includes(toId)) {
      flashCanvas('该连线已存在', 'warn');
      return false;
    }
    setEditingPb({
      ...editingPb,
      nodes: editingPb.nodes.map(n => n.id === fromId ? { ...n, outputs: [...outputs, toId] } : n),
    });
    // 条件节点分支语义：引擎只认前两条输出（真分支/假分支），超出部分不生效
    if (fromNode.typeId === 'condition' && outputs.length >= 2) {
      flashCanvas('连线已创建，但条件分支仅生效前两条（真/假）', 'warn');
    } else {
      flashCanvas('连线已创建', 'success');
    }
    setConnectingFrom(null);
    return true;
  };

  const handleNodeClick = (nodeId: string) => {
    if (connectingFrom) {
      // 完成连线（点击式：先点输出端口，再点目标节点）
      completeConnection(connectingFrom, nodeId);
    } else {
      setSelectedNodeId(nodeId);
    }
  };

  /** 端口按下：阻止冒泡到节点拖拽，进入（拖拽）连线模式 */
  const startConnecting = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setConnectingFrom(nodeId);
    setSelectedNodeId(nodeId);
    setDragLine({ fromId: nodeId, x: e.clientX, y: e.clientY });
  };

  // 拖拽连线：document 级监听 mousemove 更新预览终点，mouseup 落在目标节点上完成连接
  useEffect(() => {
    if (!dragLine) return;
    const onMove = (ev: MouseEvent) => {
      setDragLine({ fromId: dragLine.fromId, x: ev.clientX, y: ev.clientY });
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setDragLine(null);
        setConnectingFrom(null);
      }
    };
    const onUp = (ev: MouseEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const nodeEl = el?.closest('[data-node-id]') as HTMLElement | null;
      const targetId = nodeEl?.dataset.nodeId;
      if (targetId && targetId !== dragLine.fromId) {
        completeConnection(dragLine.fromId, targetId);
      }
      // 纯点击（未拖动）时保留 connectingFrom，由后续点击目标节点完成连线
      setDragLine(null);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('keydown', onKey);
    };
  }, [dragLine, editingPb]);

  const removeConnection = (fromId: string, toId: string) => {
    if (!editingPb) return;
    setEditingPb({
      ...editingPb,
      nodes: editingPb.nodes.map(n => n.id === fromId ? { ...n, outputs: n.outputs.filter(o => o !== toId) } : n),
    });
  };

  // ===== 拖拽节点 =====
  const handleNodeDrag = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editingPb) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const node = editingPb.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const origX = node.position.x;
    const origY = node.position.y;

    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      setEditingPb(prev => prev ? {
        ...prev,
        nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, position: { x: origX + dx, y: origY + dy } } : n),
      } : prev);
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // ===== 画布拖拽放置 =====
  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const typeId = e.dataTransfer.getData('nodeType');
    if (!typeId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left + canvasRef.current.scrollLeft) / scale - NODE_W / 2;
    const y = (e.clientY - rect.top + canvasRef.current.scrollTop) / scale - NODE_H / 2;
    addNode(typeId, Math.max(10, x), Math.max(10, y));
  };

  // ===== 画布缩放 / 平移（Coze 风格）=====
  const clampScale = (s: number) => Math.min(2, Math.max(0.4, s));

  // 滚轮缩放：以光标为锚点（保持光标下的世界坐标不动）
  const handleWheel = (e: React.WheelEvent) => {
    if (!canvasRef.current) return;
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const worldX = (e.clientX - rect.left + canvasRef.current.scrollLeft) / scale;
    const worldY = (e.clientY - rect.top + canvasRef.current.scrollTop) / scale;
    const next = clampScale(scale * (e.deltaY < 0 ? 1.1 : 0.9));
    setScale(next);
    requestAnimationFrame(() => {
      if (!canvasRef.current) return;
      canvasRef.current.scrollLeft = worldX * next - (e.clientX - rect.left);
      canvasRef.current.scrollTop = worldY * next - (e.clientY - rect.top);
    });
  };

  // 背景按下拖拽平移（节点/端口已阻止冒泡，不会触发）
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = canvasRef.current.scrollLeft;
    const startTop = canvasRef.current.scrollTop;
    didPanRef.current = false;
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didPanRef.current = true;
      if (canvasRef.current) {
        canvasRef.current.scrollLeft = startLeft - dx;
        canvasRef.current.scrollTop = startTop - dy;
      }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // 适配视图：计算节点包围盒并缩放/滚动居中
  const fitView = () => {
    if (!canvasRef.current) return;
    if (nodes.length === 0) { setScale(1); return; }
    const xs = nodes.map(n => n.position.x);
    const ys = nodes.map(n => n.position.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs) + NODE_W;
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys) + NODE_H;
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const rect = canvasRef.current.getBoundingClientRect();
    const pad = 60;
    const next = clampScale(Math.min((rect.width - pad) / bw, (rect.height - pad) / bh));
    setScale(next);
    requestAnimationFrame(() => {
      if (!canvasRef.current) return;
      canvasRef.current.scrollLeft = minX * next - (rect.width - bw * next) / 2;
      canvasRef.current.scrollTop = minY * next - (rect.height - bh * next) / 2;
    });
  };

  // 按钮缩放（以画布中心为锚点）
  const zoomBy = (factor: number) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const worldX = (cx + canvasRef.current.scrollLeft) / scale;
    const worldY = (cy + canvasRef.current.scrollTop) / scale;
    const next = clampScale(scale * factor);
    setScale(next);
    requestAnimationFrame(() => {
      if (!canvasRef.current) return;
      canvasRef.current.scrollLeft = worldX * next - cx;
      canvasRef.current.scrollTop = worldY * next - cy;
    });
  };

  // 自动布局：按连线 BFS 从左到右分列（Coze「自动整理」思路）
  const autoLayout = () => {
    if (!editingPb || editingPb.nodes.length === 0) return;
    const ns = editingPb.nodes;
    const adj = new Map<string, string[]>();
    ns.forEach(n => adj.set(n.id, (n.outputs || []).filter(o => ns.some(t => t.id === o))));
    const visited = new Set<string>();
    const order: string[] = [];
    const bfs = (start: string) => {
      const q = [start];
      while (q.length) {
        const cur = q.shift()!;
        if (visited.has(cur)) continue;
        visited.add(cur);
        order.push(cur);
        (adj.get(cur) || []).forEach(o => { if (!visited.has(o)) q.push(o); });
      }
    };
    // 入度为 0 的作为根，依次 BFS；其余未访问到的再补
    const indeg = new Map<string, number>();
    ns.forEach(n => indeg.set(n.id, 0));
    ns.forEach(n => (adj.get(n.id) || []).forEach(o => indeg.set(o, (indeg.get(o) || 0) + 1)));
    ns.filter(n => (indeg.get(n.id) || 0) === 0).forEach(n => bfs(n.id));
    ns.filter(n => !visited.has(n.id)).forEach(n => bfs(n.id));
    const col = new Map<string, number>();
    order.forEach(id => {
      const parents = ns.filter(n => (n.outputs || []).includes(id));
      const pcol = parents.length ? Math.max(...parents.map(p => col.get(p.id) ?? 0)) : 0;
      col.set(id, parents.length ? pcol + 1 : 0);
    });
    const rowCount = new Map<number, number>();
    const COL_GAP = 72;
    const ROW_GAP = 26;
    const next = ns.map(n => {
      const c = col.get(n.id) || 0;
      const r = rowCount.get(c) || 0;
      rowCount.set(c, r + 1);
      return { ...n, position: { x: 64 + c * (NODE_W + COL_GAP), y: 56 + r * (NODE_H + ROW_GAP) } };
    });
    setEditingPb({ ...editingPb, nodes: next });
    setTimeout(fitView, 60);
  };

  // 剧本统计
  const playbookStats = useMemo(() => {
    const total = playbooks.length;
    const enabled = playbooks.filter(p => p.enabled).length;
    return { total, enabled, disabled: total - enabled };
  }, [playbooks]);

  // ===== 审批中心 =====
  const fetchApprovals = async (tab?: 'pending' | 'processed') => {
    const t = tab || approvalTab;
    setApprovalsLoading(true);
    try {
      const res = await playbooksApi.getApprovals(
        t === 'pending' ? { status: 'pending', limit: 50 } : { limit: 50 });
      const items: ApprovalRecord[] = res?.data?.items || (Array.isArray(res?.data) ? res.data : []);
      setApprovals(items);
      if (t === 'pending') setPendingApprovalCount(items.length);
    } catch {
      setApprovals([]);
    } finally {
      setApprovalsLoading(false);
    }
  };

  const openApprovals = () => {
    setShowApprovals(true);
    fetchApprovals();
  };
  // 页面加载时拉一次待审批数（角标）
  useEffect(() => {
    playbooksApi.getApprovals({ status: 'pending', limit: 1 })
      .then(res => {
        const d = res?.data;
        setPendingApprovalCount(d?.total ?? (Array.isArray(d) ? d.length : d?.items?.length ?? 0));
      })
      .catch(() => {});
  }, []);

  const switchApprovalTab = (tab: 'pending' | 'processed') => {
    setApprovalTab(tab);
    fetchApprovals(tab);
  };

  const handleProcessApproval = async (a: ApprovalRecord, approved: boolean) => {
    setProcessingApproval(String(a.id));
    try {
      await playbooksApi.processApproval(String(a.id), approved);
      const pbName = playbooks.find(p => String(p.id) === String(a.playbook_id))?.name || `#${a.playbook_id}`;
      setExecMsg(approved
        ? `已批准「${pbName}」执行申请，剧本已自动执行`
        : `已拒绝「${pbName}」执行申请，已通知申请人`);
      fetchApprovals();
    } catch (e: any) {
      setExecMsg(e?.message || '审批操作失败');
    } finally {
      setProcessingApproval(null);
    }
  };

  // ===== 渲染 =====
  return (
    <ContentContainer>
      <PageHeader
        icon={Workflow}
        title="剧本编排"        actions={
          <>
            <Button variant="secondary" icon={Shield} onClick={openApprovals}>
              审批中心{pendingApprovalCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-danger-solid text-white text-[10px] leading-none">
                  {pendingApprovalCount}
                </span>
              )}
            </Button>
            <Button variant="primary" icon={Plus} onClick={newPlaybook}>
              新建剧本
            </Button>
          </>
        }
      />

      {/* 视图切换 */}
      <Segmented
        value={viewMode}
        onChange={v => setViewMode(v)}
        items={[
          { value: 'list', label: '剧本列表' },
          { value: 'records', label: '执行记录' },
        ]}
      />

      {viewMode === 'records' && <PlaybookExecutions />}

      {/* 统计栏 */}
      {viewMode === 'list' && (
      <div className="app-grid">
        <StatCard label="总剧本" value={playbookStats.total} icon={Workflow} tone="primary" />
        <StatCard label="已启用" value={playbookStats.enabled} icon={Play} tone="success" />
        <StatCard label="已禁用" value={playbookStats.disabled} icon={EyeOff} tone="neutral" />
      </div>
      )}

      {/* 手动触发 / 执行反馈 */}
      {execMsg && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-primary/10 border border-primary/30 text-xs text-primary">
          {execMsg}
        </div>
      )}

      {/* 审批中心弹窗 */}
      <Modal open={showApprovals} onClose={() => setShowApprovals(false)} width={720}
        title="审批中心" description="剧本执行审批申请：批准后剧本将以申请时保存的入参自动执行">
        <div className="flex items-center gap-2 mb-3">
          {([['pending', `待审批${pendingApprovalCount ? ` (${pendingApprovalCount})` : ''}`],
             ['processed', '已处理']] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => switchApprovalTab(key)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${approvalTab === key
                ? 'bg-primary/10 border-primary/40 text-primary'
                : 'bg-page-bg border-border-color text-text-muted hover:text-text-primary'}`}>
              {label}
            </button>
          ))}
          <button type="button" onClick={() => fetchApprovals()}
            className="ml-auto text-text-muted hover:text-text-primary transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${approvalsLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {approvalsLoading && approvals.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-text-muted">
            <RefreshCw className="w-4 h-4 animate-spin" /> 加载中...
          </div>
        )}
        {!approvalsLoading && approvals.length === 0 && (
          <div className="py-8 text-center text-xs text-text-muted">
            {approvalTab === 'pending' ? '暂无待审批申请' : '暂无已处理记录'}
          </div>
        )}
        <div className="space-y-2">
          {approvals.map(a => {
            const pbName = playbooks.find(p => String(p.id) === String(a.playbook_id))?.name
              || `剧本 #${a.playbook_id}`;
            const paramText = Object.entries(a.params || {})
              .map(([k, v]) => `${k}=${String(v).slice(0, 40)}`).join('，');
            return (
              <div key={a.id} className="p-3 bg-page-bg border border-border-color rounded-lg">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-text-primary truncate">
                      {pbName}
                      <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${
                        a.status === 'pending' ? 'bg-warning/15 text-warning'
                        : a.status === 'approved' ? 'bg-success/15 text-success'
                        : 'bg-danger/15 text-danger'}`}>
                        {a.status === 'pending' ? '待审批' : a.status === 'approved' ? '已批准' : '已拒绝'}
                      </span>
                    </p>
                    <p className="text-[11px] text-text-muted mt-0.5">
                      申请人：{a.requester_name || '未知'}
                      {a.related_event_id ? ` · 事件 ${a.related_event_id}` : ''}
                      · {a.created_at?.replace('T', ' ').slice(0, 16)}
                    </p>
                    {a.reason && <p className="text-[11px] text-text-secondary mt-1">原因：{a.reason}</p>}
                    {paramText && <p className="text-[10.5px] text-text-muted mt-0.5 font-mono break-all">入参：{paramText}</p>}
                    {a.status === 'approved' && a.result && (
                      <p className={`text-[11px] mt-1 ${a.result.status === 'completed' ? 'text-success' : 'text-danger'}`}>
                        执行结果：{a.result.status === 'completed'
                          ? `成功（${a.result.nodes_executed} 个节点${a.result.failed_nodes?.length ? `，失败节点: ${a.result.failed_nodes.join('、')}` : ''}）`
                          : `失败${a.result.error ? `（${a.result.error}）` : ''}`}
                      </p>
                    )}
                    {a.status !== 'pending' && a.approver_name && (
                      <p className="text-[10.5px] text-text-muted mt-0.5">
                        审批人：{a.approver_name} · {a.approved_at?.replace('T', ' ').slice(0, 16)}
                      </p>
                    )}
                  </div>
                  {a.status === 'pending' && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button type="button" disabled={processingApproval === String(a.id)}
                        onClick={() => handleProcessApproval(a, true)}
                        className="px-2.5 py-1.5 text-xs rounded-lg bg-success-solid text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> 批准
                      </button>
                      <button type="button" disabled={processingApproval === String(a.id)}
                        onClick={() => handleProcessApproval(a, false)}
                        className="px-2.5 py-1.5 text-xs rounded-lg bg-page-bg border border-border-color text-text-secondary hover:text-danger hover:border-danger/40 transition-colors disabled:opacity-50 flex items-center gap-1">
                        <X className="w-3.5 h-3.5" /> 拒绝
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Modal>

      {/* 剧本卡片列表 */}
      {viewMode === 'list' && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {playbooks.map(pb => (
          <motion.div key={pb.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="bg-card-bg border border-border-color rounded-card overflow-hidden hover:border-primary/30 transition-all">
            <div className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-text-primary truncate">{pb.name}</h3>
                  <p className="text-xs text-text-muted mt-0.5 line-clamp-1">{pb.description || '暂无描述'}</p>
                </div>
                <Switch
                  size="sm"
                  checked={pb.enabled}
                  onChange={() => toggleEnabled(pb.id)}
                  label={`启用 ${pb.name}`}
                  className="ml-3"
                />
              </div>
              {/* 节点流预览 */}
              <div className="flex items-center gap-1 my-3 flex-wrap">
                {pb.nodes.map((node, i) => {
                  const nt = NODE_TYPES.find(n => n.id === node.typeId);
                  return (
                    <React.Fragment key={node.id}>
                      <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-page-bg border border-border-color flex-shrink-0">
                        {nt && <nt.icon className="w-3 h-3" style={{ color: nt.color }} />}
                        <span className="text-[10px] text-text-primary whitespace-nowrap">{node.name}</span>
                      </div>
                      {i < pb.nodes.length - 1 && <ArrowRight className="w-3 h-3 text-text-muted flex-shrink-0" />}
                    </React.Fragment>
                  );
                })}
              </div>
              {/* 元信息 */}
              <div className="flex items-center gap-3 text-xs text-text-muted">
                <span>{pb.nodes.length} 个节点</span>
                <span>触发: {getTriggerType(pb)}</span>
                {pb.approval_required && (
                  <span className="px-1.5 py-0.5 rounded bg-warning/15 text-warning">执行需审批</span>
                )}
                <span className={`ml-auto px-1.5 py-0.5 rounded ${pb.enabled ? 'bg-success/15 text-success' : 'bg-surface-3 text-text-muted'}`}>{pb.enabled ? '已启用' : '已禁用'}</span>
              </div>
            </div>
            {/* 操作栏 */}
            <div className="flex items-center border-t border-border-color">
              <button
                onClick={() => runManual(pb)}
                disabled={isEventTriggered(pb)}
                title={isEventTriggered(pb) ? '事件触发剧本需由安全事件/告警提供数据，请在事件工作台执行' : '手动运行该剧本'}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-success hover:bg-success/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <Play className="w-3.5 h-3.5" /> 运行
              </button>
              <button onClick={() => openEditor(pb)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-text-secondary hover:text-primary hover:bg-page-bg transition-colors">
                <Edit2 className="w-3.5 h-3.5" /> 编辑
              </button>
              <button onClick={() => duplicatePlaybook(pb)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-text-secondary hover:text-primary hover:bg-page-bg transition-colors">
                <Copy className="w-3.5 h-3.5" /> 复制
              </button>
              <button onClick={() => deletePlaybook(pb.id)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> 删除
              </button>
            </div>
          </motion.div>
        ))}
      </div>
      )}

      {/* ========== 编辑器弹窗 ========== */}
      <AnimatePresence>
        {showEditor && editingPb && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-[rgb(4_8_20_/_70%)] z-50" onClick={() => setShowEditor(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-4 z-50 pointer-events-none">
              <div className="w-full h-full bg-card-bg rounded-card border border-border-color overflow-hidden pointer-events-auto flex flex-col">

                {/* 编辑器头部 */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-border-color bg-page-bg/50">
                  <div className="flex items-center gap-3">
                    <input value={editingPb.name} onChange={e => setEditingPb({ ...editingPb, name: e.target.value })}
                      className="text-base font-semibold text-text-primary bg-transparent border-none outline-none" />
                    <span className="text-xs text-text-muted px-2 py-0.5 bg-page-bg rounded">{editingPb.nodes.length} 节点</span>
                    {/* 执行需审批：剧本配置项（作者设置），事件工作台执行时自动走审批流 */}
                    <label className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-page-bg border border-border-color cursor-pointer select-none"
                      title="开启后，事件工作台执行该剧本时需先提交审批，批准后自动执行">
                      <input type="checkbox" checked={!!editingPb.approval_required}
                        onChange={e => setEditingPb({ ...editingPb, approval_required: e.target.checked })}
                        className="w-3 h-3 accent-[rgb(var(--color-primary))]" />
                      <span className={`text-[11px] ${editingPb.approval_required ? 'text-warning' : 'text-text-muted'}`}>执行需审批</span>
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={autoLayout} title="按连线从左到右自动整理布局"
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-border-color text-text-secondary rounded-lg text-xs hover:bg-page-bg hover:text-text-primary transition-colors">
                      <LayoutGrid className="w-3.5 h-3.5" /> 自动布局
                    </button>
                    <button onClick={runManualEditor} disabled={runningManual || isEventTriggered(editingPb)}
                      title={isEventTriggered(editingPb) ? '事件触发剧本需由安全事件/告警提供数据，请在事件工作台执行' : '手动运行该剧本'}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-success/50 text-success rounded-lg text-xs hover:bg-success/10 disabled:opacity-50 disabled:cursor-not-allowed">
                      <Play className="w-3.5 h-3.5" /> {runningManual ? '运行中…' : '运行'}
                    </button>
                    <button onClick={runPlaybook} disabled={running || simLoading}
                      title={isEventTriggered(editingPb) ? '提供模拟事件/告警上下文后试运行' : '保存后立刻执行一次并展示每个节点的数据'}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-primary/50 text-primary rounded-lg text-xs hover:bg-primary/10 disabled:opacity-50">
                      <Play className="w-3.5 h-3.5" /> {running || simLoading ? '执行中…' : '试运行'}
                    </button>
                    <button onClick={savePlaybook} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-xs hover:bg-primary-hover">
                      <Save className="w-3.5 h-3.5" /> 保存
                    </button>
                    <button onClick={() => setShowEditor(false)} className="p-1.5 text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
                  </div>
                </div>

                <div className="flex-1 flex overflow-hidden">
                  {/* 左侧：节点面板 */}
                  <div className="w-56 border-r border-border-color bg-page-bg/30 flex flex-col flex-shrink-0">
                    <div className="p-3 pb-2 border-b border-border-color">
                      <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">节点组件</h3>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
                        <input value={nodeSearch} onChange={e => setNodeSearch(e.target.value)}
                          placeholder="搜索节点…"
                          className="w-full pl-7 pr-2 py-1.5 bg-card-bg border border-border-color rounded-lg text-[11px] text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none" />
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3">
                    {CATEGORIES.map(cat => {
                      const kw = nodeSearch.trim().toLowerCase();
                      const items = NODE_TYPES.filter(n => n.category === cat && (kw === '' || (n.name + n.desc).toLowerCase().includes(kw)));
                      if (items.length === 0) return null;
                      return (
                        <div key={cat} className="mb-3">
                          <p className="text-[10px] text-text-muted mb-1.5 font-medium">{cat}</p>
                          <div className="space-y-1">
                            {items.map(nt => (
                              <div key={nt.id} draggable onDragStart={e => e.dataTransfer.setData('nodeType', nt.id)}
                                onMouseDown={(e) => { libMouseDown.current = { x: e.clientX, y: e.clientY }; }}
                                onMouseUp={(e) => {
                                  const s = libMouseDown.current; libMouseDown.current = null;
                                  if (s && Math.abs(e.clientX - s.x) < 4 && Math.abs(e.clientY - s.y) < 4 && canvasRef.current) {
                                    const rect = canvasRef.current.getBoundingClientRect();
                                    const x = (rect.width / 2 + canvasRef.current.scrollLeft) / scale - NODE_W / 2;
                                    const y = (rect.height / 2 + canvasRef.current.scrollTop) / scale - NODE_H / 2;
                                    addNode(nt.id, Math.max(10, x), Math.max(10, y));
                                  }
                                }}
                                title={`${nt.desc}（拖拽或点击添加到画布）`}
                                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-grab active:cursor-grabbing transition-colors border border-transparent hover:border-border-color">
                                <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0" style={{ background: nt.bg }}>
                                  <nt.icon className="w-3.5 h-3.5" style={{ color: nt.color }} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <span className="text-[11px] text-text-primary block truncate">{nt.name}</span>
                                  <span className="text-[9px] text-text-muted block truncate">{nt.desc}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {/* 集成应用动作（Shuffle / OpenAPI 导入，点击插入带动态参数表单的节点） */}
                    <div className="mb-3">
                      <p className="text-[10px] text-text-muted mb-1.5 font-medium flex items-center gap-1">
                        <Plug className="w-3 h-3" />集成应用动作
                      </p>
                      {integrationApps.length === 0 ? (
                        <p className="text-[10px] leading-relaxed text-text-muted/70">
                          暂无集成应用。前往「响应与自动化 → 集成应用」导入 Shuffle / OpenAPI 规范。
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {integrationApps.filter(a => a.enabled).map(app => (
                            <div key={app.id}>
                              <button
                                onClick={() => toggleAppExpand(app.id)}
                                className="flex w-full items-center gap-1.5 px-2 py-1.5 rounded-lg border border-transparent hover:border-border-color hover:bg-white/5 text-left transition-colors">
                                {expandedAppId === app.id
                                  ? <ChevronDown className="w-3 h-3 text-text-muted flex-shrink-0" />
                                  : <ChevronRight className="w-3 h-3 text-text-muted flex-shrink-0" />}
                                <span className="text-[11px] text-text-primary truncate flex-1">{app.name}</span>
                                <span className="text-[9px] text-text-muted flex-shrink-0">{app.action_count}</span>
                              </button>
                              {expandedAppId === app.id && (
                                <div className="ml-3 mt-0.5 max-h-44 overflow-y-auto space-y-0.5">
                                  {(appActionsCache[app.id] || []).map(action => (
                                    <button key={action.id}
                                      onClick={() => addIntegrationNode(app, action)}
                                      title={`${action.method} ${action.path}`}
                                      className="flex w-full items-center gap-1.5 px-1.5 py-1 rounded hover:bg-white/5 text-left transition-colors">
                                      <span className={`flex-shrink-0 rounded px-1 py-0.5 font-mono text-[8.5px] font-medium ${METHOD_COLORS[action.method] || 'bg-page-bg text-text-muted'}`}>
                                        {action.method}
                                      </span>
                                      <span className="text-[10px] text-text-secondary truncate">{action.name}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    </div>
                  </div>

                  {/* 中间：画布 */}
                  <div ref={canvasRef} className="flex-1 relative overflow-auto bg-page-bg/20"
                    onDragOver={e => e.preventDefault()}
                    onDrop={handleCanvasDrop}
                    onWheel={handleWheel}
                    onMouseDown={handleCanvasMouseDown}
                    onClick={() => {
                      if (didPanRef.current) { didPanRef.current = false; return; }
                      if (connectingFrom) setConnectingFrom(null); else setSelectedNodeId(null);
                    }}>
                    {/* 空状态 */}
                    {nodes.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="text-center text-text-muted">
                          <LayoutGrid className="w-12 h-12 mx-auto mb-3 opacity-15" />
                          <p className="text-sm">从左侧拖拽或点击节点添加到画布</p>
                        </div>
                      </div>
                    )}
                    {/* 缩放内容层：world 坐标，整体随 scale 变换；点阵网格背景随缩放同步 */}
                    <div className="relative origin-top-left"
                      style={{
                        width: canvasContentW, height: canvasContentH,
                        minWidth: '100%', minHeight: '100%',
                        transform: `scale(${scale})`, transformOrigin: '0 0',
                        backgroundImage: 'radial-gradient(circle, rgba(120,130,160,0.16) 1px, transparent 1px)',
                        backgroundSize: '22px 22px',
                      }}>
                    {/* 连线 */}
                    <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 1, width: canvasContentW, height: canvasContentH, minWidth: '100%', minHeight: '100%' }} overflow="visible">
                      <defs>
                        <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                          <path d="M0,0 L8,4 L0,8 Z" fill="#6366f1" />
                        </marker>
                      </defs>
                  {nodes.map(node => node.outputs.map(outId => {
                      const target = nodes.find(n => n.id === outId);
                      if (!target) return null;
                      const x1 = node.position.x + NODE_W;
                      const y1 = node.position.y + NODE_H / 2;
                      const x2 = target.position.x;
                      const y2 = target.position.y + NODE_H / 2;
                      const mx = (x1 + x2) / 2;
                      return (
                        <g key={`${node.id}-${outId}`} style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                          onClick={(e) => { e.stopPropagation(); removeConnection(node.id, outId); }}
                          className="group">
                          <path d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                            stroke="#6366f1" strokeWidth="2" fill="none" markerEnd="url(#arrow)"
                            className="transition-[stroke,stroke-width] group-hover:stroke-[#818cf8] group-hover:[stroke-width:3]" />
                          <path d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                            stroke="transparent" strokeWidth="12" fill="none" />
                        </g>
                      );
                    }))}
                    {/* 拖拽连线预览虚线（client 坐标换算为画布坐标） */}
                    {dragLine && canvasRef.current && (() => {
                      const rect = canvasRef.current.getBoundingClientRect();
                      const fromNode = nodes.find(n => n.id === dragLine.fromId);
                      if (!fromNode) return null;
                      const x1 = fromNode.position.x + NODE_W;
                      const y1 = fromNode.position.y + NODE_H / 2;
                      const x2 = (dragLine.x - rect.left + canvasRef.current.scrollLeft) / scale;
                      const y2 = (dragLine.y - rect.top + canvasRef.current.scrollTop) / scale;
                      return (
                        <path d={`M${x1},${y1} L${x2},${y2}`} stroke="#6366f1" strokeWidth="2"
                          strokeDasharray="5,3" fill="none" opacity="0.85" pointerEvents="none" />
                      );
                    })()}
                  </svg>
                    {/* 节点 */}
                    {nodes.map(node => {
                      const nt = NODE_TYPES.find(n => n.id === node.typeId);
                      const isSelected = selectedNodeId === node.id;
                      const isConnecting = connectingFrom === node.id;
                      return (
                        <div key={node.id}
                          data-node-id={node.id}
                          style={{ position: 'absolute', left: node.position.x, top: node.position.y, width: NODE_W, height: NODE_H, zIndex: isSelected ? 10 : 2 }}
                          className={`rounded-lg border-2 transition-all cursor-pointer select-none ${isConnecting ? 'border-dashed border-primary shadow-panel shadow-primary/20' : isSelected ? 'border-primary shadow-panel shadow-primary/10' : 'border-border-color hover:border-primary/40'}`}
                          onClick={e => { e.stopPropagation(); handleNodeClick(node.id); }}
                          onMouseDown={e => handleNodeDrag(node.id, e)}>
                          <div className="h-full flex flex-col justify-center pl-3.5 pr-3 py-1.5" style={{ background: nt?.bg || '#fff' }}>
                            <div className="flex items-center gap-2 min-w-0">
                              {nt && (
                                <span className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: (nt.color || '#94a3b8') + '24' }}>
                                  <nt.icon className="w-3.5 h-3.5" style={{ color: nt.color }} />
                                </span>
                              )}
                              <span className="text-xs font-semibold text-text-primary truncate leading-tight">{node.name}</span>
                            </div>
                            <p className="text-[10px] text-text-muted mt-0.5 truncate pl-8">{nodeSummary(node) || nt?.desc}</p>
                          </div>
                          {/* 左侧类型色条 */}
                          <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg" style={{ background: nt?.color || '#94a3b8' }} />
                          {/* 输出连接点：支持拖拽连线（按住拖出预览线）与点击连线两种手势 */}
                          <div
                            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3.5 h-3.5 rounded-full bg-primary border-2 border-white cursor-crosshair hover:scale-125 transition-transform z-20"
                            onMouseDown={e => startConnecting(node.id, e)}
                            onClick={e => { e.stopPropagation(); setConnectingFrom(node.id); setSelectedNodeId(node.id); }}
                            title="拖拽到目标节点完成连线" />
                          {/* 输入连接点 */}
                          {node.typeId !== 'trigger' && (
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-card-bg border-2 border-primary cursor-pointer hover:scale-125 transition-transform z-20"
                              onClick={e => { e.stopPropagation(); if (connectingFrom) handleNodeClick(node.id); }} />
                          )}
                          {/* 删除 */}
                          {isSelected && (
                            <button onClick={e => { e.stopPropagation(); removeNode(node.id); }}
                              className="absolute -top-2 -right-2 w-5 h-5 bg-danger-solid text-white rounded-full flex items-center justify-center hover:bg-danger-solid-hover z-20">
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                    </div>{/* ===== 缩放内容层结束 ===== */}
                    {/* 连线模式提示 / 拖拽提示 / 操作反馈 */}
                    {dragLine && (
                      <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-primary/90 text-white text-xs rounded-full z-50 shadow-panel">
                        松开鼠标完成连线 · Esc 取消
                      </div>
                    )}
                    {!dragLine && connectingFrom && (
                      <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-primary/90 text-white text-xs rounded-full z-50">
                        点击目标节点完成连线，或点击画布取消
                      </div>
                    )}
                    {canvasFlash && (
                      <div className={`absolute top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 text-white text-xs rounded-full z-50 shadow-panel ${canvasFlash.kind === 'warn' ? 'bg-warning-solid' : 'bg-success-solid'}`}>
                        {canvasFlash.text}
                      </div>
                    )}
                    {/* 缩放控制条（Coze 风格，右下角） */}
                    <div className="absolute bottom-4 right-4 z-40 flex items-center gap-0.5 px-1 py-1 rounded-xl bg-card-bg/90 border border-border-color shadow-panel backdrop-blur">
                      <button onClick={() => zoomBy(1 / 1.2)} title="缩小"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-text-secondary hover:bg-page-bg hover:text-text-primary transition-colors">
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => { setScale(1); setTimeout(fitView, 0); }} title="点击适配视图"
                        className="min-w-[44px] h-7 px-1 flex items-center justify-center rounded-lg text-[11px] font-medium text-text-secondary hover:bg-page-bg hover:text-text-primary transition-colors">
                        {Math.round(scale * 100)}%
                      </button>
                      <button onClick={() => zoomBy(1.2)} title="放大"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-text-secondary hover:bg-page-bg hover:text-text-primary transition-colors">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <div className="w-px h-4 bg-border-color mx-0.5" />
                      <button onClick={fitView} title="适配视图"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-text-secondary hover:bg-page-bg hover:text-text-primary transition-colors">
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* 右侧：配置面板 */}
                  <div className="w-96 border-l border-border-color bg-page-bg/30 flex-shrink-0 overflow-y-auto">
                    {selectedNode ? (
                      <div className="p-4">
                        <div className="flex items-center gap-2 mb-4">
                          {(() => { const nt = NODE_TYPES.find(n => n.id === selectedNode.typeId); return nt ? <nt.icon className="w-5 h-5" style={{ color: nt.color }} /> : null; })()}
                          <h3 className="text-sm font-semibold text-text-primary">节点配置</h3>
                        </div>
                        {/* 名称 */}
                        <div className="mb-3">
                          <label className="block text-xs text-text-muted mb-1">节点名称</label>
                          <input value={selectedNode.name} onChange={e => updateNodeName(selectedNode.id, e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-card-bg border border-border-color rounded-lg text-xs text-text-primary focus:border-primary focus:outline-none" />
                        </div>
                        {/* 类型信息 */}
                        <div className="mb-3 px-2.5 py-2 bg-page-bg rounded-lg">
                          <div className="flex items-center gap-2 text-xs text-text-muted">
                            <span>类型:</span>
                            <span className="text-text-primary font-medium">{NODE_TYPES.find(n => n.id === selectedNode.typeId)?.name}</span>
                          </div>
                        </div>
                        {/* 触发器节点：内置可用字段速查，解决「难以引用触发数据 / 不知道有哪些参数」 */}
                        {selectedNode.typeId === 'trigger' && (
                          <div className="mb-3 px-2.5 py-2 bg-page-bg rounded-lg border border-border-color">
                            <p className="text-[10px] font-semibold text-text-muted mb-1.5">
                              触发数据可用字段（下游用 <code className="text-primary font-mono">{'{{ 字段名 }}'}</code> 引用）
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {TRIGGER_FIELDS.map(f => (
                                <span key={f} className="px-1.5 py-0.5 text-[10px] rounded bg-card-bg border border-border-color text-text-secondary font-mono">{`{{ ${f} }}`}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* AI 节点：场景预设 + 输出字段编辑器（Coze「大模型」节点） */}
                        {selectedNode.typeId === 'ai' && (() => {
                          let aiFields: any[] = [];
                          try {
                            const parsed = JSON.parse(selectedNode.config.output_fields || '[]');
                            if (Array.isArray(parsed)) aiFields = parsed;
                          } catch { aiFields = []; }
                          const commitFields = (next: any[]) =>
                            updateNodeConfig(selectedNode.id, 'output_fields', JSON.stringify(next));
                          return (
                            <div className="mb-3 px-2.5 py-2 bg-page-bg rounded-lg border border-border-color">
                              <p className="text-[10px] font-semibold text-text-muted mb-1.5">场景预设（填充提示词与输出契约）</p>
                              <div className="flex flex-wrap gap-1 mb-2.5">
                                {AI_SCENARIOS.map(s => (
                                  <button key={s.id} type="button" onClick={() => applyScenario(s.patch)}
                                    className="px-2 py-1 text-[10px] rounded border border-border-color text-text-secondary hover:text-text-primary hover:border-primary transition-colors">
                                    {s.name}
                                  </button>
                                ))}
                              </div>
                              <div className="flex items-center justify-between mb-1.5">
                                <p className="text-[10px] font-semibold text-text-muted">输出字段（下游用「节点名.字段」引用）</p>
                                <button type="button" onClick={() => commitFields([...aiFields, { name: `field_${aiFields.length + 1}`, type: 'string', desc: '' }])}
                                  className="text-[10px] text-primary hover:underline">+ 添加</button>
                              </div>
                              {aiFields.length === 0 && (
                                <p className="text-[10px] text-text-muted">未定义输出字段。json 模式建议定义；text 模式结果写入 ai_text</p>
                              )}
                              {aiFields.map((f, i) => (
                                <div key={i} className="flex items-center gap-1 mb-1">
                                  <input value={f.name || ''} placeholder="字段名"
                                    onChange={e => { const n = [...aiFields]; n[i] = { ...f, name: e.target.value }; commitFields(n); }}
                                    className="w-20 px-1.5 py-1 bg-card-bg border border-border-color rounded text-[10px] text-text-primary focus:border-primary focus:outline-none" />
                                  <select value={f.type || 'string'}
                                    onChange={e => { const n = [...aiFields]; n[i] = { ...f, type: e.target.value }; commitFields(n); }}
                                    className="w-16 px-1 py-1 bg-card-bg border border-border-color rounded text-[10px] text-text-primary focus:border-primary focus:outline-none">
                                    {['string', 'number', 'boolean', 'object', 'array'].map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                  <input value={f.desc || ''} placeholder="说明"
                                    onChange={e => { const n = [...aiFields]; n[i] = { ...f, desc: e.target.value }; commitFields(n); }}
                                    className="flex-1 min-w-0 px-1.5 py-1 bg-card-bg border border-border-color rounded text-[10px] text-text-primary focus:border-primary focus:outline-none" />
                                  <button type="button" onClick={() => commitFields(aiFields.filter((_, j) => j !== i))} className="text-danger flex-shrink-0">
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                        {/* 可引用的上游数据（统一表达式语法：点击「引用」插入的即此写法） */}
                        {(() => {
                          const upstream = nodes.filter(n => n.outputs.includes(selectedNode.id));
                          return (
                            <div className="mb-3 px-2.5 py-2 bg-page-bg rounded-lg border border-border-color">
                              <p className="text-[10px] font-semibold text-text-muted mb-1.5">数据引用规则（点「引用」插入的标准写法）</p>
                              <div className="space-y-0.5">
                                <p className="text-[10px] text-text-muted">当前输入项 <code className="text-primary font-mono">{'{{ $json.字段名 }}'}</code></p>
                                <p className="text-[10px] text-text-muted">上游节点输出 <code className="text-primary font-mono">{'{{ $(\'节点名\').json.字段名 }}'}</code></p>
                                <p className="text-[10px] text-text-muted">节点全部输出项 <code className="text-primary font-mono">{'{{ $items(\'节点名\') }}'}</code></p>
                              </div>
                              {upstream.length > 0 && (
                                <p className="text-[10px] text-text-muted mt-1.5 leading-relaxed">
                                  直接上游：<code className="text-primary font-mono">{upstream.map(u => u.name).join('、')}</code>
                                </p>
                              )}
                            </div>
                          );
                        })()}
                        {/* 集成应用动作：动态参数表单（按动作定义的 params/body 渲染） */}
                        {selectedNode.typeId === 'http_request' && selectedNode.config._app_id && appActionDetail && (
                          <div className="mb-3 rounded-lg border border-border-color bg-page-bg/50 p-2.5">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${METHOD_COLORS[appActionDetail.action.method] || ''}`}>
                                {appActionDetail.action.method}
                              </span>
                              <span className="truncate font-mono text-[10px] text-text-muted">{appActionDetail.action.path}</span>
                            </div>
                            <p className="mb-2.5 text-[10px] leading-relaxed text-text-muted">
                              来自集成应用「{selectedNode.config._app_name}」· 请求地址与认证由应用配置自动提供
                            </p>

                            {appActionDetail.action.params.map(p => (
                              <div key={p.name} className="mb-2.5">
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-xs text-text-muted">
                                    {p.name}
                                    <span className="ml-1 text-[10px] text-text-muted/70">({p.in})</span>
                                    {p.required && <span className="text-danger ml-0.5">*</span>}
                                  </label>
                                  <button type="button"
                                    onClick={() => setRefField(refField === `iv_${p.name}` ? null : `iv_${p.name}`)}
                                    className="flex items-center gap-0.5 text-[10px] text-primary hover:underline">
                                    <Wand2 className="w-3 h-3" />引用
                                  </button>
                                </div>
                                {p.desc && <p className="mb-1 text-[10.5px] text-text-muted/80">{p.desc}</p>}
                                {refField === `iv_${p.name}` && (
                                  <div className="mb-1.5 max-h-40 overflow-y-auto bg-page-bg border border-border-color rounded-lg p-2">
                                    {refGroups.map(g => (
                                      <div key={g.title} className="mb-1.5">
                                        <p className="text-[10px] text-text-muted mb-1">{g.title}</p>
                                        <div className="flex flex-wrap gap-1">
                                          {g.vars.map(v => (
                                            <button type="button" key={v.expr} title={v.expr}
                                              onClick={() => insertIntegrationRef(p.name, v.expr)}
                                              className="px-1.5 py-0.5 text-[10px] rounded bg-card-bg border border-border-color text-text-secondary hover:text-primary hover:border-primary transition-colors">
                                              {renderVarLabel(v)}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {p.type === 'boolean' ? (
                                  <select value={selectedNode.config.values?.[p.name] || ''}
                                    onChange={e => updateIntegrationValue(selectedNode.id, p.name, e.target.value)}
                                    className="w-full px-2.5 py-1.5 bg-card-bg border border-border-color rounded-lg text-xs text-text-primary focus:border-primary focus:outline-none">
                                    <option value="">请选择</option><option value="true">是</option><option value="false">否</option>
                                  </select>
                                ) : (
                                  <input ref={el => { fieldRefs.current[`iv_${p.name}`] = el; }}
                                    value={selectedNode.config.values?.[p.name] || ''}
                                    onChange={e => updateIntegrationValue(selectedNode.id, p.name, e.target.value)}
                                    type={p.type === 'number' ? 'number' : 'text'}
                                    placeholder={p.default != null ? `默认 ${p.default}` : '支持 {{ 表达式 }}'}
                                    className="w-full px-2.5 py-1.5 bg-card-bg border border-border-color rounded-lg text-xs text-text-primary focus:border-primary focus:outline-none" />
                                )}
                              </div>
                            ))}

                            {appActionDetail.action.body?.properties && Object.entries(appActionDetail.action.body.properties).map(([name, def]: [string, any]) => (
                              <div key={name} className="mb-2.5">
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-xs text-text-muted">
                                    {name}
                                    <span className="ml-1 text-[10px] text-text-muted/70">(body)</span>
                                    {(appActionDetail.action.body.required || []).includes(name) && <span className="text-danger ml-0.5">*</span>}
                                  </label>
                                  <button type="button"
                                    onClick={() => setRefField(refField === `iv_${name}` ? null : `iv_${name}`)}
                                    className="flex items-center gap-0.5 text-[10px] text-primary hover:underline">
                                    <Wand2 className="w-3 h-3" />引用
                                  </button>
                                </div>
                                {def.desc && <p className="mb-1 text-[10.5px] text-text-muted/80">{def.desc}</p>}
                                {refField === `iv_${name}` && (
                                  <div className="mb-1.5 max-h-40 overflow-y-auto bg-page-bg border border-border-color rounded-lg p-2">
                                    {refGroups.map(g => (
                                      <div key={g.title} className="mb-1.5">
                                        <p className="text-[10px] text-text-muted mb-1">{g.title}</p>
                                        <div className="flex flex-wrap gap-1">
                                          {g.vars.map(v => (
                                            <button type="button" key={v.expr} title={v.expr}
                                              onClick={() => insertIntegrationRef(name, v.expr)}
                                              className="px-1.5 py-0.5 text-[10px] rounded bg-card-bg border border-border-color text-text-secondary hover:text-primary hover:border-primary transition-colors">
                                              {renderVarLabel(v)}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {def.type === 'object' || def.type === 'array' ? (
                                  <textarea ref={el => { fieldRefs.current[`iv_${name}`] = el; }}
                                    value={selectedNode.config.values?.[name] || ''}
                                    onChange={e => updateIntegrationValue(selectedNode.id, name, e.target.value)}
                                    placeholder={def.type === 'array' ? '["a", "b"]' : '{"k": "v"}'}
                                    className="h-16 w-full resize-y rounded-md border border-border-color bg-page-bg px-3 py-2 font-mono text-[11px] text-success focus:border-primary focus:outline-none" />
                                ) : (
                                  <input ref={el => { fieldRefs.current[`iv_${name}`] = el; }}
                                    value={selectedNode.config.values?.[name] || ''}
                                    onChange={e => updateIntegrationValue(selectedNode.id, name, e.target.value)}
                                    type={def.type === 'number' ? 'number' : 'text'}
                                    placeholder="支持 {{ 表达式 }}"
                                    className="w-full px-2.5 py-1.5 bg-card-bg border border-border-color rounded-lg text-xs text-text-primary focus:border-primary focus:outline-none" />
                                )}
                              </div>
                            ))}

                            {/* 超时 */}
                            <div className="mb-2.5">
                              <label className="mb-1 block text-xs text-text-muted">超时（秒）</label>
                              <input value={selectedNode.config.timeout || '15'}
                                onChange={e => updateNodeConfig(selectedNode.id, 'timeout', e.target.value)}
                                type="number" min={1} max={60}
                                className="w-24 px-2.5 py-1.5 bg-card-bg border border-border-color rounded-lg text-xs text-text-primary focus:border-primary focus:outline-none" />
                            </div>

                            <button type="button" onClick={() => unbindIntegration(selectedNode.id)}
                              className="text-[10px] text-danger hover:underline">
                              解除集成绑定（改为手动 URL 配置）
                            </button>
                          </div>
                        )}

                        {/* 通用动作：按引擎动作 schema 渲染具体参数配置页（写 config.values，调用时随参数执行并返回结果） */}
                        {selectedNode.typeId === 'action' && (() => {
                          const schema = actionSchemas[selectedNode.config.action] || [];
                          if (!schema.length) return null;
                          return (
                            <div className="mb-3 rounded-lg border border-border-color bg-page-bg/50 p-2.5">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] font-medium text-primary">
                                  {selectedNode.config.action}
                                </span>
                                <span className="text-[10px] text-text-muted">动作参数配置（{schema.length} 项）</span>
                              </div>
                              {schema.map((p: any) => (
                                <div key={p.name} className="mb-2.5">
                                  <div className="flex items-center justify-between mb-1">
                                    <label className="text-xs text-text-muted">
                                      {p.label}
                                      {p.required && <span className="text-danger ml-0.5">*</span>}
                                    </label>
                                    <button type="button"
                                      onClick={() => setRefField(refField === `ap_${p.name}` ? null : `ap_${p.name}`)}
                                      className="flex items-center gap-0.5 text-[10px] text-primary hover:underline">
                                      <Wand2 className="w-3 h-3" />引用
                                    </button>
                                  </div>
                                  {p.desc && <p className="mb-1 text-[10.5px] text-text-muted/80">{p.desc}</p>}
                                  {refField === `ap_${p.name}` && (
                                    <div className="mb-1.5 max-h-40 overflow-y-auto bg-page-bg border border-border-color rounded-lg p-2">
                                      {refGroups.length === 0 && (
                                        <p className="text-[10px] text-text-muted">暂无可引用变量（先连线或试运行以获得字段）</p>
                                      )}
                                      {refGroups.map(g => (
                                        <div key={g.title} className="mb-1.5">
                                          <p className="text-[10px] text-text-muted mb-1">{g.title}</p>
                                          <div className="flex flex-wrap gap-1">
                                            {g.vars.map(v => (
                                              <button type="button" key={v.expr} title={v.expr}
                                                onClick={() => insertActionParamRef(p.name, v.expr)}
                                                className="px-1.5 py-0.5 text-[10px] rounded bg-card-bg border border-border-color text-text-secondary hover:text-primary hover:border-primary transition-colors">
                                                {renderVarLabel(v)}
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {p.type === 'select' ? (
                                    <select value={selectedNode.config.values?.[p.name] ?? p.default ?? ''}
                                      onChange={e => updateIntegrationValue(selectedNode.id, p.name, e.target.value)}
                                      className="w-full px-2.5 py-1.5 bg-card-bg border border-border-color rounded-lg text-xs text-text-primary focus:border-primary focus:outline-none">
                                      <option value="">请选择</option>
                                      {(() => {
                                        // 动态选项（存储表数据源 / AI 提示词职责）优先，静态兜底合并去重
                                        const dyn = p.dynamic === 'querySources' ? querySources
                                          : p.dynamic === 'promptKeys' ? promptKeys : [];
                                        const stat = (p.options || []).map((o: string) => ({ value: o, label: o }));
                                        const merged = [...dyn, ...stat.filter((s: any) => !dyn.some((d: any) => d.value === s.value))];
                                        return merged.map(o => <option key={o.value} value={o.value}>{o.label}</option>);
                                      })()}
                                    </select>
                                  ) : p.type === 'textarea' ? (
                                    <textarea ref={el => { fieldRefs.current[`ap_${p.name}`] = el; }}
                                      value={selectedNode.config.values?.[p.name] ?? ''}
                                      onChange={e => updateIntegrationValue(selectedNode.id, p.name, e.target.value)}
                                      placeholder={p.placeholder || '支持 {{ 表达式 }}'}
                                      className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-md text-[11px] text-success font-mono resize-y focus:border-primary focus:outline-none"
                                      style={{ minHeight: '64px', lineHeight: '1.6', tabSize: 2 }} />
                                  ) : (
                                    <input ref={el => { fieldRefs.current[`ap_${p.name}`] = el; }}
                                      value={selectedNode.config.values?.[p.name] ?? ''}
                                      onChange={e => updateIntegrationValue(selectedNode.id, p.name, e.target.value)}
                                      type={p.type === 'number' ? 'number' : 'text'}
                                      placeholder={p.placeholder || '支持 {{ 表达式 }}'}
                                      className="w-full px-2.5 py-1.5 bg-card-bg border border-border-color rounded-lg text-xs text-text-primary focus:border-primary focus:outline-none" />
                                  )}
                                </div>
                              ))}
                              <p className="text-[10px] text-text-muted leading-relaxed">
                                参数在节点执行时随动作一并提交，执行结果（返回字段）显示在下方「数据流试运行」面板
                              </p>
                            </div>
                          );
                        })()}

                        {/* 动态字段（绑定集成应用动作时由上方动态表单接管） */}
                        {!(selectedNode.typeId === 'http_request' && selectedNode.config._app_id && appActionDetail) &&
                          NODE_TYPES.find(n => n.id === selectedNode.typeId)?.fields
                            .filter(field => !(selectedNode.typeId === 'trigger' && field.name === 'schedule' && selectedNode.config.triggerType !== '定时任务'))
                            .filter(field => {
                              // 按渠道/类型显隐（如发送通知节点的 Webhook/收件人字段）
                              if (!field.showIf) return true;
                              return field.showIf.values.includes(selectedNode.config[field.showIf.field]);
                            })
                            .map(field => (
                          <div key={field.name} className="mb-3">
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-xs text-text-muted">{field.label}{field.required && <span className="text-danger ml-0.5">*</span>}</label>
                              <button type="button" onClick={() => setRefField(refField === field.name ? null : field.name)}
                                className="flex items-center gap-0.5 text-[10px] text-primary hover:underline">
                                <Wand2 className="w-3 h-3" />引用
                              </button>
                            </div>
                            {/* 引用选择器：可视化插入上游输出字段（Coze 风格） */}
                            {refField === field.name && (
                              <div className="mb-1.5 max-h-52 overflow-y-auto bg-page-bg border border-border-color rounded-lg p-2">
                                {refGroups.length === 0 && (
                                  <p className="text-[10px] text-text-muted">暂无可引用变量（先连线或试运行以获得字段）</p>
                                )}
                                {refGroups.map(g => (
                                  <div key={g.title} className="mb-1.5">
                                    <p className="text-[10px] text-text-muted mb-1">{g.title}</p>
                                    <div className="flex flex-wrap gap-1">
                                      {g.vars.map(v => (
                                        <button type="button" key={v.expr} title={v.expr}
                                          onClick={() => insertRef(field.name, v.expr)}
                                          className="px-1.5 py-0.5 text-[10px] rounded bg-card-bg border border-border-color text-text-secondary hover:text-primary hover:border-primary transition-colors">
                                          {renderVarLabel(v)}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            {field.type === 'textarea' ? (
                              <textarea ref={el => { fieldRefs.current[field.name] = el; }}
                                value={selectedNode.config[field.name] || ''} onChange={e => updateNodeConfig(selectedNode.id, field.name, e.target.value)}
                                placeholder={field.placeholder}
                                className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-md text-[11px] text-success font-mono resize-y focus:border-primary focus:outline-none"
                                style={{ minHeight: field.name === 'script' ? '320px' : '80px', lineHeight: '1.6', tabSize: 2 }} />
                            ) : field.type === 'select' ? (
                              <>
                                <select value={selectedNode.config[field.name] || ''} onChange={e => updateNodeConfig(selectedNode.id, field.name, e.target.value)}
                                  className="w-full px-2.5 py-1.5 bg-card-bg border border-border-color rounded-lg text-xs text-text-primary focus:border-primary focus:outline-none">
                                  <option value="">请选择</option>
                                  {(() => {
                                    // 动态选项（存储表数据源 / AI 中心提示词职责 / 引擎动作列表）优先，静态兜底合并去重（兼容历史已存值）
                                    const dyn = field.dynamic === 'querySources' ? querySources
                                      : field.dynamic === 'promptKeys' ? promptKeys
                                      : field.dynamic === 'actions' ? actionOptions : [];
                                    const stat = (field.options || []).map(o => ({ value: o, label: o }));
                                    const merged = [...dyn, ...stat.filter(s => !dyn.some(d => d.value === s.value))];
                                    return merged.map(o => <option key={o.value} value={o.value}>{o.label}</option>);
                                  })()}
                                </select>
                                {field.dynamic === 'querySources' && (() => {
                                  // 显示该数据源的物理查询位置（存储表注册表 → ES 索引 / PG 表名）
                                  const src = querySources.find(s => s.value === selectedNode.config[field.name]);
                                  if (!src) return null;
                                  const dbLabel = src.backend === 'elasticsearch' ? 'Elasticsearch 索引'
                                    : src.backend === 'postgresql' ? 'PostgreSQL 表' : '';
                                  return (
                                    <p className="mt-1 text-[10px] text-text-muted">
                                      查询位置：{src.location || src.value}{dbLabel ? `（${dbLabel}）` : ''}
                                    </p>
                                  );
                                })()}
                              </>
                            ) : field.type === 'conditions' ? (
                              <div className="rounded-lg border border-border-color bg-page-bg p-2">
                                {getQueryConditions(selectedNode.id).length === 0 && (
                                  <p className="text-[10px] text-text-muted mb-1.5">尚未添加条件——留空则按时间窗口返回最新数据</p>
                                )}
                                {(() => {
                                  const src = querySources.find(s => s.value === selectedNode.config.source);
                                  const colNames = src?.columns || [];
                                  return (
                                    <>
                                      {getQueryConditions(selectedNode.id).map((row, idx) => (
                                        <div key={idx} className="flex items-center gap-1 mb-1.5">
                                          <input list={`qc-fields-${selectedNode.id}`}
                                            value={row.field || ''}
                                            onChange={e => setQueryCondition(selectedNode.id, idx, { field: e.target.value })}
                                            placeholder="字段"
                                            className="w-[30%] min-w-0 px-1.5 py-1 bg-card-bg border border-border-color rounded text-[11px] text-text-primary focus:border-primary focus:outline-none" />
                                          <select value={row.operator || '等于'}
                                            onChange={e => setQueryCondition(selectedNode.id, idx, { operator: e.target.value })}
                                            className="shrink-0 px-1 py-1 bg-card-bg border border-border-color rounded text-[11px] text-text-primary focus:border-primary focus:outline-none">
                                            {QUERY_OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
                                          </select>
                                          <input value={row.value || ''}
                                            onChange={e => setQueryCondition(selectedNode.id, idx, { value: e.target.value })}
                                            placeholder="值（支持 {{ }}）"
                                            className="flex-1 min-w-0 px-1.5 py-1 bg-card-bg border border-border-color rounded text-[11px] text-text-primary focus:border-primary focus:outline-none" />
                                          <button type="button" onClick={() => removeQueryCondition(selectedNode.id, idx)}
                                            title="删除条件" className="shrink-0 text-text-muted hover:text-danger transition-colors">
                                            <X className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      ))}
                                      {colNames.length > 0 && (
                                        <datalist id={`qc-fields-${selectedNode.id}`}>
                                          {colNames.map(c => <option key={c} value={c} />)}
                                        </datalist>
                                      )}
                                    </>
                                  );
                                })()}
                                <button type="button" onClick={() => addQueryCondition(selectedNode.id)}
                                  className="mt-0.5 px-2 py-1 text-[11px] rounded-md bg-card-bg border border-border-color text-text-secondary hover:text-primary hover:border-primary transition-colors">
                                  + 添加条件
                                </button>
                                <p className="mt-1.5 text-[10px] text-text-muted leading-relaxed">
                                  条件之间为 AND；值支持数据引用。字段联想来自存储表注册表；条件在数据源侧过滤（ES 下推 lucene / PG 下推 SQL），命中后再截取返回条数
                                </p>
                              </div>
                            ) : field.type === 'inputs' ? (() => {
                              // 触发器「运行时入参」声明：执行人只需提供这些入参，其余节点配置不问
                              const inputs = Array.isArray(selectedNode.config.inputs)
                                ? selectedNode.config.inputs
                                : [];
                              const commit = (next: any[]) =>
                                updateNodeConfig(selectedNode.id, 'inputs', next);
                              return (
                                <div className="rounded-lg border border-border-color bg-page-bg p-2">
                                  {inputs.length === 0 && (
                                    <p className="text-[10px] text-text-muted mb-1.5">未声明入参——执行时无需填写任何参数，节点配置按画布设定运行</p>
                                  )}
                                  {inputs.map((row: any, idx: number) => (
                                    <div key={idx} className="mb-2 p-1.5 bg-card-bg rounded border border-border-color">
                                      <div className="flex items-center gap-1 mb-1">
                                        <input value={row.key || ''}
                                          onChange={e => { const n = [...inputs]; n[idx] = { ...row, key: e.target.value.replace(/\s/g, '') }; commit(n); }}
                                          placeholder="参数名（如 src_ip）"
                                          className="flex-1 min-w-0 px-1.5 py-1 bg-page-bg border border-border-color rounded text-[11px] text-text-primary font-mono focus:border-primary focus:outline-none" />
                                        <label className="flex items-center gap-0.5 text-[10px] text-text-muted flex-shrink-0 cursor-pointer">
                                          <input type="checkbox" checked={!!row.required}
                                            onChange={e => { const n = [...inputs]; n[idx] = { ...row, required: e.target.checked }; commit(n); }}
                                            className="w-3 h-3" />
                                          必填
                                        </label>
                                        <button type="button" onClick={() => commit(inputs.filter((_, j) => j !== idx))}
                                          className="shrink-0 text-text-muted hover:text-danger transition-colors">
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                      <input value={row.label || ''}
                                        onChange={e => { const n = [...inputs]; n[idx] = { ...row, label: e.target.value }; commit(n); }}
                                        placeholder="显示名称（如 攻击源 IP）"
                                        className="w-full px-1.5 py-1 bg-page-bg border border-border-color rounded text-[11px] text-text-primary mb-1 focus:border-primary focus:outline-none" />
                                      <div className="flex items-center gap-1 mb-1">
                                        <input value={row.default || ''}
                                          onChange={e => { const n = [...inputs]; n[idx] = { ...row, default: e.target.value }; commit(n); }}
                                          placeholder="默认值（执行时预填，可修改）"
                                          className="flex-1 min-w-0 px-1.5 py-1 bg-page-bg border border-border-color rounded text-[11px] text-text-primary focus:border-primary focus:outline-none" />
                                        <input value={row.placeholder || ''}
                                          onChange={e => { const n = [...inputs]; n[idx] = { ...row, placeholder: e.target.value }; commit(n); }}
                                          placeholder="输入提示文案"
                                          className="flex-1 min-w-0 px-1.5 py-1 bg-page-bg border border-border-color rounded text-[11px] text-text-muted focus:border-primary focus:outline-none" />
                                      </div>
                                    </div>
                                  ))}
                                  <button type="button"
                                    onClick={() => commit([...inputs, { key: '', label: '', required: false, placeholder: '', type: 'text' }])}
                                    className="mt-0.5 px-2 py-1 text-[11px] rounded-md bg-card-bg border border-border-color text-text-secondary hover:text-primary hover:border-primary transition-colors">
                                    + 添加入参
                                  </button>
                                  <p className="mt-1.5 text-[10px] text-text-muted leading-relaxed">
                                    入参在执行时注入上下文：下游用 <code className="text-primary font-mono">{'{{ $json.参数名 }}'}</code> 或 <code className="text-primary font-mono">{'{{ 参数名 }}'}</code> 引用。取值优先级：事件/告警上下文 &gt; 默认值 &gt; 留空（常见参数名 src_ip/ip/title 等会自动从事件带入预填值）
                                  </p>
                                </div>
                              );
                            })() : (
                              <input ref={el => { fieldRefs.current[field.name] = el; }}
                                value={selectedNode.config[field.name] || ''} onChange={e => updateNodeConfig(selectedNode.id, field.name, e.target.value)}
                                placeholder={field.placeholder} type={field.type === 'number' ? 'number' : 'text'}
                                className="w-full px-2.5 py-1.5 bg-card-bg border border-border-color rounded-lg text-xs text-text-primary focus:border-primary focus:outline-none" />
                            )}
                          </div>
                        ))}
                        {/* 连接信息 */}
                        {selectedNode.outputs.length > 0 && (
                          <div className="mt-4 pt-3 border-t border-border-color">
                            <p className="text-xs text-text-muted mb-2">连接到:</p>
                            {selectedNode.outputs.map(outId => {
                              const target = nodes.find(n => n.id === outId);
                              return target ? (
                                <div key={outId} className="flex items-center justify-between px-2 py-1.5 bg-page-bg rounded-lg mb-1">
                                  <span className="text-xs text-text-primary">{target.name}</span>
                                  <button onClick={() => removeConnection(selectedNode.id, outId)} className="text-danger hover:text-danger">
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : null;
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-text-muted">
                        <Eye className="w-8 h-8 mb-2 opacity-20" />
                        <p className="text-xs">点击节点查看配置</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 试运行结果：展示 items 在节点之间如何被加工和传递 */}
                {showRunPanel && runResult && (
                  <div className="h-[264px] border-t border-border-color bg-page-bg/60 flex flex-col flex-shrink-0">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-border-color">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-text-primary">数据流试运行</span>
                        <span className={`text-[11px] px-2 py-0.5 rounded ${runResult.status === 'completed' ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}>
                          {runResult.status}
                        </span>
                        <span className="text-[11px] text-text-muted">
                          {runResult.completed_nodes}/{runResult.total_nodes} 节点 · {runResult.duration ?? 0}s
                        </span>
                      </div>
                      <button onClick={() => setShowRunPanel(false)} className="p-1 text-text-muted hover:text-text-primary">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-x-auto overflow-y-hidden p-3 flex gap-2">
                      {(runResult.node_results || []).map((n: any, i: number) => (
                        <div key={i} className="w-[268px] flex-shrink-0 bg-card-bg border border-border-color rounded-lg p-2.5 flex flex-col">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[10px] w-4 h-4 rounded-full bg-page-bg text-text-muted flex items-center justify-center flex-shrink-0">{i + 1}</span>
                            <span className="text-xs text-text-primary font-medium truncate flex-1">{n.node_label}</span>
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${n.success ? 'bg-success' : 'bg-danger-solid'}`} />
                          </div>
                          <p className="text-[10px] text-text-muted mb-1.5">{n.message}</p>
                          <div className="flex items-center gap-1 mb-1.5 flex-wrap">
                            <span className="text-[10px] px-1.5 py-0.5 bg-primary/15 text-primary rounded">出 {n.item_count ?? 0} 项</span>
                            {typeof n.input_count === 'number' && (
                              <span className="text-[10px] text-text-muted">入 {n.input_count} 项</span>
                            )}
                            <span className="text-[10px] text-text-muted">{n.type}</span>
                            {n.source && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${n.is_ai === false ? 'bg-page-bg text-text-secondary' : 'bg-success/15 text-success'}`}>
                                {n.source}{n.is_ai === false ? ' · 规则兜底' : ''}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 overflow-auto bg-page-bg rounded p-1.5">
                            <pre className="text-[9px] text-text-secondary font-mono whitespace-pre-wrap break-all">
                              {JSON.stringify(n.items || [], null, 1)}
                            </pre>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      {/* 事件触发剧本的模拟运行：补齐事件/告警上下文与入参后再执行 */}
      <Modal
        open={simOpen}
        title="模拟运行（事件触发剧本）"
        description="该剧本触发类型为「告警事件」，手动执行没有可传递的数据。请提供模拟的事件/告警上下文后再试运行。"
        onClose={() => setSimOpen(false)}
        width={560}
        footer={
          <div className="flex items-center gap-2 w-full">
            {simErr && <span className="text-xs text-danger flex-1">{simErr}</span>}
            <div className="flex items-center gap-2 ml-auto">
              <Button variant="ghost" size="sm" icon={X} onClick={() => setSimOpen(false)}>取消</Button>
              <Button variant="primary" size="sm" icon={Play} loading={running} onClick={confirmSimulateRun}>开始模拟运行</Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="px-3 py-2 rounded-lg bg-warning/10 border border-warning/30 text-[11px] text-warning">
            模拟运行会真实调用节点动作（如封堵/隔离），请谨慎填写目标 IP。
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">模拟告警源 IP<span className="text-danger ml-0.5">*</span></label>
              <input value={simAlert.src_ip} onChange={e => updateSimAlert({ src_ip: e.target.value })}
                placeholder="203.0.113.10" className="w-full px-2.5 py-1.5 bg-card-bg border border-border-color rounded-lg text-xs text-text-primary focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">模拟目标 IP</label>
              <input value={simAlert.dst_ip} onChange={e => updateSimAlert({ dst_ip: e.target.value })}
                placeholder="10.0.0.5" className="w-full px-2.5 py-1.5 bg-card-bg border border-border-color rounded-lg text-xs text-text-primary focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">模拟告警标题</label>
              <input value={simAlert.title} onChange={e => updateSimAlert({ title: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-card-bg border border-border-color rounded-lg text-xs text-text-primary focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">严重级别</label>
              <select value={simAlert.severity} onChange={e => updateSimAlert({ severity: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-card-bg border border-border-color rounded-lg text-xs text-text-primary focus:border-primary focus:outline-none">
                {['critical', 'high', 'medium', 'low'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {simInputs.length > 0 && (
            <div className="flex flex-col gap-3 pt-1 border-t border-border-color">
              <p className="text-xs text-text-secondary">剧本声明的运行时入参</p>
              {simInputs.map(f => (
                <div key={f.key}>
                  <label className="block text-xs text-text-secondary mb-1">
                    {f.label || f.key}{f.required && <span className="text-danger ml-0.5">*</span>}
                    {f.description && <span className="text-[10px] text-text-muted ml-1.5">{f.description}</span>}
                  </label>
                  <input value={simParams[f.key] ?? ''} onChange={e => setSimParams(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder || ''} className="w-full px-2.5 py-1.5 bg-card-bg border border-border-color rounded-lg text-xs text-text-primary focus:border-primary focus:outline-none" />
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
      {/* 手动执行入参弹窗：提示输入 → 校验 → 执行 */}
      <Modal open={manualOpen} onClose={() => setManualOpen(false)} title={`手动执行：${manualTarget?.name || ''}`} width={440}>
        <div className="flex flex-col gap-3">
          <p className="text-xs text-text-secondary">该剧本声明了运行时入参，请填写后执行（预填值可修改）：</p>
          {manualInputs.map(f => (
            <div key={f.key}>
              <label className="block text-xs text-text-secondary mb-1">
                {f.label || f.key}{f.required && <span className="text-danger ml-0.5">*</span>}
                {f.type === 'ip' && <span className="text-[10px] text-text-muted ml-1.5">IP 格式</span>}
              </label>
              <input value={manualParams[f.key] ?? ''}
                onChange={e => setManualParams(p => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder || `请输入${f.label || f.key}`}
                className="w-full px-2.5 py-1.5 bg-card-bg border border-border-color rounded-lg text-xs text-text-primary focus:border-primary focus:outline-none" />
            </div>
          ))}
          {manualErr && <p className="text-xs text-danger">{manualErr}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setManualOpen(false)}>取消</Button>
            <Button variant="primary" size="sm" icon={Play} loading={running} onClick={confirmManualRun}>执行</Button>
          </div>
        </div>
      </Modal>
      {/* 应用内确认弹窗（删除/试运行等确认；缺失时 ask() 永远挂起 → 删除无响应） */}
      <ConfirmDialog {...confirmProps} />
    </ContentContainer>
  );
}
