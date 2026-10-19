import React, { useState, useEffect } from 'react';
import { rulesApi } from '../../services/api';
import { DynamicField } from '../../types/detection-rules';

interface Props {
  selectedDataSources: (string | number)[];
  value: string;
  onChange: (field: string) => void;
  className?: string;
}

export default function DynamicFieldSelect({ selectedDataSources, value, onChange, className = '' }: Props) {
  const [fields, setFields] = useState<DynamicField[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedDataSources || selectedDataSources.length === 0) {
      // 无选中数据源时加载默认字段
      setLoading(true);
      rulesApi.getFields([]).then((res: any) => {
        if (res.success) setFields(res.data || []);
      }).finally(() => setLoading(false));
      return;
    }
    setLoading(true);
    rulesApi.getFields(selectedDataSources).then((res: any) => {
      if (res.success) setFields(res.data || []);
    }).finally(() => setLoading(false));
  }, [selectedDataSources]);

  // 按数据源分组
  const grouped: Record<string, DynamicField[]> = {};
  fields.forEach(f => {
    const key = f.source_name || '系统默认';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(f);
  });

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={['app-select px-2 py-1.5 text-[12px]', className].filter(Boolean).join(' ')}
      aria-label="检测字段"
      disabled={loading}
    >
      {loading && (
        <option value="" disabled>加载中...</option>
      )}
      {!loading && fields.length === 0 && (
        <option value="" disabled>暂无可选字段</option>
      )}
      {Object.entries(grouped).map(([sourceName, sourceFields]) => (
        <optgroup key={sourceName} label={sourceName}>
          {sourceFields.map(f => (
            <option key={`${sourceName}-${f.name}`} value={f.name}>
              {f.label || f.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
