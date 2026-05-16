import React from 'react';
import { PlusCircle, Trash2, X, Layers, Clock } from 'lucide-react';
import ConditionRow from './ConditionRow';
import { CorrelationGroup, Condition } from '../../types/detection-rules';

interface Props {
  groups: CorrelationGroup[];
  groupLogic: 'AND' | 'OR';
  overallTimeWindow: string;
  threshold: number;
  thresholdEnabled: boolean;
  selectedDataSources: (string | number)[];
  dataSources: { id: string | number; name: string }[];
  onGroupsChange: (g: CorrelationGroup[]) => void;
  onGroupLogicChange: (v: 'AND' | 'OR') => void;
  onOverallTimeWindowChange: (v: string) => void;
  onThresholdChange: (v: number) => void;
}

let groupIdCounter = 0;
const newGroupId = () => `group-${++groupIdCounter}-${Date.now()}`;

export default function CorrelationConditionEditor({
  groups, groupLogic, overallTimeWindow, threshold, thresholdEnabled,
  selectedDataSources, dataSources,
  onGroupsChange, onGroupLogicChange, onOverallTimeWindowChange, onThresholdChange
}: Props) {
  const addGroup = () => {
    onGroupsChange([...groups, {
      id: newGroupId(),
      label: `条件组 ${groups.length + 1}`,
      data_source_ids: [],
      conditions: [{ field: 'action', operator: 'equals', value: '' }],
      time_window: '10 minutes',
      logical_operator: 'AND'
    }]);
  };

  const removeGroup = (id: string) => {
    onGroupsChange(groups.filter(g => g.id !== id));
  };

  const updateGroup = (id: string, key: string, val: any) => {
    onGroupsChange(groups.map(g => g.id === id ? { ...g, [key]: val } : g));
  };

  const updateGroupCondition = (groupId: string, index: number, key: keyof Condition, val: string) => {
    onGroupsChange(groups.map(g =>
      g.id === groupId ? {
        ...g,
        conditions: g.conditions.map((c, i) => i === index ? { ...c, [key]: val } : c)
      } : g
    ));
  };

  const addGroupCondition = (groupId: string) => {
    onGroupsChange(groups.map(g =>
      g.id === groupId ? {
        ...g,
        conditions: [...g.conditions, { field: 'action', operator: 'equals', value: '' }]
      } : g
    ));
  };

  const removeGroupCondition = (groupId: string, index: number) => {
    onGroupsChange(groups.map(g =>
      g.id === groupId ? {
        ...g,
        conditions: g.conditions.filter((_, i) => i !== index)
      } : g
    ));
  };

  const toggleDsInGroup = (groupId: string, dsId: string) => {
    onGroupsChange(groups.map(g => {
      if (g.id !== groupId) return g;
      const exists = g.data_source_ids.includes(dsId);
      return {
        ...g,
        data_source_ids: exists
          ? g.data_source_ids.filter(id => id !== dsId)
          : [...g.data_source_ids, dsId]
      };
    }));
  };

  return (
    <div className="space-y-5">
      {/* 规则说明 */}
      <div className="p-4 bg-purple-50/50 border border-purple-200 rounded-lg">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
            <Layers className="w-4 h-4 text-purple-600" />
          </div>
          <div>
            <h4 className="text-sm font-medium text-purple-700">关联规则</h4>
            <p className="text-xs text-purple-600/70 mt-1">
              将多个条件分组，不同组检测不同维度的事件。组间支持 AND（全部匹配）或 OR（任一匹配）逻辑，
              适合检测需要多维度关联分析的攻击行为。
            </p>
          </div>
        </div>
      </div>

      {/* 组间逻辑 */}
      <div className="flex items-center gap-3 p-3 bg-purple-50/30 rounded-lg border border-purple-200/50">
        <span className="text-sm text-text-secondary">组间逻辑：</span>
        <div className="flex gap-1">
          <button type="button"
            onClick={() => onGroupLogicChange('AND')}
            className={`px-3 py-1 text-xs rounded font-medium ${groupLogic === 'AND' ? 'bg-purple-600 text-white shadow-sm' : 'bg-card-bg text-text-secondary border border-border-color'}`}>
            AND 全部匹配
          </button>
          <button type="button"
            onClick={() => onGroupLogicChange('OR')}
            className={`px-3 py-1 text-xs rounded font-medium ${groupLogic === 'OR' ? 'bg-purple-600 text-white shadow-sm' : 'bg-card-bg text-text-secondary border border-border-color'}`}>
            OR 任一匹配
          </button>
        </div>
        <span className="text-xs text-text-muted ml-auto">{groups.length} 个条件组</span>
      </div>

      {/* 条件组列表 */}
      <div className="space-y-4">
        {groups.length === 0 && (
          <div className="text-center py-8 text-text-muted border border-dashed border-border-color rounded-lg">
            <Layers className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">暂无条件组，点击下方按钮添加</p>
            <p className="text-xs text-text-muted mt-1">每个条件组可独立选择数据源和设置时间窗口</p>
          </div>
        )}
        {groups.map((group, gi) => (
          <div key={group.id} className="border border-purple-200/50 rounded-lg bg-purple-50/20">
            {/* 组头 */}
            <div className="flex items-center justify-between p-3 bg-purple-50/50 rounded-t-lg border-b border-purple-200/50">
              <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs font-bold">G{gi + 1}</span>
                <input type="text" value={group.label}
                  onChange={e => updateGroup(group.id, 'label', e.target.value)}
                  className="text-sm font-medium text-text-primary bg-transparent border-b border-transparent hover:border-purple-300 focus:border-purple-500 focus:outline-none"
                  placeholder="条件组名称" />
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100/50 text-purple-600">
                  {group.conditions.filter(c => c.field && c.value).length} 个条件
                </span>
              </div>
              <button onClick={() => removeGroup(group.id)}
                className="p-1.5 text-text-muted hover:text-critical transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            {/* 组配置 */}
            <div className="p-3 space-y-3">
              {/* 组内数据源选择 */}
              <div>
                <label className="text-xs text-text-muted block mb-1.5">监控数据源</label>
                <div className="flex flex-wrap gap-2">
                  {dataSources.map(ds => {
                    const selected = group.data_source_ids.includes(String(ds.id));
                    return (
                      <button key={ds.id}
                        onClick={() => toggleDsInGroup(group.id, String(ds.id))}
                        className={`px-2.5 py-1 text-xs rounded-lg border transition-all ${
                          selected ? 'bg-purple-100 border-purple-300 text-purple-700 font-medium' : 'border-border-color text-text-muted hover:border-purple-300'
                        }`}>
                        {ds.name}
                      </button>
                    );
                  })}
                </div>
                {group.data_source_ids.length === 0 && (
                  <p className="text-[10px] text-text-muted mt-1">未选择数据源则继承全局选择</p>
                )}
              </div>
              {/* 组时间窗口 */}
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-text-muted" />
                <label className="text-xs text-text-muted">时间窗口:</label>
                <input type="text" value={group.time_window}
                  onChange={e => updateGroup(group.id, 'time_window', e.target.value)}
                  className="px-2 py-1 bg-card-bg border border-border-color rounded text-xs text-text-primary focus:border-purple-500 focus:outline-none w-32"
                  placeholder="5 minutes" />
              </div>
              {/* 组内条件 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-text-muted">检测条件</label>
                  <button onClick={() => addGroupCondition(group.id)}
                    className="text-xs text-purple-600 hover:text-purple-700 font-medium">
                    + 添加条件
                  </button>
                </div>
              <div className="space-y-2">
                {group.conditions.map((cond, ci) => (
                  <ConditionRow
                    key={ci}
                    field={cond.field}
                    operator={cond.operator}
                    value={cond.value}
                    selectedDataSources={group.data_source_ids.length > 0 ? group.data_source_ids : [...selectedDataSources]}
                    dataSources={dataSources}
                    onFieldChange={v => updateGroupCondition(group.id, ci, 'field', v)}
                    onOperatorChange={v => updateGroupCondition(group.id, ci, 'operator', v)}
                    onValueChange={v => updateGroupCondition(group.id, ci, 'value', v)}
                    onRemove={() => removeGroupCondition(group.id, ci)}
                  />
                ))}
              </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 添加组按钮 */}
      <button onClick={addGroup}
        className="w-full py-3 border-2 border-dashed border-purple-300/50 rounded-lg text-sm text-text-muted hover:text-purple-600 hover:border-purple-400 transition-colors flex items-center justify-center gap-2">
        <PlusCircle className="w-4 h-4" /> 添加条件组
      </button>

      {/* 全局配置 */}
      <div className="grid grid-cols-3 gap-4 p-4 bg-page-bg rounded-lg border border-border-color">
        <div>
          <label className="block text-text-secondary text-xs mb-1.5">整体时间窗口</label>
          <input type="text" value={overallTimeWindow}
            onChange={e => onOverallTimeWindowChange(e.target.value)}
            className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary focus:border-purple-500 focus:outline-none"
            placeholder="30 minutes" />
          <p className="text-[10px] text-text-muted mt-1">所有组的最长匹配时间</p>
        </div>
        {thresholdEnabled && (
          <div>
            <label className="block text-text-secondary text-xs mb-1.5">触发阈值</label>
            <input type="number" value={threshold} min={1}
              onChange={e => onThresholdChange(Number(e.target.value))}
              className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary focus:border-purple-500 focus:outline-none" />
          </div>
        )}
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
              groups: groups.filter(g => g.conditions.some(c => c.field && c.value)).map(g => ({
                id: g.id,
                label: g.label,
                data_source_ids: g.data_source_ids,
                conditions: g.conditions.filter(c => c.field && c.value),
                time_window: g.time_window
              })),
              group_logic: groupLogic,
              overall_time_window: overallTimeWindow,
              threshold
            }, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}
