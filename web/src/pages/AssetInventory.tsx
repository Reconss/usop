/**
 * 资产清单（参考 TestNet 资产管理系统的攻击面视角重构）
 * - 攻击面总览：真实统计（资产/风险/开放端口/未修复漏洞/Web暴露/子域名），GET /assets/stats
 * - 攻击面拓扑：ECharts 力导向图（资产-开放端口服务），GET /assets/topology
 * - 多维检索：服务端搜索（名称/IP/域名/主机名）+ 类型/状态/风险档筛选 + 分页
 * - 全真实 CRUD：创建/编辑/删除/批量删除（metadata 承载责任人/部门/位置/描述）
 * - 批量扫描：真实创建+启动扫描任务，完成后可同步结果入资产库
 * - 扫描历史：读真实 ScanTask（target 匹配资产 或 last_scan_id 命中）
 */
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import {
  Filter, Plus, Download, Scan, Globe, Server, Shield, Tag, Clock,
  Edit2, Trash2, Eye, FileText, Activity, Boxes, AlertCircle,
  CheckCircle2, RefreshCw, Bug, Network, X,
} from 'lucide-react';
import type { Asset } from '../types';
import { assetsApi, scansApi } from '../services/api';
import { useChartTokens, riskToken } from '../styles/chartTheme';
import { ConfirmDialog, useConfirmDialog } from '../components/Dialogs';
import {
  Button,
  ContentContainer,
  EmptyState,
  Field,
  InfoList,
  LoadingState,
  Modal,
  PageHeader,
  SectionCard,
  SeverityBadge,
  StateBadge,
  StatusBadge,
  TableWrap,
  SearchInput,
} from '../components/ui';

/* ── 风险评分环：分数 → 语义严重级别色 ── */
const RiskRing = ({ score, assessedScore }: { score: number; assessedScore?: number }) => {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const displayScore = assessedScore ?? score;
  const strokeDashoffset = circumference - (displayScore / 100) * circumference;
  const tone =
    displayScore >= 80 ? 'text-critical'
      : displayScore >= 60 ? 'text-high'
        : displayScore >= 40 ? 'text-medium'
          : 'text-success';
  return (
    <div className="relative flex h-10 w-10 items-center justify-center group">
      <svg className="h-10 w-10 -rotate-90">
        <circle
          cx="20" cy="20" r={radius} fill="none"
          stroke="currentColor" strokeWidth="3"
          className="text-border-color"
        />
        <circle
          cx="20" cy="20" r={radius} fill="none"
          stroke="currentColor" strokeWidth="3"
          strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className={`${tone} transition-all duration-500`}
        />
      </svg>
      <span className={`absolute text-xs font-semibold num ${tone}`}>{displayScore}</span>
      {assessedScore !== undefined && assessedScore !== score && (
        <div className="pointer-events-none absolute -top-8 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded border border-border-color bg-surface-3 px-2 py-1 text-[11px] text-text-primary opacity-0 transition-opacity group-hover:opacity-100">
          原始: {score} | 测评: {assessedScore}
        </div>
      )}
    </div>
  );
};

/* ── 漏洞数量分布（表格内紧凑展示） ── */
const VulnStatsBadge = ({
  stats,
}: {
  stats?: { critical: number; high: number; medium: number; low: number; total: number };
}) => {
  if (!stats || stats.total === 0) return <span className="text-[11px] text-text-muted">-</span>;
  return (
    <div className="flex items-center gap-1">
      {stats.critical > 0 && <StatusBadge tone="critical">{stats.critical}</StatusBadge>}
      {stats.high > 0 && <StatusBadge tone="high">{stats.high}</StatusBadge>}
      {stats.medium > 0 && <StatusBadge tone="medium">{stats.medium}</StatusBadge>}
      {stats.low > 0 && <StatusBadge tone="low">{stats.low}</StatusBadge>}
      <span className="ml-1 text-[11px] text-text-muted num">共{stats.total}</span>
    </div>
  );
};

const VULN_STATUS_LABEL: Record<string, string> = {
  open: '未修复',
  fixed: '已修复',
  in_progress: '修复中',
  ignored: '已忽略',
};

/* 类型映射覆盖后端真实取值（ip/domain/service/host/server/web/webapp/container/database/network） */
const ASSET_TYPE_LABEL: Record<string, string> = {
  ip: 'IP地址', domain: '域名', service: '服务', host: '主机',
  server: '服务器', web: 'Web站点', webapp: 'Web应用',
  container: '容器', database: '数据库', network: '网络设备',
};
const ASSET_TYPES = Object.entries(ASSET_TYPE_LABEL).map(([value, label]) => ({ value, label }));

const assetIcon = (type: string) => {
  if (type === 'domain') return Globe;
  if (type === 'ip') return Server;
  if (type === 'network') return Network;
  return Shield;
};
const typeLabel = (type: string) => ASSET_TYPE_LABEL[type] || type || '-';

const STATUS_LABEL: Record<string, string> = {
  online: '在线', offline: '离线', pending: '待验证', verified: '已验证',
};

const RISK_FILTERS = [
  { value: '', label: '全部风险' },
  { value: 'critical', label: '高风险 (≥80)' },
  { value: 'high', label: '中高风险 (60-79)' },
  { value: 'medium', label: '中风险 (40-59)' },
  { value: 'low', label: '低风险 (<40)' },
] as const;
const RISK_RANGE: Record<string, { min?: number; max?: number }> = {
  critical: { min: 80 },
  high: { min: 60, max: 79 },
  medium: { min: 40, max: 59 },
  low: { min: 0, max: 39 },
};

