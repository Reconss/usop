/**
 * 关联分析规则面板（内嵌于「响应与自动化 → 规则管理」）
 *
 * 规则存 PG，由后台翻译成 Flink SQL 提交到 Flink 会话集群执行：
 *   Kafka(valid-alerts) → 窗口关联分析 → 事件写入 PG events 表
 * 支持四类常规分析手段：频次阈值 / 去重计数 / 聚合统计 / 时序关联。
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Code2,
  Pencil, Plus, RefreshCw, Rocket, ShieldCheck, Square, Trash2, Workflow, X, Zap,
} from 'lucide-react';
import { pipelineApi } from '../../services/api';
import { useConfirmDialog, ConfirmDialog } from '../Dialogs';
import {
  Button,
  EmptyState,
  Field,
  LoadingState,
  Modal,
  SectionCard,
  SeverityBadge,
  StatCard,
  StatusBadge,
  Switch,
  TableWrap,
} from '../ui';

interface CorrelationRule {
  id: number;
  name: string;
  analysis_type: string;
  source_topic: string;
  field: string;
  window_seconds: number;
  threshold: number;
  severity: string;
  event_title?: string | null;
  event_category?: string | null;
  description?: string | null;
  config: Record<string, any>;
  enabled: boolean;
}

interface Catalog {
  string_fields: string[];
  numeric_fields: string[];
  field_labels: Record<string, string>;
  analysis_types: string[];
  analysis_labels: Record<string, string>;
  analysis_hints: Record<string, string>;
  agg_funcs: string[];
  filter_ops: string[];
  string_ops: string[];
  numeric_ops: string[];
  op_labels: Record<string, string>;
  source_topics: string[];
}

const WINDOW_PRESETS = [30, 45, 60, 90, 300, 600, 1800, 3600, 7200, 21600, 43200, 86400];

const SEVERITIES: Record<string, { label: string }> = {
  critical: { label: '危急' },
  high: { label: '高危' },
  medium: { label: '中危' },
  low: { label: '低危' },
};

/** 分析手段 → 徽标语义色 */
const TYPE_TONE: Record<string, 'info' | 'accent' | 'success' | 'warning'> = {
  frequency: 'info',
  distinct: 'accent',
  aggregation: 'success',
  sequence: 'warning',
};

function windowText(sec: number) {
  if (sec % 3600 === 0) return `${sec / 3600} 小时`;
  if (sec % 60 === 0) return `${sec / 60} 分钟`;
  return `${sec} 秒`;
}

/** 后端 utcnow().isoformat()（无时区后缀）→ 本地时间文本 */
function fmtTime(iso: string) {
  if (!iso) return '';
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', { hour12: false });
}

const emptyConfig = () => ({
  count_field: '',
  agg_func: 'sum',
  agg_field: '',
  compare: 'gte',
  match_a_field: '',
  match_a_operator: 'contains',
  match_a_value: '',
  match_b_field: '',
  match_b_operator: 'contains',
  match_b_value: '',
  filter: [] as { field: string; operator: string; value: string }[],
});

/**
 * 切换分析手段时补齐该类型必填的专属参数。
 * 这些字段留空会被后端拒绝（例如「去重计数」没有去重字段），提前给一个合理默认值，
 * 避免用户点了保存才看到一个语焉不详的报错。
 */
const TYPE_REQUIRED_DEFAULTS: Record<string, Partial<ReturnType<typeof emptyConfig>>> = {
  distinct: { count_field: 'alert_code' },
  aggregation: { agg_func: 'sum', agg_field: 'dst_port', compare: 'gte' },
  sequence: { match_a_field: 'category', match_b_field: 'category' },
};

function withTypeDefaults(analysisType: string, cfg: any) {
  const base = { ...emptyConfig(), ...(cfg || {}) };
  const need = TYPE_REQUIRED_DEFAULTS[analysisType];
  if (need) {
    for (const [k, v] of Object.entries(need)) {
      if (!base[k]) base[k] = v;
    }
  }
  return base;
}

