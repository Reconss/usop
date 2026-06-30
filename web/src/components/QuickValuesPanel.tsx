/**
 * QuickValuesPanel — Kibana 风格字段值分布侧栏
 *
 * 功能：
 *  - 左侧栏 280px，显示所有字段的 Top 值分布
 *  - 每个字段展开显示条形图 + 百分比 + 计数
 *  - 点击值 → 添加为筛选条件
 *  - Ctrl+点击 → 排除该值
 *  - 支持折叠/展开每个字段
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3, ChevronDown, Loader2, Plus, Minus, X,
  Shield, Globe, Server, Tag, Activity, AlertTriangle,
  Network, Hash, Clock, Info, Box
} from 'lucide-react';
import { alertsApi } from '../services/api';

interface QuickValue {
  key: string;
  count: number;
  percentage: number;
}

interface FieldDef {
  key: string;
  label: string;
  icon: React.ElementType;
  color: string;
  defaultExpanded?: boolean;
}

const AVAILABLE_FIELDS: FieldDef[] = [
  { key: 'severity', label: '严重程度', icon: AlertTriangle, color: 'text-rose-400', defaultExpanded: true },
  { key: 'status', label: '状态', icon: Activity, color: 'text-blue-400', defaultExpanded: true },
  { key: 'source', label: '数据源', icon: Shield, color: 'text-purple-400', defaultExpanded: true },
  { key: 'source_product', label: '产品', icon: Box, color: 'text-cyan-400', defaultExpanded: false },
  { key: 'category', label: '分类', icon: Tag, color: 'text-amber-400', defaultExpanded: false },
  { key: 'source_type', label: '数据类型', icon: Info, color: 'text-indigo-400', defaultExpanded: false },
  { key: 'src_ip', label: '源 IP', icon: Globe, color: 'text-cyan-400', defaultExpanded: false },
  { key: 'dst_ip', label: '目标 IP', icon: Server, color: 'text-green-400', defaultExpanded: false },
  { key: 'protocol', label: '协议', icon: Network, color: 'text-teal-400', defaultExpanded: false },
  { key: 'hostname', label: '主机名', icon: Hash, color: 'text-orange-400', defaultExpanded: false },
];

interface ActiveFilter {
  field: string;
  value: string;
  exclude: boolean;
}

interface QuickValuesPanelProps {
  onFilterAdd?: (field: string, value: string, exclude: boolean) => void;
  activeFilters?: ActiveFilter[];
  onFilterRemove?: (field: string, value: string) => void;
  startTime?: string;
  endTime?: string;
  className?: string;
}

export const QuickValuesPanel: React.FC<QuickValuesPanelProps> = ({
  onFilterAdd, activeFilters = [], onFilterRemove, startTime, endTime, className = '',
}) => {
  const [expandedFields, setExpandedFields] = useState<Set<string>>(
    new Set(AVAILABLE_FIELDS.filter(f => f.defaultExpanded).map(f => f.key))
  );
  const [fieldValues, setFieldValues] = useState<Record<string, QuickValue[]>>({});
  const [loadingFields, setLoadingFields] = useState<Set<string>>(new Set());

  const fetchFieldValues = useCallback(async (field: string) => {
    setLoadingFields(prev => new Set(prev).add(field));
    try {
      const resp = await alertsApi.quickValues(field, startTime, endTime);
      const data = resp?.data || resp;
      const items = Array.isArray(data) ? data : [];
      setFieldValues(prev => ({ ...prev, [field]: items }));
    } catch (e) {
      setFieldValues(prev => ({ ...prev, [field]: [] }));
    } finally {
      setLoadingFields(prev => { const n = new Set(prev); n.delete(field); return n; });
    }
  }, [startTime, endTime]);

  // Fetch values for expanded fields
  useEffect(() => {
    for (const field of expandedFields) {
      if (!fieldValues[field] && !loadingFields.has(field)) {
        fetchFieldValues(field);
      }
    }
  }, [expandedFields, fetchFieldValues]);

  const toggleField = (field: string) => {
    setExpandedFields(prev => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
        if (!fieldValues[field]) fetchFieldValues(field);
      }
      return next;
    });
  };

  const handleValueClick = (field: string, val: QuickValue, e: React.MouseEvent) => {
    if (!onFilterAdd) return;
    const exclude = e.ctrlKey || e.metaKey;
    onFilterAdd(field, val.key, exclude);
  };

  const isFilterActive = (field: string, value: string) =>
    activeFilters.some(f => f.field === field && f.value === value);

  const isFilterExcluded = (field: string, value: string) =>
    activeFilters.some(f => f.field === field && f.value === value && f.exclude);

  return (
    <div className={`flex flex-col bg-card-bg border border-border-color rounded-xl overflow-hidden ${className}`}>
      {/* 标题 */}
      <div className="px-4 py-3 border-b border-border-color flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-text-primary">Quick Values</span>
        </div>
        {activeFilters.length > 0 && (
          <button onClick={() => activeFilters.forEach(f => onFilterRemove?.(f.field, f.value))}
            className="text-[10px] text-text-muted hover:text-text-secondary">
            清除筛选 ({activeFilters.length})
          </button>
        )}
      </div>

      {/* 当前筛选条件 */}
      {activeFilters.length > 0 && (
        <div className="px-3 py-2 border-b border-border-color">
          <div className="flex flex-wrap gap-1">
            {activeFilters.map((f, i) => (
              <span key={`${f.field}-${f.value}-${i}`}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]
                  ${f.exclude ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    : 'bg-primary/10 text-primary border border-primary/20'}`}>
                {f.exclude ? <Minus className="w-2.5 h-2.5" /> : <Plus className="w-2.5 h-2.5" />}
                <span className="font-mono">{f.field}:{f.value}</span>
                {onFilterRemove && (
                  <button onClick={() => onFilterRemove(f.field, f.value)} className="ml-0.5 hover:opacity-70">
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 字段值分布列表 */}
      <div className="flex-1 overflow-y-auto">
        {AVAILABLE_FIELDS.map((fieldDef) => {
          const isExpanded = expandedFields.has(fieldDef.key);
          const vals = fieldValues[fieldDef.key] || [];
          const isLoading = loadingFields.has(fieldDef.key);
          const maxCount = Math.max(...vals.map(v => v.count), 1);
          const Icon = fieldDef.icon;

          return (
            <div key={fieldDef.key} className="border-b border-border-color/50 last:border-b-0">
              {/* 字段标题 - 点击展开/折叠 */}
              <button onClick={() => toggleField(fieldDef.key)}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/3 transition-colors">
                <div className="flex items-center gap-2">
                  <Icon className={`w-3.5 h-3.5 ${fieldDef.color}`} />
                  <span className="text-xs font-medium text-text-primary">{fieldDef.label}</span>
                  {vals.length > 0 && (
                    <span className="text-[10px] text-text-muted bg-page-bg px-1.5 py-0.5 rounded">
                      {vals.length}
                    </span>
                  )}
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </button>

              {/* 展开的值分布 */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="px-3 pb-2">
                      {isLoading ? (
                        <div className="flex items-center justify-center py-3">
                          <Loader2 className="w-4 h-4 text-text-muted animate-spin" />
                        </div>
                      ) : vals.length === 0 ? (
                        <div className="text-[10px] text-text-muted text-center py-2">暂无数据</div>
                      ) : (
                        <div className="space-y-0.5">
                          {vals.map((val) => {
                            const barPct = maxCount > 0 ? (val.count / maxCount) * 100 : 0;
                            const active = isFilterActive(fieldDef.key, val.key);
                            const excluded = isFilterExcluded(fieldDef.key, val.key);

                            return (
                              <div key={val.key} onClick={(e) => handleValueClick(fieldDef.key, val, e)}
                                className={`group relative rounded px-2 py-1.5 cursor-pointer transition-all overflow-hidden
                                  ${excluded ? 'bg-rose-500/5' : active ? 'bg-primary/5' : 'hover:bg-white/5'}`}
                                title={`${val.key}: ${val.count} (${val.percentage}%) — 点击筛选, Ctrl+点击排除`}>
                                <div className={`absolute top-0 left-0 h-full ${excluded ? 'bg-rose-500/8' : 'bg-primary/8'}`}
                                  style={{ width: `${barPct}%` }} />
                                <div className="relative flex items-center justify-between">
                                  <span className={`text-[11px] font-mono truncate max-w-[140px]
                                    ${excluded ? 'text-rose-400 line-through' : active ? 'text-primary font-medium' : 'text-text-primary'}`}>
                                    {val.key || '(empty)'}
                                  </span>
                                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
                                    <span className="text-[10px] text-text-muted">{val.count.toLocaleString()}</span>
                                    <span className="text-[10px] text-text-muted/50 w-8 text-right">{val.percentage}%</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* 底部提示 */}
      <div className="px-3 py-2 border-t border-border-color text-[10px] text-text-muted flex items-center justify-between">
        <span>点击筛选 · Ctrl+点击排除</span>
        <span>{activeFilters.length > 0 ? `${activeFilters.length} 个筛选` : '无筛选'}</span>
      </div>
    </div>
  );
};

export default QuickValuesPanel;
