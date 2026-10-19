import React from 'react';
import { Plus, Database, Clock, Filter, Target } from 'lucide-react';
import ConditionRow from './ConditionRow';
import { Condition } from '../../types/detection-rules';
import { Button, EmptyState, Field, SectionCard } from '../ui';

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

const UNIT_LABEL: Record<string, string> = {
  minutes: '分钟',
  hours: '小时',
  days: '天',
};

export default function SingleConditionEditor({
  conditions, selectedDataSources, dataSources,
  timeWindow, timeUnit, threshold, groupBy,
  onConditionsChange, onTimeWindowChange, onTimeUnitChange,
  onThresholdChange, onGroupByChange
}: Props) {
  const addCondition = () => {
    onConditionsChange([...conditions, { field: 'severity', operator: 'equals', value: '' }]);
  };

  const updateCondition = <K extends keyof Condition>(index: number, key: K, val: Condition[K]) => {
    onConditionsChange(conditions.map((c, i) => i === index ? { ...c, [key]: val } : c));
  };

  const removeCondition = (index: number) => {
    onConditionsChange(conditions.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col gap-5">
      {/* 规则说明 */}
      <div className="callout callout-info">
        <Target size={14} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="text-[13px] font-medium">单事件规则</div>
          <p className="mt-1 text-caption leading-relaxed opacity-80">
            在告警索引上筛选满足所有条件的告警（条件之间为 AND），并统计时间窗口内的命中数量。
            命中数达到阈值时规则触发、生成事件。字段取告警标准字段，IP 等字段在顶层缺失时会
            回退到 extra_data / parsed_data 中的同名值。
          </p>
        </div>
      </div>

      {/* 关联数据源提示（可选） */}
      <div className="callout">
        <Database size={14} className="mt-0.5 shrink-0 text-text-muted" />
        <span className="text-[12.5px]">
          {selectedDataSources.length > 0 ? (
            <>
              检测范围：已关联 <strong className="text-text-primary">{selectedDataSources.length}</strong> 个数据源
              <span className="ml-1 text-text-muted">
                （{selectedDataSources.map(id => dataSources.find(s => String(s.id) === String(id))?.name).filter(Boolean).join(', ')}）
              </span>
            </>
          ) : (
            '未选择数据源：将在全部告警（告警索引 alerts-valid）上评估'
          )}
        </span>
      </div>

      {/* 条件编辑器 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
            <Filter size={14} className="text-primary" />
            检测条件
          </span>
          <Button variant="soft" size="sm" icon={Plus} onClick={addCondition}>
            添加条件
          </Button>
        </div>

        {conditions.length === 0 ? (
          <div className="rounded-card border border-dashed border-border-color bg-surface-1">
            <EmptyState
              compact
              icon={Filter}
              title="暂无条件"
              description="点击「添加条件」开始配置；无条件 = 窗口内全部告警参与计数"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
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
        )}
      </div>

      {/* 时间窗口 & 阈值 */}
      <SectionCard icon={Clock} title="聚合配置" padding="sm">
        <div className="app-form-grid">
          <Field label="时间窗口" required>
            <input
              type="number"
              value={timeWindow}
              min={1}
              onChange={e => onTimeWindowChange(Number(e.target.value))}
              className="app-input num"
            />
          </Field>
          <Field label="时间单位">
            <select
              value={timeUnit}
              onChange={e => onTimeUnitChange(e.target.value)}
              className="app-select"
            >
              <option value="minutes">分钟</option>
              <option value="hours">小时</option>
              <option value="days">天</option>
            </select>
          </Field>
          <Field label="触发阈值" required>
            <input
              type="number"
              value={threshold}
              min={1}
              onChange={e => onThresholdChange(Number(e.target.value))}
              className="app-input num"
            />
          </Field>
          <Field label="分组字段（可选）" help="留空则整体计数">
            <input
              type="text"
              value={groupBy}
              onChange={e => onGroupByChange(e.target.value)}
              placeholder="如 src_ip"
              className="app-input font-mono"
            />
          </Field>
        </div>
        <p className="mt-3 text-caption text-text-muted">
          当满足条件的告警在 {timeWindow} {UNIT_LABEL[timeUnit] || timeUnit} 内出现 {threshold} 次以上时触发
          {groupBy ? `，按 ${groupBy} 分组分别统计` : '（不分组，整体计数）'}
        </p>
      </SectionCard>

      {/* JSON 预览 */}
      <details className="group">
        <summary className="cursor-pointer select-none text-caption text-text-muted transition-colors hover:text-text-secondary">
          查看规则 JSON
        </summary>
        <pre className="mt-2 max-h-32 w-full overflow-auto rounded-input border border-border-color bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-text-muted scrollbar-thin">
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
  );
}
