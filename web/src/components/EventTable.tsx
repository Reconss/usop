import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import type { SecurityEvent } from '../types';

interface EventTableProps {
  events: SecurityEvent[];
  onSelect?: (ids: string[]) => void;
  onAction?: (action: string, event: SecurityEvent) => void;
}

const severityConfig = {
  critical: { label: '危急', className: 'badge-critical', color: '#ef4444' },
  high: { label: '高危', className: 'badge-high', color: '#f97316' },
  medium: { label: '中危', className: 'badge-medium', color: '#eab308' },
  low: { label: '低危', className: 'badge-low', color: '#3b82f6' }
};

const statusConfig = {
  new: { label: '新建', color: 'text-primary' },
  investigating: { label: '调查中', color: 'text-high' },
  closed: { label: '已关闭', color: 'text-success' },
  false_positive: { label: '误报', color: 'text-text-muted' }
};


export default function EventTable({ events, onSelect, onAction }: EventTableProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const totalPages = Math.ceil(events.length / pageSize);
  const paginatedEvents = events.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSelectAll = (checked: boolean) => {
    const newIds = checked ? paginatedEvents.map(e => e.id) : [];
    setSelectedIds(newIds);
    onSelect?.(newIds);
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newIds = checked ? [...selectedIds, id] : selectedIds.filter(i => i !== id);
    setSelectedIds(newIds);
    onSelect?.(newIds);
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-card-bg border-b border-border-color">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-border-color bg-card-bg text-primary"
                  checked={selectedIds.length === paginatedEvents.length && paginatedEvents.length > 0}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                />
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">事件ID</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">标题</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">等级</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">源IP</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">时间</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">状态</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">操作</th>
            </tr>
          </thead>
          <tbody>
            {paginatedEvents.map((event, index) => (
              <motion.tr
                key={event.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="table-row border-b border-border-color/50 last:border-b-0"
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-border-color bg-card-bg text-primary"
                    checked={selectedIds.includes(event.id)}
                    onChange={(e) => handleSelectOne(event.id, e.target.checked)}
                  />
                </td>
                <td className="px-4 py-3 text-sm text-primary font-medium">{event.id}</td>
                <td className="px-4 py-3 text-sm text-text-primary max-w-xs truncate">{event.title}</td>
                <td className="px-4 py-3">
                  <span className={`badge ${severityConfig[event.severity].className}`}>
                    {severityConfig[event.severity].label}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-text-secondary">{event.sourceIp}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">{formatTime(event.timestamp)}</td>
                <td className="px-4 py-3">
                  <span className={`text-sm font-medium ${statusConfig[event.status].color}`}>
                    {statusConfig[event.status].label}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    className="p-1.5 rounded-lg hover:bg-primary/10 text-text-secondary hover:text-primary transition-colors"
                    onClick={() => onAction?.('menu', event)}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-t border-border-color">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <span>每页</span>
          <select
            className="bg-card-bg border border-border-color rounded px-2 py-1 text-text-primary"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span>条，共 {events.length} 条</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="p-1.5 rounded-lg border border-border-color text-text-secondary hover:text-primary hover:border-primary disabled:opacity-50"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => p - 1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-text-secondary px-2">
            {currentPage} / {totalPages}
          </span>
          <button
            className="p-1.5 rounded-lg border border-border-color text-text-secondary hover:text-primary hover:border-primary disabled:opacity-50"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(p => p + 1)}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
