import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Filter, Download, CheckCircle, XCircle, AlertTriangle,
  MoreHorizontal, ChevronDown, Calendar, Shield, Clock, User,
  Edit2, Trash2, Plus, Paperclip, Upload, FileText, X, File, Image,
  ArrowRight, RotateCcw, Eye, MessageSquare, History
} from 'lucide-react';
import { securityEvents } from '../data/mockData';
import type { SecurityEvent, Attachment } from '../types';

const severityConfig = {
  critical: { color: 'bg-rose-500', text: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20', label: '危急' },
  high: { color: 'bg-orange-500', text: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', label: '高危' },
  medium: { color: 'bg-amber-500', text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', label: '中危' },
  low: { color: 'bg-blue-500', text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', label: '低危' }
};

const statusConfig = {
  new: { color: 'bg-blue-500', text: 'text-blue-400', bg: 'bg-blue-500/10', label: '新建', icon: AlertTriangle },
  investigating: { color: 'bg-orange-500', text: 'text-orange-400', bg: 'bg-orange-500/10', label: '调查中', icon: Clock },
  closed: { color: 'bg-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-500/10', label: '已关闭', icon: CheckCircle },
  false_positive: { color: 'bg-gray-500', text: 'text-gray-400', bg: 'bg-gray-500/10', label: '误报', icon: XCircle }
};

const eventTypes = ['权限异常', '恶意软件', '数据泄露', '网络入侵', 'Web攻击', '横向移动'];

const fileTypeIcons: Record<string, React.ElementType> = {
  'image': Image,
  'application/pdf': FileText,
  'text': FileText,
  'default': File
};

const getFileIcon = (type: string) => {
  if (type.startsWith('image/')) return fileTypeIcons.image;
  if (type === 'application/pdf') return fileTypeIcons['application/pdf'];
  if (type.startsWith('text/')) return fileTypeIcons.text;
  return fileTypeIcons.default;
};

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export default function EventWorkspace() {
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [detailEvent, setDetailEvent] = useState<SecurityEvent | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [events, setEvents] = useState<SecurityEvent[]>(securityEvents.map(e => ({ ...e, attachments: [] })));
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEvent, setNewEvent] = useState<Partial<SecurityEvent>>({
    title: '', severity: 'medium', status: 'new', eventType: '权限异常',
    sourceIp: '', affectedAssets: [], description: '', attachments: []
  });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [loading, setLoading] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const toggleSelect = (id: string) => {
    setSelectedEvents(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    setSelectedEvents(selectedEvents.length === events.length ? [] : events.map(e => e.id));
  };

  const handleDelete = (id: string) => {
    setEvents(prev => prev.filter(e => e.id !== id));
    showToast('事件已删除');
  };

  const handleStatusChange = (id: string, newStatus: SecurityEvent['status']) => {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, status: newStatus } : e));
    showToast(`状态已更新为: ${statusConfig[newStatus].label}`);
  };

  const handleBatchAction = (action: 'close' | 'delete' | 'investigate') => {
    if (selectedEvents.length === 0) return;
    setLoading(true);
    setTimeout(() => {
      if (action === 'delete') {
        setEvents(prev => prev.filter(e => !selectedEvents.includes(e.id)));
        showToast(`已删除 ${selectedEvents.length} 个事件`);
      } else if (action === 'close') {
        setEvents(prev => prev.map(e => selectedEvents.includes(e.id) ? { ...e, status: 'closed' } : e));
        showToast(`已关闭 ${selectedEvents.length} 个事件`);
      } else {
        setEvents(prev => prev.map(e => selectedEvents.includes(e.id) ? { ...e, status: 'investigating' } : e));
        showToast(`已开始调查 ${selectedEvents.length} 个事件`);
      }
      setSelectedEvents([]);
      setLoading(false);
    }, 500);
  };

  const handleAddEvent = () => {
    if (!newEvent.title) return;
    const event: SecurityEvent = {
      id: `EVT-${String(events.length + 1).padStart(3, '0')}`,
      title: newEvent.title,
      severity: newEvent.severity as SecurityEvent['severity'],
      status: 'new',
      eventType: newEvent.eventType || '权限异常',
      sourceIp: newEvent.sourceIp || '0.0.0.0',
      affectedAssets: newEvent.affectedAssets?.length ? newEvent.affectedAssets : ['未知资产'],
      timestamp: new Date().toISOString(),
      confidence: 85,
      description: newEvent.description || '',
      attachments: []
    };
    setEvents([event, ...events]);
    setShowAddForm(false);
    setNewEvent({ title: '', severity: 'medium', status: 'new', eventType: '权限异常', sourceIp: '', affectedAssets: [], description: '', attachments: [] });
    showToast('事件创建成功');
  };

  return (
    <div className="space-y-6">
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -50 }}
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg ${toast.type === 'success' ? 'bg-emerald-500/90' : 'bg-rose-500/90'} text-white flex items-center gap-2`}>
            {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">事件工作台</h1>
          <p className="text-sm text-text-secondary mt-1">处理和管理安全事件，支持状态流转和批量操作</p>
        </div>
        <button onClick={() => setShowAddForm(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary-hover transition-all">
          <Plus className="w-4 h-4" />新建事件
        </button>
      </div>

      <div className="glass-card rounded-xl p-4 flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input type="text" placeholder="搜索事件标题、ID..." className="w-full pl-10 pr-4 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:outline-none focus:border-primary" />
        </div>
        <button onClick={() => setFilterOpen(!filterOpen)} className="flex items-center gap-2 px-4 py-2 border border-border-color rounded-lg text-text-secondary hover:bg-white/5 transition-colors">
          <Filter className="w-4 h-4" />筛选
        </button>
        <button className="flex items-center gap-2 px-4 py-2 border border-border-color rounded-lg text-text-secondary hover:bg-white/5 transition-colors">
          <Download className="w-4 h-4" />导出
        </button>
      </div>

      <AnimatePresence>
        {filterOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="glass-card rounded-xl p-4 overflow-hidden">
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-text-muted mb-2 block">严重程度</label>
                <select className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary">
                  <option value="">全部</option>
                  <option value="critical">危急</option>
                  <option value="high">高危</option>
                  <option value="medium">中危</option>
                  <option value="low">低危</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-text-muted mb-2 block">事件状态</label>
                <select className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary">
                  <option value="">全部</option>
                  <option value="new">新建</option>
                  <option value="investigating">调查中</option>
                  <option value="closed">已关闭</option>
                  <option value="false_positive">误报</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-text-muted mb-2 block">事件类型</label>
                <select className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary">
                  <option value="">全部</option>
                  {eventTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-text-muted mb-2 block">时间范围</label>
                <select className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary">
                  <option value="">全部时间</option>
                  <option value="1h">最近1小时</option>
                  <option value="24h">最近24小时</option>
                  <option value="7d">最近7天</option>
                  <option value="30d">最近30天</option>
                </select>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedEvents.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 p-3 bg-primary/10 border border-primary/20 rounded-xl">
          <span className="text-sm text-primary">已选择 {selectedEvents.length} 个事件</span>
          <div className="flex-1" />
          <button onClick={() => handleBatchAction('investigate')} disabled={loading} className="flex items-center gap-1 px-3 py-1.5 bg-orange-500/20 text-orange-400 rounded-lg text-xs hover:bg-orange-500/30 transition-colors disabled:opacity-50">
            <Clock className="w-3 h-3" />开始调查
          </button>
          <button onClick={() => handleBatchAction('close')} disabled={loading} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs hover:bg-emerald-500/30 transition-colors disabled:opacity-50">
            <CheckCircle className="w-3 h-3" />批量关闭
          </button>
          <button onClick={() => handleBatchAction('delete')} disabled={loading} className="flex items-center gap-1 px-3 py-1.5 bg-rose-500/20 text-rose-400 rounded-lg text-xs hover:bg-rose-500/30 transition-colors disabled:opacity-50">
            <Trash2 className="w-3 h-3" />批量删除
          </button>
        </motion.div>
      )}

      <div className="glass-card rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-page-bg/50">
            <tr className="text-left text-xs text-text-muted border-b border-border-color">
              <th className="p-4">
                <input type="checkbox" checked={selectedEvents.length === events.length && events.length > 0} onChange={toggleSelectAll} className="w-4 h-4 rounded border-border-color" />
              </th>
              <th className="p-4 font-medium">事件信息</th>
              <th className="p-4 font-medium">严重程度</th>
              <th className="p-4 font-medium">状态</th>
              <th className="p-4 font-medium">影响资产</th>
              <th className="p-4 font-medium">时间</th>
              <th className="p-4 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center">
                  <Shield className="w-12 h-12 text-text-muted mx-auto mb-3" />
                  <p className="text-text-secondary">暂无安全事件</p>
                  <button onClick={() => setShowAddForm(true)} className="mt-3 text-primary hover:underline text-sm">创建新事件</button>
                </td>
              </tr>
            ) : (
              events.map((event, index) => (
                <motion.tr key={event.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.05 }}
                  className="border-b border-border-color/50 hover:bg-white/5 transition-colors">
                  <td className="p-4">
                    <input type="checkbox" checked={selectedEvents.includes(event.id)} onChange={() => toggleSelect(event.id)} className="w-4 h-4 rounded border-border-color" />
                  </td>
                  <td className="p-4">
                    <div>
                      <p className="text-sm font-medium text-text-primary">{event.title}</p>
                      <p className="text-xs text-text-muted mt-0.5">{event.id} · {event.eventType}</p>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${severityConfig[event.severity].bg} ${severityConfig[event.severity].text} border ${severityConfig[event.severity].border}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${severityConfig[event.severity].color}`} />
                      {severityConfig[event.severity].label}
                    </span>
                  </td>
                  <td className="p-4">
                    <select value={event.status} onChange={(e) => handleStatusChange(event.id, e.target.value as SecurityEvent['status'])}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer hover:opacity-80 transition-opacity ${statusConfig[event.status].bg} ${statusConfig[event.status].text} ${statusConfig[event.status].bg.replace('/10', '/20').replace('bg-', 'border-')}`}>
                      <option value="new">新建</option>
                      <option value="investigating">调查中</option>
                      <option value="closed">已关闭</option>
                      <option value="false_positive">误报</option>
                    </select>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-1">
                      {event.affectedAssets.slice(0, 2).map((asset, i) => (
                        <span key={i} className="px-2 py-0.5 bg-border-color/50 text-text-secondary text-xs rounded">{asset}</span>
                      ))}
                      {event.affectedAssets.length > 2 && <span className="text-xs text-text-muted">+{event.affectedAssets.length - 2}</span>}
                    </div>
                  </td>
                  <td className="p-4 text-sm text-text-secondary">{new Date(event.timestamp).toLocaleString()}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setDetailEvent(event)} className="p-1.5 hover:bg-primary/10 rounded-lg text-text-secondary hover:text-primary transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(event.id)} className="p-1.5 hover:bg-rose-500/10 rounded-lg text-text-secondary hover:text-rose-400 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {showAddForm && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowAddForm(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
              <div className="glass-card rounded-xl p-6 w-[600px] pointer-events-auto max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-text-primary">新建安全事件</h2>
                  <button onClick={() => setShowAddForm(false)} className="p-2 text-text-secondary hover:text-text-primary"><X className="w-5 h-5" /></button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-text-secondary text-sm mb-2">事件标题 <span className="text-rose-400">*</span></label>
                    <input type="text" value={newEvent.title} onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
                      className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:outline-none focus:border-primary" placeholder="输入事件标题" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-text-secondary text-sm mb-2">严重程度</label>
                      <select value={newEvent.severity} onChange={e => setNewEvent({ ...newEvent, severity: e.target.value as SecurityEvent['severity'] })}
                        className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:outline-none focus:border-primary">
                        <option value="critical">危急</option>
                        <option value="high">高危</option>
                        <option value="medium">中危</option>
                        <option value="low">低危</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-text-secondary text-sm mb-2">事件类型</label>
                      <select value={newEvent.eventType} onChange={e => setNewEvent({ ...newEvent, eventType: e.target.value })}
                        className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:outline-none focus:border-primary">
                        {eventTypes.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-text-secondary text-sm mb-2">源IP地址</label>
                    <input type="text" value={newEvent.sourceIp} onChange={e => setNewEvent({ ...newEvent, sourceIp: e.target.value })}
                      className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:outline-none focus:border-primary" placeholder="例如: 192.168.1.1" />
                  </div>
                  <div>
                    <label className="block text-text-secondary text-sm mb-2">事件描述</label>
                    <textarea value={newEvent.description} onChange={e => setNewEvent({ ...newEvent, description: e.target.value })} rows={4}
                      className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:outline-none focus:border-primary resize-none" placeholder="描述事件详情..." />
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-border-color">
                    <button onClick={() => setShowAddForm(false)} className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors">取消</button>
                    <button onClick={handleAddEvent} disabled={!newEvent.title} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                      创建事件
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {detailEvent && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-40" onClick={() => setDetailEvent(null)} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-[500px] bg-card-bg border-l border-border-color z-50 overflow-auto">
              <div className="p-6 border-b border-border-color flex items-center justify-between">
                <h2 className="text-xl font-semibold text-text-primary">事件详情</h2>
                <button onClick={() => setDetailEvent(null)} className="p-2 hover:bg-white/5 rounded-lg"><X className="w-5 h-5 text-text-secondary" /></button>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-text-primary mb-2">{detailEvent.title}</h3>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs ${severityConfig[detailEvent.severity].bg} ${severityConfig[detailEvent.severity].text}`}>
                      {severityConfig[detailEvent.severity].label}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${statusConfig[detailEvent.status].bg} ${statusConfig[detailEvent.status].text}`}>
                      {React.createElement(statusConfig[detailEvent.status].icon, { className: 'w-3 h-3' })}
                      {statusConfig[detailEvent.status].label}
                    </span>
                  </div>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-text-secondary">事件ID:</span><span className="text-text-primary font-mono">{detailEvent.id}</span></div>
                  <div className="flex justify-between"><span className="text-text-secondary">事件类型:</span><span className="text-text-primary">{detailEvent.eventType}</span></div>
                  <div className="flex justify-between"><span className="text-text-secondary">源IP:</span><span className="text-text-primary font-mono">{detailEvent.sourceIp}</span></div>
                  <div className="flex justify-between"><span className="text-text-secondary">置信度:</span><span className="text-text-primary">{detailEvent.confidence}%</span></div>
                  <div className="flex justify-between"><span className="text-text-secondary">发生时间:</span><span className="text-text-primary">{new Date(detailEvent.timestamp).toLocaleString()}</span></div>
                </div>
                <div className="p-4 bg-page-bg/50 rounded-xl border border-border-color">
                  <h4 className="text-sm font-medium text-text-secondary mb-2">事件描述</h4>
                  <p className="text-sm text-text-primary">{detailEvent.description || '暂无描述'}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-text-secondary mb-2">影响资产</h4>
                  <div className="flex flex-wrap gap-2">
                    {detailEvent.affectedAssets.map((asset, i) => (
                      <span key={i} className="px-2 py-1 bg-border-color/50 text-text-secondary text-xs rounded">{asset}</span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 pt-4 border-t border-border-color">
                  {detailEvent.status !== 'investigating' && detailEvent.status !== 'closed' && (
                    <button onClick={() => { handleStatusChange(detailEvent.id, 'investigating'); setDetailEvent(null); }}
                      className="flex-1 py-2 bg-orange-500/20 text-orange-400 rounded-lg hover:bg-orange-500/30 transition-colors flex items-center justify-center gap-2">
                      <Clock className="w-4 h-4" />开始调查
                    </button>
                  )}
                  {detailEvent.status !== 'closed' && (
                    <button onClick={() => { handleStatusChange(detailEvent.id, 'closed'); setDetailEvent(null); }}
                      className="flex-1 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors flex items-center justify-center gap-2">
                      <CheckCircle className="w-4 h-4" />关闭事件
                    </button>
                  )}
                  {detailEvent.status === 'closed' && (
                    <button onClick={() => { handleStatusChange(detailEvent.id, 'new'); setDetailEvent(null); }}
                      className="flex-1 py-2 bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors flex items-center justify-center gap-2">
                      <RotateCcw className="w-4 h-4" />重新打开
                    </button>
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
