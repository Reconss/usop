import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Filter, Plus, Download, Scan, MoreHorizontal, X, Globe, Server, Shield, Tag, User, Clock, Edit2, Trash2, Check, Copy, Eye, EyeOff, ChevronRight, ChevronDown, FileText, Activity, MapPin, Cpu, Database, Layers, AlertCircle, Loader2, CheckCircle2
} from 'lucide-react';
import type { Asset } from '../types';
import { assetsApi } from '../services/api';

const RiskRing = ({ score, assessedScore }: { score: number; assessedScore?: number }) => {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const displayScore = assessedScore ?? score;
  const strokeDashoffset = circumference - (displayScore / 100) * circumference;
  const color = displayScore >= 80 ? '#F2545B' : displayScore >= 60 ? '#FF9A3C' : displayScore >= 40 ? '#FFD166' : '#10B981';
  return (
    <div className="relative w-10 h-10 flex items-center justify-center group">
      <svg className="w-10 h-10 transform -rotate-90">
        <circle cx="20" cy="20" r={radius} fill="none" stroke="#334155" strokeWidth="3" />
        <circle cx="20" cy="20" r={radius} fill="none" stroke={color} strokeWidth="3" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" className="transition-all duration-500" />
      </svg>
      <span className="absolute text-xs font-semibold" style={{ color }}>{displayScore}</span>
      {assessedScore !== undefined && assessedScore !== score && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
          原始: {score} | 测评: {assessedScore}
        </div>
      )}
    </div>
  );
};

