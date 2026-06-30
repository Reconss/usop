import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Play, Pause, RotateCcw, FileText, X, Globe, Shield, Server, Target,
  Clock, Calendar, Download, Filter, Search, RefreshCw, ChevronRight, Trash2,
  Eye, Check, AlertTriangle, Loader2, Zap, Activity, BarChart3, Layers,
  Settings, Edit3, Copy, Terminal, Save, ArrowUpDown, MapPin, Bookmark
} from 'lucide-react';
import { scansApi, assetsApi, request } from '../services/api';

// ==================== 类型定义 ====================

interface ScanTarget {
  id: string; target: string; type: 'ip' | 'domain' | 'cidr';
  group?: string; tags: string[]; notes?: string; createdAt: string; lastScan?: string;
}

interface ScanTemplate {
  id: string; name: string; description: string; icon: React.ElementType;
  color: string; phases: string[]; estTime: string; risk: 'low' | 'medium' | 'high';
}

interface ScanResult {
  id: number; type: string; target: string; data: any; createdAt: string;
}

// ==================== 扫描模板 ====================

const SCAN_TEMPLATES: ScanTemplate[] = [
  { id: 'quick', name: '快速扫描', description: '常见端口 + Web标题探测', icon: Zap, color: 'text-emerald-400', phases: ['port', 'web'], estTime: '1-2分钟', risk: 'low' },
  { id: 'port', name: '端口扫描', description: '全端口 + 服务版本识别', icon: Server, color: 'text-blue-400', phases: ['port', 'service'], estTime: '5-10分钟', risk: 'low' },
  { id: 'web', name: 'Web 指纹', description: 'HTTP标题、技术栈、状态码', icon: Globe, color: 'text-cyan-400', phases: ['port', 'web'], estTime: '2-5分钟', risk: 'low' },
  { id: 'subdomain', name: '域名收集', description: '子域名爆破 + DNS 枚举', icon: Layers, color: 'text-purple-400', phases: ['dns'], estTime: '1-3分钟', risk: 'low' },
  { id: 'vuln', name: '漏洞扫描', description: 'Nuclei 模板扫描(Critical/High)', icon: Shield, color: 'text-rose-400', phases: ['port', 'web', 'vuln'], estTime: '10-30分钟', risk: 'high' },
  { id: 'full', name: '全面审计', description: 'DNS + 全端口 + 服务 + Web + 漏洞', icon: Activity, color: 'text-orange-400', phases: ['dns', 'port', 'service', 'web', 'vuln'], estTime: '30-60分钟', risk: 'medium' },
];

// ==================== 主组件 ====================

