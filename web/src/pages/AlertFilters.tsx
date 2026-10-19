/**
 * 告警过滤规则管理
 * 按 topic 维度生成过滤规则（'*' 为全局规则），规则由流水线「过滤去重」阶段实时消费：
 * 命中规则的标准化告警 → FILTERED → invalid-alerts 索引（隔离保留可审计）
 * 规则缓存 30s 刷新，保存后最迟 30s 生效，无需重启流水线。
 *
 * topic 下拉 = 「数据采集」页已纳管的 topic（GET /pipeline/device-topics 的 items），
 * 与数据采集页保持同一事实来源，不再列集群里的杂散 topic。
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Filter, Plus, RefreshCw, Trash2, Power, Globe, Radio, X, Pencil, Save, Info,
} from 'lucide-react';
import { pipelineApi } from '../services/api';
import {
  Button,
  ContentContainer,
  EmptyState,
  Field,
  LoadingState,
  PageHeader,
  SectionCard,
  StateBadge,
} from '../components/ui';

interface FilterRule {
  id: number;
  name: string;
  topic: string;
  field: string;
  operator: string;
  value: string;
  enabled: boolean;
}

/** 已纳管 topic（来自数据采集页） */
interface ManagedTopic {
  topic: string;
  name?: string;
  device_type?: string;
  system?: boolean;
}

const OPERATOR_LABELS: Record<string, string> = {
  eq: '等于',
  contains: '包含',
  regex: '正则匹配',
  gt: '大于',
  lt: '小于',
  in_ip_group: '属于 IP 组（资源管理）',
  not_in_ip_group: '不属于 IP 组（资源管理）',
  in_domain_group: '属于域名组（资源管理）',
  not_in_domain_group: '不属于域名组（资源管理）',
};

const emptyForm = { name: '', topic: '*', field: '', operator: 'eq', value: '' };

