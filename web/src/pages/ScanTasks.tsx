import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Play, Pause, RotateCcw, FileText, MoreHorizontal, X, Search, Filter, Download, Clock, Globe, Shield, Server, Target, Check, ChevronRight, Trash2, Edit2, Eye, Copy } from 'lucide-react';
import type { ScanTask } from '../types';

const mockTasks: ScanTask[] = [
  { id: 'SCAN-001', target: '192.168.1.0/24', type: '端口扫描', status: 'running', agent: 'agent-beijing-01', createdAt: '2026-04-27T10:00:00Z', progress: 65 },
  { id: 'SCAN-002', target: 'web-server-01', type: 'Web指纹', status: 'completed', agent: 'agent-shanghai-01', createdAt: '2026-04-27T09:00:00Z', completedAt: '2026-04-27T09:15:00Z' },
  { id: 'SCAN-003', target: '10.0.0.0/16', type: '服务识别', status: 'queued', agent: 'agent-beijing-02', createdAt: '2026-04-27T11:00:00Z' },
  { id: 'SCAN-004', target: 'api-gateway', type: '漏洞扫描', status: 'failed', agent: 'agent-shanghai-02', createdAt: '2026-04-27T08:00:00Z' }
];

const getStatusBadge = (status: string) => {
  const styles: Record<string, string> = {
    running: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    completed: 'bg-green-500/20 text-green-400 border-green-500/30',
    queued: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    failed: 'bg-red-500/20 text-red-400 border-red-500/30'
  };
  return styles[status] || styles.queued;
};

const getStatusText = (status: string) => {
  const texts: Record<string, string> = { running: '运行中', completed: '已完成', queued: '排队中', failed: '失败' };
  return texts[status] || status;
};

const scanTypes = [
  { value: 'port', label: '端口扫描', icon: Server, desc: '扫描目标开放端口' },
  { value: 'web', label: 'Web指纹', icon: Globe, desc: '识别Web应用指纹' },
  { value: 'service', label: '服务识别', icon: Target, desc: '识别运行服务版本' },
  { value: 'vuln', label: '漏洞扫描', icon: Shield, desc: '检测安全漏洞' },
  { value: 'weakpass', label: '弱口令检测', icon: Shield, desc: '检测弱密码' }
];

