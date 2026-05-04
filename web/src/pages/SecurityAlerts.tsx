import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Download, CheckCircle, XCircle, Clock, Bell, RefreshCw, Eye,
  Play, EyeOff, UserCheck, AlertCircle, Zap, ArrowUpDown, AlertTriangle,
  ChevronDown, ChevronRight, Layers, Link2, Timer, GitMerge
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { SecurityEvent } from '../types';

const severityConfig = {
  critical: { color: 'bg-rose-500', text: 'text-rose-400', bg: 'bg-rose-500/10', label: '危急' },
  high: { color: 'bg-orange-500', text: 'text-orange-400', bg: 'bg-orange-500/10', label: '高危' },
  medium: { color: 'bg-amber-500', text: 'text-amber-400', bg: 'bg-amber-500/10', label: '中危' },
  low: { color: 'bg-blue-500', text: 'text-blue-400', bg: 'bg-blue-500/10', label: '低危' }
};

const statusConfig = {
  new: { icon: Bell, color: 'text-rose-400', bg: 'bg-rose-500/10', label: '新告警' },
  investigating: { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10', label: '调查中' },
  closed: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: '已关闭' },
  false_positive: { icon: XCircle, color: 'text-gray-400', bg: 'bg-gray-500/10', label: '误报' }
};

// 告警聚合组类型
interface AlertGroup {
  id: string;
  alerts: SecurityEvent[];
  aggregatedCount: number;
  timeWindow: string;
  similarity: number;
  reason: string; // 聚合原因：同IP、同资产、同类型等
}

// SOAR自动剧本类型
interface AutoPlaybookRule {
  id: string;
  name: string;
  triggerConditions: {
    severity?: string[];
    eventType?: string[];
    sourceIp?: string;
    confidence?: number;
  };
  playbookId: string;
  playbookName: string;
  enabled: boolean;
}

const mockAlerts: SecurityEvent[] = [
  {
    id: 'FW-2026-001',
    title: '检测到可疑出站连接',
    severity: 'high',
    confidence: 92,
    affectedAssets: ['workstation-01'],
    sourceIp: '192.168.1.100',
    timestamp: '2026-04-27T10:30:00Z',
    status: 'new',
    eventType: '网络入侵',
    description: '边界防火墙检测到工作站尝试连接已知恶意IP',
  },
  {
    id: 'FW-2026-002',
    title: '可疑出站连接（相同源）',
    severity: 'high',
    confidence: 88,
    affectedAssets: ['workstation-02'],
    sourceIp: '192.168.1.100',
    timestamp: '2026-04-27T10:25:00Z',
    status: 'new',
    eventType: '网络入侵',
    description: '检测到来自同一IP的可疑连接',
  },
  {
    id: 'FW-2026-003',
    title: '横向移动检测',
    severity: 'critical',
    confidence: 95,
    affectedAssets: ['workstation-01', 'server-01'],
    sourceIp: '192.168.1.100',
    timestamp: '2026-04-27T10:20:00Z',
    status: 'new',
    eventType: '横向移动',
    description: '检测到内网横向移动行为',
  },
  {
    id: 'IDS-2026-045',
    title: 'SQL注入攻击尝试',
    severity: 'critical',
    confidence: 98,
    affectedAssets: ['web-server-01'],
    sourceIp: '45.142.212.100',
    timestamp: '2026-04-27T10:28:00Z',
    status: 'new',
    eventType: 'Web攻击',
    description: 'IDS检测到针对Web服务器的SQL注入攻击模式',
  },
  {
    id: 'EDR-2026-128',
    title: '恶意软件检测',
    severity: 'critical',
    confidence: 95,
    affectedAssets: ['workstation-05'],
    sourceIp: '192.168.1.105',
    timestamp: '2026-04-27T10:25:00Z',
    status: 'investigating',
    eventType: '恶意软件',
    description: 'EDR检测到可疑进程执行和文件修改行为',
  },
  {
    id: 'EDR-2026-129',
    title: '权限提升尝试',
    severity: 'high',
    confidence: 90,
    affectedAssets: ['workstation-05'],
    sourceIp: '192.168.1.105',
    timestamp: '2026-04-27T10:22:00Z',
    status: 'investigating',
    eventType: '权限异常',
    description: '检测到提权操作',
  }
];

