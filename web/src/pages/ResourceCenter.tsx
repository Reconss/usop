/**
 * 资源管理（原模板中心升级）
 * Tab 1 字段模型：原模板中心能力（消息/Excel/CSV 模型 + 字段目录管理）
 * Tab 2 IT 资源：单页分类展示 —— IP 组 / 域名组两个区块，
 *      供告警过滤规则 in_ip_group / in_domain_group 等操作符引用
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileText, Network, Globe, Plus, Pencil, Trash2, Save, Loader2,
  ChevronDown, ChevronRight, Layers, Ban, ShieldCheck, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { resourcesApi } from '../services/api';
import { useConfirmDialog, ConfirmDialog } from '../components/Dialogs';
import { useSearchParams } from 'react-router-dom';
import { FieldModelPanel } from './FieldModelCenter';
import {
  Button,
  ContentContainer,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  SectionCard,
  StatCard,
  StatusBadge,
  TableWrap,
} from '../components/ui';

// ==================== 类型 ====================

interface GroupItem { id: number; entry?: string; domain?: string; remark?: string; }
interface ResourceGroup { id: number; name: string; description: string; usage?: string; items: GroupItem[]; }

type GroupKind = 'ip' | 'domain';

const USAGE_META: Record<string, { label: string; tone: 'neutral' | 'danger' | 'success' }> = {
  general: { label: '通用', tone: 'neutral' },
  blacklist: { label: '黑名单', tone: 'danger' },
  whitelist: { label: '白名单', tone: 'success' },
};

const KIND_META: Record<GroupKind, {
  title: string; icon: any; cls: string; badgeCls: string; chipCls: string;
  fieldKey: 'entry' | 'domain'; placeholder: string; help: string;
}> = {
  ip: {
    title: 'IP 组', icon: Network, cls: 'text-info',
    badgeCls: 'bg-info/10 text-info', chipCls: 'bg-info/10 text-info',
    fieldKey: 'entry',
    placeholder: '192.168.1.10\n10.0.0.0/24  核心交换段\n172.16.0.1-172.16.0.50  服务器段',
    help: '支持：单 IP、CIDR（a.b.c.d/nn）、范围（起始-结束）。以 # 开头的行忽略。',
  },
  domain: {
    title: '域名组', icon: Globe, cls: 'text-success',
    badgeCls: 'bg-success/10 text-success', chipCls: 'bg-success/10 text-success',
    fieldKey: 'domain',
    placeholder: 'portal.example.com  门户\n.example.com  全部子域（通配后缀）\n*.corp.cn  集团域名',
    help: '支持：精确域名、通配后缀（.example.com 或 *.example.com）。以 # 开头的行忽略。',
  },
};

const emptyGroupForm = { id: 0, name: '', description: '', entries: '', usage: 'general' };

/** 单条目文本（含备注） */
const itemText = (kind: GroupKind, i: GroupItem) =>
  [i[KIND_META[kind].fieldKey], i.remark].filter(Boolean).join('  ');

// ==================== 统一新建/编辑弹窗 ====================

