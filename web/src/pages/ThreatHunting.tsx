import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target, Search, Play, Pause, RotateCcw, Download, Filter,
  Clock, CheckCircle, AlertCircle, FileText, TrendingUp, Shield,
  Zap, ChevronRight, MoreHorizontal, Plus, Trash2, Edit3, Copy,
  Eye, X, FileDown, Calendar, BarChart3, PieChart, Activity,
  ChevronDown, Check
} from 'lucide-react';

interface HuntingQuery {
  id: string;
  name: string;
  description: string;
  query: string;
  category: string;
  status: 'active' | 'paused' | 'completed';
  lastRun: string;
  hitCount: number;
  createdBy: string;
  createdAt: string;
}

interface HuntingResult {
  id: string;
  queryId: string;
  timestamp: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  affectedAssets: string[];
  indicators: string[];
}

const huntingQueries: HuntingQuery[] = [
  {
    id: 'HQ-001',
    name: '异常登录行为检测',
    description: '检测非工作时间、异常地理位置的登录行为',
    query: 'source="auth" AND (hour < 8 OR hour > 20) AND country != "CN"',
    category: '权限异常',
    status: 'active',
    lastRun: '2026-04-27T10:30:00Z',
    hitCount: 23,
    createdBy: 'admin',
    createdAt: '2026-04-20T08:00:00Z'
  },
  {
    id: 'HQ-002',
    name: '横向移动检测',
    description: '检测内网主机间的异常访问模式',
    query: 'source="network" AND dest_port IN (445,135,139) AND src_ip != dest_ip',
    category: '网络入侵',
    status: 'active',
    lastRun: '2026-04-27T09:15:00Z',
    hitCount: 15,
    createdBy: 'analyst01',
    createdAt: '2026-04-21T14:30:00Z'
  },
  {
    id: 'HQ-003',
    name: '数据外泄检测',
    description: '检测敏感数据的大量传输行为',
    query: 'source="dlp" AND transfer_size > 100MB AND dest NOT IN (internal_ips)',
    category: '数据泄露',
    status: 'paused',
    lastRun: '2026-04-26T18:00:00Z',
    hitCount: 8,
    createdBy: 'admin',
    createdAt: '2026-04-22T10:00:00Z'
  },
  {
    id: 'HQ-004',
    name: '恶意软件行为检测',
    description: '检测可疑的进程行为和文件操作',
    query: 'source="edr" AND (process_name IN (suspicious_list) OR file_op = "encrypt")',
    category: '恶意软件',
    status: 'active',
    lastRun: '2026-04-27T08:45:00Z',
    hitCount: 42,
    createdBy: 'analyst01',
    createdAt: '2026-04-23T16:00:00Z'
  },
  {
    id: 'HQ-005',
    name: '特权账户滥用检测',
    description: '检测特权账户的异常使用行为',
    query: 'source="auth" AND account_type = "privileged" AND command IN (sensitive_cmds)',
    category: '权限异常',
    status: 'completed',
    lastRun: '2026-04-25T12:00:00Z',
    hitCount: 6,
    createdBy: 'admin',
    createdAt: '2026-04-24T09:30:00Z'
  }
];

