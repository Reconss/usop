import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, MessageSquare, Send, Sparkles, Wand2, FileText, Shield, AlertTriangle,
  Search, Clock, Copy, ThumbsUp, ThumbsDown, RotateCcw, Settings, Zap,
  TrendingUp, Target, ChevronRight, Bot, User, MoreHorizontal, Download,
  Share2, Bookmark, Trash2, Plus, Filter, BarChart3, Cpu, Database,
  Network, Lock, Eye, FileSearch, CheckCircle, XCircle, Loader2, X, Sliders,
  Thermometer, Gauge, Server, Globe, Key, ChevronDown
} from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  model?: string;
  tokens?: number;
  attachments?: string[];
}

interface AIInsight {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  confidence: number;
  timestamp: string;
  relatedEvents: string[];
}

interface AIAgent {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  status: 'active' | 'idle' | 'busy';
  capabilities: string[];
  lastActive: string;
}

interface ChatSession {
  id: string;
  title: string;
  time: string;
  active: boolean;
}

interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  enabled: boolean;
}

const aiAgents: AIAgent[] = [
  {
    id: 'agent-1',
    name: '威胁分析助手',
    description: '自动分析安全事件，识别攻击模式和威胁情报',
    icon: Shield,
    status: 'active',
    capabilities: ['事件分析', '威胁情报', '攻击链重建'],
    lastActive: '2026-04-27T10:30:00Z'
  },
  {
    id: 'agent-2',
    name: '日志解析专家',
    description: '解析复杂日志，提取关键安全指标和异常行为',
    icon: FileText,
    status: 'idle',
    capabilities: ['日志解析', '异常检测', '模式识别'],
    lastActive: '2026-04-27T09:15:00Z'
  },
  {
    id: 'agent-3',
    name: '调查协作者',
    description: '协助安全调查，提供分析建议和关联信息',
    icon: Search,
    status: 'busy',
    capabilities: ['关联分析', '证据收集', '报告生成'],
    lastActive: '2026-04-27T08:45:00Z'
  },
  {
    id: 'agent-4',
    name: '合规检查员',
    description: '检查安全策略合规性，识别配置风险',
    icon: CheckCircle,
    status: 'active',
    capabilities: ['合规检查', '策略审计', '风险评估'],
    lastActive: '2026-04-27T07:30:00Z'
  }
];

const aiInsights: AIInsight[] = [
  {
    id: 'INS-001',
    title: '检测到APT攻击模式',
    description: 'AI分析发现疑似APT组织使用的攻击手法，建议立即调查',
    severity: 'critical',
    category: '威胁情报',
    confidence: 92,
    timestamp: '2026-04-27T10:30:00Z',
    relatedEvents: ['EVT-2026-001', 'EVT-2026-003']
  },
  {
    id: 'INS-002',
    title: '内部威胁风险预警',
    description: '用户行为分析显示异常数据访问模式',
    severity: 'high',
    category: '用户行为',
    confidence: 85,
    timestamp: '2026-04-27T09:15:00Z',
    relatedEvents: ['EVT-2026-002']
  },
  {
    id: 'INS-003',
    title: '配置漂移检测',
    description: '关键安全设备配置发生未授权变更',
    severity: 'medium',
    category: '合规管理',
    confidence: 78,
    timestamp: '2026-04-27T08:45:00Z',
    relatedEvents: []
  },
  {
    id: 'INS-004',
    title: '零日漏洞利用迹象',
    description: '检测到疑似针对未公开漏洞的攻击行为',
    severity: 'critical',
    category: '漏洞利用',
    confidence: 88,
    timestamp: '2026-04-27T07:30:00Z',
    relatedEvents: ['EVT-2026-004', 'EVT-2026-005']
  }
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } }
};

