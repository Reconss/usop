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
import { motion, AnimatePresence } from 'framer-motion';
import {
  Copy, Check, Search, ChevronDown, ChevronRight,
  Globe, Server, Shield, Clock, FileText, Tag,
  Network, Activity, AlertTriangle, Layers
} from 'lucide-react';

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
    key: 'alert', label: '告警信息', icon: AlertTriangle, color: 'text-rose-400',
    fields: ['title', 'description', 'severity', 'status', 'alert_code', 'category', 'source', 'tags', 'confidence'],
  },
  {
    key: 'network', label: '网络信息', icon: Globe, color: 'text-cyan-400',
    fields: ['src_ip', 'src_port', 'dst_ip', 'dst_port', 'protocol', 'ioc_type', 'ioc_value'],
  },
  {
    key: 'asset', label: '资产信息', icon: Server, color: 'text-amber-400',
    fields: ['hostname', 'affected_assets', 'event_id', 'event_code'],
  },
  {
    key: 'time', label: '时间信息', icon: Clock, color: 'text-emerald-400',
    fields: ['first_seen', 'last_seen', 'created_at', 'updated_at'],
  },
  {
    key: 'raw', label: '原始数据', icon: FileText, color: 'text-purple-400',
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
      <div key={field} className="group flex items-start gap-2 px-3 py-1.5 hover:bg-white/[0.03] rounded-lg">
        {/* 字段名 */}
        <div className="w-[140px] flex-shrink-0">
          <span className="text-xs font-mono text-text-muted truncate block" title={field}>
            {field}
          </span>
        </div>

        {/* 值 */}
        <div className="flex-1 min-w-0 flex items-start gap-1">
          <span
            className={`text-xs font-mono break-all ${isComplex ? 'text-purple-300' : 'text-text-primary'}`}
            style={isComplex ? { display: 'block', maxHeight: '60px', overflow: 'hidden' } : undefined}
          >
            {displayVal}
          </span>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={() => copyValue(field, value)}
            className="p-1 text-text-muted hover:text-primary rounded transition-colors"
            title="复制值"
          >
            {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          </button>
          {onSearchField && value && (
            <button
              onClick={() => onSearchField(field, displayVal)}
              className="p-1 text-text-muted hover:text-primary rounded transition-colors"
              title={`搜索 ${field}:"${displayVal}"`}
            >
              <Search className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {/* 搜索过滤 */}
      <div className="px-4 py-2 border-b border-border-color">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="过滤字段..."
            className="w-full pl-8 pr-3 py-1.5 bg-page-bg border border-border-color rounded-lg text-xs
                       text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* 字段分组 */}
      <div className="flex-1 overflow-y-auto">
        {FIELD_GROUPS.map((group) => {
          const Icon = group.icon;
          const isExpanded = expandedGroups.has(group.key);
          const groupFields = group.fields.filter(f => f in data);

          if (groupFields.length === 0) return null;

          return (
            <div key={group.key} className="border-b border-border-color/50">
              {/* 组标题 */}
              <button
                onClick={() => toggleGroup(group.key)}
                className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-white/[0.03] transition-colors"
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
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pb-2">
                      {groupFields.map(f => renderFieldRow(f, data[f]))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {/* 未分组字段 */}
        {ungroupedFields.length > 0 && (
          <div className="border-b border-border-color/50">
            <button
              onClick={() => toggleGroup('__ungrouped')}
              className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-white/[0.03] transition-colors"
            >
              {expandedGroups.has('__ungrouped')
                ? <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
                : <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
              }
              <Layers className="w-3.5 h-3.5 text-text-muted" />
              <span className="text-xs font-medium text-text-secondary">其他字段</span>
              <span className="text-[10px] text-text-muted ml-auto">{ungroupedFields.length} 字段</span>
            </button>

            <AnimatePresence>
              {expandedGroups.has('__ungrouped') && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="pb-2">
                    {ungroupedFields.map(f => renderFieldRow(f, data[f]))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
};

export default FieldBrowser;
