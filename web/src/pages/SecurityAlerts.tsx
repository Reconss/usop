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
  User, Building2, MapPin, Timer, TrendingUp, Cpu, Database, Cloud, Clock, Brain, ShieldCheck
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { alertsApi, aiJudgmentApi, resourcesApi } from '../services/api';

// 新组件
import SearchBar from '../components/SearchBar';
import TimeRangeSelector, { TimeRange } from '../components/TimeRangeSelector';
import QuickValuesPanel from '../components/QuickValuesPanel';
import MessageTable from '../components/MessageTable';
import FieldBrowser from '../components/FieldBrowser';
import { Button, PageHeader } from '../components/ui';

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
  sourceType?: string;
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
  critical: { color: 'bg-danger-solid', text: 'text-danger', bg: 'bg-danger/10', border: 'border-danger/30', label: '危急', gradient: 'from-danger/20 to-danger/5' },
  high: { color: 'bg-warning-solid', text: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/30', label: '高危', gradient: 'from-warning/20 to-warning/5' },
  medium: { color: 'bg-warning-solid', text: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/30', label: '中危', gradient: 'from-warning/20 to-warning/5' },
  low: { color: 'bg-primary-solid', text: 'text-info', bg: 'bg-info/10', border: 'border-info/30', label: '低危', gradient: 'from-info/20 to-info/5' },
};

const statusConfig: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  new: { icon: Bell, color: 'text-info', bg: 'bg-info/10', label: '新告警' },
  investigating: { icon: Clock3, color: 'text-warning', bg: 'bg-warning/10', label: '调查中' },
  closed: { icon: CheckCircle, color: 'text-success', bg: 'bg-success/10', label: '已关闭' },
  false_positive: { icon: XCircle, color: 'text-text-muted', bg: 'bg-surface-3', label: '误报' },
  active: { icon: Clock3, color: 'text-warning', bg: 'bg-warning/10', label: '调查中' },
  acknowledged: { icon: Eye, color: 'text-info', bg: 'bg-info/10', label: '已确认' },
  open: { icon: Bell, color: 'text-info', bg: 'bg-info/10', label: '待处置' },
  resolved: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', label: '已解决' },
};