/** 提交前自检：返回错误文案，通过则返回 null。与后端 validate_rule 口径保持一致。 */
function validateForm(form: any): string | null {
  if (!form.name || !form.name.trim()) return '请填写规则名称';
  if (!form.field) return '请选择分组维度';
  const win = Number(form.window_seconds);
  if (!win || win < 5 || win > 86400) return '时间窗口需在 5 秒 ~ 24 小时之间';
  const atype = form.analysis_type;
  const cfg = form.config || {};
  if (atype !== 'sequence') {
    if (form.threshold === '' || form.threshold === null || form.threshold === undefined) return '请填写阈值';
    if (Number.isNaN(Number(form.threshold))) return '阈值需为数字';
  }
  if (atype === 'distinct' && !cfg.count_field) return '「去重计数」需要选择去重统计字段';
  if (atype === 'aggregation') {
    if (!cfg.agg_field) return '「聚合统计」需要选择聚合字段（数值）';
    if (!cfg.agg_func) return '「聚合统计」需要选择聚合函数';
  }
  if (atype === 'sequence') {
    if (!cfg.match_a_field) return '「时序关联」需要选择阶段 A 的匹配字段';
    if (!cfg.match_b_field) return '「时序关联」需要选择阶段 B 的匹配字段';
  }
  return null;
}

