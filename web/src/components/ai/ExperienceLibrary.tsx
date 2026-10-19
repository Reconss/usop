/**
 * 经验库（内嵌于「AI 中心 → 提示词与经验」）
 *
 * 在既有 STE 经验闭环（研判时按 category 召回、人工反馈调权）之上，
 * 补齐「编号 / 标题 / 标签 / 状态 / 来源 / 质量」管理维度，支持检索、编辑、
 * 批量发布与归档，供研判召回与人工复用。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive, BookOpen, CheckCircle2, FileSearch, Pencil, Plus, RefreshCw, Send,
  Sparkles, Tags, Target, Trash2, TrendingUp,
} from 'lucide-react';
import { aiCenterApi, aiJudgmentApi } from '../../services/api';
import {
  Button,
  EmptyState,
  Field,
  FilterBar,
  InfoList,
  LoadingState,
  Modal,
  SearchInput,
  SectionCard,
  SeverityBadge,
  StateBadge,
  StatCard,
  StatusBadge,
  TableWrap,
} from '../ui';

interface Experience {
  id: number;
  knowledge_id?: string | null;
  title?: string | null;
  tags: string[];
  status: string;
  source_type: string;
  quality: Record<string, any>;
  category: string;
  attack_type?: string | null;
  signature?: string | null;
  verdict: string;
  verdict_label?: string | null;
  risk_level?: string | null;
  conclusion?: string | null;
  evidence_summary?: string | null;
  suggested_action?: string | null;
  source_alert_code?: string | null;
  usefulness_score: number;
  hit_count: number;
  correct_count: number;
  created_at?: string | null;
  updated_at?: string | null;
}

interface Props {
  onToast?: (type: 'success' | 'error' | 'info', message: string) => void;
}

const VERDICT_TONE: Record<string, 'danger' | 'success' | 'warning' | 'info'> = {
  true_attack: 'danger',
  false_positive: 'success',
  suspicious: 'warning',
  info: 'info',
};

/** 经验状态 → StateBadge 语义（published 等同 enabled 以显示为生效色） */
const STATUS_STATE: Record<string, string> = {
  published: 'enabled',
  archived: 'disabled',
};
const statusState = (s: string) => STATUS_STATE[s] || s;

const emptyForm = () => ({
  id: null as number | null,
  title: '',
  category: '',
  attack_type: '',
  verdict: 'suspicious',
  risk_level: 'medium',
  status: 'published',
  signature: '',
  conclusion: '',
  evidence_summary: '',
  suggested_action: '',
  tagsText: '',
  source_alert_code: '',
  usefulness_score: 0.5,
});

