import React, { useState, useCallback, useRef, useEffect } from 'react';
import { huntingApi, playbooksApi } from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Play, Edit2, Trash2, Copy, X, Save, Clock, Zap, GitBranch, AlertCircle, Mail,
  Shield, Ban, FileText, Globe, Server, Code, Settings, ChevronRight,
  ChevronDown, ChevronLeft, LayoutGrid, Download, Eye, EyeOff, Check, RefreshCw,
  Loader2, Terminal, ArrowRight, Minus, Info, Box, Cpu, Workflow, Activity,
  Search, RotateCcw, ExternalLink, Database
} from 'lucide-react';

// ==================== 节点类型定义 ====================

interface NodeType {
  id: string;
  name: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  category: string;
  desc: string;
  fields: { name: string; label: string; type: 'text' | 'select' | 'textarea' | 'number'; placeholder?: string; options?: string[]; required?: boolean }[];
}

const NODE_TYPES: NodeType[] = [
  { id: 'trigger', name: '触发器', icon: Zap, color: '#10B981', bg: '#10B98115', category: '基础', desc: '剧本执行入口',
    fields: [{ name: 'triggerType', label: '触发类型', type: 'select', options: ['告警事件', '定时任务', '手动触发', 'Webhook'], required: true }] },
  { id: 'condition', name: '条件判断', icon: GitBranch, color: '#F59E0B', bg: '#F59E0B15', category: '控制', desc: 'IF/ELSE 分支',
    fields: [{ name: 'field', label: '字段', type: 'text', placeholder: 'severity' }, { name: 'operator', label: '运算符', type: 'select', options: ['等于', '不等于', '包含', '大于', '小于'] }, { name: 'value', label: '值', type: 'text', placeholder: 'critical' }] },
  { id: 'script', name: '执行脚本', icon: Code, color: '#3B82F6', bg: '#3B82F615', category: '动作', desc: 'Python/JS/Bash 脚本',
    fields: [{ name: 'language', label: '语言', type: 'select', options: ['Python', 'Node.js', 'Bash'] }, { name: 'script', label: '脚本内容', type: 'textarea', placeholder: '使用 context 获取上下文变量（src_ip, severity 等），使用 result 返回结果' }] },
  { id: 'api', name: 'API 调用', icon: Globe, color: '#EC4899', bg: '#EC489915', category: '集成', desc: 'HTTP REST 请求',
    fields: [{ name: 'method', label: '方法', type: 'select', options: ['GET', 'POST', 'PUT', 'DELETE'] }, { name: 'url', label: 'URL', type: 'text', placeholder: '{{alert.url}} 或完整 URL' }, { name: 'body', label: '请求体', type: 'textarea', placeholder: '{"key":"value"}' }, { name: 'headers', label: '自定义 Headers', type: 'text', placeholder: 'Authorization: Bearer xxx' }, { name: 'script', label: '自定义脚本', type: 'textarea', placeholder: '# 可选：自定义请求构建逻辑\n# url, method, body 变量可用' }] },
  { id: 'block', name: 'IP 封堵', icon: Ban, color: '#EF4444', bg: '#EF444415', category: '动作', desc: '封堵恶意 IP',
    fields: [{ name: 'ip', label: 'IP 地址', type: 'text', placeholder: '{{src_ip}}', required: true }, { name: 'duration', label: '封堵时长', type: 'text', placeholder: '24h' }, { name: 'reason', label: '原因', type: 'text', placeholder: '恶意攻击封堵' }, { name: 'api_url', label: '防火墙 API', type: 'text', placeholder: 'https://fw.internal/api/block (留空用默认)' }, { name: 'api_token', label: 'API Token', type: 'text', placeholder: '' }, { name: 'script', label: '自定义脚本', type: 'textarea', placeholder: '# 可选：自定义封堵逻辑\n# ip, reason, duration 变量可用' }] },
  { id: 'isolate', name: '主机隔离', icon: Shield, color: '#F97316', bg: '#F9731615', category: '动作', desc: '隔离受感染主机',
    fields: [{ name: 'hostname', label: '主机名', type: 'text', placeholder: '{{hostname}}', required: true }, { name: 'duration', label: '隔离时长', type: 'text', placeholder: '2h' }, { name: 'api_url', label: '隔离 API', type: 'text', placeholder: 'https://sdn.controller/isolate (留空用默认)' }, { name: 'script', label: '自定义脚本', type: 'textarea', placeholder: '# 可选：自定义隔离逻辑\n# hostname, duration 变量可用' }] },
  { id: 'ticket', name: '创建工单', icon: FileText, color: '#06B6D4', bg: '#06B6D415', category: '动作', desc: '创建安全工单',
    fields: [{ name: 'title', label: '工单标题', type: 'text', placeholder: '安全事件处理工单', required: true }, { name: 'priority', label: '优先级', type: 'select', options: ['高', '中', '低'] }, { name: 'assignee', label: '指派人', type: 'text', placeholder: '安全运维' }, { name: 'system', label: '工单系统', type: 'select', options: ['内部系统', 'ServiceNow', 'Jira', '自定义'] }, { name: 'api_url', label: '系统 API', type: 'text', placeholder: 'https://itsm.internal/api/tickets' }, { name: 'script', label: '自定义脚本', type: 'textarea', placeholder: '# 可选：自定义工单创建逻辑\n# title, priority, assignee 变量可用' }] },
  { id: 'notify', name: '发送通知', icon: Mail, color: '#8B5CF6', bg: '#8B5CF615', category: '动作', desc: '多渠道消息通知',
    fields: [{ name: 'channel', label: '通知渠道', type: 'select', options: ['企业微信', '钉钉', 'Slack', 'Webhook', '邮件'], required: true }, { name: 'title', label: '标题', type: 'text', placeholder: '安全告警通知' }, { name: 'content', label: '内容', type: 'textarea', placeholder: '告警详情...' }, { name: 'webhook_url', label: 'Webhook URL', type: 'text', placeholder: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx' }, { name: 'script', label: '自定义脚本', type: 'textarea', placeholder: '# 可选：自定义通知逻辑\n# title, content, channel 变量可用' }] },
  { id: 'query', name: '数据查询', icon: Database, color: '#6366F1', bg: '#6366F115', category: '数据', desc: '查询安全数据',
    fields: [{ name: 'source', label: '数据源', type: 'select', options: ['告警表', '资产表', '漏洞表', '事件表'] }, { name: 'query', label: '查询条件', type: 'text', placeholder: 'severity:critical' }] },
  { id: 'enrich', name: '情报补全', icon: Search, color: '#0EA5E9', bg: '#0EA5E915', category: '分析', desc: '威胁情报查询',
    fields: [{ name: 'type', label: '情报类型', type: 'select', options: ['IP情报', '域名情报', '文件哈希', '漏洞信息'] }, { name: 'value', label: '查询值', type: 'text', placeholder: '{{alert.src_ip}}' }] },
  { id: 'delay', name: '延迟等待', icon: Clock, color: '#6B7280', bg: '#6B728015', category: '控制', desc: '等待指定时间',
    fields: [{ name: 'duration', label: '等待时间', type: 'text', placeholder: '5m' }] },
  { id: 'parallel', name: '并行执行', icon: LayoutGrid, color: '#A855F7', bg: '#A855F715', category: '控制', desc: '并行分支执行',
    fields: [{ name: 'branches', label: '分支数', type: 'number', placeholder: '2' }] },
  { id: 'approval', name: '审批节点', icon: Shield, color: '#DC2626', bg: '#DC262615', category: '控制', desc: '需审批通过后继续',
    fields: [{ name: 'approvalType', label: '审批类型', type: 'select', options: ['IP封禁', '主机隔离', '密码重置', '防火墙修改'], required: true }, { name: 'approverLevel', label: '审批级别', type: 'select', options: ['主管', '高级管理'], required: true }, { name: 'reason', label: '申请原因', type: 'textarea', placeholder: '请输入申请原因...' }] },
  { id: 'loop', name: '循环执行', icon: RefreshCw, color: '#059669', bg: '#05966915', category: '控制', desc: '循环遍历执行',
    fields: [{ name: 'iterable', label: '遍历对象', type: 'text', placeholder: '{{alert.ips}}' }, { name: 'maxIterations', label: '最大次数', type: 'number', placeholder: '10' }] },
  { id: 'switch', name: '多分支', icon: GitBranch, color: '#D97706', bg: '#D9770615', category: '控制', desc: '多条件分支选择',
    fields: [{ name: 'field', label: '判断字段', type: 'text', placeholder: 'severity' }, { name: 'cases', label: '分支配置', type: 'textarea', placeholder: 'critical:高危处理\nhigh:中危处理\ndefault:默认处理' }] },
];

const CATEGORIES = ['基础', '控制', '动作', '集成', '数据', '分析'];

// ==================== 类型定义 ====================

interface NodeInstance {
  id: string;
  typeId: string;
  name: string;
  config: Record<string, string>;
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
  lastRun?: string;
  runCount: number;
}

// ==================== 样式常量 ====================

const NODE_W = 160;
const NODE_H = 60;

// ==================== 主组件 ====================

export default function Playbooks() {
  const [playbooks, setPlaybooks] = useState<PlaybookData[]>([
    { id: 'PB-001', name: '暴力破解自动封堵', description: '检测到暴力破解告警后自动封堵源IP并通知安全团队', triggerType: '告警事件',
      nodes: [
        { id: 'n1', typeId: 'trigger', name: '暴力破解告警', config: { triggerType: '告警事件' }, position: { x: 40, y: 80 }, outputs: ['n2'] },
        { id: 'n2', typeId: 'condition', name: '检查严重程度', config: { field: 'severity', operator: '等于', value: 'critical' }, position: { x: 240, y: 80 }, outputs: ['n3', 'n4'] },
        { id: 'n3', typeId: 'block', name: '封堵源IP', config: { ip: '{{src_ip}}', duration: '24h', reason: '暴力破解封堵' }, position: { x: 440, y: 30 }, outputs: ['n5'] },
        { id: 'n4', typeId: 'notify', name: '低危通知', config: { channel: '企业微信', title: '低危告警', content: '' }, position: { x: 440, y: 140 }, outputs: ['n5'] },
        { id: 'n5', typeId: 'ticket', name: '创建工单', config: { title: '暴力破解事件处理', priority: '高', assignee: '安全运维' }, position: { x: 640, y: 80 }, outputs: [] },
      ], enabled: true, runCount: 12, lastRun: '2026-06-05T08:30:00Z' },
    { id: 'PB-002', name: 'C2 通信自动隔离', description: '检测到C2通信后自动隔离受感染主机并启动应急响应', triggerType: '告警事件',
      nodes: [
        { id: 'n1', typeId: 'trigger', name: 'C2通信告警', config: { triggerType: '告警事件' }, position: { x: 40, y: 80 }, outputs: ['n2'] },
        { id: 'n2', typeId: 'isolate', name: '隔离主机', config: { hostname: '{{hostname}}', duration: '4h' }, position: { x: 240, y: 80 }, outputs: ['n3'] },
        { id: 'n3', typeId: 'enrich', name: '情报查询', config: { type: 'IP情报', value: '{{dst_ip}}' }, position: { x: 440, y: 80 }, outputs: ['n4', 'n5'] },
        { id: 'n4', typeId: 'ticket', name: '创建应急工单', config: { title: 'C2通信应急响应', priority: '高' }, position: { x: 640, y: 30 }, outputs: [] },
        { id: 'n5', typeId: 'notify', name: '通知SOC', config: { channel: '企业微信', title: '紧急: C2通信', content: '' }, position: { x: 640, y: 140 }, outputs: [] },
      ], enabled: true, runCount: 5, lastRun: '2026-06-04T22:15:00Z' },
    { id: 'PB-003', name: 'Web攻击溯源分析', description: '检测Web攻击后自动查询资产信息、关联历史告警、生成分析报告', triggerType: '告警事件',
      nodes: [
        { id: 'n1', typeId: 'trigger', name: 'Web攻击告警', config: { triggerType: '告警事件' }, position: { x: 40, y: 80 }, outputs: ['n2'] },
        { id: 'n2', typeId: 'query', name: '查询资产信息', config: { source: '资产表', query: 'ip={{src_ip}}' }, position: { x: 240, y: 80 }, outputs: ['n3'] },
        { id: 'n3', typeId: 'enrich', name: 'IP情报查询', config: { type: 'IP情报', value: '{{src_ip}}' }, position: { x: 440, y: 80 }, outputs: ['n4'] },
        { id: 'n4', typeId: 'notify', name: '输出报告', config: { channel: '邮件', title: 'Web攻击溯源报告' }, position: { x: 640, y: 80 }, outputs: [] },
      ], enabled: false, runCount: 0 },
  ]);

  const [editingPb, setEditingPb] = useState<PlaybookData | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  // 获取当前编辑的节点列表
  const nodes = editingPb?.nodes || [];
  const selectedNode = nodes.find(n => n.id === selectedNodeId) || null;

  // ===== 剧本操作 =====
  const openEditor = (pb: PlaybookData) => {
    setEditingPb({ ...pb, nodes: pb.nodes.map(n => ({ ...n })) });
    setSelectedNodeId(null);
    setConnectingFrom(null);
    setShowEditor(true);
  };

  const newPlaybook = () => {
    const pb: PlaybookData = {
      id: `PB-${Date.now()}`,
      name: '新建剧本',
      description: '',
      triggerType: '告警事件',
      nodes: [{ id: `n1`, typeId: 'trigger', name: '触发器', config: { triggerType: '告警事件' }, position: { x: 40, y: 80 }, outputs: [] }],
      enabled: false,
      runCount: 0,
    };
    openEditor(pb);
  };

  const savePlaybook = () => {
    if (!editingPb) return;
    setPlaybooks(prev => {
      const idx = prev.findIndex(p => p.id === editingPb.id);
      if (idx >= 0) { const copy = [...prev]; copy[idx] = editingPb; return copy; }
      return [...prev, editingPb];
    });
    setShowEditor(false);
  };

  const deletePlaybook = (id: string) => setPlaybooks(prev => prev.filter(p => p.id !== id));

  const toggleEnabled = (id: string) => setPlaybooks(prev => prev.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p));

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

  const updateNodeConfig = (nodeId: string, key: string, value: string) => {
    if (!editingPb) return;
    setEditingPb({
      ...editingPb,
      nodes: editingPb.nodes.map(n => n.id === nodeId ? { ...n, config: { ...n.config, [key]: value } } : n),
    });
  };

  const updateNodeName = (nodeId: string, name: string) => {
    if (!editingPb) return;
    setEditingPb({
      ...editingPb,
      nodes: editingPb.nodes.map(n => n.id === nodeId ? { ...n, name } : n),
    });
  };

  // ===== 连线操作 =====
  const handleNodeClick = (nodeId: string) => {
    if (connectingFrom) {
      // 完成连线
      if (connectingFrom !== nodeId && editingPb) {
        const fromNode = editingPb.nodes.find(n => n.id === connectingFrom);
        if (fromNode && !fromNode.outputs.includes(nodeId)) {
          setEditingPb({
            ...editingPb,
            nodes: editingPb.nodes.map(n => n.id === connectingFrom ? { ...n, outputs: [...n.outputs, nodeId] } : n),
          });
        }
      }
      setConnectingFrom(null);
    } else {
      setSelectedNodeId(nodeId);
    }
  };

  const startConnecting = (nodeId: string) => {
    setConnectingFrom(nodeId);
    setSelectedNodeId(nodeId);
  };

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
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
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
    const x = e.clientX - rect.left + canvasRef.current.scrollLeft - NODE_W / 2;
    const y = e.clientY - rect.top + canvasRef.current.scrollTop - NODE_H / 2;
    addNode(typeId, Math.max(10, x), Math.max(10, y));
  };

  // ===== 执行状态 =====
  const [executing, setExecuting] = useState(false);
  const [execLog, setExecLog] = useState<{ time: string; node: string; status: string; msg: string }[]>([]);
  const [showExec, setShowExec] = useState(false);

  // ===== 模板 =====
  const [showTemplates, setShowTemplates] = useState(false);
  
  const loadTemplate = (template: any) => {
    const newPb: PlaybookData = {
      id: `PB-${Date.now()}`,
      name: template.name,
      description: template.description,
      triggerType: template.triggerType,
      enabled: false,
      nodes: template.nodes.map((n: any) => ({
        ...n,
        config: n.config || {}
      })),
      runCount: 0
    };
    setPlaybooks(prev => [...prev, newPb]);
    setShowTemplates(false);
  };

  const executePlaybook = async (pb: PlaybookData) => {
    setExecuting(true);
    setExecLog([]);
    setShowExec(true);
    try {
      const context: Record<string, any> = {
        severity: 'critical', src_ip: '203.0.113.55', dst_ip: '10.0.1.100',
        hostname: 'web-01.internal', title: pb.name,
      };
      const resp = await fetch('/api/playbooks/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` },
        body: JSON.stringify({
          nodes: pb.nodes.map(n => ({ typeId: n.typeId, name: n.name, config: n.config })),
          context,
        }),
      }).then(r => r.json());
      if (resp?.success && resp?.data?.logs) {
        setExecLog(resp.data.logs.map((l: any) => ({ time: l.time, node: l.node, status: l.status, msg: l.message || l.msg || '' })));
        setPlaybooks(prev => prev.map(p => p.id === pb.id ? { ...p, runCount: p.runCount + 1, lastRun: new Date().toISOString() } : p));
      } else {
        setExecLog([{ time: new Date().toLocaleTimeString(), node: '剧本', status: 'error', msg: resp?.error || '执行失败' }]);
      }
    } catch (err: any) {
      setExecLog([{ time: new Date().toLocaleTimeString(), node: '剧本', status: 'error', msg: err?.message || '网络错误' }]);
    }
    setExecuting(false);
  };

  // 剧本统计
  const playbookStats = useMemo(() => {
    const total = playbooks.length;
    const enabled = playbooks.filter(p => p.enabled).length;
    const totalRuns = playbooks.reduce((sum, p) => sum + (p.runCount || 0), 0);
    return { total, enabled, disabled: total - enabled, totalRuns };
  }, [playbooks]);

  // ===== 渲染 =====
  return (
    <div className="space-y-6">
      {/* 统计栏 */}
      <div className="grid grid-cols-4 gap-4">
        <div className="glass-card rounded-card p-4">
          <p className="text-sm text-text-muted">总剧本</p>
          <p className="text-2xl font-bold text-text-primary">{playbookStats.total}</p>
        </div>
        <div className="glass-card rounded-card p-4">
          <p className="text-sm text-text-muted">已启用</p>
          <p className="text-2xl font-bold text-emerald-500">{playbookStats.enabled}</p>
        </div>
        <div className="glass-card rounded-card p-4">
          <p className="text-sm text-text-muted">已禁用</p>
          <p className="text-2xl font-bold text-gray-500">{playbookStats.disabled}</p>
        </div>
        <div className="glass-card rounded-card p-4">
          <p className="text-sm text-text-muted">总执行次数</p>
          <p className="text-2xl font-bold text-blue-500">{playbookStats.totalRuns}</p>
        </div>
      </div>

      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">剧本编排</h1>
          <p className="text-text-secondary text-sm mt-1">可视化编排安全自动化剧本</p>
        </div>
        <button onClick={() => setShowTemplates(true)} className="flex items-center gap-2 px-4 py-2 bg-card-bg border border-border-color text-text-secondary hover:text-text-primary rounded-lg transition-colors">
          <LayoutGrid className="w-4 h-4" /> 模板库
        </button>
        <button onClick={newPlaybook} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> 新建剧本
        </button>
      </div>

      {/* 剧本卡片列表 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {playbooks.map(pb => (
          <motion.div key={pb.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="bg-card-bg border border-border-color rounded-xl overflow-hidden hover:border-primary/30 transition-all">
            <div className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-text-primary truncate">{pb.name}</h3>
                  <p className="text-xs text-text-muted mt-0.5 line-clamp-1">{pb.description || '暂无描述'}</p>
                </div>
                <button onClick={() => toggleEnabled(pb.id)}
                  className={`ml-3 relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${pb.enabled ? 'bg-primary' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${pb.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
              </div>
              {/* 节点流预览 */}
              <div className="flex items-center gap-1 my-3 overflow-x-auto pb-1">
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
                <span>触发: {pb.triggerType}</span>
                <span>运行 {pb.runCount} 次</span>
                <span className={`ml-auto px-1.5 py-0.5 rounded ${pb.enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-gray-500/15 text-gray-400'}`}>{pb.enabled ? '已启用' : '已禁用'}</span>
              </div>
            </div>
            {/* 操作栏 */}
            <div className="flex items-center border-t border-border-color">
              <button onClick={() => openEditor(pb)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-text-secondary hover:text-primary hover:bg-page-bg transition-colors">
                <Edit2 className="w-3.5 h-3.5" /> 编辑
              </button>
              <button onClick={() => executePlaybook(pb)} disabled={executing}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-text-secondary hover:text-emerald-500 hover:bg-emerald-500/10 transition-colors disabled:opacity-50">
                <Play className="w-3.5 h-3.5" /> 执行
              </button>
              <button onClick={() => { const copy = { ...pb, id: `PB-${Date.now()}`, name: pb.name + ' (副本)', runCount: 0 }; setPlaybooks(prev => [...prev, copy]); }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-text-secondary hover:text-primary hover:bg-page-bg transition-colors">
                <Copy className="w-3.5 h-3.5" /> 复制
              </button>
              <button onClick={() => deletePlaybook(pb.id)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-text-secondary hover:text-rose-500 hover:bg-rose-500/10 transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> 删除
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* 执行日志面板 */}
      <AnimatePresence>
        {showExec && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="bg-card-bg border border-border-color rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border-color">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-text-primary">执行日志</span>
                {executing && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
              </div>
              <button onClick={() => setShowExec(false)} className="p-1 text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-3 max-h-48 overflow-y-auto font-mono text-xs space-y-0.5">
              {execLog.map((log, i) => (
                <div key={i} className="flex items-center gap-2 py-0.5">
                  <span className="text-text-muted w-16 flex-shrink-0">{log.time}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${log.status === 'success' ? 'bg-emerald-500/15 text-emerald-400' : log.status === 'running' ? 'bg-blue-500/15 text-blue-400' : log.status === 'done' ? 'bg-primary/15 text-primary' : 'bg-gray-500/15 text-gray-400'}`}>{log.status === 'done' ? '完成' : log.status === 'success' ? '成功' : '运行'}</span>
                  <span className="text-text-secondary">{log.msg}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========== 模板库弹窗 ========== */}
      <AnimatePresence>
        {showTemplates && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50" onClick={() => setShowTemplates(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-8 z-50 pointer-events-none">
              <div className="w-full h-full bg-card-bg rounded-xl border border-border-color overflow-hidden pointer-events-auto flex flex-col">
                <div className="flex items-center justify-between px-5 py-3 border-b border-border-color bg-page-bg/50">
                  <div className="flex items-center gap-2">
                    <LayoutGrid className="w-5 h-5 text-primary" />
                    <span className="text-base font-semibold text-text-primary">剧本模板库</span>
                  </div>
                  <button onClick={() => setShowTemplates(false)} className="p-1.5 text-text-muted hover:text-text-primary">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 p-4 overflow-y-auto">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                      { name: '恶意IP自动封禁', desc: '检测攻击行为自动封禁IP并通知', icon: '🔒' },
                      { name: '主机异常隔离', desc: '检测主机异常自动隔离', icon: '🛡️' },
                      { name: '工单自动创建', desc: '高危告警自动创建工单', icon: '📝' },
                      { name: '情报丰富', desc: '自动查询威胁情报', icon: '🔍' },
                      { name: '定时巡检', desc: '定时执行安全检查', icon: '⏰' },
                      { name: 'Webhook联动', desc: '触发外部系统Webhook', icon: '🔗' }
                    ].map((t, i) => (
                      <div key={i} 
                        className="p-4 bg-page-bg rounded-lg border border-border-color hover:border-primary/30 cursor-pointer transition-all group"
                        onClick={() => loadTemplate({ name: t.name, description: t.desc, triggerType: '告警事件', nodes: [] })}
                      >
                        <div className="text-2xl mb-2">{t.icon}</div>
                        <h4 className="text-sm font-medium text-text-primary group-hover:text-primary">{t.name}</h4>
                        <p className="text-xs text-text-muted mt-1">{t.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ========== 编辑器弹窗 ========== */}
      <AnimatePresence>
        {showEditor && editingPb && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50" onClick={() => setShowEditor(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-4 z-50 pointer-events-none">
              <div className="w-full h-full bg-card-bg rounded-xl border border-border-color overflow-hidden pointer-events-auto flex flex-col">

                {/* 编辑器头部 */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-border-color bg-page-bg/50">
                  <div className="flex items-center gap-3">
                    <input value={editingPb.name} onChange={e => setEditingPb({ ...editingPb, name: e.target.value })}
                      className="text-base font-semibold text-text-primary bg-transparent border-none outline-none" />
                    <span className="text-xs text-text-muted px-2 py-0.5 bg-page-bg rounded">{editingPb.nodes.length} 节点</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={savePlaybook} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-xs hover:bg-primary-hover">
                      <Save className="w-3.5 h-3.5" /> 保存
                    </button>
                    <button onClick={() => setShowEditor(false)} className="p-1.5 text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
                  </div>
                </div>

                <div className="flex-1 flex overflow-hidden">
                  {/* 左侧：节点面板 */}
                  <div className="w-52 border-r border-border-color bg-page-bg/30 p-3 overflow-y-auto flex-shrink-0">
                    <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">节点组件</h3>
                    {CATEGORIES.map(cat => {
                      const items = NODE_TYPES.filter(n => n.category === cat);
                      if (items.length === 0) return null;
                      return (
                        <div key={cat} className="mb-3">
                          <p className="text-[10px] text-text-muted mb-1.5 font-medium">{cat}</p>
                          <div className="space-y-1">
                            {items.map(nt => (
                              <div key={nt.id} draggable onDragStart={e => e.dataTransfer.setData('nodeType', nt.id)}
                                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-grab active:cursor-grabbing transition-colors border border-transparent hover:border-border-color">
                                <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0" style={{ background: nt.bg }}>
                                  <nt.icon className="w-3.5 h-3.5" style={{ color: nt.color }} />
                                </div>
                                <span className="text-[11px] text-text-primary">{nt.name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 中间：画布 */}
                  <div ref={canvasRef} className="flex-1 relative overflow-auto bg-page-bg/20"
                    onDragOver={e => e.preventDefault()}
                    onDrop={handleCanvasDrop}
                    onClick={() => { if (connectingFrom) setConnectingFrom(null); else setSelectedNodeId(null); }}>
                    {/* 空状态 */}
                    {nodes.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="text-center text-text-muted">
                          <LayoutGrid className="w-12 h-12 mx-auto mb-3 opacity-15" />
                          <p className="text-sm">拖拽左侧节点到此画布</p>
                        </div>
                      </div>
                    )}
                    {/* 连线 */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
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
                            onClick={(e) => { e.stopPropagation(); removeConnection(node.id, outId); }}>
                            <path d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                              stroke="#6366f1" strokeWidth="2" fill="none" markerEnd="url(#arrow)" strokeDasharray="6,3" />
                            <path d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                              stroke="transparent" strokeWidth="10" fill="none" />
                          </g>
                        );
                      }))}
                    </svg>
                    {/* 节点 */}
                    {nodes.map(node => {
                      const nt = NODE_TYPES.find(n => n.id === node.typeId);
                      const isSelected = selectedNodeId === node.id;
                      const isConnecting = connectingFrom === node.id;
                      return (
                        <div key={node.id}
                          style={{ position: 'absolute', left: node.position.x, top: node.position.y, width: NODE_W, height: NODE_H, zIndex: isSelected ? 10 : 2 }}
                          className={`rounded-lg border-2 transition-all cursor-pointer select-none ${isConnecting ? 'border-dashed border-primary shadow-lg shadow-primary/20' : isSelected ? 'border-primary shadow-lg shadow-primary/10' : 'border-border-color hover:border-primary/40'}`}
                          onClick={e => { e.stopPropagation(); handleNodeClick(node.id); }}
                          onMouseDown={e => handleNodeDrag(node.id, e)}>
                          <div className="h-full flex flex-col justify-center px-3" style={{ background: nt?.bg || '#fff' }}>
                            <div className="flex items-center gap-2">
                              {nt && <nt.icon className="w-4 h-4 flex-shrink-0" style={{ color: nt.color }} />}
                              <span className="text-xs font-medium text-text-primary truncate">{node.name}</span>
                            </div>
                            <p className="text-[10px] text-text-muted mt-0.5 truncate">{nt?.desc}</p>
                          </div>
                          {/* 输出连接点 */}
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-3 rounded-full bg-primary border-2 border-white cursor-pointer hover:scale-125 transition-transform z-20"
                            onClick={e => { e.stopPropagation(); startConnecting(node.id); }} />
                          {/* 输入连接点 */}
                          {node.typeId !== 'trigger' && (
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-card-bg border-2 border-primary cursor-pointer hover:scale-125 transition-transform z-20"
                              onClick={e => { e.stopPropagation(); if (connectingFrom) handleNodeClick(node.id); }} />
                          )}
                          {/* 删除 */}
                          {isSelected && (
                            <button onClick={e => { e.stopPropagation(); removeNode(node.id); }}
                              className="absolute -top-2 -right-2 w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center hover:bg-rose-600 z-20">
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {/* 连线模式提示 */}
                    {connectingFrom && (
                      <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-primary/90 text-white text-xs rounded-full z-50">
                        点击目标节点完成连线，或点击画布取消
                      </div>
                    )}
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
                        {/* 动态字段 */}
                        {NODE_TYPES.find(n => n.id === selectedNode.typeId)?.fields.map(field => (
                          <div key={field.name} className="mb-3">
                            <label className="block text-xs text-text-muted mb-1">{field.label}{field.required && <span className="text-rose-400 ml-0.5">*</span>}</label>
                            {field.type === 'textarea' ? (
                              <textarea value={selectedNode.config[field.name] || ''} onChange={e => updateNodeConfig(selectedNode.id, field.name, e.target.value)}
                                placeholder={field.placeholder}
                                className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-md text-[11px] text-emerald-400 font-mono resize-y focus:border-primary focus:outline-none"
                                style={{ minHeight: field.name === 'script' ? '320px' : '80px', lineHeight: '1.6', tabSize: 2 }} />
                            ) : field.type === 'select' ? (
                              <select value={selectedNode.config[field.name] || ''} onChange={e => updateNodeConfig(selectedNode.id, field.name, e.target.value)}
                                className="w-full px-2.5 py-1.5 bg-card-bg border border-border-color rounded-lg text-xs text-text-primary focus:border-primary focus:outline-none">
                                <option value="">请选择</option>
                                {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                            ) : (
                              <input value={selectedNode.config[field.name] || ''} onChange={e => updateNodeConfig(selectedNode.id, field.name, e.target.value)}
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
                                  <button onClick={() => removeConnection(selectedNode.id, outId)} className="text-rose-400 hover:text-rose-600">
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
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
