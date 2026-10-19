import React, { useMemo, useState, useEffect } from 'react';
import { Filter, Download, User, Eye, RefreshCw, ScrollText, Clock } from 'lucide-react';
import type { AuditLog } from '../types';
import { auditApi } from '../services/api';
import {
  Button,
  ContentContainer,
  EmptyState,
  LoadingState,
  Modal,
  PageHeader,
  SearchInput,
  SectionCard,
  Segmented,
  TableWrap,
} from '../components/ui';

const actionColors: Record<string, string> = {
  '用户登录': 'text-success',
  '登录': 'text-success',
  '事件确认': 'text-info',
  '规则更新': 'text-warning',
  '资产扫描': 'text-accent',
  '用户创建': 'text-primary',
  '创建': 'text-primary',
  '更新': 'text-warning',
  '删除': 'text-danger',
  '登录失败': 'text-danger'
};

type RangeKey = 'all' | '24h' | '7d';

const RANGE_MS: Record<RangeKey, number> = {
  all: Number.MAX_SAFE_INTEGER,
  '24h': 24 * 3600 * 1000,
  '7d': 7 * 24 * 3600 * 1000,
};

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [range, setRange] = useState<RangeKey>('all');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await auditApi.getLogs({ page_size: 100 });
      if (res.success && res.data) {
        const items = Array.isArray(res.data) ? res.data : res.data.items || [];
        // Map API response fields to expected AuditLog interface
        const mappedItems = items.map((item: any) => ({
          id: item.id,
          timestamp: item.timestamp,
          user: item.username || item.user || item.user_id,
          action: item.action,
          details: item.details || {},
          ip: item.ip
        }));
        setLogs(mappedItems);
      } else {
        setLogs([]);
      }
    } catch (error) {
      console.error('获取审计日志失败:', error);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const actionOptions = useMemo(
    () => Array.from(new Set(logs.map((l) => l.action).filter(Boolean))),
    [logs]
  );

  const filteredLogs = useMemo(() => {
    const term = searchTerm.toLowerCase();
    const now = Date.now();
    return logs.filter((log) => {
      const hitSearch =
        !term ||
        String(log.user).toLowerCase().includes(term) ||
        String(log.action).toLowerCase().includes(term) ||
        String(log.ip).includes(term);
      const hitAction = actionFilter === 'all' || log.action === actionFilter;
      const hitRange =
        range === 'all' ||
        now - new Date(log.timestamp).getTime() <= RANGE_MS[range];
      return hitSearch && hitAction && hitRange;
    });
  }, [logs, searchTerm, actionFilter, range]);

  const handleExport = () => {
    const header = ['时间', '用户', '操作', 'IP地址', '详情'];
    const rows = filteredLogs.map((l) => [
      new Date(l.timestamp).toLocaleString(),
      l.user,
      l.action,
      l.ip,
      JSON.stringify(l.details ?? {}),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ContentContainer>
      <PageHeader
        title="审计日志"
        icon={ScrollText}        meta={<span className="num text-caption text-text-muted">共 {filteredLogs.length} 条</span>}
        actions={
          <>
            <Button variant="secondary" icon={Download} onClick={handleExport} disabled={!filteredLogs.length}>
              导出 CSV
            </Button>
            <Button variant="primary" icon={RefreshCw} loading={loading} onClick={fetchLogs}>
              刷新
            </Button>
          </>
        }
        toolbar={
          <>
            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="搜索用户、操作或 IP"
              width="lg"
            />
            <div className="relative">
              <Filter size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                aria-label="按操作类型筛选"
                className="app-select w-[168px] pl-8"
              >
                <option value="all">全部操作类型</option>
                {actionOptions.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <Segmented<RangeKey>
              items={[
                { value: '24h', label: '近 24 小时', icon: Clock },
                { value: '7d', label: '近 7 天' },
                { value: 'all', label: '全部' },
              ]}
              value={range}
              onChange={setRange}
            />
          </>
        }
      />

      <SectionCard flush>
        {loading ? (
          <div className="p-4">
            <LoadingState skeletonRows={8} />
          </div>
        ) : filteredLogs.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="没有匹配的审计记录"
            description="调整搜索关键字、操作类型或时间范围后重试"
          />
        ) : (
          <TableWrap maxHeight="calc(100vh - 320px)">
            <table className="data-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>用户</th>
                  <th>操作</th>
                  <th>详情</th>
                  <th>IP 地址</th>
                  <th className="text-right">查看</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap text-text-muted">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <User size={13} className="text-text-muted" />
                        <span className="text-text-primary">{log.user}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`font-medium ${actionColors[log.action] || 'text-text-primary'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="max-w-[280px]">
                      <span className="truncate-1 block font-mono text-[12px] text-text-muted">
                        {JSON.stringify(log.details ?? {})}
                      </span>
                    </td>
                    <td className="whitespace-nowrap font-mono text-[12px]">{log.ip || '—'}</td>
                    <td className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Eye}
                        onClick={() => setSelectedLog(log)}
                        className="ml-auto"
                      >
                        详情
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </SectionCard>

      <Modal
        open={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title="日志详情"
        width={560}
        footer={
          <Button variant="secondary" onClick={() => setSelectedLog(null)}>关闭</Button>
        }
      >
        {selectedLog && (
          <div className="space-y-4">
            <div className="info-grid">
              <div>
                <div className="info-item-label">时间</div>
                <div className="info-item-value">{new Date(selectedLog.timestamp).toLocaleString()}</div>
              </div>
              <div>
                <div className="info-item-label">用户</div>
                <div className="info-item-value">{selectedLog.user}</div>
              </div>
              <div>
                <div className="info-item-label">操作</div>
                <div className={`info-item-value ${actionColors[selectedLog.action] || ''}`}>
                  {selectedLog.action}
                </div>
              </div>
              <div>
                <div className="info-item-label">IP 地址</div>
                <div className="info-item-value font-mono">{selectedLog.ip || '—'}</div>
              </div>
            </div>
            <div>
              <div className="info-item-label mb-1.5">详情</div>
              <pre className="scrollbar-thin max-h-64 overflow-auto rounded-lg border border-border-color bg-page-bg-subtle p-3 font-mono text-[12px] leading-relaxed text-text-secondary">
                {JSON.stringify(selectedLog.details, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </ContentContainer>
  );
}
