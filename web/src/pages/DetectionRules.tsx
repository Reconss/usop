import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus, Edit2, Trash2, Play, Code, Database, AlertTriangle, CheckCircle,
  Workflow, Loader2, RefreshCw, FlaskConical,
} from 'lucide-react';
import { useConfirmDialog, ConfirmDialog } from '../components/Dialogs';
import { rulesApi, dataSourcesApi, playbooksApi } from '../services/api';
import RuleFormModal from '../components/detection-rules/RuleFormModal';
import CorrelationRulesPanel from '../components/correlation/CorrelationRulesPanel';
import { DetectionRule, RuleType } from '../types/detection-rules';
import {
  Button,
  ContentContainer,
  EmptyState,
  LoadingState,
  PageHeader,
  SearchInput,
  SectionCard,
  SeverityBadge,
  StatCard,
  Switch,
  TableWrap,
} from '../components/ui';

interface DataSource {
  id: number | string;
  name: string;
  type: string;
  status: string;
  protocol?: string;
}

interface Playbook {
  id: string | number;
  name: string;
  description?: string;
  status: string;
  triggerType?: string;
}

/**
 * 检测规则 = 单事件规则（在 ES 告警索引上按时间窗口统计条件命中数 ≥ 阈值）。
 *
 * 多事件的频次 / 去重 / 聚合 / 时序分析由「关联分析规则」承担，见右侧 Tab。
 * 历史数据里可能存在 correlation / sequence / sigma / yara 等旧类型取值，
 * 这里保留展示并标注「旧」，但表单已不再提供这些类型。
 */
const LEGACY_TYPES = new Set(['correlation', 'sequence', 'query']);

const getTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    single: '单事件', threshold: '阈值', aggregation: '聚合',
    sigma: 'Sigma', yara: 'YARA',
    correlation: '关联（旧）', sequence: '时序（旧）', query: 'SQL（旧）',
  };
  return labels[type] || type;
};

const OPERATOR_LABELS: Record<string, string> = {
  equals: '等于', not_equals: '不等于', contains: '包含',
  not_contains: '不包含', starts_with: '开头是', ends_with: '结尾是',
  greater_than: '大于', less_than: '小于', in_list: '属于',
  not_in_list: '不属于', is_empty: '为空', is_not_empty: '不为空',
  regex_match: '正则匹配',
};

// 与后端 /rules/fields 返回的告警字段一致（ES 告警索引的显式映射字段）
const FIELD_LABELS: Record<string, string> = {
  alert_code: '告警编号', alert_id: '告警ID', alert_log_id: '告警日志ID',
  title: '告警标题', description: '告警描述', severity: '严重等级',
  status: '处理状态', operation: '操作动作', source: '来源',
  source_product: '来源产品', source_type: '来源类型', category: '分类',
  confidence: '置信度', src_ip: '源IP', src_port: '源端口', dst_ip: '目标IP',
  dst_port: '目标端口', protocol: '协议', hostname: '主机名', tags: '标签',
  processing_status: '处理标记', dispatch_policy: '分流策略',
  assigned_to: '处置人ID', raw_log: '原始日志',
};

/**
 * 把后端返回的 JSON 列值统一归并成数组。
 *
 * 历史数据里 detection_rules.data_source_ids / tags 曾被双重编码，落库成 JSON
 * **字符串** `"[1, 2]"`，接口原样返回。之前直接 `(rule.dataSourceIds || []).filter()`
 * 会抛 TypeError，React 18 会把整页卸载成白屏。后端已做修复，这里再兜一层，
 * 保证任何来源的脏数据都只影响单行显示，不会打崩页面。
 */
function toArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [s];
    }
  }
  return [value];
}

function conditionsToText(conditions: any[]): string {
  if (!conditions || conditions.length === 0) return '无条件';
  return conditions.map((c: any) => {
    const opLabel = OPERATOR_LABELS[c.operator] || c.operator;
    const fieldLabel = FIELD_LABELS[c.field] || c.field;
    return `${fieldLabel} ${opLabel} "${c.value}"`;
  }).join(' AND ');
}