const AICenter: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'chat' | 'insights' | 'agents' | 'models'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: '您好！我是USOP AI安全助手。我可以帮助您分析安全事件、查询威胁情报、生成调查报告等。请问有什么可以帮助您的？',
      timestamp: '2026-04-27T10:00:00Z',
      model: 'GPT-4 Security',
      tokens: 156
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [showModelConfigModal, setShowModelConfigModal] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([
    { title: '分析今日安全事件', time: '10:30', active: true },
    { title: '查询APT威胁情报', time: '09:15', active: false },
    { title: '生成周报报告', time: '昨天', active: false },
    { title: '检查合规状态', time: '昨天', active: false },
    { title: '调查异常登录', time: '3天前', active: false }
  ]);
  const [newSessionForm, setNewSessionForm] = useState({
    title: '',
    agent: 'agent-1',
    template: ''
  });
  const [modelConfigs, setModelConfigs] = useState<ModelConfig[]>([
    {
      id: 'model-1',
      name: 'GPT-4 Security',
      provider: 'OpenAI',
      apiKey: 'sk-****',
      temperature: 0.7,
      maxTokens: 4096,
      topP: 1,
      enabled: true
    },
    {
      id: 'model-2',
      name: 'ThreatBERT',
      provider: 'Hugging Face',
      apiKey: 'hf-****',
      temperature: 0.5,
      maxTokens: 2048,
      topP: 0.9,
      enabled: true
    },
    {
      id: 'model-3',
      name: 'LogAnalyzer',
      provider: 'Custom',
      apiKey: 'local',
      temperature: 0.3,
      maxTokens: 1024,
      topP: 1,
      enabled: false
    }
  ]);
  const [editingModel, setEditingModel] = useState<ModelConfig | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsTyping(true);

    setTimeout(() => {
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '我已收到您的查询。基于当前安全数据，我发现了以下关键信息：\n\n1. 过去24小时内检测到3起高危事件\n2. 建议关注IP 192.168.1.100的异常活动\n3. 发现疑似APT组织的攻击特征\n\n需要我为您生成详细的分析报告吗？',
        timestamp: new Date().toISOString(),
        model: 'GPT-4 Security',
        tokens: 248
      };
      setMessages(prev => [...prev, assistantMessage]);
      setIsTyping(false);
    }, 2000);
  };

  const handleCreateSession = () => {
    const newSession: ChatSession = {
      title: newSessionForm.title || '新会话',
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      active: true
    };
    setSessions(prev => [{ ...newSession, active: true }, ...prev.map(s => ({ ...s, active: false }))]);
    setMessages([{
      id: Date.now().toString(),
      role: 'assistant',
      content: `您好！我是${aiAgents.find(a => a.id === newSessionForm.agent)?.name || 'AI助手'}。${aiAgents.find(a => a.id === newSessionForm.agent)?.description || ''}请问有什么可以帮助您的？`,
      timestamp: new Date().toISOString(),
      model: 'GPT-4 Security',
      tokens: 120
    }]);
    setShowNewSessionModal(false);
    setNewSessionForm({ title: '', agent: 'agent-1', template: '' });
  };

  const handleSaveModelConfig = () => {
    if (editingModel) {
      setModelConfigs(prev => prev.map(m => m.id === editingModel.id ? editingModel : m));
      setEditingModel(null);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'low': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/20 text-green-400';
      case 'idle': return 'bg-blue-500/20 text-blue-400';
      case 'busy': return 'bg-yellow-500/20 text-yellow-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  const quickActions = [
    { label: '分析最近事件', icon: FileSearch },
    { label: '生成威胁报告', icon: FileText },
    { label: '查询威胁情报', icon: Search },
    { label: '检查合规状态', icon: CheckCircle }
  ];

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
            <Brain className="text-primary" size={28} />
            AI中心
          </h1>
          <p className="text-text-secondary mt-1">智能安全分析与自动化响应</p>
        </div>
        <div className="flex items-center gap-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowModelConfigModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-card-bg border border-border-color rounded-lg text-text-secondary hover:text-text-primary hover:border-primary/50 transition-all"
          >
            <Settings size={18} />
            模型配置
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowNewSessionModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all"
          >
            <Sparkles size={18} />
            新建会话
          </motion.button>
        </div>
      </motion.div>

      <motion.div variants={itemVariants} className="grid grid-cols-4 gap-4">
        {[
          { label: 'AI分析事件', value: '1,234', icon: Brain, color: 'text-primary', bgColor: 'bg-primary/10' },
          { label: '智能洞察', value: '89', icon: Sparkles, color: 'text-purple-400', bgColor: 'bg-purple-500/10' },
          { label: '自动化响应', value: '156', icon: Zap, color: 'text-green-400', bgColor: 'bg-green-500/10' },
          { label: '平均处理时间', value: '45s', icon: Clock, color: 'text-blue-400', bgColor: 'bg-blue-500/10' }
        ].map((stat) => (
          <motion.div key={stat.label} whileHover={{ y: -2 }} className="bg-card-bg border border-border-color rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-text-secondary text-sm">{stat.label}</p>
                <p className="text-2xl font-bold text-text-primary mt-1">{stat.value}</p>
              </div>
              <div className={`w-10 h-10 rounded-lg ${stat.bgColor} flex items-center justify-center`}>
                <stat.icon size={20} className={stat.color} />
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <motion.div variants={itemVariants} className="bg-card-bg border border-border-color rounded-xl overflow-hidden">
        <div className="flex items-center gap-6 px-6 border-b border-border-color">
          {[
            { id: 'chat', label: '智能对话', icon: MessageSquare },
            { id: 'insights', label: 'AI洞察', icon: Sparkles },
            { id: 'agents', label: 'AI代理', icon: Bot },
            { id: 'models', label: '模型管理', icon: Cpu }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 py-4 text-sm font-medium transition-colors relative ${
                activeTab === tab.id ? 'text-primary' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
              {activeTab === tab.id && (
                <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === 'chat' && (
            <div className="h-[500px] flex gap-4">
              <div className="w-64 border-r border-border-color pr-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-text-primary font-medium">会话历史</h3>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setShowNewSessionModal(true)}
                    className="p-1.5 text-text-secondary hover:text-primary rounded-lg hover:bg-primary/10"
                  >
                    <Plus size={16} />
                  </motion.button>
                </div>
                <div className="space-y-2">
                  {sessions.map((session, i) => (
                    <motion.div
                      key={i}
                      whileHover={{ x: 2 }}
                      onClick={() => setSessions(prev => prev.map((s, idx) => ({ ...s, active: idx === i })))}
                      className={`p-3 rounded-lg cursor-pointer transition-colors ${
                        session.active ? 'bg-primary/10 border border-primary/30' : 'hover:bg-page-bg border border-transparent'
                      }`}
                    >
                      <p className={`text-sm font-medium ${session.active ? 'text-primary' : 'text-text-primary'}`}>
                        {session.title}
                      </p>
                      <p className="text-xs text-text-muted mt-1">{session.time}</p>
                    </motion.div>
                  ))}
                </div>
              </div>

              <div className="flex-1 flex flex-col">
                <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                  {messages.map((message) => (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        message.role === 'user' ? 'bg-primary/20' : 'bg-purple-500/20'
                      }`}>
                        {message.role === 'user' ? (
                          <User size={16} className="text-primary" />
                        ) : (
                          <Bot size={16} className="text-purple-400" />
                        )}
                      </div>
                      <div className={`max-w-[70%] ${message.role === 'user' ? 'text-right' : ''}`}>
                        <div className={`inline-block p-3 rounded-lg ${
                          message.role === 'user'
                            ? 'bg-primary text-white'
                            : 'bg-page-bg border border-border-color text-text-primary'
                        }`}>
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
                          <span>{new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                          {message.model && <><span>·</span><span>{message.model}</span></>}
                          {message.tokens && <><span>·</span><span>{message.tokens} tokens</span></>}
                        </div>
                        {message.role === 'assistant' && (
                          <div className="flex items-center gap-2 mt-2">
                            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="p-1.5 text-text-muted hover:text-primary rounded">
                              <Copy size={14} />
                            </motion.button>
                            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="p-1.5 text-text-muted hover:text-primary rounded">
                              <ThumbsUp size={14} />
                            </motion.button>
                            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="p-1.5 text-text-muted hover:text-primary rounded">
                              <ThumbsDown size={14} />
                            </motion.button>
                            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="p-1.5 text-text-muted hover:text-primary rounded">
                              <RotateCcw size={14} />
                            </motion.button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                  {isTyping && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                        <Bot size={16} className="text-purple-400" />
                      </div>
                      <div className="bg-page-bg border border-border-color rounded-lg p-3">
                        <div className="flex items-center gap-2">
                          <Loader2 size={16} className="text-primary animate-spin" />
                          <span className="text-sm text-text-secondary">AI正在思考...</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="mt-4 pt-4 border-t border-border-color">
                  <div className="flex flex-wrap gap-2 mb-3">
                    {quickActions.map((action) => (
                      <motion.button
                        key={action.label}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setInputMessage(action.label)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-page-bg border border-border-color rounded-full text-xs text-text-secondary hover:text-text-primary hover:border-primary/50 transition-all"
                      >
                        <action.icon size={12} />
                        {action.label}
                      </motion.button>
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        placeholder="输入您的问题..."
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        className="w-full px-4 py-3 bg-page-bg border border-border-color rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-primary/50"
                      />
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleSendMessage}
                      disabled={!inputMessage.trim()}
                      className="p-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Send size={18} />
                    </motion.button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'insights' && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                  <input
                    type="text"
                    placeholder="搜索AI洞察..."
                    className="w-full pl-10 pr-4 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-primary/50"
                  />
                </div>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="p-2 bg-card-bg border border-border-color rounded-lg text-text-secondary hover:text-text-primary">
                  <Filter size={18} />
                </motion.button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {aiInsights.map((insight, index) => (
                  <motion.div
                    key={insight.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    whileHover={{ scale: 1.005 }}
                    className="bg-page-bg border border-border-color rounded-lg p-4 hover:border-primary/30 transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-xs rounded-full border ${getSeverityColor(insight.severity)}`}>
                          {insight.severity.toUpperCase()}
                        </span>
                        <span className="px-2 py-0.5 text-xs rounded-full bg-card-bg border border-border-color text-text-secondary">
                          {insight.category}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="p-1.5 text-text-muted hover:text-primary rounded">
                          <Bookmark size={14} />
                        </motion.button>
                        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="p-1.5 text-text-muted hover:text-primary rounded">
                          <Share2 size={14} />
                        </motion.button>
                      </div>
                    </div>
                    <h3 className="text-text-primary font-medium mb-2">{insight.title}</h3>
                    <p className="text-text-secondary text-sm mb-3">{insight.description}</p>
                    <div className="flex items-center justify-between text-xs text-text-muted">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {new Date(insight.timestamp).toLocaleString('zh-CN')}
                        </span>
                        <span className="flex items-center gap-1">
                          <Target size={12} />
                          置信度: {insight.confidence}%
                        </span>
                      </div>
                      {insight.relatedEvents.length > 0 && (
                        <span className="text-primary">{insight.relatedEvents.length} 个相关事件</span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'agents' && (
            <div className="grid grid-cols-2 gap-4">
              {aiAgents.map((agent, index) => (
                <motion.div
                  key={agent.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  whileHover={{ scale: 1.005 }}
                  className="bg-page-bg border border-border-color rounded-lg p-4 hover:border-primary/30 transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <agent.icon size={20} className="text-primary" />
                      </div>
                      <div>
                        <h3 className="text-text-primary font-medium">{agent.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(agent.status)}`}>
                          {agent.status === 'active' ? '运行中' : agent.status === 'idle' ? '空闲' : '忙碌'}
                        </span>
                      </div>
                    </div>
                    <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="p-1.5 text-text-muted hover:text-text-primary rounded">
                      <MoreHorizontal size={16} />
                    </motion.button>
                  </div>
                  <p className="text-text-secondary text-sm mb-3">{agent.description}</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {agent.capabilities.map((cap) => (
                      <span key={cap} className="px-2 py-1 text-xs rounded bg-card-bg border border-border-color text-text-secondary">
                        {cap}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-xs text-text-muted">
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      最后活跃: {new Date(agent.lastActive).toLocaleString('zh-CN')}
                    </span>
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="flex items-center gap-1 text-primary hover:underline">
                      查看详情
                      <ChevronRight size={12} />
                    </motion.button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {activeTab === 'models' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                {modelConfigs.map((model, index) => (
                  <motion.div
                    key={model.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    whileHover={{ scale: 1.005 }}
                    className="bg-page-bg border border-border-color rounded-lg p-4 hover:border-primary/30 transition-all"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Cpu size={18} className="text-primary" />
                        <h3 className="text-text-primary font-medium">{model.name}</h3>
                      </div>
                      <span className={`w-2 h-2 rounded-full ${model.enabled ? 'bg-green-500' : 'bg-gray-500'}`} />
                    </div>
                    <p className="text-text-secondary text-sm mb-2">{model.provider}</p>
                    <div className="flex items-center justify-between text-xs text-text-muted mb-3">
                      <span>Temperature: {model.temperature}</span>
                      <span>Max: {model.maxTokens}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingModel(model)}
                        className="flex-1 py-1.5 text-xs bg-card-bg border border-border-color rounded text-text-secondary hover:text-primary hover:border-primary transition-colors"
                      >
                        配置
                      </button>
                      <button
                        onClick={() => setModelConfigs(prev => prev.map(m => m.id === model.id ? { ...m, enabled: !m.enabled } : m))}
                        className={`flex-1 py-1.5 text-xs rounded transition-colors ${
                          model.enabled
                            ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                            : 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30'
                        }`}
                      >
                        {model.enabled ? '禁用' : '启用'}
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="bg-page-bg border border-border-color rounded-lg p-4">
                <h3 className="text-text-primary font-medium mb-4 flex items-center gap-2">
                  <BarChart3 size={18} className="text-primary" />
                  模型性能趋势
                </h3>
                <div className="h-48 flex items-end justify-between gap-4">
                  {[
                    { label: '周一', accuracy: 92, latency: 85 },
                    { label: '周二', accuracy: 94, latency: 88 },
                    { label: '周三', accuracy: 91, latency: 82 },
                    { label: '周四', accuracy: 95, latency: 90 },
                    { label: '周五', accuracy: 93, latency: 87 },
                    { label: '周六', accuracy: 96, latency: 92 },
                    { label: '周日', accuracy: 94, latency: 89 }
                  ].map((day, i) => (
                    <div key={day.label} className="flex-1 flex flex-col items-center gap-2">
                      <div className="w-full flex gap-1 h-32">
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: `${day.accuracy}%` }}
                          transition={{ delay: i * 0.05, duration: 0.5 }}
                          className="flex-1 bg-primary/40 rounded-t hover:bg-primary/60 transition-colors"
                        />
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: `${day.latency}%` }}
                          transition={{ delay: i * 0.05, duration: 0.5 }}
                          className="flex-1 bg-blue-500/40 rounded-t hover:bg-blue-500/60 transition-colors"
                        />
                      </div>
                      <span className="text-xs text-text-muted">{day.label}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-center gap-6 mt-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-primary/40" />
                    <span className="text-xs text-text-secondary">准确率</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-blue-500/40" />
                    <span className="text-xs text-text-secondary">响应速度</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {showNewSessionModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50" onClick={() => setShowNewSessionModal(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
            >
              <div className="glass-card rounded-xl p-6 w-[500px] pointer-events-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-text-primary">新建会话</h2>
                      <p className="text-sm text-text-secondary">创建新的AI对话会话</p>
                    </div>
                  </div>
                  <button onClick={() => setShowNewSessionModal(false)} className="p-2 text-text-secondary hover:text-text-primary">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-text-secondary text-sm mb-2">会话标题</label>
                    <input
                      type="text"
                      value={newSessionForm.title}
                      onChange={(e) => setNewSessionForm({ ...newSessionForm, title: e.target.value })}
                      placeholder="例如：分析今日安全事件"
                      className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-text-secondary text-sm mb-2">选择AI代理</label>
                    <div className="grid grid-cols-2 gap-3">
                      {aiAgents.map((agent) => (
                        <button
                          key={agent.id}
                          onClick={() => setNewSessionForm({ ...newSessionForm, agent: agent.id })}
                          className={`p-3 rounded-lg border transition-colors text-left ${
                            newSessionForm.agent === agent.id
                              ? 'border-primary bg-primary/10'
                              : 'border-border-color hover:border-primary/50'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <agent.icon size={16} className={newSessionForm.agent === agent.id ? 'text-primary' : 'text-text-secondary'} />
                            <span className={`font-medium ${newSessionForm.agent === agent.id ? 'text-primary' : 'text-text-primary'}`}>
                              {agent.name}
                            </span>
                          </div>
                          <p className="text-xs text-text-muted line-clamp-2">{agent.description}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-text-secondary text-sm mb-2">快速模板（可选）</label>
                    <select
                      value={newSessionForm.template}
                      onChange={(e) => setNewSessionForm({ ...newSessionForm, template: e.target.value })}
                      className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none"
                    >
                      <option value="">选择模板...</option>
                      <option value="analyze">分析安全事件</option>
                      <option value="threat">查询威胁情报</option>
                      <option value="report">生成报告</option>
                      <option value="compliance">合规检查</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button onClick={() => setShowNewSessionModal(false)} className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors">
                    取消
                  </button>
                  <button
                    onClick={handleCreateSession}
                    disabled={!newSessionForm.title}
                    className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <MessageSquare className="w-4 h-4" />
                    创建会话
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showModelConfigModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50" onClick={() => setShowModelConfigModal(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
            >
              <div className="glass-card rounded-xl p-6 w-[600px] pointer-events-auto max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Settings className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-text-primary">模型配置</h2>
                      <p className="text-sm text-text-secondary">配置AI模型参数和API设置</p>
                    </div>
                  </div>
                  <button onClick={() => setShowModelConfigModal(false)} className="p-2 text-text-secondary hover:text-text-primary">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  {modelConfigs.map((model) => (
                    <div key={model.id} className="bg-page-bg rounded-lg p-4 border border-border-color">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <Cpu size={20} className="text-primary" />
                          <div>
                            <h3 className="text-text-primary font-medium">{model.name}</h3>
                            <p className="text-xs text-text-muted">{model.provider}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${model.enabled ? 'bg-green-500' : 'bg-gray-500'}`} />
                          <button
                            onClick={() => setEditingModel(editingModel?.id === model.id ? null : model)}
                            className="p-1.5 text-text-secondary hover:text-primary rounded"
                          >
                            <Sliders size={16} />
                          </button>
                        </div>
                      </div>

                      {editingModel?.id === model.id && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3 pt-3 border-t border-border-color">
                          <div>
                            <label className="block text-text-secondary text-xs mb-1">API Key</label>
                            <div className="flex gap-2">
                              <input
                                type="password"
                                value={editingModel.apiKey}
                                onChange={(e) => setEditingModel({ ...editingModel, apiKey: e.target.value })}
                                className="flex-1 px-3 py-1.5 bg-card-bg border border-border-color rounded text-sm text-text-primary focus:border-primary focus:outline-none"
                              />
                              <button className="px-3 py-1.5 text-xs bg-card-bg border border-border-color rounded text-text-secondary hover:text-primary">
                                验证
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="block text-text-secondary text-xs mb-1">Temperature</label>
                              <input
                                type="number"
                                min="0"
                                max="2"
                                step="0.1"
                                value={editingModel.temperature}
                                onChange={(e) => setEditingModel({ ...editingModel, temperature: parseFloat(e.target.value) })}
                                className="w-full px-3 py-1.5 bg-card-bg border border-border-color rounded text-sm text-text-primary focus:border-primary focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-text-secondary text-xs mb-1">Max Tokens</label>
                              <input
                                type="number"
                                min="256"
                                max="8192"
                                step="256"
                                value={editingModel.maxTokens}
                                onChange={(e) => setEditingModel({ ...editingModel, maxTokens: parseInt(e.target.value) })}
                                className="w-full px-3 py-1.5 bg-card-bg border border-border-color rounded text-sm text-text-primary focus:border-primary focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-text-secondary text-xs mb-1">Top P</label>
                              <input
                                type="number"
                                min="0"
                                max="1"
                                step="0.1"
                                value={editingModel.topP}
                                onChange={(e) => setEditingModel({ ...editingModel, topP: parseFloat(e.target.value) })}
                                className="w-full px-3 py-1.5 bg-card-bg border border-border-color rounded text-sm text-text-primary focus:border-primary focus:outline-none"
                              />
                            </div>
                          </div>

                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setEditingModel(null)}
                              className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary"
                            >
                              取消
                            </button>
                            <button
                              onClick={handleSaveModelConfig}
                              className="px-3 py-1.5 text-xs bg-primary text-white rounded hover:bg-primary-hover"
                            >
                              保存
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  ))}

                  <div className="bg-page-bg rounded-lg p-4 border border-border-color">
                    <h4 className="text-text-primary font-medium mb-3 flex items-center gap-2">
                      <Globe size={16} className="text-primary" />
                      全局设置
                    </h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-text-primary text-sm">默认模型</p>
                          <p className="text-text-muted text-xs">新会话使用的默认AI模型</p>
                        </div>
                        <select className="px-3 py-1.5 bg-card-bg border border-border-color rounded text-sm text-text-primary focus:border-primary focus:outline-none">
                          <option>GPT-4 Security</option>
                          <option>ThreatBERT</option>
                          <option>LogAnalyzer</option>
                        </select>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-text-primary text-sm">流式输出</p>
                          <p className="text-text-muted text-xs">实时显示AI生成的内容</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" defaultChecked className="sr-only peer" />
                          <div className="w-9 h-5 bg-card-bg border border-border-color peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-muted after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary peer-checked:border-primary" />
                        </label>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-text-primary text-sm">上下文记忆</p>
                          <p className="text-text-muted text-xs">保留历史对话上下文</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" defaultChecked className="sr-only peer" />
                          <div className="w-9 h-5 bg-card-bg border border-border-color peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-muted after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary peer-checked:border-primary" />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button onClick={() => setShowModelConfigModal(false)} className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors">
                    关闭
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingModel && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50" onClick={() => setEditingModel(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
            >
              <div className="glass-card rounded-xl p-6 w-[500px] pointer-events-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Cpu className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-text-primary">{editingModel.name}</h2>
                      <p className="text-sm text-text-secondary">{editingModel.provider}</p>
                    </div>
                  </div>
                  <button onClick={() => setEditingModel(null)} className="p-2 text-text-secondary hover:text-text-primary">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-text-secondary text-sm mb-2">API Key</label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={editingModel.apiKey}
                        onChange={(e) => setEditingModel({ ...editingModel, apiKey: e.target.value })}
                        placeholder="输入API密钥"
                        className="flex-1 px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none"
                      />
                      <button className="px-4 py-2 bg-card-bg border border-border-color rounded-lg text-text-secondary hover:text-primary">
                        验证
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-text-secondary text-sm mb-2">Temperature</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={editingModel.temperature}
                        onChange={(e) => setEditingModel({ ...editingModel, temperature: parseFloat(e.target.value) })}
                        className="flex-1 h-2 bg-card-bg rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                      <span className="w-12 text-right text-text-primary">{editingModel.temperature}</span>
                    </div>
                    <p className="text-xs text-text-muted mt-1">控制输出的随机性，值越高输出越多样</p>
                  </div>

                  <div>
                    <label className="block text-text-secondary text-sm mb-2">Max Tokens</label>
                    <input
                      type="number"
                      min="256"
                      max="8192"
                      step="256"
                      value={editingModel.maxTokens}
                      onChange={(e) => setEditingModel({ ...editingModel, maxTokens: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-text-secondary text-sm mb-2">Top P</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={editingModel.topP}
                        onChange={(e) => setEditingModel({ ...editingModel, topP: parseFloat(e.target.value) })}
                        className="flex-1 h-2 bg-card-bg rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                      <span className="w-12 text-right text-text-primary">{editingModel.topP}</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button onClick={() => setEditingModel(null)} className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors">
                    取消
                  </button>
                  <button
                    onClick={handleSaveModelConfig}
                    className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors flex items-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    保存配置
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default AICenter;
