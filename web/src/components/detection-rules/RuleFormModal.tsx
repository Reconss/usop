import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, Database, Code, AlertTriangle, Workflow, Loader2, PlusCircle, CheckCircle2, TrashIcon, Info } from 'lucide-react';
import RuleConditionTab from './RuleConditionTab';
import RuleDataSourceTab from './RuleDataSourceTab';
import RuleTestPanel from './RuleTestPanel';
import { rulesApi } from '../../services/api';
import {
  DetectionRule, RuleType, Condition, FormTab,
  CorrelationGroup, SequenceStep
} from '../../types/detection-rules';

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
  { value: 'critical', label: '危急', color: '#F2545B' },
  { value: 'high', label: '高危', color: '#FF9A3C' },
  { value: 'medium', label: '中危', color: '#FFD166' },
  { value: 'low', label: '低危', color: '#3B82F6' }
];

let groupIdCounter = 0;
const newGroupId = () => `group-${++groupIdCounter}-${Date.now()}`;
let stepIdCounter = 0;
const newStepId = () => `step-${++stepIdCounter}-${Date.now()}`;

export default function RuleFormModal({ editingRule, dataSources, playbooks, onSave, onClose }: Props) {
  const [formData, setFormData] = useState<Partial<DetectionRule>>({ name: '', type: 'single', description: '', status: 'disabled' });
  const [selectedSeverity, setSelectedSeverity] = useState('medium');
  const [selectedDataSources, setSelectedDataSources] = useState<string[]>([]);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string | number | null>(null);
  const [activeTab, setActiveTab] = useState<FormTab>('basic');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  // 单事件状态
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [timeWindow, setTimeWindow] = useState(5);
  const [timeUnit, setTimeUnit] = useState('minutes');
  const [threshold, setThreshold] = useState(5);
  const [groupBy, setGroupBy] = useState('');

  // 关联规则状态
  const [groups, setGroups] = useState<CorrelationGroup[]>([]);
  const [groupLogic, setGroupLogic] = useState<'AND' | 'OR'>('AND');
  const [overallTimeWindow, setOverallTimeWindow] = useState('30 minutes');

  // 时序规则状态
  const [steps, setSteps] = useState<SequenceStep[]>([]);
  const [maxSpan, setMaxSpan] = useState('60 minutes');

  // 初始化/编辑时填充
  useEffect(() => {
    if (editingRule) {
      setFormData({ ...editingRule });
      setSelectedSeverity(editingRule.severity || 'medium');
      setSelectedDataSources((editingRule.dataSourceIds || []).map(id => String(id)));
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
    setGroups([]); setGroupLogic('AND'); setOverallTimeWindow('30 minutes');
    setSteps([]); setMaxSpan('60 minutes');
    setTestResult(null);
  };

  const parseRuleContent = (content: string) => {
    resetEditors();
    if (!content) return;
    try {
      const parsed = JSON.parse(content);

      // version 2: 根据是否有 groups/steps 判断类型
      if (parsed.groups) {
        setGroups(parsed.groups);
        setGroupLogic(parsed.group_logic || 'AND');
        setOverallTimeWindow(parsed.overall_time_window || '30 minutes');
        setThreshold(parsed.threshold || 1);
        return;
      }
      if (parsed.steps) {
        setSteps(parsed.steps);
        setMaxSpan(parsed.max_span || '60 minutes');
        setThreshold(parsed.threshold || 1);
        return;
      }

      // version 1 (旧格式): 单事件
      setConditions(parsed.conditions || []);
      setGroupBy(parsed.group_by || '');
      setThreshold(parsed.threshold || 5);
      if (parsed.time_window) {
        const match = parsed.time_window.match(/(\d+)\s*(\w+)/);
        if (match) {
          setTimeWindow(parseInt(match[1]));
          const unit = match[2];
          if (unit.startsWith('hour')) setTimeUnit('hours');
          else if (unit.startsWith('day')) setTimeUnit('days');
          else setTimeUnit('minutes');
        }
      }
    } catch {
      // 非 JSON 格式，重置
    }
  };

  const buildRuleContent = (): string => {
    const ruleType = formData.type || 'single';
    const base = { version: 2, severity: selectedSeverity, title_template: `规则 ${formData.name || '未命名'} 触发` };

    if (ruleType === 'correlation') {
      return JSON.stringify({
        ...base,
        groups: groups.filter(g => g.conditions.some(c => c.field && c.value)).map(g => ({
          id: g.id, label: g.label,
          data_source_ids: g.data_source_ids,
          conditions: g.conditions.filter(c => c.field && c.value),
          time_window: g.time_window
        })),
        group_logic: groupLogic,
        overall_time_window: overallTimeWindow,
        threshold
      }, null, 2);
    }

    if (ruleType === 'sequence') {
      return JSON.stringify({
        ...base,
        steps: steps.filter(s => s.conditions.some(c => c.field && c.value)).map(s => ({
          id: s.id, label: s.label, order: s.order,
          data_source_ids: s.data_source_ids,
          conditions: s.conditions.filter(c => c.field && c.value),
          time_window: s.time_window,
          required: s.required
        })),
        max_span: maxSpan,
        threshold
      }, null, 2);
    }

    // single
    return JSON.stringify({
      ...base,
      conditions: conditions.filter(c => c.field && c.value),
      time_window: `${timeWindow} ${timeUnit}`,
      threshold,
      ...(groupBy ? { group_by: groupBy } : {}),
      aggregation: 'count'
    }, null, 2);
  };

  const handleSave = async () => {
    if (!formData.name) return;
    setIsSaving(true);
    try {
      const ruleData: Record<string, any> = {
        name: formData.name,
        type: formData.type || 'single',
        description: formData.description,
        severity: selectedSeverity,
        data_source_ids: selectedDataSources.filter(Boolean),
        playbook_id: selectedPlaybookId || null,
        status: formData.status || 'disabled',
        rule_content: buildRuleContent(),
        rule_language: 'sigma'
      };
      await onSave(ruleData);
    } catch (e) {
      console.error('Save failed:', e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!editingRule && !formData.name) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const ruleId = editingRule?.id;
      if (!ruleId) {
        showToast('请先保存规则再测试', 'error');
        return;
      }
      const res = await rulesApi.testRule(ruleId) as any;
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

  const showToast = (msg: string, type: 'success' | 'error') => {
    // parent handles toast
  };

  const tabs = [
    { id: 'basic' as FormTab, label: '基本信息', icon: FileText },
    { id: 'datasource' as FormTab, label: '数据源', icon: Database },
    { id: 'condition' as FormTab, label: '检测条件', icon: Code },
    { id: 'action' as FormTab, label: '响应动作', icon: AlertTriangle }
  ];

  const handleTypeChange = (newType: string) => {
    setFormData({ ...formData, type: newType as RuleType });
    // 切换类型时重置不兼容的编辑器状态
    setConditions([]);
    setGroups([]);
    setSteps([]);
    // 自动切换到检测条件标签页
    setActiveTab('condition');
  };

  // 获取规则类型描述
  const getRuleTypeDescription = (type: string) => {
    const descriptions: Record<string, string> = {
      single: '基于单个事件的简单检测规则，适用于基础告警场景',
      correlation: '基于多个事件关联的复杂检测规则，适用于高级威胁检测',
      sequence: '基于事件时序的检测规则，适用于攻击链分析'
    };
    return descriptions[type] || '';
  };

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
        <div className="glass-card rounded-xl p-0 w-[720px] pointer-events-auto max-h-[90vh] overflow-hidden"
          onClick={e => e.stopPropagation()}>
          {/* 标题 */}
          <div className="flex items-center justify-between p-6 border-b border-border-color">
            <h2 className="text-xl font-semibold text-text-primary">{editingRule ? '编辑规则' : '新建规则'}</h2>
            <button onClick={onClose} className="p-2 text-text-secondary hover:text-text-primary transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tab 导航 */}
          <div className="flex border-b border-border-color overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                    activeTab === tab.id ? 'text-primary border-b-2 border-primary' : 'text-text-secondary hover:text-text-primary'
                  }`}>
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* 内容 */}
          <div className="p-6 max-h-[55vh] overflow-auto">
            {/* ═══ 基本信息 ═══ */}
            {activeTab === 'basic' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-text-secondary text-sm mb-2">规则名称</label>
                  <input type="text" value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="请输入规则名称"
                    className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="block text-text-secondary text-sm mb-2">规则类型</label>
                  <select value={formData.type}
                    onChange={(e) => handleTypeChange(e.target.value)}
                    className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none">
                    <option value="single">单事件规则</option>
                    <option value="correlation">关联规则</option>
                    <option value="sequence">时序规则</option>
                  </select>
                  {formData.type && (
                    <div className="mt-2 flex items-start gap-2 p-2 bg-primary/5 rounded-lg border border-primary/10">
                      <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-text-secondary">{getRuleTypeDescription(formData.type)}</p>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-text-secondary text-sm mb-2">严重等级</label>
                  <div className="flex gap-2">
                    {severityOptions.map((sev) => (
                      <button key={sev.value} type="button" onClick={() => setSelectedSeverity(sev.value)}
                        className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-all hover:border-primary ${
                          selectedSeverity === sev.value ? 'border-primary bg-primary/10 text-primary' : 'border-border-color text-text-secondary hover:bg-white/5'
                        }`}>
                        <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: sev.color }} />
                        {sev.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-text-secondary text-sm mb-2">规则描述</label>
                  <textarea value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3} placeholder="请输入规则描述..."
                    className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none resize-none" />
                </div>
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
              <RuleConditionTab
                ruleType={(formData.type || 'single') as RuleType}
                selectedDataSources={selectedDataSources}
                dataSources={dataSources}
                conditions={conditions}
                timeWindow={timeWindow}
                timeUnit={timeUnit}
                threshold={threshold}
                groupBy={groupBy}
                groups={groups}
                groupLogic={groupLogic}
                overallTimeWindow={overallTimeWindow}
                steps={steps}
                maxSpan={maxSpan}
                onConditionsChange={setConditions}
                onTimeWindowChange={setTimeWindow}
                onTimeUnitChange={setTimeUnit}
                onThresholdChange={setThreshold}
                onGroupByChange={setGroupBy}
                onGroupsChange={setGroups}
                onGroupLogicChange={setGroupLogic}
                onOverallTimeWindowChange={setOverallTimeWindow}
                onStepsChange={setSteps}
                onMaxSpanChange={setMaxSpan}
              />
            )}

            {/* ═══ 响应动作 ═══ */}
            {activeTab === 'action' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-text-secondary text-sm mb-2">关联剧本</label>
                  <div className="bg-page-bg rounded-lg border border-border-color p-4">
                    <p className="text-xs text-text-muted mb-3">选择规则触发时要执行的剧本编排，可从剧本库中选择已发布的剧本</p>
                    <select value={selectedPlaybookId || ''}
                      onChange={(e) => setSelectedPlaybookId(e.target.value || null)}
                      className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none">
                      <option value="">不关联剧本</option>
                      {playbooks.map((pb) => (
                        <option key={pb.id} value={String(pb.id)}>{pb.name} {pb.triggerType ? `(${pb.triggerType})` : ''}</option>
                      ))}
                    </select>
                    {selectedPlaybookId && (
                      <div className="mt-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
                        <div className="flex items-center gap-2 text-sm text-primary">
                          <Workflow className="w-4 h-4" />
                          <span>已选择剧本：{playbooks.find(p => String(p.id) === String(selectedPlaybookId))?.name}</span>
                        </div>
                        <p className="text-xs text-text-muted mt-1">当规则触发时，将自动执行此剧本进行响应处置</p>
                      </div>
                    )}
                    {playbooks.length === 0 && (
                      <p className="text-xs text-text-muted mt-2">暂无可用的剧本，请先在「响应剧本」中创建并发布剧本</p>
                    )}
                  </div>
                </div>
                {/* 测试面板 */}
                <div className="border-t border-border-color pt-4">
                  <h4 className="text-sm font-medium text-text-primary mb-3">规则测试</h4>
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

          {/* 底部按钮 */}
          <div className="flex justify-end gap-3 p-6 border-t border-border-color">
            <button onClick={onClose} className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors">取消</button>
            <button onClick={handleSave} disabled={!formData.name || isSaving}
              className="px-4 py-2 bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2">
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingRule ? '保存' : '创建'}
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}
