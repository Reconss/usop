import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Play, Pause, RotateCcw, FileText, X, Globe, Shield, Server, Target,
  Clock, Check, AlertTriangle, Loader2, Zap, Activity, BarChart3, Eye,
  Trash2, Search, RefreshCw, ChevronRight, Bookmark, Layers, Wifi, Bug, Upload
} from 'lucide-react';
import { scansApi, request } from '../services/api';

// ==================== ARL 风格的任务创建 ====================

export default function ScanConsole() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [showResults, setShowResults] = useState(false);
  
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [scanResults, setScanResults] = useState<any[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [taskForm, setTaskForm] = useState({
    target: '',
    name: '',
    // 模块选项
    subdomain_passive: true,   // 被动子域名收集 (crt.sh)
    subdomain_active: true,    // 主动子域名爆破
    port_scan: true,           // 端口扫描
    fingerprint: true,         // 指纹识别
    dir_scan: false,           // 目录扫描
    vuln_scan: false,          // 漏洞扫描
  });

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast({ message: msg, type }); setTimeout(() => setToast(null), 3000); };

  // ==================== 任务管理 ====================

  const fetchTasks = async () => {
    try {
      const res = await scansApi.getScans({ page_size: 100 });
      if (res.success && res.data) {
        const items = Array.isArray(res.data) ? res.data : res.data.items || [];
        setTasks(items.map((t: any) => ({
          id: String(t.id), target: t.target || '', type: t.name || t.type || '综合扫描',
          status: t.status || 'queued', progress: t.progress ?? 0, createdAt: t.created_at || '',
          completedAt: t.completed_at || '', results: t.results || {}
        })));
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchTasks().finally(() => setLoading(false)); const iv = setInterval(fetchTasks, 5000); return () => clearInterval(iv); }, []);

  // ==================== 创建任务 ====================

  const handleCreateTask = async () => {
    if (!taskForm.target) { showToast('请输入扫描目标', 'error'); return; }
    try {
      // 根据勾选模块确定扫描类型
      let scanType = 'port';
      const modules = [];
      if (taskForm.subdomain_passive || taskForm.subdomain_active) modules.push('域名收集');
      if (taskForm.port_scan) modules.push('端口扫描');
      if (taskForm.fingerprint) modules.push('指纹识别');
      if (taskForm.dir_scan) modules.push('目录扫描');
      if (taskForm.vuln_scan) modules.push('漏洞扫描');
      const typeLabel = modules.join('+') || '综合扫描';

      // 使用 "full" 类型或根据模块选择
      if (taskForm.subdomain_passive || taskForm.subdomain_active) scanType = 'subdomain';
      if (taskForm.port_scan) scanType = "port";
      // 全开时用 full
      if (taskForm.port_scan && taskForm.fingerprint && taskForm.vuln_scan) scanType = 'full';

      const res = await scansApi.createScan({
        name: taskForm.name || typeLabel,
        type: (() => {
          const hasSubdomain = taskForm.subdomain_passive || taskForm.subdomain_active;
          const hasPort = taskForm.port_scan;
          const hasFingerprint = taskForm.fingerprint;
          const hasDir = taskForm.dir_scan;
          const hasVuln = taskForm.vuln_scan;
          const moduleCount = [hasSubdomain, hasPort, hasFingerprint, hasDir, hasVuln].filter(Boolean).length;
          // 选择多个模块或包含漏洞扫描时使用 full 类型
          return hasVuln || moduleCount > 1 ? 'full' : (hasSubdomain ? 'subdomain' : 'port');
        })(),
        target: taskForm.target,
        config: { modules: Object.entries(taskForm).filter(([k, v]) => k !== 'target' && k !== 'name' && v).map(([k]) => k) }
      });
      if (res.success && res.data) {
        await scansApi.startScan(res.data.id);
        fetchTasks();
        showToast('任务已创建并启动', 'success');
        setShowNewTask(false);
      }
    } catch { showToast('创建失败', 'error'); }
  };

  const handleStartTask = async (id: number) => { try { await scansApi.startScan(id); fetchTasks(); showToast('任务已启动', 'success'); } catch { showToast('启动失败', 'error'); } };
  const handleStopTask = async (id: number) => { try { await scansApi.stopScan(id); fetchTasks(); showToast('任务已暂停', 'success'); } catch { showToast('暂停失败', 'error'); } };
  const handleResumeTask = async (id: number) => { try { await scansApi.resumeScan(id); fetchTasks(); showToast('任务已恢复', 'success'); } catch { showToast('恢复失败', 'error'); } };

  const handleDeleteTask = async (id: string) => {
    try { setDeleteConfirm(null); await request(`/scans-api/tasks/${id}`, { method: 'DELETE' }); fetchTasks(); showToast('已删除', 'success'); }
    catch { showToast('删除失败', 'error'); }
  };

  const handleSyncToAssets = async (taskId: number) => {
    try {
      const res = await request(`/assets-api/assets/sync-scan/${taskId}`, { method: 'POST' });
      if (res.success) {
        const d = res.data?.imported || {};
        const parts = []; if (d.ports) parts.push(`${d.ports}个端口`); if (d.vulns) parts.push(`${d.vulns}个漏洞`);
        if (d.web) parts.push(`${d.web}个Web`); if (d.subdomains) parts.push(`${d.subdomains}子域名`);
        showToast(`同步完成: ${parts.join(', ') || '无新数据'}`, 'success');
      }
    } catch { showToast('同步失败', 'error'); }
  };

  const openResultViewer = async (task: any) => {
    setSelectedTask(task); setResultsLoading(true);
    try { const res = await request(`/scans-api/tasks/${task.id}/results`); setScanResults(res.data?.items || []); } catch { setScanResults([]); }
    setResultsLoading(false); setShowResults(true);
  };

  // ==================== 状态工具 ====================

  const getStatusBadge = (s: string) => ({ running: 'bg-blue-500/20 text-blue-400', completed: 'bg-emerald-500/20 text-emerald-400', queued: 'bg-amber-500/20 text-amber-400', failed: 'bg-rose-500/20 text-rose-400', paused: 'bg-gray-500/20 text-gray-400' })[s] || 'bg-gray-500/20 text-gray-400';
  const getStatusText = (s: string) => ({ running: '运行中', completed: '已完成', queued: '等待中', failed: '失败', paused: '已暂停' })[s] || s;

  const stats = { total: tasks.length, running: tasks.filter(t => t.status === 'running').length, completed: tasks.filter(t => t.status === 'completed').length, failed: tasks.filter(t => t.status === 'failed').length };

  // ==================== 模块配置 ====================

  const modules = [
    { key: 'subdomain_passive', label: '域名收集(被动)', icon: Search, desc: '从 crt.sh 证书透明度日志收集', color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { key: 'subdomain_active', label: '域名收集(主动)', icon: Layers, desc: 'DNS 字典爆破', color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
    { key: 'port_scan', label: '端口扫描', icon: Server, desc: 'TCP 连接扫描', color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { key: 'fingerprint', label: '指纹识别', icon: Globe, desc: 'HTTP 标题/技术栈识别', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
    { key: 'dir_scan', label: '目录扫描', icon: Wifi, desc: 'Web 路径爆破', color: 'text-orange-400', bg: 'bg-orange-500/10' },
    { key: 'vuln_scan', label: '漏洞扫描', icon: Bug, desc: 'Nuclei 模板扫描', color: 'text-rose-400', bg: 'bg-rose-500/10' },
  ];

  // ==================== 渲染 ====================

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold text-text-primary">扫描控制台</h1><p className="text-text-secondary text-sm mt-1">攻击面发现 · 资产探测 · 综合评估</p></div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-muted">运行中: {stats.running} | 完成: {stats.completed}</span>
          <button onClick={() => setShowNewTask(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-hover transition-all">
            <Plus className="w-4 h-4" />新建任务
          </button>
        </div>
      </div>

      {/* ==================== 统计卡片 ==================== */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: '总任务', value: stats.total, icon: Activity, color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { label: '运行中', value: stats.running, icon: Loader2, color: 'text-blue-400', bg: 'bg-blue-500/10', pulse: stats.running > 0 },
          { label: '已完成', value: stats.completed, icon: Check, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: '失败', value: stats.failed, icon: AlertTriangle, color: 'text-rose-400', bg: 'bg-rose-500/10' },
        ].map((s, i) => (
          <div key={i} className="bg-card-bg border border-border-color rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center`}><s.icon className={`w-5 h-5 ${s.color} ${s.pulse ? 'animate-pulse' : ''}`} /></div>
              <div><div className="text-2xl font-bold text-text-primary">{s.value}</div><div className="text-xs text-text-muted">{s.label}</div></div>
            </div>
          </div>
        ))}
      </div>

      {/* ==================== 任务列表 ==================== */}
      <div className="glass-card rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-page-bg/50 border-b border-border-color">
            <tr>
              <th className="text-left py-3 px-4 text-text-secondary font-medium text-xs">目标</th>
              <th className="text-left py-3 px-4 text-text-secondary font-medium text-xs">模块</th>
              <th className="text-left py-3 px-4 text-text-secondary font-medium text-xs">状态</th>
              <th className="text-left py-3 px-4 text-text-secondary font-medium text-xs">进度</th>
              <th className="text-left py-3 px-4 text-text-secondary font-medium text-xs">时间</th>
              <th className="text-right py-3 px-4 text-text-secondary font-medium text-xs">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-color/50">
            {tasks.length === 0 && (
              <tr><td colSpan={6} className="py-12 text-center text-text-muted text-sm">
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" /><p>暂无任务</p>
                <button onClick={() => setShowNewTask(true)} className="text-primary text-xs mt-1 hover:underline">新建扫描任务</button>
              </td></tr>
            )}
            {tasks.map(t => (
              <tr key={t.id} className="hover:bg-primary/5 transition-colors">
                <td className="py-3 px-4"><span className="text-sm font-mono text-text-primary">{t.target}</span></td>
                <td className="py-3 px-4"><span className="text-xs text-text-secondary">{t.type}</span></td>
                <td className="py-3 px-4"><span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusBadge(t.status)}`}>{getStatusText(t.status)}</span></td>
                <td className="py-3 px-4">
                  {t.status === 'running' ? (
                    <div className="flex items-center gap-2"><div className="w-16 h-1.5 bg-page-bg rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${t.progress}%` }} /></div><span className="text-xs text-text-muted">{t.progress}%</span></div>
                  ) : t.status === 'completed' ? <span className="text-xs text-emerald-400">✓ 完成</span> : <span className="text-xs text-text-muted">-</span>}
                </td>
                <td className="py-3 px-4"><span className="text-xs text-text-muted">{t.createdAt ? new Date(t.createdAt).toLocaleString() : '-'}</span></td>
                <td className="py-3 px-4">
                  <div className="flex items-center justify-end gap-1">
                    {t.status === 'running' && <button onClick={() => handleStopTask(Number(t.id))} className="p-1.5 hover:bg-yellow-500/20 text-yellow-500 rounded-lg" title="暂停"><Pause className="w-3.5 h-3.5" /></button>}
                    {t.status === 'queued' && <button onClick={() => handleStartTask(Number(t.id))} className="p-1.5 hover:bg-blue-500/20 text-blue-500 rounded-lg" title="启动"><Play className="w-3.5 h-3.5" /></button>}
                    {t.status === 'paused' && <button onClick={() => handleResumeTask(Number(t.id))} className="p-1.5 hover:bg-blue-500/20 text-blue-500 rounded-lg" title="恢复"><Play className="w-3.5 h-3.5" /></button>}
                    {t.status === 'completed' && <button onClick={() => openResultViewer(t)} className="p-1.5 hover:bg-blue-500/20 text-blue-500 rounded-lg" title="查看结果"><Eye className="w-3.5 h-3.5" /></button>}
                    {t.status === 'completed' && <button onClick={() => handleSyncToAssets(Number(t.id))} className="p-1.5 hover:bg-green-500/20 text-green-500 rounded-lg" title="同步到资产"><Upload className="w-3.5 h-3.5" /></button>}
                    <button onClick={() => setDeleteConfirm(t.id)} className="p-1.5 hover:bg-red-500/20 text-text-secondary hover:text-red-500 rounded-lg" title="删除"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ==================== 新建任务弹窗 ==================== */}
      <AnimatePresence>{showNewTask && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowNewTask(false)} />
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
            <div className="bg-card-bg border border-border-color rounded-xl p-6 w-[580px] pointer-events-auto max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2"><Zap className="w-5 h-5 text-primary" />新建扫描任务</h2>
                <button onClick={() => setShowNewTask(false)} className="p-1 text-text-secondary hover:text-text-primary"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-5">
                {/* 目标输入 */}
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">扫描目标 <span className="text-critical">*</span></label>
                  <input value={taskForm.target} onChange={e => setTaskForm({ ...taskForm, target: e.target.value })}
                    placeholder="example.com 或 192.168.1.1"
                    className="w-full px-3 py-2.5 bg-page-bg border border-border-color rounded-lg text-sm text-text-primary focus:border-primary focus:outline-none font-mono" />
                  <p className="text-xs text-text-muted mt-1">支持域名、IP 地址</p>
                </div>

                {/* 扫描模块 — 参考 ARL 设计 */}
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-3">扫描模块</label>
                  <div className="grid grid-cols-2 gap-3">
                    {modules.map(m => {
                      const Icon = m.icon;
                      const checked = (taskForm as any)[m.key];
                      return (
                        <label key={m.key} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${checked ? 'border-primary bg-primary/5' : 'border-border-color hover:border-primary/30'}`}>
                          <input type="checkbox" checked={checked} onChange={e => setTaskForm({ ...taskForm, [m.key]: e.target.checked })} className="mt-0.5 w-4 h-4 rounded border-border-color text-primary focus:ring-primary" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <div className={`w-6 h-6 rounded-lg ${m.bg} flex items-center justify-center`}><Icon className={`w-3.5 h-3.5 ${m.color}`} /></div>
                              <span className="text-sm font-medium text-text-primary">{m.label}</span>
                            </div>
                            <p className="text-[10px] text-text-muted mt-1 leading-relaxed">{m.desc}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex justify-end gap-3 pt-3 border-t border-border-color">
                  <button onClick={() => setShowNewTask(false)} className="px-4 py-2 text-sm text-text-secondary rounded-lg hover:bg-card-bg-hover">取消</button>
                  <button onClick={handleCreateTask} className="px-5 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover flex items-center gap-2">
                    <Zap className="w-4 h-4" />开始扫描
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}</AnimatePresence>

      {showResults && selectedTask && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowResults(false)} />
      )}
      {showResults && selectedTask && (
        <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} className="fixed right-0 top-0 h-full w-[620px] bg-card-bg border-l border-border-color z-50 overflow-auto">
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-text-primary">扫描结果: {selectedTask.target}</h3>
              <button onClick={() => setShowResults(false)} className="p-1 text-text-secondary hover:text-text-primary"><X className="w-5 h-5" /></button>
            </div>
            <button onClick={() => { handleSyncToAssets(Number(selectedTask.id)); setShowResults(false); }}
              className="w-full mb-4 px-4 py-2 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 flex items-center justify-center gap-2"><Upload className="w-3.5 h-3.5" />同步到资产</button>
            {resultsLoading ? <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div> : scanResults.length === 0 ? (
              <div className="text-center py-10 text-text-muted"><BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" /><p className="text-sm">暂无结果数据</p></div>
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
                          <span className="text-xs text-text-secondary font-mono">{data.subdomain || (data.port ? ':' + data.port : '') || data.url || data.path || ''}</span>
                          {data.ip && <span className="text-xs text-text-muted font-mono">({data.ip})</span>}
                        </div>
                        <pre className="text-xs text-text-muted font-mono whitespace-pre-wrap break-all bg-[#0d1117] p-2 rounded mt-1 max-h-24 overflow-auto">{JSON.stringify(data, null, 2)}</pre>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Toast */}
      {toast && (
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 ${toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
          {toast.type === 'success' ? <Check className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </motion.div>
      )}

      {/* 删除确认 */}
      {deleteConfirm && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setDeleteConfirm(null)}>
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-card-bg border border-border-color rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-text-primary mb-2">确认删除</h3>
            <p className="text-sm text-text-secondary mb-5">确定要删除该任务吗？</p>
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