const SCAN_TYPE_LABEL: Record<string, string> = {
  port: '端口扫描', web: 'Web探测', subdomain: '子域名收集', vuln: '漏洞扫描',
  naabu: '端口扫描', masscan: '端口扫描', httpx: 'Web探测', nuclei: '漏洞扫描', dns: '子域名收集',
};
const SCAN_TASK_STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'info' | 'danger' | 'muted' }> = {
  running: { label: '运行中', tone: 'warning' },
  queued: { label: '排队中', tone: 'info' },
  completed: { label: '已完成', tone: 'success' },
  done: { label: '已完成', tone: 'success' },
  paused: { label: '已暂停', tone: 'neutral' },
  failed: { label: '失败', tone: 'danger' },
};

/* ── 攻击面统计卡 ── */
interface AssetStats {
  total: number;
  by_type: Record<string, number>;
  by_status: Record<string, number>;
  risk_distribution: { critical: number; high: number; medium: number; low: number };
  open_ports: number;
  open_vulns: number;
  web_assets: number;
  subdomain_total: number;
}

const StatCard = ({ label, value, icon: Icon, tone }: {
  label: string; value: number; icon: typeof Boxes; tone: string;
}) => (
  <div className="rounded-card border border-border-color bg-surface-2 p-3">
    <div className="flex items-center justify-between">
      <span className={`flex h-7 w-7 items-center justify-center rounded-input ${tone}`}>
        <Icon size={14} />
      </span>
      <span className={`text-[20px] font-semibold num ${tone.split(' ').find(c => c.startsWith('text-')) || 'text-text-primary'}`}>
        {value}
      </span>
    </div>
    <p className="mt-1.5 text-caption text-text-muted">{label}</p>
  </div>
);

/* ── 攻击面拓扑图（资产-开放服务，力导向） ── */
interface TopologyData {
  nodes: { id: string; name: string; category: number; symbolSize: number; value?: number }[];
  links: { source: string; target: string }[];
  asset_count: number;
}

const AttackSurfaceGraph = ({ data }: { data: TopologyData | null }) => {
  const t = useChartTokens();
  if (!data || data.nodes.length === 0) {
    return (
      <div className="p-6">
        <EmptyState compact icon={Network} title="暂无攻击面拓扑数据" description="纳管资产并有端口扫描结果后自动生成。" />
      </div>
    );
  }
  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      backgroundColor: t.tooltipBg,
      borderColor: t.tooltipBorder,
      borderWidth: 1,
      textStyle: { color: t.textPrimary, fontSize: 12 },
      formatter: (p: any) =>
        p.dataType === 'edge' ? '' : `${p.name}${p.data?.category === 0 && p.value !== undefined ? ` · 风险分 ${p.value}` : ''}`,
    },
    legend: [{
      data: ['资产', '服务'],
      top: 4, right: 8,
      textStyle: { color: t.textSecondary, fontSize: 11 },
      itemWidth: 10, itemHeight: 10,
    }],
    series: [{
      type: 'graph',
      layout: 'force',
      roam: true,
      force: { repulsion: 150, edgeLength: 70, gravity: 0.08 },
      categories: [
        { name: '资产' },
        { name: '服务' },
      ],
      data: data.nodes.map(n => ({
        id: n.id,
        name: n.name,
        category: n.category,
        symbolSize: n.symbolSize,
        value: n.value,
        itemStyle: n.category === 0
          ? { color: riskToken(t, n.value ?? 0) }
          : { color: t.info },
        label: { show: n.category === 0 || n.symbolSize > 16 },
      })),
      links: data.links,
      label: { color: t.textSecondary, fontSize: 10, position: 'right' },
      lineStyle: { color: t.axis, opacity: 0.35, curveness: 0.1 },
      emphasis: { focus: 'adjacency', lineStyle: { opacity: 0.8 } },
    }],
  };
  return <ReactECharts option={option} style={{ height: 300 }} notMerge />;
};

const TABS: { id: 'basic' | 'ports' | 'vulnerabilities' | 'web' | 'subdomains' | 'history'; label: string; icon: typeof FileText }[] = [
  { id: 'basic', label: '基本信息', icon: FileText },
  { id: 'ports', label: '端口服务', icon: Activity },
  { id: 'vulnerabilities', label: '漏洞信息', icon: Shield },
  { id: 'web', label: 'Web指纹', icon: Globe },
  { id: 'history', label: '扫描历史', icon: Clock },
  { id: 'subdomains', label: '域名', icon: Globe },
];

/* 扫描任务（用于批量扫描弹窗与扫描历史） */
interface ScanTaskRow {
  id: number;
  name: string;
  type: string;
  status: string;
  target: string;
  progress: number;
  created_at?: string;
  completed_at?: string;
}

const EMPTY_STATS: AssetStats = {
  total: 0, by_type: {}, by_status: {},
  risk_distribution: { critical: 0, high: 0, medium: 0, low: 0 },
  open_ports: 0, open_vulns: 0, web_assets: 0, subdomain_total: 0,
};

const PAGE_SIZE = 20;

