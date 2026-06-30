/**
 * SecurityAlerts — 安全告警中心
 *
 * 布局：
 *   ┌──────────────────────────────────────────────┐
 *   │ SearchBar + SavedSearches                     │
 *   │ TimeRangeSelector + 操作按钮                   │
 *   ├────────────┬─────────────────────────────────┤
 *   │ QuickValues│  MessageTable                    │
 *   │            │  (可配置列、高亮、排序、分页)      │
 *   ├────────────┴─────────────────────────────────┤
 *   │ AlertDetailDrawer (FieldBrowser + RawLog       │
 *   │                   + 邻接消息)                   │
 *   └──────────────────────────────────────────────┘
 */

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download, CheckCircle, XCircle, Bell, RefreshCw, Eye, BarChart3,
  EyeOff, AlertCircle, Zap, AlertTriangle,
  Loader2, CheckCircle2, Layers, Filter, ChevronDown, ChevronRight,
  Globe, Server, Shield, Activity, Target, GitBranch,
  Plus, Copy, Check, AlertOctagon,
  MoreHorizontal, ArrowRight, Clock3, ShieldAlert, Info, FileJson,
  Network, Bug, Terminal, LayoutGrid, List, X, Hash,
  User, Building2, MapPin, Timer, TrendingUp, Cpu, Database, Cloud, Clock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { alertsApi } from '../services/api';

// 新组件
import SearchBar from '../components/SearchBar';
import TimeRangeSelector, { TimeRange } from '../components/TimeRangeSelector';
import QuickValuesPanel from '../components/QuickValuesPanel';
import MessageTable from '../components/MessageTable';
import FieldBrowser from '../components/FieldBrowser';

// ==================== 类型定义 ====================

type Severity = 'critical' | 'high' | 'medium' | 'low';
type AlertStatus = 'new' | 'investigating' | 'closed' | 'false_positive' | 'active' | 'resolved';

interface Alert {
  id: string;
  alertCode: string;
  title: string;
  description: string;
  severity: Severity;
  status: AlertStatus;
  source: string;
  sourceProduct?: string;
  srcIp: string;
  srcPort?: number;
  dstIp: string;
  dstPort?: number;
  protocol?: string;
  hostname?: string;
  firstSeen: string;
  lastSeen: string;
  rawLog?: string;
  parsedData?: Record<string, any>;
  category?: string;
  tags?: string[];
  extraData?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  [key: string]: any;
}

interface SavedSearch {
  id?: string;
  title: string;
  query: string | { query_string?: string; [key: string]: any };
  query_string?: string;
  timeRange?: { start: string; end: string; label?: string };
  createdAt?: string;
}

interface QuickFilter {
  field: string;
  value: string;
  exclude: boolean;
}

// ==================== 配置常量 ====================

const severityConfig: Record<Severity, { color: string; text: string; bg: string; border: string; label: string; gradient: string }> = {
  critical: { color: 'bg-rose-500', text: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/30', label: '危急', gradient: 'from-rose-500/20 to-rose-500/5' },
  high: { color: 'bg-orange-500', text: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', label: '高危', gradient: 'from-orange-500/20 to-orange-500/5' },
  medium: { color: 'bg-amber-500', text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', label: '中危', gradient: 'from-amber-500/20 to-amber-500/5' },
  low: { color: 'bg-blue-500', text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', label: '低危', gradient: 'from-blue-500/20 to-blue-500/5' },
};

const statusConfig: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  new: { icon: Bell, color: 'text-blue-400', bg: 'bg-blue-500/10', label: '新告警' },
  investigating: { icon: Clock3, color: 'text-amber-400', bg: 'bg-amber-500/10', label: '调查中' },
  closed: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: '已关闭' },
  false_positive: { icon: XCircle, color: 'text-gray-400', bg: 'bg-gray-500/10', label: '误报' },
  active: { icon: Clock3, color: 'text-amber-400', bg: 'bg-amber-500/10', label: '调查中' },
  resolved: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: '已关闭' },
};

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
  'CloudTrail': { icon: Cloud, color: 'text-teal-400' },
  'default': { icon: AlertTriangle, color: 'text-gray-400' },
};

