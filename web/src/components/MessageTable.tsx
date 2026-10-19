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

import React, { useState, useMemo, useRef } from 'react';
import {
  ArrowUpDown, ArrowUp, ArrowDown,
  Settings2, Copy, Check,
  ChevronLeft, ChevronsLeft, ChevronsRight, ChevronRight,
} from 'lucide-react';
import {
  Button,
  EmptyState,
  LoadingState,
  SeverityBadge,
  StateBadge,
  TableWrap,
} from './ui';

// ==================== 列定义 ====================

interface ColumnDef {
  key: string;
  label: string;
  width?: string;
  sortable?: boolean;
  render?: (value: any, row: any) => React.ReactNode;
}

const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: 'id', label: 'ID', width: '122px', sortable: true },
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
  {
    key: 'collab',
    label: '研判',
    width: '72px',
    render: (_: any, row: any) => {
      const analyzed = row?.extraData?.structured_analysis;
      return analyzed ? (
        <span className="chip !px-1.5 !py-0.5 !text-[10px] text-success">已研判</span>
      ) : null;
    },
  },
];

// ==================== 严重度/状态 ====================

const SEVERITY_LABEL: Record<string, string> = {
  critical: '危急',
  high: '高危',
  medium: '中危',
  low: '低危',
};

const STATUS_META: Record<string, { state: string; label: string }> = {
  new: { state: 'new', label: '新告警' },
  investigating: { state: 'investigating', label: '调查中' },
  active: { state: 'investigating', label: '调查中' },
  closed: { state: 'closed', label: '已关闭' },
  resolved: { state: 'closed', label: '已关闭' },
  false_positive: { state: 'false_positive', label: '误报' },
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
      ? <mark key={i} className="bg-warning/25 text-warning rounded px-0.5">{part}</mark>
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
  // 列宽自适应调节：初始用列定义的默认宽度，可拖拽列边界实时调整
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const resizeStateRef = useRef<{ key: string; startX: number; startW: number } | null>(null);

  const handleResizeStart = (key: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.currentTarget as HTMLElement).closest('th');
    if (!th) return;
    resizeStateRef.current = { key, startX: e.clientX, startW: th.getBoundingClientRect().width };
    const onMove = (ev: MouseEvent) => {
      const st = resizeStateRef.current;
      if (!st) return;
      const w = Math.max(56, st.startW + ev.clientX - st.startX);
      setColWidths(prev => ({ ...prev, [st.key]: w }));
    };
    const onUp = () => {
      resizeStateRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

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
      return <SeverityBadge severity={SEVERITY_LABEL[val] || '中危'} />;
    }

    if (col.key === 'status') {
      const meta = STATUS_META[val] || STATUS_META.new;
      return <StateBadge state={meta.state} label={meta.label} />;
    }

    if (col.key === 'id') {
      const text = val == null ? '' : String(val);
      return (
        <span
          className="text-xs font-mono text-text-muted whitespace-nowrap"
          title={text || undefined}
        >
          {text.slice(0, 12)}
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
        <span className="text-xs font-mono text-info">
          {searchQuery ? highlightText(val, searchQuery) : val}
        </span>
      );
    }

    if (col.key === 'title') {
      const linkedEvents: string[] = row?.eventIds || row?.event_ids || [];
      return (
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs text-text-primary truncate max-w-[300px] block">
            {searchQuery ? highlightText(String(val || ''), searchQuery) : val}
          </span>
          {linkedEvents.length > 0 && (
            <span
              className="chip !px-1.5 !py-0.5 !text-[10px] text-info shrink-0"
              title={`已关联事件：${linkedEvents.join('、')}`}
            >
              已转事件
            </span>
          )}
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

  const colSpan = columns.length + (onSelectionChange ? 1 : 0);

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      {/* 工具栏 */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border-color">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs text-text-muted">
            共 <span className="text-text-secondary font-medium num">{total.toLocaleString()}</span> 条
          </span>
          {selectedIds && selectedIds.size > 0 && (
            <span className="text-xs text-primary">
              已选 {selectedIds.size} 条
            </span>
          )}
        </div>

        {/* 列选择器 */}
        <div className="relative shrink-0">
          <Button
            variant={showColSelector ? 'soft' : 'secondary'}
            size="sm"
            icon={Settings2}
            onClick={() => setShowColSelector(!showColSelector)}
            aria-expanded={showColSelector}
          >
            列
          </Button>

          {showColSelector && (
            <div className="absolute top-full right-0 mt-1 w-56 z-50 overflow-hidden app-card shadow-panel">
              <div className="px-3 py-2 border-b border-border-color">
                <span className="text-xs font-medium text-text-muted">显示列</span>
              </div>
              <div className="p-2 max-h-[300px] overflow-y-auto scrollbar-thin">
                {ALL_COLUMNS.map((col) => (
                  <label
                    key={col.key}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={visibleCols.includes(col.key)}
                      onChange={() => handleToggleCol(col.key)}
                      className="app-checkbox"
                    />
                    <span className="text-xs text-text-primary">{col.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 表格 */}
      <TableWrap className="flex-1 min-h-0 border-0 rounded-none">
        <table className="data-table">
          <thead>
            <tr>
              {/* 复选框列 */}
              {onSelectionChange && (
                <th className="w-12" style={{ width: 48 }} aria-label="选择">
                  <input
                    type="checkbox"
                    checked={selectedIds ? selectedIds.size === data.length && data.length > 0 : false}
                    onChange={handleSelectAll}
                    className="app-checkbox"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  aria-sort={
                    sortField === col.key
                      ? sortOrder === 'asc' ? 'ascending' : 'descending'
                      : undefined
                  }
                  className={`relative group/th ${col.sortable ? 'cursor-pointer select-none hover:text-text-secondary' : ''}`}
                  style={{ width: colWidths[col.key] ?? col.width }}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && (
                      sortField === col.key ? (
                        sortOrder === 'asc'
                          ? <ArrowUp className="w-3 h-3 text-primary" />
                          : <ArrowDown className="w-3 h-3 text-primary" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-30" />
                      )
                    )}
                  </div>
                  {/* 列宽拖拽手柄 */}
                  <span
                    aria-hidden="true"
                    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize opacity-0 group-hover/th:opacity-100 hover:!opacity-100 bg-primary/30 transition-opacity"
                    onMouseDown={handleResizeStart(col.key)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colSpan} className="text-center">
                  <LoadingState inline label="加载中…" />
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={colSpan}>
                  <EmptyState compact title="暂无告警数据" />
                </td>
              </tr>
            ) : (
              data.map((row, i) => {
                const isExpanded = expandedRowId === row.id;
                const isSelected = selectedIds?.has(row.id) || false;
                return (
                  <React.Fragment key={row.id || i}>
                    <tr
                      onClick={() => onRowClick?.(row)}
                      className={[
                        'cursor-pointer',
                        isSelected ? 'is-selected' : '',
                        isExpanded ? 'bg-primary/5' : '',
                      ].filter(Boolean).join(' ')}
                    >
                      {onSelectionChange && (
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSelectRow(row.id)}
                            className="app-checkbox"
                            aria-label="选择该行"
                          />
                        </td>
                      )}
                      {columns.map((col) => (
                        <td key={col.key}>
                          {col.render ? col.render(row[col.key], row) : renderCellValue(col, row)}
                        </td>
                      ))}
                    </tr>

                    {/* 展开行详情 */}
                    {isExpanded && (
                      <tr className="bg-surface-2/40 hover:bg-surface-2/40">
                        <td colSpan={colSpan} className="!p-0">
                          <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-3 bg-surface-2/40">
                            {Object.entries(row)
                              .filter(([k]) => !['id', '_score'].includes(k))
                              .map(([k, v]) => (
                                <div key={k} className="group min-w-0">
                                  <div className="text-[10px] text-text-muted uppercase tracking-wide mb-0.5">{k}</div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-text-primary font-mono truncate max-w-[180px]">
                                      {typeof v === 'object' ? JSON.stringify(v) : String(v ?? '-')}
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      icon={copiedField === k ? Check : Copy}
                                      className="h-5 w-5 px-0 opacity-0 group-hover:opacity-100"
                                      title="复制值"
                                      aria-label={`复制 ${k}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        copyToClipboard(String(v ?? ''), k);
                                      }}
                                    />
                                  </div>
                                </div>
                              ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </TableWrap>

      {/* 分页 */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border-color">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">每页</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
            className="app-select w-auto h-7 py-0 pl-2 pr-7 text-xs"
            aria-label="每页条数"
          >
            {[10, 20, 50, 100].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <span className="text-xs text-text-muted">条</span>
        </div>

        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            icon={ChevronsLeft}
            className="w-7 px-0"
            disabled={page <= 1}
            aria-label="第一页"
            onClick={() => onPageChange?.(1)}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={ChevronLeft}
            className="w-7 px-0"
            disabled={page <= 1}
            aria-label="上一页"
            onClick={() => onPageChange?.(page - 1)}
          />

          <span className="px-3 text-xs text-text-secondary num">
            {page} / {totalPages}
          </span>

          <Button
            variant="ghost"
            size="sm"
            icon={ChevronRight}
            className="w-7 px-0"
            disabled={page >= totalPages}
            aria-label="下一页"
            onClick={() => onPageChange?.(page + 1)}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={ChevronsRight}
            className="w-7 px-0"
            disabled={page >= totalPages}
            aria-label="最后一页"
            onClick={() => onPageChange?.(totalPages)}
          />
        </div>
      </div>
    </div>
  );
};

export default MessageTable;
