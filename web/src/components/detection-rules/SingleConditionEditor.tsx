import React from 'react';
import { PlusCircle, Database, Clock, Filter, Target, Info } from 'lucide-react';
import ConditionRow from './ConditionRow';
import { Condition } from '../../types/detection-rules';

interface Props {
  conditions: Condition[];
  selectedDataSources: (string | number)[];
  dataSources: { id: string | number; name: string }[];
  timeWindow: number;
  timeUnit: string;
  threshold: number;
  groupBy: string;
  onConditionsChange: (c: Condition[]) => void;
  onTimeWindowChange: (v: number) => void;
  onTimeUnitChange: (v: string) => void;
  onThresholdChange: (v: number) => void;
  onGroupByChange: (v: string) => void;
}

export default function SingleConditionEditor({
  conditions, selectedDataSources, dataSources,
  timeWindow, timeUnit, threshold, groupBy,
  onConditionsChange, onTimeWindowChange, onTimeUnitChange,
  onThresholdChange, onGroupByChange
}: Props) {
  const addCondition = () => {
    onConditionsChange([...conditions, { field: 'action', operator: 'equals', value: '' }]);
  };

  const updateCondition = (index: number, key: keyof Condition, val: string) => {
    onConditionsChange(conditions.map((c, i) => i === index ? { ...c, [key]: val } : c));
  };

  const removeCondition = (index: number) => {
    onConditionsChange(conditions.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-5">
      {/* 规则说明 */}
      <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-lg">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
            <Target className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h4 className="text-sm font-medium text-blue-700">单事件规则</h4>
            <p className="text-xs text-blue-600/70 mt-1">
              检测单个事件是否满足所有条件。当事件在指定时间窗口内出现次数达到阈值时触发。
              所有条件之间为 AND 关系（必须同时满足）。
            </p>
          </div>
        </div>
      </div>

      {/* 关联数据源提示 */}
      <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/20">
        <Database className="w-4 h-4 text-primary" />
        <span className="text-sm text-text-primary">
          {selectedDataSources.length > 0 ? (
            <>
              检测范围：已关联 <strong>{selectedDataSources.length}</strong> 个数据源
              <span className="text-text-muted ml-1">
                ({selectedDataSources.map(id => dataSources.find(s => String(s.id) === String(id))?.name).filter(Boolean).join(', ')})
              </span>
            </>
          ) : (
            '请先在「数据源」标签页中选择要监控的数据源'
          )}
        </span>
      </div>

      {/* 条件编辑器 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-text-primary flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-primary" />
            检测条件
          </label>
          <button onClick={addCondition}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary-hover transition-colors">
            <PlusCircle className="w-3.5 h-3.5" /> 添加条件
          </button>
        </div>
        {selectedDataSources.length === 0 && (
          <div className="text-center py-6 text-text-muted text-sm border border-dashed border-border-color rounded-lg bg-amber-50/30">
            <Database className="w-8 h-8 mx-auto mb-2 opacity-40" />
            请先选择数据源
          </div>
        )}
        <div className="space-y-2">
          {conditions.length === 0 && selectedDataSources.length > 0 && (
            <div className="text-center py-6 text-text-muted text-sm border border-dashed border-border-color rounded-lg">
              暂无条件，点击「添加条件」开始配置
            </div>
          )}
          {conditions.map((cond, i) => (
            <ConditionRow
              key={i}
              field={cond.field}
              operator={cond.operator}
              value={cond.value}
              dataSourceId={cond.dataSourceId}
              selectedDataSources={selectedDataSources}
              dataSources={selectedDataSources.length > 1 ? dataSources : undefined}
              onFieldChange={v => updateCondition(i, 'field', v)}
              onOperatorChange={v => updateCondition(i, 'operator', v)}
              onValueChange={v => updateCondition(i, 'value', v)}
              onDataSourceChange={v => updateCondition(i, 'dataSourceId', v)}
              onRemove={() => removeCondition(i)}
              onAdd={addCondition}
            />
          ))}
        </div>
      </div>

      {/* 时间窗口 & 阈值 */}
      <div className="p-4 bg-page-bg rounded-lg border border-border-color">
        <h4 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-primary" />
          聚合配置
        </h4>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-text-secondary text-xs mb-1.5">时间窗口</label>
            <input type="number" value={timeWindow} min={1}
              onChange={e => onTimeWindowChange(Number(e.target.value))}
              className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none" />
          </div>
          <div>
            <label className="block text-text-secondary text-xs mb-1.5">时间单位</label>
            <select value={timeUnit}
              onChange={e => onTimeUnitChange(e.target.value)}
              className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none">
              <option value="minutes">分钟</option>
              <option value="hours">小时</option>
              <option value="days">天</option>
            </select>
          </div>
          <div>
            <label className="block text-text-secondary text-xs mb-1.5">触发阈值</label>
            <input type="number" value={threshold} min={1}
              onChange={e => onThresholdChange(Number(e.target.value))}
              className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none" />
          </div>
          <div>
            <label className="block text-text-secondary text-xs mb-1.5">聚合字段（可选）</label>
            <input type="text" value={groupBy}
              onChange={e => onGroupByChange(e.target.value)}
              placeholder="如 src_ip"
              className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none" />
          </div>
        </div>
        <p className="text-xs text-text-muted mt-2">
          当满足条件的日志在 {timeWindow} {timeUnit === 'minutes' ? '分钟' : timeUnit === 'hours' ? '小时' : '天'} 内出现 {threshold} 次以上时触发
          {groupBy ? `，按 ${groupBy} 字段分组统计` : ''}
        </p>
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
              conditions: conditions.filter(c => c.field && c.value).map(c => ({
                ...c,
                ...(c.dataSourceId ? { data_source_id: c.dataSourceId } : {})
              })),
              time_window: `${timeWindow} ${timeUnit}`,
              threshold,
              ...(groupBy ? { group_by: groupBy } : {}),
              aggregation: 'count'
            }, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}