// 模拟自动剧本规则
const mockAutoPlaybookRules: AutoPlaybookRule[] = [
  {
    id: 'APR-001',
    name: '高危IP自动封堵',
    triggerConditions: { severity: ['critical', 'high'], confidence: 80 },
    playbookId: 'PB-001',
    playbookName: '自动封堵恶意IP',
    enabled: true
  },
  {
    id: 'APR-002',
    name: '恶意软件主机隔离',
    triggerConditions: { eventType: ['恶意软件'] },
    playbookId: 'PB-002',
    playbookName: '主机隔离处置',
    enabled: true
  }
];

// 告警分诊统计类型
interface TriageStats {
  pending: number;      // 待分诊
  critical: number;     // 危急告警
  investigating: number; // 调查中
  falsePositive: number; // 误报
  resolved: number;     // 已处理
}

export default function SecurityAlerts() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<SecurityEvent[]>(mockAlerts);
  const [selectedAlerts, setSelectedAlerts] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showDetail, setShowDetail] = useState<SecurityEvent | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'close' | 'false_positive' | 'delete' | 'create_event' | 'observe' | 'auto_playbook'>('close');
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'critical' | 'investigating'>('all');
  const [sortBy, setSortBy] = useState<'severity' | 'time' | 'confidence'>('severity');
  
  // 新增状态
  const [enableAggregation, setEnableAggregation] = useState(true); // 是否启用聚合
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [autoPlaybookRules] = useState<AutoPlaybookRule[]>(mockAutoPlaybookRules);
  const [isLoading, setIsLoading] = useState(false);
  const [runningPlaybooks, setRunningPlaybooks] = useState<Record<string, boolean>>({});
  const [showAutoPlaybookModal, setShowAutoPlaybookModal] = useState(false);
  const [autoPlaybookResults, setAutoPlaybookResults] = useState<Record<string, { success: boolean; message: string }>>({});

  // 告警聚合算法
  const alertGroups: AlertGroup[] = useMemo(() => {
    if (!enableAggregation) return [];
    
    const groups: AlertGroup[] = [];
    const processed = new Set<string>();
    
    alerts.forEach(alert => {
      if (processed.has(alert.id)) return;
      
      // 查找相似告警（同源IP）
      const sameSourceAlerts = alerts.filter(a => 
        !processed.has(a.id) && 
        a.sourceIp === alert.sourceIp &&
        a.id !== alert.id
      );
      
      if (sameSourceAlerts.length > 0) {
        processed.add(alert.id);
        sameSourceAlerts.forEach(a => processed.add(a.id));
        
        const groupAlerts = [alert, ...sameSourceAlerts];
        const timeRange = groupAlerts.reduce((min, a) => 
          new Date(a.timestamp) < new Date(min) ? a.timestamp : min, groupAlerts[0].timestamp);
        const latestTime = groupAlerts.reduce((max, a) => 
          new Date(a.timestamp) > new Date(max) ? a.timestamp : max, groupAlerts[0].timestamp);
        
        groups.push({
          id: `group-${alert.sourceIp}`,
          alerts: groupAlerts.sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
          aggregatedCount: groupAlerts.length,
          timeWindow: `${Math.round((new Date(latestTime).getTime() - new Date(timeRange).getTime()) / 60000)}分钟`,
          similarity: 95,
          reason: `同源IP: ${alert.sourceIp}`
        });
        return;
      }
      
      // 查找同类型告警
      const sameTypeAlerts = alerts.filter(a =>
        !processed.has(a.id) &&
        a.eventType === alert.eventType &&
        a.id !== alert.id &&
        a.sourceIp !== alert.sourceIp
      );
      
      if (sameTypeAlerts.length > 0) {
        processed.add(alert.id);
        sameTypeAlerts.forEach(a => processed.add(a.id));
        
        const groupAlerts = [alert, ...sameTypeAlerts];
        const timeRange = groupAlerts.reduce((min, a) => 
          new Date(a.timestamp) < new Date(min) ? a.timestamp : min, groupAlerts[0].timestamp);
        const latestTime = groupAlerts.reduce((max, a) => 
          new Date(a.timestamp) > new Date(max) ? a.timestamp : max, groupAlerts[0].timestamp);
        
        groups.push({
          id: `group-type-${alert.eventType}`,
          alerts: groupAlerts.sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
          aggregatedCount: groupAlerts.length,
          timeWindow: `${Math.round((new Date(latestTime).getTime() - new Date(timeRange).getTime()) / 60000)}分钟`,
          similarity: 75,
          reason: `同类型: ${alert.eventType}`
        });
      }
    });
    
    return groups;
  }, [alerts, enableAggregation]);

  // 计算分诊统计数据
  const triageStats: TriageStats = useMemo(() => ({
    pending: alerts.filter(a => a.status === 'new').length,
    critical: alerts.filter(a => a.severity === 'critical').length,
    investigating: alerts.filter(a => a.status === 'investigating').length,
    falsePositive: alerts.filter(a => a.status === 'false_positive').length,
    resolved: alerts.filter(a => a.status === 'closed').length
  }), [alerts]);

  // 检查是否有匹配的自动剧本规则
  const getMatchingAutoPlaybooks = (alert: SecurityEvent): AutoPlaybookRule[] => {
    return autoPlaybookRules.filter(rule => {
      if (!rule.enabled) return false;
      const { triggerConditions } = rule;
      
      if (triggerConditions.severity && !triggerConditions.severity.includes(alert.severity)) {
        return false;
      }
      if (triggerConditions.eventType && !triggerConditions.eventType.includes(alert.eventType)) {
        return false;
      }
      if (triggerConditions.confidence && alert.confidence < triggerConditions.confidence) {
        return false;
      }
      return true;
    });
  };

  // 执行自动剧本
  const handleAutoPlaybook = async (alert: SecurityEvent, rule: AutoPlaybookRule) => {
    setRunningPlaybooks(prev => ({ ...prev, [rule.id]: true }));
    
    // 模拟执行
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const success = Math.random() > 0.1; // 90% 成功率
    setAutoPlaybookResults(prev => ({
      ...prev,
      [rule.id]: {
        success,
        message: success ? `剧本"${rule.playbookName}"执行成功` : `剧本"${rule.playbookName}"执行失败`
      }
    }));
    
    setRunningPlaybooks(prev => ({ ...prev, [rule.id]: false }));
    
    if (success) {
      showToast(`自动剧本"${rule.playbookName}"已触发`);
    }
  };

  const showToast = (message: string) => {
    // 简单的toast提示
    alert(message);
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => 
      prev.includes(groupId) 
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  // 排序和筛选逻辑
  const filteredAlerts = useMemo(() => {
    let result = alerts.filter(a => {
      // 搜索过滤
      if (searchQuery && !a.title.toLowerCase().includes(searchQuery.toLowerCase()) && !a.id.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      // 严重度过滤
      if (severityFilter !== 'all' && a.severity !== severityFilter) return false;
      // 状态过滤
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      // Tab 过滤
      if (activeTab === 'pending' && a.status !== 'new') return false;
      if (activeTab === 'critical' && a.severity !== 'critical') return false;
      if (activeTab === 'investigating' && a.status !== 'investigating') return false;
      return true;
    });

    // 排序
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    result.sort((a, b) => {
      switch (sortBy) {
        case 'severity':
          return severityOrder[a.severity] - severityOrder[b.severity];
        case 'time':
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        case 'confidence':
          return b.confidence - a.confidence;
        default:
          return 0;
      }
    });

    return result;
  }, [alerts, searchQuery, severityFilter, statusFilter, activeTab, sortBy]);

  const toggleSelectAll = () => {
    if (selectedAlerts.length === filteredAlerts.length) {
      setSelectedAlerts([]);
    } else {
      setSelectedAlerts(filteredAlerts.map(a => a.id));
    }
  };

  // 快捷操作处理
  const handleQuickAction = (action: 'create_event' | 'false_positive' | 'observe' | 'investigating') => {
    setIsLoading(true);
    setTimeout(() => {
      if (selectedAlerts.length > 0) {
        let newStatus: SecurityEvent['status'] = 'new';
        switch (action) {
          case 'false_positive':
            newStatus = 'false_positive';
            break;
          case 'observe':
          case 'investigating':
            newStatus = 'investigating';
            break;
        }
        setAlerts(prev => prev.map(a => 
          selectedAlerts.includes(a.id) ? { ...a, status: newStatus } : a
        ));
        setSelectedAlerts([]);
      }
      setIsLoading(false);
      // 如果是创建事件，跳转到事件工作区
      if (action === 'create_event') {
        navigate('/detection/events');
      }
    }, 300);
  };

  // 聚合组批量操作
  const handleGroupAction = (groupId: string, action: 'close' | 'false_positive' | 'create_event' | 'auto_playbook' | 'investigating') => {
    const group = alertGroups.find(g => g.id === groupId);
    if (!group) return;
    
    setSelectedAlerts(group.alerts.map(a => a.id));
    
    if (action === 'auto_playbook') {
      setShowAutoPlaybookModal(true);
    } else if (action === 'investigating') {
      handleQuickAction('investigating');
    } else if (action === 'create_event') {
      handleQuickAction('create_event');
    } else if (action === 'false_positive') {
      handleQuickAction('false_positive');
    }
  };

  const handleBatchAction = (action: 'closed' | 'false_positive' | 'deleted') => {
    setIsLoading(true);
    setTimeout(() => {
      if (action === 'deleted') {
        setAlerts(prev => prev.filter(a => !selectedAlerts.includes(a.id)));
      } else {
        setAlerts(prev => prev.map(a => selectedAlerts.includes(a.id) ? { ...a, status: action } : a));
      }
      setSelectedAlerts([]);
      setShowConfirmModal(false);
      setIsLoading(false);
    }, 500);
  };

  const openConfirmModal = (action: 'close' | 'false_positive' | 'delete' | 'create_event' | 'observe') => {
    setConfirmAction(action);
    setShowConfirmModal(true);
  };

  return (
    <div className="space-y-6">
      {/* 告警分诊统计面板 */}
      <div className="grid grid-cols-5 gap-4">
        <motion.div
          whileHover={{ scale: 1.02 }}
          className={`glass-card rounded-xl p-4 cursor-pointer transition-all ${activeTab === 'pending' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => setActiveTab(activeTab === 'pending' ? 'all' : 'pending')}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-text-primary">{triageStats.pending}</div>
              <div className="text-xs text-text-muted">待分诊</div>
            </div>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ scale: 1.02 }}
          className={`glass-card rounded-xl p-4 cursor-pointer transition-all ${activeTab === 'critical' ? 'ring-2 ring-rose-500' : ''}`}
          onClick={() => setActiveTab(activeTab === 'critical' ? 'all' : 'critical')}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-text-primary">{triageStats.critical}</div>
              <div className="text-xs text-text-muted">危急告警</div>
            </div>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ scale: 1.02 }}
          className={`glass-card rounded-xl p-4 cursor-pointer transition-all ${activeTab === 'investigating' ? 'ring-2 ring-blue-500' : ''}`}
          onClick={() => setActiveTab(activeTab === 'investigating' ? 'all' : 'investigating')}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-text-primary">{triageStats.investigating}</div>
              <div className="text-xs text-text-muted">调查中</div>
            </div>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ scale: 1.02 }}
          className="glass-card rounded-xl p-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-500/10 flex items-center justify-center">
              <EyeOff className="w-5 h-5 text-gray-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-text-primary">{triageStats.falsePositive}</div>
              <div className="text-xs text-text-muted">误报</div>
            </div>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ scale: 1.02 }}
          className="glass-card rounded-xl p-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-text-primary">{triageStats.resolved}</div>
              <div className="text-xs text-text-muted">已处理</div>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">告警分诊</h1>
            <p className="text-sm text-text-secondary mt-1">实时监控和处理安全告警事件</p>
          </div>
          {/* 排序选择 */}
          <div className="flex items-center gap-2 ml-4">
            <ArrowUpDown className="w-4 h-4 text-text-muted" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-1.5 bg-page-bg border border-border-color rounded-lg text-sm text-text-primary"
            >
              <option value="severity">按严重度</option>
              <option value="time">按时间</option>
              <option value="confidence">按置信度</option>
            </select>
          </div>
          {/* 聚合开关 */}
          <label className="flex items-center gap-2 px-3 py-1.5 bg-page-bg border border-border-color rounded-lg cursor-pointer hover:bg-white/5 transition-colors">
            <input
              type="checkbox"
              checked={enableAggregation}
              onChange={(e) => setEnableAggregation(e.target.checked)}
              className="w-4 h-4 rounded border-border-color accent-primary"
            />
            <Layers className="w-4 h-4 text-text-muted" />
            <span className="text-sm text-text-secondary">告警聚合</span>
            {alertGroups.length > 0 && (
              <span className="px-1.5 py-0.5 bg-primary/20 text-primary text-xs rounded">
                {alertGroups.length}组
              </span>
            )}
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-card-bg border border-border-color rounded-lg text-text-secondary hover:bg-white/5 transition-colors">
            <Download className="w-4 h-4" />导出
          </button>
          <button
            onClick={() => setAlerts(mockAlerts)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
          >
            <RefreshCw className="w-4 h-4" />刷新
          </button>
        </div>
      </div>

      <div className="glass-card rounded-xl p-4 flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="搜索告警标题或ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:outline-none focus:border-primary"
          />
        </div>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="px-4 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary"
        >
          <option value="all">全部风险</option>
          <option value="critical">危急</option>
          <option value="high">高危</option>
          <option value="medium">中危</option>
          <option value="low">低危</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary"
        >
          <option value="all">全部状态</option>
          <option value="new">新告警</option>
          <option value="investigating">调查中</option>
          <option value="closed">已关闭</option>
          <option value="false_positive">误报</option>
        </select>
      </div>

      {selectedAlerts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-4 bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-xl"
        >
          <span className="text-sm text-primary font-medium">已选择 {selectedAlerts.length} 项</span>
          <div className="h-6 w-px bg-border-color" />
          <div className="flex items-center gap-2">
            {/* 快捷操作按钮 */}
            <button
              onClick={() => handleQuickAction('create_event')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              确认为事件
            </button>
            <button
              onClick={() => handleQuickAction('investigating')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <UserCheck className="w-3.5 h-3.5" />
              开始调查
            </button>
            <button
              onClick={() => handleQuickAction('observe')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              加入观察
            </button>
            <button
              onClick={() => openConfirmModal('false_positive')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" />
              标记误报
            </button>
          </div>
          <div className="flex-1" />
          <button
            onClick={() => openConfirmModal('close')}
            className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
          >
            批量关闭
          </button>
          <button
            onClick={() => openConfirmModal('delete')}
            className="px-3 py-1.5 text-xs bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors"
          >
            批量删除
          </button>
        </motion.div>
      )}

      <div className="glass-card rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-page-bg/50">
            <tr className="text-left text-xs text-text-muted border-b border-border-color">
              <th className="p-4">
                <input
                  type="checkbox"
                  checked={selectedAlerts.length === filteredAlerts.length && filteredAlerts.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-border-color"
                />
              </th>
              <th className="p-4 font-medium">告警信息</th>
              <th className="p-4 font-medium">风险等级</th>
              <th className="p-4 font-medium">来源</th>
              <th className="p-4 font-medium">状态</th>
              <th className="p-4 font-medium">时间</th>
              <th className="p-4 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {/* 聚合组显示 */}
            {enableAggregation && alertGroups.map((group, groupIndex) => (
              <React.Fragment key={group.id}>
                {/* 聚合组标题行 */}
                <motion.tr
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-r from-purple-500/5 to-transparent border-b border-purple-500/20"
                >
                  <td colSpan={7} className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggleGroup(group.id)}
                          className="p-1 hover:bg-white/10 rounded transition-colors"
                        >
                          {expandedGroups.includes(group.id) ? (
                            <ChevronDown className="w-4 h-4 text-purple-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-purple-400" />
                          )}
                        </button>
                        <Layers className="w-5 h-5 text-purple-400" />
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-purple-300">
                            聚合组 #{groupIndex + 1}
                          </span>
                          <span className={`px-2 py-0.5 text-xs rounded ${severityConfig[group.alerts[0].severity].bg} ${severityConfig[group.alerts[0].severity].text}`}>
                            {severityConfig[group.alerts[0].severity].label}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-text-muted">
                          <span className="flex items-center gap-1">
                            <Link2 className="w-3 h-3" />
                            {group.aggregatedCount} 条告警
                          </span>
                          <span className="flex items-center gap-1">
                            <Timer className="w-3 h-3" />
                            {group.timeWindow}
                          </span>
                          <span className="flex items-center gap-1">
                            <GitMerge className="w-3 h-3" />
                            {group.reason}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* 聚合组批量操作 */}
                        <button
                          onClick={() => handleGroupAction(group.id, 'auto_playbook')}
                          className="px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors flex items-center gap-1"
                        >
                          <Zap className="w-3 h-3" />
                          自动处置
                        </button>
                        <button
                          onClick={() => {
                            setSelectedAlerts(group.alerts.map(a => a.id));
                            handleQuickAction('create_event');
                          }}
                          className="px-2 py-1 text-xs bg-rose-600 text-white rounded hover:bg-rose-700 transition-colors flex items-center gap-1"
                        >
                          <GitMerge className="w-3 h-3" />
                          合并事件
                        </button>
                        <button
                          onClick={() => handleGroupAction(group.id, 'investigating')}
                          className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                        >
                          批量调查
                        </button>
                      </div>
                    </div>
                  </td>
                </motion.tr>
                {/* 聚合组内的告警 */}
                {expandedGroups.includes(group.id) && group.alerts.map((alert, index) => (
                  <AlertRow
                    key={alert.id}
                    alert={alert}
                    index={index}
                    selectedAlerts={selectedAlerts}
                    setSelectedAlerts={setSelectedAlerts}
                    onQuickAction={handleQuickAction}
                    onShowDetail={setShowDetail}
                    severityConfig={severityConfig}
                    statusConfig={statusConfig}
                    getMatchingAutoPlaybooks={getMatchingAutoPlaybooks}
                    runningPlaybooks={runningPlaybooks}
                    onAutoPlaybook={handleAutoPlaybook}
                  />
                ))}
              </React.Fragment>
            ))}
            
            {/* 非聚合的单独告警 */}
            {filteredAlerts
              .filter(alert => !enableAggregation || !alertGroups.some(g => g.alerts.some(a => a.id === alert.id)))
              .map((alert, index) => (
                <AlertRow
                  key={alert.id}
                  alert={alert}
                  index={index}
                  selectedAlerts={selectedAlerts}
                  setSelectedAlerts={setSelectedAlerts}
                  onQuickAction={handleQuickAction}
                  onShowDetail={setShowDetail}
                  severityConfig={severityConfig}
                  statusConfig={statusConfig}
                  getMatchingAutoPlaybooks={getMatchingAutoPlaybooks}
                  runningPlaybooks={runningPlaybooks}
                  onAutoPlaybook={handleAutoPlaybook}
                />
              ))}
          </tbody>
        </table>
        {filteredAlerts.length === 0 && (
          <div className="p-8 text-center">
            <Bell className="w-12 h-12 text-text-muted mx-auto mb-3" />
            <p className="text-text-secondary">暂无告警数据</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showDetail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowDetail(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-card-bg rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-auto border border-border-color"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-text-primary">{showDetail.title}</h3>
                <button
                  onClick={() => setShowDetail(null)}
                  className="p-2 hover:bg-white/5 rounded-lg text-text-muted"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-page-bg rounded-lg">
                    <div className="text-text-muted text-xs">告警ID</div>
                    <div className="font-mono text-primary">{showDetail.id}</div>
                  </div>
                  <div className="p-3 bg-page-bg rounded-lg">
                    <div className="text-text-muted text-xs">置信度</div>
                    <div className="font-semibold text-text-primary">{showDetail.confidence}%</div>
                  </div>
                </div>
                <div className="p-3 bg-page-bg rounded-lg">
                  <div className="text-text-muted text-xs">描述</div>
                  <div className="text-text-primary">{showDetail.description}</div>
                </div>
                <div className="p-3 bg-page-bg rounded-lg">
                  <div className="text-text-muted text-xs mb-2">影响资产</div>
                  <div className="flex flex-wrap gap-2">
                    {showDetail.affectedAssets.map(asset => (
                      <span key={asset} className="px-2 py-1 bg-primary/10 text-primary text-xs rounded">
                        {asset}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showConfirmModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowConfirmModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-card-bg rounded-2xl p-6 w-full max-w-sm border border-border-color"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center">
                <div className="w-12 h-12 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <AlertTriangle className="w-6 h-6 text-amber-400" />
                </div>
                <h3 className="text-lg font-semibold text-text-primary mb-2">确认操作</h3>
                <p className="text-text-secondary text-sm mb-4">
                  确定要{confirmAction === 'close' ? '关闭' : confirmAction === 'false_positive' ? '标记为误报' : confirmAction === 'create_event' ? '确认为事件' : confirmAction === 'observe' ? '加入观察' : '删除'}选中的 {selectedAlerts.length} 条告警吗？
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 py-2 bg-page-bg text-text-secondary rounded-lg hover:bg-white/5"
                >
                  取消
                </button>
                <button
                  onClick={() => handleBatchAction(confirmAction === 'close' ? 'closed' : confirmAction === 'false_positive' ? 'false_positive' : 'deleted')}
                  disabled={isLoading}
                  className="flex-1 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50"
                >
                  {isLoading ? '处理中...' : '确认'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* 自动剧本执行弹窗 */}
        {showAutoPlaybookModal && selectedAlerts.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowAutoPlaybookModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-card-bg rounded-2xl p-6 w-full max-w-md border border-border-color"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                  <Zap className="w-5 h-5 text-purple-400" />
                  自动剧本执行
                </h3>
                <button
                  onClick={() => setShowAutoPlaybookModal(false)}
                  className="p-2 hover:bg-white/5 rounded-lg text-text-muted"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              <p className="text-text-secondary text-sm mb-4">
                已选择 {selectedAlerts.length} 条告警，将自动触发匹配的剧本：
              </p>
              <div className="space-y-3 mb-4">
                {autoPlaybookRules
                  .filter(rule => rule.enabled)
                  .slice(0, 3)
                  .map(rule => (
                    <div
                      key={rule.id}
                      className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-purple-300">{rule.playbookName}</span>
                        {runningPlaybooks[rule.id] ? (
                          <span className="flex items-center gap-1 text-xs text-purple-400">
                            <Clock className="w-3 h-3 animate-spin" />
                            执行中
                          </span>
                        ) : autoPlaybookResults[rule.id] ? (
                          <span className={`text-xs ${autoPlaybookResults[rule.id].success ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {autoPlaybookResults[rule.id].success ? '成功' : '失败'}
                          </span>
                        ) : null}
                      </div>
                      <button
                        onClick={() => {
                          const alert = alerts.find(a => a.id === selectedAlerts[0]);
                          if (alert) handleAutoPlaybook(alert, rule);
                        }}
                        disabled={runningPlaybooks[rule.id]}
                        className="w-full py-1.5 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 transition-colors disabled:opacity-50"
                      >
                        {runningPlaybooks[rule.id] ? '执行中...' : '执行剧本'}
                      </button>
                    </div>
                  ))}
              </div>
              <button
                onClick={() => setShowAutoPlaybookModal(false)}
                className="w-full py-2 bg-page-bg text-text-secondary rounded-lg hover:bg-white/5 transition-colors"
              >
                关闭
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// 告警行组件
interface AlertRowProps {
  alert: SecurityEvent;
  index: number;
  selectedAlerts: string[];
  setSelectedAlerts: React.Dispatch<React.SetStateAction<string[]>>;
  onQuickAction: (action: any) => void;
  onShowDetail: (alert: SecurityEvent) => void;
  severityConfig: Record<string, any>;
  statusConfig: Record<string, any>;
  getMatchingAutoPlaybooks: (alert: SecurityEvent) => AutoPlaybookRule[];
  runningPlaybooks: Record<string, boolean>;
  onAutoPlaybook: (alert: SecurityEvent, rule: AutoPlaybookRule) => void;
}

