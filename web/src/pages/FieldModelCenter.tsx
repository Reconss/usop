/**
 * 字段模型 — 数据管理下的告警/事件消息模型管理
 * 借鉴 EFF-Monitoring 模板中心：
 * - 「字段管理」页：原始字段目录持久化（template_fields 表），手动配置
 *   系统基础/设备信息/解析分析/源资产详情/目的资产详情/流程协作/运营效能统计/安全事件 分类下的字段
 * - 模型内容 = 选择字段构建（每行「标签：{{字段}}」），字段在告警/事件入库时被自动调用渲染
 * - 不做渲染测试：入库时自动调用（auto_render），或由告警/事件流程显式调用后端 /render
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileText, Table, FileSpreadsheet, Plus, Pencil, Trash2,
  X, Variable, AlertTriangle, Star, ArrowUp, ArrowDown, Zap,
  ListTree, ArrowLeft
} from 'lucide-react';
import { templatesApi } from '../services/api';
import { useConfirmDialog, ConfirmDialog } from '../components/Dialogs';
import { Button } from '../components/ui';

const TYPE_META: Record<string, { label: string; icon: any; cls: string }> = {
  message: { label: '消息模型', icon: FileText, cls: 'bg-info/15 text-info' },
  excel: { label: 'Excel 模型', icon: FileSpreadsheet, cls: 'bg-success/15 text-success' },
  csv: { label: 'CSV 模型', icon: Table, cls: 'bg-warning/15 text-warning' },
};

// EFF 字段模型 7 大分类 + USOP 特有分类
const CATEGORY_META: Record<string, { cls: string }> = {
  '系统基础': { cls: 'text-info' },
  '设备信息': { cls: 'text-info' },
  '解析分析': { cls: 'text-success' },
  '源资产详情': { cls: 'text-warning' },
  '目的资产详情': { cls: 'text-warning' },
  '流程协作': { cls: 'text-accent' },
  '运营效能统计': { cls: 'text-success' },
  '安全事件': { cls: 'text-accent' },
  '自定义': { cls: 'text-warning' },
};
const CATEGORY_OPTIONS = Object.keys(CATEGORY_META).filter((c) => c !== '自定义');

interface TplVar { key: string; label: string; source: string; category?: string }
interface Template {
  id: number; name: string; type: string; scene: string; content: string;
  variables: TplVar[]; description?: string; is_default: boolean;
  enabled: boolean; auto_render?: boolean; updated_at?: string;
}
interface FieldRowData {
  id: number; key: string; label: string; category: string; source: string;
  description?: string; enabled: boolean;
}

/** 编辑态的一个字段行：label 为中文标签（可自定义），key 为变量键 */
interface FieldRow { label: string; key: string }

const emptyForm = {
  id: 0, name: '', type: 'message',
  fields: [] as FieldRow[], description: '',
  is_default: false, enabled: true, auto_render: false,
};

const emptyFieldForm = {
  id: 0, key: '', label: '', category: '系统基础',
  description: '', enabled: true,
};

/** 由字段行合成模型内容（每行「标签：{{key}}」） */
const composeContent = (fields: FieldRow[]) =>
  fields.map((f) => `${f.label}：{{${f.key}}}`).join('\n');

/** 解析已有模型内容 → 字段行列表（整行形如「标签：{{key}}」识别为字段行，其余行忽略） */
const parseContent = (content: string, catalog: TplVar[]): FieldRow[] => {
  const byKey = new Map(catalog.map((v) => [v.key, v]));
  const fields: FieldRow[] = [];
  for (const line of (content || '').split('\n')) {
    const m = line.match(/^\s*([^：:]{1,40})[：:]\s*\{\{([^{}]+?)\}\}\s*$/);
    if (m) {
      const key = m[2].trim();
      const v = byKey.get(key);
      fields.push({ key, label: v ? v.label : m[1].trim() });
    }
  }
  return fields;
};