interface Props {
  onToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function CorrelationRulesPanel({ onToast }: Props) {
  // 删除确认弹窗（应用内，替代浏览器原生 confirm）
  const { ask, confirmProps } = useConfirmDialog('删除确认');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [rules, setRules] = useState<CorrelationRule[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [sqlPreview, setSqlPreview] = useState<string>('');
  const [showEvents, setShowEvents] = useState(false);
  const [form, setForm] = useState<any>({
    name: '', analysis_type: 'frequency', source_topic: 'valid-alerts', field: 'src_ip',
    window_seconds: 300, threshold: 5, severity: 'high',
    event_title: '', event_category: 'correlation', description: '',
    config: emptyConfig(), enabled: true,
  });

  const fetchAll = useCallback(async () => {
    try {
      const [rulesRes, catRes, stRes]: any[] = await Promise.all([
        pipelineApi.correlationRules(),
        pipelineApi.correlationFieldCatalog(),
        pipelineApi.correlationStatus(),
      ]);
      if (rulesRes.success) setRules(rulesRes.data || []);
      if (catRes.success) setCatalog(catRes.data);
      if (stRes.success) setStatus(stRes.data);
    } catch (e) {
      console.error('加载关联分析规则失败:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 20000);
    return () => clearInterval(t);
  }, [fetchAll]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      name: '', analysis_type: 'frequency', source_topic: 'valid-alerts', field: 'src_ip',
      window_seconds: 300, threshold: 5, severity: 'high',
      event_title: '', event_category: 'correlation', description: '',
      config: emptyConfig(), enabled: true,
    });
    setShowForm(true);
  };

  const openEdit = (r: CorrelationRule) => {
    setEditingId(r.id);
    setForm({
      name: r.name,
      analysis_type: r.analysis_type || 'frequency',
      source_topic: r.source_topic || 'valid-alerts',
      field: r.field,
      window_seconds: r.window_seconds,
      threshold: r.threshold,
      severity: r.severity || 'high',
      event_title: r.event_title || '',
      event_category: r.event_category || 'correlation',
      description: r.description || '',
      config: { ...emptyConfig(), ...(r.config || {}) },
      enabled: r.enabled,
    });
    setShowForm(true);
  };

  const submit = async () => {
    const invalid = validateForm(form);
    if (invalid) { onToast(invalid, 'error'); return; }
    setBusy('save');
    try {
      const payload: any = {
        name: form.name.trim(),
        analysis_type: form.analysis_type,
        source_topic: form.source_topic,
        field: form.field,
        window_seconds: Number(form.window_seconds),
        severity: form.severity,
        event_title: form.event_title || undefined,
        event_category: form.event_category || undefined,
        description: form.description || undefined,
        config: form.config,
        enabled: form.enabled,
      };
      if (form.analysis_type !== 'sequence') payload.threshold = Number(form.threshold);
      const res: any = editingId != null
        ? await pipelineApi.updateCorrelationRule(editingId, payload)
        : await pipelineApi.createCorrelationRule(payload);
      if (res.success) {
        onToast(editingId != null ? '规则已更新（需重新部署作业生效）' : '规则已创建（需部署作业生效）');
        setShowForm(false);
        setEditingId(null);
        await fetchAll();
      } else {
        onToast(res.error || '保存失败', 'error');
      }
    } catch (e: any) {
      onToast(e?.message || '保存失败', 'error');
    } finally { setBusy(''); }
  };

  const toggle = async (r: CorrelationRule) => {
    await pipelineApi.updateCorrelationRule(r.id, { enabled: !r.enabled });
    await fetchAll();
  };

  const remove = async (id: number) => {
    const rule = rules.find((r) => r.id === id);
    const ok = await ask({
      message: `确认删除关联规则「${rule?.name || '#' + id}」？删除后需重新部署作业才会在 Flink 中移除对应逻辑，历史已产出的事件不受影响。`,
      danger: true,
      confirmText: '删除',
    });
    if (!ok) return;
    setBusy(`del-${id}`);
    try {
      await pipelineApi.deleteCorrelationRule(id);
      onToast('规则已删除');
      await fetchAll();
    } finally { setBusy(''); }
  };

  const previewSql = async () => {
    setBusy('preview');
    try {
      const res: any = await pipelineApi.previewCorrelationSql({});
      if (res.success) { setSqlPreview(res.data.sql); onToast('SQL 已生成'); }
      else onToast(res.error || '生成失败', 'error');
    } catch (e: any) { onToast(e?.message || '生成失败', 'error'); }
    finally { setBusy(''); }
  };

  const deploy = async () => {
    setBusy('deploy');
    try {
      const res: any = await pipelineApi.deployCorrelationJob();
      if (res.success) {
        onToast(`作业已部署（${res.data.rule_count} 条规则 → ${res.data.insert_count} 个分析分支）`);
        await fetchAll();
      } else onToast(res.error || '部署失败', 'error');
    } catch (e: any) { onToast(e?.message || '部署失败', 'error'); }
    finally { setBusy(''); }
  };

  const stop = async () => {
    setBusy('stop');
    try {
      const res: any = await pipelineApi.stopCorrelationJob();
      if (res.success) { onToast(`已停止 ${res.data.cancelled_jobs?.length || 0} 个作业`); await fetchAll(); }
    } catch (e: any) { onToast(e?.message || '停止失败', 'error'); }
    finally { setBusy(''); }
  };

  const toggleWatchdog = async (next: boolean) => {
    try {
      const res: any = await pipelineApi.setCorrelationWatchdog(next);
      if (res.success) { onToast(next ? '自动守护已开启' : '自动守护已关闭'); await fetchAll(); }
      else onToast(res.error || '设置失败', 'error');
    } catch (e: any) { onToast(e?.message || '设置失败', 'error'); }
  };

  const setCfg = (patch: Record<string, any>) =>
    setForm((f: any) => ({ ...f, config: { ...f.config, ...patch } }));

  const fieldOptions = (numeric = false) =>
    numeric ? (catalog?.numeric_fields || []) : (catalog?.string_fields || []);

  const fieldLabel = (f: string) => catalog?.field_labels?.[f] || f;
  const opLabel = (o: string) => catalog?.op_labels?.[o] || o;

  if (loading) {
    return <LoadingState label="正在加载关联分析规则…" />;
  }

  const enabledCount = rules.filter((r) => r.enabled).length;
  const jobRunning = (status?.running_jobs || []).length > 0;
  const recentEvents: any[] = status?.recent_events || [];

  return (
    <div className="flex flex-col gap-4">
      {/* 状态栏 */}
      <div className="app-grid">
        <StatCard label="规则总数" value={rules.length} icon={Workflow} tone="primary" />
        <StatCard label="已启用" value={enabledCount} icon={CheckCircle2} tone="success" />
        <StatCard
          label="Flink 作业"
          value={jobRunning ? '运行中' : '未运行'}
          icon={Activity}
          tone={jobRunning ? 'success' : 'neutral'}
          hint={
            status?.cluster
              ? `${status.cluster.taskmanagers} TM · ${status.cluster['slots-available']}/${status.cluster['slots-total']} 槽位可用`
              : '集群不可达'
          }
        />
        <StatCard
          label="24h 产出事件"
          value={status?.event_count_24h ?? 0}
          icon={Zap}
          tone="info"
          hint={`累计 ${status?.event_count_total ?? 0} 条 → PG events 表`}
        />
      </div>

      {/* 工具栏 */}
      <div className="app-toolbar">
        <Button variant="secondary" icon={RefreshCw} onClick={fetchAll}>刷新</Button>
        <Button
          variant="secondary"
          icon={Code2}
          loading={busy === 'preview'}
          onClick={previewSql}
        >
          预览 SQL
        </Button>
        <Button
          variant="primary"
          icon={Rocket}
          loading={busy === 'deploy'}
          disabled={enabledCount === 0}
          onClick={deploy}
          title="按当前启用规则重新生成 Flink SQL 并提交作业（先取消旧作业）。规则新增/修改/删除后，必须重新部署才会生效"
        >
          部署 / 重新部署作业
        </Button>
        <Button
          variant="danger-ghost"
          icon={Square}
          loading={busy === 'stop'}
          onClick={stop}
          title="取消正在运行的关联作业（维护暂停用）。停止期间不产生关联事件；重新点「部署」即可恢复，自动守护也会随之恢复"
        >
          停止作业
        </Button>
        <div className="app-toolbar-end">
          <Button
            variant="soft"
            icon={showForm ? X : Plus}
            onClick={() => (showForm ? setShowForm(false) : openCreate())}
          >
            {showForm ? '取消' : '新建规则'}
          </Button>
        </div>
      </div>

      {/* 作业中断告警 / 手动停止提示：有启用规则但作业不在跑时必须显式提醒 */}
      {enabledCount > 0 && !jobRunning && (
        status?.watchdog?.user_stopped ? (
          <div className="callout callout-warning flex items-start gap-2">
            <Square size={14} className="mt-0.5 shrink-0" />
            <span className="flex-1">
              关联分析作业已<strong>手动停止</strong>，实时分析暂停中。自动守护已挂起，不会自动重提作业。
            </span>
            <Button variant="primary" size="sm" icon={Rocket} loading={busy === 'deploy'} onClick={deploy}>
              恢复运行
            </Button>
          </div>
        ) : (
          <div className="callout callout-danger flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span className="flex-1">
              <strong>实时关联分析已中断</strong>：有 {enabledCount} 条启用规则，但 Flink 作业未运行
              （TaskManager 故障 / 集群重启都会导致），新的关联事件不会产生。看门狗通常会在 30 秒内自动恢复，若未恢复请手动重新部署。
            </span>
            <Button variant="primary" size="sm" icon={Rocket} loading={busy === 'deploy'} onClick={deploy}>
              立即重新部署
            </Button>
          </div>
        )
      )}

      {/* 自动守护状态与开关 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-text-muted">
        <span className="flex items-center gap-1.5">
          <ShieldCheck size={13} className={status?.watchdog?.enabled ? 'text-success' : 'text-text-muted/50'} />
          自动守护
          <Switch size="sm" checked={!!status?.watchdog?.enabled} onChange={toggleWatchdog} label="自动守护" />
          <span>{status?.watchdog?.enabled ? '已开启（作业中断约 30 秒内自动重提）' : '已关闭（作业中断需手动恢复）'}</span>
        </span>
        {status?.watchdog?.user_stopped && <span className="text-warning">已手动停止，守护挂起</span>}
        {(status?.watchdog?.auto_deploy_count ?? 0) > 0 && (
          <span>累计自动恢复 {status.watchdog.auto_deploy_count} 次{status.watchdog.last_auto_deploy ? ` · 最近 ${fmtTime(status.watchdog.last_auto_deploy)}` : ''}</span>
        )}
        {(status?.watchdog?.consecutive_failures ?? 0) > 0 && (
          <span className="text-danger">连续重提失败 {status.watchdog.consecutive_failures} 次：{status.watchdog.last_error}</span>
        )}
      </div>

      {!status?.gateway_available && (
        <div className="callout callout-warning">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            Flink SQL Gateway 不可达（{status?.gateway_url}），无法部署作业。请确认 <code className="font-mono">flink-sql-gateway</code> 容器已启动。
          </span>
        </div>
      )}

      {/* 表单 */}
      {showForm && (
        <SectionCard
          icon={editingId != null ? Pencil : Plus}
          title={editingId != null ? '编辑关联分析规则' : '新建关联分析规则'}
          description="保存后需点击「部署 / 重新部署作业」才会在 Flink 中生效"
          actions={
            <Button variant="ghost" size="sm" icon={X} onClick={() => setShowForm(false)}>
              收起
            </Button>
          }
          footer={
            <>
              <Button
                variant="primary"
                icon={CheckCircle2}
                loading={busy === 'save'}
                onClick={submit}
              >
                {editingId != null ? '保存修改' : '保存规则'}
              </Button>
              <span className="text-caption text-text-muted">
                保存后需点击「部署 / 重新部署作业」才会在 Flink 中生效
              </span>
            </>
          }
        >
          <div className="flex flex-col gap-5">
            <div className="app-form-grid">
              <Field label="规则名称" required>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="如：同源 IP 高频告警"
                  className="app-input"
                />
              </Field>

              <Field
                label="分析手段"
                required
                help={catalog?.analysis_hints?.[form.analysis_type]}
              >
                <select
                  value={form.analysis_type}
                  onChange={(e) => setForm({ ...form, analysis_type: e.target.value, config: withTypeDefaults(e.target.value, form.config) })}
                  className="app-select"
                >
                  {(catalog?.analysis_types || []).map((t) => (
                    <option key={t} value={t}>{catalog?.analysis_labels?.[t] || t}</option>
                  ))}
                </select>
              </Field>

              <Field label="分组维度" required>
                <select
                  value={form.field}
                  onChange={(e) => setForm({ ...form, field: e.target.value })}
                  className="app-select"
                >
                  {(catalog?.string_fields || []).map((f) => <option key={f} value={f}>{fieldLabel(f)}（{f}）</option>)}
                  {(catalog?.numeric_fields || []).map((f) => <option key={f} value={f}>{fieldLabel(f)}（{f}）</option>)}
                </select>
              </Field>

              <Field label="时间窗口" required>
                <select
                  value={form.window_seconds}
                  onChange={(e) => setForm({ ...form, window_seconds: Number(e.target.value) })}
                  className="app-select"
                >
                  {WINDOW_PRESETS.map((s) => <option key={s} value={s}>{windowText(s)}</option>)}
                  {!WINDOW_PRESETS.includes(Number(form.window_seconds)) && (
                    <option value={form.window_seconds}>{form.window_seconds} 秒（自定义）</option>
                  )}
                </select>
              </Field>

              {form.analysis_type !== 'sequence' && (
                <Field
                  label={`阈值（${form.analysis_type === 'aggregation' ? '聚合值' : form.analysis_type === 'distinct' ? '不同取值数' : '出现次数'}）`}
                  required
                >
                  <input
                    type="number"
                    value={form.threshold}
                    onChange={(e) => setForm({ ...form, threshold: e.target.value })}
                    className="app-input num"
                  />
                </Field>
              )}

              <Field label="事件级别">
                <select
                  value={form.severity}
                  onChange={(e) => setForm({ ...form, severity: e.target.value })}
                  className="app-select"
                >
                  {Object.entries(SEVERITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </Field>

              <Field label="事件分类">
                <input
                  value={form.event_category}
                  onChange={(e) => setForm({ ...form, event_category: e.target.value })}
                  className="app-input"
                />
              </Field>
            </div>

            {/* 分析手段专属参数 */}
            {form.analysis_type === 'distinct' && (
              <div className="app-form-grid">
                <Field
                  label="去重统计字段"
                  required
                  help="例：同一源 IP 在窗口内命中多少个不同的「告警编号」"
                >
                  <select
                    value={form.config.count_field}
                    onChange={(e) => setCfg({ count_field: e.target.value })}
                    className="app-select"
                  >
                    <option value="">请选择</option>
                    {fieldOptions().map((f) => <option key={f} value={f}>{fieldLabel(f)}（{f}）</option>)}
                  </select>
                </Field>
              </div>
            )}

            {form.analysis_type === 'aggregation' && (
              <div className="app-form-grid">
                <Field label="聚合函数" required>
                  <select
                    value={form.config.agg_func}
                    onChange={(e) => setCfg({ agg_func: e.target.value })}
                    className="app-select"
                  >
                    {(catalog?.agg_funcs || []).map((f) => <option key={f} value={f}>{f.toUpperCase()}</option>)}
                  </select>
                </Field>

                <Field label="聚合字段（数值）" required>
                  <select
                    value={form.config.agg_field}
                    onChange={(e) => setCfg({ agg_field: e.target.value })}
                    className="app-select"
                  >
                    <option value="">请选择</option>
                    {fieldOptions(true).map((f) => <option key={f} value={f}>{fieldLabel(f)}（{f}）</option>)}
                  </select>
                </Field>

                <Field label="判定方向">
                  <select
                    value={form.config.compare}
                    onChange={(e) => setCfg({ compare: e.target.value })}
                    className="app-select"
                  >
                    <option value="gte">≥ 阈值</option>
                    <option value="lte">≤ 阈值</option>
                  </select>
                </Field>
              </div>
            )}

            {form.analysis_type === 'sequence' && (
              <div className="flex flex-col gap-4">
                {(['a', 'b'] as const).map((slot) => (
                  <div key={slot} className="app-form-grid">
                    <Field label={`阶段 ${slot.toUpperCase()} 字段`} required>
                      <select
                        value={form.config[`match_${slot}_field`]}
                        onChange={(e) => setCfg({ [`match_${slot}_field`]: e.target.value })}
                        className="app-select"
                      >
                        <option value="">请选择</option>
                        {(catalog?.string_fields || []).map((f) => <option key={f} value={f}>{fieldLabel(f)}（{f}）</option>)}
                      </select>
                    </Field>

                    <Field label="操作符">
                      <select
                        value={form.config[`match_${slot}_operator`]}
                        onChange={(e) => setCfg({ [`match_${slot}_operator`]: e.target.value })}
                        className="app-select"
                      >
                        {(catalog?.string_ops || ['eq', 'ne', 'contains', 'not_contains', 'regex']).map((o) => (
                          <option key={o} value={o}>{opLabel(o)}</option>
                        ))}
                      </select>
                    </Field>

                    <Field label="值" required>
                      <input
                        value={form.config[`match_${slot}_value`]}
                        onChange={(e) => setCfg({ [`match_${slot}_value`]: e.target.value })}
                        placeholder={slot === 'a' ? '如：scan' : '如：attempted'}
                        className="app-input font-mono"
                      />
                    </Field>
                  </div>
                ))}
                <p className="text-caption text-text-muted">
                  基于处理时间窗口：同一分组在同一窗口内同时出现阶段 A 与阶段 B 即命中（不判断严格先后，因处理时间存在同毫秒并列）。
                </p>
              </div>
            )}

            {/* 前置筛选条件 */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="app-label mb-0">前置筛选条件（可选，多条按 AND 组合）</span>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Plus}
                  onClick={() => setCfg({ filter: [...(form.config.filter || []), { field: 'severity', operator: 'eq', value: '' }] })}
                >
                  添加条件
                </Button>
              </div>

              {(form.config.filter || []).length === 0 ? (
                <p className="text-caption text-text-muted">未设置筛选条件，规则作用于该 topic 的全部告警</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {(form.config.filter || []).map((c: any, i: number) => (
                    <div key={i} className="app-panel flex flex-wrap items-center gap-2 p-2.5">
                      <select
                        value={c.field}
                        onChange={(e) => { const f = [...form.config.filter]; f[i] = { ...f[i], field: e.target.value }; setCfg({ filter: f }); }}
                        className="app-select w-auto min-w-[140px] flex-1 text-[12px]"
                        aria-label="筛选字段"
                      >
                        <option value="">字段</option>
                        {(catalog?.string_fields || []).map((f) => <option key={f} value={f}>{fieldLabel(f)}</option>)}
                        {(catalog?.numeric_fields || []).map((f) => <option key={f} value={f}>{fieldLabel(f)}</option>)}
                      </select>

                      <select
                        value={c.operator}
                        onChange={(e) => { const f = [...form.config.filter]; f[i] = { ...f[i], operator: e.target.value }; setCfg({ filter: f }); }}
                        className="app-select w-auto min-w-[120px] text-[12px]"
                        aria-label="筛选操作符"
                      >
                        {(catalog?.filter_ops || []).map((o) => <option key={o} value={o}>{opLabel(o)}</option>)}
                      </select>

                      <input
                        value={c.value}
                        onChange={(e) => { const f = [...form.config.filter]; f[i] = { ...f[i], value: e.target.value }; setCfg({ filter: f }); }}
                        placeholder="值"
                        className="app-input min-w-[140px] flex-[2] font-mono text-[12px]"
                        aria-label="筛选值"
                      />

                      <Button
                        variant="danger-ghost"
                        size="sm"
                        icon={Trash2}
                        className="w-8 px-0"
                        title="移除条件"
                        onClick={() => setCfg({ filter: form.config.filter.filter((_: any, j: number) => j !== i) })}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="app-form-grid">
              <Field label="事件标题（留空用规则名）">
                <input
                  value={form.event_title}
                  onChange={(e) => setForm({ ...form, event_title: e.target.value })}
                  className="app-input"
                />
              </Field>
              <Field label="规则说明">
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="app-input"
                />
              </Field>
            </div>
          </div>
        </SectionCard>
      )}

      {/* 规则表 */}
      <SectionCard
        flush
        icon={Workflow}
        title="关联分析规则"
        description={`Flink 流作业在时间窗口内做频次 / 去重 / 聚合 / 时序分析 · 共 ${rules.length} 条`}
        actions={
          <span className="text-caption text-text-muted num">
            生效 {enabledCount} / {rules.length}
          </span>
        }
      >
        {rules.length === 0 ? (
          <EmptyState
            icon={Workflow}
            title="暂无关联分析规则"
            description="新建规则后点击「部署作业」即可在 Flink 中实时分析。"
            action={
              <Button variant="soft" icon={Plus} onClick={openCreate}>新建规则</Button>
            }
          />
        ) : (
          <TableWrap>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 180 }}>规则名称</th>
                  <th style={{ width: 110 }}>分析手段</th>
                  <th style={{ width: 130 }}>分组</th>
                  <th style={{ minWidth: 220 }}>条件</th>
                  <th style={{ width: 90 }}>级别</th>
                  <th style={{ width: 80 }}>状态</th>
                  <th style={{ width: 100 }} className="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => {
                  const cfg = r.config || {};
                  let cond = `≥ ${r.threshold}`;
                  if (r.analysis_type === 'distinct') cond = `不同 ${fieldLabel(cfg.count_field)} ≥ ${r.threshold}`;
                  if (r.analysis_type === 'aggregation') cond = `${(cfg.agg_func || 'sum').toUpperCase()}(${fieldLabel(cfg.agg_field)}) ${cfg.compare === 'lte' ? '≤' : '≥'} ${r.threshold}`;
                  if (r.analysis_type === 'sequence') cond = `${cfg.match_a_field}≈${cfg.match_a_value} + ${cfg.match_b_field}≈${cfg.match_b_value}`;
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="truncate-1 font-medium text-text-primary">{r.name}</div>
                        {r.description && (
                          <div className="mt-0.5 truncate-1 text-caption text-text-muted">{r.description}</div>
                        )}
                      </td>
                      <td>
                        <StatusBadge tone={TYPE_TONE[r.analysis_type] || 'neutral'}>
                          {catalog?.analysis_labels?.[r.analysis_type] || r.analysis_type}
                        </StatusBadge>
                      </td>
                      <td className="text-text-secondary">{fieldLabel(r.field)}</td>
                      <td>
                        <div className="text-caption text-text-secondary">{windowText(r.window_seconds)}内</div>
                        <div className="truncate-1 font-mono text-[11.5px] text-text-muted" title={cond}>{cond}</div>
                      </td>
                      <td><SeverityBadge severity={r.severity} /></td>
                      <td>
                        <Switch
                          size="sm"
                          checked={r.enabled}
                          onChange={() => toggle(r)}
                          label={`切换 ${r.name} 状态`}
                        />
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={Pencil}
                            className="w-8 px-0"
                            title="编辑"
                            onClick={() => openEdit(r)}
                          />
                          <Button
                            variant="danger-ghost"
                            size="sm"
                            icon={Trash2}
                            className="w-8 px-0"
                            loading={busy === `del-${r.id}`}
                            title="删除"
                            onClick={() => remove(r.id)}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </SectionCard>

      {/* 产出事件 */}
      <SectionCard
        flush
        icon={Activity}
        title="最近产出事件"
        description={`PG events 表 · source=flink-correlation · 累计 ${status?.event_count_total ?? 0} 条`}
        actions={
          <Button
            variant="ghost"
            size="sm"
            icon={showEvents ? ChevronUp : ChevronDown}
            onClick={() => setShowEvents(!showEvents)}
          >
            {showEvents ? '收起' : '展开'}
          </Button>
        }
      >
        {showEvents && (
          recentEvents.length === 0 ? (
            <EmptyState
              compact
              icon={Activity}
              title="暂无事件产出"
              description="部署作业后，命中规则的告警会在窗口关闭时生成事件。"
            />
          ) : (
            <TableWrap maxHeight={320}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 160 }}>事件编号</th>
                    <th style={{ minWidth: 240 }}>标题</th>
                    <th style={{ width: 90 }}>级别</th>
                    <th style={{ width: 180 }}>时间</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEvents.map((e: any) => (
                    <tr key={e.id}>
                      <td className="font-mono text-[11.5px] text-text-muted">{e.event_code}</td>
                      <td className="text-text-primary">{e.title}</td>
                      <td><SeverityBadge severity={e.severity} /></td>
                      <td className="num text-text-muted">
                        {e.timestamp ? new Date(e.timestamp + 'Z').toLocaleString('zh-CN') : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )
        )}
      </SectionCard>

      {/* SQL 预览弹窗 */}
      <Modal
        open={Boolean(sqlPreview)}
        onClose={() => setSqlPreview('')}
        width={960}
        title="生成的 Flink SQL"
        description="由已启用规则自动生成，部署时提交到 Flink 会话集群"
        footer={
          <Button variant="secondary" onClick={() => setSqlPreview('')}>关闭</Button>
        }
      >
        <pre className="max-h-[60vh] overflow-auto whitespace-pre rounded-input border border-border-color bg-surface-2 p-3 font-mono text-[11.5px] leading-relaxed text-text-secondary scrollbar-thin">
          {sqlPreview}
        </pre>
      </Modal>

      {/* 删除确认弹窗（应用内，替代浏览器原生 confirm，防误触删除） */}
      <ConfirmDialog {...confirmProps} />
    </div>
  );
}
