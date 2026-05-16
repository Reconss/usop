import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database, HardDrive,
  Plus, X, Save, Trash2, Edit3, Loader2,
  Settings2, AlertTriangle, Check,
  Server, ShieldAlert, Clock, LayoutGrid,
  Cpu, ChevronDown, GripVertical
} from 'lucide-react';
import { storageTablesApi } from '../services/api';

interface ColumnDef {
  name: string;
  label: string;
  type: string;
  category: string;
  required: boolean;
}

interface StorageTableItem {
  id: number;
  name: string;
  displayName: string;
  logType?: string;
  retentionDays?: number;
  partitionInterval?: string;
  compression?: boolean;
  indexes?: any;
  columns?: ColumnDef[];
  createdAt?: string;
}

// ==================== 数据库类型 ====================
interface DbTypeDef {
  id: string;
  name: string;
  desc: string;
  icon: any;
  color: string;
}

const DB_TYPES: DbTypeDef[] = [
  { id: 'timescaledb', name: 'TimescaleDB', desc: '时序数据，自动分区与压缩', icon: Clock, color: 'border-amber-200 bg-amber-50 text-amber-600' },
  { id: 'postgresql', name: 'PostgreSQL', desc: '关系型数据库，业务数据存储', icon: Server, color: 'border-primary/30 bg-primary/5 text-primary' },
];

const COLUMN_TYPES = ['string', 'number', 'datetime', 'boolean'];

const TYPE_COLORS: Record<string, string> = {
  string: 'bg-page-bg text-text-secondary border-border-color',
  number: 'bg-primary/10 text-primary border-primary/20',
  datetime: 'bg-purple-50 text-purple-600 border-purple-200',
  boolean: 'bg-green-50 text-green-600 border-green-200',
};

// ==================== 系统预置表 ====================

const SYSTEM_TABLES = [
  {
    name: 'alert_logs',
    displayName: '安全告警表',
    tableRef: 'TimescaleDB · alerts (hypertable)',
    dbEngine: 'TimescaleDB',
    icon: ShieldAlert,
    color: 'from-amber-500 to-orange-500',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    badgeColor: 'bg-amber-100 text-amber-700',
    description: '安全设备/系统产生的原始告警，按 first_seen 自动分区。分析引擎从此表读取告警进行分析，生成安全事件写入 events 表。',
    defaultRetention: 365,
    defaultPartition: '1 day',
  },
  {
    name: 'security_events',
    displayName: '安全事件表',
    tableRef: 'PostgreSQL · usop_security.events',
    dbEngine: 'PostgreSQL',
    icon: Cpu,
    color: 'from-violet-500 to-purple-500',
    bgColor: 'bg-violet-50',
    borderColor: 'border-violet-200',
    badgeColor: 'bg-violet-100 text-violet-700',
    description: '安全事件的统一存储，工作台直接读取此表。(1) 人工手动上报事件；(2) 分析引擎分析告警后自动生成事件。',
    defaultRetention: 365,
    defaultPartition: '1 day',
  },
];

