/**
 * 数据采集页面 —— 四阶段流水线设计
 * ① 设备接入：raw-logs 汇聚 + 设备直发 topic 创建（Kafka）
 * ② 日志解析：从 raw-logs 读取不同类型日志，多方式解析（自动识别/JSON/正则/模板/…）
 * ③ 过滤与输出：判定 + 出口合成一层——命中规则/白名单/去重的告警归「被过滤」分支，
 *    未命中的归「未过滤」分支；两个分支各自的落点 topic 就是分流策略的「出口」清单
 *    （一个分支可挂多个出口实现多投，可选用字段模型裁剪字段），告警只投递一次
 * ④ 告警存储：按存储任务持续消费指定 Kafka topic → 幂等写入指定 ES 索引（可配置 topic 与索引）
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Database, Loader2, RefreshCw, HardDrive, Zap,
  CheckCircle, Workflow, Filter, Archive, GitBranch,
  Plus, Radio, Link2, X, Radio as RadioIcon, Trash2, Power, FileText, Braces, Regex, Pencil, Play,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { dataSourcesApi, pipelineApi } from '../services/api';
import { Button, ContentContainer, PageHeader } from '../components/ui';
import { useConfirmDialog, ConfirmDialog } from '../components/Dialogs';

interface PipelineStatus {
  running: boolean;
  threads: Record<string, boolean>;
  stats: Record<string, number>;
  es_indexes: Record<string, number>;
  dedup_keys: number;
}

/** 平台纳管（已配置）的单个 topic，由后端 /pipeline/device-topics 返回 */
interface ManagedTopic {
  topic: string;
  datasource_id: number;
  name: string;
  device_type?: string;
  status?: string;
  exists: boolean;
  partitions?: number;
  consuming: boolean;
  system: boolean;
}

interface TopicInfo {
  items: ManagedTopic[];
  kafka_reachable: boolean;
  managed_count: number;
}

interface ParseProfile {
  id: number; name: string; topic: string; match_type: string;
  match_value: string; template_id?: number; template_name?: string; enabled: boolean;
  parser_config?: ParserConfig;
  field_mappings?: FieldMapping[];
}

interface FieldMapping {
  source: string; target: string; field_type?: string;
  default_value?: string; required?: boolean;
}

interface ParserConfig {
  headers?: string[];      // csv
  delimiter?: string;      // csv / keyvalue
  pattern?: string;        // grok
  [key: string]: unknown;  // 允许透传后端扩展配置项
}

interface CatalogField {
  name: string; label: string; type: string; category: string;
  aliases: string[]; required: boolean; source?: string;  // source: model | standard
}

interface ParseTemplate { id: number; name: string; fields: string[]; }

/** ③ 分流出口：某个分支的一个目标 topic（一条策略可挂多个，实现多投） */
interface PolicyExit {
  id?: number; policy_id?: number; name?: string | null;
  branch: 'valid' | 'filtered'; target_topic: string;
  template_id?: number | null; template_name?: string | null;
  enabled: boolean; sort_order: number;
}

/** ③ 分流策略：来源 topic 的判定开关（去重/白名单）+ 出口清单（单层出口） */
interface DispatchPolicy {
  id: number; name: string; source_topic: string; source_topics?: string[];
  dedup_enabled: boolean; whitelist_enabled: boolean;
  enabled: boolean; sort_order: number;
  exits: PolicyExit[];
}

/** ④ 存储任务：Kafka topic → ES 索引 */
interface StorageRoute {
  id: number; name: string; source_topic: string; index_name: string;
  id_field: string; enabled: boolean; description: string;
  runtime?: { running: boolean; stored: number; errors: number; last_error: string; last_doc_id: string; last_at: string | null };
  es?: { docs: number | null; exists: boolean };
}

const BRANCH_LABELS: Record<string, string> = {
  valid: '未过滤（通过）', filtered: '被过滤（含重复）',
};

/** 一条策略两个分支出口的展示串（空出口表示回退内置默认） */
const DEFAULT_EXIT_HINT: Record<string, string> = {
  valid: 'valid-alerts', filtered: 'invalid-alerts',
};

interface FilterRule {
  id: number; name: string; topic: string; field: string;
  operator: string; value: string; enabled: boolean;
}

const DEVICE_TYPES = [
  { value: '', label: '不绑定（仅建 topic）' },
  { value: 'suricata', label: 'Suricata (NIDS)' },
  { value: 'wazuh', label: 'Wazuh (HIDS)' },
  { value: 'imperva', label: 'Imperva SecureSphere (WAF)' },
  { value: 'modsecurity', label: 'ModSecurity (WAF)' },
  { value: 'crowdstrike', label: 'CrowdStrike Falcon (EDR)' },
];

const PARSE_TYPE_LABELS: Record<string, string> = {
  auto: '自动识别（内置解析器）',
  json: 'JSON 结构化解析',
  regex: '正则提取（命名分组）',
  template: '资源管理解析模板',
  syslog: 'Syslog（RFC3164/5424）',
  cef: 'CEF/LEEF 扩展格式',
  keyvalue: '键值对（KV）',
  csv: 'CSV（自定义表头）',
  grok: 'Grok 模式',
};

/** 需要额外解析器配置才可用的方式 */
const CONFIG_TYPES = ['csv', 'keyvalue', 'grok'];

const FIELD_TYPE_LABELS: Record<string, string> = {
  '': '自动推断', string: '字符串', number: '数值', int: '整数',
  float: '浮点', boolean: '布尔', datetime: '时间', ip: 'IP',
};

const OPERATOR_LABELS: Record<string, string> = {
  eq: '等于', contains: '包含', regex: '正则', gt: '大于', lt: '小于',
};

const TABS = [
  { id: 'ingest', label: '① 设备接入', icon: Radio },
  { id: 'parse', label: '② 日志解析', icon: Workflow },
  { id: 'flow', label: '③ 过滤与输出', icon: Filter },
  { id: 'store', label: '④ 告警存储', icon: HardDrive },
] as const;

export default function DataIngestion() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<string>('ingest');
  const [pipeline, setPipeline] = useState<PipelineStatus | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const pipeRes: any = await pipelineApi.status();
      if (pipeRes.success) setPipeline(pipeRes.data);
    } catch (e) {
      console.error('获取状态失败:', e);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    const init = async () => { await refreshAll(); setLoading(false); };
    init();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [refreshAll, fetchStatus]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  const stats = pipeline?.stats || {};

  return (
    <ContentContainer>
      <PageHeader
        icon={Database}
        title="数据采集"        actions={
          <Button variant="secondary" icon={RefreshCw} loading={refreshing} onClick={handleRefresh}>
            刷新
          </Button>
        }
        toolbar={
          <div className="tabs-line">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`tab-line-item ${tab === id ? 'is-active' : ''}`}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        }
      />

      {/* ① 设备接入 */}
      {tab === 'ingest' && <DeviceTopicPanel onChanged={refreshAll} />}

      {/* ② 日志解析 */}
      {tab === 'parse' && <ParseProfilePanel />}

      {/* ③ 过滤与输出：过滤规则（判分支）+ 分流策略（唯一出口层） */}
      {tab === 'flow' && (
        <div className="space-y-6">
          <DispatchPolicyPanel />
          <FilterSummary />
        </div>
      )}

      {/* ④ 告警存储：Kafka → ES 持久化任务 */}
      {tab === 'store' && <StorageRoutePanel stats={stats} />}
    </ContentContainer>
  );
}