function AlertRow({
  alert,
  index,
  selectedAlerts,
  setSelectedAlerts,
  onQuickAction,
  onShowDetail,
  severityConfig,
  statusConfig,
  getMatchingAutoPlaybooks,
  runningPlaybooks,
  onAutoPlaybook
}: AlertRowProps) {
  const matchingPlaybooks = getMatchingAutoPlaybooks(alert);
  const hasAutoPlaybook = matchingPlaybooks.length > 0;

  return (
    <motion.tr
      key={alert.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="border-b border-border-color/50 hover:bg-white/5 transition-colors"
    >
      <td className="p-4">
        <input
          type="checkbox"
          checked={selectedAlerts.includes(alert.id)}
          onChange={(e) => {
            if (e.target.checked) {
              setSelectedAlerts([...selectedAlerts, alert.id]);
            } else {
              setSelectedAlerts(selectedAlerts.filter(id => id !== alert.id));
            }
          }}
          className="w-4 h-4 rounded border-border-color"
        />
      </td>
      <td className="p-4">
        <div className="flex items-center gap-2">
          {hasAutoPlaybook && (
            <div className="relative group">
              <Zap className="w-3 h-3 text-purple-400" />
              <div className="absolute left-0 top-full mt-1 hidden group-hover:block z-10">
                <div className="bg-card-bg border border-purple-500/30 rounded-lg p-2 shadow-lg w-48">
                  <div className="text-xs text-purple-300 mb-1">可自动触发:</div>
                  {matchingPlaybooks.map(rule => (
                    <button
                      key={rule.id}
                      disabled={runningPlaybooks[rule.id]}
                      onClick={() => onAutoPlaybook(alert, rule)}
                      className="block w-full text-left px-2 py-1 text-xs text-text-secondary hover:bg-purple-500/10 rounded transition-colors disabled:opacity-50"
                    >
                      {runningPlaybooks[rule.id] ? (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 animate-spin" />
                          执行中...
                        </span>
                      ) : rule.playbookName}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-text-primary">{alert.title}</p>
            <p className="text-xs text-text-muted">{alert.id}</p>
          </div>
        </div>
      </td>
      <td className="p-4">
        <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded ${severityConfig[alert.severity].bg} ${severityConfig[alert.severity].text}`}>
          {severityConfig[alert.severity].label}
        </span>
      </td>
      <td className="p-4 text-sm text-text-secondary">{alert.sourceIp}</td>
      <td className="p-4">
        <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded ${statusConfig[alert.status].bg} ${statusConfig[alert.status].color}`}>
          {statusConfig[alert.status].label}
        </span>
      </td>
      <td className="p-4 text-sm text-text-secondary">
        {new Date(alert.timestamp).toLocaleString()}
      </td>
      <td className="p-4">
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setSelectedAlerts([alert.id]);
              onQuickAction('create_event');
            }}
            className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
            title="确认为事件"
          >
            <Zap className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setSelectedAlerts([alert.id]);
              onQuickAction('investigating');
            }}
            className="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
            title="开始调查"
          >
            <Play className="w-4 h-4" />
          </button>
          <button
            onClick={() => onShowDetail(alert)}
            className="p-1.5 text-text-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
            title="查看详情"
          >
            <Eye className="w-4 h-4" />
          </button>
        </div>
      </td>
    </motion.tr>
  );
}
