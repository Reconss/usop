/**
 * 提示词管理（内嵌于「AI 中心 → 提示词与经验」）
 *
 * 把原先散落在各处硬编码的提示词收敛为可管理资源：
 *   提示词按 prompt_key（职责）分组，每组一条 is_default；运行时由
 *   `app/utils/ai_prompts.resolve_prompt()` 取默认项渲染 {{变量}}。
 * 当前已接入：告警研判（alert_analysis）。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Braces, CheckCircle2, Code2, FileText, Pencil, Plus,
  RefreshCw, RotateCcw, Sparkles, Star, Trash2, X,
} from 'lucide-react';
import { aiCenterApi } from '../../services/api';
import {
  Button,
  EmptyState,
  Field,
  FilterBar,
  LoadingState,
  SearchInput,
  SectionCard,
  StateBadge,
  StatusBadge,
  Switch,
} from '../ui';

interface Prompt {
  id: number;
  name: string;
  prompt_key: string;
  prompt_key_label: string;
  category: string;
  description: string;
  system_prompt: string;
  user_prompt: string;
  variables: { name: string; desc: string }[];
  output_schema: Record<string, any>;
  enabled: boolean;
  is_default: boolean;
  builtin: boolean;
  updated_at?: string | null;
}

interface Props {
  onToast?: (type: 'success' | 'error' | 'info', message: string) => void;
}

/** 预览用的变量示例值（仅用于核对模板渲染，不代表真实业务数据） */
const SAMPLE_VALUES: Record<string, string> = {
  alert_code: 'ALT-20261017-0001',
  title: '疑似 SQL 注入攻击',
  description: 'WAF 检测到来自外部 IP 的高危 SQL 注入尝试',
  severity: 'high',
  category: 'web_attack',
  src_ip: '203.0.113.24',
  dst_ip: '10.0.1.15',
  hostname: 'web-prod-01',
  source_product: 'WAF',
  raw_log: 'GET /api/user?id=1%27%20OR%20%271%27%3D%271 HTTP/1.1 403',
  experiences: '（历史上命中的相似研判经验会在此处拼接）',
  verdict: 'true_attack',
  question: '最近 24 小时有哪些高危告警？',
  context: '（检索到的上下文会在此处拼接）',
  fields: 'src_ip, dst_ip, dst_port',
  catalog: '（可用字段目录会在此处拼接）',
  requirement: '生成一条针对暴力破解的告警模型',
  sample: '2026-10-17 10:00:01 src=1.2.3.4 dst=5.6.7.8 msg="login failed"',
};

const emptyForm = () => ({
  id: null as number | null,
  name: '',
  prompt_key: 'alert_analysis',
  category: '',
  description: '',
  system_prompt: '',
  user_prompt: '',
  enabled: true,
  is_default: false,
});

