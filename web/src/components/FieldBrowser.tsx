/**
 * FieldBrowser — 字段浏览器（简化版）
 *
 * 功能：
 *  - 所有字段平铺展示（按字段名排序，便于快速定位）
 *  - 字段名 + 值 + 复制按钮
 *  - "搜索此字段" 快捷操作（回写列表检索）
 *  - 顶部搜索过滤
 *
 * 说明：早期版本按「网络/告警/资产/时间/原始」分组折叠，
 * 在告警详情里过于复杂，已改为平铺。原始日志有独立 Tab 展示。
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Copy, Check, Search } from 'lucide-react';
import { Button, SearchInput } from './ui';

// ==================== Props ====================

interface FieldBrowserProps {
  data: Record<string, any>;
  onSearchField?: (field: string, value: string) => void;
  className?: string;
}

export const FieldBrowser: React.FC<FieldBrowserProps> = ({
  data, onSearchField, className = '',
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  const copyValue = useCallback((field: string, value: any) => {
    const text = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '');
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  }, []);

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const isComplexValue = (value: any): boolean => {
    return typeof value === 'object' && value !== null;
  };

  // 平铺所有业务字段：过滤内部字段，按字段名排序
  const fields = useMemo(() => {
    return Object.keys(data)
      .filter(k => !k.startsWith('_') && k !== 'id')
      .sort((a, b) => a.localeCompare(b));
  }, [data]);

  const filteredFields = useMemo(() => {
    if (!searchFilter) return fields;
    const q = searchFilter.toLowerCase();
    return fields.filter(f => {
      const v = formatValue(data[f]);
      return f.toLowerCase().includes(q) || v.toLowerCase().includes(q);
    });
  }, [fields, searchFilter, data]);

  const renderFieldRow = (field: string, value: any) => {
    const displayVal = formatValue(value);
    const isCopied = copiedField === field;
    const isComplex = isComplexValue(value);

    return (
      <div key={field} className="group flex items-start gap-2 px-3 py-1.5 hover:bg-surface-2 rounded-lg">
        {/* 字段名 */}
        <div className="w-[140px] flex-shrink-0">
          <span className="text-xs font-mono text-text-muted truncate block" title={field}>
            {field}
          </span>
        </div>

        {/* 值 */}
        <div className="flex-1 min-w-0 flex items-start gap-1">
          <span
            className={`text-xs font-mono break-all ${isComplex ? 'text-accent' : 'text-text-primary'}`}
            style={isComplex ? { display: 'block', maxHeight: '60px', overflow: 'hidden' } : undefined}
          >
            {displayVal}
          </span>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            icon={isCopied ? Check : Copy}
            className="h-6 w-6 px-0"
            title="复制值"
            aria-label={`复制 ${field}`}
            onClick={() => copyValue(field, value)}
          />
          {onSearchField && value && (
            <Button
              variant="ghost"
              size="sm"
              icon={Search}
              className="h-6 w-6 px-0"
              title={`搜索 ${field}:"${displayVal}"`}
              aria-label={`搜索 ${field}`}
              onClick={() => onSearchField(field, displayVal)}
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {/* 搜索过滤 */}
      <div className="px-4 py-2 border-b border-border-color">
        <SearchInput
          value={searchFilter}
          onChange={setSearchFilter}
          placeholder="过滤字段..."
          width="full"
          className="[&_input]:h-[34px]"
        />
      </div>

      {/* 字段平铺列表 */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {filteredFields.length === 0 ? (
          <div className="px-4 py-10 text-center text-xs text-text-muted">
            {searchFilter ? '无匹配字段' : '无可用字段'}
          </div>
        ) : (
          filteredFields.map(f => renderFieldRow(f, data[f]))
        )}
      </div>
    </div>
  );
};

export default FieldBrowser;
