import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Download, CheckCircle, XCircle, Clock, Bell, RefreshCw, Eye,
  EyeOff, AlertCircle, Zap, ArrowUpDown, AlertTriangle,
  Loader2, CheckCircle2, Layers, Filter, ChevronDown, ChevronRight,
  Globe, Server, Shield, Activity, Target, GitBranch,
  Plus, Copy, Check, AlertOctagon,
  MoreHorizontal, ArrowRight, Clock3, ShieldAlert, Info, FileJson,
  Network, Bug, Terminal, LayoutGrid, List, X, Hash,
  User, Building2, MapPin, Timer, TrendingUp, Cpu, Database, Cloud
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { alertsApi } from '../services/api';

// ==================== 类型定义 ====================

type Severity = 'critical' | 'high' | 'medium' | 'low';
type AlertStatus = 'new' | 'investigating' | 'closed' | 'false_positive';
type AggregationDimension = 'none' | 'src_ip' | 'category' | 'pattern';

interface Alert {
  id: string;
  alertCode: string;
  title: string;
  description: string;
  severity: Severity;
  status: AlertStatus;
  source: string;  // 数据源产品
  
  // 网络信息
  srcIp: string;
  srcPort?: number;
  dstIp: string;
  dstPort?: number;
  protocol?: string;
  
  // 资产信息
  hostname?: string;
  
  // 时间信息
  firstSeen: string;
  lastSeen: string;
  
  // 原始日志
  rawLog?: string;
  parsedData?: Record<string, any>;
  
  // 关联信息
  eventId?: number;
  eventCode?: string;
  aggregated?: boolean;
  aggregatedCount?: number;
  aggregatedIds?: string[];
  
  // 扩展数据
  extraData?: Record<string, any>;
  category?: string;
  tags?: string[];
  iocType?: string;
  iocValue?: string;
  
  // 元数据
  createdAt: string;
  updatedAt: string;
}

interface AlertGroup {
  key: string;
  dimension: string;       // 聚合维度: 源IP / 分类 / 模式
  dimensionValue: string;  // 维度值
  label: string;           // 聚合说明
  count: number;
  alerts: Alert[];
  topSeverity: Severity;
  timeSpan: string;        // 时间跨度
  categories: string[];    // 包含的告警分类
  alertTypes: string[];    // 包含的告警类型
  firstSeen: string;
  lastSeen: string;
}

interface TriageStats {
  pending: number;
  critical: number;
  investigating: number;
  falsePositive: number;
  resolved: number;
  total24h: number;
}

// ==================== 配置常量 ====================

const severityConfig: Record<Severity, { 
  color: string; 
  text: string; 
  bg: string; 
  border: string;
  label: string;
  gradient: string;
}> = {
  critical: { 
    color: 'bg-rose-500', 
    text: 'text-rose-400', 
    bg: 'bg-rose-500/10', 
    border: 'border-rose-500/30',
    label: '危急',
    gradient: 'from-rose-500/20 to-rose-500/5'
  },
  high: { 
    color: 'bg-orange-500', 
    text: 'text-orange-400', 
    bg: 'bg-orange-500/10', 
    border: 'border-orange-500/30',
    label: '高危',
    gradient: 'from-orange-500/20 to-orange-500/5'
  },
  medium: { 
    color: 'bg-amber-500', 
    text: 'text-amber-400', 
    bg: 'bg-amber-500/10', 
    border: 'border-amber-500/30',
    label: '中危',
    gradient: 'from-amber-500/20 to-amber-500/5'
  },
  low: { 
    color: 'bg-blue-500', 
    text: 'text-blue-400', 
    bg: 'bg-blue-500/10', 
    border: 'border-blue-500/30',
    label: '低危',
    gradient: 'from-blue-500/20 to-blue-500/5'
  }
};

const statusConfig: Record<AlertStatus, { 
  icon: React.ElementType; 
  color: string; 
  bg: string; 
  label: string;
}> = {
  new: { icon: Bell, color: 'text-blue-400', bg: 'bg-blue-500/10', label: '新告警' },
  investigating: { icon: Clock3, color: 'text-amber-400', bg: 'bg-amber-500/10', label: '调查中' },
  closed: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: '已关闭' },
  false_positive: { icon: XCircle, color: 'text-gray-400', bg: 'bg-gray-500/10', label: '误报' }
};

// 数据源产品图标映射
const productIcons: Record<string, { icon: React.ElementType; color: string }> = {
  'WAF': { icon: Shield, color: 'text-purple-400' },
  'IDS': { icon: AlertOctagon, color: 'text-red-400' },
  'IPS': { icon: ShieldAlert, color: 'text-orange-400' },
  'EDR': { icon: Bug, color: 'text-green-400' },
  'Firewall': { icon: Shield, color: 'text-blue-400' },
  'SIEM': { icon: Activity, color: 'text-cyan-400' },
  'HIDS': { icon: Server, color: 'text-amber-400' },
  'NIDS': { icon: Network, color: 'text-rose-400' },
  'SOC': { icon: Terminal, color: 'text-indigo-400' },
  'CloudTrail': { icon: Cloud, color: 'text-aws' },
  'default': { icon: AlertTriangle, color: 'text-gray-400' }
};

// ==================== 工具函数 ====================

const formatTime = (time: string) => {
  const date = new Date(time);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return date.toLocaleString('zh-CN');
};

const formatDateTime = (time: string) => {
  return new Date(time).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
};

// ==================== 组件定义 ====================

