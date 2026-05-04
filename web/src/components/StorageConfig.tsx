import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, HardDrive, Layers, Plus, CheckCircle, AlertCircle, Settings, Zap, Trash2, Edit3, Eye, X, Save, Play, Wrench, Sparkles, Bot, GitBranch } from 'lucide-react';

interface StorageTable {
  id: string;
  name: string;
  displayName: string;
  dataSource: string;
  logType?: string;
  retentionDays: number;
  partitionInterval: string;
  indexes: string[];
  rowCount: number;
  size: string;
  compression: boolean;
  autoCreated: boolean;
  lastOptimized: string;
  createdByPipeline?: string;
}

interface ParsePipeline {
  id: string;
  name: string;
  parser: string;
}

const mockTables: StorageTable[] = [
  { 
    id: 'st-001', 
    name: 'alert_logs', 
    displayName: '告警日志',
    dataSource: 'Kafka-安全日志', 
    logType: '安全日志',
    retentionDays: 90, 
    partitionInterval: '1天', 
    indexes: ['timestamp', 'severity'], 
    rowCount: 156729384, 
    size: '2.3 GB', 
    compression: true, 
    autoCreated: false, 
    lastOptimized: '2026-04-28T10:00:00Z' 
  },
  { 
    id: 'st-002', 
    name: 'security_events', 
    displayName: '安全事件',
    dataSource: 'Syslog-网络设备', 
    logType: '系统日志',
    retentionDays: 180, 
    partitionInterval: '1天', 
    indexes: ['timestamp', 'source_ip'], 
    rowCount: 28473920, 
    size: '890 MB', 
    compression: true, 
    autoCreated: false, 
    lastOptimized: '2026-04-29T08:30:00Z' 
  },
  { 
    id: 'st-003', 
    name: 'raw_logs', 
    displayName: '原始日志',
    dataSource: 'S3-审计日志', 
    logType: '审计日志',
    retentionDays: 30, 
    partitionInterval: '7天', 
    indexes: ['timestamp'], 
    rowCount: 89347291, 
    size: '1.5 GB', 
    compression: true, 
    autoCreated: true, 
    lastOptimized: '2026-04-30T15:20:00Z',
    createdByPipeline: '智能识别'
  },
  { 
    id: 'st-004', 
    name: 'app_logs_json', 
    displayName: '应用日志(JSON)',
    dataSource: 'HTTP-应用日志', 
    logType: '应用日志',
    retentionDays: 60, 
    partitionInterval: '1天', 
    indexes: ['timestamp', 'app_name', 'level'], 
    rowCount: 45283910, 
    size: '3.1 GB', 
    compression: true, 
    autoCreated: true, 
    lastOptimized: '2026-04-30T12:00:00Z',
    createdByPipeline: 'JSON标准解析'
  },
];

const mockPipelines: ParsePipeline[] = [
  { id: 'p1', name: 'JSON标准解析', parser: 'json' },
  { id: 'p2', name: 'Syslog RFC5424', parser: 'syslog' },
  { id: 'p3', name: 'CEF安全事件', parser: 'cef' },
  { id: 'p4', name: 'Grok自定义', parser: 'grok' },
  { id: 'p5', name: '智能识别', parser: 'auto' }
];