export default function DetectionRules() {
  const { ask, confirmProps } = useConfirmDialog('删除确认');
  const [tab, setTab] = useState<'detection' | 'correlation'>('detection');
  const [rules, setRules] = useState<DetectionRule[]>([]);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<DetectionRule | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ruleId: string | number; data: any } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rulesRes, dsRes, pbRes] = await Promise.allSettled([
        rulesApi.getRules({ page_size: 100 }),
        dataSourcesApi.getDataSources({ page_size: 100 }),
        playbooksApi.getPlaybooks({ page_size: 100 }),
      ]);

      if (rulesRes.status === 'fulfilled' && rulesRes.value.success) {
        const items = Array.isArray(rulesRes.value.data) ? rulesRes.value.data : rulesRes.value.data?.items || [];
        setRules(items.map((item: any) => ({
          id: item.id,
          name: item.name || item.rule_name,
          type: item.type || 'single',
          status: item.status === 'active' ? 'enabled' : item.status,
          severity: item.severity || 'medium',
          hitCount: item.hit_count || 0,
          lastHitTime: item.last_hit_time || item.updated_at,
          description: item.description || item.detail,
          ruleContent: item.rule_content || '',
          ruleLanguage: item.rule_language || 'sigma',
          dataSourceIds: toArray(item.data_source_ids),
          playbookId: item.playbook_id || item.playbookId,
        })));
      }

      if (dsRes.status === 'fulfilled' && dsRes.value.success) {
        const items = Array.isArray(dsRes.value.data) ? dsRes.value.data : dsRes.value.data?.items || [];
        setDataSources(items.map((item: any) => ({
          id: item.id,
          name: item.name || item.source_name,
          type: item.type || item.source_type,
          status: item.status || 'active',
        })));
      }

      if (pbRes.status === 'fulfilled' && pbRes.value.success) {
        const items = Array.isArray(pbRes.value.data) ? pbRes.value.data : pbRes.value.data?.items || [];
        setPlaybooks(items.filter((p: any) => p.status === 'published' || p.status === 'enabled').map((item: any) => ({
          id: item.id,
          name: item.name || item.playbook_name,
          description: item.description,
          status: item.status,
          triggerType: item.trigger_type || item.triggerType,
        })));
      }
    } catch (error) {
      console.error('获取数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // toast 定时器用 ref 持有：新 toast 重置计时，避免连续操作时旧定时器
  // 把新提示提前清掉（表现为"保存成功了但看不到反馈"）
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  const filteredRules = rules.filter((rule) => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    return rule.name.toLowerCase().includes(term) || String(rule.id).toLowerCase().includes(term);
  });

  const handleAdd = () => {
    setEditingRule(null);
    setTestResult(null);
    setShowForm(true);
  };

  const handleEdit = (rule: DetectionRule) => {
    setEditingRule(rule);
    setTestResult(null);
    setShowForm(true);
  };

  const handleSave = async (ruleData: Record<string, any>) => {
    try {
      if (editingRule) {
        await rulesApi.updateRule(editingRule.id, ruleData);
        setRules((prev) => prev.map((rule) =>
          rule.id === editingRule.id
            ? { ...rule, ...ruleData, ruleContent: ruleData.rule_content, dataSourceIds: toArray(ruleData.data_source_ids), severity: ruleData.severity, playbookId: ruleData.playbook_id } as DetectionRule
            : rule
        ));
        showToast('规则已更新');
      } else {
        const res = await rulesApi.createRule(ruleData) as any;
        if (res.success && res.data) {
          const newRule: DetectionRule = {
            id: res.data.id || res.data.rule_id || `RULE-${new Date().getFullYear()}-${String(rules.length + 1).padStart(3, '0')}`,
            name: ruleData.name,
            type: ruleData.type as RuleType,
            status: 'disabled',
            severity: ruleData.severity,
            hitCount: 0,
            description: ruleData.description,
            ruleContent: ruleData.rule_content,
            ruleLanguage: 'sigma',
            dataSourceIds: toArray(ruleData.data_source_ids),
            playbookId: ruleData.playbook_id || undefined,
          };
          setRules((prev) => [...prev, newRule]);
          showToast('规则已创建');
        }
      }
      setShowForm(false);
    } catch (error: any) {
      console.error('保存规则失败:', error);
      showToast(error?.message || '保存失败', 'error');
    }
  };

  const handleDelete = async (id: string | number) => {
    if (!(await ask({ title: '删除规则', message: '确定要删除此检测规则吗？删除后不可恢复。', danger: true, confirmText: '删除' }))) return;
    try {
      await rulesApi.deleteRule(id);
      setRules((prev) => prev.filter((rule) => rule.id !== id));
      showToast('规则已删除');
    } catch (error) {
      showToast('删除失败', 'error');
    }
  };

  const handleTest = async (rule: DetectionRule) => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await rulesApi.testRule(rule.id) as any;
      if (res.success && res.data) {
        setTestResult({ ruleId: rule.id, data: res.data });
        showToast(`测试完成，匹配 ${res.data.matched_count || 0} 条日志`);
      } else {
        setTestResult({ ruleId: rule.id, data: { matched: false, matched_count: 0, matched_logs: [] } });
        showToast(res.error || '测试失败', 'error');
      }
    } catch (error: any) {
      setTestResult({ ruleId: rule.id, data: { matched: false, matched_count: 0, matched_logs: [] } });
      showToast(error?.message || '测试失败', 'error');
    } finally {
      setIsTesting(false);
    }
  };

  const toggleStatus = async (id: string | number) => {
    const original = rules.find((r) => r.id === id);
    const newStatus = original?.status === 'enabled' ? 'disabled' : 'enabled';
    // 乐观更新
    setRules((prev) => prev.map((rule) => rule.id === id ? { ...rule, status: newStatus } : rule));
    try {
      await rulesApi.toggleRule(id);
    } catch (error) {
      // 回滚
      setRules((prev) => prev.map((rule) => rule.id === id ? { ...rule, status: original?.status || 'disabled' } : rule));
      showToast('状态切换失败', 'error');
    }
  };

  const getRuleContentPreview = (content?: string) => {
    if (!content) return '—';
    try {
      const parsed = JSON.parse(content);
      const conds = parsed.conditions;
      if (conds && Array.isArray(conds) && conds.length > 0) {
        const text = conditionsToText(conds);
        return text.length > 60 ? text.substring(0, 60) + '...' : text;
      }
      if (parsed.groups || parsed.steps) {
        return '旧多事件格式（引擎不支持，未生效）';
      }
      if (parsed.time_window || parsed.threshold) {
        return `窗口: ${parsed.time_window || '-'} 阈值: ${parsed.threshold || '-'}`;
      }
      return 'JSON 规则';
    } catch {
      return content.length > 60 ? content.substring(0, 60) + '...' : content;
    }
  };

  // 规则统计
  const ruleStats = useMemo(() => {
    const total = rules.length;
    const enabled = rules.filter((r) => r.status === 'enabled').length;
    const highSeverity = rules.filter((r) => r.severity === 'critical' || r.severity === 'high').length;
    const totalHits = rules.reduce((sum, r) => sum + (r.hitCount || 0), 0);
    return { total, enabled, disabled: total - enabled, highSeverity, totalHits };
  }, [rules]);

  return (
    <ContentContainer>
      <PageHeader
        icon={Code}
        title="规则管理"        actions={
          tab === 'detection' ? (
            <>
              <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={fetchData}>
                刷新
              </Button>
              <Button variant="primary" icon={Plus} onClick={handleAdd}>
                新建规则
              </Button>
            </>
          ) : undefined
        }
        toolbar={
          <div className="tabs-line">
            <button
              onClick={() => setTab('detection')}
              className={`tab-line-item ${tab === 'detection' ? 'is-active' : ''}`}
            >
              <Code size={14} /> 检测规则
            </button>
            <button
              onClick={() => setTab('correlation')}
              className={`tab-line-item ${tab === 'correlation' ? 'is-active' : ''}`}
            >
              <Workflow size={14} /> 关联分析规则
            </button>
          </div>
        }
      />

      {tab === 'correlation' ? (
        <CorrelationRulesPanel onToast={showToast} />
      ) : (
        <>
          {/* 统计栏 */}
          <div className="app-grid">
            <StatCard label="总规则" value={ruleStats.total} icon={Code} tone="primary" />
            <StatCard label="已启用" value={ruleStats.enabled} icon={CheckCircle} tone="success" />
            <StatCard label="高危规则" value={ruleStats.highSeverity} icon={AlertTriangle} tone="danger" />
            <StatCard label="总命中" value={ruleStats.totalHits} icon={Database} tone="info" />
            <StatCard
              label="启用率"
              value={ruleStats.total > 0 ? Math.round((ruleStats.enabled / ruleStats.total) * 100) : 0}
              unit="%"
              icon={FlaskConical}
              tone="accent"
            />
          </div>

          <SectionCard
            flush
            icon={Code}
            title="检测规则"
            description={`在告警索引上做单事件判断，命中写入事件表 · 共 ${filteredRules.length} 条`}
            actions={
              <SearchInput
                value={searchTerm}
                onChange={setSearchTerm}
                width="md"
                placeholder="搜索规则名称或规则 ID"
              />
            }
          >
            {loading ? (
              <LoadingState label="正在加载检测规则…" />
            ) : filteredRules.length === 0 ? (
              <EmptyState
                icon={Code}
                title={searchTerm ? '没有匹配的规则' : '暂无检测规则'}
                description={searchTerm ? '尝试更换关键词。' : '创建规则后可在告警索引上按条件实时评估。'}
                action={
                  searchTerm
                    ? <Button variant="soft" onClick={() => setSearchTerm('')}>清空搜索</Button>
                    : <Button variant="soft" icon={Plus} onClick={handleAdd}>新建规则</Button>
                }
              />
            ) : (
              <TableWrap>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 140 }}>规则 ID</th>
                      <th style={{ minWidth: 200 }}>规则名称</th>
                      <th style={{ width: 100 }}>类型</th>
                      <th style={{ width: 96 }}>严重等级</th>
                      <th style={{ minWidth: 220 }}>规则内容</th>
                      <th style={{ width: 90 }}>数据源</th>
                      <th style={{ width: 80 }}>状态</th>
                      <th style={{ width: 80 }}>命中</th>
                      <th style={{ minWidth: 150 }}>最后命中</th>
                      <th style={{ width: 120 }} className="text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRules.map((rule) => {
                      const dsCount = toArray(rule.dataSourceIds).filter(Boolean).length;
                      const legacy = LEGACY_TYPES.has(rule.type);
                      return (
                        <tr key={rule.id}>
                          <td className="font-mono text-[11.5px] truncate-1">{rule.id}</td>
                          <td>
                            <div className="text-text-primary font-medium truncate-1">{rule.name}</div>
                            {rule.description && (
                              <div className="mt-0.5 text-[11px] text-text-muted truncate-1">{rule.description}</div>
                            )}
                          </td>
                          <td>
                            <span className={`text-[11.5px] ${legacy ? 'text-text-muted line-through' : 'text-text-secondary'}`}>
                              {getTypeLabel(rule.type)}
                            </span>
                          </td>
                          <td><SeverityBadge severity={rule.severity} /></td>
                          <td>
                            <div
                              className="max-w-[240px] truncate-1 font-mono text-[11.5px] text-text-secondary"
                              title={rule.ruleContent}
                            >
                              {getRuleContentPreview(rule.ruleContent)}
                            </div>
                          </td>
                          <td>
                            <span className="inline-flex items-center gap-1 num">
                              <Database size={12} className="text-text-muted" />{dsCount}
                            </span>
                          </td>
                          <td>
                            <Switch
                              size="sm"
                              checked={rule.status === 'enabled'}
                              onChange={() => toggleStatus(rule.id)}
                              label={`切换 ${rule.name} 状态`}
                            />
                          </td>
                          <td className="num text-text-primary">{rule.hitCount}</td>
                          <td className="num">{rule.lastHitTime ? new Date(rule.lastHitTime).toLocaleString('zh-CN') : '—'}</td>
                          <td>
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" icon={Edit2} className="w-8 px-0"
                                title="编辑规则" onClick={() => handleEdit(rule)} />
                              <Button variant="ghost" size="sm" icon={Play} className="w-8 px-0"
                                title="测试规则" loading={isTesting && testResult?.ruleId === rule.id}
                                onClick={() => handleTest(rule)} />
                              <Button variant="danger-ghost" size="sm" icon={Trash2} className="w-8 px-0"
                                title="删除规则" onClick={() => handleDelete(rule.id)} />
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

          {/* 测试结果 */}
          {testResult && (
            <SectionCard
              icon={FlaskConical}
              title="测试结果"
              description={String(testResult.ruleId)}
              actions={
                <Button variant="ghost" size="sm" onClick={() => setTestResult(null)}>
                  收起
                </Button>
              }
            >
              <div
                className={`rounded-card border p-3 ${
                  testResult.data.matched
                    ? 'border-success/30 bg-success/5'
                    : 'border-danger/30 bg-danger/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  {testResult.data.matched
                    ? <CheckCircle size={14} className="text-success" />
                    : <AlertTriangle size={14} className="text-danger" />}
                  <span className={`text-[12.5px] font-medium ${testResult.data.matched ? 'text-success' : 'text-danger'}`}>
                    {testResult.data.error
                      ? `测试失败: ${testResult.data.error}`
                      : `条件命中 ${testResult.data.matched_count || 0} 条告警${testResult.data.threshold ? `，阈值 ${testResult.data.threshold}` : ''}`}
                  </span>
                </div>

                {(testResult.data.warnings || []).length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {testResult.data.warnings.map((w: string, i: number) => (
                      <li key={i} className="text-[11.5px] text-warning">· {w}</li>
                    ))}
                  </ul>
                )}

                {testResult.data.matched_logs && testResult.data.matched_logs.length > 0 && (
                  <div className="mt-2 max-h-40 space-y-1 overflow-auto">
                    {testResult.data.matched_logs.slice(0, 5).map((log: any, idx: number) => (
                      <pre key={idx} className="truncate-1 rounded border border-border-color bg-surface-2 p-2 font-mono text-[11px] text-text-muted">
                        {log.title || log.alert_code || log.raw_log || JSON.stringify(log)}
                      </pre>
                    ))}
                  </div>
                )}

                {testResult.data.sources && Object.keys(testResult.data.sources).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(testResult.data.sources).map(([id, src]: [string, any]) => (
                      <span key={id} className="rounded border border-border-color bg-surface-2 px-2 py-0.5 text-[11px] text-text-muted">
                        {src.data_source_name}: {src.matched_count} 条
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {/* 表单模态框 */}
          {showForm && (
            <RuleFormModal
              editingRule={editingRule}
              dataSources={dataSources}
              playbooks={playbooks}
              onSave={handleSave}
              onClose={() => setShowForm(false)}
            />
          )}
          <ConfirmDialog {...confirmProps} />
        </>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed right-4 top-16 z-toast max-w-xs rounded-card border px-3.5 py-2.5 text-[12.5px] shadow-panel ${
            toast.type === 'success'
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-danger/30 bg-danger/10 text-danger'
          }`}
        >
          {toast.message}
        </div>
      )}
    </ContentContainer>
  );
}