const PromptManager: React.FC<Props> = ({ onToast }) => {
  const toast = (t: 'success' | 'error' | 'info', m: string) => onToast?.(t, m);

  const [items, setItems] = useState<Prompt[]>([]);
  const [catalog, setCatalog] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [keyFilter, setKeyFilter] = useState('');
  const [editing, setEditing] = useState<Prompt | null>(null);
  const [form, setForm] = useState<ReturnType<typeof emptyForm>>(emptyForm());
  const [showForm, setShowForm] = useState(false);
  const [preview, setPreview] = useState<{ system: string; user: string; missing: string[] } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([
        aiCenterApi.prompts({ prompt_key: keyFilter || undefined, q: keyword || undefined }),
        catalog ? Promise.resolve({ data: catalog }) : aiCenterApi.catalog(),
      ]);
      setItems(p?.data || []);
      if (!catalog) setCatalog(c?.data || null);
    } catch (e: any) {
      toast('error', e?.message || '加载提示词失败');
    } finally {
      setLoading(false);
    }
  }, [keyFilter, keyword, catalog]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [keyFilter]);

  const variables = useMemo(() => {
    const map = catalog?.prompt_variables || {};
    return map[form.prompt_key] || editing?.variables || [];
  }, [catalog, form.prompt_key, editing]);

  const usedVars = useMemo(() => {
    const re = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
    const out = new Set<string>();
    for (const tpl of [form.system_prompt, form.user_prompt]) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(tpl || ''))) out.add(m[1]);
    }
    return Array.from(out);
  }, [form.system_prompt, form.user_prompt]);

  const knownVars = useMemo(
    () => new Set((variables || []).map((v: any) => v.name)),
    [variables],
  );

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setPreview(null);
    setShowForm(true);
  };

  const openEdit = (p: Prompt) => {
    setEditing(p);
    setForm({
      id: p.id,
      name: p.name,
      prompt_key: p.prompt_key,
      category: p.category || '',
      description: p.description || '',
      system_prompt: p.system_prompt || '',
      user_prompt: p.user_prompt || '',
      enabled: p.enabled,
      is_default: p.is_default,
    });
    setPreview(null);
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditing(null); setPreview(null); };

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast('error', '请填写提示词名称'); return; }
    setSaving(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        prompt_key: form.prompt_key,
        category: form.category,
        description: form.description,
        system_prompt: form.system_prompt,
        user_prompt: form.user_prompt,
        enabled: form.enabled,
        is_default: form.is_default,
      };
      if (editing) await aiCenterApi.updatePrompt(editing.id, payload);
      else await aiCenterApi.createPrompt(payload);
      toast('success', editing ? '提示词已更新' : '提示词已创建');
      closeForm();
      load();
    } catch (e: any) {
      toast('error', e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: Prompt) => {
    if (!window.confirm(`确认删除提示词「${p.name}」？`)) return;
    try {
      await aiCenterApi.deletePrompt(p.id);
      toast('success', '已删除');
      if (editing?.id === p.id) closeForm();
      load();
    } catch (e: any) {
      toast('error', e?.message || '删除失败');
    }
  };

  const handleSetDefault = async (p: Prompt) => {
    try {
      await aiCenterApi.setDefaultPrompt(p.id);
      toast('success', `已将「${p.name}」设为「${p.prompt_key_label}」的默认提示词`);
      load();
    } catch (e: any) {
      toast('error', e?.message || '设置默认失败');
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const vars: Record<string, string> = {};
      for (const v of (variables || [])) {
        vars[v.name] = SAMPLE_VALUES[v.name] ?? `{{${v.name}}}`;
      }
      const r = await aiCenterApi.previewPrompt({
        system_prompt: form.system_prompt,
        user_prompt: form.user_prompt,
        variables: vars,
      });
      setPreview(r?.data || null);
    } catch (e: any) {
      toast('error', e?.message || '预览失败');
    } finally {
      setPreviewing(false);
    }
  };

  const handleResetBuiltin = async () => {
    try {
      const r = await aiCenterApi.resetBuiltinPrompts();
      const n = r?.data?.created ?? 0;
      toast(n ? 'success' : 'info', n ? `已补齐 ${n} 条内置提示词` : '内置提示词已齐全');
      load();
    } catch (e: any) {
      toast('error', e?.message || '操作失败');
    }
  };

  const grouped = useMemo(() => {
    const g: Record<string, Prompt[]> = {};
    for (const it of items) (g[it.prompt_key] = g[it.prompt_key] || []).push(it);
    return g;
  }, [items]);

  const missingVars = usedVars.filter(v => !knownVars.has(v));

  return (
    <div className="app-section">
      {/* 工具条 */}
      <FilterBar
        actions={
          <>
            <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={load}>
              刷新
            </Button>
            <Button variant="secondary" icon={RotateCcw} onClick={handleResetBuiltin}>
              补齐内置
            </Button>
            <Button variant="primary" icon={Plus} onClick={openCreate}>
              新建提示词
            </Button>
          </>
        }
      >
        <SearchInput
          value={keyword}
          onChange={setKeyword}
          onKeyDown={e => { if (e.key === 'Enter') load(); }}
          placeholder="搜索名称 / 描述 / 内容"
          width="md"
        />
        <select
          value={keyFilter}
          onChange={e => setKeyFilter(e.target.value)}
          className="app-select w-[150px]"
          aria-label="按职责类型筛选"
        >
          <option value="">全部类型</option>
          {(catalog?.prompt_keys || []).map((k: any) => (
            <option key={k.key} value={k.key}>{k.label}</option>
          ))}
        </select>
      </FilterBar>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        {/* 列表 */}
        <div className="xl:col-span-2">
          <SectionCard
            flush
            icon={FileText}
            title="提示词"
            description={`共 ${items.length} 条 · ${Object.keys(grouped).length} 个职责`}
          >
            {loading && items.length === 0 ? (
              <LoadingState label="正在加载提示词…" />
            ) : items.length === 0 ? (
              <EmptyState
                icon={FileText}
                compact
                title="暂无提示词"
                description="点击「新建提示词」，或补齐系统内置提示词。"
                action={
                  <Button variant="soft" icon={Plus} onClick={openCreate}>
                    新建提示词
                  </Button>
                }
              />
            ) : (
              Object.entries(grouped).map(([key, list]) => (
                <div key={key}>
                  <div className="flex items-center gap-2 border-b border-border-color bg-surface-2 px-4 py-2">
                    <FileText size={13} className="shrink-0 text-primary" />
                    <span className="text-label text-text-primary truncate-1">{list[0].prompt_key_label}</span>
                    <span className="font-mono text-[10.5px] text-text-muted truncate-1">{key}</span>
                    <span className="ml-auto num text-[10.5px] text-text-muted">{list.length} 条</span>
                  </div>
                  <div className="divide-y divide-border-color">
                    {list.map(p => (
                      <div
                        key={p.id}
                        onClick={() => openEdit(p)}
                        className={`cursor-pointer px-4 py-2.5 transition-colors ${
                          editing?.id === p.id ? 'bg-primary/10' : 'hover:bg-surface-2'
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[12.5px] font-medium text-text-primary truncate-1">{p.name}</span>
                          {p.is_default && (
                            <StatusBadge tone="warning" icon={<Star size={10} />}>默认</StatusBadge>
                          )}
                          {p.builtin && <StatusBadge tone="neutral">内置</StatusBadge>}
                          {!p.enabled && <StateBadge state="disabled" label="已停用" />}
                        </div>
                        {p.description && (
                          <div className="mt-1 text-[11px] text-text-muted truncate-1">{p.description}</div>
                        )}
                        <div className="mt-1.5 flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          {!p.is_default && (
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={Star}
                              className="h-6 px-1.5 text-[11px]"
                              onClick={() => handleSetDefault(p)}
                            >
                              设为默认
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={Pencil}
                            className="h-6 px-1.5 text-[11px]"
                            onClick={() => openEdit(p)}
                          >
                            编辑
                          </Button>
                          <Button
                            variant="danger-ghost"
                            size="sm"
                            icon={Trash2}
                            className="h-6 px-1.5 text-[11px]"
                            onClick={() => handleDelete(p)}
                          >
                            删除
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </SectionCard>
        </div>

        {/* 编辑 / 预览 */}
        <div className="xl:col-span-3">
          {!showForm ? (
            <SectionCard bodyClassName="flex min-h-[320px] flex-col items-center justify-center text-center">
              <Sparkles size={26} className="text-text-muted opacity-60" />
              <div className="mt-2 text-[12.5px] text-text-secondary">选择左侧提示词进行编辑，或新建一条</div>
              <div className="mt-1 text-[11px] text-text-muted">
                运行时由「告警研判」等场景按职责取用默认项
              </div>
            </SectionCard>
          ) : (
            <SectionCard
              icon={editing ? Pencil : Plus}
              title={editing ? `编辑：${editing.name}` : '新建提示词'}
              description={editing ? `职责 ${editing.prompt_key}` : '保存后即可被对应场景按职责取用'}
              actions={
                <Button variant="ghost" size="sm" icon={X} onClick={closeForm}>
                  收起
                </Button>
              }
              footer={
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="primary" icon={CheckCircle2} loading={saving} onClick={handleSubmit}>
                    {editing ? '保存修改' : '创建'}
                  </Button>
                  <Button variant="secondary" icon={Code2} loading={previewing} onClick={handlePreview}>
                    渲染预览
                  </Button>
                  <Button variant="ghost" onClick={closeForm}>
                    取消
                  </Button>
                </div>
              }
            >
              <div className="space-y-4">
                <div className="app-form-grid">
                  <Field label="职责类型" required help={`运行时按 ${form.prompt_key} 取用默认项`}>
                    <select
                      value={form.prompt_key}
                      onChange={e => setForm({ ...form, prompt_key: e.target.value })}
                      className="app-select"
                    >
                      {(catalog?.prompt_keys || []).map((k: any) => (
                        <option key={k.key} value={k.key}>{k.label}（{k.key}）</option>
                      ))}
                    </select>
                  </Field>

                  <Field label="名称" required>
                    <input
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      placeholder="如：严格版告警研判"
                      className="app-input"
                    />
                  </Field>

                  <Field label="分类">
                    <input
                      value={form.category}
                      onChange={e => setForm({ ...form, category: e.target.value })}
                      placeholder="如：研判 / 经验沉淀"
                      className="app-input"
                    />
                  </Field>

                  <Field label="说明">
                    <input
                      value={form.description}
                      onChange={e => setForm({ ...form, description: e.target.value })}
                      placeholder="这条提示词适合什么场景"
                      className="app-input"
                    />
                  </Field>

                  <Field
                    label="可用变量"
                    className="col-span-full"
                    help="模板中以 {{变量}} 引用；已使用的变量高亮显示"
                  >
                    <div className="flex flex-wrap gap-1.5">
                      {(variables || []).length === 0 ? (
                        <span className="text-[11px] text-text-muted">该职责暂无可用变量</span>
                      ) : (
                        (variables || []).map((v: any) => (
                          <span
                            key={v.name}
                            title={v.desc}
                            className={`chip font-mono ${usedVars.includes(v.name) ? 'chip-accent' : ''}`}
                          >
                            <Braces size={10} />
                            {`{{${v.name}}}`}
                          </span>
                        ))
                      )}
                    </div>
                  </Field>

                  <Field label="System 提示词" className="col-span-full">
                    <textarea
                      value={form.system_prompt}
                      onChange={e => setForm({ ...form, system_prompt: e.target.value })}
                      rows={7}
                      className="app-textarea font-mono"
                    />
                  </Field>

                  <Field label="User 提示词" className="col-span-full" help="支持 {{变量}} 占位，渲染时按职责变量替换">
                    <textarea
                      value={form.user_prompt}
                      onChange={e => setForm({ ...form, user_prompt: e.target.value })}
                      rows={7}
                      className="app-textarea font-mono"
                    />
                  </Field>
                </div>

                {missingVars.length > 0 && (
                  <div className="callout callout-warning">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span>
                      模板中出现了该职责未声明的变量：{missingVars.join('、')}（渲染时会被替换为空串）
                    </span>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-6">
                  <label className="flex cursor-pointer items-center gap-2">
                    <Switch
                      size="sm"
                      checked={form.enabled}
                      onChange={v => setForm({ ...form, enabled: v })}
                      label="启用"
                    />
                    <span className="text-label text-text-secondary">启用</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <Switch
                      size="sm"
                      checked={form.is_default}
                      onChange={v => setForm({ ...form, is_default: v })}
                      label="设为该职责默认"
                    />
                    <span className="text-label text-text-secondary">设为该职责默认（运行时生效）</span>
                  </label>
                </div>

                {preview && (
                  <div className="app-panel">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="text-caption text-text-muted">渲染结果（变量已用示例值替换）</span>
                      {preview.missing?.length > 0 && (
                        <span className="text-caption text-warning">未赋值变量：{preview.missing.join('、')}</span>
                      )}
                    </div>
                    <div className="space-y-2">
                      <div>
                        <div className="app-label">System</div>
                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-input border border-border-color bg-surface-2 p-2 font-mono text-[11.5px] text-text-secondary">
                          {preview.system || '（空）'}
                        </pre>
                      </div>
                      <div>
                        <div className="app-label">User</div>
                        <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-all rounded-input border border-border-color bg-surface-2 p-2 font-mono text-[11.5px] text-text-secondary">
                          {preview.user || '（空）'}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
};

export default PromptManager;