// ==================== ② 日志解析配置 ====================
function ParseProfilePanel() {
  const [profiles, setProfiles] = useState<ParseProfile[]>([]);
  const [templates, setTemplates] = useState<ParseTemplate[]>([]);
  const [topics, setTopics] = useState<ManagedTopic[]>([]);
  const [catalog, setCatalog] = useState<CatalogField[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<{
    name: string; topic: string; match_type: string; match_value: string;
    template_id: string; mappings: FieldMapping[]; config: ParserConfig;
  }>({ name: '', topic: 'raw-logs', match_type: 'auto', match_value: '', template_id: '', mappings: [], config: {} });

  // 样本试解析
  const [sample, setSample] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [previewError, setPreviewError] = useState('');

  const fetchAll = useCallback(async () => {
    try {
      const [pRes, tRes, topicRes, catRes]: any[] = await Promise.all([
        pipelineApi.parseProfiles(), pipelineApi.parseTemplates(), pipelineApi.deviceTopics(),
        pipelineApi.fieldCatalog(),
      ]);
      if (pRes.success) setProfiles(pRes.data);
      if (tRes.success) setTemplates(tRes.data);
      // topic 取自设备接入的纳管列表（后端返回 {items:[...]}）
      if (topicRes.success) setTopics(topicRes.data?.items || []);
      if (catRes.success) setCatalog(catRes.data);
    } catch (e) {
      console.error('加载解析配置失败:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const resetForm = () => {
    setForm({ name: '', topic: 'raw-logs', match_type: 'auto', match_value: '', template_id: '', mappings: [], config: {} });
    setEditingId(null);
    setSample('');
    setPreview(null);
    setPreviewError('');
  };

  const openEdit = (p: ParseProfile) => {
    setEditingId(p.id);
    setForm({
      name: p.name, topic: p.topic, match_type: p.match_type,
      match_value: p.match_value || '',
      template_id: p.template_id ? String(p.template_id) : '',
      mappings: (p.field_mappings || []).map((m) => ({ ...m })),
      config: (p.parser_config && Object.keys(p.parser_config).length ? { ...p.parser_config } : {}),
    });
    setShowForm(true);
    setError('');
    setPreview(null);
    setPreviewError('');
  };

  const currentConfig = (): ParserConfig => {
    // 按当前解析方式收敛解析器配置，避免残留无关键
    const c = { ...form.config };
    if (form.match_type === 'grok') {
      if (form.match_value.trim()) c.pattern = form.match_value.trim();
      delete c.headers; delete c.delimiter;
    } else if (form.match_type === 'csv') {
      delete c.pattern;
    } else if (form.match_type === 'keyvalue') {
      delete c.headers; delete c.pattern;
    }
    return c;
  };

  const runPreview = async () => {
    if (!sample.trim()) { setPreviewError('请先粘贴一条样本日志'); return; }
    setPreviewing(true);
    setPreviewError('');
    setPreview(null);
    try {
      const res: any = await pipelineApi.previewParse({
        match_type: form.match_type,
        match_value: form.match_value || undefined,
        template_id: form.template_id ? Number(form.template_id) : undefined,
        parser_config: currentConfig(),
        field_mappings: form.mappings.filter((m) => m.source.trim() && m.target.trim()),
        sample: sample.trim(),
      });
      if (res.success) { setPreview(res.data); } else { setPreviewError(res.error || '试解析失败'); }
    } catch (e: any) {
      setPreviewError(e?.message || '试解析失败');
    } finally {
      setPreviewing(false);
    }
  };

  /** 采纳试解析给出的推荐映射（精确/模糊），已存在的目标字段不重复添加 */
  const adoptSuggestions = async (suggestions: any[]) => {
    if (!suggestions?.length) return;
    const existing = new Set(form.mappings.map((m) => m.target));
    const next = [...form.mappings];
    for (const s of suggestions) {
      if (existing.has(s.target)) continue;
      // 该目标字段已被其他源映射时不覆盖（保留用户显式配置）
      next.push({ source: s.source, target: s.target, field_type: s.field_type || '', default_value: '', required: false });
      existing.add(s.target);
    }
    setForm({ ...form, mappings: next });
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('配置名称不能为空'); return; }
    setSaving(true);
    setError('');
    try {
      const mappings = form.mappings.filter((m) => m.source.trim() && m.target.trim());
      const payload: any = {
        name: form.name.trim(),
        topic: form.topic || 'raw-logs',
        match_type: form.match_type,
        match_value: form.match_value || undefined,
        template_id: form.template_id ? Number(form.template_id) : undefined,
        parser_config: currentConfig(),
        field_mappings: form.match_type === 'auto' ? [] : mappings,
        enabled: true,
      };
      const res: any = editingId
        ? await pipelineApi.updateParseProfile(editingId, payload)
        : await pipelineApi.createParseProfile(payload);
      if (res.success) {
        setShowForm(false);
        resetForm();
        await fetchAll();
      } else {
        setError(res.error || '保存失败');
      }
    } catch (e: any) {
      setError(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (p: ParseProfile) => {
    await pipelineApi.updateParseProfile(p.id, { enabled: !p.enabled });
    await fetchAll();
  };

  const remove = async (id: number) => {
    await pipelineApi.deleteParseProfile(id);
    await fetchAll();
  };

  return (
    <div className="bg-card-bg rounded-card border border-border-color p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Workflow className="w-5 h-5 text-accent" /> 日志解析配置
          </h3>
          <p className="text-xs text-text-muted mt-1">
            从 raw-logs 读取不同类型日志，解析结果经字段映射写入标准告警字段：自动识别 / JSON 结构化 / 正则提取 / 资源管理解析模板
          </p>
        </div>
        <button
          onClick={() => { if (showForm) { setShowForm(false); resetForm(); } else setShowForm(true); setError(''); }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent-solid text-white rounded-lg hover:bg-accent-solid-hover"
        >
          {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showForm ? '取消' : '新建解析配置'}
        </button>
      </div>

      {showForm && (
        <div className="mb-4 p-4 rounded-lg bg-page-bg border border-border-color space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">配置名称 *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="如：防火墙文本日志解析"
                className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm text-text-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">生效 topic（含设备接入新建）</label>
              <select
                value={form.topic}
                onChange={(e) => setForm({ ...form, topic: e.target.value })}
                className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm text-text-primary font-mono"
              >
                <option value="raw-logs">raw-logs（汇聚入口）</option>
                {topics.filter((t) => t.topic !== 'raw-logs').map((t) => (
                  <option key={t.topic} value={t.topic}>
                    {t.topic}
                    {t.device_type ? ` · ${t.device_type}` : ''}
                    {t.exists ? (t.status === 'inactive' ? ' · 已暂停' : '') : ' · Kafka 中不存在'}
                  </option>
                ))}
              </select>
              {topics.length === 0 && (
                <p className="text-[11px] text-text-muted mt-1">
                  暂无纳管 topic，可到「① 设备接入」新建
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">解析方式 *</label>
              <select
                value={form.match_type}
                onChange={(e) => setForm({ ...form, match_type: e.target.value })}
                className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm text-text-primary"
              >
                {Object.entries(PARSE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {form.match_type === 'template' ? (
              <div>
                <label className="block text-xs text-text-muted mb-1">解析模板 *（资源管理-字段模型）</label>
                <select
                  value={form.template_id}
                  onChange={(e) => setForm({ ...form, template_id: e.target.value })}
                  className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm text-text-primary"
                >
                  <option value="">请选择模板</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}（{t.fields.length} 字段）</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs text-text-muted mb-1">
                  {form.match_type === 'regex' ? '正则模式 *（命名分组提取字段）'
                    : form.match_type === 'grok' ? 'Grok 模式 *（%{IPV4:src_ip} 等）'
                    : '匹配值（可选）'}
                </label>
                <input
                  value={form.match_value}
                  onChange={(e) => setForm({ ...form, match_value: e.target.value })}
                  placeholder={
                    form.match_type === 'regex' ? 'src=(?P<src_ip>[\\d.]+).*sig=(?P<signature>\\S+)'
                      : form.match_type === 'grok' ? '%{TIMESTAMP:timestamp} %{IPV4:src_ip} -> %{IPV4:dst_ip}:%{NUMBER:dst_port}'
                      : '可选过滤条件'}
                  className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm text-text-primary font-mono"
                />
                {form.match_type === 'grok' && (
                  <p className="text-[11px] text-text-muted mt-1">
                    支持 IPV4 / IPV6 / NUMBER / WORD / HOSTNAME / TIMESTAMP / ISO8601 / HTTPDATE / SYSLOGDATE
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 解析器配置：CSV / 键值对 / Grok */}
          {CONFIG_TYPES.includes(form.match_type) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-lg bg-accent/5 border border-accent/20">
              <div className="md:col-span-2 text-xs text-text-secondary font-medium">
                解析器配置（{PARSE_TYPE_LABELS[form.match_type]}）
              </div>
              {form.match_type === 'csv' && (
                <>
                  <div>
                    <label className="block text-xs text-text-muted mb-1">表头（逗号分隔，按顺序对应列）</label>
                    <input
                      value={(form.config.headers || []).join(',')}
                      onChange={(e) => setForm({
                        ...form,
                        config: { ...form.config, headers: e.target.value.split(',').map((h) => h.trim()).filter(Boolean) },
                      })}
                      placeholder="timestamp,src_ip,dst_ip,src_port,dst_port,protocol,severity,description"
                      className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm text-text-primary font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-muted mb-1">分隔符</label>
                    <input
                      value={form.config.delimiter ?? ','}
                      onChange={(e) => setForm({ ...form, config: { ...form.config, delimiter: e.target.value } })}
                      placeholder=","
                      className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm text-text-primary font-mono"
                    />
                  </div>
                </>
              )}
              {form.match_type === 'keyvalue' && (
                <div>
                  <label className="block text-xs text-text-muted mb-1">分隔符（留空默认按 空格/逗号/分号 切分）</label>
                  <input
                    value={form.config.delimiter ?? ''}
                    onChange={(e) => setForm({ ...form, config: { ...form.config, delimiter: e.target.value } })}
                    placeholder="如 | 或空格"
                    className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm text-text-primary font-mono"
                  />
                </div>
              )}
              {form.match_type === 'grok' && (
                <div className="md:col-span-2 text-[11px] text-text-muted">
                  Grok 模式填在上方「Grok 模式」输入框，此处无需额外配置。
                </div>
              )}
            </div>
          )}
          {form.match_type === 'template' && form.template_id && (
            <div className="text-xs text-text-muted">
              模型字段：{templates.find((t) => String(t.id) === form.template_id)?.fields.map((f) => (
                <span key={f} className="inline-block px-1.5 py-0.5 mx-0.5 bg-accent/10 text-accent rounded font-mono">{f}</span>
              ))}
            </div>
          )}

          {/* ===== 样本试解析（不落库）===== */}
          <div className="p-3 rounded-lg border border-accent/20 bg-accent/5 space-y-2">
            <p className="text-sm text-text-primary font-medium">样本试解析</p>
            <p className="text-xs text-text-muted">
              粘贴一条真实日志，验证解析结果能否覆盖「安全告警模型」字段，并可一键采纳推荐映射（不会保存配置）
            </p>
            <textarea
              value={sample}
              onChange={(e) => { setSample(e.target.value); setPreview(null); setPreviewError(''); }}
              rows={3}
              placeholder={'如：src_ip=10.0.0.5 dst_ip=8.8.8.8 dst_port=443 action=blocked severity=1'}
              className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-xs font-mono text-text-primary"
            />
            <button
              onClick={runPreview}
              disabled={previewing}
              className="flex items-center gap-1 px-2.5 py-1 text-xs bg-accent-solid text-white rounded-lg hover:bg-accent-solid-hover disabled:opacity-50"
            >
              {previewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              试解析
            </button>
            {previewError && <div className="text-danger text-xs">{previewError}</div>}
            {preview && (
              <div className="space-y-2 pt-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`px-2 py-0.5 rounded ${preview.model_hit > 0 ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'}`}>
                    安全告警模型命中 {preview.model_hit}/{preview.model_total}
                  </span>
                  {preview.suggestions?.length > 0 && (
                    <button
                      onClick={() => adoptSuggestions(preview.suggestions)}
                      className="px-2 py-0.5 rounded bg-info/15 text-info hover:bg-info/25"
                    >
                      一键采纳推荐映射（{preview.suggestions.length} 条）
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <p className="text-[11px] text-text-muted mb-1">解析结果</p>
                    <div className="max-h-40 overflow-auto rounded border border-border-color">
                      <table className="w-full text-[11px]">
                        <tbody>
                          {Object.entries(preview.parsed || {}).map(([k, v]) => (
                            <tr key={k} className="border-b border-border-color/40 last:border-0">
                              <td className="px-2 py-1 font-mono text-text-secondary whitespace-nowrap">{k}</td>
                              <td className="px-2 py-1 font-mono text-text-primary break-all">{String(v)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] text-text-muted mb-1">未命中的模型字段</p>
                    <div className="flex flex-wrap gap-1">
                      {preview.model_missing?.length ? preview.model_missing.map((k: string) => (
                        <span key={k} className="px-1.5 py-0.5 rounded bg-page-bg border border-border-color text-[10px] font-mono text-text-muted">{k}</span>
                      )) : <span className="text-[11px] text-success">全部命中 ✅</span>}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {form.match_type !== 'auto' && (
            <div className="p-3 rounded-lg border border-border-color space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-primary font-medium">字段映射 → 安全告警模型字段</p>
                  <p className="text-xs text-text-muted">
                    目标字段首选「安全告警模型」字段（带 ★）；源字段支持点路径 a.b.c；不配置映射时按别名自动对齐
                  </p>
                </div>
                <button
                  onClick={() => setForm({ ...form, mappings: [...form.mappings, { source: '', target: '', field_type: '', default_value: '', required: false }] })}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs bg-accent-solid text-white rounded-lg hover:bg-accent-solid-hover"
                >
                  <Plus className="w-3.5 h-3.5" /> 添加映射
                </button>
              </div>
              {form.mappings.length === 0 ? (
                <p className="text-xs text-text-muted py-2">
                  未配置显式映射——解析结果将按别名（含安全告警模型字段与设备侧常见写法）自动对齐字段名。
                </p>
              ) : (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-[1fr_1.2fr_0.8fr_1fr_auto_auto] gap-2 text-xs text-text-muted px-1">
                    <span>源字段（解析结果）</span><span>目标字段（安全告警模型）</span><span>类型</span><span>默认值</span><span>必填</span><span />
                  </div>
                  {form.mappings.map((m, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_1.2fr_0.8fr_1fr_auto_auto] gap-2 items-center">
                      <input
                        value={m.source}
                        onChange={(e) => {
                          const next = [...form.mappings];
                          next[idx] = { ...m, source: e.target.value };
                          setForm({ ...form, mappings: next });
                        }}
                        placeholder="如 src_ip 或 geo.ip"
                        className="px-2 py-1.5 bg-card-bg border border-border-color rounded text-xs font-mono text-text-primary"
                      />
                      <select
                        value={m.target}
                        onChange={(e) => {
                          const next = [...form.mappings];
                          next[idx] = { ...m, target: e.target.value };
                          setForm({ ...form, mappings: next });
                        }}
                        className="px-2 py-1.5 bg-card-bg border border-border-color rounded text-xs text-text-primary"
                      >
                        <option value="">选择目标字段…</option>
                        {catalog.map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.source === 'model' ? '★ ' : ''}{c.label}（{c.name}）· {c.category}
                          </option>
                        ))}
                      </select>
                      <select
                        value={m.field_type || ''}
                        onChange={(e) => {
                          const next = [...form.mappings];
                          next[idx] = { ...m, field_type: e.target.value };
                          setForm({ ...form, mappings: next });
                        }}
                        className="px-2 py-1.5 bg-card-bg border border-border-color rounded text-xs text-text-primary"
                        title="强制类型转换为目标字段所需类型"
                      >
                        {Object.entries(FIELD_TYPE_LABELS).map(([k, v]) => (
                          <option key={k || 'auto'} value={k}>{v}</option>
                        ))}
                      </select>
                      <input
                        value={m.default_value || ''}
                        onChange={(e) => {
                          const next = [...form.mappings];
                          next[idx] = { ...m, default_value: e.target.value };
                          setForm({ ...form, mappings: next });
                        }}
                        placeholder="缺失时"
                        className="px-2 py-1.5 bg-card-bg border border-border-color rounded text-xs text-text-primary"
                      />
                      <input type="checkbox" checked={!!m.required} title="必填（缺失则解析失败）"
                        onChange={(e) => {
                          const next = [...form.mappings];
                          next[idx] = { ...m, required: e.target.checked };
                          setForm({ ...form, mappings: next });
                        }}
                        className="w-4 h-4 accent-accent-solid"
                      />
                      <button
                        onClick={() => setForm({ ...form, mappings: form.mappings.filter((_, i) => i !== idx) })}
                        className="p-1 rounded hover:bg-danger/10 text-text-muted hover:text-danger" title="移除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <div className="text-danger text-sm">{error}</div>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-accent-solid text-white rounded-lg hover:bg-accent-solid-hover disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {editingId ? '保存修改' : '保存配置'}（30 秒内在流水线生效）
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-accent" /></div>
      ) : profiles.length === 0 ? (
        <div className="py-10 text-center">
          <Braces className="w-10 h-10 text-text-muted mx-auto mb-2 opacity-40" />
          <p className="text-text-muted text-sm">暂无解析配置——当前使用内置自动识别（5 类设备解析器）。</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-text-muted border-b border-border-color">
              <th className="px-3 py-2">名称</th>
              <th className="px-3 py-2">topic</th>
              <th className="px-3 py-2">解析方式</th>
              <th className="px-3 py-2">模板 / 模式</th>
              <th className="px-3 py-2">字段映射</th>
              <th className="px-3 py-2">状态</th>
              <th className="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id} className="border-b border-border-color/50 last:border-0">
                <td className="px-3 py-2.5 text-text-primary">{p.name}</td>
                <td className="px-3 py-2.5 font-mono text-xs text-text-secondary">{p.topic}</td>
                <td className="px-3 py-2.5">
                  <span className="px-2 py-0.5 rounded text-[11px] bg-accent/10 text-accent">
                    {PARSE_TYPE_LABELS[p.match_type] || p.match_type}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs">
                  {p.template_name
                    ? <span className="text-info">📄 {p.template_name}</span>
                    : <span className="font-mono text-text-muted truncate block max-w-[240px]">{p.match_value || '-'}</span>}
                </td>
                <td className="px-3 py-2.5 text-xs">
                  {(p.field_mappings || []).length > 0 ? (
                    <span className="text-accent" title={p.field_mappings!.map((m) => `${m.source}→${m.target}`).join('\n')}>
                      {p.field_mappings!.length} 条映射
                    </span>
                  ) : (
                    <span className="text-text-muted">{p.match_type === 'auto' ? '-' : '别名自动映射'}</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`px-2 py-0.5 rounded text-[11px] ${p.enabled ? 'bg-success/15 text-success' : 'bg-page-bg text-text-muted'}`}>
                    {p.enabled ? '生效中' : '已停用'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-page-bg text-text-muted hover:text-text-primary" title="编辑">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => toggle(p)} className="p-1.5 rounded hover:bg-page-bg text-text-muted hover:text-text-primary" title={p.enabled ? '停用' : '启用'}>
                      <Power className={`w-4 h-4 ${p.enabled ? 'text-success' : ''}`} />
                    </button>
                    <button onClick={() => remove(p.id)} className="p-1.5 rounded hover:bg-danger/10 text-text-muted hover:text-danger" title="删除">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ==================== ③ 分流策略：判定开关 + 出口清单（单层出口） ====================
/** 表单里的出口草稿（template_id 用字符串以便绑定 select） */
interface DraftExit {
  _key: number; branch: 'valid' | 'filtered'; target_topic: string;
  template_id: string; enabled: boolean; sort_order: number;
}

let _draftSeq = 1;

function DispatchPolicyPanel() {
  const { ask, confirmProps } = useConfirmDialog('删除分流策略');
  const [policies, setPolicies] = useState<DispatchPolicy[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [sourceOptions, setSourceOptions] = useState<string[]>([]);
  const [templates, setTemplates] = useState<ParseTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const newDraft = (branch: 'valid' | 'filtered'): DraftExit => ({
    _key: _draftSeq++, branch,
    target_topic: branch === 'valid' ? 'valid-alerts' : 'invalid-alerts',
    template_id: '', enabled: true, sort_order: 0,
  });
  const emptyForm = {
    name: '', source_topics: ['*'] as string[], sort_order: 0,
    dedup_enabled: true, whitelist_enabled: true,
    exits: [newDraft('valid'), newDraft('filtered')] as DraftExit[],
  };
  const [form, setForm] = useState({ ...emptyForm });

  const fetchAll = useCallback(async () => {
    try {
      const [pRes, tRes, tplRes, dtRes]: any[] = await Promise.all([
        pipelineApi.dispatchPolicies(), pipelineApi.kafkaTopics(), pipelineApi.parseTemplates(),
        pipelineApi.deviceTopics(),
      ]);
      if (pRes.success) setPolicies(pRes.data);
      if (tRes.success) setTopics(tRes.data?.topics || []);
      if (tplRes.success) setTemplates(tplRes.data || []);
      // 生效来源 topic 选项：设备接入纳管 topic 优先，并集 Kafka 内其他非系统业务 topic
      if (dtRes.success) {
        const managed: string[] = (dtRes.data?.items || []).map((i: any) => i.topic).filter(Boolean);
        const sys = new Set(['raw-logs', 'standardized-alerts', 'valid-alerts', 'invalid-alerts', 'processed-alerts']);
        const extra: string[] = (tRes.success ? (tRes.data?.topics || []) : [])
          .filter((t: string) => !sys.has(t) && !managed.includes(t));
        setSourceOptions([...managed, ...extra]);
      }
    } catch (e) {
      console.error('加载分流策略失败:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      name: '', source_topics: ['*'], sort_order: 0,
      dedup_enabled: true, whitelist_enabled: true,
      exits: [newDraft('valid'), newDraft('filtered')],
    });
    setShowForm(true);
    setError('');
  };

  const openEdit = (p: DispatchPolicy) => {
    setEditingId(p.id);
    setForm({
      name: p.name, source_topics: p.source_topics?.length ? p.source_topics : p.source_topic.split(','), sort_order: p.sort_order || 0,
      dedup_enabled: p.dedup_enabled, whitelist_enabled: p.whitelist_enabled,
      exits: (p.exits || []).map((e) => ({
        _key: _draftSeq++, branch: e.branch, target_topic: e.target_topic,
        template_id: e.template_id ? String(e.template_id) : '',
        enabled: e.enabled, sort_order: e.sort_order || 0,
      })),
    });
    setShowForm(true);
    setError('');
  };

  /** 生效来源多选：'*' 与具体 topic 互斥 */
  const toggleSourceTopic = (t: string) =>
    setForm((f) => {
      const has = f.source_topics.includes(t);
      let next: string[];
      if (t === '*') {
        next = has ? [] : ['*'];
      } else if (has) {
        next = f.source_topics.filter((x) => x !== t);
      } else {
        next = [...f.source_topics.filter((x) => x !== '*'), t];
      }
      return { ...f, source_topics: next };
    });

  const patchExit = (key: number, patch: Partial<DraftExit>) =>
    setForm((f) => ({ ...f, exits: f.exits.map((e) => (e._key === key ? { ...e, ...patch } : e)) }));

  const addExit = (branch: 'valid' | 'filtered') =>
    setForm((f) => ({ ...f, exits: [...f.exits, newDraft(branch)] }));

  const dropExit = (key: number) =>
    setForm((f) => ({ ...f, exits: f.exits.filter((e) => e._key !== key) }));

  const save = async () => {
    if (!form.name.trim()) { setError('策略名称不能为空'); return; }
    if (form.source_topics.length === 0) { setError('请至少选择一个生效来源 topic（或选全局 *）'); return; }
    const rows = form.exits.filter((e) => e.target_topic.trim());
    if (form.exits.length !== rows.length) { setError('出口的目标 topic 不能为空（不需要的出口请删除）'); return; }
    const seen = new Set<string>();
    for (const e of rows) {
      const k = `${e.branch}|${e.target_topic.trim()}`;
      if (seen.has(k)) { setError(`同一分支下的出口 topic 重复：${e.target_topic.trim()}`); return; }
      seen.add(k);
      if (e.target_topic.trim() === 'raw-logs' || e.target_topic.trim() === 'standardized-alerts') {
        setError(`出口不能指向流水线入口 topic（raw-logs / standardized-alerts），否则会形成环路`);
        return;
      }
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name.trim(),
        source_topic: form.source_topics.join(','),
        dedup_enabled: form.dedup_enabled,
        whitelist_enabled: form.whitelist_enabled,
        sort_order: Number(form.sort_order) || 0,
        exits: rows.map((e, i) => ({
          branch: e.branch,
          target_topic: e.target_topic.trim(),
          template_id: e.template_id ? Number(e.template_id) : null,
          enabled: e.enabled,
          sort_order: i,
        })),
      };
      const res: any = editingId
        ? await pipelineApi.updateDispatchPolicy(editingId, payload)
        : await pipelineApi.createDispatchPolicy(payload);
      if (res.success) {
        setShowForm(false);
        setEditingId(null);
        await fetchAll();
      } else {
        setError(res.error || '保存失败');
      }
    } catch (e: any) {
      setError(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (p: DispatchPolicy) => {
    await pipelineApi.updateDispatchPolicy(p.id, { enabled: !p.enabled });
    await fetchAll();
  };

  const remove = async (p: DispatchPolicy) => {
    const srcLabel = p.source_topic === '*' ? '全局' : p.source_topic.split(',').join('、');
    const ok = await ask({
      message: `删除分流策略「${p.name}」后，${srcLabel} 的告警将回退到内置默认出口（valid-alerts / invalid-alerts）。确认删除？`,
      danger: true, confirmText: '删除',
    });
    if (!ok) return;
    await pipelineApi.deleteDispatchPolicy(p.id);
    await fetchAll();
  };

  /** 某策略某分支的出口徽标（空则提示回退默认） */
  const exitBadges = (p: DispatchPolicy, branch: 'valid' | 'filtered') => {
    const list = (p.exits || []).filter((e) => e.branch === branch && e.enabled);
    if (!list.length) {
      return (
        <span className="text-[11px] text-text-muted">
          回退默认 <span className="font-mono">{DEFAULT_EXIT_HINT[branch]}</span>
        </span>
      );
    }
    return (
      <div className="flex flex-wrap gap-1">
        {list.map((e) => (
          <span
            key={e.id ?? e.target_topic}
            className={`px-1.5 py-0.5 rounded text-[11px] font-mono ${
              branch === 'valid' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
            }`}
            title={e.template_name ? `按字段模型「${e.template_name}」裁剪` : '全字段输出'}
          >
            {e.target_topic}{e.template_name ? ` · ${e.template_name}` : ''}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-card-bg rounded-card border border-border-color p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-accent" /> 分流策略与出口
          </h3>
          <p className="text-xs text-text-muted mt-1">
            过滤判定与告警出口在同一层配置：命中过滤规则 / 白名单 / 去重的告警走「被过滤出口」，
            其余走「未过滤出口」。一个分支可挂多个出口把同一条告警投给多个下游（如 SOAR + 审计），
            每个出口可选字段模型只投递部分字段；分支下不配出口则回退内置默认（valid-alerts / invalid-alerts）。
            按来源 topic 精确匹配优先于全局（*）；来源支持多选（任一命中即生效），新增/修改约 15 秒内在流水线生效。
          </p>
        </div>
        <button
          onClick={showForm && !editingId ? () => { setShowForm(false); setError(''); } : openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent-solid text-white rounded-lg hover:bg-accent-solid-hover shrink-0"
        >
          {showForm && !editingId ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showForm && !editingId ? '取消' : '新建分流策略'}
        </button>
      </div>

      {showForm && (
        <div className="mb-4 p-4 rounded-lg bg-page-bg border border-border-color">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">策略名称 *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="如：Suricata 独立分流"
                className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm text-text-primary"
              />
            </div>
            <SourceTopicMultiSelect
              value={form.source_topics}
              topics={sourceOptions}
              onToggle={toggleSourceTopic}
            />
            <div>
              <label className="block text-xs text-text-muted mb-1">优先级（大者优先）</label>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm text-text-primary"
              />
            </div>
            <div className="flex flex-col justify-center gap-1.5 pt-4">
              <label className="flex items-center gap-2 text-xs text-text-primary">
                <input
                  type="checkbox" checked={form.dedup_enabled}
                  onChange={(e) => setForm({ ...form, dedup_enabled: e.target.checked })}
                />
                Redis 去重（窗口内重复 → 被过滤出口）
              </label>
              <label className="flex items-center gap-2 text-xs text-text-primary">
                <input
                  type="checkbox" checked={form.whitelist_enabled}
                  onChange={(e) => setForm({ ...form, whitelist_enabled: e.target.checked })}
                />
                白名单过滤（命中 → 被过滤出口）
              </label>
            </div>
          </div>

          {(['valid', 'filtered'] as const).map((branch) => {
            const rows = form.exits.filter((e) => e.branch === branch);
            return (
              <div key={branch} className="mt-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-text-secondary">
                    {BRANCH_LABELS[branch]}出口
                    <span className="text-text-muted ml-1.5">
                      {branch === 'valid' ? '（未命中任何规则/白名单/去重）' : '（命中规则/白名单/去重）'}
                    </span>
                  </span>
                  <button
                    onClick={() => addExit(branch)}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border-color rounded text-text-secondary hover:text-text-primary hover:bg-card-bg"
                  >
                    <Plus className="w-3 h-3" /> 添加出口
                  </button>
                </div>
                {rows.length === 0 ? (
                  <div className="text-[11px] text-text-muted px-3 py-2 rounded bg-card-bg border border-dashed border-border-color">
                    未配置出口 → 回退内置默认：<span className="font-mono">{DEFAULT_EXIT_HINT[branch]}</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {rows.map((e) => (
                      <div key={e._key} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                        <div className="md:col-span-6">
                          <TopicSelect
                            label="目标 topic *"
                            value={e.target_topic}
                            topics={topics}
                            onChange={(v) => patchExit(e._key, { target_topic: v })}
                          />
                        </div>
                        <div className="md:col-span-5">
                          <label className="block text-xs text-text-muted mb-1">字段模型（可选，裁剪输出字段）</label>
                          <select
                            value={e.template_id}
                            onChange={(ev) => patchExit(e._key, { template_id: ev.target.value })}
                            className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm text-text-primary"
                          >
                            <option value="">全字段输出</option>
                            {templates.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}（{t.fields.length} 字段）</option>
                            ))}
                          </select>
                        </div>
                        <div className="md:col-span-1 flex justify-end">
                          <button
                            onClick={() => dropExit(e._key)}
                            className="p-2 rounded hover:bg-danger/10 text-text-muted hover:text-danger"
                            title="移除该出口"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {error && <div className="text-danger text-sm mt-3">{error}</div>}
          <div className="flex gap-2 mt-3">
            <button
              onClick={save} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-accent-solid text-white rounded-lg hover:bg-accent-solid-hover disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              {editingId ? '保存修改' : '创建策略'}
            </button>
            <button
              onClick={() => { setShowForm(false); setEditingId(null); setError(''); }}
              className="px-4 py-2 bg-card-bg border border-border-color rounded-lg text-sm text-text-primary hover:bg-page-bg"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-accent" /></div>
      ) : policies.length === 0 ? (
        <div className="py-8 text-center">
          <GitBranch className="w-10 h-10 text-text-muted mx-auto mb-2 opacity-40" />
          <p className="text-text-muted text-sm">
            暂无分流策略，当前使用内置默认：未过滤 → valid-alerts，被过滤 → invalid-alerts
          </p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-text-muted border-b border-border-color">
              <th className="px-3 py-2">策略 / 来源 topic</th>
              <th className="px-3 py-2">未过滤出口</th>
              <th className="px-3 py-2">被过滤出口</th>
              <th className="px-3 py-2">过滤方式</th>
              <th className="px-3 py-2">状态</th>
              <th className="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((p) => (
              <tr key={p.id} className="border-b border-border-color/50 last:border-0">
                <td className="px-3 py-2.5">
                  <div className="text-text-primary">{p.name}</div>
                  <div className="flex flex-wrap items-center gap-1 mt-0.5">
                    <span className="text-xs text-text-muted">来源：</span>
                    {p.source_topic === '*' ? (
                      <span className="px-1.5 py-0.5 rounded text-[11px] bg-primary/10 text-primary">全局（所有来源 topic）</span>
                    ) : (
                      p.source_topic.split(',').map((t) => (
                        <span key={t} className="px-1.5 py-0.5 rounded text-[11px] font-mono bg-page-bg text-text-secondary border border-border-color">{t}</span>
                      ))
                    )}
                    {p.sort_order ? <span className="text-xs text-text-muted">· 优先级 {p.sort_order}</span> : null}
                  </div>
                </td>
                <td className="px-3 py-2.5">{exitBadges(p, 'valid')}</td>
                <td className="px-3 py-2.5">{exitBadges(p, 'filtered')}</td>
                <td className="px-3 py-2.5 text-xs text-text-secondary">
                  规则 + 白名单{p.whitelist_enabled ? '✓' : '✗'} + 去重{p.dedup_enabled ? '✓' : '✗'}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`px-2 py-0.5 rounded text-[11px] ${p.enabled ? 'bg-success/15 text-success' : 'bg-page-bg text-text-muted'}`}>
                    {p.enabled ? '生效中' : '已停用'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-page-bg text-text-muted hover:text-text-primary" title="编辑">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => toggle(p)} className="p-1.5 rounded hover:bg-page-bg text-text-muted hover:text-text-primary" title={p.enabled ? '停用' : '启用'}>
                      <Power className={`w-4 h-4 ${p.enabled ? 'text-success' : ''}`} />
                    </button>
                    <button onClick={() => remove(p)} className="p-1.5 rounded hover:bg-danger/10 text-text-muted hover:text-danger" title="删除">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ConfirmDialog {...confirmProps} />
    </div>
  );
}

/** 生效来源 topic 多选：'*'（全局）与具体设备 topic 互斥；选项来自「设备接入」纳管 topic */
function SourceTopicMultiSelect({ value, topics, onToggle }: {
  value: string[]; topics: string[]; onToggle: (t: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const labelOf = (t: string) => (t === '*' ? '全局（*）' : t);
  return (
    <div className="relative">
      <label className="block text-xs text-text-muted mb-1">生效来源 topic（可多选）</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full min-h-[38px] px-2 py-1.5 bg-card-bg border border-border-color rounded-lg text-sm text-left flex flex-wrap items-center gap-1 hover:border-text-muted/40"
      >
        {value.length === 0 ? (
          <span className="text-text-muted font-sans text-xs px-1">点击选择来源 topic…</span>
        ) : value.includes('*') ? (
          <span className="px-1.5 py-0.5 rounded text-[11px] bg-primary/10 text-primary">全局（所有来源 topic）</span>
        ) : (
          value.map((t) => (
            <span key={t} className="px-1.5 py-0.5 rounded text-[11px] font-mono bg-page-bg border border-border-color text-text-secondary flex items-center gap-1">
              {t}
              <X className="w-3 h-3 text-text-muted hover:text-danger" onClick={(e) => { e.stopPropagation(); onToggle(t); }} />
            </span>
          ))
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 top-full left-0 mt-1 w-full max-w-xs max-h-64 overflow-y-auto scrollbar-thin bg-card-bg border border-border-color rounded-lg shadow-panel p-1.5">
            <button
              type="button"
              onClick={() => onToggle('*')}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs hover:bg-surface-2 ${value.includes('*') ? 'text-primary' : 'text-text-primary'}`}
            >
              <input type="checkbox" checked={value.includes('*')} readOnly className="app-checkbox pointer-events-none" />
              全局（*）— 匹配所有来源 topic
            </button>
            <div className="border-t border-border-color my-1" />
            {topics.length === 0 ? (
              <div className="px-2 py-1.5 text-[11px] text-text-muted">设备接入中暂无已纳管 topic</div>
            ) : (
              topics.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onToggle(t)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs font-mono hover:bg-surface-2 ${value.includes(t) ? 'text-primary' : 'text-text-secondary'}`}
                >
                  <input type="checkbox" checked={value.includes(t)} readOnly className="app-checkbox pointer-events-none" />
                  {t}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** topic 下拉 + 允许手输新建（选项为 Kafka 内已存在的业务 topic） */
function TopicSelect({ label, value, topics, onChange, withGlobal }: {
  label: string; value: string; topics: string[];
  onChange: (v: string) => void; withGlobal?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs text-text-muted mb-1">{label}</label>
      <input
        list="pipeline-topic-options"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="选择或直接输入新 topic"
        className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm text-text-primary font-mono"
      />
      <datalist id="pipeline-topic-options">
        {withGlobal && <option value="*">全局（*）</option>}
        {topics.map((t) => <option key={t} value={t} />)}
      </datalist>
    </div>
  );
}

// ==================== ③ 过滤规则（作用于分流判定） ====================
function FilterSummary() {
  const navigate = useNavigate();
  const [rules, setRules] = useState<FilterRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    pipelineApi.filterRules()
      .then((res: any) => { if (res.success) setRules(res.data); })
      .finally(() => setLoading(false));
  }, []);

  const groups = rules.reduce<Record<string, FilterRule[]>>((acc, r) => {
    const key = r.topic || '*';
    (acc[key] = acc[key] || []).push(r);
    return acc;
  }, {});

  return (
    <div className="bg-card-bg rounded-card border border-border-color p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Filter className="w-5 h-5 text-warning" /> 告警过滤规则（按 topic 生效）
          </h3>
          <p className="text-xs text-text-muted mt-1">
            按来源 topic 命中规则：命中 → 进该 topic 分流策略的「被过滤出口」；未命中继续过白名单与 Redis 去重，
            全部通过才进「未过滤出口」
          </p>
        </div>
        <button
          onClick={() => navigate('/data/alert-filters')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent-solid text-white rounded-lg hover:bg-accent-solid-hover"
        >
          管理过滤规则
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-accent" /></div>
      ) : rules.length === 0 ? (
        <div className="py-10 text-center">
          <Filter className="w-10 h-10 text-text-muted mx-auto mb-2 opacity-40" />
          <p className="text-text-muted text-sm">暂无过滤规则，所有解析后的告警将直接进入输出生效链路。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(groups).map(([topic, list]) => (
            <div key={topic} className="px-4 py-3 rounded-lg bg-page-bg border border-border-color">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="font-mono text-sm text-text-primary">{topic === '*' ? '全局（所有 topic）' : topic}</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-warning/15 text-warning">{list.length} 条</span>
              </div>
              {list.slice(0, 3).map((r) => (
                <div key={r.id} className="text-xs text-text-muted truncate">
                  {r.enabled ? '🟢' : '⚪'} {r.name}：{r.field} {OPERATOR_LABELS[r.operator] || r.operator} {r.value}
                </div>
              ))}
              {list.length > 3 && <div className="text-xs text-text-muted">…共 {list.length} 条</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== ④ 告警存储：Kafka topic → ES 索引持久化 ====================
function StorageRoutePanel({ stats }: { stats: Record<string, number> }) {
  const { ask, confirmProps } = useConfirmDialog('删除存储任务');
  const [routes, setRoutes] = useState<StorageRoute[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [indexes, setIndexes] = useState<{ name: string; docs?: number | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const emptyForm = {
    name: '', source_topic: '', index_name: '', id_field: 'alert_id',
    description: '',
  };
  const [form, setForm] = useState({ ...emptyForm });

  const fetchAll = useCallback(async () => {
    try {
      const [rRes, tRes, iRes]: any[] = await Promise.all([
        pipelineApi.storageRoutes(), pipelineApi.kafkaTopics(), pipelineApi.esIndexes(),
      ]);
      if (rRes.success) setRoutes(rRes.data);
      if (tRes.success) setTopics(tRes.data?.topics || []);
      if (iRes.success) setIndexes(iRes.data || []);
    } catch (e) {
      console.error('加载存储任务失败:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const timer = setInterval(fetchAll, 15000);
    return () => clearInterval(timer);
  }, [fetchAll]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setShowForm(true);
    setError('');
  };

  const openEdit = (r: StorageRoute) => {
    setEditingId(r.id);
    setForm({
      name: r.name, source_topic: r.source_topic, index_name: r.index_name,
      id_field: r.id_field || 'alert_id', description: r.description || '',
    });
    setShowForm(true);
    setError('');
  };

  const save = async () => {
    if (!form.name.trim() || !form.source_topic.trim() || !form.index_name.trim()) {
      setError('任务名称、源 topic、目标索引均不能为空'); return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name.trim(),
        source_topic: form.source_topic.trim(),
        index_name: form.index_name.trim(),
        id_field: form.id_field.trim() || 'alert_id',
        description: form.description.trim(),
      };
      const res: any = editingId
        ? await pipelineApi.updateStorageRoute(editingId, payload)
        : await pipelineApi.createStorageRoute(payload);
      if (res.success) {
        setShowForm(false);
        setEditingId(null);
        await fetchAll();
      } else {
        setError(res.error || '保存失败');
      }
    } catch (e: any) {
      setError(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (r: StorageRoute) => {
    await pipelineApi.updateStorageRoute(r.id, { enabled: !r.enabled });
    await fetchAll();
  };

  const remove = async (r: StorageRoute) => {
    const ok = await ask({
      message: `删除存储任务「${r.name}」后，${r.source_topic} 的告警将不再写入 ES 索引 ${r.index_name}（已入库数据保留）。确认删除？`,
      danger: true, confirmText: '删除',
    });
    if (!ok) return;
    await pipelineApi.deleteStorageRoute(r.id);
    await fetchAll();
  };

  const storedTotal = routes.reduce((s, r) => s + (r.runtime?.stored || 0), 0);

  return (
    <div className="bg-card-bg rounded-card border border-border-color p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-success" /> 告警持久存储（Kafka → Elasticsearch）
          </h3>
          <p className="text-xs text-text-muted mt-1">
            每条任务持续消费一个 Kafka topic 并幂等写入指定 ES 索引（索引不存在时自动按告警标准字段映射创建）。
            告警只持久化到 ES，不再写 PostgreSQL；安全告警工作台直接读取 valid 索引。新增/修改约 10 秒生效。
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent-solid text-white rounded-lg hover:bg-accent-solid-hover shrink-0"
        >
          {showForm && !editingId ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showForm && !editingId ? '取消' : '新建存储任务'}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          { label: '③ 未过滤（有效）', value: stats.valid || 0, icon: CheckCircle },
          { label: '③ 被过滤 / 重复', value: (stats.filtered || 0) + (stats.duplicate || 0), icon: Filter },
          { label: '已输出（③上游出口）', value: stats.output_sent || 0, icon: Zap },
          { label: '本次运行已入库', value: storedTotal, icon: HardDrive },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-page-bg border border-border-color">
            <Icon className="w-4 h-4 text-text-muted" />
            <div>
              <div className="text-sm font-semibold text-text-primary">{value}</div>
              <div className="text-[11px] text-text-muted">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="mb-4 p-4 rounded-lg bg-page-bg border border-border-color">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">任务名称 *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="如：SOAR 有效告警归档"
                className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm text-text-primary"
              />
            </div>
            <TopicSelect
              label="源 Kafka topic *"
              value={form.source_topic}
              topics={topics}
              onChange={(v) => setForm({ ...form, source_topic: v })}
            />
            <div>
              <label className="block text-xs text-text-muted mb-1">目标 ES 索引 *</label>
              <input
                list="pipeline-es-index-options"
                value={form.index_name}
                onChange={(e) => setForm({ ...form, index_name: e.target.value })}
                placeholder="选已有或新建（小写）"
                className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm text-text-primary font-mono"
              />
              <datalist id="pipeline-es-index-options">
                {indexes.map((i) => (
                  <option key={i.name} value={i.name}>{i.docs ?? 0} 条</option>
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">幂等字段（ES 文档 _id）</label>
              <input
                value={form.id_field}
                onChange={(e) => setForm({ ...form, id_field: e.target.value })}
                placeholder="alert_id"
                className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm text-text-primary font-mono"
              />
            </div>
          </div>
          <div className="mt-3">
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="备注（可选）：说明这条任务的用途与数据来源"
              className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm text-text-primary"
            />
          </div>
          {error && <div className="text-danger text-sm mt-3">{error}</div>}
          <div className="flex gap-2 mt-3">
            <button
              onClick={save} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-accent-solid text-white rounded-lg hover:bg-accent-solid-hover disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              {editingId ? '保存修改' : '创建任务'}
            </button>
            <button
              onClick={() => { setShowForm(false); setEditingId(null); setError(''); }}
              className="px-4 py-2 bg-card-bg border border-border-color rounded-lg text-sm text-text-primary hover:bg-page-bg"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-accent" /></div>
      ) : routes.length === 0 ? (
        <div className="py-8 text-center">
          <HardDrive className="w-10 h-10 text-text-muted mx-auto mb-2 opacity-40" />
          <p className="text-text-muted text-sm">暂无存储任务，Kafka 中的告警不会被持久化到 ES</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-text-muted border-b border-border-color">
              <th className="px-3 py-2">任务</th>
              <th className="px-3 py-2">源 topic → ES 索引</th>
              <th className="px-3 py-2">幂等字段</th>
              <th className="px-3 py-2">运行</th>
              <th className="px-3 py-2">写入 / 报错</th>
              <th className="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((r) => {
              const rt = r.runtime || { running: false, stored: 0, errors: 0, last_error: '', last_doc_id: '', last_at: null };
              const isSystem = r.name.includes('（系统）');
              return (
                <tr key={r.id} className="border-b border-border-color/50 last:border-0">
                  <td className="px-3 py-2.5">
                    <div className="text-text-primary">
                      {r.name}
                      {isSystem && <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] bg-info/15 text-info">系统</span>}
                    </div>
                    {r.description && <div className="text-[11px] text-text-muted">{r.description}</div>}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs">
                    <span className="text-text-secondary">{r.source_topic}</span>
                    <span className="text-text-muted mx-1">→</span>
                    <span className="text-success">{r.index_name}</span>
                    <div className="text-[11px] text-text-muted">
                      索引 {r.es?.exists === false ? '未创建（首条写入时自动创建）' : `${r.es?.docs ?? 0} 条文档`}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-text-secondary">
                    <div className="font-mono">{r.id_field}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[11px] ${rt.running ? 'bg-success/15 text-success' : 'bg-page-bg text-text-muted'}`}>
                      {rt.running ? '消费中' : (r.enabled ? '启动中…' : '已停用')}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    <div className="text-text-primary">{rt.stored} 条已写</div>
                    {rt.errors > 0 && (
                      <div className="text-danger truncate max-w-[220px]" title={rt.last_error}>
                        失败 {rt.errors} 次：{rt.last_error}
                      </div>
                    )}
                    {rt.last_at && <div className="text-[11px] text-text-muted">最近 {rt.last_at}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-page-bg text-text-muted hover:text-text-primary" title="编辑">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => toggle(r)} className="p-1.5 rounded hover:bg-page-bg text-text-muted hover:text-text-primary" title={r.enabled ? '停用' : '启用'}>
                        <Power className={`w-4 h-4 ${r.enabled ? 'text-success' : ''}`} />
                      </button>
                      <button onClick={() => remove(r)} className="p-1.5 rounded hover:bg-danger/10 text-text-muted hover:text-danger" title="删除">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <ConfirmDialog {...confirmProps} />
    </div>
  );
}

// ==================== ① 设备接入 / Topic 管理 ====================
const GB = 1073741824;
const MB = 1048576;
const DAY_MS = 86400000;

const fmtRetention = (ms?: string): string => {
  const n = Number(ms);
  if (!n || isNaN(n) || n < 0) return ms === '-1' ? '不限' : '默认';
  if (n >= DAY_MS) return `${Math.round(n / DAY_MS)} 天`;
  if (n >= 3600000) return `${Math.round(n / 3600000)} 小时`;
  return `${Math.round(n / 60000)} 分钟`;
};
const fmtBytes = (b?: string): string => {
  const n = Number(b);
  if (!n || isNaN(n) || n < 0) return b === '-1' ? '不限' : '默认';
  if (n >= GB) return `${(n / GB).toFixed(2)} GB`;
  if (n >= MB) return `${Math.round(n / MB)} MB`;
  return `${Math.round(n / 1024)} KB`;
};

function DeviceTopicPanel({ onChanged }: { onChanged: () => void }) {
  const [info, setInfo] = useState<TopicInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({
    topic: '', device_type: '', partitions: '1', retention_days: '7', size_gb: '',
  });
  const [toggling, setToggling] = useState<number | null>(null);
  const { ask, confirmProps } = useConfirmDialog('删除确认');
  const [deleting, setDeleting] = useState<string | null>(null);

  // 查看 / 编辑弹窗状态
  const [detailTopic, setDetailTopic] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [messages, setMessages] = useState<any[] | null>(null);
  const [editTopic, setEditTopic] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    retention_days: '', size_gb: '', max_msg_mb: '', partitions: '', device_type: '',
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const fetchTopics = useCallback(async () => {
    try {
      const res: any = await pipelineApi.deviceTopics();
      if (res.success) setInfo(res.data);
    } catch (e) {
      console.error('获取 topic 列表失败:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTopics(); }, [fetchTopics]);

  const handleCreate = async () => {
    if (!form.topic.trim()) { setError('topic 名称不能为空'); return; }
    const partitions = parseInt(form.partitions, 10);
    if (isNaN(partitions) || partitions < 1 || partitions > 64) {
      setError('分片数必须为 1-64 之间的整数'); return;
    }
    const retentionDays = parseInt(form.retention_days, 10);
    if (isNaN(retentionDays) || retentionDays < 1) {
      setError('有效期必须为不小于 1 的整数（天）'); return;
    }
    const sizeGb = form.size_gb.trim() ? parseFloat(form.size_gb) : null;
    if (sizeGb !== null && (isNaN(sizeGb) || sizeGb <= 0)) {
      setError('容量上限必须为大于 0 的数字（GB），留空表示不限'); return;
    }
    setCreating(true);
    setError('');
    try {
      const res: any = await pipelineApi.createDeviceTopic({
        topic: form.topic.trim(),
        device_type: form.device_type || undefined,
        num_partitions: partitions,
        retention_ms: retentionDays * DAY_MS,
        retention_bytes: sizeGb !== null ? Math.round(sizeGb * GB) : undefined,
      });
      if (res.success) {
        setShowForm(false);
        setForm({ topic: '', device_type: '', partitions: '1', retention_days: '7', size_gb: '' });
        setNotice(`topic 已创建（${partitions} 分片 / 保留 ${retentionDays} 天${
          sizeGb !== null ? ` / 单分区 ≤${sizeGb}GB` : ' / 容量不限'}）`);
        setTimeout(() => setNotice(''), 6000);
        await fetchTopics();
        onChanged();
      } else {
        setError(res.error || '创建失败');
      }
    } catch (e: any) {
      setError(e?.message || '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const toggleIngest = async (dsId: number, active: boolean) => {
    setToggling(dsId);
    try {
      await pipelineApi.toggleTopic({ datasource_id: dsId, action: active ? 'stop' : 'start' });
      await fetchTopics();
      onChanged();
    } finally {
      setToggling(null);
    }
  };

  const removeDs = async (dsId: number) => {
    await dataSourcesApi.deleteDataSource(dsId);
    await fetchTopics();
    onChanged();
  };

  /** 删除 Kafka topic 本体（数据源纳管记录保留，之后可再次创建同名 topic） */
  const removeTopic = async (t: ManagedTopic) => {
    const ok = await ask({
      title: '删除 Topic',
      message: `确定删除 Kafka topic「${t.topic}」吗？\n\n该 topic 及其中的消息将被永久删除，且不可恢复；\n数据源纳管记录会保留（列表显示为「Kafka 中不存在」，可再次创建）。`,
      danger: true,
      confirmText: '删除 Topic',
    });
    if (!ok) return;
    setDeleting(t.topic);
    try {
      const res: any = await pipelineApi.deleteDeviceTopic(t.topic);
      if (!res.success) { setError(res.error || '删除失败'); return; }
      setNotice(res.data?.message || `topic「${t.topic}」已删除`);
      setTimeout(() => setNotice(''), 6000);
      await fetchTopics();
      onChanged();
    } catch (e: any) {
      setError(e?.message || '删除失败');
    } finally {
      setDeleting(null);
    }
  };

  /** 移除平台纳管记录（topic 已不存在时清理残留绑定） */
  const removeTopicRecord = async (t: ManagedTopic) => {
    const ok = await ask({
      title: '移除纳管记录',
      message: `topic「${t.topic}」在 Kafka 中已不存在。\n确定移除该数据源纳管记录吗？`,
      danger: true,
      confirmText: '移除记录',
    });
    if (!ok) return;
    setDeleting(t.topic);
    try {
      await removeDs(t.datasource_id);
      setNotice(`已移除「${t.topic}」的纳管记录`);
      setTimeout(() => setNotice(''), 6000);
    } finally {
      setDeleting(null);
    }
  };

  const openDetail = async (topic: string) => {
    setDetailTopic(topic);
    setDetailLoading(true);
    setDetail(null);
    setMessages(null);
    try {
      const [dRes, mRes]: any[] = await Promise.all([
        pipelineApi.deviceTopicDetail(topic),
        pipelineApi.deviceTopicMessages(topic, 50),
      ]);
      if (dRes.success) setDetail(dRes.data);
      if (mRes.success) setMessages(mRes.data.messages);
    } catch (e) {
      console.error('获取 topic 详情失败:', e);
    } finally {
      setDetailLoading(false);
    }
  };

  const openEdit = async (topic: string) => {
    setEditTopic(topic);
    setEditError('');
    setEditSaving(false);
    setEditForm({ retention_days: '', size_gb: '', max_msg_mb: '', partitions: '', device_type: '' });
    try {
      const res: any = await pipelineApi.deviceTopicDetail(topic);
      if (res.success) {
        const cfg = res.data.config || {};
        const ms = Number(cfg['retention.ms']);
        const bytes = Number(cfg['retention.bytes']);
        const maxB = Number(cfg['max.message.bytes']);
        setEditForm({
          retention_days: ms > 0 ? String(Math.round(ms / DAY_MS)) : '',
          size_gb: bytes > 0 ? String(Math.round((bytes / GB) * 100) / 100) : '',
          max_msg_mb: maxB > 0 ? String(Math.round((maxB / MB) * 100) / 100) : '',
          partitions: String(res.data.partitions?.length || 1),
          device_type: res.data.datasource?.product_type || '',
        });
      }
    } catch (e) {
      console.error('获取 topic 配置失败:', e);
    }
  };

  const handleEditSave = async () => {
    if (!editTopic) return;
    setEditError('');
    const payload: any = {};
    if (editForm.retention_days.trim()) {
      const d = parseInt(editForm.retention_days, 10);
      if (isNaN(d) || d < 1) { setEditError('有效期必须为不小于 1 的整数（天）'); return; }
      payload.retention_ms = d * DAY_MS;
    }
    if (editForm.size_gb.trim()) {
      const g = parseFloat(editForm.size_gb);
      if (isNaN(g) || g <= 0) { setEditError('容量上限必须为大于 0 的数字（GB），留空表示不限'); return; }
      payload.retention_bytes = Math.round(g * GB);
    }
    if (editForm.max_msg_mb.trim()) {
      const m = parseFloat(editForm.max_msg_mb);
      if (isNaN(m) || m <= 0) { setEditError('单条大小上限必须为大于 0 的数字（MB），留空表示默认'); return; }
      payload.max_message_bytes = Math.round(m * MB);
    }
    if (editForm.partitions.trim()) {
      const p = parseInt(editForm.partitions, 10);
      if (isNaN(p) || p < 1 || p > 64) { setEditError('分片数必须为 1-64 之间的整数（只能增加）'); return; }
      payload.num_partitions = p;
    }
    if (editForm.device_type.trim()) payload.device_type = editForm.device_type.trim();
    setEditSaving(true);
    try {
      const res: any = await pipelineApi.updateDeviceTopic(editTopic, payload);
      if (res.success) {
        setEditTopic(null);
        setNotice(`topic ${editTopic} 配置已更新`);
        setTimeout(() => setNotice(''), 6000);
        await fetchTopics();
        onChanged();
      } else {
        setEditError(res.error || '更新失败');
      }
    } catch (e: any) {
      setEditError(e?.message || '更新失败');
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className="bg-card-bg rounded-card border border-border-color p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <RadioIcon className="w-5 h-5 text-info" /> 设备接入 / Topic 管理
        </h3>
        <button
          onClick={() => { setShowForm(!showForm); setError(''); }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent-solid text-white rounded-lg hover:bg-accent-solid-hover"
        >
          {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showForm ? '取消' : '新建设备 Topic'}
        </button>
      </div>

      <p className="text-xs text-text-muted mb-4">
        设备可直发独立 topic（绑定设备类型解析），或统一汇入 <span className="font-mono">raw-logs</span> 由②解析配置/自动识别处理
      </p>

      {notice && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-success/10 border border-success/30 text-success text-xs">
          {notice}
        </div>
      )}

      {showForm && (
        <div className="mb-4 p-4 rounded-lg bg-page-bg border border-border-color space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">Topic 名称 *（建议 {`{设备}-alert`}）</label>
              <input
                value={form.topic}
                onChange={(e) => setForm({ ...form, topic: e.target.value })}
                placeholder="如 soc-firewall-alert"
                className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm text-text-primary font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">设备类型（决定解析器并登记数据源）</label>
              <select
                value={form.device_type}
                onChange={(e) => setForm({ ...form, device_type: e.target.value })}
                className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm text-text-primary"
              >
                {DEVICE_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">分片数（并发度，建后只能增）</label>
              <input
                type="number" min={1} max={64}
                value={form.partitions}
                onChange={(e) => setForm({ ...form, partitions: e.target.value })}
                className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm text-text-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">数据有效期（天）</label>
              <input
                type="number" min={1}
                value={form.retention_days}
                onChange={(e) => setForm({ ...form, retention_days: e.target.value })}
                className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm text-text-primary"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">单分区容量上限（GB，留空不限）</label>
              <input
                type="number" min={0} step={0.1}
                value={form.size_gb}
                onChange={(e) => setForm({ ...form, size_gb: e.target.value })}
                placeholder="如 10"
                className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm text-text-primary"
              />
            </div>
            <div className="flex items-end lg:col-span-3">
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex items-center gap-2 px-4 py-2 bg-accent-solid text-white rounded-lg hover:bg-accent-solid-hover disabled:opacity-50"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                创建并接入
              </button>
            </div>
          </div>
          {error && <div className="text-danger text-sm">{error}</div>}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-accent" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {!info?.items?.length && (
            <div className="col-span-full text-center py-8 text-text-muted text-sm">
              暂无已配置的 topic —— 点击「新建 Topic」创建，平台纳管的 topic 会显示在这里
            </div>
          )}
          {info?.items?.map((t) => {
            const active = t.status === 'active' || t.status === 'connected';
            return (
              <div key={t.topic} className="px-4 py-3 rounded-lg bg-page-bg border border-border-color">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-text-primary truncate" title={t.topic}>{t.topic}</span>
                  {t.system && <span className="px-1.5 py-0.5 rounded text-[10px] bg-accent/15 text-accent shrink-0">系统</span>}
                  {!t.exists ? (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-surface-3 text-text-muted shrink-0">Kafka 中不存在</span>
                  ) : active ? (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-success/15 text-success shrink-0">运行中</span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-warning/15 text-warning shrink-0">已暂停</span>
                  )}
                  {t.exists && t.partitions !== undefined && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-page-bg text-text-muted border border-border-color shrink-0">{t.partitions} 分片</span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-text-muted">
                  <Link2 className="w-3 h-3" />{t.name}{t.device_type ? ` · ${t.device_type}` : ''}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => openDetail(t.topic)}
                    disabled={!t.exists}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg bg-info/10 text-info hover:bg-info/20 disabled:opacity-40 transition-colors"
                    title="查看 topic 配置与最近数据"
                  >
                    <HardDrive className="w-3 h-3" /> 查看
                  </button>
                  {!t.system && t.exists && (
                    <button
                      onClick={() => openEdit(t.topic)}
                      className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg bg-page-bg text-text-muted hover:text-text-primary hover:bg-accent/10 transition-colors"
                      title="编辑 topic 配置（有效期/容量/分片/设备类型）"
                    >
                      <FileText className="w-3 h-3" /> 编辑
                    </button>
                  )}
                  {t.exists && (
                    <button
                      onClick={() => toggleIngest(t.datasource_id, active)}
                      disabled={toggling === t.datasource_id}
                      className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg transition-colors ${
                        active
                          ? 'bg-warning/10 text-warning hover:bg-warning/20'
                          : 'bg-success/10 text-success hover:bg-success/20'
                      } disabled:opacity-50`}
                      title={active ? '暂停使用（停止采集，消费位移保留）' : '恢复使用（重新接入采集链路）'}
                    >
                      {toggling === t.datasource_id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : active ? <Power className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                      {active ? '暂停使用' : '恢复使用'}
                    </button>
                  )}
                  {!t.system && t.exists && (
                    <button
                      onClick={() => removeTopic(t)}
                      disabled={deleting === t.topic}
                      className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg bg-page-bg text-text-muted hover:text-danger hover:bg-danger/10 disabled:opacity-50 transition-colors"
                      title="删除 Kafka topic（数据源纳管记录保留，可再次创建）"
                    >
                      {deleting === t.topic
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Trash2 className="w-3 h-3" />} 删除
                    </button>
                  )}
                  {!t.exists && !t.system && (
                    <button
                      onClick={() => removeTopicRecord(t)}
                      disabled={deleting === t.topic}
                      className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg bg-page-bg text-text-muted hover:text-danger hover:bg-danger/10 disabled:opacity-50 transition-colors"
                      title="移除该数据源纳管记录（topic 已在 Kafka 中不存在）"
                    >
                      {deleting === t.topic
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Trash2 className="w-3 h-3" />} 移除记录
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog {...confirmProps} />

      {/* 查看弹窗：配置 + 最近消息 */}
      {detailTopic && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(4_8_20_/_50%)] p-4" onClick={() => setDetailTopic(null)}>
          <div className="bg-card-bg rounded-card border border-border-color w-full max-w-3xl max-h-[85vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-text-primary flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-info" />
                <span className="font-mono">{detailTopic}</span> · Topic 数据
              </h3>
              <button onClick={() => setDetailTopic(null)} className="p-1 rounded hover:bg-page-bg text-text-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            {detailLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-info" /></div>
            ) : (
              <>
                {detail && (
                  <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className="px-3 py-2 rounded-lg bg-page-bg border border-border-color">
                      <div className="text-text-muted">分片</div>
                      <div className="text-text-primary font-semibold">{detail.partitions?.length ?? '-'}</div>
                    </div>
                    <div className="px-3 py-2 rounded-lg bg-page-bg border border-border-color">
                      <div className="text-text-muted">数据有效期</div>
                      <div className="text-text-primary font-semibold">{fmtRetention(detail.config?.['retention.ms'])}</div>
                    </div>
                    <div className="px-3 py-2 rounded-lg bg-page-bg border border-border-color">
                      <div className="text-text-muted">单分区容量</div>
                      <div className="text-text-primary font-semibold">{fmtBytes(detail.config?.['retention.bytes'])}</div>
                    </div>
                    <div className="px-3 py-2 rounded-lg bg-page-bg border border-border-color">
                      <div className="text-text-muted">单条大小上限</div>
                      <div className="text-text-primary font-semibold">{fmtBytes(detail.config?.['max.message.bytes'])}</div>
                    </div>
                  </div>
                )}
                <div className="text-xs text-text-muted mb-2">最近 {messages?.length ?? 0} 条消息（新→旧）</div>
                {messages && messages.length > 0 ? (
                  <div className="space-y-2">
                    {messages.map((m, i) => (
                      <div key={`${m.partition}-${m.offset}-${i}`} className="px-3 py-2 rounded-lg bg-page-bg border border-border-color">
                        <div className="flex items-center gap-3 text-[11px] text-text-muted mb-1">
                          <span>P{m.partition}</span>
                          <span>offset {m.offset}</span>
                          {m.timestamp && <span>{new Date(m.timestamp).toLocaleString('zh-CN')}</span>}
                          {m.key && <span className="font-mono">key: {m.key}</span>}
                        </div>
                        <pre className="text-xs text-text-secondary whitespace-pre-wrap break-all font-mono max-h-32 overflow-y-auto">
                          {typeof m.value === 'string' ? m.value : JSON.stringify(m.value, null, 1)?.slice(0, 800)}
                        </pre>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-text-muted text-sm">
                    {messages === null ? '读取失败或 topic 暂无数据' : '该 topic 暂无消息'}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 编辑弹窗：有效期/容量/单条大小/分片增加/设备类型 */}
      {editTopic && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(4_8_20_/_50%)] p-4" onClick={() => setEditTopic(null)}>
          <div className="bg-card-bg rounded-card border border-border-color w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-text-primary">
                编辑 <span className="font-mono">{editTopic}</span> 配置
              </h3>
              <button onClick={() => setEditTopic(null)} className="p-1 rounded hover:bg-page-bg text-text-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-muted mb-1">数据有效期（天）</label>
                  <input
                    type="number" min={1}
                    value={editForm.retention_days}
                    onChange={(e) => setEditForm({ ...editForm, retention_days: e.target.value })}
                    className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-sm text-text-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">单分区容量（GB，留空不限）</label>
                  <input
                    type="number" min={0} step={0.1}
                    value={editForm.size_gb}
                    onChange={(e) => setEditForm({ ...editForm, size_gb: e.target.value })}
                    className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-sm text-text-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">单条大小上限（MB，留空默认）</label>
                  <input
                    type="number" min={0} step={0.1}
                    value={editForm.max_msg_mb}
                    onChange={(e) => setEditForm({ ...editForm, max_msg_mb: e.target.value })}
                    className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-sm text-text-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">分片数（只能增加）</label>
                  <input
                    type="number" min={1} max={64}
                    value={editForm.partitions}
                    onChange={(e) => setEditForm({ ...editForm, partitions: e.target.value })}
                    className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-sm text-text-primary"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">设备类型（解析器）</label>
                <select
                  value={editForm.device_type}
                  onChange={(e) => setEditForm({ ...editForm, device_type: e.target.value })}
                  className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-sm text-text-primary"
                >
                  {DEVICE_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              {editError && <div className="text-danger text-sm">{editError}</div>}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setEditTopic(null)}
                  className="px-4 py-2 text-sm rounded-lg bg-page-bg text-text-muted hover:text-text-primary"
                >
                  取消
                </button>
                <button
                  onClick={handleEditSave}
                  disabled={editSaving}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-accent-solid text-white rounded-lg hover:bg-accent-solid-hover disabled:opacity-50"
                >
                  {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