export default function StorageConfig() {
  const [tables, setTables] = useState<StorageTable[]>(mockTables);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<StorageTable | null>(null);
  const [showAutoCreateModal, setShowAutoCreateModal] = useState(false);
  const [selectedTable, setSelectedTable] = useState<StorageTable | null>(null);
  const [selectedPipeline, setSelectedPipeline] = useState<string>('');
  const [formData, setFormData] = useState({ 
    name: '', 
    displayName: '',
    retentionDays: 90, 
    partitionInterval: '1天', 
    indexes: 'timestamp', 
    compression: true,
    logType: ''
  });

  const handleCreate = () => {
    const newTable: StorageTable = {
      id: `st-${Date.now()}`,
      name: formData.name,
      displayName: formData.displayName || formData.name,
      dataSource: '手动创建',
      logType: formData.logType,
      retentionDays: formData.retentionDays,
      partitionInterval: formData.partitionInterval,
      indexes: formData.indexes.split(',').map(s => s.trim()),
      rowCount: 0,
      size: '0 MB',
      compression: formData.compression,
      autoCreated: false,
      lastOptimized: new Date().toISOString()
    };
    setTables([...tables, newTable]);
    setShowCreateModal(false);
    setFormData({ name: '', displayName: '', retentionDays: 90, partitionInterval: '1天', indexes: 'timestamp', compression: true, logType: '' });
  };

  const handleAutoCreate = () => {
    const pipeline = mockPipelines.find(p => p.id === selectedPipeline);
    if (!pipeline) return;
    
    const newTable: StorageTable = {
      id: `st-${Date.now()}`,
      name: `auto_${pipeline.parser}_logs`,
      displayName: `${pipeline.name}存储表`,
      dataSource: '自动创建',
      retentionDays: 90, 
      partitionInterval: '1天', 
      indexes: ['timestamp', 'source'], 
      rowCount: 0,
      size: '0 MB',
      compression: true,
      autoCreated: true,
      lastOptimized: new Date().toISOString(),
      createdByPipeline: pipeline.name
    };
    setTables([...tables, newTable]);
    setShowAutoCreateModal(false);
    setSelectedPipeline('');
  };

  const handleEdit = () => {
    if (!selectedTable) return;
    setTables(tables.map(t => t.id === selectedTable.id ? { 
      ...t, 
      ...formData, 
      displayName: formData.displayName || formData.name,
      indexes: formData.indexes.split(',').map(s => s.trim()) 
    } : t));
    setShowEditModal(false);
    setSelectedTable(null);
  };

  const handleDelete = () => {
    if (showDeleteConfirm) {
      setTables(tables.filter(t => t.id !== showDeleteConfirm.id));
      setShowDeleteConfirm(null);
    }
  };

  const handleOptimize = (table: StorageTable) => {
    setTables(tables.map(t => t.id === table.id ? { ...t, lastOptimized: new Date().toISOString() } : t));
  };

  const openEdit = (table: StorageTable) => {
    setSelectedTable(table);
    setFormData({ 
      name: table.name, 
      displayName: table.displayName,
      retentionDays: table.retentionDays, 
      partitionInterval: table.partitionInterval, 
      indexes: table.indexes.join(', '), 
      compression: table.compression,
      logType: table.logType || ''
    });
    setShowEditModal(true);
  };

  const openDetail = (table: StorageTable) => {
    setSelectedTable(table);
    setShowDetailModal(true);
  };

  const manualTables = tables.filter(t => !t.autoCreated);
  const autoTables = tables.filter(t => t.autoCreated);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">日志配置</h1>
        <p className="text-sm text-text-muted mt-1">配置TimescaleDB存储策略</p>
      </div>

      {/* TimescaleDB Info Card */}
      <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
            <Database className="w-5 h-5 text-orange-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-orange-800">TimescaleDB 存储优化</h3>
            <p className="text-sm text-orange-600/80 mt-1">
              TimescaleDB 是 PostgreSQL 的时序扩展，自动对时序数据进行分区、压缩和保留策略管理。
              相比普通 PostgreSQL，写入性能提升 10x+，存储空间节省 80%+。
            </p>
          </div>
        </div>
      </div>

      {/* 手动创建存储表 */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-text-secondary" />
            <h2 className="text-lg font-semibold text-text-primary">手动创建存储表</h2>
          </div>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />添加存储表
          </button>
        </div>
        
        <div className="grid grid-cols-3 gap-5">
          {manualTables.map((table, index) => (
            <motion.div 
              key={table.id} 
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ delay: index * 0.05 }}
              className="bg-card-bg rounded-xl border border-border-color p-5 hover:shadow-md transition-shadow"
            >
              {/* Card Header */}
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                  <Database className="w-5 h-5 text-orange-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-text-primary truncate">{table.displayName}</h3>
                  <p className="text-xs text-gray-400 font-mono truncate">{table.name}</p>
                </div>
              </div>

              {/* Card Body */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-muted">保留策略</span>
                  <span className="font-medium text-text-primary">{table.retentionDays} 天</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-muted">压缩</span>
                  <span className="font-medium text-emerald-600">{table.compression ? '已启用' : '未启用'}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-muted">索引列</span>
                  <span className="font-medium text-text-primary">{table.indexes.length}</span>
                </div>
              </div>

              {/* Card Footer */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <button 
                  onClick={() => openEdit(table)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-page-bg/50 hover:bg-page-bg text-text-secondary text-sm font-medium rounded-lg transition-colors"
                >
                  <Wrench className="w-4 h-4" />配置
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* 自动创建存储表 */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-text-primary">自动创建存储表</h2>
            <span className="text-xs text-text-muted">由解析管道自动生成</span>
          </div>
          <button 
            onClick={() => setShowAutoCreateModal(true)} 
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <Sparkles className="w-4 h-4" />从管道生成
          </button>
        </div>
        
        <div className="grid grid-cols-3 gap-5">
          {autoTables.map((table, index) => (
            <motion.div 
              key={table.id} 
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ delay: index * 0.05 }}
              className="bg-card-bg rounded-xl border border-border-color p-5 hover:shadow-md transition-shadow"
            >
              {/* Card Header */}
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Database className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-text-primary truncate">{table.displayName}</h3>
                  <p className="text-xs text-gray-400 font-mono truncate">{table.name}</p>
                  {table.createdByPipeline && (
                    <div className="flex items-center gap-1 mt-1">
                      <GitBranch className="w-3 h-3 text-blue-500" />
                      <span className="text-xs text-blue-600">{table.createdByPipeline}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Card Body */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-muted">保留策略</span>
                  <span className="font-medium text-text-primary">{table.retentionDays} 天</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-muted">压缩</span>
                  <span className="font-medium text-emerald-600">{table.compression ? '已启用' : '未启用'}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-muted">索引列</span>
                  <span className="font-medium text-text-primary">{table.indexes.length}</span>
                </div>
              </div>

              {/* Card Footer */}
              <div className="mt-4 pt-4 border-t border-gray-100 flex gap-2">
                <button 
                  onClick={() => openDetail(table)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-page-bg/50 hover:bg-page-bg text-text-secondary text-sm font-medium rounded-lg transition-colors"
                >
                  <Eye className="w-4 h-4" />查看
                </button>
                <button 
                  onClick={() => openEdit(table)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-medium rounded-lg transition-colors"
                >
                  <Wrench className="w-4 h-4" />配置
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {/* 手动创建弹窗 */}
        {showCreateModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreateModal(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-card-bg rounded-xl p-6 w-[500px] shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-5 h-5 text-blue-600" />
                  <h2 className="text-xl font-bold text-text-primary">添加存储表</h2>
                </div>
                <button onClick={() => setShowCreateModal(false)} className="p-2 text-gray-400 hover:text-text-secondary"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">表名</label>
                  <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="输入Hypertable名称" className="w-full px-3 py-2 border border-border-color rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">显示名称</label>
                  <input type="text" value={formData.displayName} onChange={e => setFormData({ ...formData, displayName: e.target.value })} placeholder="输入显示名称" className="w-full px-3 py-2 border border-border-color rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">日志类型</label>
                  <input type="text" value={formData.logType} onChange={e => setFormData({ ...formData, logType: e.target.value })} placeholder="如：安全日志、应用日志" className="w-full px-3 py-2 border border-border-color rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">保留天数</label>
                    <input type="number" value={formData.retentionDays} onChange={e => setFormData({ ...formData, retentionDays: parseInt(e.target.value) })} className="w-full px-3 py-2 border border-border-color rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">分区间隔</label>
                    <select value={formData.partitionInterval} onChange={e => setFormData({ ...formData, partitionInterval: e.target.value })} className="w-full px-3 py-2 border border-border-color rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                      <option>1天</option>
                      <option>7天</option>
                      <option>30天</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">索引字段（逗号分隔）</label>
                  <input type="text" value={formData.indexes} onChange={e => setFormData({ ...formData, indexes: e.target.value })} placeholder="timestamp, source_ip" className="w-full px-3 py-2 border border-border-color rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={formData.compression} onChange={e => setFormData({ ...formData, compression: e.target.checked })} className="rounded text-blue-600" />
                  <label className="text-sm text-text-secondary">启用压缩</label>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-text-secondary hover:text-gray-800">取消</button>
                <button onClick={handleCreate} disabled={!formData.name} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                  <Save className="w-4 h-4" />创建
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* 自动创建弹窗 */}
        {showAutoCreateModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAutoCreateModal(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-card-bg rounded-xl p-6 w-[500px] shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-600" />
                  <h2 className="text-xl font-bold text-text-primary">从解析管道生成</h2>
                </div>
                <button onClick={() => setShowAutoCreateModal(false)} className="p-2 text-gray-400 hover:text-text-secondary"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <p className="text-sm text-text-secondary">选择解析管道，系统将自动根据管道配置生成对应的存储表结构</p>
                <div className="space-y-2">
                  {mockPipelines.map(pipeline => (
                    <button
                      key={pipeline.id}
                      onClick={() => setSelectedPipeline(pipeline.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                        selectedPipeline === pipeline.id
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-border-color hover:border-border-color'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                        selectedPipeline === pipeline.id ? 'bg-emerald-500 border-emerald-500' : 'border-border-color'
                      }`}>
                        {selectedPipeline === pipeline.id && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-medium text-text-primary">{pipeline.name}</div>
                        <div className="text-xs text-text-muted">{pipeline.parser}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <button onClick={() => setShowAutoCreateModal(false)} className="px-4 py-2 text-text-secondary hover:text-gray-800">取消</button>
                <button onClick={handleAutoCreate} disabled={!selectedPipeline} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />生成存储表
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* 编辑弹窗 */}
        {showEditModal && selectedTable && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowEditModal(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-card-bg rounded-xl p-6 w-[500px] shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-text-primary">编辑存储表</h2>
                <button onClick={() => setShowEditModal(false)} className="p-2 text-gray-400 hover:text-text-secondary"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">表名</label>
                  <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 border border-border-color rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">显示名称</label>
                  <input type="text" value={formData.displayName} onChange={e => setFormData({ ...formData, displayName: e.target.value })} className="w-full px-3 py-2 border border-border-color rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">日志类型</label>
                  <input type="text" value={formData.logType} onChange={e => setFormData({ ...formData, logType: e.target.value })} className="w-full px-3 py-2 border border-border-color rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">保留天数</label>
                    <input type="number" value={formData.retentionDays} onChange={e => setFormData({ ...formData, retentionDays: parseInt(e.target.value) })} className="w-full px-3 py-2 border border-border-color rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">分区间隔</label>
                    <select value={formData.partitionInterval} onChange={e => setFormData({ ...formData, partitionInterval: e.target.value })} className="w-full px-3 py-2 border border-border-color rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                      <option>1天</option>
                      <option>7天</option>
                      <option>30天</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">索引字段</label>
                  <input type="text" value={formData.indexes} onChange={e => setFormData({ ...formData, indexes: e.target.value })} className="w-full px-3 py-2 border border-border-color rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={formData.compression} onChange={e => setFormData({ ...formData, compression: e.target.checked })} className="rounded text-blue-600" />
                  <label className="text-sm text-text-secondary">启用压缩</label>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <button onClick={() => setShowEditModal(false)} className="px-4 py-2 text-text-secondary hover:text-gray-800">取消</button>
                <button onClick={handleEdit} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                  <Save className="w-4 h-4" />保存
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* 详情弹窗 */}
        {showDetailModal && selectedTable && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowDetailModal(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-card-bg rounded-xl p-6 w-[500px] shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Database className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-text-primary">{selectedTable.displayName}</h2>
                    <p className="text-sm text-text-muted">{selectedTable.name}</p>
                    {selectedTable.createdByPipeline && (
                      <div className="flex items-center gap-1 mt-1">
                        <GitBranch className="w-3 h-3 text-blue-500" />
                        <span className="text-xs text-blue-600">由 {selectedTable.createdByPipeline} 生成</span>
                      </div>
                    )}
                  </div>
                </div>
                <button onClick={() => setShowDetailModal(false)} className="p-2 text-gray-400 hover:text-text-secondary"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-page-bg/50 rounded-lg">
                    <div className="text-xs text-text-muted">数据量</div>
                    <div className="text-lg font-semibold text-text-primary">{(selectedTable.rowCount / 1000000).toFixed(1)}M</div>
                  </div>
                  <div className="p-3 bg-page-bg/50 rounded-lg">
                    <div className="text-xs text-text-muted">大小</div>
                    <div className="text-lg font-semibold text-text-primary">{selectedTable.size}</div>
                  </div>
                  <div className="p-3 bg-page-bg/50 rounded-lg">
                    <div className="text-xs text-text-muted">保留策略</div>
                    <div className="text-lg font-semibold text-text-primary">{selectedTable.retentionDays}天</div>
                  </div>
                  <div className="p-3 bg-page-bg/50 rounded-lg">
                    <div className="text-xs text-text-muted">分区间隔</div>
                    <div className="text-lg font-semibold text-text-primary">{selectedTable.partitionInterval}</div>
                  </div>
                </div>
                <div className="p-3 bg-page-bg/50 rounded-lg">
                  <div className="text-xs text-text-muted mb-2">索引字段</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedTable.indexes.map((idx, i) => (
                      <span key={i} className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">{idx}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <button onClick={() => setShowDetailModal(false)} className="px-4 py-2 text-text-secondary hover:text-gray-800">关闭</button>
                <button onClick={() => { handleOptimize(selectedTable); setShowDetailModal(false); }} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2">
                  <Zap className="w-4 h-4" />立即优化
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* 删除确认弹窗 */}
        {showDeleteConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowDeleteConfirm(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-card-bg rounded-xl p-6 w-[400px] shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <AlertCircle className="w-6 h-6 text-red-500" />
                <h2 className="text-lg font-bold text-text-primary">确认删除</h2>
              </div>
              <p className="text-text-secondary mb-6">确定要删除存储表 <span className="font-medium text-text-primary">{showDeleteConfirm.displayName}</span> 吗？此操作不可恢复。</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowDeleteConfirm(null)} className="px-4 py-2 text-text-secondary hover:text-gray-800">取消</button>
                <button onClick={handleDelete} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">确认删除</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