const ExperienceLibrary: React.FC<Props> = ({ onToast }) => {
  const toast = (t: 'success' | 'error' | 'info', m: string) => onToast?.(t, m);

  const [items, setItems] = useState<Experience[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [catalog, setCatalog] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [verdictFilter, setVerdictFilter] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [form, setForm] = useState<ReturnType<typeof emptyForm>>(emptyForm());
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState<Experience | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState<number | null>(null);

  const load = useCallback(async (kw?: string) => {
    setLoading(true);
    try {
      const [list, st, cat] = await Promise.all([
        aiCenterApi.experiences({
          q: (kw ?? keyword) || undefined,
          status: statusFilter || undefined,
          verdict: verdictFilter || undefined,
        }),
        aiCenterApi.experienceStats(),
        catalog ? Promise.resolve({ data: catalog }) : aiCenterApi.catalog(),
      ]);
      setItems(list?.data || []);
      setStats(st?.data || null);
      if (!catalog) setCatalog(cat?.data || null);
      setSelected([]);
    } catch (e: any) {
      toast('error', e?.message || '加载经验库失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, statusFilter, verdictFilter, catalog]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter, verdictFilter]);

  const statusOptions = catalog?.experience_statuses || [];
  const verdictOptions = catalog?.verdicts || [];

  const statusLabel = (s: string) => statusOptions.find((o: any) => o.key === s)?.label || s;
  const verdictLabel = (v: string) => verdictOptions.find((o: any) => o.key === v)?.label || v;

  const allChecked = items.length > 0 && selected.length === items.length;

  const toggleAll = () => setSelected(allChecked ? [] : items.map(i => i.id));
  const toggleOne = (id: number) =>
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const openCreate = () => { setForm(emptyForm()); setShowForm(true); };
  const openEdit = (e: Experience) => {
    setForm({
      id: e.id,
      title: e.title || '',
      category: e.category || '',
      attack_type: e.attack_type || '',
      verdict: e.verdict || 'suspicious',
      risk_level: e.risk_level || 'medium',
      status: e.status || 'published',
      signature: e.signature || '',
      conclusion: e.conclusion || '',
      evidence_summary: e.evidence_summary || '',
      suggested_action: e.suggested_action || '',
      tagsText: (e.tags || []).join(', '),
      source_alert_code: e.source_alert_code || '',
      usefulness_score: e.usefulness_score,
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.category.trim()) { toast('error', '请填写告警分类（用于相似召回）'); return; }
    setSaving(true);
    try {
      const payload: any = {
        title: form.title.trim(),
        category: form.category.trim(),
        attack_type: form.attack_type.trim(),
        verdict: form.verdict,
        risk_level: form.risk_level,
        status: form.status,
        signature: form.signature,
        conclusion: form.conclusion,
        evidence_summary: form.evidence_summary,
        suggested_action: form.suggested_action,
        source_alert_code: form.source_alert_code.trim(),
        usefulness_score: Number(form.usefulness_score),
        tags: form.tagsText.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean),
      };
      if (form.id) await aiCenterApi.updateExperience(form.id, payload);
      else await aiCenterApi.createExperience(payload);
      toast('success', form.id ? '经验已更新' : '经验已创建');
      setShowForm(false);
      load();
    } catch (e: any) {
      toast('error', e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e: Experience) => {
    if (!window.confirm(`确认删除经验「${e.title || e.knowledge_id || e.id}」？`)) return;
    try {
      await aiCenterApi.deleteExperience(e.id);
      toast('success', '已删除');
      if (detail?.id === e.id) setDetail(null);
      load();
    } catch (err: any) {
      toast('error', err?.message || '删除失败');
    }
  };

  const handlePublish = async (e: Experience) => {
    try {
      await aiCenterApi.publishExperience(e.id);
      toast('success', '已发布');
      load();
    } catch (err: any) {
      toast('error', err?.message || '发布失败');
    }
  };

  // ---- 从已闭环告警自动提取经验（沿用原 AI 研判页的能力，移到经验库统一入口） ----
  const handleAutoExtract = async () => {
    setExtracting(true);
    try {
      const r: any = await aiJudgmentApi.autoExtract({ scan: true, limit: 200 });
      const n = r?.data?.extracted ?? r?.data?.created ?? 0;
      toast(n ? 'success' : 'info', n ? `已从闭环告警提取 ${n} 条经验` : '没有可提取的新经验（需告警已闭环且有研判结果）');
      load();
    } catch (e: any) {
      toast('error', e?.message || '自动提取失败');
    } finally {
      setExtracting(false);
    }
  };

  // ---- 人工反馈调权（correct/wrong 影响命中正确率，useful/useless 微调权重） ----
  const handleFeedback = async (e: Experience, fb: 'correct' | 'wrong' | 'useful' | 'useless') => {
    setFeedbackBusy(e.id);
    try {
      await aiJudgmentApi.feedbackExperience(e.id, fb);
      toast('success', '反馈已记录，权重已更新');
      load();
      if (detail?.id === e.id) {
        const r: any = await aiCenterApi.experiences({ limit: 500 });
        const fresh = (r?.data || []).find((x: Experience) => x.id === e.id);
        if (fresh) setDetail(fresh);
      }
    } catch (err: any) {
      toast('error', err?.message || '反馈失败');
    } finally {
      setFeedbackBusy(null);
    }
  };

  const handleBatch = async (action: 'delete' | 'publish' | 'archive') => {
    if (selected.length === 0) { toast('info', '请先选择经验'); return; }
    const label = { delete: '删除', publish: '发布', archive: '归档' }[action];
    if (!window.confirm(`确认${label}选中的 ${selected.length} 条经验？`)) return;
    try {
      const r = await aiCenterApi.batchExperiences(action, selected);
      toast('success', `已${label} ${r?.data?.affected ?? selected.length} 条`);
      load();
    } catch (e: any) {
      toast('error', e?.message || '批量操作失败');
    }
  };

  const statsCards = useMemo(() => ([
    { label: '经验总数', value: stats?.total ?? 0, icon: BookOpen, tone: 'info' as const },
    { label: '已发布', value: stats?.by_status?.published ?? 0, icon: Send, tone: 'success' as const },
    { label: '平均有用度', value: (stats?.avg_usefulness ?? 0).toFixed(3), icon: TrendingUp, tone: 'warning' as const },
    { label: '累计召回', value: stats?.total_hits ?? 0, icon: Target, tone: 'accent' as const },
  ]), [stats]);

  return (
    <div className="app-section">
      {/* 统计 */}
      <div className="app-grid">
        {statsCards.map((c) => (
          <StatCard key={c.label} label={c.label} value={c.value} icon={c.icon} tone={c.tone} />
        ))}
      </div>

      {/* 工具条 */}
      <FilterBar
        actions={
          <>
            {selected.length > 0 && (
              <>
                <span className="num text-[11px] text-text-muted">已选 {selected.length} 条</span>
                <Button variant="soft" size="sm" icon={Send} onClick={() => handleBatch('publish')}>
                  批量发布
                </Button>
                <Button variant="secondary" size="sm" icon={Archive} onClick={() => handleBatch('archive')}>
                  归档
                </Button>
                <Button variant="danger-ghost" size="sm" icon={Trash2} onClick={() => handleBatch('delete')}>
                  删除
                </Button>
                <span className="divider-v h-5" />
              </>
            )}
            <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={() => load()}>
              刷新
            </Button>
            <Button variant="primary" icon={Plus} onClick={openCreate}>
              新建经验
            </Button>
            <Button
              variant="soft"
              icon={Sparkles}
              loading={extracting}
              onClick={handleAutoExtract}
              title="扫描已闭环（误报/已关闭）且有研判结果的告警，自动沉淀为经验"
            >
              从闭环告警提取
            </Button>
          </>
        }
      >
        <SearchInput
          value={keyword}
          onChange={setKeyword}
          onKeyDown={e => { if (e.key === 'Enter') load(); }}
          placeholder="搜索编号 / 标题 / 结论"
          width="md"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="app-select w-[130px]"
          aria-label="按状态筛选"
        >
          <option value="">全部状态</option>
          {statusOptions.map((o: any) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <select
          value={verdictFilter}
          onChange={e => setVerdictFilter(e.target.value)}
          className="app-select w-[130px]"
          aria-label="按结论筛选"
        >
          <option value="">全部结论</option>
          {verdictOptions.map((o: any) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </FilterBar>

      {/* 表格 */}
      <SectionCard
        flush
        icon={BookOpen}
        title="经验库"
        description={`共 ${items.length} 条 · 研判闭环后自动沉淀，也可手工录入`}
      >
        {loading && items.length === 0 ? (
          <LoadingState label="正在加载经验库…" />
        ) : items.length === 0 ? (
          <EmptyState
            icon={FileSearch}
            title="暂无经验"
            description="研判闭环后可在「安全告警」中沉淀，也可在此手工录入。"
            action={
              <Button variant="soft" icon={Plus} onClick={openCreate}>
                新建经验
              </Button>
            }
          />
        ) : (
          <TableWrap>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>
                    <input
                      type="checkbox"
                      className="app-checkbox"
                      checked={allChecked}
                      onChange={toggleAll}
                      aria-label="全选"
                    />
                  </th>
                  <th style={{ minWidth: 150 }}>编号</th>
                  <th style={{ minWidth: 240 }}>标题 / 分类</th>
                  <th style={{ width: 120 }}>结论</th>
                  <th style={{ width: 96 }}>风险</th>
                  <th style={{ width: 80 }}>权重</th>
                  <th style={{ width: 100 }}>召回</th>
                  <th style={{ width: 100 }}>状态</th>
                  <th style={{ width: 120 }} className="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map(e => (
                  <tr key={e.id} className={selected.includes(e.id) ? 'is-selected' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        className="app-checkbox"
                        checked={selected.includes(e.id)}
                        onChange={() => toggleOne(e.id)}
                        aria-label={`选择 ${e.title || e.knowledge_id || e.id}`}
                      />
                    </td>
                    <td className="font-mono text-[11.5px] text-text-muted truncate-1">{e.knowledge_id || '—'}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => setDetail(e)}
                        className="max-w-[260px] truncate-1 text-left font-medium text-text-primary hover:text-primary"
                      >
                        {e.title || '未命名经验'}
                      </button>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-text-muted">{e.category}</span>
                        {(e.tags || []).slice(0, 3).map(t => (
                          <span key={t} className="chip text-[10px]">{t}</span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <StatusBadge tone={VERDICT_TONE[e.verdict] || 'neutral'}>
                        {e.verdict_label || verdictLabel(e.verdict)}
                      </StatusBadge>
                    </td>
                    <td><SeverityBadge severity={e.risk_level || 'medium'} /></td>
                    <td className="num font-mono text-text-secondary">{e.usefulness_score.toFixed(2)}</td>
                    <td className="num text-text-muted">{e.hit_count}/{e.correct_count}</td>
                    <td><StateBadge state={statusState(e.status)} label={statusLabel(e.status)} /></td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        {e.status !== 'published' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={Send}
                            className="w-8 px-0 text-success"
                            title="发布"
                            onClick={() => handlePublish(e)}
                          />
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={Pencil}
                          className="w-8 px-0"
                          title="编辑"
                          onClick={() => openEdit(e)}
                        />
                        <Button
                          variant="danger-ghost"
                          size="sm"
                          icon={Trash2}
                          className="w-8 px-0"
                          title="删除"
                          onClick={() => handleDelete(e)}
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

      {/* 详情弹窗 */}
      {detail && (
        <Modal
          open
          onClose={() => setDetail(null)}
          title={detail.title || '未命名经验'}
          description={detail.knowledge_id || '—'}
          width={760}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDetail(null)}>关闭</Button>
              {detail.status !== 'published' && (
                <Button
                  variant="soft"
                  icon={Send}
                  onClick={() => { handlePublish(detail); setDetail(null); }}
                >
                  发布
                </Button>
              )}
              <Button
                variant="primary"
                icon={Pencil}
                onClick={() => { openEdit(detail); setDetail(null); }}
              >
                编辑
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge tone={VERDICT_TONE[detail.verdict] || 'neutral'}>
                {detail.verdict_label || verdictLabel(detail.verdict)}
              </StatusBadge>
              <SeverityBadge severity={detail.risk_level || 'medium'} />
              <StateBadge state={statusState(detail.status)} label={statusLabel(detail.status)} />
              <StatusBadge tone="neutral">来源 {detail.source_type}</StatusBadge>
              <StatusBadge tone="neutral">权重 {detail.usefulness_score.toFixed(2)}</StatusBadge>
            </div>

            <InfoList
              items={[
                { label: '告警分类', value: detail.category },
                { label: '攻击类型', value: detail.attack_type },
                { label: '来源告警', value: detail.source_alert_code, mono: true },
                { label: '关键信号', value: detail.signature },
                {
                  label: '研判结论',
                  span: true,
                  value: <div className="whitespace-pre-wrap">{detail.conclusion}</div>,
                },
                {
                  label: '证据摘要',
                  span: true,
                  value: <div className="whitespace-pre-wrap">{detail.evidence_summary}</div>,
                },
                {
                  label: '处置建议',
                  span: true,
                  value: <div className="whitespace-pre-wrap">{detail.suggested_action}</div>,
                },
              ]}
            />

            {(detail.tags || []).length > 0 && (
              <div>
                <div className="app-label flex items-center gap-1">
                  <Tags size={12} />标签
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(detail.tags || []).map(t => (
                    <span key={t} className="chip">{t}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="app-panel">
              <div className="text-[11px] text-text-muted">
                人工反馈（correct/wrong 重算命中正确率；useful/useless 微调权重）
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={CheckCircle2}
                  className="text-success"
                  disabled={feedbackBusy === detail.id}
                  onClick={() => handleFeedback(detail, 'correct')}
                >
                  研判正确
                </Button>
                <Button
                  variant="danger-ghost"
                  size="sm"
                  disabled={feedbackBusy === detail.id}
                  onClick={() => handleFeedback(detail, 'wrong')}
                >
                  研判有误
                </Button>
                <Button
                  variant="soft"
                  size="sm"
                  disabled={feedbackBusy === detail.id}
                  onClick={() => handleFeedback(detail, 'useful')}
                >
                  很有用
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={feedbackBusy === detail.id}
                  onClick={() => handleFeedback(detail, 'useless')}
                >
                  帮助不大
                </Button>
                {feedbackBusy === detail.id && <LoadingState inline label="提交中…" />}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* 表单弹窗 */}
      {showForm && (
        <Modal
          open
          onClose={() => setShowForm(false)}
          title={form.id ? '编辑经验' : '新建经验'}
          description="经验用于研判时按告警分类相似召回，并参与人工反馈调权"
          width={760}
          footer={
            <>
              <Button variant="ghost" onClick={() => setShowForm(false)}>取消</Button>
              <Button variant="primary" icon={CheckCircle2} loading={saving} onClick={handleSubmit}>
                {form.id ? '保存修改' : '创建'}
              </Button>
            </>
          }
        >
          <div className="app-form-grid">
            <Field label="标题" className="col-span-full">
              <input
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="一句话说明这类告警的判断要点"
                className="app-input"
              />
            </Field>

            <Field label="告警分类" required help="相似召回依据，如 web_attack">
              <input
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                placeholder="如：web_attack"
                className="app-input"
              />
            </Field>

            <Field label="攻击类型 / 规则名">
              <input
                value={form.attack_type}
                onChange={e => setForm({ ...form, attack_type: e.target.value })}
                className="app-input"
              />
            </Field>

            <Field label="研判结论">
              <select
                value={form.verdict}
                onChange={e => setForm({ ...form, verdict: e.target.value })}
                className="app-select"
              >
                {verdictOptions.map((o: any) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </Field>

            <Field label="风险等级">
              <select
                value={form.risk_level}
                onChange={e => setForm({ ...form, risk_level: e.target.value })}
                className="app-select"
              >
                {(catalog?.risk_levels || ['critical', 'high', 'medium', 'low']).map((r: string) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </Field>

            <Field label="状态">
              <select
                value={form.status}
                onChange={e => setForm({ ...form, status: e.target.value })}
                className="app-select"
              >
                {statusOptions.map((o: any) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </Field>

            <Field label="有用度权重" help="0 ~ 1，参与召回排序">
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={form.usefulness_score}
                onChange={e => setForm({ ...form, usefulness_score: Number(e.target.value) })}
                className="app-input"
              />
            </Field>

            <Field label="来源告警编号">
              <input
                value={form.source_alert_code}
                onChange={e => setForm({ ...form, source_alert_code: e.target.value })}
                placeholder="ALT-…"
                className="app-input font-mono"
              />
            </Field>

            <Field label="标签" help="逗号分隔，如：sql注入, waf, 高频">
              <input
                value={form.tagsText}
                onChange={e => setForm({ ...form, tagsText: e.target.value })}
                placeholder="sql注入, waf, 高频"
                className="app-input"
              />
            </Field>

            {[
              { key: 'signature', label: '关键信号摘要' },
              { key: 'conclusion', label: '研判结论' },
              { key: 'evidence_summary', label: '证据摘要' },
              { key: 'suggested_action', label: '处置建议' },
            ].map(f => (
              <Field key={f.key} label={f.label} className="col-span-full">
                <textarea
                  rows={3}
                  value={(form as any)[f.key]}
                  onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                  className="app-textarea"
                />
              </Field>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default ExperienceLibrary;