export default function AssetInventory() {
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [stats, setStats] = useState<AssetStats>(EMPTY_STATS);
  const [topology, setTopology] = useState<TopologyData | null>(null);
  const [showTopology, setShowTopology] = useState(true);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'basic' | 'ports' | 'vulnerabilities' | 'web' | 'subdomains' | 'history'>('basic');
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [formErrors, setFormErrors] = useState<{ name?: string }>({});
  const [formData, setFormData] = useState<{ name: string; type: string; owner: string; tags: string; description: string; location: string; department: string }>({ name: '', type: 'ip', owner: '', tags: '', description: '', location: '', department: '' });

  // 批量扫描弹窗状态
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanTasks, setScanTasks] = useState<ScanTaskRow[]>([]);
  const [scanTaskLoading, setScanTaskLoading] = useState(false);
  const [scanTarget, setScanTarget] = useState('');
  const [scanType, setScanType] = useState('port');
  const [scanBusy, setScanBusy] = useState(false);

  // 资产详情扫描历史
  const [assetScanHistory, setAssetScanHistory] = useState<ScanTaskRow[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const { ask, confirmProps } = useConfirmDialog('资产操作确认');

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchStats = useCallback(async () => {
    try {
      const res = await assetsApi.getStats();
      if (res.success && res.data) setStats(res.data);
    } catch { /* 统计失败不打断主列表 */ }
  }, []);

  const fetchTopology = useCallback(async () => {
    try {
      const res = await assetsApi.getTopology(20);
      if (res.success && res.data) setTopology(res.data);
    } catch { /* 拓扑失败不打断主列表 */ }
  }, []);

  const fetchAssets = useCallback(async (opts?: { page?: number; search?: string }) => {
    setLoading(true);
    try {
      const curPage = opts?.page ?? page;
      const curSearch = opts?.search ?? appliedSearch;
      const risk = riskFilter ? RISK_RANGE[riskFilter] : undefined;
      const response = await assetsApi.getAssets({
        page: curPage,
        page_size: PAGE_SIZE,
        search: curSearch || undefined,
        type: typeFilter || undefined,
        status: statusFilter || undefined,
        min_risk: risk?.min,
        max_risk: risk?.max,
      });
      if (response.success && response.data) {
        const data = Array.isArray(response.data) ? { items: response.data, total: response.data.length } : response.data;
        const items = data.items || [];
        const mapped = items.map((a: any) => ({
          id: String(a.id),
          name: a.name || '',
          type: a.type || 'ip',
          status: a.status || 'pending',
          riskScore: a.risk_score ?? 0,
          assessedRiskScore: a.assessed_risk_score,
          osInfo: a.os_info,
          domain: a.domain,
          hostname: a.hostname,
          ip: a.ip,
          ports: (a.ports || []).map((p: any) => ({
            id: p.id, port: p.port, protocol: p.protocol || 'tcp',
            service: p.service || '', version: p.version || '',
            state: p.state || 'open', banner: p.banner || '',
            discovered_at: p.discovered_at,
          })),
          owner: a.owner || '未分配',
          lastScan: a.last_scan_at || a.updated_at || '',
          lastScanId: a.last_scan_id,
          tags: a.tags || [],
          vulnStats: a.vulnStats || { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
          vulnerabilities: (a.vulnerabilities || []).map((v: any) => ({
            vulnId: v.vuln_id || v.id,
            name: v.vuln_name || v.plugin_name || '',
            severity: v.assessed_severity || v.severity || 'medium',
            cvssScore: v.assessed_score ?? v.cvss_score ?? 0,
            assessedScore: v.assessed_score,
            status: v.status || 'open',
            discoveredAt: v.discovered_at || '',
          })),
          webResults: a.metadata?.web_results || [],
          subdomains: a.metadata?.subdomains || [],
          metadata: a.metadata || {},
        }));
        setAssets(mapped);
        setTotal(data.total ?? items.length);
      }
    } catch (error) {
      console.error('获取资产列表失败:', error);
    } finally {
      setLoading(false);
    }
  }, [page, appliedSearch, typeFilter, statusFilter, riskFilter]);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);
  useEffect(() => { fetchStats(); fetchTopology(); }, [fetchStats, fetchTopology]);

  const refreshAll = () => { fetchAssets(); fetchStats(); fetchTopology(); };

  /* ── 真实 CRUD ── */
  const validateForm = () => {
    const errors: { name?: string } = {};
    if (!formData.name.trim()) errors.name = '资产名称不能为空';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const buildPayload = () => ({
    name: formData.name.trim(),
    type: formData.type,
    tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    metadata: {
      owner: formData.owner || undefined,
      department: formData.department || undefined,
      location: formData.location || undefined,
      description: formData.description || undefined,
    },
  });

  const handleAddAsset = async () => {
    if (!validateForm()) return;
    setLoading(true);
    try {
      await assetsApi.createAsset(buildPayload());
      setShowAddForm(false);
      setFormData({ name: '', type: 'ip', owner: '', tags: '', description: '', location: '', department: '' });
      setFormErrors({});
      refreshAll();
      showToast('资产添加成功', 'success');
    } catch (e: any) {
      showToast(e?.message || '资产添加失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEditAsset = async () => {
    if (!editingAsset || !validateForm()) return;
    setLoading(true);
    try {
      await assetsApi.updateAsset(Number(editingAsset.id), buildPayload());
      setEditingAsset(null);
      setFormData({ name: '', type: 'ip', owner: '', tags: '', description: '', location: '', department: '' });
      setFormErrors({});
      refreshAll();
      setShowDetail(false);
      showToast('资产更新成功', 'success');
    } catch (e: any) {
      showToast(e?.message || '资产更新失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAsset = async (asset: Asset) => {
    const ok = await ask({
      title: '删除资产',
      message: `确定删除资产「${asset.name}」？其端口与漏洞关联数据将一并清除，此操作不可恢复。`,
      danger: true, confirmText: '删除',
    });
    if (!ok) return;
    try {
      await assetsApi.deleteAsset(Number(asset.id));
      if (selectedAsset?.id === asset.id) setShowDetail(false);
      refreshAll();
      showToast('资产删除成功', 'success');
    } catch (e: any) {
      showToast(e?.message || '删除失败', 'error');
    }
  };

  const handleBatchDelete = async () => {
    const ok = await ask({
      title: '批量删除',
      message: `确定删除选中的 ${selectedAssets.length} 个资产？关联端口与漏洞数据将一并清除，此操作不可恢复。`,
      danger: true, confirmText: '全部删除',
    });
    if (!ok) return;
    try {
      await assetsApi.batchDelete(selectedAssets);
      setSelectedAssets([]);
      refreshAll();
      showToast('批量删除成功', 'success');
    } catch (e: any) {
      showToast(e?.message || '批量删除失败', 'error');
    }
  };

  /* ── 导出（真实 JSON 下载） ── */
  const handleExport = async () => {
    try {
      const res = await assetsApi.exportAssets();
      const blob = new Blob([JSON.stringify(res.data ?? res, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `usop-assets-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('资产已导出', 'success');
    } catch {
      showToast('导出失败', 'error');
    }
  };

  /* ── 批量扫描：真实创建+启动任务 ── */
  const openScanModal = () => {
    const targets = selectedAssets.length > 0
      ? assets.filter(a => selectedAssets.includes(a.id)).map(a => a.name).join(',')
      : '';
    setScanTarget(targets);
    setShowScanModal(true);
    fetchScanTasks();
  };

  const fetchScanTasks = async () => {
    setScanTaskLoading(true);
    try {
      const res = await scansApi.getScans({ page: 1, page_size: 20 });
      if (res.success && res.data) {
        const items = Array.isArray(res.data) ? res.data : res.data.items || [];
        setScanTasks(items.map((t: any) => ({
          id: t.id, name: t.name || '', type: t.type || '', status: t.status || '',
          target: t.target || '', progress: t.progress || 0,
          created_at: t.created_at, completed_at: t.completed_at,
        })));
      }
    } catch { /* 弹窗内静默 */ }
    finally { setScanTaskLoading(false); }
  };

  const handleCreateAndStartScan = async () => {
    if (!scanTarget.trim()) { showToast('请填写扫描目标', 'error'); return; }
    setScanBusy(true);
    try {
      const res = await scansApi.createScan({
        name: `资产攻击面扫描-${new Date().toISOString().slice(5, 16).replace('T', ' ')}`,
        type: scanType,
        target: scanTarget.trim().slice(0, 200),
      });
      const taskId = res?.data?.id;
      if (taskId) await scansApi.startScan(taskId);
      showToast(`扫描任务 #${taskId} 已启动，可在扫描控制台查看进度`, 'success');
      fetchScanTasks();
    } catch (e: any) {
      showToast(e?.message || '扫描任务启动失败', 'error');
    } finally {
      setScanBusy(false);
    }
  };

  const handleStartExistingTask = async (id: number) => {
    setScanBusy(true);
    try {
      await scansApi.startScan(id);
      showToast(`任务 #${id} 已启动`, 'success');
      fetchScanTasks();
    } catch (e: any) {
      showToast(e?.message || '启动失败', 'error');
    } finally {
      setScanBusy(false);
    }
  };

  /* ── 扫描结果同步入资产库 ── */
  const handleSyncTask = async (id: number) => {
    setScanBusy(true);
    try {
      const res = await assetsApi.syncScan(id);
      const imported = res?.data?.imported || {};
      const total = (imported.ports || 0) + (imported.vulns || 0) + (imported.web || 0) + (imported.subdomains || 0);
      if (total > 0) {
        showToast(`已同步 ${total} 条结果（端口 ${imported.ports} · 漏洞 ${imported.vulns} · Web ${imported.web} · 子域名 ${imported.subdomains}）`, 'success');
        refreshAll();
      } else {
        showToast('该任务暂无可同步的结果（任务可能仍在运行）', 'error');
      }
    } catch (e: any) {
      showToast(e?.message || '同步失败', 'error');
    } finally {
      setScanBusy(false);
    }
  };

  /* ── 详情抽屉：真实扫描历史 ── */
  const openDetailDrawer = (asset: Asset) => {
    setSelectedAsset(asset);
    setShowDetail(true);
    setActiveTab('basic');
    setAssetScanHistory(null);
  };

  const fetchAssetHistory = useCallback(async (asset: Asset) => {
    setHistoryLoading(true);
    try {
      const res = await scansApi.getScans({ page: 1, page_size: 50 });
      if (res.success && res.data) {
        const items = Array.isArray(res.data) ? res.data : res.data.items || [];
        const matched = items.filter((t: any) =>
          t.id === asset.lastScanId ||
          (t.target && (t.target.includes(asset.name) || (asset.ip && t.target.includes(asset.ip))))
        );
        setAssetScanHistory(matched.map((t: any) => ({
          id: t.id, name: t.name || '', type: t.type || '', status: t.status || '',
          target: t.target || '', progress: t.progress || 0,
          created_at: t.created_at, completed_at: t.completed_at,
        })));
      }
    } catch {
      setAssetScanHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showDetail && selectedAsset && activeTab === 'history' && assetScanHistory === null) {
      fetchAssetHistory(selectedAsset);
    }
  }, [showDetail, selectedAsset, activeTab, assetScanHistory, fetchAssetHistory]);

  const openEditModal = (asset: Asset) => {
    setEditingAsset(asset);
    setFormData({
      name: asset.name,
      type: asset.type,
      owner: asset.owner === '未分配' ? '' : asset.owner,
      tags: asset.tags.join(', '),
      description: asset.metadata?.description || '',
      location: asset.metadata?.location || '',
      department: asset.metadata?.department || '',
    });
    setFormErrors({});
  };

  const toggleSelectAll = () => {
    setSelectedAssets(selectedAssets.length === assets.length && assets.length > 0 ? [] : assets.map(a => a.id));
  };

  const formOpen = showAddForm || Boolean(editingAsset);
  const closeForm = () => { setShowAddForm(false); setEditingAsset(null); };
  const initialLoading = loading && assets.length === 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const riskAssets = stats.risk_distribution.critical + stats.risk_distribution.high;

  return (
    <ContentContainer>
      {toast && (
        <div
          className={`fixed right-4 top-16 z-toast flex items-center gap-2 rounded-card border px-3.5 py-2.5 text-[12.5px] shadow-panel ${
            toast.type === 'error'
              ? 'border-danger/30 bg-danger/10 text-danger'
              : 'border-success/30 bg-success/10 text-success'
          }`}
        >
          {toast.type === 'error' ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
          {toast.message}
        </div>
      )}

      <PageHeader
        icon={Boxes}
        title="资产清单"
        meta={
          <span className="text-[11px] text-text-muted num">
            共 {total} 个资产 · 开放端口 {stats.open_ports} · 未修复漏洞 {stats.open_vulns}
          </span>
        }
        actions={
          <>
            <Button variant="soft" icon={Scan} onClick={openScanModal}>批量扫描</Button>
            <Button variant="primary" icon={Plus} onClick={() => setShowAddForm(true)}>添加资产</Button>
          </>
        }
        toolbar={
          <>
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              width="lg"
              placeholder="搜索名称 / IP / 域名，回车检索…"
            />
            <Button
              variant="secondary" icon={Filter}
              onClick={() => { setAppliedSearch(searchQuery.trim()); setPage(1); }}
            >
              检索
            </Button>
            <Button variant="secondary" icon={Download} onClick={handleExport}>导出</Button>
          </>
        }
      />

      {/* ── 攻击面总览 ── */}
      <div className="grid grid-cols-3 gap-2.5 xl:grid-cols-6">
        <StatCard label="纳管资产" value={stats.total} icon={Boxes} tone="bg-primary/12 text-primary" />
        <StatCard label="高风险资产" value={riskAssets} icon={Shield} tone="bg-danger/12 text-danger" />
        <StatCard label="开放端口" value={stats.open_ports} icon={Activity} tone="bg-warning/12 text-warning" />
        <StatCard label="未修复漏洞" value={stats.open_vulns} icon={Bug} tone="bg-high/12 text-high" />
        <StatCard label="Web暴露资产" value={stats.web_assets} icon={Globe} tone="bg-info/12 text-info" />
        <StatCard label="发现子域名" value={stats.subdomain_total} icon={Network} tone="bg-accent/12 text-accent" />
      </div>

      {/* ── 攻击面拓扑 ── */}
      {showTopology && (
        <SectionCard
          icon={Network}
          title="攻击面拓扑"
          description={`风险 Top ${topology?.asset_count ?? 0} 资产与开放服务关系 · 数据来自端口扫描结果`}
          actions={
            <Button variant="ghost" size="sm" icon={RefreshCw} onClick={fetchTopology} title="刷新拓扑">刷新</Button>
          }
        >
          <AttackSurfaceGraph data={topology} />
        </SectionCard>
      )}

      {/* ── 筛选条 ── */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="app-select w-auto"
          value={typeFilter}
          onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          aria-label="按类型筛选"
        >
          <option value="">全部类型</option>
          {ASSET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select
          className="app-select w-auto"
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          aria-label="按状态筛选"
        >
          <option value="">全部状态</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select
          className="app-select w-auto"
          value={riskFilter}
          onChange={e => { setRiskFilter(e.target.value); setPage(1); }}
          aria-label="按风险筛选"
        >
          {RISK_FILTERS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        {(typeFilter || statusFilter || riskFilter || appliedSearch) && (
          <Button
            variant="ghost" size="sm" icon={X}
            onClick={() => {
              setTypeFilter(''); setStatusFilter(''); setRiskFilter('');
              setSearchQuery(''); setAppliedSearch(''); setPage(1);
            }}
          >
            清空筛选
          </Button>
        )}
        <div className="flex-1" />
        <Button
          variant="ghost" size="sm" icon={showTopology ? X : Network}
          onClick={() => setShowTopology(v => !v)}
        >
          {showTopology ? '收起拓扑' : '展开拓扑'}
        </Button>
      </div>

      {selectedAssets.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-primary/25 bg-primary/10 px-3.5 py-2.5">
          <span className="text-[12.5px] text-primary num">已选择 {selectedAssets.length} 项</span>
          <div className="flex-1" />
          <Button variant="soft" size="sm" icon={Scan} onClick={openScanModal}>扫描所选</Button>
          <Button variant="danger" size="sm" icon={Trash2} onClick={handleBatchDelete}>
            批量删除
          </Button>
        </div>
      )}

      <SectionCard flush>
        {initialLoading ? (
          <LoadingState label="正在加载资产…" />
        ) : assets.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title={appliedSearch || typeFilter || statusFilter || riskFilter ? '未找到匹配的资产' : '暂无资产数据'}
            description={appliedSearch || typeFilter || statusFilter || riskFilter ? '换个筛选条件试试。' : '通过扫描任务或手动添加把资产纳管进来。'}
            action={
              appliedSearch || typeFilter || statusFilter || riskFilter ? (
                <Button variant="soft" onClick={() => {
                  setTypeFilter(''); setStatusFilter(''); setRiskFilter('');
                  setSearchQuery(''); setAppliedSearch(''); setPage(1);
                }}>清空条件</Button>
              ) : (
                <Button variant="soft" icon={Plus} onClick={() => setShowAddForm(true)}>添加资产</Button>
              )
            }
          />
        ) : (
          <TableWrap>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>
                    <input
                      type="checkbox"
                      className="app-checkbox"
                      checked={selectedAssets.length === assets.length && assets.length > 0}
                      onChange={toggleSelectAll}
                      aria-label="全选"
                    />
                  </th>
                  <th style={{ minWidth: 220 }}>资产名称</th>
                  <th style={{ width: 90 }}>类型</th>
                  <th style={{ width: 90 }}>状态</th>
                  <th style={{ width: 90 }}>风险评分</th>
                  <th style={{ minWidth: 150 }}>漏洞统计</th>
                  <th style={{ minWidth: 120 }}>端口/服务</th>
                  <th style={{ width: 120 }}>责任人</th>
                  <th style={{ width: 120 }}>最后扫描</th>
                  <th style={{ width: 132 }} className="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {assets.map(asset => {
                  const TypeIcon = assetIcon(asset.type);
                  return (
                    <tr key={asset.id} className={selectedAssets.includes(asset.id) ? 'is-selected' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          className="app-checkbox"
                          checked={selectedAssets.includes(asset.id)}
                          onChange={e => setSelectedAssets(e.target.checked ? [...selectedAssets, asset.id] : selectedAssets.filter(id => id !== asset.id))}
                          aria-label={`选择 ${asset.name}`}
                        />
                      </td>
                      <td>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-input bg-primary/12 text-primary">
                            <TypeIcon size={14} />
                          </span>
                          <div className="min-w-0">
                            <p className="text-text-primary truncate-1">{asset.name}</p>
                            <div className="mt-0.5 flex gap-2 text-[11px] text-text-muted">
                              {asset.ip && <span className="font-mono">{asset.ip}</span>}
                              {asset.tags.slice(0, 2).map(tag => (
                                <span key={tag} className="chip">{tag}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>{typeLabel(asset.type)}</td>
                      <td>
                        <StateBadge
                          state={asset.status}
                          label={STATUS_LABEL[asset.status] || asset.status}
                        />
                      </td>
                      <td>
                        <RiskRing score={asset.riskScore} assessedScore={asset.assessedRiskScore} />
                      </td>
                      <td><VulnStatsBadge stats={asset.vulnStats} /></td>
                      <td>
                        <div className="flex flex-wrap items-center gap-1">
                          {asset.ports.slice(0, 3).map((p, i) => (
                            <span key={i} className="chip font-mono">{p.port}</span>
                          ))}
                          {asset.ports.length > 3 && (
                            <span className="text-[11px] text-text-muted num">+{asset.ports.length - 3}</span>
                          )}
                          {asset.ports.length === 0 && <span className="text-[11px] text-text-muted">-</span>}
                        </div>
                      </td>
                      <td className="text-text-secondary">{asset.owner}</td>
                      <td className="text-text-muted num">
                        {asset.lastScan ? new Date(asset.lastScan).toLocaleDateString() : '-'}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost" size="sm" icon={Eye} className="w-8 px-0"
                            onClick={() => openDetailDrawer(asset)} title="查看详情"
                          />
                          <Button
                            variant="ghost" size="sm" icon={Edit2} className="w-8 px-0"
                            onClick={() => openEditModal(asset)} title="编辑"
                          />
                          <Button
                            variant="danger-ghost" size="sm" icon={Trash2} className="w-8 px-0"
                            onClick={() => handleDeleteAsset(asset)} title="删除"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
        {/* 分页 */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-border-color px-4 py-2.5">
            <span className="text-caption text-text-muted num">第 {page} / {totalPages} 页 · 共 {total} 条</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</Button>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</Button>
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── 批量扫描弹窗 ── */}
      <Modal
        open={showScanModal}
        onClose={() => setShowScanModal(false)}
        width={680}
        title="批量扫描"
        description="对资产发起真实扫描任务，完成后可将结果同步入资产库"
      >
        <div className="flex flex-col gap-4">
          <SectionCard icon={Plus} title="发起新扫描" padding="sm">
            <div className="app-form-grid">
              <Field label="扫描目标" required span={2} help="多个目标用逗号分隔（已自动带入所选资产）">
                <input
                  type="text"
                  className="app-input"
                  placeholder="例如: 192.168.1.10,web.example.com"
                  value={scanTarget}
                  onChange={e => setScanTarget(e.target.value)}
                />
              </Field>
              <Field label="扫描类型">
                <select className="app-select" value={scanType} onChange={e => setScanType(e.target.value)}>
                  <option value="port">端口扫描</option>
                  <option value="web">Web 探测</option>
                  <option value="subdomain">子域名收集</option>
                  <option value="vuln">漏洞扫描</option>
                </select>
              </Field>
              <div className="flex items-end">
                <Button
                  variant="primary" icon={Scan} className="w-full"
                  loading={scanBusy} onClick={handleCreateAndStartScan}
                >
                  创建并启动
                </Button>
              </div>
            </div>
          </SectionCard>

          <SectionCard icon={Scan} title="已有扫描任务" padding="sm" description="启动排队/暂停中的任务，或同步已完成任务的结果">
            {scanTaskLoading ? (
              <LoadingState label="加载任务…" inline />
            ) : scanTasks.length === 0 ? (
              <p className="py-3 text-center text-caption text-text-muted">暂无扫描任务</p>
            ) : (
              <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
                {scanTasks.map(task => {
                  const st = SCAN_TASK_STATUS[task.status] || { label: task.status, tone: 'neutral' as const };
                  return (
                    <div key={task.id} className="flex items-center gap-3 rounded-input border border-border-color bg-surface-2 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate-1 text-[12.5px] text-text-primary">
                          #{task.id} {task.name}
                        </p>
                        <p className="mt-0.5 truncate-1 text-caption text-text-muted num">
                          {SCAN_TYPE_LABEL[task.type] || task.type} · {task.target || '-'}
                        </p>
                      </div>
                      <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                      {(task.status === 'queued' || task.status === 'paused') && (
                        <Button
                          variant="soft" size="sm" disabled={scanBusy}
                          onClick={() => handleStartExistingTask(task.id)}
                        >
                          启动
                        </Button>
                      )}
                      <Button
                        variant="ghost" size="sm" icon={RefreshCw}
                        disabled={scanBusy} title="同步结果到资产库"
                        onClick={() => handleSyncTask(task.id)}
                      >
                        同步
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>
      </Modal>

      {/* ── 添加 / 编辑资产 ── */}
      <Modal
        open={formOpen}
        onClose={closeForm}
        width={600}
        title={editingAsset ? '编辑资产' : '添加新资产'}
        description={editingAsset ? `资产 #${editingAsset.id}` : '填写资产基础信息，后续可被扫描任务补充端口与漏洞数据'}
        footer={
          <>
            <Button variant="secondary" onClick={closeForm}>取消</Button>
            <Button
              variant="primary"
              icon={editingAsset ? Edit2 : Plus}
              loading={loading}
              onClick={editingAsset ? handleEditAsset : handleAddAsset}
            >
              {editingAsset ? '保存' : '添加'}
            </Button>
          </>
        }
      >
        <div className="app-form-grid">
          <Field label="资产名称 / IP / 域名" required error={formErrors.name}>
            <input
              type="text"
              placeholder="例如: 192.168.1.1 或 web.example.com"
              value={formData.name}
              onChange={(e) => { setFormData({ ...formData, name: e.target.value }); setFormErrors({ ...formErrors, name: undefined }); }}
              className="app-input"
            />
          </Field>

          <Field label="资产类型">
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="app-select"
              aria-label="资产类型"
            >
              {ASSET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>

          <Field label="责任人">
            <input
              type="text"
              placeholder="输入责任人"
              value={formData.owner}
              onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
              className="app-input"
            />
          </Field>

          <Field label="所属部门">
            <input
              type="text"
              placeholder="例如: 运维部"
              value={formData.department}
              onChange={(e) => setFormData({ ...formData, department: e.target.value })}
              className="app-input"
            />
          </Field>

          <Field label="物理位置" span={2}>
            <input
              type="text"
              placeholder="例如: 北京机房-A区"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="app-input"
            />
          </Field>

          <Field label="标签" help="多个标签用逗号分隔" span={2}>
            <input
              type="text"
              placeholder="production, web, critical"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              className="app-input"
            />
          </Field>

          <Field label="资产描述" span={2}>
            <textarea
              rows={3}
              placeholder="输入资产描述..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="app-textarea"
            />
          </Field>
        </div>
      </Modal>

      {/* ── 资产详情 ── */}
      <Modal
        open={showDetail && Boolean(selectedAsset)}
        onClose={() => setShowDetail(false)}
        width={720}
        title="资产详情"
        description={selectedAsset ? `${selectedAsset.name} · ID: ${selectedAsset.id}` : undefined}
      >
        {selectedAsset && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-panel bg-primary/12 text-primary">
                {React.createElement(assetIcon(selectedAsset.type), { size: 26 })}
              </div>
              <div className="min-w-0">
                <h3 className="text-card-title text-text-primary truncate-1">{selectedAsset.name}</h3>
                <p className="mt-0.5 text-caption text-text-muted">
                  {typeLabel(selectedAsset.type)} · ID: {selectedAsset.id}
                  {selectedAsset.ip ? ` · ${selectedAsset.ip}` : ''}
                </p>
              </div>
              {selectedAsset.status && (
                <div className="ml-auto">
                  <StateBadge
                    state={selectedAsset.status}
                    label={STATUS_LABEL[selectedAsset.status] || selectedAsset.status}
                  />
                </div>
              )}
            </div>

            <div className="tabs-line">
              {TABS.map(tab => {
                const Icon = tab.icon;
                const label = tab.id === 'vulnerabilities' && selectedAsset.vulnStats
                  ? `${tab.label} (${selectedAsset.vulnStats.total})`
                  : tab.label;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`tab-line-item ${activeTab === tab.id ? 'is-active' : ''}`}
                  >
                    <Icon size={14} />{label}
                  </button>
                );
              })}
            </div>

            {activeTab === 'basic' && (
              <div className="flex flex-col gap-4">
                <SectionCard icon={Tag} title="标签" padding="sm">
                  {selectedAsset.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedAsset.tags.map(tag => (
                        <span key={tag} className="chip chip-accent">{tag}</span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-caption text-text-muted">未打标签</span>
                  )}
                </SectionCard>

                <SectionCard icon={FileText} title="资产信息" padding="sm">
                  <InfoList
                    columns={2}
                    items={[
                      { label: '责任人', value: selectedAsset.owner },
                      { label: '所属部门', value: selectedAsset.metadata?.department || '未填写' },
                      { label: '物理位置', value: selectedAsset.metadata?.location || '未填写' },
                      {
                        label: '最后扫描',
                        value: selectedAsset.lastScan
                          ? new Date(selectedAsset.lastScan).toLocaleString()
                          : '未扫描',
                      },
                      { label: 'IP 地址', value: selectedAsset.ip || '-' },
                      { label: '操作系统', value: selectedAsset.osInfo || '-' },
                      ...(selectedAsset.metadata?.description
                        ? [{ label: '描述', value: selectedAsset.metadata.description }]
                        : []),
                    ]}
                  />
                </SectionCard>

                <SectionCard icon={Activity} title="风险评分" padding="sm">
                  <div className="flex items-center gap-4">
                    <RiskRing score={selectedAsset.riskScore} assessedScore={selectedAsset.assessedRiskScore} />
                    <div>
                      <p className="text-[15px] font-semibold text-text-primary num">
                        {selectedAsset.assessedRiskScore ?? selectedAsset.riskScore} 分
                      </p>
                      <p className="mt-0.5 text-caption text-text-muted">
                        {(selectedAsset.assessedRiskScore ?? selectedAsset.riskScore) >= 80 ? '高风险'
                          : (selectedAsset.assessedRiskScore ?? selectedAsset.riskScore) >= 60 ? '中高风险'
                            : (selectedAsset.assessedRiskScore ?? selectedAsset.riskScore) >= 40 ? '中风险' : '低风险'}
                      </p>
                    </div>
                  </div>
                </SectionCard>
              </div>
            )}

            {activeTab === 'ports' && (
              <SectionCard flush title="端口与服务" description={`共 ${selectedAsset.ports.length} 个端口`}>
                {selectedAsset.ports.length === 0 ? (
                  <EmptyState compact icon={Activity} title="暂无端口信息" description="对资产执行端口扫描后自动填充。" />
                ) : (
                  <TableWrap>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th style={{ width: 100 }}>端口</th>
                          <th>服务</th>
                          <th>版本</th>
                          <th style={{ width: 90 }}>状态</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedAsset.ports.map((port, i) => (
                          <tr key={i}>
                            <td className="font-mono text-text-primary num">{port.port}/{port.protocol}</td>
                            <td>{port.service || '-'}</td>
                            <td className="text-text-muted">{port.version || '-'}</td>
                            <td>
                              {port.state === 'open' ? (
                                <StatusBadge tone="success" dot>开放</StatusBadge>
                              ) : port.state === 'filtered' ? (
                                <StatusBadge tone="warning" dot>被过滤</StatusBadge>
                              ) : (
                                <StatusBadge tone="neutral" dot>{port.state || '未知'}</StatusBadge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableWrap>
                )}
              </SectionCard>
            )}

            {activeTab === 'vulnerabilities' && (
              selectedAsset.vulnStats && selectedAsset.vulnStats.total > 0 ? (
                <div className="flex flex-col gap-4">
                  <SectionCard title="漏洞统计" padding="sm" icon={Shield}>
                    <div className="grid grid-cols-5 gap-2.5">
                      {[
                        { label: '危急', value: selectedAsset.vulnStats.critical, tone: 'text-critical' },
                        { label: '高危', value: selectedAsset.vulnStats.high, tone: 'text-high' },
                        { label: '中危', value: selectedAsset.vulnStats.medium, tone: 'text-medium' },
                        { label: '低危', value: selectedAsset.vulnStats.low, tone: 'text-low' },
                        { label: '总计', value: selectedAsset.vulnStats.total, tone: 'text-text-primary' },
                      ].map(item => (
                        <div
                          key={item.label}
                          className="rounded-input border border-border-color bg-surface-2 p-3 text-center"
                        >
                          <p className={`text-[17px] font-semibold num ${item.tone}`}>{item.value}</p>
                          <p className="mt-0.5 text-caption text-text-muted">{item.label}</p>
                        </div>
                      ))}
                    </div>
                  </SectionCard>

                  <SectionCard title="漏洞列表" padding="sm" icon={Bug}>
                    <div className="flex flex-col gap-2">
                      {selectedAsset.vulnerabilities?.map((vuln) => (
                        <div
                          key={vuln.vulnId}
                          className="rounded-input border border-border-color bg-surface-2 p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <SeverityBadge severity={vuln.severity} />
                              <span className="text-[13px] font-medium text-text-primary truncate-1">{vuln.name}</span>
                            </div>
                            <StateBadge
                              state={vuln.status}
                              label={VULN_STATUS_LABEL[vuln.status] || vuln.status}
                            />
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-4 text-caption text-text-muted">
                            <span>ID: {vuln.vulnId}</span>
                            <span className="num">CVSS: {vuln.cvssScore}</span>
                            {vuln.assessedScore !== undefined && (
                              <span className="text-primary num">测评: {vuln.assessedScore}</span>
                            )}
                            <span>
                              发现时间: {vuln.discoveredAt ? new Date(vuln.discoveredAt).toLocaleDateString() : '-'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                </div>
              ) : (
                <SectionCard padding="none">
                  <EmptyState icon={Shield} title="暂无漏洞信息" description="该资产暂未发现漏洞，可执行漏洞扫描后复查。" />
                </SectionCard>
              )
            )}

            {activeTab === 'subdomains' && (
              <SectionCard
                icon={Globe}
                title="发现的子域名"
                description={selectedAsset.subdomains?.length ? `共 ${selectedAsset.subdomains.length} 个` : undefined}
              >
                {selectedAsset.subdomains && selectedAsset.subdomains.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {selectedAsset.subdomains.map((s, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-3 rounded-input border border-border-color bg-surface-2 px-3 py-2"
                      >
                        <span className="font-mono text-[12px] text-text-primary truncate-1">{s}</span>
                        <span className="shrink-0 text-caption text-text-muted">子域名</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    compact
                    icon={Globe}
                    title="暂无子域名数据"
                    description="通过「批量扫描」发起子域名收集任务，完成后同步结果"
                  />
                )}
              </SectionCard>
            )}

            {activeTab === 'web' && (
              selectedAsset.webResults && selectedAsset.webResults.length > 0 ? (
                <SectionCard icon={Globe} title="Web 服务指纹" description={`共 ${selectedAsset.webResults.length} 条`}>
                  <div className="flex flex-col gap-2">
                    {selectedAsset.webResults.map((w, i) => (
                      <div
                        key={i}
                        className="rounded-input border border-border-color bg-surface-2 p-3"
                      >
                        <div className="font-mono text-[12px] text-primary truncate-1">{w.url}</div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <StatusBadge
                            tone={
                              w.status_code >= 200 && w.status_code < 300 ? 'success'
                                : w.status_code >= 300 && w.status_code < 400 ? 'info'
                                  : 'warning'
                            }
                          >
                            {w.status_code}
                          </StatusBadge>
                          {w.title && (
                            <span className="text-[12px] text-text-primary truncate-1">{w.title}</span>
                          )}
                          {w.server && <span className="text-caption text-text-muted">{w.server}</span>}
                        </div>
                        {w.tech && w.tech.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {w.tech.map((t, j) => (
                              <StatusBadge key={j} tone="accent">{t}</StatusBadge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </SectionCard>
              ) : (
                <SectionCard padding="none">
                  <EmptyState compact icon={Globe} title="暂无 Web 指纹数据" description="通过「批量扫描」发起 Web 探测任务后同步。" />
                </SectionCard>
              )
            )}

            {activeTab === 'history' && (
              historyLoading ? (
                <LoadingState label="加载扫描历史…" inline />
              ) : assetScanHistory && assetScanHistory.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {assetScanHistory.map(task => {
                    const st = SCAN_TASK_STATUS[task.status] || { label: task.status, tone: 'neutral' as const };
                    return (
                      <SectionCard key={task.id} padding="sm" hoverable>
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-input bg-primary/12 text-primary">
                            <Scan size={16} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium text-text-primary truncate-1">
                              #{task.id} {task.name}
                            </p>
                            <p className="mt-0.5 text-caption text-text-muted num">
                              {SCAN_TYPE_LABEL[task.type] || task.type} · {task.completed_at || task.created_at
                                ? new Date(task.completed_at || task.created_at!).toLocaleString() : '-'}
                            </p>
                          </div>
                          <StatusBadge tone={st.tone} dot>{st.label}</StatusBadge>
                        </div>
                      </SectionCard>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={Clock}
                  title="暂无扫描历史"
                  description="对该资产执行扫描任务后，这里会展示真实任务记录。"
                />
              )
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog {...confirmProps} />
    </ContentContainer>
  );
}