export default function ScanTasks() {
  const [tasks, setTasks] = useState<ScanTask[]>(mockTasks);
  const [showNewTask, setShowNewTask] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [editingTask, setEditingTask] = useState<ScanTask | null>(null);
  const [selectedTask, setSelectedTask] = useState<ScanTask | null>(null);
  const [formData, setFormData] = useState({
    target: '',
    type: 'port',
    name: '',
    description: '',
    schedule: 'once',
    cron: '',
    ports: '1-65535',
    threads: 100,
    timeout: 5
  });

  const handleCreateTask = () => {
    if (!formData.target) return;
    const typeLabel = scanTypes.find(t => t.value === formData.type)?.label || '端口扫描';
    const newTask: ScanTask = {
      id: `SCAN-${new Date().getFullYear()}-${String(tasks.length + 1).padStart(3, '0')}`,
      target: formData.target,
      type: typeLabel,
      status: 'queued',
      agent: 'agent-beijing-01',
      createdAt: new Date().toISOString()
    };
    setTasks([...tasks, newTask]);
    setShowNewTask(false);
    setFormData({ target: '', type: 'port', name: '', description: '', schedule: 'once', cron: '', ports: '1-65535', threads: 100, timeout: 5 });
  };

  const handleDeleteTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  const openDetail = (task: ScanTask) => {
    setSelectedTask(task);
    setShowDetail(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">扫描任务</h1>
          <p className="text-text-secondary text-sm mt-1">管理主动扫描任务，监控扫描进度</p>
        </div>
        <button onClick={() => setShowNewTask(true)} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors">
          <Plus className="w-4 h-4" />新建任务
        </button>
      </div>

      <AnimatePresence>
        {showNewTask && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowNewTask(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
              <div className="glass-card rounded-xl p-6 w-[700px] pointer-events-auto max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-text-primary">新建扫描任务</h2>
                  <button onClick={() => setShowNewTask(false)} className="p-2 text-text-secondary hover:text-text-primary"><X className="w-5 h-5" /></button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-text-secondary text-sm mb-2">任务名称</label>
                    <input type="text" placeholder="输入任务名称" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-text-secondary text-sm mb-2">扫描目标 <span className="text-critical">*</span></label>
                    <input type="text" placeholder="IP、CIDR或域名，多个用逗号分隔" value={formData.target} onChange={(e) => setFormData({ ...formData, target: e.target.value })} className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none" />
                    <p className="text-text-muted text-xs mt-1">支持: 192.168.1.1, 192.168.1.0/24, example.com</p>
                  </div>
                  <div>
                    <label className="block text-text-secondary text-sm mb-2">扫描类型</label>
                    <div className="grid grid-cols-3 gap-3">
                      {scanTypes.map(type => {
                        const Icon = type.icon;
                        return (
                          <button key={type.value} onClick={() => setFormData({ ...formData, type: type.value })} className={`p-3 rounded-lg border transition-all text-left ${formData.type === type.value ? 'border-primary bg-primary/10' : 'border-border-color hover:border-primary/50'}`}>
                            <Icon className={`w-5 h-5 mb-2 ${formData.type === type.value ? 'text-primary' : 'text-text-secondary'}`} />
                            <p className={`text-sm font-medium ${formData.type === type.value ? 'text-primary' : 'text-text-primary'}`}>{type.label}</p>
                            <p className="text-xs text-text-muted">{type.desc}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {formData.type === 'port' && (
                    <div>
                      <label className="block text-text-secondary text-sm mb-2">端口范围</label>
                      <input type="text" value={formData.ports} onChange={(e) => setFormData({ ...formData, ports: e.target.value })} className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none" />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-text-secondary text-sm mb-2">并发线程</label>
                      <input type="number" value={formData.threads} onChange={(e) => setFormData({ ...formData, threads: Number(e.target.value) })} className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-text-secondary text-sm mb-2">超时(秒)</label>
                      <input type="number" value={formData.timeout} onChange={(e) => setFormData({ ...formData, timeout: Number(e.target.value) })} className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-text-secondary text-sm mb-2">执行计划</label>
                    <select value={formData.schedule} onChange={(e) => setFormData({ ...formData, schedule: e.target.value })} className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none">
                      <option value="once">立即执行</option>
                      <option value="daily">每天</option>
                      <option value="weekly">每周</option>
                      <option value="cron">自定义Cron</option>
                    </select>
                  </div>
                  {formData.schedule === 'cron' && (
                    <div>
                      <label className="block text-text-secondary text-sm mb-2">Cron表达式</label>
                      <input type="text" placeholder="0 0 * * *" value={formData.cron} onChange={(e) => setFormData({ ...formData, cron: e.target.value })} className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none font-mono" />
                    </div>
                  )}
                  <div>
                    <label className="block text-text-secondary text-sm mb-2">任务描述</label>
                    <textarea rows={2} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none resize-none" />
                  </div>
                  <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border-color">
                    <button onClick={() => setShowNewTask(false)} className="px-4 py-2 text-text-secondary hover:text-text-primary">取消</button>
                    <button onClick={handleCreateTask} className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg">创建任务</button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="glass-card rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-card-bg/50 border-b border-border-color">
            <tr>
              <th className="text-left py-4 px-6 text-text-secondary font-medium text-sm">任务ID</th>
              <th className="text-left py-4 px-6 text-text-secondary font-medium text-sm">扫描目标</th>
              <th className="text-left py-4 px-6 text-text-secondary font-medium text-sm">类型</th>
              <th className="text-left py-4 px-6 text-text-secondary font-medium text-sm">状态</th>
              <th className="text-left py-4 px-6 text-text-secondary font-medium text-sm">进度</th>
              <th className="text-left py-4 px-6 text-text-secondary font-medium text-sm">Agent</th>
              <th className="text-left py-4 px-6 text-text-secondary font-medium text-sm">创建时间</th>
              <th className="text-left py-4 px-6 text-text-secondary font-medium text-sm">操作</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task, index) => (
              <motion.tr key={task.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className="border-b border-border-color/50 hover:bg-primary/5 transition-colors">
                <td className="py-4 px-6 text-text-primary font-medium">{task.id}</td>
                <td className="py-4 px-6 text-text-primary">{task.target}</td>
                <td className="py-4 px-6 text-text-secondary">{task.type}</td>
                <td className="py-4 px-6"><span className={`px-2 py-1 rounded text-xs border ${getStatusBadge(task.status)}`}>{getStatusText(task.status)}</span></td>
                <td className="py-4 px-6">
                  {task.status === 'running' && task.progress !== undefined ? (
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-card-bg rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${task.progress}%` }} /></div>
                      <span className="text-text-secondary text-xs">{task.progress}%</span>
                    </div>
                  ) : <span className="text-text-muted text-xs">-</span>}
                </td>
                <td className="py-4 px-6 text-text-secondary">{task.agent}</td>
                <td className="py-4 px-6 text-text-secondary text-sm">{new Date(task.createdAt).toLocaleString()}</td>
                <td className="py-4 px-6">
                  <div className="flex items-center gap-2">
                    <button onClick={() => openDetail(task)} className="p-1.5 hover:bg-primary/10 text-text-secondary hover:text-primary rounded transition-colors"><Eye className="w-4 h-4" /></button>
                    {task.status === 'running' ? <button className="p-1.5 hover:bg-yellow-500/20 text-yellow-400 rounded transition-colors"><Pause className="w-4 h-4" /></button> : task.status === 'queued' ? <button className="p-1.5 hover:bg-blue-500/20 text-blue-400 rounded transition-colors"><Play className="w-4 h-4" /></button> : <button className="p-1.5 hover:bg-primary/20 text-primary rounded transition-colors"><RotateCcw className="w-4 h-4" /></button>}
                    {task.status === 'completed' && <button className="p-1.5 hover:bg-green-500/20 text-green-400 rounded transition-colors"><FileText className="w-4 h-4" /></button>}
                    <button onClick={() => handleDeleteTask(task.id)} className="p-1.5 hover:bg-red-500/20 text-text-secondary hover:text-red-400 rounded transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {showDetail && selectedTask && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowDetail(false)} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="fixed right-0 top-0 h-full w-[500px] bg-card-bg border-l border-border-color z-50 overflow-auto">
              <div className="p-6 border-b border-border-color flex items-center justify-between">
                <h2 className="text-xl font-semibold text-text-primary">任务详情</h2>
                <button onClick={() => setShowDetail(false)} className="p-2 hover:bg-white/5 rounded-lg"><X className="w-5 h-5 text-text-secondary" /></button>
              </div>
              <div className="p-6 space-y-6">
                <div className="glass-card rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center"><Target className="w-6 h-6 text-primary" /></div>
                    <div>
                      <p className="text-lg font-medium text-text-primary">{selectedTask.target}</p>
                      <p className="text-sm text-text-secondary">{selectedTask.type}</p>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-text-secondary">任务ID</span><span className="text-text-primary font-mono">{selectedTask.id}</span></div>
                    <div className="flex justify-between"><span className="text-text-secondary">状态</span><span className={`px-2 py-0.5 rounded text-xs border ${getStatusBadge(selectedTask.status)}`}>{getStatusText(selectedTask.status)}</span></div>
                    <div className="flex justify-between"><span className="text-text-secondary">执行Agent</span><span className="text-text-primary">{selectedTask.agent}</span></div>
                    <div className="flex justify-between"><span className="text-text-secondary">创建时间</span><span className="text-text-primary">{new Date(selectedTask.createdAt).toLocaleString()}</span></div>
                    {selectedTask.completedAt && <div className="flex justify-between"><span className="text-text-secondary">完成时间</span><span className="text-text-primary">{new Date(selectedTask.completedAt).toLocaleString()}</span></div>}
                  </div>
                </div>
                {selectedTask.status === 'running' && (
                  <div className="glass-card rounded-xl p-4">
                    <h4 className="text-sm font-medium text-text-secondary mb-3">扫描进度</h4>
                    <div className="w-full h-3 bg-card-bg rounded-full overflow-hidden mb-2"><div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${selectedTask.progress || 0}%` }} /></div>
                    <p className="text-right text-sm text-text-primary">{selectedTask.progress || 0}%</p>
                  </div>
                )}
                <div className="glass-card rounded-xl p-4">
                  <h4 className="text-sm font-medium text-text-secondary mb-3">扫描结果</h4>
                  {selectedTask.status === 'completed' ? (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-text-secondary">发现资产</span><span className="text-text-primary">12</span></div>
                      <div className="flex justify-between"><span className="text-text-secondary">开放端口</span><span className="text-text-primary">45</span></div>
                      <div className="flex justify-between"><span className="text-text-secondary">风险项</span><span className="text-critical">3</span></div>
                    </div>
                  ) : selectedTask.status === 'failed' ? (
                    <p className="text-critical text-sm">任务执行失败，请查看日志</p>
                  ) : (
                    <p className="text-text-muted text-sm">任务尚未完成</p>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
