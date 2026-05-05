import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Play, Edit2, Trash2, Copy, X, Save, Clock, Zap, GitBranch, AlertCircle, Mail,
  Shield, Ban, FileText, Globe, Database, Server, Code, Settings, ChevronRight,
  ChevronDown, LayoutGrid, Maximize2, Minimize2, Download, Upload, Eye, EyeOff,
  Terminal, FileCode, Variable, PlayCircle, PauseCircle, RotateCcw, CheckCircle2,
  AlertTriangle, Info, Layers, Box, Cpu, Workflow, RefreshCw
} from 'lucide-react';
import type { Playbook } from '../types';
import { playbooksApi } from '../services/api';

interface PlaybookNode {
  id: string;
  type: string;
  name: string;
  config: Record<string, any>;
  position: { x: number; y: number };
  script?: string;
  params: ParamDefinition[];
}

interface ParamDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'json' | 'select' | 'multiselect';
  label: string;
  description?: string;
  required: boolean;
  defaultValue?: any;
  options?: { label: string; value: any }[];
}

interface PlaybookFlow {
  nodes: PlaybookNode[];
  connections: { from: string; to: string; condition?: string }[];
}

const nodeTypes = [
  { id: 'trigger', name: '触发器', icon: Zap, color: '#10B981', category: '基础', desc: '剧本执行入口' },
  { id: 'condition', name: '条件判断', icon: GitBranch, color: '#F59E0B', category: '控制', desc: 'IF/ELSE条件分支' },
  { id: 'script', name: '执行脚本', icon: Terminal, color: '#3B82F6', category: '动作', desc: '执行Python/Bash脚本' },
  { id: 'api', name: 'API调用', icon: Globe, color: '#EC4899', category: '集成', desc: '调用REST API' },
  { id: 'block', name: 'IP封堵', icon: Ban, color: '#EF4444', category: '动作', desc: '防火墙IP封堵' },
  { id: 'isolate', name: '主机隔离', icon: Shield, color: '#F97316', category: '动作', desc: '网络隔离主机' },
  { id: 'ticket', name: '创建工单', icon: FileText, color: '#06B6D4', category: '动作', desc: 'ITSM工单创建' },
  { id: 'notification', name: '发送通知', icon: Mail, color: '#8B5CF6', category: '动作', desc: '多渠道通知' },
  { id: 'query', name: '数据查询', icon: Database, color: '#6366F1', category: '数据', desc: '查询安全数据' },
  { id: 'transform', name: '数据转换', icon: Code, color: '#84CC16', category: '数据', desc: '数据格式转换' },
  { id: 'webhook', name: 'Webhook', icon: Server, color: '#14B8A6', category: '集成', desc: 'HTTP回调' },
  { id: 'delay', name: '延迟等待', icon: Clock, color: '#6B7280', category: '控制', desc: '等待指定时间' },
  { id: 'parallel', name: '并行执行', icon: LayoutGrid, color: '#A855F7', category: '控制', desc: '并行分支' },
  { id: 'subflow', name: '子流程', icon: Workflow, color: '#22C55E', category: '控制', desc: '调用其他剧本' }
];

const categories = ['基础', '控制', '动作', '数据', '集成'];

const triggerTypes = [
  { value: 'event', label: '事件触发', desc: '当安全事件发生时自动执行' },
  { value: 'schedule', label: '定时触发', desc: '按Cron表达式定时执行' },
  { value: 'manual', label: '手动触发', desc: '需要人工手动启动' },
  { value: 'webhook', label: 'Webhook', desc: '通过HTTP请求触发' }
];

const scriptTemplates: Record<string, string> = {
  script: `# Python脚本示例
# 可用变量: event, context, params

def main():
    # 获取输入参数
    ip = params.get('target_ip', '')
    severity = event.get('severity', 'low')
    
    # 执行业务逻辑
    result = {
        'status': 'success',
        'message': f'处理IP: {ip}',
        'data': {
            'blocked': severity in ['critical', 'high'],
            'timestamp': context.get('timestamp')
        }
    }
    
    return result

# 执行主函数
output = main()`,

  api: `# API调用配置
# 支持变量替换: {{params.url}}, {{event.ip}}

method: POST
url: "{{params.endpoint}}/api/v1/block"
headers:
  Authorization: "Bearer {{params.token}}"
  Content-Type: "application/json"
body:
  ip: "{{event.sourceIp}}"
  duration: "{{params.duration}}"
  reason: "{{event.title}}"`,

  block: `# IP封堵脚本
# 自动调用防火墙API进行IP封堵

def block_ip():
    ip = params.get('ip_address')
    duration = params.get('duration_minutes', 60)
    
    # 调用防火墙API
    firewall_api = context.get('firewall_api')
    result = firewall_api.block(ip, duration)
    
    return {
        'blocked': result.success,
        'ip': ip,
        'duration': duration,
        'message': result.message
    }

output = block_ip()`,

  query: `# 数据查询
# 查询ES/Splunk等数据源

def query_data():
    query = {
        'index': params.get('index', 'security'),
        'query': {
            'bool': {
                'must': [
                    {'term': {'source_ip': event.get('sourceIp')}},
                    {'range': {'@timestamp': {'gte': 'now-1h'}}}
                ]
            }
        },
        'size': params.get('limit', 100)
    }
    
    result = context.get('es_client').search(query)
    return {
        'total': result.hits.total.value,
        'events': [hit._source for hit in result.hits.hits]
    }

output = query_data()`
};