const huntingResults: HuntingResult[] = [
  {
    id: 'HR-001',
    queryId: 'HQ-001',
    timestamp: '2026-04-27T10:30:00Z',
    severity: 'high',
    title: '检测到来自境外的异常登录',
    description: '用户 admin 在凌晨3点从美国IP登录系统',
    affectedAssets: ['web-server-01', 'api-gateway'],
    indicators: ['192.168.1.100', 'admin', 'US']
  },
  {
    id: 'HR-002',
    queryId: 'HQ-002',
    timestamp: '2026-04-27T09:15:00Z',
    severity: 'critical',
    title: '发现横向移动行为',
    description: '主机 workstation-05 尝试访问多台服务器的SMB端口',
    affectedAssets: ['workstation-05', 'db-server-01', 'file-server-02'],
    indicators: ['10.0.0.50', '445', '135']
  },
  {
    id: 'HR-003',
    queryId: 'HQ-004',
    timestamp: '2026-04-27T08:45:00Z',
    severity: 'high',
    title: '可疑进程执行',
    description: '检测到 mimikatz 相关进程在内存中执行',
    affectedAssets: ['workstation-03'],
    indicators: ['mimikatz.exe', 'lsass.exe']
  },
  {
    id: 'HR-004',
    queryId: 'HQ-001',
    timestamp: '2026-04-27T07:30:00Z',
    severity: 'medium',
    title: '非工作时间登录',
    description: '用户 analyst01 在周末登录系统',
    affectedAssets: ['vpn-gateway'],
    indicators: ['analyst01', 'weekend']
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

const ThreatHunting: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'queries' | 'results' | 'analytics'>('queries');
  const [selectedQuery, setSelectedQuery] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showExportModal, setShowExportModal] = useState(false);
  const [showQueryModal, setShowQueryModal] = useState(false);
  const [exportForm, setExportForm] = useState({
    title: '',
    format: 'pdf',
    dateRange: '7d',
    includeQueries: true,
    includeResults: true,
    includeAnalytics: true
  });
  const [queryForm, setQueryForm] = useState({
    name: '',
    description: '',
    query: '',
    category: '权限异常'
  });
  const [queries, setQueries] = useState<HuntingQuery[]>(huntingQueries);

  const filteredQueries = queries.filter(query => {
    const matchesSearch = query.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         query.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || query.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || query.status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const filteredResults = huntingResults.filter(result => {
    if (selectedQuery) return result.queryId === selectedQuery;
    return result.title.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'low': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <Play size={14} className="text-green-400" />;
      case 'paused': return <Pause size={14} className="text-yellow-400" />;
      case 'completed': return <CheckCircle size={14} className="text-blue-400" />;
      default: return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'paused': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'completed': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const handleExport = () => {
    alert(`报告导出成功！\n标题: ${exportForm.title || '威胁狩猎报告'}\n格式: ${exportForm.format.toUpperCase()}\n时间范围: ${exportForm.dateRange}`);
    setShowExportModal(false);
    setExportForm({
      title: '',
      format: 'pdf',
      dateRange: '7d',
      includeQueries: true,
      includeResults: true,
      includeAnalytics: true
    });
  };

  const handleCreateQuery = () => {
    const newQuery: HuntingQuery = {
      id: `HQ-${String(queries.length + 1).padStart(3, '0')}`,
      name: queryForm.name,
      description: queryForm.description,
      query: queryForm.query,
      category: queryForm.category,
      status: 'active',
      lastRun: new Date().toISOString(),
      hitCount: 0,
      createdBy: 'admin',
      createdAt: new Date().toISOString()
    };
    setQueries([...queries, newQuery]);
    setShowQueryModal(false);
    setQueryForm({ name: '', description: '', query: '', category: '权限异常' });
  };

  const openExportModal = () => {
    setExportForm({
      title: `威胁狩猎报告 - ${new Date().toLocaleDateString('zh-CN')}`,
      format: 'pdf',
      dateRange: '7d',
      includeQueries: true,
      includeResults: true,
      includeAnalytics: true
    });
    setShowExportModal(true);
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
            <Target className="text-primary" size={28} />
            威胁狩猎
          </h1>
          <p className="text-text-secondary mt-1">主动搜索和识别潜在的安全威胁</p>
        </div>
        <div className="flex items-center gap-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={openExportModal}
            className="flex items-center gap-2 px-4 py-2 bg-card-bg border border-border-color rounded-lg text-text-secondary hover:text-text-primary hover:border-primary/50 transition-all"
          >
            <Download size={18} />
            导出报告
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowQueryModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all"
          >
            <Plus size={18} />
            新建查询
          </motion.button>
        </div>
      </motion.div>

      <motion.div variants={itemVariants} className="grid grid-cols-4 gap-4">
        {[
          { label: '活跃查询', value: '12', icon: Play, color: 'text-green-400', bgColor: 'bg-green-500/10' },
          { label: '今日命中', value: '89', icon: Target, color: 'text-primary', bgColor: 'bg-primary/10' },
          { label: '高危发现', value: '15', icon: AlertCircle, color: 'text-red-400', bgColor: 'bg-red-500/10' },
          { label: '平均响应时间', value: '2.3h', icon: Clock, color: 'text-blue-400', bgColor: 'bg-blue-500/10' }
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
            { id: 'queries', label: '狩猎查询', icon: Search },
            { id: 'results', label: '狩猎结果', icon: Target },
            { id: 'analytics', label: '趋势分析', icon: TrendingUp }
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
          {activeTab === 'queries' && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                  <input
                    type="text"
                    placeholder="搜索查询名称或描述..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-primary/50"
                  />
                </div>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-4 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:outline-none focus:border-primary/50"
                >
                  <option value="all">所有类别</option>
                  <option value="权限异常">权限异常</option>
                  <option value="网络入侵">网络入侵</option>
                  <option value="数据泄露">数据泄露</option>
                  <option value="恶意软件">恶意软件</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-4 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:outline-none focus:border-primary/50"
                >
                  <option value="all">所有状态</option>
                  <option value="active">运行中</option>
                  <option value="paused">已暂停</option>
                  <option value="completed">已完成</option>
                </select>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="p-2 bg-card-bg border border-border-color rounded-lg text-text-secondary hover:text-text-primary">
                  <Filter size={18} />
                </motion.button>
              </div>

              <div className="space-y-3">
                {filteredQueries.map((query, index) => (
                  <motion.div
                    key={query.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    whileHover={{ scale: 1.005 }}
                    className="bg-page-bg border border-border-color rounded-lg p-4 hover:border-primary/30 transition-all cursor-pointer group"
                    onClick={() => setSelectedQuery(query.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-text-primary font-medium">{query.name}</h3>
                          <span className={`px-2 py-0.5 text-xs rounded-full border ${getStatusColor(query.status)}`}>
                            {getStatusIcon(query.status)}
                            <span className="ml-1">
                              {query.status === 'active' ? '运行中' : query.status === 'paused' ? '已暂停' : '已完成'}
                            </span>
                          </span>
                          <span className="px-2 py-0.5 text-xs rounded-full bg-card-bg border border-border-color text-text-secondary">
                            {query.category}
                          </span>
                        </div>
                        <p className="text-text-secondary text-sm mb-3">{query.description}</p>
                        <div className="flex items-center gap-6 text-xs text-text-muted">
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            最后运行: {new Date(query.lastRun).toLocaleString('zh-CN')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Target size={12} />
                            命中: {query.hitCount}
                          </span>
                          <span className="flex items-center gap-1">
                            <Shield size={12} />
                            创建者: {query.createdBy}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="p-2 text-text-secondary hover:text-primary rounded-lg hover:bg-primary/10">
                          <Play size={16} />
                        </motion.button>
                        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="p-2 text-text-secondary hover:text-primary rounded-lg hover:bg-primary/10">
                          <Edit3 size={16} />
                        </motion.button>
                        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="p-2 text-text-secondary hover:text-red-400 rounded-lg hover:bg-red-500/10">
                          <Trash2 size={16} />
                        </motion.button>
                      </div>
                    </div>
                    <div className="mt-3 p-3 bg-card-bg rounded-lg">
                      <code className="text-xs text-primary font-mono">{query.query}</code>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'results' && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                  <input
                    type="text"
                    placeholder="搜索狩猎结果..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-primary/50"
                  />
                </div>
                {selectedQuery && (
                  <button onClick={() => setSelectedQuery(null)} className="px-3 py-2 text-sm text-text-secondary hover:text-text-primary">
                    清除筛选
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {filteredResults.map((result, index) => (
                  <motion.div
                    key={result.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    whileHover={{ scale: 1.005 }}
                    className="bg-page-bg border border-border-color rounded-lg p-4 hover:border-primary/30 transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`px-2 py-0.5 text-xs rounded-full border ${getSeverityColor(result.severity)}`}>
                            {result.severity.toUpperCase()}
                          </span>
                          <h3 className="text-text-primary font-medium">{result.title}</h3>
                        </div>
                        <p className="text-text-secondary text-sm mb-3">{result.description}</p>
                        <div className="flex items-center gap-4 text-xs text-text-muted">
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            {new Date(result.timestamp).toLocaleString('zh-CN')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Shield size={12} />
                            影响资产: {result.affectedAssets.join(', ')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                          {result.indicators.map((indicator, i) => (
                            <span key={i} className="px-2 py-1 text-xs rounded bg-primary/10 text-primary font-mono">
                              {indicator}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="p-2 text-text-secondary hover:text-primary rounded-lg hover:bg-primary/10">
                          <Eye size={16} />
                        </motion.button>
                        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="p-2 text-text-secondary hover:text-primary rounded-lg hover:bg-primary/10">
                          <FileText size={16} />
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-page-bg border border-border-color rounded-lg p-4">
                <h3 className="text-text-primary font-medium mb-4 flex items-center gap-2">
                  <TrendingUp size={18} className="text-primary" />
                  狩猎趋势
                </h3>
                <div className="h-48 flex items-end justify-between gap-2">
                  {[65, 45, 80, 55, 90, 70, 85, 60, 75, 50, 95, 70].map((value, i) => (
                    <motion.div
                      key={i}
                      initial={{ height: 0 }}
                      animate={{ height: `${value}%` }}
                      transition={{ delay: i * 0.05, duration: 0.5 }}
                      className="flex-1 bg-primary/20 rounded-t hover:bg-primary/40 transition-colors relative group"
                    >
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-card-bg border border-border-color px-2 py-1 rounded text-xs text-text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                        {value}
                      </div>
                    </motion.div>
                  ))}
                </div>
                <div className="flex justify-between mt-2 text-xs text-text-muted">
                  <span>1月</span><span>3月</span><span>5月</span><span>7月</span><span>9月</span><span>11月</span>
                </div>
              </div>

              <div className="bg-page-bg border border-border-color rounded-lg p-4">
                <h3 className="text-text-primary font-medium mb-4 flex items-center gap-2">
                  <Zap size={18} className="text-primary" />
                  类别分布
                </h3>
                <div className="space-y-3">
                  {[
                    { label: '权限异常', value: 35, color: 'bg-red-500' },
                    { label: '网络入侵', value: 28, color: 'bg-orange-500' },
                    { label: '恶意软件', value: 22, color: 'bg-yellow-500' },
                    { label: '数据泄露', value: 15, color: 'bg-blue-500' }
                  ].map((item) => (
                    <div key={item.label}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-text-secondary">{item.label}</span>
                        <span className="text-text-primary font-medium">{item.value}%</span>
                      </div>
                      <div className="h-2 bg-card-bg rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${item.value}%` }}
                          transition={{ duration: 0.5 }}
                          className={`h-full ${item.color} rounded-full`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {showExportModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50" onClick={() => setShowExportModal(false)} />
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
                      <FileDown className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-text-primary">导出报告</h2>
                      <p className="text-sm text-text-secondary">导出威胁狩猎分析报告</p>
                    </div>
                  </div>
                  <button onClick={() => setShowExportModal(false)} className="p-2 text-text-secondary hover:text-text-primary">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-text-secondary text-sm mb-2">报告标题</label>
                    <input
                      type="text"
                      value={exportForm.title}
                      onChange={(e) => setExportForm({ ...exportForm, title: e.target.value })}
                      className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-text-secondary text-sm mb-2">导出格式</label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { value: 'pdf', label: 'PDF', icon: FileText },
                        { value: 'excel', label: 'Excel', icon: BarChart3 },
                        { value: 'csv', label: 'CSV', icon: FileText }
                      ].map((fmt) => (
                        <button
                          key={fmt.value}
                          onClick={() => setExportForm({ ...exportForm, format: fmt.value })}
                          className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors ${
                            exportForm.format === fmt.value
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border-color text-text-secondary hover:border-primary/50'
                          }`}
                        >
                          <fmt.icon className="w-5 h-5" />
                          <span className="text-sm">{fmt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-text-secondary text-sm mb-2">时间范围</label>
                    <select
                      value={exportForm.dateRange}
                      onChange={(e) => setExportForm({ ...exportForm, dateRange: e.target.value })}
                      className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none"
                    >
                      <option value="1d">最近1天</option>
                      <option value="7d">最近7天</option>
                      <option value="30d">最近30天</option>
                      <option value="90d">最近90天</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-text-secondary text-sm mb-2">包含内容</label>
                    <div className="space-y-2">
                      {[
                        { key: 'includeQueries', label: '狩猎查询' },
                        { key: 'includeResults', label: '狩猎结果' },
                        { key: 'includeAnalytics', label: '趋势分析' }
                      ].map((item) => (
                        <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={exportForm[item.key as keyof typeof exportForm] as boolean}
                            onChange={(e) => setExportForm({ ...exportForm, [item.key]: e.target.checked })}
                            className="w-4 h-4 rounded border-border-color text-primary focus:ring-primary"
                          />
                          <span className="text-text-secondary text-sm">{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button onClick={() => setShowExportModal(false)} className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors">
                    取消
                  </button>
                  <button
                    onClick={handleExport}
                    className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    导出报告
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showQueryModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50" onClick={() => setShowQueryModal(false)} />
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
                      <Plus className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-text-primary">新建查询</h2>
                      <p className="text-sm text-text-secondary">创建新的威胁狩猎查询</p>
                    </div>
                  </div>
                  <button onClick={() => setShowQueryModal(false)} className="p-2 text-text-secondary hover:text-text-primary">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-text-secondary text-sm mb-2">查询名称</label>
                    <input
                      type="text"
                      value={queryForm.name}
                      onChange={(e) => setQueryForm({ ...queryForm, name: e.target.value })}
                      placeholder="例如：异常登录行为检测"
                      className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-text-secondary text-sm mb-2">查询类别</label>
                    <select
                      value={queryForm.category}
                      onChange={(e) => setQueryForm({ ...queryForm, category: e.target.value })}
                      className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none"
                    >
                      <option value="权限异常">权限异常</option>
                      <option value="网络入侵">网络入侵</option>
                      <option value="数据泄露">数据泄露</option>
                      <option value="恶意软件">恶意软件</option>
                      <option value="其他">其他</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-text-secondary text-sm mb-2">查询描述</label>
                    <textarea
                      value={queryForm.description}
                      onChange={(e) => setQueryForm({ ...queryForm, description: e.target.value })}
                      placeholder="描述该查询的检测目标和逻辑..."
                      rows={3}
                      className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-text-secondary text-sm mb-2">查询语句</label>
                    <div className="relative">
                      <textarea
                        value={queryForm.query}
                        onChange={(e) => setQueryForm({ ...queryForm, query: e.target.value })}
                        placeholder="输入查询语句，例如：source=&quot;auth&quot; AND (hour &lt; 8 OR hour &gt; 20)"
                        rows={5}
                        className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary font-mono text-sm focus:border-primary focus:outline-none resize-none"
                      />
                      <div className="absolute bottom-2 right-2 flex gap-2">
                        <button className="px-2 py-1 text-xs bg-card-bg border border-border-color rounded text-text-secondary hover:text-primary">
                          格式化
                        </button>
                        <button className="px-2 py-1 text-xs bg-card-bg border border-border-color rounded text-text-secondary hover:text-primary">
                          验证
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-text-muted mt-1">支持 SPL 查询语法</p>
                  </div>

                  <div className="bg-page-bg rounded-lg p-4">
                    <h4 className="text-sm font-medium text-text-primary mb-2 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-primary" />
                      查询预览
                    </h4>
                    <div className="flex items-center gap-4 text-sm text-text-secondary">
                      <span>预计扫描数据量: <span className="text-primary">2.3TB</span></span>
                      <span>预计执行时间: <span className="text-primary">15-30秒</span></span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button onClick={() => setShowQueryModal(false)} className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors">
                    取消
                  </button>
                  <button
                    onClick={handleCreateQuery}
                    disabled={!queryForm.name || !queryForm.query}
                    className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Play className="w-4 h-4" />
                    创建并运行
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

export default ThreatHunting;
