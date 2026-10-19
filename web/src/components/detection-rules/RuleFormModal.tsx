import React, { useState, useEffect } from 'react';
import { FileText, Database, Code, AlertTriangle, Workflow, Info, Target } from 'lucide-react';
import RuleConditionTab from './RuleConditionTab';
import RuleDataSourceTab from './RuleDataSourceTab';
import RuleTestPanel from './RuleTestPanel';
import { rulesApi } from '../../services/api';
import { DetectionRule, Condition, FormTab } from '../../types/detection-rules';
import { Button, Field, Modal, Segmented } from '../ui';

interface DataSource {
  id: string | number;
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

interface Props {
  editingRule: DetectionRule | null;
  dataSources: DataSource[];
  playbooks: Playbook[];
  onSave: (data: Record<string, any>) => Promise<void>;
  onClose: () => void;
}

const severityOptions = [
  { value: 'critical', label: '危急', dot: 'bg-critical' },
  { value: 'high', label: '高危', dot: 'bg-high' },
  { value: 'medium', label: '中危', dot: 'bg-medium' },
  { value: 'low', label: '低危', dot: 'bg-low' },
];

/**
 * 检测规则表单 —— 只做「单事件规则」。
 *
 * 多事件的关联 / 时序分析已统一到「关联分析规则」（Flink 流作业），本表单不再提供
 * 关联规则、时序规则两种类型：它们曾经能选、能存，但引擎侧从未支持（无 sequence
 * 分支、correlation 结构与前端 JSON 不匹配），属于"配了也不会执行"的空壳。
 *
 * 编辑历史规则时，若原内容是 Sigma/YARA 文本或旧 groups/steps 格式，会在检测条件
 * 上方展示原始内容，保存即转换为单事件条件格式 —— 避免静默覆盖看不清。
 */
export default function RuleFormModal({ editingRule, dataSources, playbooks, onSave, onClose }: Props) {
  const [formData, setFormData] = useState<Partial<DetectionRule>>({ name: '', type: 'single', description: '', status: 'disabled' });
  const [selectedSeverity, setSelectedSeverity] = useState('medium');
  const [selectedDataSources, setSelectedDataSources] = useState<string[]>([]);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string | number | null>(null);
  const [activeTab, setActiveTab] = useState<FormTab>('basic');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [legacyContent, setLegacyContent] = useState<string | null>(null);

  // 单事件状态
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [timeWindow, setTimeWindow] = useState(5);
  const [timeUnit, setTimeUnit] = useState('minutes');
  const [threshold, setThreshold] = useState(5);
  const [groupBy, setGroupBy] = useState('');

  // 初始化/编辑时填充
  useEffect(() => {
    if (editingRule) {
      setFormData({ ...editingRule });
      setSelectedSeverity(editingRule.severity || 'medium');
      setSelectedDataSources((Array.isArray(editingRule.dataSourceIds) ? editingRule.dataSourceIds : []).map(id => String(id)));
      setSelectedPlaybookId(editingRule.playbookId || null);
      parseRuleContent(editingRule.ruleContent || '');
    } else {
      setFormData({ name: '', type: 'single', description: '', status: 'disabled' });
      setSelectedSeverity('medium');
      setSelectedDataSources([]);
      setSelectedPlaybookId(null);
      resetEditors();
    }
  }, [editingRule]);

  const resetEditors = () => {
    setConditions([]);
    setTimeWindow(5); setTimeUnit('minutes'); setThreshold(5); setGroupBy('');
    setTestResult(null);
    setLegacyContent(null);
  };

  const parseRuleContent = (content: string) => {
    resetEditors();
    if (!content) return;
    let parsed: any = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Sigma / YARA 等非 JSON 文本
      setLegacyContent(content);
      return;
    }
    if (parsed.groups || parsed.steps) {
      // 旧的关联 / 时序格式：引擎从未支持，保留原文提示后按单事件重建
      setLegacyContent(content);
      return;
    }
    setConditions(parsed.conditions || []);
    setGroupBy(parsed.group_by || '');
    setThreshold(parsed.threshold || 5);
    if (parsed.time_window) {
      const match = String(parsed.time_window).match(/(\d+)\s*(\w+)/);
      if (match) {
        setTimeWindow(parseInt(match[1]));
        const unit = match[2];
        if (unit.startsWith('hour')) setTimeUnit('hours');
        else if (unit.startsWith('day')) setTimeUnit('days');
        else setTimeUnit('minutes');
      }
    }
  };

