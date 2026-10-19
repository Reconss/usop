/**
 * 资产清单
 * 展示纳管资产及其端口、漏洞、Web 指纹、子域名与扫描历史。
 * 数据来自 GET 资产接口（page_size=100），详情为只读抽屉式弹窗。
 */
import React, { useState, useMemo, useEffect } from 'react';
import {
  Filter, Plus, Download, Scan, Globe, Server, Shield, Tag, Clock,
  Edit2, Trash2, Eye, FileText, Activity, Boxes, AlertCircle,
  CheckCircle2, RefreshCw, Bug,
} from 'lucide-react';
import type { Asset } from '../types';
import { assetsApi, scansApi } from '../services/api';
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

/* 风险评分环：分数 → 语义严重级别色 */
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

/* 漏洞数量分布（表格内紧凑展示） */
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

const ASSET_TYPES = [
  { value: 'ip', label: 'IP地址' },
  { value: 'domain', label: '域名' },
  { value: 'service', label: '服务' },
] as const;

const assetIcon = (type: string) =>
  type === 'domain' ? Globe : type === 'ip' ? Server : Shield;

const TABS: { id: 'basic' | 'ports' | 'vulnerabilities' | 'web' | 'subdomains' | 'history'; label: string; icon: typeof FileText }[] = [
  { id: 'basic', label: '基本信息', icon: FileText },
  { id: 'ports', label: '端口服务', icon: Activity },
  { id: 'vulnerabilities', label: '漏洞信息', icon: Shield },
  { id: 'web', label: 'Web指纹', icon: Globe },
  { id: 'history', label: '扫描历史', icon: Clock },
  { id: 'subdomains', label: '域名', icon: Globe },
];