const eventTypeOptions = ['权限异常', '恶意软件', '数据泄露', '网络入侵', 'Web攻击', '横向移动', '其他'];

// ==================== 工具函数 ====================

const formatTime = (time: string) => {
  if (!time) return '-';
  const date = new Date(time);
  if (isNaN(date.getTime())) return time;
  const diff = Date.now() - date.getTime();
  if (diff < 0 || diff < 60000) return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const formatDateTime = (time: string) =>
  new Date(time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

// ==================== 原始日志查看器 ====================

const RawLogViewer = ({ rawLog, extraData }: { rawLog?: string; extraData?: Record<string, any> }) => {
  const [tab, setTab] = useState<'raw' | 'parsed'>('raw');
  const [copied, setCopied] = useState(false);
  const hasParsed = extraData && Object.keys(extraData).length > 0;

  const handleCopy = () => {
    const content = tab === 'raw' ? rawLog : JSON.stringify(extraData, null, 2);
    navigator.clipboard.writeText(content || '').catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-border-color rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-page-bg/80 border-b border-border-color">
        <div className="flex gap-1">
          <button onClick={() => setTab('raw')} className={`px-3 py-1 text-xs rounded-md ${tab === 'raw' ? 'bg-primary/15 text-primary' : 'text-text-muted hover:text-text-secondary'}`}>原始日志</button>
          {hasParsed && <button onClick={() => setTab('parsed')} className={`px-3 py-1 text-xs rounded-md ${tab === 'parsed' ? 'bg-primary/15 text-primary' : 'text-text-muted hover:text-text-secondary'}`}>解析数据</button>}
        </div>
        <button onClick={handleCopy} className="flex items-center gap-1 px-2 py-1 text-xs text-text-muted hover:text-primary rounded transition-colors">
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="p-4 text-xs text-text-secondary font-mono overflow-auto max-h-[300px] whitespace-pre-wrap break-all bg-page-bg/50">
        {tab === 'raw' ? (rawLog || '无原始日志') : JSON.stringify(extraData, null, 2)}
      </pre>
    </div>
  );
};

// ==================== 主页面组件 ====================

export default function SecurityAlerts() {
  const navigate = useNavigate();

  // ---- 搜索状态 ----
  const [queryString, setQueryString] = useState('');
  const [timeRange, setTimeRange] = useState<TimeRange>(() => ({
    start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    end: new Date().toISOString(),
    label: '24 小时',
    preset: '24h',
  }));
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [showQuickValues, setShowQuickValues] = useState(true);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval>>();

  // ---- 数据状态 ----
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [totalAlerts, setTotalAlerts] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [tookMs, setTookMs] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortField, setSortField] = useState('first_seen');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // ---- 直方图数据 ----
  const [histogramData, setHistogramData] = useState<{ key: string; count: number }[]>([]);
  const [histogramLoading, setHistogramLoading] = useState(false);

  // ---- QuickValues 筛选 ----
  const [quickFilters, setQuickFilters] = useState<QuickFilter[]>([]);

  // ---- 已保存搜索 ----
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);

  // ---- 选中行 ----
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ---- 详情抽屉 ----
  const [showDetail, setShowDetail] = useState<Alert | null>(null);
  const [detailTab, setDetailTab] = useState<'fields' | 'raw' | 'related'>('fields');
  const [relatedAlerts, setRelatedAlerts] = useState<Record<string, any>[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);

  // ---- 聚合事件 ----
  const [showAggregateModal, setShowAggregateModal] = useState(false);
  const [aggregateForm, setAggregateForm] = useState({ title: '', severity: 'medium' as Severity, category: '其他', description: '', includeRelated: false, markStatus: 'investigating' });

  // ---- Toast ----
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ---- Tab ----
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'critical' | 'investigating'>('all');


  // ==================== 构建查询字符串 ====================

  const buildQueryString = useCallback(() => {
    let q = queryString;

    // activeTab 快捷筛选
    if (activeTab === 'critical') q = q ? `severity:critical AND (${q})` : 'severity:critical';
    if (activeTab === 'investigating') q = q ? `status:investigating AND (${q})` : 'status:investigating';
    if (activeTab === 'pending') q = q ? `(status:new OR status:investigating) AND (${q})` : 'status:new OR status:investigating';

    // QuickValues 筛选
    for (const f of quickFilters) {
      const clause = f.exclude ? `NOT ${f.field}:${f.value}` : `${f.field}:${f.value}`;
      q = q ? `${q} AND ${clause}` : clause;
    }

    return q;
  }, [queryString, activeTab, quickFilters]);

  // ==================== 数据获取 ====================

  const fetchAlerts = useCallback(async () => {
    setIsLoading(true);
    try {
      const q = buildQueryString();
      const resp = await alertsApi.getAlerts({
        page: currentPage,
        page_size: pageSize,
        search: q || undefined,
        start_time: timeRange.start || undefined,
        end_time: timeRange.end || undefined,
      });

      const items = (resp.data?.items || resp.alerts || []).map((a: any) => ({
        id: String(a.id),
        alertCode: a.alert_code || a.alertCode || '',
        title: a.title || '',
        description: a.description || '',
        severity: a.severity || 'medium',
        status: a.status || 'new',
        source: a.source || 'Other',
        sourceProduct: a.source_product || a.source || '',
        srcIp: a.src_ip || a.srcIp || '',
        srcPort: a.src_port || a.srcPort,
        dstIp: a.dst_ip || a.dstIp || '',
        dstPort: a.dst_port || a.dstPort,
        protocol: a.protocol,
        hostname: a.hostname || '',
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
      setTotalAlerts(resp.data?.total || 0);
      setTotalPages(resp.data?.pages || 0);
      setTookMs(resp.took_ms ?? null);
    } catch (e) {
      console.error('获取告警失败:', e);
      showToast('获取告警数据失败', 'error');
      setAlerts([]);
    } finally {
      setIsLoading(false);
    }
  }, [buildQueryString, currentPage, pageSize, timeRange.start, timeRange.end, showToast]);

  const fetchHistogram = useCallback(async () => {
    setHistogramLoading(true);
    try {
      const q = buildQueryString();
      // 通过 searchAlerts 聚合获取直方图
      const resp = await alertsApi.searchAlerts({
        q: q || undefined,
        start_time: timeRange.start || undefined,
        end_time: timeRange.end || undefined,
        aggregations: ['date_histogram'],
        histogram_interval: 'auto',
        page_size: 0,
      });
      const buckets = resp?.data?.aggregations?.timeline?.buckets
        || resp?.data?.aggregations?.date_histogram?.buckets
        || [];
      setHistogramData(buckets.map((b: any) => ({
        key: b.key_as_string || b.key,
        count: b.doc_count,
      })));
    } catch (e) {
      console.error('直方图加载失败:', e);
      setHistogramData([]);
    } finally {
      setHistogramLoading(false);
    }
  }, [buildQueryString, timeRange.start, timeRange.end]);

  const fetchSavedSearches = useCallback(async () => {
    try {
      const resp = await alertsApi.getSavedSearches();
      setSavedSearches(resp?.data || []);
    } catch { /* ignore */ }
  }, []);

  // ---- 初始加载 + 刷新 ----
  useEffect(() => {
    fetchAlerts();
    fetchHistogram();
  }, [fetchAlerts, fetchHistogram]);

  useEffect(() => { fetchSavedSearches(); }, [fetchSavedSearches]);

  // ---- 自动刷新 ----
  useEffect(() => {
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(() => {
        fetchAlerts();
        fetchHistogram();
      }, 15000);
    }
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [autoRefresh, fetchAlerts, fetchHistogram]);

  // ---- 筛选变化重置分页 ----
  useEffect(() => { setCurrentPage(1); }, [queryString, quickFilters, activeTab, timeRange.start, timeRange.end]);

  // ==================== 分诊统计 ====================

  const triageStats = useMemo(() => ({
    pending: totalAlerts,
    critical: alerts.filter(a => a.severity === 'critical').length,
    investigating: alerts.filter(a => a.status === 'investigating' || a.status === 'active').length,
    resolved: alerts.filter(a => a.status === 'closed' || a.status === 'resolved').length,
  }), [alerts, totalAlerts]);

  // ==================== 搜索栏回调 ====================

  const handleSearch = useCallback(() => {
    setCurrentPage(1);
    fetchAlerts();
    fetchHistogram();
  }, [fetchAlerts, fetchHistogram]);

  const handleTimeRangeChange = useCallback((range: TimeRange) => {
    setTimeRange(range);
  }, []);

  const handleHistogramBucketClick = useCallback((start: string, end: string) => {
    setTimeRange(prev => ({ ...prev, start, end, label: '自定义 (直方图)', preset: undefined }));
  }, []);

  // ---- QuickValues 筛选 ----
  const handleQuickFilterAdd = useCallback((field: string, value: string, exclude: boolean) => {
    setQuickFilters(prev => {
      // 避免重复
      if (prev.some(f => f.field === field && f.value === value && f.exclude === exclude)) return prev;
      return [...prev, { field, value, exclude }];
    });
  }, []);

  const handleQuickFilterRemove = useCallback((field: string, value: string) => {
    setQuickFilters(prev => prev.filter(f => !(f.field === field && f.value === value)));
  }, []);

  // ---- 已保存搜索 ----
  const handleSaveSearch = useCallback(async (title: string) => {
    try {
      await alertsApi.createSavedSearch({
        title,
        query: { query_string: queryString },
        query_string: queryString,
      });
      showToast('搜索已保存');
      fetchSavedSearches();
    } catch {
      showToast('保存失败', 'error');
    }
  }, [queryString, showToast, fetchSavedSearches]);

  const handleLoadSearch = useCallback((search: SavedSearch) => {
    const q = search.query_string || (typeof search.query === 'object' ? search.query?.query_string : search.query) || '';
    setQueryString(q);
    setCurrentPage(1);
  }, []);

  const handleDeleteSearch = useCallback(async (id: string) => {
    try {
      await alertsApi.deleteSavedSearch(id);
      showToast('已删除');
      fetchSavedSearches();
    } catch {
      showToast('删除失败', 'error');
    }
  }, [showToast, fetchSavedSearches]);

  // ---- 排序 ----
  const handleSortChange = useCallback((field: string, order: 'asc' | 'desc') => {
    setSortField(field);
    setSortOrder(order);
  }, []);

  // ---- 详情抽屉 + 邻接消息 ----
  const handleRowClick = useCallback((row: any) => {
    setShowDetail(row);
    setDetailTab('fields');
    setRelatedAlerts([]);
  }, []);

  const fetchRelated = useCallback(async (alertId: string) => {
    setRelatedLoading(true);
    try {
      const resp = await alertsApi.relatedAlerts(alertId);
      setRelatedAlerts(resp?.data || []);
    } catch {
      setRelatedAlerts([]);
    } finally {
      setRelatedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showDetail?.id && detailTab === 'related' && relatedAlerts.length === 0) {
      fetchRelated(showDetail.id);
    }
  }, [showDetail?.id, detailTab, fetchRelated, relatedAlerts.length]);

  // ---- 搜索字段（FieldBrowser 回调）----
  const handleSearchField = useCallback((field: string, value: string) => {
    const clause = `${field}:"${value}"`;
    setQueryString(prev => prev ? `${prev} AND ${clause}` : clause);
    setShowDetail(null);
    setCurrentPage(1);
  }, []);

  // ---- 状态变更 ----
  const handleStatusChange = useCallback(async (alertId: string, status: string) => {
    try {
      await alertsApi.updateAlertStatus(Number(alertId), status);
      showToast('状态已更新');
      fetchAlerts();
      if (showDetail?.id === alertId) {
        setShowDetail(prev => prev ? { ...prev, status: status as AlertStatus } : null);
      }
    } catch {
      showToast('更新失败', 'error');
    }
  }, [showToast, fetchAlerts, showDetail]);

  // ---- 聚合生成事件 ----
  const handleCreateEventFromDetail = useCallback((alert: Alert) => {
    setSelectedIds(new Set([alert.id]));
    setAggregateForm({
      title: `事件: ${alert.title}`,
      severity: alert.severity,
      category: alert.category || '其他',
      description: alert.description,
      includeRelated: false,
      markStatus: 'investigating',
    });
    setShowAggregateModal(true);
    setShowDetail(null);
  }, []);

  const handleAggregate = useCallback(async () => {
    if (!aggregateForm.title.trim() || selectedIds.size === 0) return;
    try {
      await alertsApi.aggregateAlerts({
        alert_ids: Array.from(selectedIds).map(Number),
        title: aggregateForm.title,
        severity: aggregateForm.severity,
        description: aggregateForm.description,
        category: aggregateForm.category,
        include_related: aggregateForm.includeRelated,
        mark_status: aggregateForm.markStatus,
      });
      showToast(`已聚合 ${selectedIds.size} 条告警生成事件`);
      setShowAggregateModal(false);
      setSelectedIds(new Set());
      fetchAlerts();
      navigate('/detection/events');
    } catch {
      showToast('聚合失败', 'error');
    }
  }, [aggregateForm, selectedIds, showToast, fetchAlerts, navigate]);

  // ---- 导出 ----
  const handleExport = useCallback(() => {
    const params: any = {};
    if (timeRange.start) params.start_time = timeRange.start;
    if (timeRange.end) params.end_time = timeRange.end;
    alertsApi.exportAlerts(params).catch(() => showToast('导出失败', 'error'));
  }, [timeRange, showToast]);

  // ==================== 渲染 ====================

  return (
    <div className="flex flex-col h-full">
      {/* Toast */}
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

      {/* ========== 顶部搜索区 ========== */}
      <div className="flex-shrink-0 space-y-3 px-6 pt-4 pb-3">


        {/* SearchBar */}
        <SearchBar
          value={queryString}
          onChange={setQueryString}
          onSearch={handleSearch}
          hitCount={totalAlerts}
          tookMs={tookMs}
          loading={isLoading}
          savedSearches={savedSearches as any[]}
          onSaveSearch={handleSaveSearch}
          onLoadSearch={handleLoadSearch}
          onDeleteSearch={handleDeleteSearch}
          timeRangeLabel={timeRange.label}
        />

        {/* TimeRangeSelector + 操作按钮 */}
        <div className="flex items-center justify-between">
          <TimeRangeSelector
            value={timeRange}
            onChange={handleTimeRangeChange}
            enableAutoRefresh
            autoRefreshEnabled={autoRefresh}
            onAutoRefreshChange={setAutoRefresh}
          />
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <button
                onClick={() => setShowAggregateModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs hover:bg-purple-700 transition-colors"
              >
                <Zap className="w-3.5 h-3.5" />
                聚合事件 ({selectedIds.size})
              </button>
            )}
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-page-bg border border-border-color text-text-muted hover:text-text-secondary text-xs transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              导出
            </button>
            <button
              onClick={() => setShowQuickValues(!showQuickValues)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                showQuickValues ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-page-bg border-border-color text-text-muted hover:text-text-secondary'
              }`}
              title={showQuickValues ? '隐藏字段分布' : '显示字段分布'}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              {showQuickValues ? '隐藏面板' : '显示面板'}
            </button>
            <button
              onClick={() => { fetchAlerts(); fetchHistogram(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-muted hover:text-text-secondary bg-page-bg border border-border-color rounded-lg transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>
        </div>

      </div>

      {/* ========== 主内容区 ========== */}
      <div className="flex-1 flex overflow-hidden px-6 pb-4 gap-4">
        {/* QuickValues 侧栏 */}
        {showQuickValues && (
          <div className="flex-shrink-0 w-[280px] hidden lg:block">
            <QuickValuesPanel
              onFilterAdd={handleQuickFilterAdd}
              activeFilters={quickFilters}
              onFilterRemove={handleQuickFilterRemove}
              startTime={timeRange.start}
              endTime={timeRange.end}
              className="h-full"
            />
          </div>
        )}

        {/* 右侧：MessageTable */}
        <div className="flex-1 min-w-0 bg-card-bg border border-border-color rounded-xl overflow-hidden">
          <MessageTable
            data={alerts}
            loading={isLoading}
            total={totalAlerts}
            page={currentPage}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
            onSortChange={handleSortChange}
            sortField={sortField}
            sortOrder={sortOrder}
            onRowClick={handleRowClick}
            expandedRowId={showDetail?.id || null}
            searchQuery={buildQueryString()}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            className="h-full"
          />
        </div>
      </div>

      {/* ========== 详情抽屉 ========== */}
      <AnimatePresence>
        {showDetail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={() => setShowDetail(null)}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute right-0 top-0 bottom-0 w-full max-w-2xl bg-card-bg border-l border-border-color flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              {/* 抽屉头部 */}
              <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-border-color bg-card-bg/95 backdrop-blur">
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold text-text-primary truncate">{showDetail.title}</h2>
                  <p className="text-xs text-text-muted font-mono">{showDetail.alertCode || showDetail.id}</p>
                </div>
                <button onClick={() => setShowDetail(null)} className="p-2 hover:bg-white/5 rounded-lg text-text-muted ml-3">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 状态栏 */}
              <div className="flex-shrink-0 grid grid-cols-2 gap-3 px-6 py-3 border-b border-border-color/50">
                <div className={`p-3 rounded-xl ${severityConfig[showDetail.severity]?.bg} border ${severityConfig[showDetail.severity]?.border}`}>
                  <div className="text-[10px] text-text-muted mb-0.5">严重程度</div>
                  <div className={`text-sm font-semibold ${severityConfig[showDetail.severity]?.text}`}>
                    {severityConfig[showDetail.severity]?.label}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-page-bg border border-border-color">
                  <div className="text-[10px] text-text-muted mb-0.5">处理状态</div>
                  <div className={`flex items-center gap-1.5 text-sm font-semibold ${statusConfig[showDetail.status]?.color || 'text-gray-400'}`}>
                    {React.createElement(statusConfig[showDetail.status]?.icon || Bell, { className: 'w-4 h-4' })}
                    {statusConfig[showDetail.status]?.label || showDetail.status}
                  </div>
                </div>
              </div>

              {/* 核心信息区 */}
              <div className="flex-shrink-0 px-6 py-3 border-b border-border-color/50">
                {/* 通用信息 */}
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {[
                    { label: '安全产品', value: showDetail.sourceProduct || showDetail.source, color: 'cyan' },
                    { label: '分类', value: showDetail.category, color: 'amber' },
                    { label: '告警时间', value: showDetail.firstSeen ? new Date(showDetail.firstSeen).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : '-', color: 'gray' },
                    { label: '主机', value: showDetail.hostname, color: 'orange' },
                  ].map(item => (
                    <div key={item.label} className="px-2 py-1.5 bg-page-bg border border-border-color rounded-lg text-center">
                      <div className="text-[10px] text-text-muted mb-0.5">{item.label}</div>
                      <div className="text-xs font-medium text-text-primary truncate">{item.value || '-'}</div>
                    </div>
                  ))}
                </div>
                {/* 网络信息（仅网络类告警显示） */}
                {(showDetail.srcIp || showDetail.dstIp || showDetail.protocol) && (
                  <div className="grid grid-cols-5 gap-2">
                    {[
                      { label: '源地址', value: showDetail.srcIp, color: 'rose' },
                      { label: '源端口', value: showDetail.srcPort, color: 'rose' },
                      { label: '目的地址', value: showDetail.dstIp, color: 'blue' },
                      { label: '目的端口', value: showDetail.dstPort, color: 'blue' },
                      { label: '协议', value: showDetail.protocol, color: 'emerald' },
                    ].map(item => (
                      <div key={item.label} className={`px-2 py-1.5 bg-${item.color}-500/10 border border-${item.color}-500/20 rounded-lg text-center`}>
                        <div className={`text-[10px] text-${item.color}-400/70 mb-0.5`}>{item.label}</div>
                        <div className={`text-xs font-mono text-${item.color}-300 truncate`}>{item.value || '-'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tab 切换 */}
              <div className="flex-shrink-0 flex gap-1 px-6 pt-2 border-b border-border-color">
                {[
                  { key: 'fields', label: '字段浏览器', icon: Hash },
                  { key: 'raw', label: '原始日志', icon: FileJson },
                  { key: 'related', label: '邻接消息', icon: GitBranch },
                ].map(tab => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setDetailTab(tab.key as any)}
                      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                        detailTab === tab.key
                          ? 'border-primary text-primary'
                          : 'border-transparent text-text-muted hover:text-text-secondary'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {tab.label}
                      {tab.key === 'related' && relatedAlerts.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[10px]">{relatedAlerts.length}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Tab 内容 */}
              <div className="flex-1 overflow-y-auto">
                {detailTab === 'fields' && (
                  <FieldBrowser data={showDetail} onSearchField={handleSearchField} className="h-full" />
                )}

                {detailTab === 'raw' && (
                  <div className="p-4">
                    <RawLogViewer rawLog={showDetail.rawLog} extraData={showDetail.extraData || showDetail.parsedData} />
                  </div>
                )}

                {detailTab === 'related' && (
                  <div className="p-4">
                    {relatedLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-5 h-5 text-text-muted animate-spin" />
                      </div>
                    ) : relatedAlerts.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-text-muted text-sm">
                        <GitBranch className="w-8 h-8 mb-2 opacity-30" />
                        <span>暂无相关消息</span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-xs text-text-muted mb-3">
                          找到 <span className="text-text-secondary font-medium">{relatedAlerts.length}</span> 条相关消息（同 IP / 同类别 / 前后 1h）
                        </div>
                        {relatedAlerts.map((ra: any) => (
                          <div
                            key={ra.id || ra._id}
                            onClick={() => {
                              setShowDetail(ra as Alert);
                              setDetailTab('fields');
                              setRelatedAlerts([]);
                            }}
                            className="p-3 bg-page-bg border border-border-color rounded-xl hover:border-primary/30 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-text-primary truncate">{ra.title || ra.alert_code || ra.id}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${severityConfig[(ra.severity as Severity)]?.bg} ${severityConfig[(ra.severity as Severity)]?.text}`}>
                                {severityConfig[(ra.severity as Severity)]?.label || ra.severity}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-text-muted">
                              <span className="font-mono">{ra.src_ip || ra.srcIp || '-'}</span>
                              <span>{ra.source || '-'}</span>
                              <span>{formatTime(ra.first_seen || ra.firstSeen || '')}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 抽屉底部操作栏 */}
              <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-t border-border-color bg-card-bg/95 backdrop-blur">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleStatusChange(showDetail.id, 'closed')}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 transition-colors"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    关闭告警
                  </button>
                  <button
                    onClick={() => handleStatusChange(showDetail.id, 'false_positive')}
                    className="flex items-center gap-1.5 px-3 py-2 bg-gray-600 text-white text-xs rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    标记误报
                  </button>
                </div>
                <button
                  onClick={() => handleCreateEventFromDetail(showDetail)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-xs rounded-lg hover:bg-primary-hover transition-colors"
                >
                  <Zap className="w-3.5 h-3.5" />
                  生成事件
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========== 聚合事件弹窗 ========== */}
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
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center">
                  <Layers className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-text-primary">聚合生成事件</h3>
                  <p className="text-sm text-text-muted">将 {selectedIds.size} 条告警聚合为安全事件</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-2">事件标题 <span className="text-rose-400">*</span></label>
                  <input
                    type="text"
                    value={aggregateForm.title}
                    onChange={e => setAggregateForm({ ...aggregateForm, title: e.target.value })}
                    className="w-full px-4 py-3 bg-page-bg border border-border-color rounded-xl text-text-primary focus:border-primary focus:outline-none"
                    placeholder="输入事件标题"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-text-secondary mb-2">严重程度</label>
                    <select
                      value={aggregateForm.severity}
                      onChange={e => setAggregateForm({ ...aggregateForm, severity: e.target.value as Severity })}
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
                      onChange={e => setAggregateForm({ ...aggregateForm, category: e.target.value })}
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
                    onChange={e => setAggregateForm({ ...aggregateForm, description: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-3 bg-page-bg border border-border-color rounded-xl text-text-primary font-mono text-xs focus:border-primary focus:outline-none resize-none"
                    placeholder="描述事件详情..."
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowAggregateModal(false)} className="flex-1 py-3 bg-page-bg text-text-secondary rounded-xl hover:bg-white/5 transition-colors">取消</button>
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
