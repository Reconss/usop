/**
 * FieldBrowser — 字段浏览器
 *
 * 功能：
 *  - 字段按分组展示（网络/告警/资产/时间/原始）
 *  - 字段名 + 值 + 复制按钮
 *  - "搜索此字段" 快捷操作
 *  - 字段展开/折叠
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Copy, Check, Search, ChevronDown, ChevronRight,
  Globe, Server, Clock, FileText,
  Activity, AlertTriangle, Layers
} from 'lucide-react';
import { Button, SearchInput } from './ui';

// ==================== 字段分组定义 ====================

interface FieldGroupDef {
  key: string;
  label: string;
  icon: React.ElementType;
  color: string;
  fields: string[];
}

const FIELD_GROUPS: FieldGroupDef[] = [
  {
    key: 'alert', label: '告警信息', icon: AlertTriangle, color: 'text-danger',
    fields: ['title', 'description', 'severity', 'status', 'alert_code', 'category', 'source', 'tags', 'confidence'],
  },
  {
    key: 'network', label: '网络信息', icon: Globe, color: 'text-info',
    fields: ['src_ip', 'src_port', 'dst_ip', 'dst_port', 'protocol', 'ioc_type', 'ioc_value'],
  },
  {
    key: 'asset', label: '资产信息', icon: Server, color: 'text-warning',
    fields: ['hostname', 'affected_assets', 'event_id', 'event_code'],
  },
  {
    key: 'time', label: '时间信息', icon: Clock, color: 'text-success',
    fields: ['first_seen', 'last_seen', 'created_at', 'updated_at'],
  },
  {
    key: 'raw', label: '原始数据', icon: FileText, color: 'text-accent',
    fields: ['raw_log', 'parsed_data', 'extra_data', 'aggregated', 'aggregated_count', 'aggregated_ids'],
  },
];

// ==================== Props ====================

interface FieldBrowserProps {
  data: Record<string, any>;
  onSearchField?: (field: string, value: string) => void;
  className?: string;
}

export const FieldBrowser: React.FC<FieldBrowserProps> = ({
  data, onSearchField, className = '',
}) => {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['alert', 'network']));
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const copyValue = useCallback((field: string, value: any) => {
    const text = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '');
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  }, []);

  // 收集未分组的字段
  const allGroupedFields = useMemo(() => {
    const set = new Set<string>();
    FIELD_GROUPS.forEach(g => g.fields.forEach(f => set.add(f)));
    return set;
  }, []);

  const ungroupedFields = useMemo(() => {
    return Object.keys(data).filter(k =>
      !allGroupedFields.has(k) &&
      !k.startsWith('_') &&
      k !== 'id' &&
      (searchFilter ? k.toLowerCase().includes(searchFilter.toLowerCase()) : true)
    );
  }, [data, allGroupedFields, searchFilter]);

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const isComplexValue = (value: any): boolean => {
    return typeof value === 'object' && value !== null;
  };

  const renderFieldRow = (field: string, value: any) => {
    if (searchFilter && !field.toLowerCase().includes(searchFilter.toLowerCase()) &&
        !formatValue(value).toLowerCase().includes(searchFilter.toLowerCase())) {
      return null;
    }

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

      {/* 字段分组 */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {FIELD_GROUPS.map((group) => {
          const Icon = group.icon;
          const isExpanded = expandedGroups.has(group.key);
          const groupFields = group.fields.filter(f => f in data);

          if (groupFields.length === 0) return null;

          return (
            <div key={group.key} className="border-b border-border-color/50">
              {/* 组标题 */}
              <button
                type="button"
                onClick={() => toggleGroup(group.key)}
                className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-surface-2 transition-colors"
                aria-expanded={isExpanded}
              >
                {isExpanded
                  ? <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
                  : <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
                }
                <Icon className={`w-3.5 h-3.5 ${group.color}`} />
                <span className="text-xs font-medium text-text-secondary">{group.label}</span>
                <span className="text-[10px] text-text-muted ml-auto">{groupFields.length} 字段</span>
              </button>

              {/* 组内字段 */}
              {isExpanded && (
                <div className="pb-2">
                  {groupFields.map(f => renderFieldRow(f, data[f]))}
                </div>
              )}
            </div>
          );
        })}

        {/* 未分组字段 */}
        {ungroupedFields.length > 0 && (
          <div className="border-b border-border-color/50">
            <button
              type="button"
              onClick={() => toggleGroup('__ungrouped')}
              className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-surface-2 transition-colors"
              aria-expanded={expandedGroups.has('__ungrouped')}
            >
              {expandedGroups.has('__ungrouped')
                ? <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
                : <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
              }
              <Layers className="w-3.5 h-3.5 text-text-muted" />
              <span className="text-xs font-medium text-text-secondary">其他字段</span>
              <span className="text-[10px] text-text-muted ml-auto">{ungroupedFields.length} 字段</span>
            </button>

            {expandedGroups.has('__ungrouped') && (
              <div className="pb-2">
                {ungroupedFields.map(f => renderFieldRow(f, data[f]))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FieldBrowser;