function GroupModal({ kind, form, onClose, onSaved }: {
  kind: GroupKind;
  form: typeof emptyGroupForm;
  onClose: () => void;
  onSaved: () => void;
}) {
  const meta = KIND_META[kind];
  const [draft, setDraft] = useState(form);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setDraft(form), [form]);

  // 保存前预检：组内重复条目（按行首 token，忽略空行与 # 注释）
  const duplicateHint = useMemo(() => {
    const seen = new Map<string, number>();
    const dups: string[] = [];
    for (const rawLine of draft.entries.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const token = line.split(/\s+/, 1)[0];
      const key = kind === 'domain' ? token.toLowerCase() : token;
      if (seen.has(key)) dups.push(token);
      else seen.set(key, 1);
    }
    return dups.length ? `条目重复：${[...new Set(dups)].join('、')}` : '';
  }, [draft.entries, kind]);

  const save = async () => {
    setSaving(true); setError('');
    if (duplicateHint) { setError(duplicateHint + '，请修改后再保存'); setSaving(false); return; }
    try {
      const payload: any = { name: draft.name, description: draft.description, entries: draft.entries };
      if (kind === 'ip') payload.usage = draft.usage || 'general';
      if (draft.id) {
        await (kind === 'ip' ? resourcesApi.updateIpGroup(draft.id, payload)
                             : resourcesApi.updateDomainGroup(draft.id, payload));
      } else {
        await (kind === 'ip' ? resourcesApi.createIpGroup(payload)
                             : resourcesApi.createDomainGroup(payload));
      }
      onSaved();
    } catch (e: any) {
      setError(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      width={560}
      title={`${draft.id ? '编辑' : '新建'}${meta.title}`}
      description={meta.help}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button variant="primary" icon={Save} loading={saving} disabled={!draft.name.trim()} onClick={save}>
            保存
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="组名" required>
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder={kind === 'ip' ? '如：办公网段 / 核心服务器' : '如：内部业务域名'}
            className="app-input"
          />
        </Field>

        <Field label="描述">
          <input
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            className="app-input"
          />
        </Field>

        {kind === 'ip' && (
          <Field label="用途">
            <select
              value={draft.usage}
              onChange={(e) => setDraft({ ...draft, usage: e.target.value })}
              className="app-select"
            >
              <option value="general">通用</option>
              <option value="blacklist">黑名单</option>
              <option value="whitelist">白名单</option>
            </select>
          </Field>
        )}

        <Field
          label={`${meta.title}条目`}
          help={`每行一条，可带备注：「${kind === 'ip' ? '10.0.0.5 堡垒机' : 'api.example.com 网关'}」`}
        >
          <textarea
            value={draft.entries}
            onChange={(e) => setDraft({ ...draft, entries: e.target.value })}
            rows={8}
            placeholder={meta.placeholder}
            className="app-textarea font-mono"
          />
        </Field>

        {duplicateHint && (
          <div className="callout callout-warning">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{duplicateHint}（保存前请先去重）</span>
          </div>
        )}
        {error && <div className="callout callout-danger">{error}</div>}
      </div>
    </Modal>
  );
}

// ==================== 单类型区块（表格 + 展开条目） ====================

function GroupSection({ kind, groups, loading, onAdd, onEdit, onDelete }: {
  kind: GroupKind;
  groups: ResourceGroup[];
  loading: boolean;
  onAdd: () => void;
  onEdit: (g: ResourceGroup) => void;
  onDelete: (g: ResourceGroup) => void;
}) {
  const meta = KIND_META[kind];
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const Icon = meta.icon;

  const toggleRow = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const entryCount = groups.reduce((s, g) => s + g.items.length, 0);

  return (
    <SectionCard
      flush
      icon={Icon}
      title={meta.title}
      description={`${groups.length} 组 · ${entryCount} 条目`}
      actions={
        <Button variant="primary" size="sm" icon={Plus} onClick={onAdd}>
          新建{meta.title}
        </Button>
      }
    >
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 size={18} className="animate-spin text-text-muted" />
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={Icon}
          title={`暂无${meta.title}`}
          description={kind === 'ip'
            ? '把常用网段、服务器 IP 归成组，过滤规则即可按组匹配。'
            : '把内部业务域名归成组，过滤规则即可按域名组匹配。'}
          action={<Button variant="soft" size="sm" icon={Plus} onClick={onAdd}>新建{meta.title}</Button>}
        />
      ) : (
        <TableWrap>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 36 }} />
                <th style={{ minWidth: 160 }}>组名</th>
                <th style={{ minWidth: 180 }}>描述</th>
                {kind === 'ip' && <th style={{ width: 100 }}>用途</th>}
                <th style={{ width: 90 }}>条目数</th>
                <th style={{ minWidth: 220 }}>条目预览</th>
                <th style={{ width: 100 }} className="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const isOpen = expanded.has(g.id);
                const preview = g.items.slice(0, 4);
                return (
                  <GroupRow
                    key={g.id} g={g} kind={kind} isOpen={isOpen}
                    preview={preview} onToggle={() => toggleRow(g.id)}
                    onEdit={onEdit} onDelete={onDelete}
                  />
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}
    </SectionCard>
  );
}

