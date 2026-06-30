/**
 * MessageTable — 可配置消息表
 *
 * 功能：
 *  - 可配置列表头（列选择器弹窗）
 *  - 搜索词高亮
 *  - 点击行展开详情
 *  - 排序切换
 *  - 分页
 */

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronRight,
  Settings2, Eye, Copy, Check, X, ChevronLeft, ChevronsLeft, ChevronsRight
} from 'lucide-react';

// ==================== 列定义 ====================

interface ColumnDef {
  key: string;
  label: string;
  width?: string;
  sortable?: boolean;
  render?: (value: any, row: any) => React.ReactNode;
}

const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: 'id', label: 'ID', width: '70px', sortable: true },
  { key: 'title', label: '告警名称', sortable: true },
  { key: 'severity', label: '严重程度', width: '80px', sortable: true },
  { key: 'status', label: '状态', width: '80px', sortable: true },
  { key: 'sourceProduct', label: '安全产品', width: '120px', sortable: true },
  { key: 'category', label: '分类', width: '100px', sortable: true },
  { key: 'firstSeen', label: '告警时间', width: '140px', sortable: true },
  { key: 'createdAt', label: '接入时间', width: '140px', sortable: true },
];

const ALL_COLUMNS: ColumnDef[] = [
  ...DEFAULT_COLUMNS,
  { key: 'srcIp', label: '源 IP', width: '130px', sortable: true },
  { key: 'dstIp', label: '目标 IP', width: '130px', sortable: true },
  { key: 'srcPort', label: '源端口', width: '80px', sortable: true },
  { key: 'dstPort', label: '目标端口', width: '80px', sortable: true },
  { key: 'protocol', label: '协议', width: '70px' },
  { key: 'hostname', label: '主机', width: '130px', sortable: true },
  { key: 'source', label: '数据源', width: '90px' },
  { key: 'description', label: '描述' },
];

// ==================== 严重度/状态样式 ====================

const severityStyle: Record<string, { bg: string; text: string; label: string }> = {
  critical: { bg: 'bg-rose-500/15', text: 'text-rose-400', label: '危急' },
  high: { bg: 'bg-orange-500/15', text: 'text-orange-400', label: '高危' },
  medium: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: '中危' },
  low: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: '低危' },
};

const statusStyle: Record<string, { bg: string; text: string; label: string }> = {
  new: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: '新告警' },
  investigating: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: '调查中' },
  active: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: '调查中' },
  closed: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: '已关闭' },
  resolved: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: '已关闭' },
  false_positive: { bg: 'bg-gray-500/15', text: 'text-gray-400', label: '误报' },
};

// ==================== 高亮工具 ====================