const defaultParams: Record<string, ParamDefinition[]> = {
  script: [
    { name: 'timeout', type: 'number', label: '执行超时(秒)', description: '脚本执行超时时间', required: true, defaultValue: 30 },
    { name: 'interpreter', type: 'select', label: '解释器', description: '脚本执行环境', required: true, defaultValue: 'python3', options: [{ label: 'Python 3', value: 'python3' }, { label: 'Bash', value: 'bash' }, { label: 'PowerShell', value: 'powershell' }] }
  ],
  api: [
    { name: 'endpoint', type: 'string', label: 'API地址', description: 'API基础URL', required: true },
    { name: 'method', type: 'select', label: '请求方法', required: true, defaultValue: 'POST', options: [{ label: 'GET', value: 'GET' }, { label: 'POST', value: 'POST' }, { label: 'PUT', value: 'PUT' }, { label: 'DELETE', value: 'DELETE' }] },
    { name: 'token', type: 'string', label: '认证Token', description: 'API认证令牌', required: false },
    { name: 'timeout', type: 'number', label: '超时(秒)', required: true, defaultValue: 30 },
    { name: 'retry', type: 'number', label: '重试次数', required: true, defaultValue: 3 }
  ],
  block: [
    { name: 'ip_address', type: 'string', label: '目标IP', description: '要封堵的IP地址', required: true },
    { name: 'duration_minutes', type: 'number', label: '封堵时长(分钟)', required: true, defaultValue: 60 },
    { name: 'firewall_type', type: 'select', label: '防火墙类型', required: true, defaultValue: 'waf', options: [{ label: 'WAF', value: 'waf' }, { label: '边界防火墙', value: 'border' }, { label: '云防火墙', value: 'cloud' }] },
    { name: 'reason', type: 'string', label: '封堵原因', required: false }
  ],
  notification: [
    { name: 'channels', type: 'multiselect', label: '通知渠道', required: true, defaultValue: ['email'], options: [{ label: '邮件', value: 'email' }, { label: '短信', value: 'sms' }, { label: '钉钉', value: 'dingtalk' }, { label: '企业微信', value: 'wechat' }] },
    { name: 'recipients', type: 'string', label: '接收人', description: '多个用逗号分隔', required: true },
    { name: 'template', type: 'select', label: '消息模板', required: true, defaultValue: 'default', options: [{ label: '默认模板', value: 'default' }, { label: '紧急告警', value: 'urgent' }, { label: '日报', value: 'daily' }] }
  ],
  ticket: [
    { name: 'system', type: 'select', label: '工单系统', required: true, defaultValue: 'itsm', options: [{ label: 'ITSM', value: 'itsm' }, { label: 'ServiceNow', value: 'servicenow' }, { label: 'Jira', value: 'jira' }] },
    { name: 'priority', type: 'select', label: '优先级', required: true, defaultValue: 'high', options: [{ label: '紧急', value: 'urgent' }, { label: '高', value: 'high' }, { label: '中', value: 'medium' }, { label: '低', value: 'low' }] },
    { name: 'assignee', type: 'string', label: '指派给', required: false }
  ],
  query: [
    { name: 'datasource', type: 'select', label: '数据源', required: true, defaultValue: 'es', options: [{ label: 'Elasticsearch', value: 'es' }, { label: 'Splunk', value: 'splunk' }, { label: 'ClickHouse', value: 'clickhouse' }] },
    { name: 'index', type: 'string', label: '索引/库名', required: true, defaultValue: 'security' },
    { name: 'query', type: 'string', label: '查询语句', description: '支持变量: {{event.ip}}', required: true },
    { name: 'limit', type: 'number', label: '返回条数', required: true, defaultValue: 100 },
    { name: 'time_range', type: 'select', label: '时间范围', required: true, defaultValue: '1h', options: [{ label: '最近1小时', value: '1h' }, { label: '最近24小时', value: '24h' }, { label: '最近7天', value: '7d' }] }
  ],
  condition: [
    { name: 'expression', type: 'string', label: '条件表达式', description: '例如: event.severity == "high"', required: true },
    { name: 'true_branch', type: 'string', label: 'True分支标签', required: false, defaultValue: '是' },
    { name: 'false_branch', type: 'string', label: 'False分支标签', required: false, defaultValue: '否' }
  ],
  delay: [
    { name: 'duration', type: 'number', label: '等待时长', required: true, defaultValue: 5 },
    { name: 'unit', type: 'select', label: '时间单位', required: true, defaultValue: 'minutes', options: [{ label: '秒', value: 'seconds' }, { label: '分钟', value: 'minutes' }, { label: '小时', value: 'hours' }] }
  ],
  webhook: [
    { name: 'url', type: 'string', label: 'Webhook URL', required: true },
    { name: 'method', type: 'select', label: '请求方法', required: true, defaultValue: 'POST', options: [{ label: 'POST', value: 'POST' }, { label: 'GET', value: 'GET' }] },
    { name: 'secret', type: 'string', label: '签名密钥', description: '用于验证请求', required: false }
  ],
  transform: [
    { name: 'input_format', type: 'select', label: '输入格式', required: true, defaultValue: 'json', options: [{ label: 'JSON', value: 'json' }, { label: 'XML', value: 'xml' }, { label: 'CSV', value: 'csv' }] },
    { name: 'output_format', type: 'select', label: '输出格式', required: true, defaultValue: 'json', options: [{ label: 'JSON', value: 'json' }, { label: 'XML', value: 'xml' }, { label: 'YAML', value: 'yaml' }] },
    { name: 'mapping', type: 'string', label: '字段映射', description: 'JSON格式映射规则', required: false }
  ],
  subflow: [
    { name: 'playbook_id', type: 'string', label: '子剧本ID', required: true },
    { name: 'async', type: 'boolean', label: '异步执行', description: '是否等待子剧本完成', required: true, defaultValue: false }
  ],
  parallel: [
    { name: 'branches', type: 'number', label: '分支数量', required: true, defaultValue: 2 },
    { name: 'wait_all', type: 'boolean', label: '等待全部完成', required: true, defaultValue: true }
  ]
};