function GroupRow({ g, kind, isOpen, preview, onToggle, onEdit, onDelete }: any) {
  const meta = KIND_META[kind as GroupKind];
  const usage = USAGE_META[g.usage] || USAGE_META.general;
  return (
    <>
      <tr>
        <td>
          <button
            onClick={onToggle}
            className="rounded p-1 text-text-muted transition-colors hover:bg-surface-3 hover:text-text-primary"
            title="展开条目"
          >
            {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        </td>
        <td className="text-text-primary font-medium">{g.name}</td>
        <td className="max-w-[220px] truncate-1">{g.description || '—'}</td>
        {kind === 'ip' && (
          <td>
            <StatusBadge tone={usage.tone}>
              {g.usage === 'blacklist' ? <Ban size={10} />
                : g.usage === 'whitelist' ? <ShieldCheck size={10} /> : null}
              {usage.label}
            </StatusBadge>
          </td>
        )}
        <td><span className="num text-text-primary">{g.items.length}</span></td>
        <td>
          {g.items.length === 0 ? (
            <span className="text-[11.5px] text-text-muted">暂无条目</span>
          ) : (
            <div className="flex flex-wrap items-center gap-1">
              {preview.map((i: GroupItem) => (
                <span
                  key={i.id}
                  title={itemText(kind, i)}
                  className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${meta.chipCls}`}
                >
                  {i[meta.fieldKey]}
                </span>
              ))}
              {g.items.length > preview.length && (
                <button onClick={onToggle} className="text-[11px] text-primary hover:underline">
                  +{g.items.length - preview.length} 更多
                </button>
              )}
            </div>
          )}
        </td>
        <td>
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="sm" icon={Pencil} className="w-8 px-0" title="编辑" onClick={() => onEdit(g)} />
            <Button variant="danger-ghost" size="sm" icon={Trash2} className="w-8 px-0" title="删除" onClick={() => onDelete(g)} />
          </div>
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td />
          <td colSpan={kind === 'ip' ? 6 : 5}>
            {g.items.length === 0 ? (
              <p className="text-[11.5px] text-text-muted">该组暂无条目，点击「编辑」添加。</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {g.items.map((i: GroupItem) => (
                  <span
                    key={i.id}
                    title={i.remark || undefined}
                    className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${meta.chipCls}`}
                  >
                    {i[meta.fieldKey]}
                    {i.remark ? <span className="font-sans opacity-60"> · {i.remark}</span> : null}
                  </span>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ==================== IT 资源页（单页分类展示） ====================

function ItResourcePanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const { ask, confirmProps } = useConfirmDialog('删除确认');
  const [ipGroups, setIpGroups] = useState<ResourceGroup[]>([]);
  const [domainGroups, setDomainGroups] = useState<ResourceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ kind: GroupKind; form: typeof emptyGroupForm } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ipRes, dgRes]: any[] = await Promise.all([
        resourcesApi.ipGroups(), resourcesApi.domainGroups(),
      ]);
      setIpGroups(ipRes.data || []);
      setDomainGroups(dgRes.data || []);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const remove = async (kind: GroupKind, g: ResourceGroup) => {
    const meta = KIND_META[kind];
    const ok = await ask({
      title: `删除${meta.title}`,
      message: `确定删除「${g.name}」吗？\n引用该组的过滤规则将不再匹配。`,
      danger: true,
      confirmText: '删除',
    });
    if (!ok) return;
    setError('');
    try {
      await (kind === 'ip' ? resourcesApi.deleteIpGroup(g.id) : resourcesApi.deleteDomainGroup(g.id));
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const openEdit = (kind: GroupKind, g: ResourceGroup) => {
    setModal({
      kind, form: {
        id: g.id, name: g.name, description: g.description || '',
        usage: g.usage || 'general',
        entries: g.items.map((i) => itemText(kind, i)).join('\n'),
      },
    });
  };

  const stats = useMemo(() => ({
    ipGroups: ipGroups.length,
    ipEntries: ipGroups.reduce((s, g) => s + g.items.length, 0),
    domainGroups: domainGroups.length,
    domainEntries: domainGroups.reduce((s, g) => s + g.items.length, 0),
  }), [ipGroups, domainGroups]);

  return (
    <div className="flex flex-col gap-4">
      {/* 概览统计 */}
      <div className="app-grid">
        <StatCard label="IP 组" value={stats.ipGroups} icon={Network} tone="info" />
        <StatCard label="IP 条目" value={stats.ipEntries} icon={Layers} tone="info" />
        <StatCard label="域名组" value={stats.domainGroups} icon={Globe} tone="success" />
        <StatCard label="域名条目" value={stats.domainEntries} icon={Layers} tone="success" />
      </div>

      {error && <div className="callout callout-danger">{error}</div>}

      {/* 按类型分区的资源区块 */}
      <GroupSection
        kind="ip" groups={ipGroups} loading={loading}
        onAdd={() => setModal({ kind: 'ip', form: { ...emptyGroupForm } })}
        onEdit={(g) => openEdit('ip', g)}
        onDelete={(g) => remove('ip', g)}
      />
      <GroupSection
        kind="domain" groups={domainGroups} loading={loading}
        onAdd={() => setModal({ kind: 'domain', form: { ...emptyGroupForm } })}
        onEdit={(g) => openEdit('domain', g)}
        onDelete={(g) => remove('domain', g)}
      />

      {modal && (
        <GroupModal
          kind={modal.kind}
          form={modal.form}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
      <ConfirmDialog {...confirmProps} />
    </div>
  );
}

// ==================== 页面入口：两 Tab ====================

const TABS = [
  { id: 'it-resources', label: 'IT 资源', icon: Network },
  { id: 'templates', label: '字段模型', icon: FileText },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function ResourceCenter() {
  // Tab 状态持久化到 URL 查询参数（?tab=xxx）：刷新/分享链接均保持在当前 Tab，
  // 避免原先本地 useState 默认值导致刷新总是回落到「IT 资源」。
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as TabId | null;
  const tab: TabId = tabParam && TABS.some((t) => t.id === tabParam) ? tabParam : 'it-resources';
  const selectTab = (id: TabId) => setSearchParams({ tab: id }, { replace: true });
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <ContentContainer>
      <PageHeader
        icon={Layers}
        title="资源管理"        actions={
          tab === 'it-resources' ? (
            <Button variant="secondary" icon={RefreshCw} onClick={() => setRefreshKey((k) => k + 1)}>
              刷新
            </Button>
          ) : undefined
        }
        toolbar={
          <div className="tabs-line">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => selectTab(t.id)}
                className={`tab-line-item ${tab === t.id ? 'is-active' : ''}`}
              >
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>
        }
      />

      {tab === 'it-resources' && <ItResourcePanel refreshKey={refreshKey} />}
      {tab === 'templates' && <FieldModelPanel />}
    </ContentContainer>
  );
}