export default function ScanCenter() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'targets' | 'tasks' | 'results'>('dashboard');
  const [tasks, setTasks] = useState<any[]>([]);
  const [targets, setTargets] = useState<ScanTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [scanResults, setScanResults] = useState<any[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  
  // 扫描统计
  const scanStats = useMemo(() => {
    const total = tasks.length;
    const running = tasks.filter(t => t.status === 'running').length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const failed = tasks.filter(t => t.status === 'failed').length;
    return { total, running, completed, failed };
  }, [tasks]);
  const [showResults, setShowResults] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [showNewTarget, setShowNewTarget] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [selectedTarget, setSelectedTarget] = useState<ScanTarget | null>(null);
  const [newTaskForm, setNewTaskForm] = useState({ target: '', template: 'quick', name: '', schedule: 'once', cron: '' });
  const [newTargetForm, setNewTargetForm] = useState({ target: '', type: 'ip' as 'ip' | 'domain' | 'cidr', group: '', tags: '', notes: '' });

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast({ message: msg, type }); setTimeout(() => setToast(null), 3000); };

  // ==================== 数据加载 ====================

  const fetchTasks = async () => {
    try {
      const res = await scansApi.getScans({ page_size: 100 });
      if (res.success && res.data) {
        const items = Array.isArray(res.data) ? res.data : res.data.items || [];
        const typeLabels: Record<string, string> = { port: '端口扫描', web: 'Web指纹', subdomain: '域名收集', full: '全面审计', service: '服务识别', vuln: '漏洞扫描', quick: '快速扫描' };
        setTasks(items.map((t: any) => ({
          id: String(t.id), target: t.target || t.name || '', type: typeLabels[t.type] || t.type || '端口扫描',
          status: t.status || 'queued', progress: t.progress ?? 0, createdAt: t.created_at || '',
          completedAt: t.completed_at || '', results: t.results || {}
        })));
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    Promise.all([fetchTasks()]).finally(() => setLoading(false));
    const iv = setInterval(fetchTasks, 5000);
    return () => clearInterval(iv);
  }, []);

  // ==================== 操作 ====================

  const handleCreateTask = async () => {
    if (!newTaskForm.target) return;
    try {
      const res = await scansApi.createScan({ name: newTaskForm.name || newTaskForm.target, type: newTaskForm.template, target: newTaskForm.target, config: { schedule: newTaskForm.schedule } });
      if (res.success && res.data) { await scansApi.startScan(res.data.id); fetchTasks(); showToast('任务已创建并启动', 'success'); }
    } catch { showToast('创建失败', 'error'); }
    setShowNewTask(false);
  };

  const handleStartTask = async (id: number) => { try { await scansApi.startScan(id); fetchTasks(); showToast('任务已启动', 'success'); } catch { showToast('启动失败', 'error'); } };
  const handleStopTask = async (id: number) => { try { await scansApi.stopScan(id); fetchTasks(); showToast('任务已暂停', 'success'); } catch { showToast('暂停失败', 'error'); } };
  const handleResumeTask = async (id: number) => { try { await scansApi.resumeScan(id); fetchTasks(); showToast('任务已恢复', 'success'); } catch { showToast('恢复失败', 'error'); } };
  const handleDeleteTask = async (id: string) => { try { setDeleteConfirm(null); await request(`/scans-api/tasks/${id}`, { method: 'DELETE' }); fetchTasks(); showToast('已删除', 'success'); } catch { showToast('删除失败', 'error'); } };

  const fetchResults = async (taskId: number) => {
    setResultsLoading(true);
    try { const res = await request(`/scans-api/tasks/${taskId}/results`); if (res.success) setScanResults(res.data?.items || []); else setScanResults([]); } catch { setScanResults([]); }
    setResultsLoading(false);
  };
  const openResultViewer = async (task: any) => { setSelectedTask(task); await fetchResults(Number(task.id)); setShowResults(true); };

  const handleSyncToAssets = async (taskId: number) => {
    try {
      const res = await request(`/assets-api/assets/sync-scan/${taskId}`, { method: 'POST' });
      if (res.success) { const d = res.data?.imported || {}; const ps = []; if (d.ports) ps.push(`${d.ports}个端口`); if (d.vulns) ps.push(`${d.vulns}个漏洞`); if (d.web) ps.push(`${d.web}个Web`); if (d.subdomains) ps.push(`${d.subdomains}子域名`); showToast(`同步完成: ${ps.join(', ') || '无新数据'}`, 'success'); }
    } catch { showToast('同步失败', 'error'); }
  };

  // ==================== 模板选择 ====================

  const scanTypes = [
    { value: 'quick', label: '快速扫描', icon: Zap, desc: '常见端口 + HTTP标题' },
    { value: 'port', label: '端口扫描', icon: Server, desc: '全端口 + 服务识别' },
    { value: 'web', label: 'Web指纹', icon: Globe, desc: 'HTTP标题/技术栈/状态码' },
    { value: 'subdomain', label: '域名收集', icon: Layers, desc: '子域名爆破 + DNS枚举' },
    { value: 'vuln', label: '漏洞扫描', icon: Shield, desc: 'Nuclei模板扫描' },
    { value: 'full', label: '全面审计', icon: Activity, desc: 'DNS+端口+服务+Web+漏洞' },
  ];

  // ==================== 统计数据 ====================

  const stats = {
    total: tasks.length,
    running: tasks.filter(t => t.status === 'running').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    failed: tasks.filter(t => t.status === 'failed').length,
    targets: targets.length,
  };

  const getStatusBadge = (s: string) => {
    const m: Record<string, string> = { running: 'bg-blue-500/20 text-blue-400', completed: 'bg-emerald-500/20 text-emerald-400', queued: 'bg-amber-500/20 text-amber-400', failed: 'bg-rose-500/20 text-rose-400', paused: 'bg-gray-500/20 text-gray-400' };
    return m[s] || 'bg-gray-500/20 text-gray-400';
  };
  const getStatusText = (s: string) => ({ running: '运行中', completed: '已完成', queued: '等待中', failed: '失败', paused: '已暂停' })[s] || s;

  // ==================== 渲染 ====================

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">扫描中心</h1>
          <p className="text-text-secondary text-sm mt-1">攻击面发现 · 资产探测 · 漏洞评估</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowNewTarget(true)} className="flex items-center gap-2 px-3 py-2 bg-card-bg border border-border-color text-text-secondary rounded-xl text-sm hover:text-primary transition-colors">
            <Bookmark className="w-4 h-4" />管理目标
          </button>
          <button onClick={() => setShowNewTask(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-hover transition-all">
            <Plus className="w-4 h-4" />新建扫描
          </button>
        </div>
      </div>

      {/* ==================== 统计卡片 ==================== */}
      <div className="grid grid-cols-5 gap-4">
        {[
          { label: '总任务', value: stats.total, icon: Activity, color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { label: '运行中', value: stats.running, icon: Loader2, color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { label: '已完成', value: stats.completed, icon: Check, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: '失败', value: stats.failed, icon: AlertTriangle, color: 'text-rose-400', bg: 'bg-rose-500/10' },
          { label: '扫描目标', value: stats.targets, icon: Target, color: 'text-purple-400', bg: 'bg-purple-500/10' },
        ].map((stat, i) => (
          <div key={i} className="bg-card-bg border border-border-color rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center`}><stat.icon className={`w-5 h-5 ${stat.color}`} /></div>
              <div><div className="text-2xl font-bold text-text-primary">{stat.value}</div><div className="text-xs text-text-muted">{stat.label}</div></div>
            </div>
          </div>
        ))}
      </div>

      {/* ==================== 模板快速启动 ==================== */}
      <div className="bg-card-bg border border-border-color rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2"><Zap className="w-4 h-4 text-amber-400" />快速扫描模板</h3>
        <div className="grid grid-cols-6 gap-3">
          {SCAN_TEMPLATES.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => { setNewTaskForm({ ...newTaskForm, template: t.id }); setShowNewTask(true); }}
                className="p-3 rounded-xl border border-border-color hover:border-primary/50 hover:bg-primary/5 transition-all text-left group">
                <Icon className={`w-6 h-6 ${t.color} mb-2 group-hover:scale-110 transition-transform`} />
                <p className="text-sm font-medium text-text-primary">{t.name}</p>
                <p className="text-[10px] text-text-muted mt-1">{t.description}</p>
                <p className="text-[10px] text-text-muted mt-1">⏱ {t.estTime}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ==================== 标签切换 ==================== */}
      <div className="flex gap-1 bg-page-bg p-0.5 rounded-lg border border-border-color w-fit">
        {[
          { id: 'dashboard', label: '任务列表', icon: Activity },
          { id: 'targets', label: '目标管理', icon: Target },
          { id: 'results', label: '扫描结果', icon: FileText },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${activeTab === tab.id ? 'bg-card-bg text-text-primary shadow-sm border border-border-color' : 'text-text-muted hover:text-text-secondary'}`}>
            <tab.icon className="w-3.5 h-3.5" />{tab.label}
          </button>
        ))}
      </div>

      {/* ==================== 任务列表 ==================== */}
      {activeTab === 'dashboard' && (
        <div className="glass-card rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-page-bg/50 border-b border-border-color">
              <tr>
                <th className="text-left py-3 px-4 text-text-secondary font-medium text-xs">目标</th>
                <th className="text-left py-3 px-4 text-text-secondary font-medium text-xs">模板</th>
                <th className="text-left py-3 px-4 text-text-secondary font-medium text-xs">状态</th>
                <th className="text-left py-3 px-4 text-text-secondary font-medium text-xs">进度</th>
                <th className="text-left py-3 px-4 text-text-secondary font-medium text-xs">创建时间</th>
                <th className="text-right py-3 px-4 text-text-secondary font-medium text-xs">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-color/50">
              {tasks.length === 0 && (
                <tr><td colSpan={6} className="py-12 text-center text-text-muted text-sm">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>暂无扫描任务</p>
                  <button onClick={() => setShowNewTask(true)} className="text-primary text-xs mt-1 hover:underline">创建第一个扫描</button>
                </td></tr>
              )}
              {tasks.map((task, i) => (
                <tr key={task.id} className="hover:bg-primary/5 transition-colors">
                  <td className="py-3 px-4"><span className="text-sm font-mono text-text-primary">{task.target}</span></td>
                  <td className="py-3 px-4"><span className="text-xs text-text-secondary">{task.type}</span></td>
                  <td className="py-3 px-4"><span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusBadge(task.status)}`}>{getStatusText(task.status)}</span></td>
                  <td className="py-3 px-4">
                    {task.status === 'running' ? (
                      <div className="flex items-center gap-2"><div className="w-20 h-1.5 bg-page-bg rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${task.progress}%` }} /></div><span className="text-xs text-text-muted">{task.progress}%</span></div>
                    ) : task.status === 'completed' ? <span className="text-xs text-emerald-400">✓ {task.progress}%</span> : <span className="text-xs text-text-muted">-</span>}
                  </td>
                  <td className="py-3 px-4"><span className="text-xs text-text-muted">{task.createdAt ? new Date(task.createdAt).toLocaleString() : '-'}</span></td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => { setSelectedTask(task); setShowDetail(true); }} className="p-1.5 hover:bg-primary/10 text-text-secondary hover:text-primary rounded-lg" title="详情"><FileText className="w-3.5 h-3.5" /></button>
                      {task.status === 'running' && <button onClick={() => handleStopTask(Number(task.id))} className="p-1.5 hover:bg-yellow-500/20 text-yellow-500 rounded-lg" title="暂停"><Pause className="w-3.5 h-3.5" /></button>}
                      {task.status === 'queued' && <button onClick={() => handleStartTask(Number(task.id))} className="p-1.5 hover:bg-blue-500/20 text-blue-500 rounded-lg" title="启动"><Play className="w-3.5 h-3.5" /></button>}
                      {task.status === 'paused' && <button onClick={() => handleResumeTask(Number(task.id))} className="p-1.5 hover:bg-blue-500/20 text-blue-500 rounded-lg" title="恢复"><Play className="w-3.5 h-3.5" /></button>}
                      {task.status === 'completed' && <button onClick={() => openResultViewer(task)} className="p-1.5 hover:bg-blue-500/20 text-blue-500 rounded-lg" title="查看结果"><Eye className="w-3.5 h-3.5" /></button>}
                      {task.status === 'completed' && <button onClick={() => handleSyncToAssets(Number(task.id))} className="p-1.5 hover:bg-green-500/20 text-green-500 rounded-lg" title="同步到资产"><FileText className="w-3.5 h-3.5" /></button>}
                      <button onClick={() => setDeleteConfirm(task.id)} className="p-1.5 hover:bg-red-500/20 text-text-secondary hover:text-red-500 rounded-lg" title="删除"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ==================== 目标管理 ==================== */}
      {activeTab === 'targets' && (
        <div className="glass-card rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2"><Target className="w-4 h-4 text-primary" />扫描目标</h3>
            <button onClick={() => setShowNewTarget(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition-colors"><Plus className="w-3.5 h-3.5" />添加目标</button>
          </div>
          {targets.length === 0 ? (
            <div className="text-center py-12 text-text-muted"><Target className="w-8 h-8 mx-auto mb-2 opacity-50" /><p className="text-sm">暂无扫描目标</p><button onClick={() => setShowNewTarget(true)} className="text-primary text-xs mt-1 hover:underline">添加第一个目标</button></div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {targets.map(t => (
                <div key={t.id} className="p-3 bg-page-bg rounded-lg border border-border-color hover:border-primary/30 transition-colors cursor-pointer" onClick={() => setSelectedTarget(t)}>
                  <div className="flex items-center gap-2"><Globe className="w-4 h-4 text-primary" /><span className="text-sm font-mono text-text-primary font-medium">{t.target}</span></div>
                  <div className="flex items-center gap-2 mt-1"><span className="text-[10px] px-1.5 py-0.5 rounded bg-page-bg text-text-muted">{t.type}</span><span className="text-[10px] text-text-muted">{t.group || '未分组'}</span></div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================== 扫描结果 ==================== */}
      {activeTab === 'results' && (
        <div className="glass-card rounded-xl p-6">
          <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" />已完成扫描</h3>
          {tasks.filter(t => t.status === 'completed').length === 0 ? (
            <div className="text-center py-10 text-text-muted"><BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" /><p className="text-sm">暂无完成的任务</p></div>
          ) : (
            <div className="space-y-2">{tasks.filter(t => t.status === 'completed').map(task => (
              <div key={task.id} onClick={() => openResultViewer(task)} className="flex items-center justify-between p-3 bg-page-bg rounded-lg border border-border-color hover:border-primary/30 transition-colors cursor-pointer">
                <div><div className="text-sm font-mono text-text-primary">{task.target}</div><div className="text-xs text-text-muted">{task.type} · {task.createdAt ? new Date(task.createdAt).toLocaleString() : '-'}</div></div>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </div>
            ))}</div>
          )}
        </div>
      )}

      {/* ==================== 新建任务弹窗 ==================== */}
      <AnimatePresence>{showNewTask && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowNewTask(false)} />
      )}</AnimatePresence>
      <AnimatePresence>{showNewTask && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-card-bg border border-border-color rounded-xl p-6 w-[520px] pointer-events-auto max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5"><h2 className="text-lg font-semibold text-text-primary">新建扫描任务</h2><button onClick={() => setShowNewTask(false)} className="p-1 text-text-secondary hover:text-text-primary"><X className="w-5 h-5" /></button></div>
            <div className="space-y-4">
              <div><label className="block text-sm text-text-secondary mb-1.5">扫描目标 <span className="text-critical">*</span></label>
                <input value={newTaskForm.target} onChange={e => setNewTaskForm({ ...newTaskForm, target: e.target.value })} placeholder="IP、域名或CIDR" className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-sm text-text-primary focus:border-primary focus:outline-none font-mono" />
              </div>
              <div><label className="block text-sm text-text-secondary mb-1.5">扫描模板</label>
                <div className="grid grid-cols-3 gap-2">
                  {scanTypes.map(st => {
                    const Icon = st.icon;
                    return (
                      <button key={st.value} onClick={() => setNewTaskForm({ ...newTaskForm, template: st.value })}
                        className={`p-2.5 rounded-lg border text-left transition-all ${newTaskForm.template === st.value ? 'border-primary bg-primary/10' : 'border-border-color hover:border-primary/50'}`}>
                        <Icon className={`w-4 h-4 mb-1 ${newTaskForm.template === st.value ? 'text-primary' : 'text-text-secondary'}`} />
                        <p className={`text-xs font-medium ${newTaskForm.template === st.value ? 'text-primary' : 'text-text-primary'}`}>{st.label}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-border-color">
                <button onClick={() => setShowNewTask(false)} className="px-4 py-2 text-sm text-text-secondary rounded-lg hover:bg-card-bg-hover">取消</button>
                <button onClick={handleCreateTask} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover">创建并启动</button>
              </div>
            </div>
          </div>
        </motion.div>
      )}</AnimatePresence>

      {/* ==================== 详情抽屉 ==================== */}
      <AnimatePresence>{showDetail && selectedTask && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowDetail(false)} />
      )}</AnimatePresence>
      <AnimatePresence>{showDetail && selectedTask && (
        <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="fixed right-0 top-0 h-full w-[480px] bg-card-bg border-l border-border-color z-50 overflow-auto">
          <div className="p-5">
            <div className="flex items-center justify-between mb-5"><h3 className="text-base font-semibold text-text-primary">任务详情</h3><button onClick={() => setShowDetail(false)} className="p-1 text-text-secondary hover:text-text-primary"><X className="w-5 h-5" /></button></div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-xs text-text-muted">目标</div><div className="font-mono text-text-primary">{selectedTask.target}</div></div>
                <div><div className="text-xs text-text-muted">模板</div><div className="text-text-primary">{selectedTask.type}</div></div>
                <div><div className="text-xs text-text-muted">状态</div><span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusBadge(selectedTask.status)}`}>{getStatusText(selectedTask.status)}</span></div>
                <div><div className="text-xs text-text-muted">创建时间</div><div className="text-text-primary">{selectedTask.createdAt ? new Date(selectedTask.createdAt).toLocaleString() : '-'}</div></div>
              </div>
              {selectedTask.status === 'completed' && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                  <p className="text-xs text-emerald-400 font-medium">扫描完成</p>
                  <button onClick={() => { handleSyncToAssets(Number(selectedTask.id)); setShowDetail(false); }} className="mt-2 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs hover:bg-emerald-500">同步到资产清单</button>
                </div>
              )}
              {selectedTask.status === 'failed' && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg"><p className="text-xs text-rose-400">扫描失败: {selectedTask.results?.error || '未知错误'}</p></div>
              )}
            </div>
          </div>
        </motion.div>
      )}</AnimatePresence>

      {/* ==================== 新建目标弹窗 ==================== */}
      <AnimatePresence>{showNewTarget && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowNewTarget(false)} />
      )}</AnimatePresence>
      <AnimatePresence>{showNewTarget && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-card-bg border border-border-color rounded-xl p-6 w-[460px] pointer-events-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h2 className="text-base font-semibold text-text-primary">添加扫描目标</h2><button onClick={() => setShowNewTarget(false)} className="p-1 text-text-secondary hover:text-text-primary"><X className="w-5 h-5" /></button></div>
            <div className="space-y-3">
              <div><label className="block text-xs text-text-secondary mb-1">目标地址</label><input value={newTargetForm.target} onChange={e => setNewTargetForm({ ...newTargetForm, target: e.target.value })} placeholder="example.com 或 192.168.1.0/24" className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-sm text-text-primary focus:border-primary focus:outline-none font-mono" /></div>
              <div><label className="block text-xs text-text-secondary mb-1">类型</label>
                <div className="flex gap-2">{['ip', 'domain', 'cidr'].map(t => (<button key={t} onClick={() => setNewTargetForm({ ...newTargetForm, type: t as any })} className={`px-3 py-1.5 rounded-lg text-xs border ${newTargetForm.type === t ? 'border-primary bg-primary/10 text-primary' : 'border-border-color text-text-secondary'}`}>{t.toUpperCase()}</button>))}</div>
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-border-color">
                <button onClick={() => setShowNewTarget(false)} className="px-4 py-2 text-sm text-text-secondary rounded-lg hover:bg-card-bg-hover">取消</button>
                <button onClick={() => { targets.push({ id: String(Date.now()), target: newTargetForm.target, type: newTargetForm.type, tags: [], createdAt: new Date().toISOString() }); setShowNewTarget(false); showToast('目标已添加', 'success'); }} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover">添加</button>
              </div>
            </div>
          </div>
        </motion.div>
      )}</AnimatePresence>

      {/* ==================== Toast ==================== */}
      {toast && (
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 ${toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
          {toast.type === 'success' ? <Check className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </motion.div>
      )}

      {/* 扫描结果查看器 */}
      {showResults && selectedTask && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowResults(false)} />
      )}
      {showResults && selectedTask && (
        <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} className="fixed right-0 top-0 h-full w-[600px] bg-card-bg border-l border-border-color z-50 overflow-auto">
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-text-primary">扫描结果: {selectedTask.target}</h3>
              <button onClick={() => setShowResults(false)} className="p-1 text-text-secondary hover:text-text-primary"><X className="w-5 h-5" /></button>
            </div>
            <div className="text-xs text-text-muted mb-4">{selectedTask.type} · {selectedTask.createdAt ? new Date(selectedTask.createdAt).toLocaleString() : '-'}</div>
            <button onClick={() => { handleSyncToAssets(Number(selectedTask.id)); setShowResults(false); }}
              className="w-full mb-4 px-4 py-2 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition-colors flex items-center justify-center gap-2">
              <FileText className="w-3.5 h-3.5" />同步到资产清单
            </button>
            {resultsLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : scanResults.length === 0 ? (
              <div className="text-center py-10 text-text-muted">
                <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">暂无结果数据</p>
              </div>
            ) : (
              <div>
                <div className="text-xs text-text-muted mb-2">共 {scanResults.length} 条结果</div>
                <div className="space-y-2">
                  {scanResults.map((r: any, i: number) => {
                    const data = r.result_data || {};
                    const typeLabel: Record<string, string> = { dns: '子域名', port: '端口', web: 'Web服务', service: '服务', vuln: '漏洞', webpath: '路径' };
                    return (
                      <div key={i} className="p-3 bg-page-bg rounded-lg border border-border-color">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">{typeLabel[r.result_type] || r.result_type}</span>
                          <span className="text-xs text-text-secondary font-mono">
                            {data.subdomain || (data.port ? ':' + data.port : '') || data.url || data.path || ''}
                          </span>
                          {data.ip && <span className="text-xs text-text-muted font-mono">({data.ip})</span>}
                          {data.status_code && <span className={'text-xs ' + (data.status_code < 300 ? 'text-emerald-400' : 'text-amber-400')}>{data.status_code}</span>}
                        </div>
                        <pre className="text-xs text-text-muted font-mono whitespace-pre-wrap break-all bg-[#0d1117] p-2 rounded mt-1 max-h-28 overflow-auto">
                          {JSON.stringify(data, null, 2)}
                        </pre>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* 删除确认 */}
      {deleteConfirm && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setDeleteConfirm(null)}>
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-card-bg border border-border-color rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-text-primary mb-2">确认删除</h3>
            <p className="text-sm text-text-secondary mb-5">确定要删除该扫描任务吗？此操作不可撤销。</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm text-text-secondary rounded-lg hover:bg-card-bg-hover">取消</button>
              <button onClick={() => handleDeleteTask(deleteConfirm)} className="px-4 py-2 text-sm bg-rose-600 text-white rounded-lg hover:bg-rose-500">删除</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