// 标签/分类展示组件（紧凑单行设计）
const TagsDisplay = ({ category, tags, hostname }: {
  category?: string;
  tags?: string[];
  hostname?: string;
}) => {
  const items = [
    ...(category ? [{ type: 'category', label: category, className: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300' }] : []),
    ...(hostname ? [{ type: 'hostname', label: hostname, className: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300' }] : []),
    ...(tags?.slice(0, 1).map(tag => ({ type: 'tag', label: tag, className: 'bg-page-bg/60 border-border-color/50 text-text-muted' })) || []),
  ];
  
  return (
    <div className="flex items-center gap-1">
      {items.map((item, i) => (
        <span 
          key={i} 
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 border rounded text-[10px] font-medium max-w-[120px] truncate ${item.className}`}
          title={item.label}
        >
          {item.type !== 'tag' && <span className={`w-1.5 h-1.5 rounded-full ${item.type === 'category' ? 'bg-indigo-400' : 'bg-cyan-400'}`} />}
          {item.label}
        </span>
      ))}
      {tags && tags.length > 1 && (
        <span className="text-[10px] text-text-muted/60 px-1">
          +{tags.length - 1}
        </span>
      )}
    </div>
  );
};

// 原始日志查看器组件
const RawLogViewer = ({ rawLog, parsedData }: { rawLog?: string; parsedData?: Record<string, any> }) => {
  const [activeTab, setActiveTab] = useState<'raw' | 'parsed'>('raw');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const content = activeTab === 'raw' ? rawLog : JSON.stringify(parsedData, null, 2);
    copyToClipboard(content || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-border-color rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-page-bg/80 border-b border-border-color">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('raw')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              activeTab === 'raw' 
                ? 'bg-primary/20 text-primary' 
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <FileJson className="w-3.5 h-3.5 inline mr-1" />
            原始日志
          </button>
          {parsedData && (
            <button
              onClick={() => setActiveTab('parsed')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activeTab === 'parsed' 
                  ? 'bg-emerald-500/20 text-emerald-400' 
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Activity className="w-3.5 h-3.5 inline mr-1" />
              解析数据
            </button>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">已复制</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>复制</span>
            </>
          )}
        </button>
      </div>
      <div className="p-4 bg-[#0d1117] max-h-80 overflow-auto">
        {activeTab === 'raw' ? (
          <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap break-all">
            {rawLog || '无原始日志数据'}
          </pre>
        ) : (
          <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
            {JSON.stringify(parsedData, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
};



// 告警详情抽屉组件
const AlertDetailDrawer = ({ 
  alert, 
  onClose, 
  onStatusChange,
  onCreateEvent 
}: { 
  alert: Alert; 
  onClose: () => void;
  onStatusChange: (status: AlertStatus) => void;
  onCreateEvent: (alert: Alert) => void;
}) => {
  const severity = severityConfig[alert.severity];
  const StatusIcon = statusConfig[alert.status].icon;
  const ProductIcon = productIcons[alert.source]?.icon || AlertTriangle;
  const productColor = productIcons[alert.source]?.color || 'text-gray-400';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
      onClick={onClose}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="absolute right-0 top-0 bottom-0 w-full max-w-2xl bg-card-bg border-l border-border-color overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-card-bg/95 backdrop-blur border-b border-border-color">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">{alert.title}</h2>
              <p className="text-sm text-text-muted font-mono">{alert.alertCode}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-lg text-text-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="p-6 space-y-6">
        {/* 状态栏：严重度 + 状态 */}
          <div className="grid grid-cols-2 gap-4">
            <div className={`p-4 rounded-xl ${severity.bg} border ${severity.border}`}>
              <div className="text-xs text-text-muted mb-1">严重程度</div>
              <div className={`text-lg font-semibold ${severity.text}`}>{severity.label}</div>
            </div>
            <div className="p-4 rounded-xl bg-page-bg border border-border-color">
              <div className="text-xs text-text-muted mb-1">处理状态</div>
              <div className={`flex items-center gap-2 text-lg font-semibold ${statusConfig[alert.status].color}`}>
                <StatusIcon className="w-5 h-5" />
                {statusConfig[alert.status].label}
              </div>
            </div>
          </div>

          {/* 告警详情 - 紧凑布局 */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-page-bg to-card-bg border border-border-color">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-text-primary">告警详情</h3>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">分类:</span>
                <span className="text-text-primary font-medium">{alert.category || '-'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">数据源:</span>
                <span className="text-text-primary">{alert.source || '-'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">主机/资产:</span>
                <span className="text-text-primary">{alert.hostname || '-'}</span>
              </div>
            </div>
          </div>

          {/* 网络信息五元组 */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-page-bg to-card-bg border border-border-color">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-text-primary">网络信息 (五元组)</h3>
            </div>
            <div className="grid grid-cols-5 gap-2">
              <div className="px-3 py-2 bg-rose-500/10 border border-rose-500/20 rounded-lg text-center">
                <div className="text-[10px] text-rose-400/70 mb-0.5">源地址</div>
                <div className="text-xs font-mono text-rose-300 truncate">{alert.srcIp || '-'}</div>
              </div>
              <div className="px-3 py-2 bg-rose-500/5 border border-rose-500/10 rounded-lg text-center">
                <div className="text-[10px] text-rose-400/50 mb-0.5">源端口</div>
                <div className="text-xs font-mono text-rose-300/70">{alert.srcPort || '-'}</div>
              </div>
              <div className="px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg text-center">
                <div className="text-[10px] text-blue-400/70 mb-0.5">目的地址</div>
                <div className="text-xs font-mono text-blue-300 truncate">{alert.dstIp || '-'}</div>
              </div>
              <div className="px-3 py-2 bg-blue-500/5 border border-blue-500/10 rounded-lg text-center">
                <div className="text-[10px] text-blue-400/50 mb-0.5">目的端口</div>
                <div className="text-xs font-mono text-blue-300/70">{alert.dstPort || '-'}</div>
              </div>
              <div className="px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-center">
                <div className="text-[10px] text-emerald-400/70 mb-0.5">协议</div>
                <div className="text-xs font-mono text-emerald-300">{alert.protocol || '-'}</div>
              </div>
            </div>
          </div>
          {/* 描述 */}
          {alert.description && (
            <div className="p-3 rounded-lg bg-page-bg border border-border-color">
              <div className="flex items-center gap-2 mb-2">
                <Info className="w-3.5 h-3.5 text-text-muted" />
                <span className="text-xs font-medium text-text-muted">告警描述</span>
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">{alert.description}</p>
            </div>
          )}

          {/* 原始日志 */}
          {(alert.rawLog || alert.parsedData) && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileJson className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs font-medium text-text-muted">原始日志</span>
              </div>
              <RawLogViewer rawLog={alert.rawLog} parsedData={alert.parsedData} />
            </div>
          )}

          {/* 扩展数据 */}
          {alert.extraData && Object.keys(alert.extraData).length > 0 && (
            <div className="p-3 rounded-lg bg-page-bg border border-border-color">
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-xs font-medium text-text-muted">扩展信息</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(alert.extraData).slice(0, 6).map(([key, value]) => (
                  <div key={key} className="flex items-start gap-2">
                    <span className="text-text-muted w-24 flex-shrink-0">{key}:</span>
                    <span className="text-text-primary font-mono break-all">
                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="sticky bottom-0 z-10 flex items-center justify-between px-6 py-4 bg-card-bg/95 backdrop-blur border-t border-border-color">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onStatusChange('closed')}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
              关闭告警
            </button>
            <button
              onClick={() => onStatusChange('false_positive')}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              <EyeOff className="w-4 h-4" />
              标记误报
            </button>
          </div>
          <button
            onClick={() => onCreateEvent(alert)}
            className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
          >
            <Zap className="w-4 h-4" />
            生成事件
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ==================== 主页面组件 ====================

export default function SecurityAlerts() {
  const navigate = useNavigate();
  
  // 状态
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedAlerts, setSelectedAlerts] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<AlertStatus | 'all'>('all');
  const [showDetail, setShowDetail] = useState<Alert | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [aggregationKey, setAggregationKey] = useState<string>('none');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'critical' | 'investigating'>('all');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showAggregateModal, setShowAggregateModal] = useState(false);
  const [aggregateForm, setAggregateForm] = useState({ title: '', severity: 'medium' as Severity, category: '其他', description: '' });
  const eventTypeOptions = ['权限异常', '恶意软件', '数据泄露', '网络入侵', 'Web攻击', '横向移动', '其他'];

  // Toast提示
  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // 获取告警数据
  const fetchAlerts = useCallback(async () => {
    setIsLoading(true);
    
    try {
      const res = await alertsApi.getAlerts({ page_size: 100 });
      const items = (res.data?.items || res.alerts || []).map((a: any) => ({
        id: String(a.id),
        alertCode: a.alert_code || a.alertCode || '',
        title: a.title || '',
        description: a.description || '',
        severity: a.severity || 'medium',
        status: a.status || 'new',
        source: a.source_product || a.source || 'Other',
        srcIp: a.src_ip || a.srcIp || '',
        srcPort: a.src_port || a.srcPort,
        dstIp: a.dst_ip || a.dstIp || '',
        dstPort: a.dst_port || a.dstPort,
        protocol: a.protocol,
        hostname: a.hostname || '',
        affectedAssets: a.affected_assets || a.affectedAssets || [],
        category: a.category || '',
        tags: a.tags || [],
        rawLog: a.raw_log || a.rawLog,
        parsedData: a.parsed_data || a.parsedData || {},
        firstSeen: a.first_seen || a.firstSeen || '',
        lastSeen: a.last_seen || a.lastSeen || '',
        createdAt: a.created_at || a.createdAt || '',
        updatedAt: a.updated_at || a.updatedAt || '',
        extraData: a.extra_data || a.extraData || {},
      }));
      setAlerts(items);
    } catch (error) {
      console.error('获取告警失败:', error);
      showToast('获取告警数据失败', 'error');
      setAlerts([]);
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // 计算分诊统计
  const triageStats: TriageStats = useMemo(() => ({
    pending: alerts.filter(a => a.status === 'new').length,
    critical: alerts.filter(a => a.severity === 'critical').length,
    investigating: alerts.filter(a => a.status === 'investigating').length,
    falsePositive: alerts.filter(a => a.status === 'false_positive').length,
    resolved: alerts.filter(a => a.status === 'closed').length,
    total24h: alerts.filter(a => {
      const alertTime = new Date(a.createdAt).getTime();
      const dayAgo = Date.now() - 86400000;
      return alertTime > dayAgo;
    }).length
  }), [alerts]);

  // 动态智能聚合：按多维度指纹 + 动态时间窗口
  const alertGroups: AlertGroup[] = useMemo(() => {
    if (aggregationKey === 'none') return [];

    /**
     * 动态时间窗口算法：
     * 1. 同一组内，告警时间间隔 < 首尾跨度 × 2 的视为连续
     * 2. 最小窗口5分钟，最大窗口2小时
     * 3. 间隔 > 窗口的自动断开为新的分组
     */
    const MIN_WINDOW_MS = 5 * 60 * 1000;
    const MAX_WINDOW_MS = 2 * 60 * 60 * 1000;

    // 获取分组指纹
    const getFingerprint = (alert: Alert): string => {
      switch (aggregationKey) {
        case 'src_ip': return `src:${alert.srcIp}`;
        case 'dst_ip': return `dst:${alert.dstIp}`;
        case 'pattern': return `ptn:${alert.srcIp}_${alert.dstIp}_${alert.category}`;
        default: return alert.srcIp;
      }
    };

    // 获取维度显示名
    const getDimensionLabel = (): string => {
      switch (aggregationKey) {
        case 'src_ip': return '同一来源IP';
        case 'dst_ip': return '同一目的IP';
        case 'pattern': return '相同攻击模式';
        default: return '';
      }
    };

    // 1. 按指纹分组
    const fpGroups: Record<string, Alert[]> = {};
    alerts.forEach(a => {
      const fp = getFingerprint(a);
      if (!fpGroups[fp]) fpGroups[fp] = [];
      fpGroups[fp].push(a);
    });

    // 2. 动态时间窗口再分组
    const groups: AlertGroup[] = [];

    Object.entries(fpGroups).forEach(([fp, fpAlerts]) => {
      fpAlerts.sort((a, b) => new Date(a.firstSeen).getTime() - new Date(b.firstSeen).getTime());

      let currentBatch: Alert[] = [fpAlerts[0]];
      let batchStart = new Date(fpAlerts[0].firstSeen).getTime();
      let batchEnd = new Date(fpAlerts[0].lastSeen).getTime();

      for (let i = 1; i < fpAlerts.length; i++) {
        const t = new Date(fpAlerts[i].firstSeen).getTime();
        const span = batchEnd - batchStart;
        // 动态窗口 = max(最小窗口, min(跨度×2, 最大窗口))
        const windowMs = Math.min(Math.max(span * 2, MIN_WINDOW_MS), MAX_WINDOW_MS);

        if (t - batchEnd <= windowMs) {
          // 在动态窗口内，归入当前组
          currentBatch.push(fpAlerts[i]);
          batchEnd = new Date(fpAlerts[i].lastSeen).getTime();
        } else {
          // 超出窗口，保存当前组
          if (currentBatch.length >= 2) {
            const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
            const topSev = currentBatch.reduce((min, a) =>
              severityOrder[a.severity] < severityOrder[min] ? a.severity : min,
              currentBatch[0].severity);
            const allCats = [...new Set(currentBatch.map(a => a.category || '未分类'))];
            const allTypes = [...new Set(currentBatch.map(a => a.title.split('（')[0].split('(')[0].trim()))];
            const timeSpanMs = new Date(currentBatch[currentBatch.length-1].lastSeen).getTime() - new Date(currentBatch[0].firstSeen).getTime();
            const timeSpanStr = timeSpanMs < 60000 ? `${Math.round(timeSpanMs/1000)}秒` :
              timeSpanMs < 3600000 ? `${Math.round(timeSpanMs/60000)}分钟` :
              `${(timeSpanMs/3600000).toFixed(1)}小时`;

            const dimVal = aggregationKey === 'dst_ip' ? currentBatch[0].dstIp : currentBatch[0].srcIp;
            groups.push({
              key: `${fp}_${batchStart}`,
              dimension: getDimensionLabel(),
              dimensionValue: dimVal,
              label: `${currentBatch.length}条${getDimensionLabel()}告警`,
              count: currentBatch.length,
              alerts: currentBatch,
              topSeverity: topSev as Severity,
              timeSpan: timeSpanStr,
              categories: allCats,
              alertTypes: allTypes,
              firstSeen: currentBatch[0].firstSeen,
              lastSeen: currentBatch[currentBatch.length-1].lastSeen,
            });
          }
          currentBatch = [fpAlerts[i]];
          batchStart = t;
          batchEnd = new Date(fpAlerts[i].lastSeen).getTime();
        }
      }
      // 处理最后一组
      if (currentBatch.length >= 2) {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const topSev = currentBatch.reduce((min, a) =>
          severityOrder[a.severity] < severityOrder[min] ? a.severity : min,
          currentBatch[0].severity);
        const allCats = [...new Set(currentBatch.map(a => a.category || '未分类'))];
        const allTypes = [...new Set(currentBatch.map(a => a.title.split('（')[0].split('(')[0].trim()))];
        const timeSpanMs = new Date(currentBatch[currentBatch.length-1].lastSeen).getTime() - new Date(currentBatch[0].firstSeen).getTime();
        const timeSpanStr = timeSpanMs < 60000 ? `${Math.round(timeSpanMs/1000)}秒` :
          timeSpanMs < 3600000 ? `${Math.round(timeSpanMs/60000)}分钟` :
          `${(timeSpanMs/3600000).toFixed(1)}小时`;

        const dimVal = aggregationKey === 'dst_ip' ? currentBatch[0].dstIp : currentBatch[0].srcIp;
        groups.push({
          key: `${fp}_${batchStart}`,
          dimension: getDimensionLabel(),
          dimensionValue: dimVal,
          label: `${currentBatch.length}条${getDimensionLabel()}告警`,
          count: currentBatch.length,
          alerts: currentBatch,
          topSeverity: topSev as Severity,
          timeSpan: timeSpanStr,
          categories: allCats,
          alertTypes: allTypes,
          firstSeen: currentBatch[0].firstSeen,
          lastSeen: currentBatch[currentBatch.length-1].lastSeen,
        });
      }
    });

    return groups.sort((a, b) => b.count - a.count);
  }, [alerts, aggregationKey]);

  // 过滤和排序
  const filteredAlerts = useMemo(() => {
    let result = alerts.filter(a => {
      // 搜索过滤
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchSearch = 
          a.title.toLowerCase().includes(query) ||
          a.alertCode.toLowerCase().includes(query) ||
          a.srcIp.includes(query) ||
          a.dstIp.includes(query) ||
          a.description.toLowerCase().includes(query);
        if (!matchSearch) return false;
      }
      
      // 严重度过滤
      if (severityFilter !== 'all' && a.severity !== severityFilter) return false;
      
      // 状态过滤
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      
      // Tab过滤
      if (activeTab === 'pending' && a.status !== 'new') return false;
      if (activeTab === 'critical' && a.severity !== 'critical') return false;
      if (activeTab === 'investigating' && a.status !== 'investigating') return false;
      
      return true;
    });

    // 排序
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    result.sort((a, b) => {
      // 首先按聚合组排序（多的在前）
      if (aggregationKey !== 'none') {
        const aGroup = alertGroups.find(g => g.alerts.some(ga => ga.id === a.id));
        const bGroup = alertGroups.find(g => g.alerts.some(ga => ga.id === b.id));
        if (aGroup && bGroup) {
          if (aGroup.count !== bGroup.count) return bGroup.count - aGroup.count;
        } else if (aGroup) return -1;
        else if (bGroup) return 1;
      }
      // 然后按严重度
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      // 最后按时间
      return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
    });

    return result;
  }, [alerts, searchQuery, severityFilter, statusFilter, activeTab, aggregationKey, alertGroups]);

  // 选中操作
  const toggleSelect = (id: string) => {
    setSelectedAlerts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedAlerts.size === filteredAlerts.length) {
      setSelectedAlerts(new Set());
    } else {
      setSelectedAlerts(new Set(filteredAlerts.map(a => a.id)));
    }
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 状态变更（禁止从非new状态退回new）
  const handleStatusChange = (alertId: string, newStatus: AlertStatus) => {
    setAlerts(prev => prev.map(a => {
      if (a.id !== alertId) return a;
      if (newStatus === 'new' && a.status !== 'new') return a;
      return { ...a, status: newStatus };
    }));
    const alert = alerts.find(a => a.id === alertId);
    if (alert && newStatus === 'new' && alert.status !== 'new') {
      showToast('已处理过的告警不能重置为新告警', 'error');
      return;
    }
    showToast(`告警状态已更新为 ${statusConfig[newStatus].label}`);
    if (showDetail?.id === alertId) {
      setShowDetail(prev => prev ? { ...prev, status: newStatus } : null);
    }
  };

  // 生成事件 - 详细描述
  const handleCreateEvent = (alert: Alert) => {
    setSelectedAlerts(new Set([alert.id]));
    const selected = alerts.filter(a => selectedAlerts.has(a.id) || a.id === alert.id);
    const sevLabel = { critical: '危急', high: '高危', medium: '中危', low: '低危' }[alert.severity];
    const catMap: Record<string, string> = { '网络扫描': '网络入侵', '暴力破解': '权限异常', '恶意软件': '恶意软件', 'Web攻击': 'Web攻击', 'DDoS': '网络入侵', '数据安全': '数据泄露', 'C2通信': '网络入侵', '横向移动': '横向移动', '身份异常': '权限异常', '侦察扫描': '网络入侵' };
    setAggregateForm({
      title: `[事件] ${alert.title}${selected.length > 1 ? ` (+${selected.length - 1}条关联)` : ''}`,
      severity: alert.severity,
      category: catMap[alert.category] || '其他',
      description: [
        `━━━ 事件概要 ━━━`,
        `标题: ${alert.title}`,
        `严重级别: ${sevLabel}`,
        `告警来源: ${alert.source} | 分类: ${alert.category || '未分类'}`,
        '',
        `━━━ 网络信息 ━━━`,
        `源地址: ${alert.srcIp}${alert.srcPort ? `:${alert.srcPort}` : ''}`,
        `目标地址: ${alert.dstIp}${alert.dstPort ? `:${alert.dstPort}` : ''}`,
        `协议: ${alert.protocol || '-'}`,
        `主机/资产: ${alert.hostname || '-'}`,
        '',
        `━━━ 时间范围 ━━━`,
        `首次发现: ${alert.firstSeen}`,
        `最后发现: ${alert.lastSeen}`,
        '',
        `━━━ 告警描述 ━━━`,
        alert.description || '无详细描述',
        '',
        `━━━ 处置建议 ━━━`,
        `1. 确认告警真实性，检查相关日志`,
        `2. 如确认攻击，建议立即隔离受影响资产`,
        `3. 更新安全策略，封禁攻击源IP`,
        `4. 在事件工作台中跟进处置`,
      ].join('\n')
    });
    setShowAggregateModal(true);
  };

  // 批量聚合
  const handleAggregate = async () => {
    if (selectedAlerts.size === 0) {
      showToast('请选择要聚合的告警', 'error');
      return;
    }
    
    try {
      const res = await alertsApi.aggregateAlerts({
        alert_ids: Array.from(selectedAlerts),
        title: aggregateForm.title,
        severity: aggregateForm.severity,
        category: aggregateForm.category,
        description: aggregateForm.description
      });
      
      if (res.success) {
        showToast(`已生成事件，关联 ${selectedAlerts.size} 条告警`);
        setShowAggregateModal(false);
        setSelectedAlerts(new Set());
        fetchAlerts();
        navigate('/detection/events');
      }
    } catch (error) {
      showToast('聚合失败', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast 提示 */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 ${
              toast.type === 'success' ? 'bg-emerald-500/90' : 'bg-rose-500/90'
            } text-white`}
          >
            {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 分诊统计面板 */}
      <div className="grid grid-cols-6 gap-4">
        <motion.div
          whileHover={{ scale: 1.02 }}
          className={`col-span-1 glass-card rounded-xl p-4 cursor-pointer transition-all ${
            activeTab === 'pending' ? 'ring-2 ring-amber-500' : ''
          }`}
          onClick={() => setActiveTab(activeTab === 'pending' ? 'all' : 'pending')}
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-text-primary">{triageStats.pending}</div>
              <div className="text-xs text-text-muted">待分诊</div>
            </div>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ scale: 1.02 }}
          className={`col-span-1 glass-card rounded-xl p-4 cursor-pointer transition-all ${
            activeTab === 'critical' ? 'ring-2 ring-rose-500' : ''
          }`}
          onClick={() => setActiveTab(activeTab === 'critical' ? 'all' : 'critical')}
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 flex items-center justify-center relative">
              <AlertTriangle className="w-6 h-6 text-rose-400" />
              {triageStats.critical > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                  {triageStats.critical > 99 ? '99+' : triageStats.critical}
                </span>
              )}
            </div>
            <div>
              <div className="text-2xl font-bold text-text-primary">{triageStats.critical}</div>
              <div className="text-xs text-text-muted">危急</div>
            </div>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ scale: 1.02 }}
          className={`col-span-1 glass-card rounded-xl p-4 cursor-pointer transition-all ${
            activeTab === 'investigating' ? 'ring-2 ring-blue-500' : ''
          }`}
          onClick={() => setActiveTab(activeTab === 'investigating' ? 'all' : 'investigating')}
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Clock3 className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-text-primary">{triageStats.investigating}</div>
              <div className="text-xs text-text-muted">调查中</div>
            </div>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ scale: 1.02 }}
          className="col-span-1 glass-card rounded-xl p-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gray-500/10 flex items-center justify-center">
              <EyeOff className="w-6 h-6 text-gray-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-text-primary">{triageStats.falsePositive}</div>
              <div className="text-xs text-text-muted">误报</div>
            </div>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ scale: 1.02 }}
          className="col-span-1 glass-card rounded-xl p-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-text-primary">{triageStats.resolved}</div>
              <div className="text-xs text-text-muted">已处理</div>
            </div>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ scale: 1.02 }}
          className="col-span-1 glass-card rounded-xl p-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-text-primary">{triageStats.total24h}</div>
              <div className="text-xs text-text-muted">24h新增</div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">安全告警</h1>
            <p className="text-sm text-text-secondary mt-1">多源数据聚合 · 智能分析 · 快速响应</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
    

          {/* 聚合维度选择 */}
          <select
            value={aggregationKey}
            onChange={(e) => setAggregationKey(e.target.value)}
            className="px-4 py-2 bg-page-bg border border-border-color rounded-lg text-sm text-text-primary"
          >
            <option value="none">逐条显示</option>
            <option value="src_ip">按来源IP聚合</option>
            <option value="dst_ip">按目的IP聚合</option>
            <option value="pattern">按攻击模式聚合 (来源+目标+分类)</option>
          </select>

          <button
            onClick={fetchAlerts}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      {/* 搜索过滤栏 */}
      <div className="glass-card rounded-xl p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
            <input
              type="text"
              placeholder="搜索告警标题、ID、IP地址、描述..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-page-bg border border-border-color rounded-xl text-text-primary focus:outline-none focus:border-primary"
            />
          </div>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as Severity | 'all')}
            className="px-4 py-3 bg-page-bg border border-border-color rounded-xl text-text-primary"
          >
            <option value="all">全部严重度</option>
            <option value="critical">危急</option>
            <option value="high">高危</option>
            <option value="medium">中危</option>
            <option value="low">低危</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as AlertStatus | 'all')}
            className="px-4 py-3 bg-page-bg border border-border-color rounded-xl text-text-primary"
          >
            <option value="all">全部状态</option>
            <option value="new">新告警</option>
            <option value="investigating">调查中</option>
            <option value="closed">已关闭</option>
            <option value="false_positive">误报</option>
          </select>
        </div>
      </div>

      {/* 批量操作栏 */}
      {selectedAlerts.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 p-4 bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-xl"
        >
          <span className="text-sm text-primary font-medium">
            已选择 <span className="font-bold">{selectedAlerts.size}</span> 项
          </span>
          
          <div className="h-6 w-px bg-border-color" />
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleCreateEvent(alerts.find(a => selectedAlerts.has(a.id))!)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Zap className="w-4 h-4" />
              生成事件
            </button>
            <button
              onClick={() => {
                selectedAlerts.forEach(id => handleStatusChange(id, 'closed'));
                setSelectedAlerts(new Set());
              }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
              关闭
            </button>
            <button
              onClick={() => {
                selectedAlerts.forEach(id => handleStatusChange(id, 'false_positive'));
                setSelectedAlerts(new Set());
              }}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              <EyeOff className="w-4 h-4" />
              误报
            </button>
          </div>
          
          <div className="flex-1" />
          
          <button
            onClick={() => setSelectedAlerts(new Set())}
            className="px-4 py-2 text-text-muted hover:text-text-primary transition-colors"
          >
            取消选择
          </button>
        </motion.div>
      )}

      {/* 聚合组展示 */}
      {aggregationKey !== 'none' && alertGroups.length > 0 && (
        <div className="space-y-3 mb-4">
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Layers className="w-4 h-4 text-primary" />
            <span>已按 <strong className="text-primary">{aggregationKey === 'src_ip' ? '来源IP' : aggregationKey === 'dst_ip' ? '目的IP' : '攻击模式'}</strong> 聚合，共 <strong className="text-primary">{alertGroups.length}</strong> 组</span>
            <span className="text-xs text-text-muted">（仅聚合2条及以上的告警）</span>
          </div>
          <div className="space-y-3">
            {alertGroups.map(group => (
              <motion.div
                key={group.key}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-r from-primary/5 to-primary/0 border border-primary/20 rounded-xl overflow-hidden"
              >
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-primary/5 transition-colors"
                  onClick={() => toggleGroup(group.key)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      group.topSeverity === 'critical' ? 'bg-rose-500/20' :
                      group.topSeverity === 'high' ? 'bg-orange-500/20' : 'bg-amber-500/20'
                    }`}>
                      {aggregationKey === 'src_ip' ? <Globe className="w-5 h-5 text-rose-400" /> :
                       aggregationKey === 'dst_ip' ? <Server className="w-5 h-5 text-blue-400" /> :
                       <Target className="w-5 h-5 text-purple-400" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-text-primary">
                          {aggregationKey === 'src_ip' ? `来源IP: ${group.dimensionValue}` :
                           aggregationKey === 'dst_ip' ? `目的IP: ${group.dimensionValue}` :
                           `攻击模式: ${group.dimensionValue}`}
                        </span>
                        <span className={`px-2 py-0.5 text-[11px] font-bold rounded ${
                          group.topSeverity === 'critical' ? 'bg-rose-500/20 text-rose-400' :
                          group.topSeverity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                          'bg-amber-500/20 text-amber-400'
                        }`}>
                          {group.count}条告警
                        </span>
                        <span className="text-xs text-text-muted bg-page-bg px-2 py-0.5 rounded">
                          ⌛ {group.timeSpan}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
                        <span>{group.alertTypes.slice(0, 4).join(' · ')}</span>
                        {group.alertTypes.length > 4 && <span>+{group.alertTypes.length - 4}项</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const sevMap = { critical: '危急', high: '高危', medium: '中危', low: '低危' };
                        const severityDist = group.alerts.reduce((acc: Record<string, number>, a) => {
                          acc[a.severity] = (acc[a.severity] || 0) + 1; return acc;
                        }, {});
                        const sevDistStr = Object.entries(severityDist).map(([k, v]) => `${sevMap[k as Severity]}: ${v}条`).join(' | ');
                        group.alerts.sort((a: Alert, b: Alert) => new Date(a.firstSeen).getTime() - new Date(b.firstSeen).getTime());
                        const catMap2: Record<string, string> = { '网络扫描': '网络入侵', '暴力破解': '权限异常', '恶意软件': '恶意软件', 'Web攻击': 'Web攻击', 'DDoS': '网络入侵', '数据安全': '数据泄露', 'C2通信': '网络入侵', '横向移动': '横向移动', '身份异常': '权限异常', '侦察扫描': '网络入侵' };
                        const topCat = catMap2[group.categories[0]] || '其他';
                        setAggregateForm({
                          title: `[聚合事件] ${group.dimensionValue} ${group.count}条告警`,
                          severity: group.topSeverity,
                          category: topCat,
                          description: [
                            `━━━ 事件概要 ━━━`,
                            `聚合维度: ${group.dimension}`,
                            `影响IP: ${group.dimensionValue}`,
                            `告警总数: ${group.count}条 | 时间跨度: ${group.timeSpan}`,
                            `严重度分布: ${sevDistStr}`,
                            '',
                            `━━━ 告警类型 ━━━`,
                            ...group.alertTypes.map((t: string, i: number) => `${i + 1}. ${t}`),
                            '',
                            `━━━ 详细时间线 ━━━`,
                            ...group.alerts.map((a: Alert, i: number) => {
                              const idx = String(i + 1).padStart(2, '0');
                              const time = new Date(a.firstSeen).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                              return `[${idx}] ${time} | [${sevMap[a.severity as Severity]}] ${a.title} | ${a.srcIp}→${a.dstIp}`;
                            }),
                            '',
                            `━━━ 处置建议 ━━━`,
                            `1. 分析时间线中的攻击路径，确认攻击意图`,
                            `2. 对 ${group.dimensionValue} 相关资产进行排查`,
                            `3. 更新安全策略，阻断攻击源`,
                            `4. 在事件工作台中跟进处置`,
                          ].join('\n')
                        });
                        setSelectedAlerts(new Set(group.alerts.map(a => a.id)));
                        setShowAggregateModal(true);
                      }}
                      className="p-2 text-purple-400 hover:bg-purple-500/10 rounded-lg transition-colors"
                      title="一键生成事件"
                    >
                      <Zap className="w-4 h-4" />
                    </button>
                    <ChevronRight className={`w-4 h-4 text-text-muted transition-transform flex-shrink-0 ${
                      expandedGroups.has(group.key) ? 'rotate-90' : ''
                    }`} />
                  </div>
                </div>
                {expandedGroups.has(group.key) && (
                  <div className="border-t border-border-color/50">
                    {/* 表头 */}
                    <div className="flex items-center gap-3 px-4 py-2 bg-page-bg/50 text-xs text-text-muted uppercase">
                      <span className="w-2"></span>
                      <span className="w-28">告警ID</span>
                      <span className="flex-1">告警信息</span>
                      <span className="w-32">源地址</span>
                      <span className="w-32">目标地址</span>
                      <span className="w-16">严重度</span>
                      <span className="w-20">时间</span>
                      <span className="w-16">操作</span>
                    </div>
                    <div className="divide-y divide-border-color/30">
                      {group.alerts.map(alert => {
                        const sev = severityConfig[alert.severity];
                        return (
                          <div key={alert.id} className="flex items-center gap-3 px-4 py-2 hover:bg-white/5 text-sm">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${sev.color}`} />
                            <span className="text-xs font-mono text-text-muted w-28 flex-shrink-0">{alert.alertCode}</span>
                            <span className="flex-1 text-text-primary min-w-0 truncate">{alert.title}</span>
                            <span className="w-32 text-xs text-text-muted font-mono truncate">{alert.srcIp}{alert.srcPort ? `:${alert.srcPort}` : ''}</span>
                            <span className="w-32 text-xs text-text-muted font-mono truncate">{alert.dstIp}{alert.dstPort ? `:${alert.dstPort}` : ''}</span>
                            <span className="w-16 text-xs text-text-muted">{sev.label}</span>
                            <span className="w-20 text-xs text-text-muted">{formatTime(alert.lastSeen)}</span>
                            <button
                              onClick={() => setShowDetail(alert)}
                              className="w-16 text-xs text-primary hover:underline"
                            >
                              查看
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* 告警列表 */}
        <div className="glass-card rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-page-bg/80 border-b border-border-color">
              <tr className="text-left text-xs text-text-muted uppercase tracking-wider">
                <th className="p-4 w-10">
                  <input
                    type="checkbox"
                    checked={selectedAlerts.size === filteredAlerts.length && filteredAlerts.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-border-color"
                  />
                </th>
                <th className="p-4 font-medium w-28">告警日志ID</th>
                <th className="p-4 font-medium">告警信息</th>
                <th className="p-4 font-medium w-20">严重度</th>
                <th className="p-4 font-medium w-44">分类/资产</th>
                <th className="p-4 font-medium w-20">状态</th>
                <th className="p-4 font-medium w-32">告警时间</th>
                <th className="p-4 font-medium w-20">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredAlerts.map((alert, index) => {
                const severity = severityConfig[alert.severity];
                const StatusIcon = statusConfig[alert.status].icon;

                return (
                  <motion.tr
                    key={alert.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className={`border-b border-border-color/50 hover:bg-white/5 transition-colors ${
                      selectedAlerts.has(alert.id) ? 'bg-primary/5' : ''
                    }`}
                  >
                    <td className="p-4">
                      <input
                        type="checkbox"
                        checked={selectedAlerts.has(alert.id)}
                        onChange={() => toggleSelect(alert.id)}
                        className="w-4 h-4 rounded border-border-color"
                      />
                    </td>
                    <td className="p-4">
                      <span className="text-xs font-mono text-text-muted">{alert.alertCode}</span>
                    </td>
                    <td className="p-4">
                      <p className="text-sm font-medium text-text-primary line-clamp-1">{alert.title}</p>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-lg ${severity.bg} ${severity.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${severity.color}`} />
                        {severity.label}
                      </span>
                    </td>
                    <td className="p-4">
                      <TagsDisplay category={alert.category} tags={alert.tags} hostname={alert.hostname} />
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-lg ${statusConfig[alert.status].bg} ${statusConfig[alert.status].color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {statusConfig[alert.status].label}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-text-muted">
                      {formatTime(alert.lastSeen)}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setShowDetail(alert)}
                          className="p-2 text-text-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                          title="查看详情"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleCreateEvent(alert)}
                          className="p-2 text-text-muted hover:text-purple-400 hover:bg-purple-500/10 rounded-lg transition-colors"
                          title="生成事件"
                        >
                          <Zap className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
          
          {filteredAlerts.length === 0 && (
            <div className="p-12 text-center">
              <Shield className="w-12 h-12 text-text-muted mx-auto mb-3" />
              <p className="text-text-secondary">暂无告警数据</p>
            </div>
          )}
        </div>

      {/* 分页 */}
      {filteredAlerts.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-muted">
            显示 {filteredAlerts.length} 条，共 {alerts.length} 条
          </span>
        </div>
      )}

      {/* 详情抽屉 */}
      <AnimatePresence>
        {showDetail && (
          <AlertDetailDrawer
            alert={showDetail}
            onClose={() => setShowDetail(null)}
            onStatusChange={(status) => handleStatusChange(showDetail.id, status)}
            onCreateEvent={handleCreateEvent}
          />
        )}
      </AnimatePresence>

      {/* 聚合生成事件弹窗 */}
      <AnimatePresence>
        {showAggregateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowAggregateModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-card-bg rounded-2xl p-6 w-full max-w-lg border border-border-color"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center">
                  <Layers className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-text-primary">聚合生成事件</h3>
                  <p className="text-sm text-text-muted">将 {selectedAlerts.size} 条告警聚合为安全事件</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-2">事件标题 <span className="text-rose-400">*</span></label>
                  <input
                    type="text"
                    value={aggregateForm.title}
                    onChange={(e) => setAggregateForm({ ...aggregateForm, title: e.target.value })}
                    className="w-full px-4 py-3 bg-page-bg border border-border-color rounded-xl text-text-primary focus:border-primary focus:outline-none"
                    placeholder="输入事件标题"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-text-secondary mb-2">严重程度</label>
                    <select
                      value={aggregateForm.severity}
                      onChange={(e) => setAggregateForm({ ...aggregateForm, severity: e.target.value as Severity })}
                      className="w-full px-4 py-3 bg-page-bg border border-border-color rounded-xl text-text-primary focus:border-primary focus:outline-none"
                    >
                      <option value="critical">危急</option>
                      <option value="high">高危</option>
                      <option value="medium">中危</option>
                      <option value="low">低危</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-text-secondary mb-2">事件类型</label>
                    <select
                      value={aggregateForm.category}
                      onChange={(e) => setAggregateForm({ ...aggregateForm, category: e.target.value })}
                      className="w-full px-4 py-3 bg-page-bg border border-border-color rounded-xl text-text-primary focus:border-primary focus:outline-none"
                    >
                      {eventTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-text-secondary mb-2">事件描述</label>
                  <textarea
                    value={aggregateForm.description}
                    onChange={(e) => setAggregateForm({ ...aggregateForm, description: e.target.value })}
                    rows={12}
                    className="w-full px-4 py-3 bg-page-bg border border-border-color rounded-xl text-text-primary font-mono text-xs focus:border-primary focus:outline-none resize-none"
                    placeholder="描述事件详情..."
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowAggregateModal(false)}
                  className="flex-1 py-3 bg-page-bg text-text-secondary rounded-xl hover:bg-white/5 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleAggregate}
                  disabled={!aggregateForm.title.trim()}
                  className="flex-1 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  <Zap className="w-4 h-4" />
                  生成事件
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