const TABLE_COLUMN_DEFAULTS: Record<string, ColumnDef[]> = {
  alert_logs: [
    { name: 'id', label: '主键', type: 'number', category: '基础', required: true },
    { name: 'alert_code', label: '告警编码', type: 'string', category: '基础', required: true },
    { name: 'title', label: '告警标题', type: 'string', category: '告警属性', required: true },
    { name: 'description', label: '描述', type: 'string', category: '告警属性', required: false },
    { name: 'severity', label: '严重程度', type: 'string', category: '告警属性', required: true },
    { name: 'status', label: '状态', type: 'string', category: '告警属性', required: true },
    { name: 'source', label: '来源', type: 'string', category: '数据源', required: false },
    { name: 'source_product', label: '数据源产品', type: 'string', category: '数据源', required: false },
    { name: 'source_type', label: '数据源类型', type: 'string', category: '数据源', required: false },
    { name: 'category', label: '分类', type: 'string', category: '告警属性', required: false },
    { name: 'confidence', label: '置信度', type: 'number', category: '告警属性', required: false },
    { name: 'src_ip', label: '源地址', type: 'string', category: '网络-五元组', required: false },
    { name: 'src_port', label: '源端口', type: 'number', category: '网络-五元组', required: false },
    { name: 'dst_ip', label: '目标地址', type: 'string', category: '网络-五元组', required: false },
    { name: 'dst_port', label: '目标端口', type: 'number', category: '网络-五元组', required: false },
    { name: 'protocol', label: '协议', type: 'string', category: '网络-五元组', required: false },
    { name: 'asset_id', label: '资产ID', type: 'number', category: '资产', required: false },
    { name: 'asset_name', label: '资产名称', type: 'string', category: '资产', required: false },
    { name: 'hostname', label: '主机名', type: 'string', category: '资产', required: false },
    { name: 'affected_assets', label: '受影响资产', type: 'string', category: '资产', required: false },
    { name: 'event_ids', label: '关联事件ID', type: 'string', category: '关联', required: false },
    { name: 'assigned_to', label: '指派人', type: 'number', category: '处置', required: false },
    { name: 'raw_log', label: '原始日志', type: 'string', category: '原始数据', required: false },
    { name: 'parsed_data', label: '解析数据', type: 'string', category: '原始数据', required: false },
    { name: 'extra_data', label: '扩展数据', type: 'string', category: '原始数据', required: false },
    { name: 'tags', label: '标签', type: 'string', category: '基础', required: false },
    { name: 'first_seen', label: '首次发现', type: 'datetime', category: '时间', required: true },
    { name: 'last_seen', label: '最后发现', type: 'datetime', category: '时间', required: true },
    { name: 'created_at', label: '创建时间', type: 'datetime', category: '时间', required: false },
    { name: 'updated_at', label: '更新时间', type: 'datetime', category: '时间', required: false },
  ],
  security_events: [
    { name: 'id', label: '主键', type: 'number', category: '基础', required: true },
    { name: 'event_code', label: '事件编码', type: 'string', category: '基础', required: true },
    { name: 'title', label: '事件标题', type: 'string', category: '基础', required: true },
    { name: 'description', label: '描述', type: 'string', category: '基础', required: false },
    { name: 'severity', label: '严重程度', type: 'string', category: '基础', required: true },
    { name: 'category', label: '分类', type: 'string', category: '基础', required: false },
    { name: 'source', label: '来源', type: 'string', category: '数据源', required: false },
    { name: 'status', label: '状态', type: 'string', category: '处置', required: true },
    { name: 'raw_log', label: '原始日志', type: 'string', category: '原始数据', required: false },
    { name: 'extra_data', label: '扩展数据', type: 'string', category: '原始数据', required: false },
    { name: 'timestamp', label: '事件时间', type: 'datetime', category: '时间', required: true },
    { name: 'created_at', label: '创建时间', type: 'datetime', category: '时间', required: false },
    { name: 'updated_at', label: '更新时间', type: 'datetime', category: '时间', required: false },
  ],
};

// ==================== 主组件 ====================