export default function AlertFilters() {
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<FilterRule[]>([]);
  const [topics, setTopics] = useState<ManagedTopic[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const fetchAll = useCallback(async () => {
    try {
      const [rulesRes, topicsRes]: any[] = await Promise.all([
        pipelineApi.filterRules(),
        pipelineApi.deviceTopics(),
      ]);
      if (rulesRes.success) setRules(rulesRes.data);
      if (topicsRes.success) {
        // ⚠️ 后端返回 data.items[]（纳管 topic），不是 data.topics[]
        const items: ManagedTopic[] = topicsRes.data?.items || [];
        setTopics(items);
      }
    } catch (e) {
      console.error('加载过滤规则失败:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setShowForm(true);
  };

  const openEdit = (rule: FilterRule) => {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      topic: rule.topic || '*',
      field: rule.field,
      operator: rule.operator,
      value: rule.value ?? '',
    });
    setError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setError('');
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.field.trim()) {
      setError('规则名称与字段不能为空');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name.trim(),
        topic: form.topic || '*',
        field: form.field.trim(),
        operator: form.operator,
        value: form.value,
      };
      const res: any = editingId != null
        ? await pipelineApi.updateFilterRule(editingId, payload)
        : await pipelineApi.createFilterRule({ ...payload, enabled: true });
      if (res.success) {
        const wasEditing = editingId != null;
        closeForm();
        setNotice(wasEditing ? '规则已更新，最迟 30 秒后在流水线中生效' : '规则已创建，最迟 30 秒后在流水线中生效');
        setTimeout(() => setNotice(''), 5000);
        await fetchAll();
      } else {
        setError(res.error || (editingId != null ? '保存失败' : '创建失败'));
      }
    } catch (e: any) {
      setError(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (rule: FilterRule) => {
    await pipelineApi.updateFilterRule(rule.id, { enabled: !rule.enabled });
    await fetchAll();
  };

  const removeRule = async (id: number) => {
    await pipelineApi.deleteFilterRule(id);
    if (editingId === id) closeForm();
    await fetchAll();
  };

  // 按 topic 分组：全局规则一组，其余按 topic 分组
  const groups = rules.reduce<Record<string, FilterRule[]>>((acc, r) => {
    const key = r.topic || '*';
    (acc[key] = acc[key] || []).push(r);
    return acc;
  }, {});
  const groupKeys = Object.keys(groups).sort((a, b) => (a === '*' ? -1 : b === '*' ? 1 : a.localeCompare(b)));

  // topic → 设备名映射，便于下拉里一眼看出是哪个采集源
  const topicLabel = (t: ManagedTopic) => {
    const name = t.name || t.device_type;
    return name && name !== t.topic ? `${t.topic}（${name}）` : t.topic;
  };

  const enabledCount = rules.filter((r) => r.enabled).length;

  if (loading) {
    return (
      <ContentContainer>
        <LoadingState label="正在加载过滤规则…" />
      </ContentContainer>
    );
  }

  return (
    <ContentContainer>
      <PageHeader
        icon={Filter}
        title="告警过滤"        meta={
          rules.length > 0 ? (
            <span className="text-[11px] text-text-muted num">
              共 {rules.length} 条 · 生效 {enabledCount} 条
            </span>
          ) : undefined
        }
        actions={
          <>
            <Button variant="secondary" icon={RefreshCw} onClick={fetchAll}>
              刷新
            </Button>
            <Button
              variant={showForm ? 'secondary' : 'primary'}
              icon={showForm ? X : Plus}
              onClick={() => (showForm ? closeForm() : openCreate())}
            >
              {showForm ? '取消' : '新建规则'}
            </Button>
          </>
        }
      />

      {notice && (
        <div className="callout callout-success">
          <Globe size={14} className="mt-0.5 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* 新建 / 编辑表单 */}
      {showForm && (
        <SectionCard
          icon={editingId != null ? Pencil : Plus}
          title={editingId != null ? '编辑规则' : '新建规则'}
          description={
            editingId != null
              ? `规则 #${editingId} · 修改后最迟 30 秒在流水线中生效`
              : '规则保存后由流水线「过滤去重」阶段实时消费，最迟 30 秒生效'
          }
          actions={
            <Button variant="ghost" size="sm" icon={X} onClick={closeForm}>
              收起
            </Button>
          }
          footer={
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                variant="primary"
                icon={Save}
                loading={saving}
                onClick={handleSubmit}
              >
                {editingId != null ? '保存修改' : '保存规则'}
              </Button>
              <span className="text-[11px] text-text-muted">
                示例：全局规则 src_ip 包含 “198.51.100.” 可屏蔽采集测试源
              </span>
            </div>
          }
        >
          <div className="app-form-grid">
            <Field label="规则名称" required>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="如：屏蔽测试源 IP"
                className="app-input"
              />
            </Field>

            <Field
              label="生效 topic"
              help={
                topics.length > 0
                  ? `共 ${topics.length} 个已纳管 topic（与「数据采集」页一致）`
                  : '「数据采集」页暂无已纳管 topic，仅可配置全局规则'
              }
            >
              <select
                value={form.topic}
                onChange={(e) => setForm({ ...form, topic: e.target.value })}
                className="app-select"
              >
                <option value="*">全局（所有 topic）</option>
                {/* 同步自「数据采集」页已纳管的 topic */}
                {topics.map((t) => <option key={t.topic} value={t.topic}>{topicLabel(t)}</option>)}
                {/* 编辑一条历史规则、但其 topic 已不在纳管列表时，仍要能显示出来 */}
                {form.topic && form.topic !== '*' && !topics.some((t) => t.topic === form.topic) && (
                  <option value={form.topic}>{form.topic}（已不在纳管列表）</option>
                )}
              </select>
            </Field>

            <Field label="告警字段" required>
              <input
                value={form.field}
                onChange={(e) => setForm({ ...form, field: e.target.value })}
                placeholder="如：src_ip / severity / signature"
                className="app-input font-mono"
              />
            </Field>

            <Field label="操作符">
              <select
                value={form.operator}
                onChange={(e) => setForm({ ...form, operator: e.target.value })}
                className="app-select"
              >
                {Object.entries(OPERATOR_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>

            <Field
              label={
                form.operator.endsWith('_group')
                  ? `组名（资源管理 → ${form.operator.includes('ip') ? 'IP 组' : '域名组'}）`
                  : '匹配值'
              }
              required
              help="正则操作符时填正则表达式"
              className="md:col-span-2"
            >
              <input
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                placeholder={form.operator.endsWith('_group') ? '如：办公网段 / 内部业务域名' : '如：198.51.100. / (?i)test  /  5'}
                className="app-input font-mono"
              />
            </Field>
          </div>

          {error && <div className="app-error-text mt-3">{error}</div>}
        </SectionCard>
      )}

      {/* 规则列表（按 topic 分组） */}
      {rules.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={Filter}
            title="暂无过滤规则"
            description="创建后，命中规则的告警将不再进入有效告警索引（隔离进 invalid 索引，仍可审计）。"
            action={
              <Button variant="soft" icon={Plus} onClick={openCreate}>
                新建第一条规则
              </Button>
            }
          />
        </SectionCard>
      ) : (
        <div className="flex flex-col gap-4">
          {groupKeys.map((topic) => {
            const list = groups[topic];
            const isGlobal = topic === '*';
            const onCount = list.filter((r) => r.enabled).length;
            return (
              <SectionCard
                key={topic}
                flush
                icon={isGlobal ? Globe : Radio}
                title={isGlobal ? '全局规则' : topic}
                description={isGlobal ? '对所有 topic 生效' : '仅该 topic 的告警'}
                actions={
                  <span className="text-[11px] text-text-muted num">
                    {list.length} 条 · 生效 {onCount}
                  </span>
                }
              >
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ minWidth: 180 }}>规则名称</th>
                        <th>匹配条件</th>
                        <th style={{ width: 110 }}>状态</th>
                        <th style={{ width: 168 }} className="text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((r) => (
                        <tr key={r.id}>
                          <td className="text-text-primary">{r.name}</td>
                          <td>
                            <code className="font-mono text-[12px] whitespace-nowrap">
                              <span className="text-text-primary">{r.field}</span>{' '}
                              <span className="text-primary">{OPERATOR_LABELS[r.operator] || r.operator}</span>{' '}
                              <span className="text-warning">
                                {r.operator === 'regex' ? `/${r.value}/` : r.value}
                              </span>
                            </code>
                          </td>
                          <td>
                            <StateBadge
                              state={r.enabled ? 'enabled' : 'disabled'}
                              label={r.enabled ? '生效中' : '已停用'}
                            />
                          </td>
                          <td>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                icon={Pencil}
                                className="w-8 px-0"
                                onClick={() => openEdit(r)}
                                title="编辑"
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                icon={Power}
                                className={`w-8 px-0 ${r.enabled ? 'text-success' : ''}`}
                                onClick={() => toggleEnabled(r)}
                                title={r.enabled ? '停用' : '启用'}
                              />
                              <Button
                                variant="danger-ghost"
                                size="sm"
                                icon={Trash2}
                                className="w-8 px-0"
                                onClick={() => removeRule(r.id)}
                                title="删除"
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            );
          })}
        </div>
      )}

      <div className="callout">
        <Info size={14} className="mt-0.5 shrink-0 text-text-muted" />
        <span>
          过滤规则仅影响后续进入流水线的告警，不会回溯删除历史数据；被过滤的告警进入 <code className="font-mono">alerts-invalid</code> 索引保留可审计。
        </span>
      </div>
    </ContentContainer>
  );
}