/** 资源管理-字段模型面板（原模板中心主体，由 ResourceCenter 以 Tab 挂载） */
export function FieldModelPanel() {
  const { ask, confirmProps } = useConfirmDialog('删除确认');
  const [view, setView] = useState<'templates' | 'fields'>('templates');

  // ===== 模型列表 =====
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [editing, setEditing] = useState<typeof emptyForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ===== 字段目录 / 字段管理 =====
  const [vars, setVars] = useState<TplVar[]>([]);
  const [fieldRows, setFieldRows] = useState<FieldRowData[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [fieldLoading, setFieldLoading] = useState(false);
  const [fieldEditing, setFieldEditing] = useState<typeof emptyFieldForm | null>(null);
  const [fieldSaving, setFieldSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await templatesApi.list(
        typeFilter === 'all' ? {} : { type: typeFilter });
      setTemplates(res.data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  const loadVars = useCallback(async () => {
    try {
      const res: any = await templatesApi.variables();
      setVars(res.data?.variables || []);
    } catch { /* 忽略 */ }
  }, []);

  const loadFields = useCallback(async () => {
    setFieldLoading(true);
    try {
      const res: any = await templatesApi.fields();
      setFieldRows(res.data?.fields || []);
      setCategories(res.data?.categories || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setFieldLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadVars(); }, [loadVars]);
  useEffect(() => { if (view === 'fields') loadFields(); }, [view, loadFields]);

  // 按分类分组（模型编辑器右侧字段目录）
  const groupedVars = useMemo(() => {
    const g: Record<string, TplVar[]> = {};
    for (const v of vars) {
      const cat = v.category || '自定义';
      (g[cat] = g[cat] || []).push(v);
    }
    return g;
  }, [vars]);

  // 按分类分组（字段管理列表）
  const groupedFieldRows = useMemo(() => {
    const g: Record<string, FieldRowData[]> = {};
    for (const f of fieldRows) (g[f.category] = g[f.category] || []).push(f);
    return g;
  }, [fieldRows]);

  // ===== 模型编辑 =====
  const openCreate = () => {
    setError('');
    setEditing({ ...emptyForm, fields: [] });
  };

  const openEdit = (t: Template) => {
    setError('');
    setEditing({
      id: t.id, name: t.name, type: t.type,
      fields: parseContent(t.content, vars),
      description: t.description || '',
      is_default: t.is_default, enabled: t.enabled,
      auto_render: !!t.auto_render,
    });
  };

  const addField = (v: TplVar) => {
    if (!editing) return;
    if (editing.fields.some((f) => f.key === v.key)) return;
    setEditing({ ...editing, fields: [...editing.fields, { key: v.key, label: v.label }] });
  };

  const moveField = (idx: number, dir: -1 | 1) => {
    if (!editing) return;
    const next = [...editing.fields];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setEditing({ ...editing, fields: next });
  };

  const removeField = (idx: number) => {
    if (!editing) return;
    setEditing({ ...editing, fields: editing.fields.filter((_, i) => i !== idx) });
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      setError('模型名称不能为空');
      return;
    }
    if (!editing.fields.length) {
      setError('请至少选择一个字段');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload: any = {
        name: editing.name, type: editing.type, scene: 'universal',
        content: composeContent(editing.fields),
        description: editing.description,
        is_default: editing.is_default, enabled: editing.enabled,
        auto_render: editing.auto_render,
      };
      if (editing.id) await templatesApi.update(editing.id, payload);
      else await templatesApi.create(payload);
      setEditing(null);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: Template) => {
    if (!(await ask({ title: '删除模型', message: `确定删除模型「${t.name}」吗？`, danger: true, confirmText: '删除' }))) return;
    try { await templatesApi.remove(t.id); load(); }
    catch (e: any) { setError(e.message); }
  };

  // ===== 字段管理 =====
  const saveField = async () => {
    if (!fieldEditing) return;
    if (!fieldEditing.key.trim() || !fieldEditing.label.trim()) {
      setError('字段标识与名称不能为空');
      return;
    }
    setFieldSaving(true);
    setError('');
    try {
      const payload: any = {
        key: fieldEditing.key.trim(), label: fieldEditing.label.trim(),
        category: fieldEditing.category, description: fieldEditing.description,
        enabled: fieldEditing.enabled,
      };
      if (fieldEditing.id) await templatesApi.updateField(fieldEditing.id, payload);
      else await templatesApi.createField(payload);
      setFieldEditing(null);
      loadFields();
      loadVars();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setFieldSaving(false);
    }
  };

  const removeFieldRow = async (f: FieldRowData) => {
    if (!(await ask({ title: '删除字段', message: `确定删除字段「${f.label}」(${f.key}) 吗？\n引用该字段的模型将无法再取值。`, danger: true, confirmText: '删除' }))) return;
    try {
      await templatesApi.removeField(f.id);
      loadFields();
      loadVars();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggleFieldEnabled = async (f: FieldRowData) => {
    try {
      await templatesApi.updateField(f.id, { enabled: !f.enabled });
      loadFields();
      loadVars();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 分区标题 */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-section-title text-text-primary flex items-center gap-2">
            <Variable size={16} className="text-primary" />
            {view === 'templates' ? '消息模型' : '字段管理'}
          </h2>
          <p className="mt-1 max-w-3xl text-[11.5px] text-text-muted">
            {view === 'templates'
              ? '告警/事件消息模型：内容由选择的字段构成；开启「入库时自动渲染」后，告警/事件入库时自动调用字段生成通报内容'
              : '原始字段管理：配置模型可引用的字段目录（字段在告警/事件入库时被调用填充真实数据）'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={view === 'fields' ? ArrowLeft : ListTree}
            onClick={() => setView(view === 'templates' ? 'fields' : 'templates')}
          >
            {view === 'fields' ? '返回模型列表' : '字段管理'}
          </Button>
          {view === 'templates' && (
            <Button size="sm" variant="primary" icon={Plus} onClick={openCreate}>
              新建模型
            </Button>
          )}
          {view === 'fields' && (
            <Button
              size="sm"
              variant="primary"
              icon={Plus}
              onClick={() => { setError(''); setFieldEditing({ ...emptyFieldForm }); }}
            >
              新增字段
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="callout callout-danger">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}
          <button onClick={() => setError('')} className="ml-auto"><X size={13} /></button>
        </div>
      )}

      {/* ===== 视图一：模型列表 ===== */}
      {view === 'templates' && (
        <>
          <div className="flex gap-1.5">
            {[['all', '全部'], ['message', '消息'], ['excel', 'Excel'], ['csv', 'CSV']].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTypeFilter(k)}
                className={`rounded-pill border px-3 py-1 text-[11.5px] transition-colors ${
                  typeFilter === k
                    ? 'border-primary/40 bg-primary/15 text-primary'
                    : 'border-border-color bg-surface-2 text-text-muted hover:text-text-secondary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="rounded-lg border border-border-color bg-card-bg divide-y divide-border-color">
            {loading && <div className="p-6 text-xs text-text-secondary">加载中…</div>}
            {!loading && templates.length === 0 && (
              <div className="p-10 text-center text-xs text-text-secondary">
                暂无模型，点击右上角「新建模型」创建第一个告警/事件消息模型
              </div>
            )}
            {templates.map((t) => {
              const tm = TYPE_META[t.type] || TYPE_META.message;
              return (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02]">
                  <div className={`p-2 rounded-md ${tm.cls}`}>
                    <tm.icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-text-primary font-medium truncate">{t.name}</span>
                      {t.is_default && <Star className="w-3.5 h-3.5 text-warning fill-warning" />}
                      {t.auto_render && (
                        <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-success/15 text-success">
                          <Zap className="w-3 h-3" /> 入库自动渲染
                        </span>
                      )}
                      {!t.enabled && <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-text-muted">已停用</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-text-secondary">
                      <span>{(t.variables || []).length} 个字段</span>
                      {t.updated_at && <span>更新于 {new Date(t.updated_at).toLocaleString('zh-CN')}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(t)} title="编辑"
                      className="p-1.5 rounded hover:bg-info/10 text-info">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => remove(t)} title="删除"
                      className="p-1.5 rounded hover:bg-danger/10 text-danger">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ===== 视图二：字段管理 ===== */}
      {view === 'fields' && (
        <div className="rounded-lg border border-border-color bg-card-bg divide-y divide-border-color">
          {fieldLoading && <div className="p-6 text-xs text-text-secondary">加载中…</div>}
          {!fieldLoading && fieldRows.length === 0 && (
            <div className="p-10 text-center text-xs text-text-secondary">字段目录为空</div>
          )}
          {Object.entries(groupedFieldRows).map(([cat, list]) => {
            const cm = CATEGORY_META[cat] || CATEGORY_META['自定义'];
            return (
              <div key={cat}>
                <div className={`px-4 py-2 bg-white/[0.02] text-[11px] font-medium ${cm.cls}`}>
                  {cat} <span className="text-text-secondary">({list.length})</span>
                </div>
                {list.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.02]">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-text-primary">{f.label}</span>
                        <code className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-border-color text-text-secondary">{`{{${f.key}}}`}</code>
                        {!f.enabled && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-text-muted">已停用</span>
                        )}
                      </div>
                      {f.description && (
                        <div className="text-[11px] text-text-secondary mt-0.5 truncate">{f.description}</div>
                      )}
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-text-secondary">{f.source}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => toggleFieldEnabled(f)}
                        title={f.enabled ? '停用' : '启用'}
                        className="px-2 py-0.5 text-[10px] rounded border border-border-color text-text-secondary hover:text-text-primary">
                        {f.enabled ? '停用' : '启用'}
                      </button>
                      <button onClick={() => {
                        setError('');
                        setFieldEditing({
                          id: f.id, key: f.key, label: f.label, category: f.category,
                          description: f.description || '', enabled: f.enabled,
                        });
                      }} title="编辑"
                        className="p-1.5 rounded hover:bg-info/10 text-info">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => removeFieldRow(f)} title="删除"
                        className="p-1.5 rounded hover:bg-danger/10 text-danger">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* ===== 模型编辑弹窗 ===== */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(4_8_20_/_50%)] p-4"
          onClick={() => setEditing(null)}>
          <div className="w-full max-w-6xl max-h-[92vh] overflow-auto rounded-card bg-card-bg border border-border-color shadow-panel"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border-color sticky top-0 bg-card-bg z-10">
              <h2 className="text-sm font-semibold text-text-primary">
                {editing.id ? '编辑模型' : '新建模型'}
              </h2>
              <button onClick={() => setEditing(null)} className="text-text-secondary hover:text-text-primary">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 p-5">
              {/* 左：表单 + 字段构建 */}
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-[11px] text-text-secondary mb-1">模型名称 *</label>
                    <input
                      className="w-full px-2.5 py-1.5 text-xs rounded-md bg-input-bg border border-border-color text-text-primary"
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      placeholder="如：高危告警钉钉通报"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-text-secondary mb-1">类型</label>
                    <select
                      className="w-full px-2 py-1.5 text-xs rounded-md bg-input-bg border border-border-color text-text-primary"
                      value={editing.type}
                      onChange={(e) => setEditing({ ...editing, type: e.target.value })}
                    >
                      <option value="message">消息</option>
                      <option value="excel">Excel</option>
                      <option value="csv">CSV</option>
                    </select>
                  </div>
                </div>

                {/* 已选字段 */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] text-text-secondary">
                      模型内容 = 已选字段（每行「标签：{'{{字段}}'}」，入库时自动取真实数据填充）
                    </label>
                    <div className="flex items-center gap-3 text-[10px] text-text-secondary">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={editing.is_default}
                          onChange={(e) => setEditing({ ...editing, is_default: e.target.checked })} />
                        同类型默认
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer" title="告警/事件入库时自动渲染本模型，结果写入 extra_data.rendered_templates">
                        <input type="checkbox" checked={editing.auto_render}
                          onChange={(e) => setEditing({ ...editing, auto_render: e.target.checked })} />
                        入库时自动渲染
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={editing.enabled}
                          onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })} />
                        启用
                      </label>
                    </div>
                  </div>
                  <div className="rounded-md border border-border-color bg-white/[0.02] min-h-[160px] max-h-72 overflow-auto p-2 space-y-1">
                    {editing.fields.length === 0 && (
                      <div className="text-[10px] text-text-secondary px-1 py-2">
                        尚未选择字段 — 点击右侧字段目录添加
                      </div>
                    )}
                    {editing.fields.map((f, idx) => (
                      <div key={f.key} className="flex items-center gap-2 px-2 py-1 rounded bg-white/[0.04] border border-border-color">
                        <span className="text-[10px] text-text-secondary w-6">{idx + 1}.</span>
                        <span className="text-xs text-text-primary flex-1 truncate">
                          {f.label} <span className="text-text-secondary">：{'{{'}{f.key}{'}}'}</span>
                        </span>
                        <button onClick={() => moveField(idx, -1)} disabled={idx === 0}
                          className="p-0.5 text-text-secondary hover:text-text-primary disabled:opacity-30">
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button onClick={() => moveField(idx, 1)} disabled={idx === editing.fields.length - 1}
                          className="p-0.5 text-text-secondary hover:text-text-primary disabled:opacity-30">
                          <ArrowDown className="w-3 h-3" />
                        </button>
                        <button onClick={() => removeField(idx)}
                          className="p-0.5 text-text-secondary hover:text-danger">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-text-secondary mb-1">描述</label>
                  <input
                    className="w-full px-2.5 py-1.5 text-xs rounded-md bg-input-bg border border-border-color text-text-primary"
                    value={editing.description}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                    placeholder="模型用途说明（可选）"
                  />
                </div>
              </div>

              {/* 右：字段目录（分类分组） */}
              <div className="rounded-lg border border-border-color bg-white/[0.02] p-3 max-h-[560px] overflow-auto">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-medium text-text-primary flex items-center gap-1">
                    <Variable className="w-3.5 h-3.5 text-info" /> 字段目录
                  </span>
                  <button onClick={() => setView('fields')}
                    className="text-[10px] text-info hover:text-info">管理字段</button>
                </div>
                {Object.entries(groupedVars).map(([cat, list]) => {
                  const cm = CATEGORY_META[cat] || CATEGORY_META['自定义'];
                  return (
                    <div key={cat} className="mb-2.5">
                      <div className={`text-[10px] font-medium mb-1 ${cm.cls}`}>{cat}</div>
                      <div className="flex flex-wrap gap-1">
                        {list.map((v) => {
                          const added = editing.fields.some((f) => f.key === v.key);
                          return (
                            <button key={v.key} onClick={() => addField(v)} disabled={added}
                              title={`${v.key} · ${added ? '已添加' : '点击添加'}`}
                              className={`px-1.5 py-0.5 text-[10px] rounded border ${
                                added
                                  ? 'bg-info/20 border-info/50 text-info cursor-default'
                                  : 'bg-white/5 border-border-color text-text-secondary hover:text-text-primary hover:border-info/50'
                              }`}>
                              {v.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {!vars.length && (
                  <div className="text-[10px] text-text-secondary">字段目录加载中…</div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-3 border-t border-border-color sticky bottom-0 bg-card-bg">
              <button onClick={() => setEditing(null)}
                className="px-3 py-1.5 text-xs rounded-md border border-border-color text-text-secondary hover:text-text-primary">
                取消
              </button>
              <button onClick={save} disabled={saving}
                className="px-3 py-1.5 text-xs rounded-md bg-primary-solid hover:bg-primary-solid-hover disabled:opacity-50 text-white">
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 字段编辑弹窗 ===== */}
      {fieldEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(4_8_20_/_50%)] p-4"
          onClick={() => setFieldEditing(null)}>
          <div className="w-full max-w-md rounded-card bg-card-bg border border-border-color shadow-panel"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border-color">
              <h2 className="text-sm font-semibold text-text-primary">
                {fieldEditing.id ? '编辑字段' : '新增字段'}
              </h2>
              <button onClick={() => setFieldEditing(null)} className="text-text-secondary hover:text-text-primary">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-[11px] text-text-secondary mb-1">字段标识 *（小写字母/数字/下划线/点，渲染键 {'{{标识}}'}）</label>
                <input
                  className="w-full px-2.5 py-1.5 text-xs rounded-md bg-input-bg border border-border-color text-text-primary font-mono"
                  value={fieldEditing.key}
                  onChange={(e) => setFieldEditing({ ...fieldEditing, key: e.target.value })}
                  placeholder="如：src_country"
                  disabled={!!fieldEditing.id}
                />
              </div>
              <div>
                <label className="block text-[11px] text-text-secondary mb-1">字段名称 *（中文语义标签，模型中可直接引用）</label>
                <input
                  className="w-full px-2.5 py-1.5 text-xs rounded-md bg-input-bg border border-border-color text-text-primary"
                  value={fieldEditing.label}
                  onChange={(e) => setFieldEditing({ ...fieldEditing, label: e.target.value })}
                  placeholder="如：源IP归属地"
                />
              </div>
              <div>
                <label className="block text-[11px] text-text-secondary mb-1">分类 *</label>
                <select
                  className="w-full px-2 py-1.5 text-xs rounded-md bg-input-bg border border-border-color text-text-primary"
                  value={fieldEditing.category}
                  onChange={(e) => setFieldEditing({ ...fieldEditing, category: e.target.value })}
                >
                  {Array.from(new Set([...CATEGORY_OPTIONS, ...categories])).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-text-secondary mb-1">字段说明（可选）</label>
                <input
                  className="w-full px-2.5 py-1.5 text-xs rounded-md bg-input-bg border border-border-color text-text-primary"
                  value={fieldEditing.description}
                  onChange={(e) => setFieldEditing({ ...fieldEditing, description: e.target.value })}
                  placeholder="字段取值说明"
                />
              </div>
              <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                <input type="checkbox" checked={fieldEditing.enabled}
                  onChange={(e) => setFieldEditing({ ...fieldEditing, enabled: e.target.checked })} />
                启用（停用后模型编辑器不再展示该字段）
              </label>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-border-color">
              <button onClick={() => setFieldEditing(null)}
                className="px-3 py-1.5 text-xs rounded-md border border-border-color text-text-secondary hover:text-text-primary">
                取消
              </button>
              <button onClick={saveField} disabled={fieldSaving}
                className="px-3 py-1.5 text-xs rounded-md bg-primary-solid hover:bg-primary-solid-hover disabled:opacity-50 text-white">
                {fieldSaving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog {...confirmProps} />
    </div>
  );
}
