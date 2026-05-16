import React from 'react';
import { PlusCircle, Trash2, ArrowDown, ArrowUp, ArrowRight, Layers, Clock, GitBranch } from 'lucide-react';
import ConditionRow from './ConditionRow';
import { SequenceStep, Condition } from '../../types/detection-rules';

interface Props {
  steps: SequenceStep[];
  maxSpan: string;
  threshold: number;
  selectedDataSources: (string | number)[];
  dataSources: { id: string | number; name: string }[];
  onStepsChange: (s: SequenceStep[]) => void;
  onMaxSpanChange: (v: string) => void;
  onThresholdChange: (v: number) => void;
}

let stepIdCounter = 0;
const newStepId = () => `step-${++stepIdCounter}-${Date.now()}`;

export default function SequenceConditionEditor({
  steps, maxSpan, threshold, selectedDataSources, dataSources,
  onStepsChange, onMaxSpanChange, onThresholdChange
}: Props) {
  const addStep = () => {
    const order = steps.length + 1;
    onStepsChange([...steps, {
      id: newStepId(),
      label: `步骤 ${order}`,
      order,
      data_source_ids: [],
      conditions: [{ field: 'action', operator: 'equals', value: '' }],
      time_window: '5 minutes',
      required: true
    }]);
  };

  const removeStep = (id: string) => {
    const filtered = steps.filter(s => s.id !== id);
    onStepsChange(filtered.map((s, i) => ({ ...s, order: i + 1 })));
  };

  const updateStep = (id: string, key: string, val: any) => {
    onStepsChange(steps.map(s => s.id === id ? { ...s, [key]: val } : s));
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const newSteps = [...steps];
    const target = index + direction;
    if (target < 0 || target >= newSteps.length) return;
    [newSteps[index], newSteps[target]] = [newSteps[target], newSteps[index]];
    onStepsChange(newSteps.map((s, i) => ({ ...s, order: i + 1 })));
  };

  const updateStepCondition = (stepId: string, index: number, key: keyof Condition, val: string) => {
    onStepsChange(steps.map(s =>
      s.id === stepId ? {
        ...s,
        conditions: s.conditions.map((c, i) => i === index ? { ...c, [key]: val } : c)
      } : s
    ));
  };

  const addStepCondition = (stepId: string) => {
    onStepsChange(steps.map(s =>
      s.id === stepId ? {
        ...s,
        conditions: [...s.conditions, { field: 'action', operator: 'equals', value: '' }]
      } : s
    ));
  };

  const removeStepCondition = (stepId: string, index: number) => {
    onStepsChange(steps.map(s =>
      s.id === stepId ? {
        ...s,
        conditions: s.conditions.filter((_, i) => i !== index)
      } : s
    ));
  };

  const toggleDsInStep = (stepId: string, dsId: string) => {
    onStepsChange(steps.map(s => {
      if (s.id !== stepId) return s;
      const exists = s.data_source_ids.includes(dsId);
      return {
        ...s,
        data_source_ids: exists
          ? s.data_source_ids.filter(id => id !== dsId)
          : [...s.data_source_ids, dsId]
      };
    }));
  };

  return (
    <div className="space-y-5">
      {/* 规则说明 */}
      <div className="p-4 bg-orange-50/50 border border-orange-200 rounded-lg">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
            <GitBranch className="w-4 h-4 text-orange-600" />
          </div>
          <div>
            <h4 className="text-sm font-medium text-orange-700">时序规则</h4>
            <p className="text-xs text-orange-600/70 mt-1">
              按步骤顺序检测事件序列，要求事件按指定顺序依次出现且发生在最大时间跨度内。
              适合检测攻击链、横向移动等多步骤攻击行为。
            </p>
          </div>
        </div>
      </div>

      {/* 步骤序列可视化 */}
      {steps.length > 0 && (
        <div className="flex items-center gap-1 p-3 bg-page-bg rounded-lg border border-border-color overflow-x-auto">
          {steps.map((step, si) => (
            <React.Fragment key={step.id}>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap ${
                step.required ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'bg-card-bg text-text-secondary border border-border-color'
              }`}>
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-current/10 text-[10px] font-bold">
                  {step.order}
                </span>
                {step.label}
                {step.required && <span className="text-[10px] opacity-70">必需</span>}
              </div>
              {si < steps.length - 1 && (
                <ArrowRight className="w-4 h-4 text-text-muted flex-shrink-0" />
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* 步骤列表 */}
      <div className="space-y-4">
        {steps.length === 0 && (
          <div className="text-center py-8 text-text-muted border border-dashed border-border-color rounded-lg">
            <GitBranch className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">暂未配置步骤，点击下方按钮添加检测步骤</p>
            <p className="text-xs text-text-muted mt-1">每个步骤代表攻击链中的一个阶段</p>
          </div>
        )}
        {steps.map((step, si) => (
          <div key={step.id} className="border border-orange-200/50 rounded-lg bg-orange-50/10">
            {/* 步骤头 */}
            <div className="flex items-center justify-between p-3 bg-orange-50/30 rounded-t-lg border-b border-orange-200/50">
              <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 text-white text-xs font-bold shadow-sm">
                  {step.order}
                </span>
                <input type="text" value={step.label}
                  onChange={e => updateStep(step.id, 'label', e.target.value)}
                  className="text-sm font-medium text-text-primary bg-transparent border-b border-transparent hover:border-orange-300 focus:border-orange-500 focus:outline-none"
                  placeholder="步骤名称" />
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100/50 text-orange-600">
                  {step.conditions.filter(c => c.field && c.value).length} 个条件
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => moveStep(si, -1)} disabled={si === 0}
                  className="p-1 text-text-muted hover:text-text-primary disabled:opacity-30 transition-colors">
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => moveStep(si, 1)} disabled={si === steps.length - 1}
                  className="p-1 text-text-muted hover:text-text-primary disabled:opacity-30 transition-colors">
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => removeStep(step.id)}
                  className="p-1.5 text-text-muted hover:text-critical transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {/* 步骤配置 */}
            <div className="p-3 space-y-3">
              {/* 数据源选择 */}
              <div>
                <label className="text-xs text-text-muted block mb-1.5">监控数据源</label>
                <div className="flex flex-wrap gap-2">
                  {dataSources.map(ds => {
                    const selected = step.data_source_ids.includes(String(ds.id));
                    return (
                      <button key={ds.id}
                        onClick={() => toggleDsInStep(step.id, String(ds.id))}
                        className={`px-2.5 py-1 text-xs rounded-lg border transition-all ${
                          selected ? 'bg-orange-100 border-orange-300 text-orange-700 font-medium' : 'border-border-color text-text-muted hover:border-orange-300'
                        }`}>
                        {ds.name}
                      </button>
                    );
                  })}
                </div>
                {step.data_source_ids.length === 0 && (
                  <p className="text-[10px] text-text-muted mt-1">未选择数据源则继承全局选择</p>
                )}
              </div>
              {/* 步骤时间窗口 & 是否必需 */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-text-muted" />
                  <label className="text-xs text-text-muted">步骤时间窗口:</label>
                  <input type="text" value={step.time_window}
                    onChange={e => updateStep(step.id, 'time_window', e.target.value)}
                    className="px-2 py-1 bg-card-bg border border-border-color rounded text-xs text-text-primary focus:border-orange-500 focus:outline-none w-28"
                    placeholder="5 minutes" />
                </div>
                <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer">
                  <input type="checkbox" checked={step.required}
                    onChange={e => updateStep(step.id, 'required', e.target.checked)}
                    className="rounded border-border-color text-orange-500" />
                  必需步骤
                </label>
              </div>
              {/* 条件 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-text-muted">检测条件</label>
                  <button onClick={() => addStepCondition(step.id)}
                    className="text-xs text-orange-600 hover:text-orange-700 font-medium">
                    + 添加条件
                  </button>
                </div>
                <div className="space-y-2">
                  {step.conditions.map((cond, ci) => (
                    <ConditionRow
                      key={ci}
                      field={cond.field}
                      operator={cond.operator}
                      value={cond.value}
                      selectedDataSources={step.data_source_ids.length > 0 ? step.data_source_ids : [...selectedDataSources]}
                      dataSources={dataSources}
                      onFieldChange={v => updateStepCondition(step.id, ci, 'field', v)}
                      onOperatorChange={v => updateStepCondition(step.id, ci, 'operator', v)}
                      onValueChange={v => updateStepCondition(step.id, ci, 'value', v)}
                      onRemove={() => removeStepCondition(step.id, ci)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 添加步骤 */}
      <button onClick={addStep}
        className="w-full py-3 border-2 border-dashed border-orange-300/50 rounded-lg text-sm text-text-muted hover:text-orange-600 hover:border-orange-400 transition-colors flex items-center justify-center gap-2">
        <PlusCircle className="w-4 h-4" /> 添加检测步骤
      </button>

      {/* 全局配置 */}
      <div className="grid grid-cols-2 gap-4 p-4 bg-page-bg rounded-lg border border-border-color">
        <div>
          <label className="block text-text-secondary text-xs mb-1.5">最大时间跨度</label>
          <input type="text" value={maxSpan}
            onChange={e => onMaxSpanChange(e.target.value)}
            className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary focus:border-orange-500 focus:outline-none"
            placeholder="60 minutes" />
          <p className="text-[10px] text-text-muted mt-1">首个和末个步骤之间的最大允许时间</p>
        </div>
        <div>
          <label className="block text-text-secondary text-xs mb-1.5">触发阈值</label>
          <input type="number" value={threshold} min={1}
            onChange={e => onThresholdChange(Number(e.target.value))}
            className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary focus:border-orange-500 focus:outline-none" />
        </div>
      </div>

      {/* JSON 预览 */}
      <div className="border-t border-border-color pt-3">
        <details className="group">
          <summary className="text-xs text-text-muted cursor-pointer hover:text-text-secondary select-none">
            查看规则 JSON
          </summary>
          <pre className="mt-2 w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-text-muted font-mono text-xs overflow-auto max-h-32">
            {JSON.stringify({
              version: 2,
              steps: steps.filter(s => s.conditions.some(c => c.field && c.value)).map(s => ({
                id: s.id,
                label: s.label,
                order: s.order,
                data_source_ids: s.data_source_ids,
                conditions: s.conditions.filter(c => c.field && c.value),
                time_window: s.time_window,
                required: s.required
              })),
              max_span: maxSpan,
              threshold
            }, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}