function highlightText(text: string, query: string): React.ReactNode {
  if (!query || !text) return text;
  // 从 query_string 提取关键词（去掉 field: 前缀）
  const keywords = query
    .replace(/\w+:"[^"]*"/g, '')
    .replace(/\w+:\S+/g, '')
    .replace(/\b(AND|OR|NOT)\b/gi, '')
    .split(/\s+/)
    .filter(w => w.length > 1);

  if (keywords.length === 0) return text;

  const pattern = new RegExp(`(${keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const parts = text.split(pattern);

  return parts.map((part, i) =>
    pattern.test(part)
      ? <mark key={i} className="bg-yellow-400/30 text-yellow-200 rounded px-0.5">{part}</mark>
      : part
  );
}

// ==================== Props ====================

interface MessageTableProps {
  data: any[];
  loading?: boolean;
  total?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  onSortChange?: (field: string, order: 'asc' | 'desc') => void;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  onRowClick?: (row: any) => void;
  expandedRowId?: string | null;
  searchQuery?: string;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  className?: string;
}

export const MessageTable: React.FC<MessageTableProps> = ({
  data, loading, total = 0, page = 1, pageSize = 20,
  onPageChange, onPageSizeChange, onSortChange,
  sortField, sortOrder, onRowClick, expandedRowId, searchQuery,
  selectedIds, onSelectionChange, className = '',
}) => {
  const [visibleCols, setVisibleCols] = useState<string[]>(
    DEFAULT_COLUMNS.map(c => c.key)
  );
  const [showColSelector, setShowColSelector] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const columns = useMemo(
    () => ALL_COLUMNS.filter(c => visibleCols.includes(c.key)),
    [visibleCols]
  );

  const totalPages = useMemo(
    () => Math.max(Math.ceil(total / pageSize), 1),
    [total, pageSize]
  );

  const handleSort = (colKey: string) => {
    if (!onSortChange) return;
    const newOrder = sortField === colKey && sortOrder === 'asc' ? 'desc' : 'asc';
    onSortChange(colKey, newOrder);
  };

  const handleToggleCol = (key: string) => {
    setVisibleCols(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleSelectAll = () => {
    if (!onSelectionChange) return;
    if (selectedIds && selectedIds.size === data.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(data.map(d => d.id)));
    }
  };

  const handleSelectRow = (id: string) => {
    if (!onSelectionChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const renderCellValue = (col: ColumnDef, row: any) => {
    const val = row[col.key];

    if (col.key === 'severity') {
      const s = severityStyle[val] || severityStyle.medium;
      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.bg} ${s.text}`}>
          {s.label}
        </span>
      );
    }

    if (col.key === 'status') {
      const s = statusStyle[val] || statusStyle.new;
      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.bg} ${s.text}`}>
          {s.label}
        </span>
      );
    }

    if (col.key === 'id') {
      return (
        <span className="text-xs font-mono text-text-muted">
          {typeof val === 'string' ? val.slice(0, 8) : val}
        </span>
      );
    }

    if (col.key === 'firstSeen' || col.key === 'lastSeen' || col.key === 'createdAt' || col.key === 'first_seen' || col.key === 'last_seen' || col.key === 'created_at') {
      if (!val) return <span className="text-xs text-text-muted">-</span>;
      try {
        return (
          <span className="text-xs text-text-muted">
            {new Date(val).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        );
      } catch {
        return <span className="text-xs text-text-muted">{val}</span>;
      }
    }

    if (col.key === 'srcIp' || col.key === 'dstIp' || col.key === 'src_ip' || col.key === 'dst_ip') {
      if (!val) return <span className="text-xs text-text-muted">-</span>;
      return (
        <span className="text-xs font-mono text-cyan-300">
          {searchQuery ? highlightText(val, searchQuery) : val}
        </span>
      );
    }

    if (col.key === 'title') {
      return (
        <span className="text-xs text-text-primary truncate max-w-[300px] block">
          {searchQuery ? highlightText(String(val || ''), searchQuery) : val}
        </span>
      );
    }

    if (typeof val === 'string') {
      return (
        <span className="text-xs text-text-secondary truncate max-w-[200px] block">
          {searchQuery ? highlightText(val, searchQuery) : val}
        </span>
      );
    }

    return <span className="text-xs text-text-secondary">{val ?? '-'}</span>;
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-color">
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-muted">
            共 <span className="text-text-secondary font-medium">{total.toLocaleString()}</span> 条
          </span>
          {selectedIds && selectedIds.size > 0 && (
            <span className="text-xs text-primary">
              已选 {selectedIds.size} 条
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* 列选择器 */}
          <div className="relative">
            <button
              onClick={() => setShowColSelector(!showColSelector)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-text-muted hover:text-text-secondary
                         bg-page-bg border border-border-color rounded-lg transition-colors"
            >
              <Settings2 className="w-3.5 h-3.5" />
              列
            </button>

            <AnimatePresence>
              {showColSelector && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="absolute top-full right-0 mt-1 w-56 bg-card-bg border border-border-color
                             rounded-xl shadow-2xl z-50 overflow-hidden"
                >
                  <div className="px-3 py-2 border-b border-border-color">
                    <span className="text-xs font-medium text-text-muted">显示列</span>
                  </div>
                  <div className="p-2 max-h-[300px] overflow-y-auto">
                    {ALL_COLUMNS.map((col) => (
                      <label
                        key={col.key}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={visibleCols.includes(col.key)}
                          onChange={() => handleToggleCol(col.key)}
                          className="w-3.5 h-3.5 rounded border-border-color text-primary focus:ring-primary/30 bg-page-bg"
                        />
                        <span className="text-xs text-text-primary">{col.label}</span>
                      </label>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* 表格 */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border-color">
              {/* 复选框列 */}
              {onSelectionChange && (
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectedIds ? selectedIds.size === data.length && data.length > 0 : false}
                    onChange={handleSelectAll}
                    className="w-3.5 h-3.5 rounded border-border-color text-primary focus:ring-primary/30 bg-page-bg"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-3 py-2 text-left text-xs font-medium text-text-muted uppercase tracking-wide
                    ${col.sortable ? 'cursor-pointer hover:text-text-secondary select-none' : ''}`}
                  style={col.width ? { width: col.width, minWidth: col.width } : undefined}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && (
                      sortField === col.key ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-30" />
                      )
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length + (onSelectionChange ? 1 : 0)} className="px-3 py-12 text-center">
                  <div className="flex items-center justify-center gap-2 text-text-muted">
                    <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    <span className="text-sm">加载中...</span>
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (onSelectionChange ? 1 : 0)} className="px-3 py-12 text-center text-text-muted text-sm">
                  暂无告警数据
                </td>
              </tr>
            ) : (
              data.map((row, i) => {
                const isExpanded = expandedRowId === row.id;
                return (
                  <React.Fragment key={row.id || i}>
                    <tr
                      onClick={() => onRowClick?.(row)}
                      className={`border-b border-border-color/50 cursor-pointer transition-colors
                        ${isExpanded ? 'bg-primary/5' : 'hover:bg-white/[0.02]'}`}
                    >
                      {onSelectionChange && (
                        <td className="w-10 px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds?.has(row.id) || false}
                            onChange={() => handleSelectRow(row.id)}
                            className="w-3.5 h-3.5 rounded border-border-color text-primary focus:ring-primary/30 bg-page-bg"
                          />
                        </td>
                      )}
                      {columns.map((col) => (
                        <td key={col.key} className="px-3 py-2.5">
                          {renderCellValue(col, row)}
                        </td>
                      ))}
                    </tr>

                    {/* 展开行详情 */}
                    <AnimatePresence>
                      {isExpanded && (
                        <tr>
                          <td colSpan={columns.length + (onSelectionChange ? 1 : 0)}>
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden bg-page-bg/50"
                            >
                              <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                                {Object.entries(row)
                                  .filter(([k]) => !['id', '_score'].includes(k))
                                  .map(([k, v]) => (
                                    <div key={k} className="group">
                                      <div className="text-[10px] text-text-muted uppercase tracking-wide mb-0.5">{k}</div>
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs text-text-primary font-mono truncate max-w-[180px]">
                                          {typeof v === 'object' ? JSON.stringify(v) : String(v ?? '-')}
                                        </span>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            copyToClipboard(String(v ?? ''), k);
                                          }}
                                          className="opacity-0 group-hover:opacity-100 p-0.5 text-text-muted hover:text-primary transition-all"
                                        >
                                          {copiedField === k
                                            ? <Check className="w-3 h-3 text-emerald-400" />
                                            : <Copy className="w-3 h-3" />
                                          }
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border-color">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">每页</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
            className="bg-page-bg border border-border-color rounded-lg px-2 py-1 text-xs text-text-secondary
                       focus:outline-none focus:border-primary"
          >
            {[10, 20, 50, 100].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <span className="text-xs text-text-muted">条</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange?.(1)}
            disabled={page <= 1}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-white/5
                       disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => onPageChange?.(page - 1)}
            disabled={page <= 1}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-white/5
                       disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="px-3 py-1.5 text-xs text-text-secondary">
            {page} / {totalPages}
          </span>

          <button
            onClick={() => onPageChange?.(page + 1)}
            disabled={page >= totalPages}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-white/5
                       disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => onPageChange?.(totalPages)}
            disabled={page >= totalPages}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-white/5
                       disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default MessageTable;