export default function AssetInventory() {
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  // 从API获取资产数据
  useEffect(() => {
    const fetchAssets = async () => {
      setLoading(true);
      try {
        const response = await assetsApi.getAssets({ page_size: 100 });
        if (response.success && response.data) {
          const items = Array.isArray(response.data) ? response.data : response.data.items || [];
          const mapped = items.map((a: any) => ({
            id: String(a.id),
            name: a.name || '',
            type: a.type || 'ip',
            status: a.status || 'pending',
            riskScore: a.assessed_risk_score ?? a.risk_score ?? 0,
            assessedRiskScore: a.assessed_risk_score,
            osInfo: a.os_info,
            domain: a.domain,
            hostname: a.hostname,
            ip: a.ip,
            ports: (a.ports || []).map((p: any) => ({
              id: p.id, port: p.port, protocol: p.protocol || 'tcp',
              service: p.service || '', version: p.version || '',
              state: p.state || 'open', banner: p.banner || '',
              discovered_at: p.discovered_at
            })),
            owner: a.owner || '未分配',
            lastScan: a.last_scan_at || a.updated_at || '',
            tags: a.tags || [],
            vulnStats: a.vulnStats || { critical:0, high:0, medium:0, low:0, total:0 },
            vulnerabilities: (a.vulnerabilities || []).map((v: any) => ({
              vulnId: v.vuln_id || v.id,
              name: v.vuln_name || v.plugin_name || '',
              severity: v.assessed_severity || v.severity || 'medium',
              cvssScore: v.assessed_score ?? v.cvss_score ?? 0,
              assessedScore: v.assessed_score,
              status: v.status || 'open',
              discoveredAt: v.discovered_at || ''
            })),
            webResults: a.metadata?.web_results || [],
            subdomains: a.metadata?.subdomains || [],
            metadata: a.metadata || {}
          }));
          setAssets(mapped);
        }
      } catch (error) {
        console.error('获取资产列表失败:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchAssets();
  }, []);
  const [activeTab, setActiveTab] = useState<'basic' | 'ports' | 'vulnerabilities' | 'web' | 'subdomains' | 'history'>('basic');
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // 注：这里曾有一个未被任何 UI 使用的 assetStats（且用 status === 'active' 统计，
  // 而资产状态只有 verified/pending/online，恒为 0）。已删除，避免误导与类型报错。
  const [formErrors, setFormErrors] = useState<{ name?: string }>({});
  const [formData, setFormData] = useState<{ name: string; type: 'ip' | 'domain' | 'service' | 'host'; owner: string; tags: string; description: string; location: string; department: string }>({ name: '', type: 'ip', owner: '', tags: '', description: '', location: '', department: '' });

  const filteredAssets = useMemo(() => {
    return assets.filter(a =>
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [assets, searchQuery]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const validateForm = () => {
    const errors: { name?: string } = {};
    if (!formData.name.trim()) errors.name = '资产名称不能为空';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddAsset = () => {
    if (!validateForm()) return;
    setLoading(true);
    setTimeout(() => {
      const asset: Asset = {
        id: String(Date.now()),
        name: formData.name,
        type: formData.type,
        status: 'pending',
        riskScore: Math.floor(Math.random() * 100),
        ports: [],
        owner: formData.owner || '未分配',
        lastScan: new Date().toISOString(),
        tags: formData.tags ? formData.tags.split(',').map(t => t.trim()) : [],
        vulnStats: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
        vulnerabilities: []
      };
      setAssets([...assets, asset]);
      setShowAddForm(false);
      setFormData({ name: '', type: 'ip', owner: '', tags: '', description: '', location: '', department: '' });
      setFormErrors({});
      setLoading(false);
      showToast('资产添加成功', 'success');
    }, 500);
  };

  const handleEditAsset = () => {
    if (!editingAsset || !validateForm()) return;
    setLoading(true);
    setTimeout(() => {
      setAssets(assets.map(a => a.id === editingAsset.id ? { ...a, name: formData.name, type: formData.type, owner: formData.owner, tags: formData.tags ? formData.tags.split(',').map(t => t.trim()) : [] } : a));
      setEditingAsset(null);
      setFormData({ name: '', type: 'ip', owner: '', tags: '', description: '', location: '', department: '' });
      setFormErrors({});
      setLoading(false);
      showToast('资产更新成功', 'success');
    }, 500);
  };

  const handleDeleteAsset = (id: string) => {
    setAssets(assets.filter(a => a.id !== id));
    if (selectedAsset?.id === id) setSelectedAsset(null);
    showToast('资产删除成功', 'success');
  };

  const handleBatchDelete = () => {
    setAssets(assets.filter(a => !selectedAssets.includes(a.id)));
    setSelectedAssets([]);
    showToast(`已删除 ${selectedAssets.length} 个资产`, 'success');
  };

  const openEditModal = (asset: Asset) => {
    setEditingAsset(asset);
    setFormData({ name: asset.name, type: asset.type, owner: asset.owner, tags: asset.tags.join(', '), description: '', location: '', department: '' });
    setFormErrors({});
  };

  const openDetailDrawer = (asset: Asset) => {
    setSelectedAsset(asset);
    setShowDetail(true);
    setActiveTab('basic');
  };

  const toggleSelectAll = () => {
    setSelectedAssets(selectedAssets.length === filteredAssets.length ? [] : filteredAssets.map(a => a.id));
  };

  const formOpen = showAddForm || Boolean(editingAsset);
  const closeForm = () => { setShowAddForm(false); setEditingAsset(null); };
  const initialLoading = loading && assets.length === 0;

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
        title="资产清单"        meta={
          <span className="text-[11px] text-text-muted num">
            共 {assets.length} 个资产
            {searchQuery ? ` · 命中 ${filteredAssets.length}` : ''}
          </span>
        }
        actions={
          <>
            <Button variant="soft" icon={Scan}>批量扫描</Button>
            <Button variant="primary" icon={Plus} onClick={() => setShowAddForm(true)}>添加资产</Button>
          </>
        }
        toolbar={
          <>
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              width="lg"
              placeholder="搜索资产名称、标签…"
            />
            <Button variant="secondary" icon={Filter}>筛选</Button>
            <Button variant="secondary" icon={Download}>导出</Button>
          </>
        }
      />

      {selectedAssets.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-primary/25 bg-primary/10 px-3.5 py-2.5">
          <span className="text-[12.5px] text-primary num">已选择 {selectedAssets.length} 项</span>
          <div className="flex-1" />
          <Button variant="danger" size="sm" icon={Trash2} onClick={handleBatchDelete}>
            批量删除
          </Button>
        </div>
      )}

      <SectionCard flush>
        {initialLoading ? (
          <LoadingState label="正在加载资产…" />
        ) : filteredAssets.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title={searchQuery ? '未找到匹配的资产' : '暂无资产数据'}
            description={searchQuery ? '换个关键词试试，或清空搜索条件。' : '通过扫描任务或手动添加把资产纳管进来。'}
            action={
              searchQuery ? (
                <Button variant="soft" onClick={() => setSearchQuery('')}>清空搜索</Button>
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
                      checked={selectedAssets.length === filteredAssets.length && filteredAssets.length > 0}
                      onChange={toggleSelectAll}
                      aria-label="全选"
                    />
                  </th>
                  <th style={{ minWidth: 220 }}>资产名称</th>
                  <th style={{ width: 90 }}>类型</th>
                  <th style={{ width: 90 }}>风险评分</th>
                  <th style={{ minWidth: 150 }}>漏洞统计</th>
                  <th style={{ minWidth: 120 }}>端口/服务</th>
                  <th style={{ width: 120 }}>责任人</th>
                  <th style={{ width: 120 }}>最后扫描</th>
                  <th style={{ width: 132 }} className="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssets.map(asset => {
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
                            {asset.tags.length > 0 && (
                              <div className="mt-1 flex gap-1 flex-wrap">
                                {asset.tags.slice(0, 2).map(tag => (
                                  <span key={tag} className="chip">{tag}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="capitalize">{asset.type}</td>
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
                            onClick={() => handleDeleteAsset(asset.id)} title="删除"
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
      </SectionCard>

      {/* ── 添加 / 编辑资产 ─────────────────────────── */}
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
          <Field label="资产名称/IP/域名" required error={formErrors.name}>
            <input
              type="text"
              placeholder="例如: 192.168.1.1"
              value={formData.name}
              onChange={(e) => { setFormData({ ...formData, name: e.target.value }); setFormErrors({ ...formErrors, name: undefined }); }}
              className="app-input"
            />
          </Field>

          <Field label="资产类型">
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as 'ip' | 'domain' | 'service' })}
              className="app-select"
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

      {/* ── 资产详情 ───────────────────────────────── */}
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
                  {selectedAsset.type} · ID: {selectedAsset.id}
                </p>
              </div>
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
                      {
                        label: '最后扫描',
                        value: selectedAsset.lastScan
                          ? new Date(selectedAsset.lastScan).toLocaleString()
                          : '',
                      },
                      { label: '位置', value: '北京机房' },
                      { label: '部门', value: '运维部' },
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
                          : (selectedAsset.assessedRiskScore ?? selectedAsset.riskScore) >= 60 ? '中风险' : '低风险'}
                      </p>
                    </div>
                  </div>
                </SectionCard>
              </div>
            )}

            {activeTab === 'ports' && (
              <SectionCard flush title="端口与服务" description={`共 ${selectedAsset.ports.length} 个端口`}>
                {selectedAsset.ports.length === 0 ? (
                  <EmptyState compact icon={Activity} title="暂无端口信息" />
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
                            <td className="font-mono text-text-primary num">{port.port}</td>
                            <td>{port.service || '-'}</td>
                            <td className="text-text-muted">{port.version || '-'}</td>
                            <td><StatusBadge tone="success" dot>开放</StatusBadge></td>
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
                actions={
                  <Button
                    variant="ghost" size="sm" icon={RefreshCw}
                    onClick={async () => {
                      try { await scansApi.startScan(selectedAsset.lastScanId || 0); } catch { /* 保持原有静默行为 */ }
                    }}
                  >
                    刷新
                  </Button>
                }
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
                    description="请创建域名收集扫描任务"
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
                  <EmptyState compact icon={Globe} title="暂无 Web 指纹数据" />
                </SectionCard>
              )
            )}

            {activeTab === 'history' && (
              <div className="flex flex-col gap-2">
                {['2026-04-27 10:00:00', '2026-04-26 10:00:00', '2026-04-25 10:00:00'].map((time, i) => (
                  <SectionCard key={i} padding="sm" hoverable>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-input bg-primary/12 text-primary">
                        <Scan size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-text-primary">定期扫描</p>
                        <p className="mt-0.5 text-caption text-text-muted num">{time}</p>
                      </div>
                      <StatusBadge tone="success" dot>完成</StatusBadge>
                    </div>
                  </SectionCard>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </ContentContainer>
  );
}