const VulnStatsBadge = ({ stats }: { stats?: { critical: number; high: number; medium: number; low: number; total: number } }) => {
  if (!stats || stats.total === 0) return <span className="text-xs text-text-muted">-</span>;
  return (
    <div className="flex items-center gap-1">
      {stats.critical > 0 && <span className="px-1.5 py-0.5 bg-rose-500/20 text-rose-400 text-xs rounded font-medium">{stats.critical}</span>}
      {stats.high > 0 && <span className="px-1.5 py-0.5 bg-orange-500/20 text-orange-400 text-xs rounded font-medium">{stats.high}</span>}
      {stats.medium > 0 && <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded font-medium">{stats.medium}</span>}
      {stats.low > 0 && <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded font-medium">{stats.low}</span>}
      <span className="text-xs text-text-muted ml-1">共{stats.total}</span>
    </div>
  );
};

const EmptyState = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
      <Database className="w-8 h-8 text-gray-400" />
    </div>
    <p className="text-gray-500 text-sm">{message}</p>
  </div>
);

const LoadingState = () => (
  <div className="flex flex-col items-center justify-center py-16">
    <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
    <p className="text-text-secondary text-sm">加载中...</p>
  </div>
);

const Toast = ({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) => {
  React.useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);
  return (
    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 ${type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
      {type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
      <span className="text-sm font-medium">{message}</span>
    </motion.div>
  );
};

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
          setAssets(items);
        }
      } catch (error) {
        console.error('获取资产列表失败:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchAssets();
  }, []);
  const [activeTab, setActiveTab] = useState<'basic' | 'ports' | 'vulnerabilities' | 'history'>('basic');
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [formErrors, setFormErrors] = useState<{ name?: string }>({});
  const [formData, setFormData] = useState({ name: '', type: 'ip' as 'ip' | 'domain' | 'service', owner: '', tags: '', description: '', location: '', department: '' });

  const filteredAssets = useMemo(() => {
    return assets.filter(a =>
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [assets, searchQuery]);

  const showToast = (message: string, type: 'success' | 'error') => setToast({ message, type });

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

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">资产清单</h1>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors">
            <Scan className="w-4 h-4" />批量扫描
          </button>
          <button onClick={() => setShowAddForm(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors">
            <Plus className="w-4 h-4" />添加资产
          </button>
        </div>
      </div>

      <AnimatePresence>
        {(showAddForm || editingAsset) && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-40" onClick={() => { setShowAddForm(false); setEditingAsset(null); }} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
              <div className="glass-card rounded-xl p-6 w-[600px] pointer-events-auto max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-text-primary">{editingAsset ? '编辑资产' : '添加新资产'}</h2>
                  <button onClick={() => { setShowAddForm(false); setEditingAsset(null); }} className="p-2 text-text-secondary hover:text-text-primary"><X className="w-5 h-5" /></button>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-text-secondary text-sm mb-2">资产名称/IP/域名 <span className="text-critical">*</span></label>
                      <input type="text" placeholder="例如: 192.168.1.1" value={formData.name} onChange={(e) => { setFormData({ ...formData, name: e.target.value }); setFormErrors({ ...formErrors, name: undefined }); }} className={`w-full px-3 py-2 bg-page-bg border rounded-lg text-text-primary focus:outline-none focus:border-primary ${formErrors.name ? 'border-rose-500' : 'border-border-color'}`} />
                      {formErrors.name && <p className="text-rose-500 text-xs mt-1">{formErrors.name}</p>}
                    </div>
                    <div>
                      <label className="block text-text-secondary text-sm mb-2">资产类型</label>
                      <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value as 'ip' | 'domain' | 'service' })} className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none">
                        <option value="ip">IP地址</option>
                        <option value="domain">域名</option>
                        <option value="service">服务</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-text-secondary text-sm mb-2">责任人</label>
                      <input type="text" placeholder="输入责任人" value={formData.owner} onChange={(e) => setFormData({ ...formData, owner: e.target.value })} className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-text-secondary text-sm mb-2">所属部门</label>
                      <input type="text" placeholder="例如: 运维部" value={formData.department} onChange={(e) => setFormData({ ...formData, department: e.target.value })} className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-text-secondary text-sm mb-2">物理位置</label>
                    <input type="text" placeholder="例如: 北京机房-A区" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-text-secondary text-sm mb-2">标签（用逗号分隔）</label>
                    <input type="text" placeholder="production, web, critical" value={formData.tags} onChange={(e) => setFormData({ ...formData, tags: e.target.value })} className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-text-secondary text-sm mb-2">资产描述</label>
                    <textarea rows={3} placeholder="输入资产描述..." value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none resize-none" />
                  </div>
                  <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border-color">
                    <button onClick={() => { setShowAddForm(false); setEditingAsset(null); }} className="px-4 py-2 text-text-secondary hover:text-text-primary">取消</button>
                    <button onClick={editingAsset ? handleEditAsset : handleAddAsset} disabled={loading} className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg flex items-center gap-2 disabled:opacity-50">
                      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                      {editingAsset ? '保存' : '添加'}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="glass-card rounded-xl p-4 flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input type="text" placeholder="搜索资产名称、标签..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:outline-none focus:border-primary" />
        </div>
        <button className="flex items-center gap-2 px-4 py-2 border border-border-color rounded-lg text-text-secondary hover:bg-white/5"><Filter className="w-4 h-4" />筛选</button>
        <button className="flex items-center gap-2 px-4 py-2 border border-border-color rounded-lg text-text-secondary hover:bg-white/5"><Download className="w-4 h-4" />导出</button>
      </div>

      {selectedAssets.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 p-3 bg-primary/10 border border-primary/20 rounded-xl">
          <span className="text-sm text-primary">已选择 {selectedAssets.length} 项</span>
          <div className="flex-1" />
          <button onClick={handleBatchDelete} className="px-3 py-1.5 text-xs bg-rose-600 text-white rounded-lg hover:bg-rose-700">批量删除</button>
        </motion.div>
      )}

      <div className="glass-card rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-page-bg/50">
            <tr className="text-left text-xs text-text-muted border-b border-border-color">
              <th className="p-4 font-medium"><input type="checkbox" checked={selectedAssets.length === filteredAssets.length && filteredAssets.length > 0} onChange={toggleSelectAll} className="w-4 h-4 rounded border-gray-300" /></th>
              <th className="p-4 font-medium">资产名称</th>
              <th className="p-4 font-medium">类型</th>
              <th className="p-4 font-medium">风险评分</th>
              <th className="p-4 font-medium">漏洞统计</th>
              <th className="p-4 font-medium">端口/服务</th>
              <th className="p-4 font-medium">责任人</th>
              <th className="p-4 font-medium">最后扫描</th>
              <th className="p-4 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredAssets.length === 0 ? (
              <tr><td colSpan={9}><EmptyState message={searchQuery ? '未找到匹配的资产' : '暂无资产数据'} /></td></tr>
            ) : (
              filteredAssets.map(asset => (
                <motion.tr key={asset.id} whileHover={{ backgroundColor: 'rgba(255,255,255,0.03)' }} className="border-b border-border-color/50">
                  <td className="p-4"><input type="checkbox" checked={selectedAssets.includes(asset.id)} onChange={e => setSelectedAssets(e.target.checked ? [...selectedAssets, asset.id] : selectedAssets.filter(id => id !== asset.id))} className="w-4 h-4 rounded border-gray-300" /></td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      {asset.type === 'domain' ? <Globe className="w-5 h-5 text-primary" /> : asset.type === 'ip' ? <Server className="w-5 h-5 text-primary" /> : <Shield className="w-5 h-5 text-primary" />}
                      <div>
                        <p className="text-sm font-medium text-text-primary">{asset.name}</p>
                        <div className="flex gap-1 mt-1">{asset.tags.slice(0, 2).map(tag => <span key={tag} className="px-1.5 py-0.5 bg-primary/10 text-primary text-xs rounded">{tag}</span>)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-text-secondary capitalize">{asset.type}</td>
                  <td className="p-4"><RiskRing score={asset.riskScore} assessedScore={asset.assessedRiskScore} /></td>
                  <td className="p-4"><VulnStatsBadge stats={asset.vulnStats} /></td>
                  <td className="p-4">
                    <div className="flex gap-1">
                      {asset.ports.slice(0, 3).map((p, i) => <span key={i} className="px-2 py-1 bg-border-color/50 text-text-secondary text-xs rounded">{p.port}</span>)}
                      {asset.ports.length > 3 && <span className="px-2 py-1 text-text-muted text-xs">+{asset.ports.length - 3}</span>}
                    </div>
                  </td>
                  <td className="p-4 text-sm text-text-secondary">{asset.owner}</td>
                  <td className="p-4 text-sm text-text-secondary">{new Date(asset.lastScan).toLocaleDateString()}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openDetailDrawer(asset)} className="p-2 hover:bg-white/5 rounded-lg transition-colors"><Eye className="w-4 h-4 text-text-secondary" /></button>
                      <button onClick={() => openEditModal(asset)} className="p-2 hover:bg-white/5 rounded-lg transition-colors"><Edit2 className="w-4 h-4 text-text-secondary" /></button>
                      <button onClick={() => handleDeleteAsset(asset.id)} className="p-2 hover:bg-white/5 rounded-lg transition-colors"><Trash2 className="w-4 h-4 text-critical" /></button>
                    </div>
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {showDetail && selectedAsset && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowDetail(false)} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="fixed right-0 top-0 h-full w-[600px] bg-card-bg border-l border-border-color z-50 overflow-auto">
              <div className="p-6 border-b border-border-color flex items-center justify-between">
                <h2 className="text-xl font-semibold text-text-primary">资产详情</h2>
                <button onClick={() => setShowDetail(false)} className="p-2 hover:bg-white/5 rounded-lg transition-colors"><X className="w-5 h-5 text-text-secondary" /></button>
              </div>
              <div className="p-6 space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                    {selectedAsset.type === 'domain' ? <Globe className="w-8 h-8 text-primary" /> : selectedAsset.type === 'ip' ? <Server className="w-8 h-8 text-primary" /> : <Shield className="w-8 h-8 text-primary" />}
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-text-primary">{selectedAsset.name}</h3>
                    <p className="text-sm text-text-secondary">{selectedAsset.type} · ID: {selectedAsset.id}</p>
                  </div>
                </div>

                <div className="flex border-b border-border-color">
                  {[{ id: 'basic', label: '基本信息', icon: FileText }, { id: 'ports', label: '端口服务', icon: Activity }, { id: 'vulnerabilities', label: `漏洞信息${selectedAsset.vulnStats ? ` (${selectedAsset.vulnStats.total})` : ''}`, icon: Shield }, { id: 'history', label: '扫描历史', icon: Clock }].map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${activeTab === tab.id ? 'text-primary border-b-2 border-primary' : 'text-text-secondary hover:text-text-primary'}`}>
                      <tab.icon className="w-4 h-4" />{tab.label}
                    </button>
                  ))}
                </div>

                {activeTab === 'basic' && (
                  <div className="space-y-4">
                    <div className="glass-card rounded-xl p-4">
                      <h4 className="text-sm font-medium text-text-secondary mb-3 flex items-center gap-2"><Tag className="w-4 h-4" />标签</h4>
                      <div className="flex gap-2">{selectedAsset.tags.map(tag => <span key={tag} className="px-2 py-1 bg-primary/20 text-primary text-xs rounded">{tag}</span>)}</div>
                    </div>
                    <div className="glass-card rounded-xl p-4">
                      <h4 className="text-sm font-medium text-text-secondary mb-3">资产信息</h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center gap-2"><User className="w-4 h-4 text-text-muted" /><span className="text-text-secondary">责任人:</span><span className="text-text-primary">{selectedAsset.owner}</span></div>
                        <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-text-muted" /><span className="text-text-secondary">最后扫描:</span><span className="text-text-primary">{new Date(selectedAsset.lastScan).toLocaleString()}</span></div>
                        <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-text-muted" /><span className="text-text-secondary">位置:</span><span className="text-text-primary">北京机房</span></div>
                        <div className="flex items-center gap-2"><Layers className="w-4 h-4 text-text-muted" /><span className="text-text-secondary">部门:</span><span className="text-text-primary">运维部</span></div>
                      </div>
                    </div>
                    <div className="glass-card rounded-xl p-4">
                      <h4 className="text-sm font-medium text-text-secondary mb-3">风险评分</h4>
                      <div className="flex items-center gap-4">
                        <RiskRing score={selectedAsset.riskScore} assessedScore={selectedAsset.assessedRiskScore} />
                        <div>
                          <p className="text-lg font-semibold" style={{ color: (selectedAsset.assessedRiskScore ?? selectedAsset.riskScore) >= 80 ? '#F2545B' : (selectedAsset.assessedRiskScore ?? selectedAsset.riskScore) >= 60 ? '#FF9A3C' : '#10B981' }}>{selectedAsset.assessedRiskScore ?? selectedAsset.riskScore}分</p>
                          <p className="text-xs text-text-muted">{(selectedAsset.assessedRiskScore ?? selectedAsset.riskScore) >= 80 ? '高风险' : (selectedAsset.assessedRiskScore ?? selectedAsset.riskScore) >= 60 ? '中风险' : '低风险'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'ports' && (
                  <div className="glass-card rounded-xl p-4">
                    <h4 className="text-sm font-medium text-text-secondary mb-3">端口与服务</h4>
                    {selectedAsset.ports.length === 0 ? <EmptyState message="暂无端口信息" /> : (
                      <table className="w-full">
                        <thead><tr className="text-left text-xs text-text-muted border-b border-border-color"><th className="pb-2">端口</th><th className="pb-2">服务</th><th className="pb-2">版本</th><th className="pb-2">状态</th></tr></thead>
                        <tbody>{selectedAsset.ports.map((port, i) => (<tr key={i} className="text-sm text-text-secondary"><td className="py-2 font-mono">{port.port}</td><td className="py-2">{port.service}</td><td className="py-2">{port.version || '-'}</td><td className="py-2"><span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">开放</span></td></tr>))}</tbody>
                      </table>
                    )}
                  </div>
                )}

                {activeTab === 'vulnerabilities' && (
                  <div className="space-y-4">
                    {selectedAsset.vulnStats && selectedAsset.vulnStats.total > 0 ? (
                      <>
                        <div className="glass-card rounded-xl p-4">
                          <h4 className="text-sm font-medium text-text-secondary mb-3">漏洞统计</h4>
                          <div className="grid grid-cols-5 gap-3">
                            <div className="text-center p-3 bg-rose-500/10 rounded-lg"><p className="text-lg font-semibold text-rose-400">{selectedAsset.vulnStats.critical}</p><p className="text-xs text-text-muted">危急</p></div>
                            <div className="text-center p-3 bg-orange-500/10 rounded-lg"><p className="text-lg font-semibold text-orange-400">{selectedAsset.vulnStats.high}</p><p className="text-xs text-text-muted">高危</p></div>
                            <div className="text-center p-3 bg-amber-500/10 rounded-lg"><p className="text-lg font-semibold text-amber-400">{selectedAsset.vulnStats.medium}</p><p className="text-xs text-text-muted">中危</p></div>
                            <div className="text-center p-3 bg-blue-500/10 rounded-lg"><p className="text-lg font-semibold text-blue-400">{selectedAsset.vulnStats.low}</p><p className="text-xs text-text-muted">低危</p></div>
                            <div className="text-center p-3 bg-primary/10 rounded-lg"><p className="text-lg font-semibold text-primary">{selectedAsset.vulnStats.total}</p><p className="text-xs text-text-muted">总计</p></div>
                          </div>
                        </div>
                        <div className="glass-card rounded-xl p-4">
                          <h4 className="text-sm font-medium text-text-secondary mb-3">漏洞列表</h4>
                          <div className="space-y-2">{selectedAsset.vulnerabilities?.map((vuln) => (<div key={vuln.vulnId} className="p-3 bg-page-bg/50 rounded-lg border border-border-color/50"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${vuln.severity === 'critical' ? 'bg-rose-500' : vuln.severity === 'high' ? 'bg-orange-500' : vuln.severity === 'medium' ? 'bg-amber-500' : 'bg-blue-500'}`} /><span className="text-sm font-medium text-text-primary">{vuln.name}</span></div><span className={`px-2 py-0.5 text-xs rounded ${vuln.status === 'open' ? 'bg-rose-500/20 text-rose-400' : vuln.status === 'fixed' ? 'bg-emerald-500/20 text-emerald-400' : vuln.status === 'in_progress' ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-500/20 text-gray-400'}`}>{vuln.status === 'open' ? '未修复' : vuln.status === 'fixed' ? '已修复' : vuln.status === 'in_progress' ? '修复中' : '已忽略'}</span></div><div className="flex items-center gap-4 mt-2 text-xs text-text-muted"><span>ID: {vuln.vulnId}</span><span>CVSS: {vuln.cvssScore}</span>{vuln.assessedScore !== undefined && <span className="text-primary">测评: {vuln.assessedScore}</span>}<span>发现时间: {new Date(vuln.discoveredAt).toLocaleDateString()}</span></div></div>))}</div>
                        </div>
                      </>
                    ) : <EmptyState message="暂无漏洞信息" />}
                  </div>
                )}

                {activeTab === 'history' && (
                  <div className="space-y-3">
                    {['2026-04-27 10:00:00', '2026-04-26 10:00:00', '2026-04-25 10:00:00'].map((time, i) => (
                      <div key={i} className="glass-card rounded-xl p-4 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><Scan className="w-5 h-5 text-primary" /></div>
                        <div className="flex-1"><p className="text-sm font-medium text-text-primary">定期扫描</p><p className="text-xs text-text-muted">{time}</p></div>
                        <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">完成</span>
                      </div>
                    ))}
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