const productIcons: Record<string, { icon: React.ElementType; color: string }> = {
  'WAF': { icon: Shield, color: 'text-accent' },
  'IDS': { icon: AlertOctagon, color: 'text-danger' },
  'IPS': { icon: ShieldAlert, color: 'text-warning' },
  'EDR': { icon: Bug, color: 'text-success' },
  'Firewall': { icon: Shield, color: 'text-info' },
  'SIEM': { icon: Activity, color: 'text-info' },
  'HIDS': { icon: Server, color: 'text-warning' },
  'NIDS': { icon: Network, color: 'text-danger' },
  'SOC': { icon: Terminal, color: 'text-accent' },
  'CloudTrail': { icon: Cloud, color: 'text-success' },
  'default': { icon: AlertTriangle, color: 'text-text-muted' },
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

const RawLogViewer = ({ rawLog, extraData, fullRecord }: {
  rawLog?: string;
  extraData?: Record<string, any>;
  fullRecord?: Record<string, any>;
}) => {
  const [tab, setTab] = useState<'raw' | 'parsed'>('raw');
  const [copied, setCopied] = useState(false);
  const hasParsed = extraData && Object.keys(extraData).length > 0;

  // 原始日志优先用平台落库的 raw_log；否则直接展示从 ES 取回的整条文档，避免显示"无原始日志"。
  const rawContent = rawLog || (fullRecord ? JSON.stringify(fullRecord, null, 2) : '');

  const handleCopy = () => {
    const content = tab === 'raw' ? rawContent : JSON.stringify(extraData, null, 2);
    navigator.clipboard.writeText(content || '').catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-border-color rounded-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-page-bg/80 border-b border-border-color">
        <div className="flex gap-1">
          <button onClick={() => setTab('raw')} className={`px-3 py-1 text-xs rounded-md ${tab === 'raw' ? 'bg-primary/15 text-primary' : 'text-text-muted hover:text-text-secondary'}`}>原始日志</button>
          {hasParsed && <button onClick={() => setTab('parsed')} className={`px-3 py-1 text-xs rounded-md ${tab === 'parsed' ? 'bg-primary/15 text-primary' : 'text-text-muted hover:text-text-secondary'}`}>解析数据</button>}
        </div>
        <button onClick={handleCopy} className="flex items-center gap-1 px-2 py-1 text-xs text-text-muted hover:text-primary rounded transition-colors">
          {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="p-4 text-xs text-text-secondary font-mono overflow-auto max-h-[300px] whitespace-pre-wrap break-all bg-page-bg/50">
        {tab === 'raw' ? (rawContent || '无原始日志') : JSON.stringify(extraData, null, 2)}
      </pre>
    </div>
  );
};

// ==================== EFF 借鉴：研判协作展示型组件 ====================

const VERDICT_BADGE: Record<string, { bg: string; text: string }> = {
  true_attack: { bg: 'bg-danger/15', text: 'text-danger' },
  false_positive: { bg: 'bg-surface-3', text: 'text-text-muted' },
  suspicious: { bg: 'bg-warning/15', text: 'text-warning' },
  info: { bg: 'bg-info/15', text: 'text-info' },
};

/** 结构化研判卡片（证据包 + 互斥标签 + 风险等级 + 结论 + 证据链 + 处置建议） */
function AlertAnalysisCard({ analysis }: { analysis: any }) {
  if (!analysis) return null;
  const badge = VERDICT_BADGE[analysis.verdict] || VERDICT_BADGE.suspicious;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${badge.bg} ${badge.text}`}>
          {analysis.verdict_label || analysis.verdict}
        </span>
        {analysis.risk_level && (
          <span className="px-2 py-0.5 rounded bg-white/10 text-xs text-text-secondary">风险: {analysis.risk_level}</span>
        )}
        <span className="px-2 py-0.5 rounded bg-white/10 text-xs text-text-secondary">
          置信度: {Math.round((analysis.confidence || 0) * 100)}%
        </span>
        {analysis.is_ai ? (
          <span className="px-2 py-0.5 rounded bg-primary/15 text-primary text-xs">AI 研判</span>
        ) : (
          <span className="px-2 py-0.5 rounded bg-white/10 text-xs text-text-muted">规则兜底</span>
        )}
      </div>
      {analysis.conclusion && (
        <div className="text-sm text-text-primary leading-relaxed">{analysis.conclusion}</div>
      )}
      {Array.isArray(analysis.evidence) && analysis.evidence.length > 0 && (
        <div>
          <div className="text-xs text-text-muted mb-1">证据链</div>
          <ul className="space-y-1.5">
            {analysis.evidence.map((e: any, i: number) => (
              <li key={i} className="text-xs text-text-secondary bg-page-bg rounded p-2">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-text-primary">{e.source}</span>
                  <span className="text-warning">置信度 {Math.round((e.confidence || 0) * 100)}%</span>
                </div>
                <div>{e.detail}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {analysis.suggested_action && (
        <div className="text-xs">
          <span className="text-text-muted">处置建议: </span>
          <span className="text-text-primary">{analysis.suggested_action}</span>
        </div>
      )}
      {analysis.analyzed_at && (
        <div className="text-xs text-text-muted">
          研判时间: {new Date(analysis.analyzed_at).toLocaleString('zh-CN')}
        </div>
      )}
    </div>
  );
}

/** IP 名单命中卡片（黑/白名单状态，数据来自 ip_lists.test） */
function IpReputationCard({ srcHit, dstHit, srcIp, dstIp }: { srcHit: any; dstHit: any; srcIp?: string; dstIp?: string }) {
  const renderOne = (label: string, ip: string | undefined, hit: any) => {
    if (!ip) return null;
    const hits: any[] = hit?.hits || [];
    const black = hits.find((h: any) => h.usage === 'blacklist');
    const white = hits.find((h: any) => h.usage === 'whitelist');
    const other = hits.find((h: any) => h.usage !== 'blacklist' && h.usage !== 'whitelist');
    let badge: { bg: string; text: string; label: string };
    let desc: string;
    if (black) {
      badge = { bg: 'bg-danger/15', text: 'text-danger', label: '黑名单' };
      desc = `命中封禁组：${black.groupName}${hits.length > 1 ? ` 等 ${hits.length} 组` : ''}`;
    } else if (white) {
      badge = { bg: 'bg-success/15', text: 'text-success', label: '白名单' };
      desc = `命中放行组：${white.groupName}${hits.length > 1 ? ` 等 ${hits.length} 组` : ''}`;
    } else if (other) {
      badge = { bg: 'bg-info/15', text: 'text-info', label: '资源组' };
      desc = `命中资源组：${other.groupName}`;
    } else {
      badge = { bg: 'bg-surface-3', text: 'text-text-muted', label: '未收录' };
      desc = '不在任何 IP 组';
    }
    return (
      <div className="flex items-center justify-between p-3 bg-page-bg rounded-lg">
        <div>
          <div className="text-xs text-text-muted">{label}</div>
          <div className="font-mono text-sm text-text-primary">{ip}</div>
        </div>
        <div className="text-right">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${badge.bg} ${badge.text}`}>{badge.label}</span>
          <div className="text-xs text-text-muted mt-1">{desc}</div>
        </div>
      </div>
    );
  };
  return (
    <section>
      <h4 className="text-sm font-medium text-text-secondary mb-3 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4" /> IP 组命中
      </h4>
      <div className="space-y-2">
        {renderOne('源 IP', srcIp, srcHit)}
        {renderOne('目标 IP', dstIp, dstHit)}
      </div>
    </section>
  );
}

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
  // 从 ES 取回的整条告警文档（用于「原始日志」标签完整展示，避免 raw_log 缺失时显示空白）
  const [detailFullRecord, setDetailFullRecord] = useState<Record<string, any> | null>(null);
  const [detailTab, setDetailTab] = useState<'fields' | 'raw' | 'related' | 'collab'>('fields');
  const [relatedAlerts, setRelatedAlerts] = useState<Record<string, any>[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);

  // ---- EFF 借鉴：协作研判（结构化研判 / IP 名单命中） ----
  const [ipHits, setIpHits] = useState<{ src?: any; dst?: any }>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [batchAnalyzing, setBatchAnalyzing] = useState(false);

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
        sourceType: a.source_type || a.sourceType || '',
        srcIp: a.src_ip || a.srcIp || '',
        srcPort: a.src_port || a.srcPort,
        dstIp: a.dst_ip || a.dstIp || '',
        dstPort: a.dst_port || a.dstPort,
        protocol: a.protocol,
        hostname: a.hostname || '',
        category: a.category || '',
        tags: a.tags || [],
        eventIds: a.event_ids || a.eventIds || [],
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
    // 拉取 ES 整条文档，供「原始日志」标签完整展示（raw_log 缺失时兜底）
    setDetailFullRecord(null);
    alertsApi.getAlert(row.id).then((resp: any) => {
      if (resp && resp.success && resp.data) {
        setDetailFullRecord(resp.data);
      }
    }).catch(() => { /* 取失败则维持字段浏览器展示 */ });
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

  // ==================== EFF 借鉴：协作研判（结构化研判 / IP 命中） ====================
  const loadCollab = useCallback(async (srcIp?: string, dstIp?: string) => {
    const testOne = async (ip?: string): Promise<any> => {
      if (!ip) return null;
      try {
        const r: any = await resourcesApi.testIpGroups(ip);
        return r?.data || null;
      } catch {
        return null;
      }
    };
    const [srcHit, dstHit] = await Promise.all([testOne(srcIp), testOne(dstIp)]);
    setIpHits({ src: srcHit, dst: dstHit });
  }, []);

  useEffect(() => {
    if (showDetail?.id) {
      loadCollab(showDetail.srcIp, showDetail.dstIp);
    }
  }, [showDetail?.id, loadCollab]);

  const handleAnalyze = useCallback(async (alertId: string) => {
    setAnalyzing(true);
    try {
      const res: any = await aiJudgmentApi.analyze(alertId);
      if (res?.success && res.data) {
        setShowDetail(prev => prev ? { ...prev, extraData: { ...(prev.extraData || {}), structured_analysis: res.data } } : null);
        showToast('研判完成', 'success');
      } else {
        showToast(res?.error || '研判失败', 'error');
      }
    } catch (e: any) { showToast(e?.message || '研判失败', 'error'); }
    finally { setAnalyzing(false); }
  }, [showToast]);

  // ---- 批量研判（优先研判选中的告警；未选中则研判最近未闭环告警）----
  const handleBatchAnalyze = useCallback(async () => {
    setBatchAnalyzing(true);
    try {
      const alertIds = selectedIds.size > 0 ? Array.from(selectedIds).map(String) : undefined;
      const res: any = await aiJudgmentApi.analyzeBatch(20, alertIds);
      if (res?.success) {
        const n = res.data?.analyzed ?? 0;
        const scope = alertIds ? `选中的 ${alertIds.length} 条中` : '';
        showToast(
          `已完成 ${scope}${n} 条告警的批量研判` +
          (res.data?.events_created ? `，创建事件 ${res.data.events_created} 个` : '')
        );
        fetchAlerts();
        if (alertIds) setSelectedIds(new Set());
      } else {
        showToast(res?.error || '批量研判失败', 'error');
      }
    } catch (e: any) {
      showToast(e?.message || '批量研判失败', 'error');
    } finally {
      setBatchAnalyzing(false);
    }
  }, [selectedIds, showToast, fetchAlerts]);

  // ---- 搜索字段（FieldBrowser 回调）----
  const handleSearchField = useCallback((field: string, value: string) => {
    const clause = `${field}:"${value}"`;
    setQueryString(prev => prev ? `${prev} AND ${clause}` : clause);
    setShowDetail(null);
    setDetailFullRecord(null);
    setCurrentPage(1);
  }, []);

  // ---- 状态变更 ----
  const handleStatusChange = useCallback(async (alertId: string, status: string) => {
    try {
      await alertsApi.updateAlertStatus(alertId, status);
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
    setDetailFullRecord(null);
  }, []);

  const handleAggregate = useCallback(async () => {
    if (!aggregateForm.title.trim() || selectedIds.size === 0) return;
    try {
      await alertsApi.aggregateAlerts({
        alert_ids: Array.from(selectedIds).map(String),
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
  const handleExport = useCallback(async () => {
    try {
      const params: any = {};
      if (timeRange.start) params.start_time = timeRange.start;
      if (timeRange.end) params.end_time = timeRange.end;
      const resp = await alertsApi.exportAlertsBlob(params);
      if (!resp.ok) {
        showToast('导出失败', 'error');
        return;
      }
      const blob = await resp.blob();
      const cd = resp.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename\*?=(?:UTF-8'')?([^;]+)/i);
      const filename = m ? decodeURIComponent(m[1].replace(/["']/g, '')) : 'alerts_export.csv';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('导出成功', 'success');
    } catch (e) {
      showToast('导出失败', 'error');
    }
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
            className={`fixed right-4 top-16 z-toast flex items-center gap-2 rounded-card border px-3.5 py-2.5 text-[12.5px] shadow-panel ${
              toast.type === 'success'
                ? 'border-success/30 bg-success/10 text-success'
                : 'border-danger/30 bg-danger/10 text-danger'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            <span className="font-medium">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========== 顶部搜索区（两行紧凑布局） ========== */}
      <div className="flex-shrink-0 space-y-2 px-6 pt-3 pb-2">
        {/* 行1：页头 + 操作按钮 */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <PageHeader
            icon={Bell}
            title="安全告警"          meta={
              <span className="text-[11px] text-text-muted num">
                命中 {totalAlerts} 条{typeof tookMs === 'number' ? ` · ${tookMs} ms` : ''}
              </span>
            }
          />
          <div className="flex items-center gap-2 flex-wrap">
            {selectedIds.size > 0 && (
              <Button size="sm" variant="primary" icon={Zap} onClick={() => setShowAggregateModal(true)}>
                聚合事件 ({selectedIds.size})
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              icon={Brain}
              loading={batchAnalyzing}
              onClick={handleBatchAnalyze}
              title="优先研判列表勾选的告警；未勾选时研判最近未闭环告警。结论为真实攻击且高危将自动创建事件并闭环，误报自动标记"
            >
              批量研判
            </Button>
            <Button size="sm" variant="secondary" icon={Download} onClick={handleExport}>
              导出
            </Button>
            <Button
              size="sm"
              variant={showQuickValues ? 'soft' : 'secondary'}
              icon={BarChart3}
              onClick={() => setShowQuickValues(!showQuickValues)}
              title={showQuickValues ? '隐藏字段分布' : '显示字段分布'}
            >
              {showQuickValues ? '隐藏面板' : '显示面板'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={RefreshCw}
              loading={isLoading}
              onClick={() => { fetchAlerts(); fetchHistogram(); }}
            >
              刷新
            </Button>
          </div>
        </div>

        {/* 行2：搜索栏 + 时间范围 */}
        <div className="flex items-start gap-2">
          <SearchBar
            className="flex-1 min-w-0"
            value={queryString}
            onChange={setQueryString}
            onSearch={handleSearch}
            loading={isLoading}
            savedSearches={savedSearches as any[]}
            onSaveSearch={handleSaveSearch}
            onLoadSearch={handleLoadSearch}
            onDeleteSearch={handleDeleteSearch}
          />
          <TimeRangeSelector
            className="flex-shrink-0"
            value={timeRange}
            onChange={handleTimeRangeChange}
            enableAutoRefresh
            autoRefreshEnabled={autoRefresh}
            onAutoRefreshChange={setAutoRefresh}
          />
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
        <div className="flex-1 min-w-0 bg-card-bg border border-border-color rounded-card overflow-hidden">
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
            className="overlay z-overlay motion-owned"
            onClick={() => setShowDetail(null)}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="drawer-panel motion-owned absolute right-0 top-0 bottom-0 w-full max-w-2xl flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              {/* 抽屉头部 */}
              <div className="flex-shrink-0 flex items-center justify-between px-6 py-3.5 border-b border-border-color bg-surface-2">
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold text-text-primary truncate">{showDetail.title}</h2>
                  <p className="text-xs text-text-muted font-mono">{showDetail.alertCode || showDetail.id}</p>
                </div>
                <button
                  onClick={() => setShowDetail(null)}
                  aria-label="关闭"
                  className="ml-3 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-3 hover:text-text-primary"
                >
                  <X size={16} />
                </button>
              </div>

              {/* 状态栏 */}
              <div className="flex-shrink-0 grid grid-cols-2 gap-3 px-6 py-3 border-b border-border-color/50">
                <div className={`rounded-card border p-3 ${severityConfig[showDetail.severity]?.bg} ${severityConfig[showDetail.severity]?.border}`}>
                  <div className="text-[10px] text-text-muted mb-0.5">严重程度</div>
                  <div className={`text-sm font-semibold ${severityConfig[showDetail.severity]?.text}`}>
                    {severityConfig[showDetail.severity]?.label}
                  </div>
                </div>
                <div className="rounded-card border border-border-color bg-surface-2 p-3">
                  <div className="text-[10px] text-text-muted mb-0.5">处理状态</div>
                  <div className={`flex items-center gap-1.5 text-sm font-semibold ${statusConfig[showDetail.status]?.color || 'text-text-muted'}`}>
                    {React.createElement(statusConfig[showDetail.status]?.icon || Bell, { className: 'w-4 h-4' })}
                    {statusConfig[showDetail.status]?.label || showDetail.status}
                  </div>
                  {(showDetail.eventIds?.length || 0) > 0 && (
                    <div className="text-[10px] text-info mt-1 truncate" title={`已关联事件：${showDetail.eventIds.join('、')}`}>
                      已转事件：{showDetail.eventIds.join('、')}
                    </div>
                  )}
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
                    <div key={item.label} className="rounded-input border border-border-color bg-surface-2 px-2 py-1.5 text-center">
                      <div className="text-[10px] text-text-muted mb-0.5">{item.label}</div>
                      <div className="text-xs font-medium text-text-primary truncate">{item.value || '-'}</div>
                    </div>
                  ))}
                </div>
                {/* 网络信息（网络类=源/目的地址；主机类=涉及主机，避免把受控主机当攻击源显示） */}
                {(showDetail.srcIp || showDetail.dstIp || showDetail.protocol) && (() => {
                  const isHostType = ['host', 'endpoint'].includes(showDetail.sourceType || '');
                  const items = isHostType
                    ? [
                        // 历史数据里本机 IP 存在 srcIp，新数据在 dstIp——任一取到即涉及主机
                        { label: '涉及主机', value: showDetail.dstIp || showDetail.srcIp, tone: 'amber' },
                        // 真实的远程来源（如 Wazuh srcip）与主机 IP 不同时才单独展示
                        ...(showDetail.srcIp && showDetail.srcIp !== (showDetail.dstIp || showDetail.srcIp)
                          ? [{ label: '来源地址', value: showDetail.srcIp, tone: 'danger' }]
                          : []),
                        ...(showDetail.protocol ? [{ label: '协议', value: showDetail.protocol, tone: 'success' }] : []),
                      ]
                    : [
                        { label: '源地址', value: showDetail.srcIp, tone: 'danger' },
                        { label: '源端口', value: showDetail.srcPort, tone: 'danger' },
                        { label: '目的地址', value: showDetail.dstIp, tone: 'info' },
                        { label: '目的端口', value: showDetail.dstPort, tone: 'info' },
                        { label: '协议', value: showDetail.protocol, tone: 'success' },
                      ];
                  const toneCls: Record<string, string> = {
                    danger: 'rounded-input border border-danger/25 bg-danger/10 px-2 py-1.5 text-center',
                    info: 'rounded-input border border-info/25 bg-info/10 px-2 py-1.5 text-center',
                    success: 'rounded-input border border-success/25 bg-success/10 px-2 py-1.5 text-center',
                    amber: 'rounded-input border border-warning/25 bg-warning/10 px-2 py-1.5 text-center',
                  };
                  const gridCls: Record<number, string> = {
                    1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3',
                    4: 'grid-cols-4', 5: 'grid-cols-5',
                  };
                  return (
                    <div className={`grid gap-2 ${gridCls[items.length] || 'grid-cols-5'}`}>
                      {items.map(item => (
                        <div key={item.label} className={toneCls[item.tone] || toneCls.info}>
                          <div className="mb-0.5 text-[10px] text-text-muted">{item.label}</div>
                          <div className="truncate font-mono text-[11.5px] text-text-primary">{item.value || '-'}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Tab 切换 */}
              <div className="flex-shrink-0 flex gap-1 px-6 pt-2 border-b border-border-color">
                {([
                  { key: 'fields', label: '字段浏览器', icon: Hash },
                  { key: 'raw', label: '原始日志', icon: FileJson },
                  { key: 'related', label: '邻接消息', icon: GitBranch },
                  { key: 'collab', label: '研判协作', icon: ShieldAlert },
                ] as const).map(tab => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setDetailTab(tab.key as any)}
                      className={`tab-line-item ${detailTab === tab.key ? 'is-active' : ''}`}
                    >
                      <Icon size={13} />
                      {tab.label}
                      {tab.key === 'related' && relatedAlerts.length > 0 && (
                        <span className="rounded-pill bg-primary/15 px-1.5 text-[10px] text-primary num">{relatedAlerts.length}</span>
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
                    <RawLogViewer rawLog={showDetail.rawLog} extraData={showDetail.extraData || showDetail.parsedData} fullRecord={detailFullRecord || showDetail} />
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
                            className="p-3 bg-page-bg border border-border-color rounded-card hover:border-primary/30 cursor-pointer transition-colors"
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

                {/* 研判协作 Tab 内容 */}
                {detailTab === 'collab' && (
                  <div className="p-4 space-y-5">
                    {/* 结构化研判 */}
                    <section>
                      <h4 className="text-sm font-medium text-text-secondary mb-3 flex items-center gap-2">
                        <Brain className="w-4 h-4" /> 结构化研判
                      </h4>
                      <div className="rounded-card border border-border-color bg-surface-2 p-4">
                        {showDetail.extraData?.structured_analysis ? (
                          <AlertAnalysisCard analysis={showDetail.extraData.structured_analysis} />
                        ) : (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-text-muted">尚未进行结构化研判</span>
                            <Button size="sm" variant="primary" icon={Brain} loading={analyzing} onClick={() => handleAnalyze(String(showDetail.id))}>
                              开始研判
                            </Button>
                          </div>
                        )}
                        {showDetail.extraData?.structured_analysis && (
                          <Button size="sm" variant="secondary" icon={RefreshCw} loading={analyzing} className="mt-3" onClick={() => handleAnalyze(String(showDetail.id))}>
                            重新研判
                          </Button>
                        )}
                      </div>
                    </section>

                    {/* IP 名单命中 */}
                    <IpReputationCard srcHit={ipHits.src} dstHit={ipHits.dst} srcIp={showDetail.srcIp} dstIp={showDetail.dstIp} />
                  </div>
                )}

              </div>

              {/* 抽屉底部操作栏 */}
              <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-t border-border-color bg-surface-2">
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="primary" icon={CheckCircle} onClick={() => handleStatusChange(showDetail.id, 'closed')}>
                    关闭告警
                  </Button>
                  <Button size="sm" variant="secondary" icon={EyeOff} onClick={() => handleStatusChange(showDetail.id, 'false_positive')}>
                    标记误报
                  </Button>
                </div>
                <Button size="sm" variant="primary" icon={Zap} onClick={() => handleCreateEventFromDetail(showDetail)}>
                  生成事件
                </Button>
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
            className="overlay z-overlay motion-owned flex items-center justify-center p-4"
            onClick={() => setShowAggregateModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="modal-panel motion-owned w-full max-w-lg p-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-accent/10 rounded-card flex items-center justify-center">
                  <Layers className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-text-primary">聚合生成事件</h3>
                  <p className="text-sm text-text-muted">将 {selectedIds.size} 条告警聚合为安全事件</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-2">事件标题 <span className="text-danger">*</span></label>
                  <input
                    type="text"
                    value={aggregateForm.title}
                    onChange={e => setAggregateForm({ ...aggregateForm, title: e.target.value })}
                    className="app-input"
                    placeholder="输入事件标题"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-text-secondary mb-2">严重程度</label>
                    <select
                      value={aggregateForm.severity}
                      onChange={e => setAggregateForm({ ...aggregateForm, severity: e.target.value as Severity })}
                      className="app-select"
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
                      className="app-select"
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
                    className="app-textarea font-mono text-[12px]"
                    placeholder="留空则按所选告警自动生成：时间跨度、源/目的 IP、严重级别分布、告警构成与明细"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <Button variant="secondary" block onClick={() => setShowAggregateModal(false)}>取消</Button>
                <Button variant="primary" block icon={Zap} disabled={!aggregateForm.title.trim()} onClick={handleAggregate}>
                  生成事件
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
