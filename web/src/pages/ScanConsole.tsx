/**
 * 扫描控制台
 * 攻击面发现 / 资产探测：创建扫描任务、控制任务启停、查看结果并同步到资产。
 * 任务列表每 5 秒轮询一次，进度由后端返回的任务状态驱动。
 */
import React, { useState, useEffect } from 'react';
import {
  Play, Pause, Globe, Server, Target, Check, AlertTriangle, Zap,
  Activity, Eye, Trash2, Search, Layers, Wifi, Bug, Upload,
  Radar, ListChecks, Plus,
} from 'lucide-react';
import { scansApi, request } from '../services/api';
import {
  Button,
  ContentContainer,
  EmptyState,
  Field,
  LoadingState,
  Modal,
  PageHeader,
  SectionCard,
  StatCard,
  StateBadge,
  StatusBadge,
  TableWrap,
} from '../components/ui';

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

  const getStatusText = (s: string) => ({ running: '运行中', completed: '已完成', queued: '等待中', failed: '失败', paused: '已暂停' })[s] || s;

  const stats = { total: tasks.length, running: tasks.filter(t => t.status === 'running').length, completed: tasks.filter(t => t.status === 'completed').length, failed: tasks.filter(t => t.status === 'failed').length };

  // ==================== 模块配置 ====================

  const modules = [
    { key: 'subdomain_passive', label: '域名收集(被动)', icon: Search, desc: '从 crt.sh 证书透明度日志收集' },
    { key: 'subdomain_active', label: '域名收集(主动)', icon: Layers, desc: 'DNS 字典爆破' },
    { key: 'port_scan', label: '端口扫描', icon: Server, desc: 'TCP 连接扫描' },
    { key: 'fingerprint', label: '指纹识别', icon: Globe, desc: 'HTTP 标题/技术栈识别' },
    { key: 'dir_scan', label: '目录扫描', icon: Wifi, desc: 'Web 路径爆破' },
    { key: 'vuln_scan', label: '漏洞扫描', icon: Bug, desc: 'Nuclei 模板扫描' },
  ];

  // ==================== 渲染 ====================

  return (
    <ContentContainer>
      <PageHeader
        icon={Radar}
        title="扫描控制台"        meta={
          <span className="text-[11px] text-text-muted num">
            运行中 {stats.running} · 已完成 {stats.completed}
          </span>
        }
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setShowNewTask(true)}>
            新建任务
          </Button>
        }
      />

      {/* ==================== 统计卡片 ==================== */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="总任务" value={stats.total} icon={ListChecks} tone="neutral" loading={loading} />
        <StatCard label="运行中" value={stats.running} icon={Activity} tone="info" loading={loading} />
        <StatCard label="已完成" value={stats.completed} icon={Check} tone="success" loading={loading} />
        <StatCard label="失败" value={stats.failed} icon={AlertTriangle} tone="danger" loading={loading} />
      </div>

      {/* ==================== 任务列表 ==================== */}
      <SectionCard flush>
        {loading ? (
          <LoadingState label="正在加载扫描任务…" />
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={Radar}
            title="暂无扫描任务"
            description="新建扫描任务，对目标执行子域名收集、端口扫描、指纹识别与漏洞扫描。"
            action={
              <Button variant="soft" icon={Plus} onClick={() => setShowNewTask(true)}>
                新建扫描任务
              </Button>
            }
          />
        ) : (
          <TableWrap>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>目标</th>
                  <th style={{ minWidth: 160 }}>模块</th>
                  <th style={{ width: 100 }}>状态</th>
                  <th style={{ width: 150 }}>进度</th>
                  <th style={{ width: 170 }}>时间</th>
                  <th style={{ width: 168 }} className="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map(t => (
                  <tr key={t.id}>
                    <td className="font-mono text-text-primary">{t.target}</td>
                    <td className="text-text-secondary">{t.type}</td>
                    <td>
                      <StateBadge state={t.status} label={getStatusText(t.status)} />
                    </td>
                    <td>
                      {t.status === 'running' ? (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${t.progress}%` }} />
                          </div>
                          <span className="text-caption text-text-muted num">{t.progress}%</span>
                        </div>
                      ) : t.status === 'completed' ? (
                        <span className="inline-flex items-center gap-1 text-caption text-success">
                          <Check size={11} />完成
                        </span>
                      ) : (
                        <span className="text-caption text-text-muted">-</span>
                      )}
                    </td>
                    <td className="text-caption text-text-muted num">
                      {t.createdAt ? new Date(t.createdAt).toLocaleString() : '-'}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        {t.status === 'running' && (
                          <Button
                            variant="ghost" size="sm" icon={Pause} className="w-8 px-0 text-warning"
                            onClick={() => handleStopTask(Number(t.id))} title="暂停"
                          />
                        )}
                        {t.status === 'queued' && (
                          <Button
                            variant="ghost" size="sm" icon={Play} className="w-8 px-0 text-info"
                            onClick={() => handleStartTask(Number(t.id))} title="启动"
                          />
                        )}
                        {t.status === 'paused' && (
                          <Button
                            variant="ghost" size="sm" icon={Play} className="w-8 px-0 text-info"
                            onClick={() => handleResumeTask(Number(t.id))} title="恢复"
                          />
                        )}
                        {t.status === 'completed' && (
                          <Button
                            variant="ghost" size="sm" icon={Eye} className="w-8 px-0 text-info"
                            onClick={() => openResultViewer(t)} title="查看结果"
                          />
                        )}
                        {t.status === 'completed' && (
                          <Button
                            variant="ghost" size="sm" icon={Upload} className="w-8 px-0 text-success"
                            onClick={() => handleSyncToAssets(Number(t.id))} title="同步到资产"
                          />
                        )}
                        <Button
                          variant="danger-ghost" size="sm" icon={Trash2} className="w-8 px-0"
                          onClick={() => setDeleteConfirm(t.id)} title="删除"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </SectionCard>

      {/* ==================== 新建任务弹窗 ==================== */}
      <Modal
        open={showNewTask}
        onClose={() => setShowNewTask(false)}
        width={580}
        title="新建扫描任务"
        description="选择扫描模块后立即创建并启动任务"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowNewTask(false)}>取消</Button>
            <Button variant="primary" icon={Zap} onClick={handleCreateTask}>开始扫描</Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <Field label="扫描目标" required help="支持域名、IP 地址">
            <input
              value={taskForm.target}
              onChange={e => setTaskForm({ ...taskForm, target: e.target.value })}
              placeholder="example.com 或 192.168.1.1"
              className="app-input font-mono"
            />
          </Field>

          {/* 扫描模块 — 参考 ARL 设计 */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="app-label mb-0">扫描模块</span>
              <span className="text-[11px] text-text-muted num">
                已选 {modules.filter(m => (taskForm as any)[m.key]).length} / {modules.length}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {modules.map(m => {
                const Icon = m.icon;
                const checked = (taskForm as any)[m.key];
                return (
                  <label
                    key={m.key}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-input border p-2.5 transition-colors ${
                      checked
                        ? 'border-primary/35 bg-primary/10'
                        : 'border-border-color bg-card-bg hover:border-border-strong'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={e => setTaskForm({ ...taskForm, [m.key]: e.target.checked })}
                      className="app-checkbox mt-0.5"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Icon size={13} className={checked ? 'text-primary' : 'text-text-muted'} />
                        <span className="text-[12.5px] font-medium text-text-primary">{m.label}</span>
                      </div>
                      <p className="mt-0.5 text-[10.5px] leading-relaxed text-text-muted">{m.desc}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>

      {/* ==================== 扫描结果 ==================== */}
      <Modal
        open={showResults && Boolean(selectedTask)}
        onClose={() => setShowResults(false)}
        width={640}
        title={selectedTask ? `扫描结果: ${selectedTask.target}` : '扫描结果'}
        description={!resultsLoading && scanResults.length > 0 ? `共 ${scanResults.length} 条结果` : undefined}
        footer={
          <Button
            variant="secondary"
            icon={Upload}
            onClick={() => {
              if (!selectedTask) return;
              handleSyncToAssets(Number(selectedTask.id));
              setShowResults(false);
            }}
          >
            同步到资产
          </Button>
        }
      >
        {resultsLoading ? (
          <LoadingState label="正在加载结果…" />
        ) : scanResults.length === 0 ? (
          <EmptyState icon={Target} title="暂无结果数据" description="任务完成后结果会在这里展示。" />
        ) : (
          <div className="flex flex-col gap-2">
            {scanResults.map((r: any, i: number) => {
              const data = r.result_data || {};
              const typeLabel: Record<string, string> = { dns: '子域名', port: '端口', web: 'Web服务', service: '服务', vuln: '漏洞', webpath: '路径' };
              return (
                <div key={i} className="rounded-input border border-border-color bg-surface-2 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone="primary">{typeLabel[r.result_type] || r.result_type}</StatusBadge>
                    <span className="font-mono text-[12px] text-text-secondary">
                      {data.subdomain || (data.port ? ':' + data.port : '') || data.url || data.path || ''}
                    </span>
                    {data.ip && <span className="font-mono text-[11px] text-text-muted">({data.ip})</span>}
                  </div>
                  <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap break-all rounded border border-border-color bg-page-bg-subtle p-2 font-mono text-[11px] text-text-muted">
                    {JSON.stringify(data, null, 2)}
                  </pre>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      {/* ==================== 删除确认 ==================== */}
      <Modal
        open={Boolean(deleteConfirm)}
        onClose={() => setDeleteConfirm(null)}
        width={420}
        title="确认删除"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>取消</Button>
            <Button
              variant="danger"
              icon={Trash2}
              onClick={() => deleteConfirm && handleDeleteTask(deleteConfirm)}
            >
              删除
            </Button>
          </>
        }
      >
        <p className="text-body text-text-secondary">确定要删除该任务吗？</p>
      </Modal>

      {/* ==================== Toast ==================== */}
      {toast && (
        <div
          className={`fixed right-4 top-16 z-toast flex items-center gap-2 rounded-card border px-3.5 py-2.5 text-[12.5px] shadow-panel ${
            toast.type === 'error'
              ? 'border-danger/30 bg-danger/10 text-danger'
              : 'border-success/30 bg-success/10 text-success'
          }`}
        >
          {toast.type === 'success' ? <Check size={14} /> : <AlertTriangle size={14} />}
          {toast.message}
        </div>
      )}
    </ContentContainer>
  );
}