export default function Playbooks() {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingPlaybook, setEditingPlaybook] = useState<Playbook | null>(null);
  const [activeTab, setActiveTab] = useState<'visual' | 'code' | 'execute'>('visual');
  const [selectedCategory, setSelectedCategory] = useState('基础');
  const [flow, setFlow] = useState<PlaybookFlow>({ nodes: [], connections: [] });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [showNodePanel, setShowNodePanel] = useState(true);
  const [showConfigPanel, setShowConfigPanel] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [activeConfigTab, setActiveConfigTab] = useState<'params' | 'script' | 'preview'>('params');
  const [executionLogs, setExecutionLogs] = useState<Array<{ time: string; level: string; message: string }>>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    name: '',
    triggerType: 'event',
    description: '',
    cron: ''
  });

  const fetchPlaybooks = async () => {
    setLoading(true);
    try {
      const res = await playbooksApi.getPlaybooks({ page_size: 100 });
      if (res.success && res.data) {
        const items = Array.isArray(res.data) ? res.data : res.data.items || [];
        setPlaybooks(items);
      } else {
        setPlaybooks([]);
      }
    } catch (error) {
      console.error('获取剧本列表失败:', error);
      setPlaybooks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlaybooks();
  }, []);

  const toggleStatus = (id: string) => {
    setPlaybooks(prev => prev.map(pb =>
      pb.id === id ? { ...pb, status: pb.status === 'enabled' ? 'disabled' : 'enabled' } : pb
    ));
  };

  const handleAdd = () => {
    setEditingPlaybook(null);
    setFormData({ name: '', triggerType: 'event', description: '', cron: '' });
    setFlow({ nodes: [], connections: [] });
    setActiveTab('visual');
    setShowEditor(true);
  };

  const handleEdit = (playbook: Playbook) => {
    setEditingPlaybook(playbook);
    setFormData({
      name: playbook.name,
      triggerType: playbook.triggerType === '事件触发' ? 'event' : playbook.triggerType === '定时触发' ? 'schedule' : 'manual',
      description: '',
      cron: ''
    });
    setFlow({
      nodes: [
        { id: 'start', type: 'trigger', name: '开始', config: {}, params: [], position: { x: 400, y: 50 } },
        { id: 'action1', type: 'script', name: '处理事件', config: {}, params: defaultParams.script || [], script: scriptTemplates.script, position: { x: 400, y: 200 } },
        { id: 'end', type: 'notification', name: '发送通知', config: {}, params: defaultParams.notification || [], position: { x: 400, y: 350 } }
      ],
      connections: [
        { from: 'start', to: 'action1' },
        { from: 'action1', to: 'end' }
      ]
    });
    setShowEditor(true);
  };

  const handleSave = () => {
    if (!formData.name) return;
    const triggerLabel = triggerTypes.find(t => t.value === formData.triggerType)?.label || '事件触发';
    if (editingPlaybook) {
      setPlaybooks(prev => prev.map(pb =>
        pb.id === editingPlaybook.id
          ? { ...pb, name: formData.name, triggerType: triggerLabel, nodeCount: flow.nodes.length, lastModified: new Date().toISOString() }
          : pb
      ));
    } else {
      const newPlaybook: Playbook = {
        id: `PB-${new Date().getFullYear()}-${String(playbooks.length + 1).padStart(3, '0')}`,
        name: formData.name,
        triggerType: triggerLabel,
        status: 'disabled',
        lastModified: new Date().toISOString(),
        nodeCount: flow.nodes.length || 1
      };
      setPlaybooks(prev => [...prev, newPlaybook]);
    }
    setShowEditor(false);
  };

  const handleDelete = (id: string) => {
    setPlaybooks(prev => prev.filter(pb => pb.id !== id));
  };

  const handleDuplicate = (playbook: Playbook) => {
    const newPlaybook: Playbook = {
      ...playbook,
      id: `PB-${new Date().getFullYear()}-${String(playbooks.length + 1).padStart(3, '0')}`,
      name: `${playbook.name} (副本)`,
      status: 'disabled',
      lastModified: new Date().toISOString()
    };
    setPlaybooks(prev => [...prev, newPlaybook]);
  };

  const addNode = (type: string) => {
    const nodeType = nodeTypes.find(n => n.id === type);
    if (!nodeType) return;
    const newNode: PlaybookNode = {
      id: `node-${Date.now()}`,
      type,
      name: nodeType.name,
      config: {},
      params: defaultParams[type] || [],
      script: scriptTemplates[type] || '',
      position: { x: 400, y: 100 + flow.nodes.length * 120 }
    };
    setFlow(prev => ({ ...prev, nodes: [...prev.nodes, newNode] }));
    setSelectedNode(newNode.id);
    setActiveConfigTab(type === 'script' || type === 'api' || type === 'block' || type === 'query' ? 'script' : 'params');
  };

  const deleteNode = (nodeId: string) => {
    setFlow(prev => ({
      nodes: prev.nodes.filter(n => n.id !== nodeId),
      connections: prev.connections.filter(c => c.from !== nodeId && c.to !== nodeId)
    }));
    if (selectedNode === nodeId) setSelectedNode(null);
  };

  const updateNodeConfig = (nodeId: string, key: string, value: any) => {
    setFlow(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, config: { ...n.config, [key]: value } } : n)
    }));
  };

  const updateNodeScript = (nodeId: string, script: string) => {
    setFlow(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, script } : n)
    }));
  };

  const updateNodeName = (nodeId: string, name: string) => {
    setFlow(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, name } : n)
    }));
  };

  const generateCode = () => {
    return JSON.stringify({
      name: formData.name,
      version: '1.0',
      trigger: { type: formData.triggerType, cron: formData.cron },
      nodes: flow.nodes.map(n => ({
        id: n.id,
        type: n.type,
        name: n.name,
        params: n.config,
        script: n.script
      })),
      connections: flow.connections
    }, null, 2);
  };

  const handleExecute = async () => {
    setIsExecuting(true);
    setExecutionLogs([
      { time: new Date().toLocaleTimeString(), level: 'info', message: '开始执行剧本...' },
      { time: new Date().toLocaleTimeString(), level: 'info', message: `剧本: ${formData.name}` },
      { time: new Date().toLocaleTimeString(), level: 'info', message: `节点数: ${flow.nodes.length}` }
    ]);
    for (let i = 0; i < flow.nodes.length; i++) {
      const node = flow.nodes[i];
      await new Promise(r => setTimeout(r, 800));
      setExecutionLogs(prev => [...prev, {
        time: new Date().toLocaleTimeString(),
        level: 'info',
        message: `[${node.name}] 执行完成`
      }]);
    }
    await new Promise(r => setTimeout(r, 500));
    setExecutionLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), level: 'success', message: '剧本执行成功' }]);
    setIsExecuting(false);
  };

  const selectedNodeData = flow.nodes.find(n => n.id === selectedNode);

  const renderParamInput = (param: ParamDefinition, value: any, onChange: (val: any) => void) => {
    switch (param.type) {
      case 'string':
        return (
          <input
            type="text"
            value={value || param.defaultValue || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={param.description}
            className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none text-sm"
          />
        );
      case 'number':
        return (
          <input
            type="number"
            value={value || param.defaultValue || 0}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none text-sm"
          />
        );
      case 'boolean':
        return (
          <button
            onClick={() => onChange(!value)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? 'bg-primary' : 'bg-text-muted'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        );
      case 'select':
        return (
          <select
            value={value || param.defaultValue || ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none text-sm"
          >
            {param.options?.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        );
      case 'multiselect':
        return (
          <div className="space-y-1">
            {param.options?.map(opt => {
              const isSelected = (value || []).includes(opt.value);
              return (
                <button
                  key={opt.value}
                  onClick={() => {
                    const current = value || [];
                    const newVal = isSelected ? current.filter((v: any) => v !== opt.value) : [...current, opt.value];
                    onChange(newVal);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isSelected ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-page-bg border border-border-color text-text-secondary'
                  }`}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-primary border-primary' : 'border-text-muted'}`}>
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  {opt.label}
                </button>
              );
            })}
          </div>
        );
      case 'json':
        return (
          <textarea
            value={JSON.stringify(value || {}, null, 2)}
            onChange={(e) => {
              try { onChange(JSON.parse(e.target.value)); } catch {}
            }}
            rows={4}
            className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none resize-none text-sm font-mono"
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">剧本编排</h1>
          <p className="text-text-secondary text-sm mt-1">可视化编排SOAR自动化剧本</p>
        </div>
        <button onClick={handleAdd} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors">
          <Plus className="w-4 h-4" />
          新建剧本
        </button>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-card-bg/50 border-b border-border-color">
            <tr>
              <th className="text-left py-4 px-6 text-text-secondary font-medium text-sm">剧本ID</th>
              <th className="text-left py-4 px-6 text-text-secondary font-medium text-sm">名称</th>
              <th className="text-left py-4 px-6 text-text-secondary font-medium text-sm">触发方式</th>
              <th className="text-left py-4 px-6 text-text-secondary font-medium text-sm">节点数</th>
              <th className="text-left py-4 px-6 text-text-secondary font-medium text-sm">状态</th>
              <th className="text-left py-4 px-6 text-text-secondary font-medium text-sm">最后修改</th>
              <th className="text-left py-4 px-6 text-text-secondary font-medium text-sm">操作</th>
            </tr>
          </thead>
          <tbody>
            {playbooks.map((pb, index) => (
              <motion.tr key={pb.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className="border-b border-border-color/50 hover:bg-primary/5 transition-colors">
                <td className="py-4 px-6 text-text-secondary font-mono text-sm">{pb.id}</td>
                <td className="py-4 px-6 text-text-primary font-medium">{pb.name}</td>
                <td className="py-4 px-6"><span className="px-2 py-1 bg-primary/20 text-primary text-xs rounded">{pb.triggerType}</span></td>
                <td className="py-4 px-6 text-text-secondary">{pb.nodeCount}</td>
                <td className="py-4 px-6">
                  <button onClick={() => toggleStatus(pb.id)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${pb.status === 'enabled' ? 'bg-primary' : 'bg-text-muted'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${pb.status === 'enabled' ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </td>
                <td className="py-4 px-6 text-text-secondary text-sm">{new Date(pb.lastModified).toLocaleString()}</td>
                <td className="py-4 px-6">
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleEdit(pb)} className="p-2 text-text-secondary hover:text-primary transition-colors"><Edit2 className="w-4 h-4" /></button>
                    <button className="p-2 text-text-secondary hover:text-success transition-colors"><Play className="w-4 h-4" /></button>
                    <button onClick={() => handleDuplicate(pb)} className="p-2 text-text-secondary hover:text-primary transition-colors"><Copy className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(pb.id)} className="p-2 text-text-secondary hover:text-critical transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {showEditor && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 z-50" onClick={() => setShowEditor(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="fixed inset-4 z-50 pointer-events-none">
              <div className="w-full h-full glass-card rounded-xl overflow-hidden pointer-events-auto flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-border-color bg-card-bg/50">
                  <div className="flex items-center gap-4">
                    <h2 className="text-lg font-semibold text-text-primary">{editingPlaybook ? '编辑剧本' : '新建剧本'}</h2>
                    <div className="flex items-center gap-2 bg-page-bg rounded-lg p-1">
                      {['visual', 'code', 'execute'].map((tab) => (
                        <button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-3 py-1.5 rounded text-sm transition-colors flex items-center gap-1.5 ${activeTab === tab ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'}`}>
                          {tab === 'visual' && <LayoutGrid className="w-4 h-4" />}
                          {tab === 'code' && <Code className="w-4 h-4" />}
                          {tab === 'execute' && <PlayCircle className="w-4 h-4" />}
                          {tab === 'visual' ? '可视化' : tab === 'code' ? '代码' : '执行'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeTab === 'visual' && (
                      <>
                        <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="p-2 text-text-secondary hover:text-text-primary"><Minimize2 className="w-4 h-4" /></button>
                        <span className="text-text-secondary text-sm">{Math.round(zoom * 100)}%</span>
                        <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="p-2 text-text-secondary hover:text-text-primary"><Maximize2 className="w-4 h-4" /></button>
                        <div className="w-px h-6 bg-border-color mx-2" />
                      </>
                    )}
                    <button onClick={() => setShowEditor(false)} className="px-4 py-2 text-text-secondary hover:text-text-primary">取消</button>
                    <button onClick={handleSave} disabled={!formData.name} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white rounded-lg"><Save className="w-4 h-4" />保存</button>
                  </div>
                </div>

                {activeTab === 'visual' ? (
                  <div className="flex-1 flex overflow-hidden">
                    {showNodePanel && (
                      <div className="w-64 border-r border-border-color bg-card-bg/30 p-4">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-medium text-text-primary">组件库</h3>
                          <button onClick={() => setShowNodePanel(false)} className="p-1 text-text-secondary hover:text-text-primary"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="space-y-4">
                          {categories.map(category => (
                            <div key={category}>
                              <h4 className="text-xs font-medium text-text-muted mb-2 uppercase">{category}</h4>
                              <div className="space-y-1">
                                {nodeTypes.filter(n => n.category === category).map(node => {
                                  const Icon = node.icon;
                                  return (
                                    <button key={node.id} onClick={() => addNode(node.id)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-primary/10 transition-colors group text-left">
                                      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${node.color}20` }}>
                                        <Icon className="w-4 h-4" style={{ color: node.color }} />
                                      </div>
                                      <div>
                                        <span className="text-sm text-text-secondary group-hover:text-text-primary block">{node.name}</span>
                                        <span className="text-xs text-text-muted">{node.desc}</span>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex-1 relative bg-page-bg overflow-hidden" ref={canvasRef}>
                      {!showNodePanel && (
                        <button onClick={() => setShowNodePanel(true)} className="absolute left-4 top-4 z-10 p-2 bg-card-bg border border-border-color rounded-lg text-text-secondary hover:text-text-primary"><LayoutGrid className="w-4 h-4" /></button>
                      )}
                      <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(to right, rgba(71, 85, 105, 0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(71, 85, 105, 0.1) 1px, transparent 1px)`, backgroundSize: '20px 20px', transform: `scale(${zoom})`, transformOrigin: 'center' }}>
                        {flow.nodes.length === 0 && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="text-center">
                              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4"><Zap className="w-8 h-8 text-primary" /></div>
                              <p className="text-text-secondary mb-2">从左侧选择组件开始编排</p>
                              <p className="text-text-muted text-sm">点击组件添加到画布</p>
                            </div>
                          </div>
                        )}
                        {flow.nodes.map(node => {
                          const nodeType = nodeTypes.find(n => n.id === node.type);
                          const Icon = nodeType?.icon || Zap;
                          const isSelected = selectedNode === node.id;
                          return (
                            <motion.div key={node.id} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`absolute w-56 bg-card-bg border-2 rounded-xl p-4 cursor-pointer transition-all ${isSelected ? 'border-primary shadow-lg shadow-primary/20' : 'border-border-color hover:border-primary/50'}`} style={{ left: node.position.x, top: node.position.y }} onClick={() => { setSelectedNode(node.id); setActiveConfigTab(node.type === 'script' || node.type === 'api' ? 'script' : 'params'); }}>
                              <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${nodeType?.color}20` }}>
                                  <Icon className="w-5 h-5" style={{ color: nodeType?.color }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <input value={node.name} onChange={(e) => updateNodeName(node.id, e.target.value)} className="w-full text-sm font-medium text-text-primary bg-transparent border-none focus:outline-none" onClick={(e) => e.stopPropagation()} />
                                  <p className="text-xs text-text-muted">{nodeType?.name}</p>
                                </div>
                              </div>
                              <div className="flex items-center justify-between mt-3 pt-3 border-t border-border-color/50">
                                <button onClick={(e) => { e.stopPropagation(); }} className="p-1.5 text-text-secondary hover:text-primary"><ChevronRight className="w-4 h-4" /></button>
                                <button onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }} className="p-1.5 text-text-secondary hover:text-critical"><Trash2 className="w-4 h-4" /></button>
                              </div>
                            </motion.div>
                          );
                        })}
                        <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%' }}>
                          {flow.connections.map((conn, i) => {
                            const fromNode = flow.nodes.find(n => n.id === conn.from);
                            const toNode = flow.nodes.find(n => n.id === conn.to);
                            if (!fromNode || !toNode) return null;
                            return <line key={i} x1={fromNode.position.x + 112} y1={fromNode.position.y + 80} x2={toNode.position.x + 112} y2={toNode.position.y} stroke="#3B82F6" strokeWidth="2" markerEnd="url(#arrowhead)" />;
                          })}
                          <defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#3B82F6" /></marker></defs>
                        </svg>
                      </div>
                    </div>

                    {showConfigPanel && (
                      <div className="w-96 border-l border-border-color bg-card-bg/30 overflow-auto">
                        <div className="p-4">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-medium text-text-primary">配置</h3>
                            <button onClick={() => setShowConfigPanel(false)} className="p-1 text-text-secondary hover:text-text-primary"><X className="w-4 h-4" /></button>
                          </div>
                          <div className="space-y-4">
                            <div>
                              <label className="block text-text-secondary text-sm mb-2">剧本名称</label>
                              <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none" />
                            </div>
                            <div>
                              <label className="block text-text-secondary text-sm mb-2">触发方式</label>
                              <select value={formData.triggerType} onChange={(e) => setFormData({ ...formData, triggerType: e.target.value })} className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none">
                                {triggerTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                              </select>
                            </div>
                            {formData.triggerType === 'schedule' && (
                              <div>
                                <label className="block text-text-secondary text-sm mb-2">Cron表达式</label>
                                <input type="text" value={formData.cron} onChange={(e) => setFormData({ ...formData, cron: e.target.value })} placeholder="0 0 * * *" className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none font-mono" />
                              </div>
                            )}
                            <div>
                              <label className="block text-text-secondary text-sm mb-2">描述</label>
                              <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={2} className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none resize-none" />
                            </div>
                          </div>

                          {selectedNodeData && (
                            <div className="mt-6 pt-6 border-t border-border-color">
                              <div className="flex items-center gap-2 mb-4">
                                <button onClick={() => setActiveConfigTab('params')} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${activeConfigTab === 'params' ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'}`}>参数</button>
                                {(selectedNodeData.type === 'script' || selectedNodeData.type === 'api' || selectedNodeData.type === 'block' || selectedNodeData.type === 'query') && (
                                  <button onClick={() => setActiveConfigTab('script')} className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1.5 ${activeConfigTab === 'script' ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'}`}><Terminal className="w-3.5 h-3.5" />脚本</button>
                                )}
                                <button onClick={() => setActiveConfigTab('preview')} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${activeConfigTab === 'preview' ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'}`}>预览</button>
                              </div>

                              {activeConfigTab === 'params' && (
                                <div className="space-y-4">
                                  <div className="flex items-center gap-3 pb-3 border-b border-border-color">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${nodeTypes.find(n => n.id === selectedNodeData.type)?.color}20` }}>
                                      {(nodeTypes.find(n => n.id === selectedNodeData.type)?.icon && React.createElement(nodeTypes.find(n => n.id === selectedNodeData.type)!.icon, { className: "w-5 h-5", style: { color: nodeTypes.find(n => n.id === selectedNodeData.type)?.color } }))}
                                    </div>
                                    <div>
                                      <input value={selectedNodeData.name} onChange={(e) => updateNodeName(selectedNodeData.id, e.target.value)} className="text-sm font-medium text-text-primary bg-transparent border-none focus:outline-none" />
                                      <p className="text-xs text-text-muted">{nodeTypes.find(n => n.id === selectedNodeData.type)?.name}</p>
                                    </div>
                                  </div>
                                  {selectedNodeData.params?.map((param: ParamDefinition) => (
                                    <div key={param.name}>
                                      <label className="block text-text-secondary text-xs mb-1.5">{param.label} {param.required && <span className="text-critical">*</span>}</label>
                                      {renderParamInput(param, selectedNodeData.config[param.name], (val) => updateNodeConfig(selectedNodeData.id, param.name, val))}
                                      {param.description && <p className="text-text-muted text-xs mt-1">{param.description}</p>}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {activeConfigTab === 'script' && selectedNodeData.script && (
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm text-text-secondary">执行脚本</span>
                                    <div className="flex items-center gap-2">
                                      <button className="px-2 py-1 text-xs text-text-secondary hover:text-primary border border-border-color rounded">Python</button>
                                      <button className="px-2 py-1 text-xs text-text-secondary hover:text-primary border border-border-color rounded">Bash</button>
                                    </div>
                                  </div>
                                  <div className="bg-page-bg rounded-lg border border-border-color overflow-hidden">
                                    <div className="flex items-center justify-between px-3 py-2 bg-card-bg border-b border-border-color">
                                      <span className="text-xs text-text-secondary">编辑器</span>
                                      <div className="flex items-center gap-1">
                                        <button className="p-1 text-text-secondary hover:text-primary"><Copy className="w-3.5 h-3.5" /></button>
                                        <button className="p-1 text-text-secondary hover:text-primary"><Upload className="w-3.5 h-3.5" /></button>
                                      </div>
                                    </div>
                                    <textarea
                                      value={selectedNodeData.script}
                                      onChange={(e) => updateNodeScript(selectedNodeData.id, e.target.value)}
                                      rows={12}
                                      className="w-full p-3 bg-page-bg text-text-primary font-mono text-xs resize-none focus:outline-none"
                                    />
                                  </div>
                                  <div className="bg-primary/5 rounded-lg p-3 border border-primary/20">
                                    <div className="flex items-center gap-2 text-primary text-xs mb-2"><Info className="w-4 h-4" />可用变量</div>
                                    <div className="space-y-1 text-xs text-text-secondary font-mono">
                                      <p><span className="text-primary">event</span> - 触发事件数据</p>
                                      <p><span className="text-primary">context</span> - 执行上下文</p>
                                      <p><span className="text-primary">params</span> - 节点参数</p>
                                      <p><span className="text-primary">output</span> - 输出结果</p>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {activeConfigTab === 'preview' && (
                                <div className="space-y-3">
                                  <div className="bg-page-bg rounded-lg p-3 border border-border-color">
                                    <div className="text-xs text-text-muted mb-2">节点配置预览</div>
                                    <pre className="text-xs text-text-secondary font-mono overflow-auto">{JSON.stringify({ id: selectedNodeData.id, type: selectedNodeData.type, name: selectedNodeData.name, params: selectedNodeData.config, script: selectedNodeData.script ? '...' : undefined }, null, 2)}</pre>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {!showConfigPanel && (
                      <button onClick={() => setShowConfigPanel(true)} className="absolute right-4 top-4 z-10 p-2 bg-card-bg border border-border-color rounded-lg text-text-secondary hover:text-text-primary"><Settings className="w-4 h-4" /></button>
                    )}
                  </div>
                ) : activeTab === 'code' ? (
                  <div className="flex-1 flex overflow-hidden">
                    <div className="flex-1 p-6">
                      <div className="h-full bg-page-bg rounded-xl border border-border-color overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2 bg-card-bg border-b border-border-color">
                          <span className="text-sm text-text-secondary">playbook.json</span>
                          <div className="flex items-center gap-2">
                            <button className="p-1.5 text-text-secondary hover:text-primary"><Copy className="w-4 h-4" /></button>
                            <button className="p-1.5 text-text-secondary hover:text-primary"><Download className="w-4 h-4" /></button>
                          </div>
                        </div>
                        <textarea value={generateCode()} readOnly className="w-full h-full p-4 bg-page-bg text-text-primary font-mono text-sm resize-none focus:outline-none" />
                      </div>
                    </div>
                    <div className="w-80 border-l border-border-color bg-card-bg/30 p-4">
                      <h3 className="text-sm font-medium text-text-primary mb-4">剧本信息</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-text-secondary text-sm mb-2">剧本名称</label>
                          <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none" />
                        </div>
                        <div>
                          <label className="block text-text-secondary text-sm mb-2">触发方式</label>
                          <select value={formData.triggerType} onChange={(e) => setFormData({ ...formData, triggerType: e.target.value })} className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none">
                            {triggerTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex overflow-hidden">
                    <div className="flex-1 p-6">
                      <div className="h-full bg-page-bg rounded-xl border border-border-color overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between px-4 py-3 bg-card-bg border-b border-border-color">
                          <div className="flex items-center gap-3">
                            <Terminal className="w-5 h-5 text-primary" />
                            <span className="text-sm font-medium text-text-primary">执行日志</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => setExecutionLogs([])} className="p-1.5 text-text-secondary hover:text-primary"><RotateCcw className="w-4 h-4" /></button>
                          </div>
                        </div>
                        <div className="flex-1 p-4 overflow-auto font-mono text-sm space-y-2">
                          {executionLogs.length === 0 ? (
                            <div className="text-center text-text-muted py-12">
                              <PlayCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                              <p>点击右侧"开始执行"运行剧本</p>
                            </div>
                          ) : (
                            executionLogs.map((log, i) => (
                              <div key={i} className="flex items-start gap-3">
                                <span className="text-text-muted text-xs">{log.time}</span>
                                <span className={`px-1.5 py-0.5 rounded text-xs ${log.level === 'success' ? 'bg-success/20 text-success' : log.level === 'error' ? 'bg-critical/20 text-critical' : log.level === 'warning' ? 'bg-high/20 text-high' : 'bg-primary/20 text-primary'}`}>{log.level.toUpperCase()}</span>
                                <span className="text-text-secondary">{log.message}</span>
                              </div>
                            ))
                          )}
                          {isExecuting && (
                            <div className="flex items-center gap-2 text-text-muted">
                              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                              执行中...
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="w-80 border-l border-border-color bg-card-bg/30 p-4">
                      <h3 className="text-sm font-medium text-text-primary mb-4">执行控制</h3>
                      <div className="space-y-4">
                        <div className="bg-page-bg rounded-lg p-4 border border-border-color">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center"><Box className="w-5 h-5 text-primary" /></div>
                            <div>
                              <p className="text-sm font-medium text-text-primary">{formData.name || '未命名剧本'}</p>
                              <p className="text-xs text-text-muted">{flow.nodes.length} 个节点</p>
                            </div>
                          </div>
                          <div className="space-y-2 text-xs text-text-secondary">
                            <div className="flex justify-between"><span>触发方式</span><span>{triggerTypes.find(t => t.value === formData.triggerType)?.label}</span></div>
                            <div className="flex justify-between"><span>状态</span><span className="text-success">就绪</span></div>
                          </div>
                        </div>
                        <button onClick={handleExecute} disabled={isExecuting || flow.nodes.length === 0} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors">
                          {isExecuting ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />执行中...</> : <><PlayCircle className="w-5 h-5" />开始执行</>}
                        </button>
                        <div className="bg-primary/5 rounded-lg p-3 border border-primary/20">
                          <div className="flex items-center gap-2 text-primary text-xs mb-2"><Info className="w-4 h-4" />执行说明</div>
                          <p className="text-xs text-text-secondary">剧本将在后端执行，执行结果会实时显示在日志中。支持查看每个节点的输入输出。</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