  const buildRuleContent = (): string => JSON.stringify({
    version: 2,
    severity: selectedSeverity,
    title_template: `规则 ${formData.name || '未命名'} 触发`,
    conditions: conditions.filter(c => c.field && c.value),
    time_window: `${timeWindow} ${timeUnit}`,
    threshold,
    ...(groupBy ? { group_by: groupBy } : {}),
    aggregation: 'count'
  }, null, 2);

  const handleSave = async () => {
    if (!formData.name) return;
    setIsSaving(true);
    try {
      const ruleData: Record<string, any> = {
        name: formData.name,
        type: 'single',
        description: formData.description,
        severity: selectedSeverity,
        data_source_ids: selectedDataSources.filter(Boolean),
        playbook_id: selectedPlaybookId || null,
        status: formData.status || 'disabled',
        rule_content: buildRuleContent(),
        rule_language: 'json'
      };
      await onSave(ruleData);
    } catch (e) {
      console.error('Save failed:', e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!editingRule?.id) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await rulesApi.testRule(editingRule.id) as any;
      if (res.success && res.data) {
        setTestResult(res.data);
      } else {
        setTestResult({ matched: false, matched_count: 0, matched_logs: [] });
      }
    } catch (e) {
      setTestResult({ matched: false, matched_count: 0, matched_logs: [] });
    } finally {
      setIsTesting(false);
    }
  };

  const tabs = [
    { id: 'basic' as FormTab, label: '基本信息', icon: FileText },
    { id: 'datasource' as FormTab, label: '数据源', icon: Database },
    { id: 'condition' as FormTab, label: '检测条件', icon: Code },
    { id: 'action' as FormTab, label: '响应动作', icon: AlertTriangle }
  ];

  const selectedPlaybook = playbooks.find(p => String(p.id) === String(selectedPlaybookId));

