import React from 'react';
import { TrashIcon, Database } from 'lucide-react';
import DynamicFieldSelect from './DynamicFieldSelect';

export const OPERATOR_LABELS: Record<string, string> = {
  equals: '等于', not_equals: '不等于', contains: '包含',
  not_contains: '不包含', starts_with: '开头是', ends_with: '结尾是',
  greater_than: '大于', less_than: '小于', in_list: '属于',
  not_in_list: '不属于', is_empty: '为空', is_not_empty: '不为空',
  regex_match: '正则匹配'
};

interface Props {
  field: string;
  operator: string;
  value: string;
  dataSourceId?: string | number;
  selectedDataSources: (string | number)[];
  dataSources?: { id: string | number; name: string }[];
  onFieldChange: (val: string) => void;
  onOperatorChange: (val: string) => void;
  onValueChange: (val: string) => void;
  onDataSourceChange?: (val: string | number) => void;
  onRemove: () => void;
  onAdd?: () => void;
}

export default function ConditionRow({
  field, operator, value, dataSourceId, selectedDataSources, dataSources,
  onFieldChange, onOperatorChange, onValueChange,
  onDataSourceChange, onRemove, onAdd
}: Props) {
  return (
    <div className="flex items-start gap-2 p-3 bg-page-bg rounded-lg border border-border-color">
      <div className="flex-1 grid grid-cols-4 gap-2">
        {dataSources && dataSources.length > 0 && onDataSourceChange && (
          <select
            value={dataSourceId != null ? String(dataSourceId) : ''}
            onChange={e => onDataSourceChange(e.target.value)}
            className="px-2 py-1.5 bg-card-bg border border-border-color rounded text-xs text-text-primary focus:border-primary focus:outline-none"
          >
            <option value="">所有数据源</option>
            {dataSources
              .filter(ds => selectedDataSources.includes(String(ds.id)))
              .map(ds => (
                <option key={ds.id} value={String(ds.id)}>
                  <Database className="w-3 h-3 inline mr-1" />
                  {ds.name}
                </option>
              ))}
          </select>
        )}
        <DynamicFieldSelect
          selectedDataSources={dataSourceId ? [dataSourceId] : selectedDataSources}
          value={field}
          onChange={onFieldChange}
        />
        <select
          value={operator}
          onChange={e => onOperatorChange(e.target.value)}
          className="px-2 py-1.5 bg-card-bg border border-border-color rounded text-xs text-text-primary focus:border-primary focus:outline-none"
        >
          {Object.entries(OPERATOR_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input
          type="text"
          value={value}
          onChange={e => onValueChange(e.target.value)}
          placeholder="值"
          className="px-2 py-1.5 bg-card-bg border border-border-color rounded text-xs text-text-primary focus:border-primary focus:outline-none"
          onKeyDown={e => { if (e.key === 'Enter' && onAdd) onAdd(); }}
        />
      </div>
      <button
        onClick={onRemove}
        className="p-1.5 text-text-muted hover:text-critical transition-colors flex-shrink-0 mt-0.5"
      >
        <TrashIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