export default function StorageConfig() {
  const [configs, setConfigs] = useState<StorageTableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showDelete, setShowDelete] = useState<StorageTableItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [expandedTable, setExpandedTable] = useState<string | null>(null);

  // 新建/编辑表单
  const [formDbType, setFormDbType] = useState('timescaledb');
  const [formName, setFormName] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formRetention, setFormRetention] = useState(90);
  const [formPartition, setFormPartition] = useState('1 day');
  const [formCompression, setFormCompression] = useState(true);
  const [formColumns, setFormColumns] = useState<ColumnDef[]>([]);
  const [formExtra, setFormExtra] = useState<Record<string, any>>({});

  const defaultExtra = (dbType: string): Record<string, any> => {
    // TimescaleDB 和 PostgreSQL 不需要额外配置
    return {};
  };

  const fetchConfigs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await storageTablesApi.getTables();
      if (res.code === 200 && Array.isArray(res.data)) {
        setConfigs(res.data.map((item: any) => ({
          id: item.id,
          name: item.name,
          displayName: item.displayName || item.name,
          logType: item.logType,
          retentionDays: item.retentionDays,
          partitionInterval: item.partitionInterval,
          compression: item.compression,
          indexes: item.indexes,
          columns: item.columns || [],
          createdAt: item.createdAt,
        })));
      }
    } catch (err) {
      console.error('加载存储配置失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfigs(); }, [fetchConfigs]);

  const mergedSystemTables = SYSTEM_TABLES.map(def => {
    const db = configs.find(c => c.name === def.name);
    return {
      ...def,
      dbId: db?.id,
      retentionDays: db?.retentionDays ?? def.defaultRetention,
      partitionInterval: db?.partitionInterval ?? def.defaultPartition,
      compression: db?.compression ?? true,
      columns: (db?.columns && db.columns.length > 0) ? db.columns : (TABLE_COLUMN_DEFAULTS[def.name] || []),
    };
  });

  const customConfigs = configs.filter(c => !SYSTEM_TABLES.find(d => d.name === c.name));

  // ===== 保存系统预置表 =====
  const saveSystemTable = async (tableName: string, data: { retentionDays: number; partitionInterval: string; compression: boolean }) => {
    const token = localStorage.getItem('token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const def = SYSTEM_TABLES.find(d => d.name === tableName)!;
    const existing = configs.find(c => c.name === tableName);
    const columns = TABLE_COLUMN_DEFAULTS[tableName] || [];
    const payload = {
      name: tableName,
      displayName: def.displayName,
      logType: tableName === 'alert_logs' ? 'timescaledb' : 'postgresql',
      retentionDays: data.retentionDays,
      partitionInterval: data.partitionInterval,
      indexes: [],
      compression: data.compression,
      columns,
    };
    if (existing) {
      await fetch(`/api/storage-tables/${existing.id}`, { method: 'PUT', headers, body: JSON.stringify(payload) });
    } else {
      await fetch('/api/storage-tables', { method: 'POST', headers, body: JSON.stringify(payload) });
    }
    fetchConfigs();
  };

  // ===== 自定义表 CRUD =====
  const handleDbTypeChange = (dbType: string) => {
    setFormDbType(dbType);
    setFormExtra(defaultExtra(dbType));
  };

  const openCreateModal = () => {
    setEditingId(null);
    setFormDbType('timescaledb');
    setFormName('');
    setFormDisplayName('');
    setFormRetention(90);
    setFormPartition('1 day');
    setFormCompression(true);
    setFormColumns([]);
    setFormExtra(defaultExtra('timescaledb'));
    setSaveMsg('');
    setShowModal(true);
  };

  const openEditModal = (item: StorageTableItem) => {
    setEditingId(item.id);
    setFormDbType(item.logType || 'timescaledb');
    setFormName(item.name);
    setFormDisplayName(item.displayName || '');
    setFormRetention(item.retentionDays || 90);
    setFormPartition(item.partitionInterval || '1 day');
    setFormCompression(item.compression ?? true);
    setFormColumns(item.columns?.length ? item.columns.map(c => ({ ...c })) : []);
    // 尝试从 indexes 恢复 db 特定配置
    const dbType = item.logType || 'timescaledb';
    const extra = defaultExtra(dbType);
    if (item.indexes && typeof item.indexes === 'object' && (item.indexes as any).__db) {
      Object.assign(extra, (item.indexes as any).__db);
    }
    setFormExtra(extra);
    setSaveMsg('');
    setShowModal(true);
  };

  // ---- 字段编辑辅助 ----
  const addColumn = () => {
    setFormColumns(prev => [...prev, { name: '', label: '', type: 'string', category: '', required: false }]);
  };

  const updateColumn = (idx: number, patch: Partial<ColumnDef>) => {
    setFormColumns(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
  };

  const removeColumn = (idx: number) => {
    setFormColumns(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!formName.trim()) { setSaveMsg('请输入表名'); return; }
    setSaving(true); setSaveMsg('');
    try {
      const payload: any = {
        name: formName,
        displayName: formDisplayName || formName,
        logType: formDbType,
        retentionDays: formRetention,
        partitionInterval: formPartition,
        compression: formCompression,
        columns: formColumns.filter(c => c.name.trim()),
        indexes: { __db: formExtra },
      };
      if (editingId) {
        await storageTablesApi.updateTable(editingId, payload);
      } else {
        await storageTablesApi.createTable(payload);
      }
      setShowModal(false);
      fetchConfigs();
    } catch (err: any) {
      setSaveMsg(err?.message || '保存失败');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!showDelete) return;
    try {
      await storageTablesApi.deleteTable(showDelete.id);
      setShowDelete(null);
      fetchConfigs();
    } catch (err) { console.error('删除失败:', err); }
  };

  const toggleExpand = (name: string) => {
    setExpandedTable(prev => prev === name ? null : name);
  };

  // ============================================================
  //  RENDER
  // ============================================================
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ===== 页面标题 ===== */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">存储配置</h1>
          <p className="text-sm text-text-secondary mt-1">管理系统存储表，查看表结构与字段定义</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors"
        >
          <Plus className="w-4 h-4" />
          新建存储表
        </button>
      </div>

      {/* ===== 系统预置表 ===== */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Server className="w-5 h-5 text-primary" />
          <h2 className="text-base font-bold text-text-primary">系统预置表</h2>
          <span className="text-xs text-text-muted ml-2">自动创建，无需手动管理</span>
        </div>

        <div className="space-y-4">
          {mergedSystemTables.map(table => {
            const TableIcon = table.icon;
            const isExpanded = expandedTable === table.name;
            const columns = table.columns || [];
            const groups = columns.reduce<Record<string, typeof columns>>((acc, col) => {
              const cat = col.category || '其他';
              if (!acc[cat]) acc[cat] = [];
              acc[cat].push(col);
              return acc;
            }, {});

            return (
              <motion.div
                key={table.name}
                layout
                className={`bg-card-bg rounded-xl border-2 transition-all ${table.borderColor} overflow-hidden`}
              >
                <button
                  onClick={() => toggleExpand(table.name)}
                  className="w-full text-left p-5 flex items-start gap-4 hover:bg-page-bg/50 transition-colors"
                >
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${table.color} flex items-center justify-center shadow-lg flex-shrink-0`}>
                    <TableIcon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-lg font-bold text-text-primary">{table.displayName}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${table.badgeColor}`}>{table.dbEngine}</span>
                      <code className="text-xs px-1.5 py-0.5 bg-page-bg text-text-secondary rounded font-mono">{table.tableRef}</code>
                      <span className="text-xs text-text-muted">{columns.length} 个字段</span>
                    </div>
                    <p className="text-sm text-text-secondary mt-2">{table.description}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-text-secondary">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />保留 {table.retentionDays} 天</span>
                      <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" />分区 {table.partitionInterval}</span>
                      <span>{table.compression ? '压缩已启用' : '未压缩'}</span>
                    </div>
                  </div>
                  <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronDown className="w-5 h-5 text-text-muted" />
                  </motion.div>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-border-color" />
                      <div className="p-5">
                        <h4 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
                          <LayoutGrid className="w-4 h-4 text-primary" />
                          表字段定义 ({columns.length})
                        </h4>
                        <div className="space-y-4">
                          {Object.entries(groups).map(([category, cols]) => (
                            <div key={category}>
                              <h5 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">{category}</h5>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {cols.map(col => (
                                  <div
                                    key={col.name}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${col.required ? 'bg-rose-50/30 border-rose-200' : 'bg-page-bg border-border-color'}`}
                                  >
                                    <code className="text-xs font-mono text-text-primary flex-1 truncate">{col.name}</code>
                                    <span className="text-xs text-text-secondary">{col.label}</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${TYPE_COLORS[col.type] || 'bg-page-bg text-text-secondary border-border-color'}`}>{col.type}</span>
                                    {col.required && <span className="text-rose-500 text-xs font-bold">*</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="border-t border-border-color" />
                      <ConfigEditor
                        tableName={table.name}
                        retentionDays={table.retentionDays}
                        partitionInterval={table.partitionInterval}
                        compression={table.compression}
                        onSave={saveSystemTable}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ===== 自定义存储表 ===== */}
      {customConfigs.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Database className="w-5 h-5 text-text-secondary" />
            <h2 className="text-base font-bold text-text-primary">自定义存储表</h2>
            <span className="text-xs text-text-muted">{customConfigs.length} 个</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {customConfigs.map(item => {
              const columns = item.columns || [];
              const colNames = columns.slice(0, 5).map(c => c.name).join(', ');
              const hasMore = columns.length > 5;
              return (
                <div key={item.id} className="flex items-center gap-4 p-4 bg-card-bg border border-border-color rounded-xl hover:border-primary/30 transition-all group">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-primary to-indigo-600 flex-shrink-0">
                    <Database className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-text-primary">{item.displayName}</h3>
                      <code className="text-xs text-text-secondary bg-page-bg px-1.5 py-0.5 rounded font-mono">{item.name}</code>
                      <span className="text-xs px-2 py-0.5 rounded font-medium border bg-primary/10 text-primary border-primary/20">
                        {item.logType === 'timescaledb' ? 'TimescaleDB' : 'PostgreSQL'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-text-secondary">
                      <span>保留 {item.retentionDays || 90} 天</span>
                      <span>·</span>
                      <span>{item.compression ? '已压缩' : '未压缩'}</span>
                      {columns.length > 0 && (
                        <>
                          <span>·</span>
                          <span>{columns.length} 个字段</span>
                        </>
                      )}
                    </div>
                    {columns.length > 0 && (
                      <div className="text-xs text-text-muted mt-1 truncate">
                        {colNames}{hasMore ? ` +${columns.length - 5}` : ''}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={() => openEditModal(item)} className="p-1.5 text-text-muted hover:text-primary rounded-lg hover:bg-primary/10 transition-colors">
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button onClick={() => setShowDelete(item)} className="p-1.5 text-text-muted hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== 新建/编辑自定义表 Modal ===== */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-10 overflow-y-auto">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !saving && setShowModal(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative z-10 bg-card-bg rounded-xl shadow-2xl w-full max-w-3xl mx-4 overflow-hidden"
            >
              {/* Modal Header */}
              <div className="px-6 py-5 border-b border-border-color flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">{editingId ? '编辑存储表' : '新建存储表'}</h2>
                  <p className="text-sm text-text-secondary mt-0.5">配置数据库类型、存储参数与表字段</p>
                </div>
                <button onClick={() => setShowModal(false)} className="p-2 text-text-muted hover:text-text-secondary rounded-lg hover:bg-page-bg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[65vh] overflow-y-auto">
                {/* ---- 数据库类型 ---- */}
                <div>
                  <label className="block text-sm font-semibold text-text-primary mb-3">数据库类型</label>
                  <div className="grid grid-cols-2 gap-3">
                    {DB_TYPES.map(db => (
                      <button
                        key={db.id}
                        type="button"
                        onClick={() => handleDbTypeChange(db.id)}
                        className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left ${
                          formDbType === db.id
                            ? `${db.color} border-2 shadow-sm`
                            : 'border-border-color hover:border-border-color-hover bg-card-bg'
                        }`}
                      >
                        <db.icon className="w-5 h-5 flex-shrink-0" />
                        <div>
                          <span className="font-medium text-sm text-text-primary">{db.name}</span>
                          <p className="text-xs text-text-secondary mt-0.5">{db.desc}</p>
                        </div>
                        {formDbType === db.id && <Check className="w-4 h-4 ml-auto flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ---- 基本信息 ---- */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-2">
                      表名 (唯一标识) *
                    </label>
                    <input type="text" value={formName} onChange={e => setFormName(e.target.value)}
                      placeholder="如: custom_events"
                      disabled={!!editingId}
                      className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-transparent disabled:bg-page-bg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-2">显示名称</label>
                    <input type="text" value={formDisplayName} onChange={e => setFormDisplayName(e.target.value)}
                      placeholder="如: 安全日志索引"
                      className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-transparent" />
                  </div>
                </div>

                {/* ---- 存储参数 (按数据库类型动态切换) ---- */}
                <div className="p-4 bg-page-bg rounded-xl">
                  <h4 className="text-sm font-semibold text-text-primary mb-3">存储参数</h4>

                  {/* TimescaleDB */}
                  {formDbType === 'timescaledb' && (
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs text-text-secondary mb-1 block">保留天数</label>
                        <input type="number" value={formRetention} onChange={e => setFormRetention(Number(e.target.value) || 90)}
                          className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-transparent" />
                      </div>
                      <div>
                        <label className="text-xs text-text-secondary mb-1 block">分区间隔</label>
                        <select value={formPartition} onChange={e => setFormPartition(e.target.value)}
                          className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-transparent">
                          <option value="1 day">1 天</option>
                          <option value="7 days">7 天</option>
                          <option value="1 month">1 月</option>
                        </select>
                      </div>
                      <div className="flex items-end pb-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={formCompression} onChange={e => setFormCompression(e.target.checked)}
                            className="w-4 h-4 rounded border-border-color-hover text-primary focus:ring-primary/20" />
                          <span className="text-sm text-text-primary">启用压缩</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* PostgreSQL */}
                  {formDbType === 'postgresql' && (
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs text-text-secondary mb-1 block">保留天数</label>
                        <input type="number" value={formRetention} onChange={e => setFormRetention(Number(e.target.value) || 90)}
                          className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-transparent" />
                      </div>
                    </div>
                  )}

                </div>

                {/* ---- 字段定义 ---- */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-semibold text-text-primary flex items-center gap-2">
                      <LayoutGrid className="w-4 h-4 text-primary" />
                      表字段定义
                      <span className="text-xs text-text-muted font-normal">({formColumns.length} 个字段)</span>
                    </label>
                    <button
                      type="button"
                      onClick={addColumn}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> 添加字段
                    </button>
                  </div>

                  {formColumns.length === 0 ? (
                    <div className="p-6 text-center border-2 border-dashed border-border-color rounded-xl">
                      <p className="text-sm text-text-muted">暂无自定义字段，点击"添加字段"开始</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* 表头 */}
                      <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold text-text-muted uppercase tracking-wider">
                        <span className="col-span-3">字段名</span>
                        <span className="col-span-2">中文标签</span>
                        <span className="col-span-2">类型</span>
                        <span className="col-span-2">分类</span>
                        <span className="col-span-2">必填</span>
                        <span className="col-span-1"></span>
                      </div>
                      {formColumns.map((col, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-center p-2 bg-card-bg border border-border-color rounded-lg hover:border-border-color-hover transition-colors">
                          <input
                            type="text" value={col.name}
                            onChange={e => updateColumn(idx, { name: e.target.value })}
                            placeholder="字段名"
                            className="col-span-3 px-2 py-1.5 text-xs font-mono bg-page-bg border border-border-color rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-transparent" />
                          <input
                            type="text" value={col.label}
                            onChange={e => updateColumn(idx, { label: e.target.value })}
                            placeholder="中文标签"
                            className="col-span-2 px-2 py-1.5 text-xs bg-page-bg border border-border-color rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-transparent" />
                          <select
                            value={col.type}
                            onChange={e => updateColumn(idx, { type: e.target.value })}
                            className="col-span-2 px-2 py-1.5 text-xs bg-page-bg border border-border-color rounded-lg focus:ring-2 focus:ring-primary/20">
                            {COLUMN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <input
                            type="text" value={col.category}
                            onChange={e => updateColumn(idx, { category: e.target.value })}
                            placeholder="分类"
                            className="col-span-2 px-2 py-1.5 text-xs bg-page-bg border border-border-color rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-transparent" />
                          <label className="col-span-2 flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox" checked={col.required}
                              onChange={e => updateColumn(idx, { required: e.target.checked })}
                              className="w-3.5 h-3.5 rounded border-border-color-hover text-rose-500 focus:ring-rose-400" />
                            <span className="text-xs text-text-secondary">{col.required ? '是' : '否'}</span>
                          </label>
                          <button
                            onClick={() => removeColumn(idx)}
                            className="col-span-1 p-1 text-text-muted hover:text-rose-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {saveMsg && (
                  <p className={`text-sm ${saveMsg.includes('失败') ? 'text-rose-600' : 'text-emerald-600'}`}>{saveMsg}</p>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-border-color flex justify-end items-center gap-3 bg-page-bg/50">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors text-sm font-medium">取消</button>
                <button onClick={handleSave} disabled={saving}
                  className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  保存
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ===== 删除确认 ===== */}
      <AnimatePresence>
        {showDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDelete(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative z-10 bg-card-bg rounded-xl shadow-2xl w-full max-w-md mx-4 p-6"
            >
              <h3 className="text-lg font-semibold text-text-primary">确认删除</h3>
              <p className="text-sm text-text-secondary mt-2">
                确定要删除 "{showDelete.displayName || showDelete.name}" 吗？此操作不可撤销。
              </p>
              <div className="flex justify-end gap-3 pt-4 border-t border-border-color mt-6">
                <button onClick={() => setShowDelete(null)} className="px-4 py-2 text-text-secondary hover:text-text-primary text-sm font-medium">取消</button>
                <button onClick={handleDelete} className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700">确认删除</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ==================== 系统预置表的行内配置编辑器 ====================

function ConfigEditor({
  tableName,
  retentionDays: initialRetention,
  partitionInterval: initialPartition,
  compression: initialCompression,
  onSave,
}: {
  tableName: string;
  retentionDays: number;
  partitionInterval: string;
  compression: boolean;
  onSave: (name: string, data: { retentionDays: number; partitionInterval: string; compression: boolean }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [retentionDays, setRetentionDays] = useState(initialRetention);
  const [partitionInterval, setPartitionInterval] = useState(initialPartition);
  const [compression, setCompression] = useState(initialCompression);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { setRetentionDays(initialRetention); setPartitionInterval(initialPartition); setCompression(initialCompression); }, [initialRetention, initialPartition, initialCompression]);

  const handleSave = async () => {
    setSaving(true); setMsg('');
    try {
      await onSave(tableName, { retentionDays, partitionInterval, compression });
      setMsg('保存成功');
      setEditing(false);
    } catch (err: any) {
      setMsg(err?.message || '保存失败');
    } finally { setSaving(false); }
  };

  return (
    <div className="px-5 py-4 bg-page-bg/50">
      {!editing ? (
        <button onClick={() => setEditing(true)} className="flex items-center gap-2 text-sm text-primary hover:text-primary font-medium">
          <Settings2 className="w-4 h-4" />
          修改存储参数
        </button>
      ) : (
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="text-xs text-text-secondary block mb-1">保留(天)</label>
            <input type="number" value={retentionDays} onChange={e => setRetentionDays(Number(e.target.value) || 90)}
              className="w-24 px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-transparent" />
          </div>
          <div>
            <label className="text-xs text-text-secondary block mb-1">分区</label>
            <select value={partitionInterval} onChange={e => setPartitionInterval(e.target.value)}
              className="px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-transparent">
              <option value="1 day">1 天</option>
              <option value="7 days">7 天</option>
              <option value="1 month">1 月</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm pb-2">
            <input type="checkbox" checked={compression} onChange={e => setCompression(e.target.checked)}
              className="w-4 h-4 rounded border-border-color-hover text-primary focus:ring-primary/20" />
            压缩
          </label>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {saving ? '保存中...' : '保存'}
          </button>
          <button onClick={() => { setEditing(false); setRetentionDays(initialRetention); setPartitionInterval(initialPartition); setCompression(initialCompression); }}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors">取消</button>
          {msg && <span className={`text-xs ${msg.includes('失败') ? 'text-rose-500' : 'text-emerald-500'}`}>{msg}</span>}
        </div>
      )}
    </div>
  );
}