  return (
    <Modal
      open
      onClose={onClose}
      width={760}
      title={editingRule ? '编辑规则' : '新建规则'}
      description="单事件规则 · 在告警索引上按时间窗口统计条件命中数"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            loading={isSaving}
            disabled={!formData.name}
            onClick={handleSave}
          >
            {editingRule ? '保存' : '创建'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Segmented
          items={tabs.map(t => ({ value: t.id, label: t.label, icon: t.icon }))}
          value={activeTab}
          onChange={setActiveTab}
          className="flex-wrap"
        />

        {/* ═══ 基本信息 ═══ */}
        {activeTab === 'basic' && (
          <div className="app-form-grid">
            <Field label="规则名称" required className="col-span-full">
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="请输入规则名称"
                className="app-input"
              />
            </Field>

            <Field label="规则类型" className="col-span-full">
              <div className="flex items-center gap-2 rounded-input border border-border-color bg-surface-2 px-3 py-2">
                <Target size={14} className="shrink-0 text-primary" />
                <span className="text-[13px] text-text-primary">单事件规则</span>
                <span className="ml-auto text-caption text-text-muted">窗口内条件命中数 ≥ 阈值时触发</span>
              </div>
            </Field>

            <div className="col-span-full">
              <div className="callout callout-info">
                <Info size={14} className="mt-0.5 shrink-0" />
                <span className="opacity-90">
                  检测规则在告警索引（alerts-valid）上按时间窗口统计条件命中数，命中后生成事件。
                  多事件的频次 / 去重 / 聚合 / 时序关联分析请在「关联分析规则」标签页配置（Flink 流作业）。
                </span>
              </div>
            </div>

            <Field label="严重等级" className="col-span-full">
              <div className="flex flex-wrap gap-2">
                {severityOptions.map((sev) => (
                  <button
                    key={sev.value}
                    type="button"
                    onClick={() => setSelectedSeverity(sev.value)}
                    className={[
                      'inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-input border px-3 text-[13px] transition-colors',
                      selectedSeverity === sev.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border-color bg-surface-1 text-text-secondary hover:border-border-color-hover hover:text-text-primary',
                    ].join(' ')}
                  >
                    <span className={`h-2 w-2 rounded-full ${sev.dot}`} />
                    {sev.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="规则描述" className="col-span-full">
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                placeholder="请输入规则描述..."
                className="app-textarea"
              />
            </Field>
          </div>
        )}

        {/* ═══ 数据源 ═══ */}
        {activeTab === 'datasource' && (
          <RuleDataSourceTab
            selectedDataSources={selectedDataSources}
            onChange={setSelectedDataSources}
          />
        )}

        {/* ═══ 检测条件 ═══ */}
        {activeTab === 'condition' && (
          <div className="flex flex-col gap-4">
            {legacyContent && (
              <div className="callout callout-warning">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[12.5px] font-medium">
                    该规则的原始内容不是单事件条件格式（可能是 Sigma / YARA 或旧的关联、时序格式）
                  </div>
                  <p className="mt-1 text-caption text-text-muted">
                    保存后会被替换为下面的单事件条件。如需保留原内容，请先复制。
                  </p>
                  <pre className="mt-2 max-h-24 overflow-auto rounded-input border border-border-color bg-surface-2 p-2 font-mono text-[11px] text-text-muted scrollbar-thin">
                    {legacyContent.slice(0, 800)}
                  </pre>
                </div>
              </div>
            )}
            <RuleConditionTab
              selectedDataSources={selectedDataSources}
              dataSources={dataSources}
              conditions={conditions}
              timeWindow={timeWindow}
              timeUnit={timeUnit}
              threshold={threshold}
              groupBy={groupBy}
              onConditionsChange={setConditions}
              onTimeWindowChange={setTimeWindow}
              onTimeUnitChange={setTimeUnit}
              onThresholdChange={setThreshold}
              onGroupByChange={setGroupBy}
            />
          </div>
        )}

        {/* ═══ 响应动作 ═══ */}
        {activeTab === 'action' && (
          <div className="flex flex-col gap-5">
            <Field
              label="关联剧本"
              help="选择规则触发时要执行的剧本编排，可从剧本库中选择已发布的剧本"
            >
              <select
                value={selectedPlaybookId || ''}
                onChange={(e) => setSelectedPlaybookId(e.target.value || null)}
                className="app-select"
              >
                <option value="">不关联剧本</option>
                {playbooks.map((pb) => (
                  <option key={pb.id} value={String(pb.id)}>
                    {pb.name}{pb.triggerType ? ` (${pb.triggerType})` : ''}
                  </option>
                ))}
              </select>
            </Field>

            {selectedPlaybook && (
              <div className="callout callout-info">
                <Workflow size={14} className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[12.5px] font-medium">已选择剧本：{selectedPlaybook.name}</div>
                  <p className="mt-0.5 text-caption text-text-muted">当规则触发时，将自动执行此剧本进行响应处置</p>
                </div>
              </div>
            )}

            {playbooks.length === 0 && (
              <p className="text-caption text-text-muted">暂无可用的剧本，请先在「响应剧本」中创建并发布剧本</p>
            )}

            <div className="border-t border-border-color pt-4">
              <h4 className="mb-3 text-[13px] font-medium text-text-primary">规则测试</h4>
              <RuleTestPanel
                ruleId={editingRule?.id || ''}
                isTesting={isTesting}
                testResult={testResult}
                onTest={handleTest}
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
