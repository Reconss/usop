import React, { useState, useEffect, useCallback } from 'react';
import {
  Button, ContentContainer, EmptyState, LoadingState, PageHeader,
  SectionCard, StatCard, StatusBadge, TableWrap,
} from '../components/ui';
import { useConfirmDialog, ConfirmDialog } from '../components/Dialogs';
import { playbooksApi } from '../services/api';
import {
  Ban, RefreshCw, Search, ShieldCheck, Clock, History, Loader2,
} from 'lucide-react';

/* ==========================================================================
   封堵清单
   --------------------------------------------------------------------------
   剧本 block_ip / 主机隔离降级等动作封禁 IP 的**全量历史**（不再是快照）：
   每个 IP 一行记录，含封禁时间、解封时间、实际封禁时长与预设时长；
   仍封禁中的支持一键解封（应用内确认，同步清除封禁规则）。
   ========================================================================== */

interface BlockHistoryItem {
  id: number;
  ip: string;
  reason?: string;
  source?: string;
  method?: string;
  duration?: string;
  blocked_at?: string;
  expires_at?: string;
  unblocked_at?: string;
  unblock_reason?: string;
  block_seconds?: number | null;
  status: 'active' | 'unblocked' | 'expired';
  operator?: string;
}
interface BlockStats { active: number; today_blocks: number; today_unblocks: number; total: number; }

const STATUS_META: Record<string, { text: string; tone: 'danger' | 'success' | 'neutral' }> = {
  active: { text: '封禁中', tone: 'danger' },
  unblocked: { text: '已解封', tone: 'success' },
  expired: { text: '已到期', tone: 'neutral' },
};

const SOURCE_LABEL: Record<string, string> = {
  playbook: '剧本封堵',
  quarantine: '主机隔离降级',
  manual: '手动封堵',
};

const METHOD_LABEL: Record<string, string> = {
  api: '平台 API',
  iptables: 'iptables',
  device_api: '设备 API',
};

function fmtTime(t?: string) {
  if (!t) return '-';
  return t.replace('T', ' ').slice(0, 19);
}

/** 秒 → 「2 天 3 小时 / 3 小时 25 分 / 12 分 5 秒」 */
function fmtDuration(sec?: number | null) {
  if (sec == null) return '-';
  if (sec < 60) return `${sec} 秒`;
  if (sec < 3600) {
    const m = Math.floor(sec / 60), s = sec % 60;
    return s ? `${m} 分 ${s} 秒` : `${m} 分`;
  }
  if (sec < 86400) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
  }
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600);
  return h ? `${d} 天 ${h} 小时` : `${d} 天`;
}

const BlockedIps: React.FC = () => {
  const [items, setItems] = useState<BlockHistoryItem[]>([]);
  const [stats, setStats] = useState<BlockStats>({ active: 0, today_blocks: 0, today_unblocks: 0, total: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 筛选
  const [ipKw, setIpKw] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // 解封
  const [unblocking, setUnblocking] = useState('');
  const [unblockMsg, setUnblockMsg] = useState('');

  // 应用内确认弹窗（替代浏览器原生 confirm）
  const { ask, confirmProps } = useConfirmDialog('解封确认');

  const load = useCallback(async (p = page) => {
    setLoading(true);
    setError('');
    try {
      const res = await playbooksApi.getBlockHistory({
        page: p, page_size: 20,
        ip: ipKw.trim() || undefined,
        status: statusFilter || undefined,
      });
      setItems(res?.data?.items || []);
      setStats(res?.data?.stats || { active: 0, today_blocks: 0, today_unblocks: 0, total: 0 });
      setTotal(res?.data?.total || 0);
      setPages(res?.data?.pages || 1);
    } catch (e: any) {
      setError(e?.message || '加载封堵清单失败');
    } finally {
      setLoading(false);
    }
  }, [page, ipKw, statusFilter]);

  useEffect(() => { load(1); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [ipKw, statusFilter]);
  useEffect(() => { if (page > 1) load(page); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [page]);

  const handleUnblock = async (ip: string) => {
    const ok = await ask({
      message: `确认解封 IP ${ip}？解封后将同步清除对应的封禁规则。`,
      danger: true,
      confirmText: '解封',
    });
    if (!ok) return;
    setUnblocking(ip);
    setUnblockMsg('');
    try {
      const res = await playbooksApi.unblockIp(ip);
      setUnblockMsg(res?.message || `已解封 ${ip}`);
      load(1);
    } catch (e: any) {
      setUnblockMsg(e?.message || '解封失败');
    } finally {
      setUnblocking('');
    }
  };

  const hasFilter = ipKw.trim() || statusFilter;

  return (
    <ContentContainer>
      <PageHeader
        title="封堵清单"
        description="剧本与隔离动作封禁 IP 的全量记录：封禁时间、解封时间、实际封禁时长一屏可查；对仍封禁中的 IP 可手动解封"
        icon={Ban}
        actions={<Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => load()}>刷新</Button>}
      />

      {/* 统计栏 */}
      <div className="app-grid">
        <StatCard label="封禁中" value={stats.active} icon={Ban} tone="danger"
          hint="快照中仍在封堵的 IP" />
        <StatCard label="今日封禁" value={stats.today_blocks} icon={Clock} tone="primary"
          hint="今日新产生的封禁记录" />
        <StatCard label="今日解封" value={stats.today_unblocks} icon={ShieldCheck} tone="success"
          hint="今日完成解封（含到期自动）" />
        <StatCard label="累计封堵" value={stats.total} icon={History} tone="neutral"
          hint="历史封禁事件总数" />
      </div>

      {/* 筛选栏 */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input value={ipKw} onChange={e => setIpKw(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { setPage(1); load(1); } }}
            placeholder="搜 IP（支持模糊）"
            className="pl-8 pr-2.5 py-1.5 w-56 bg-card-bg border border-border-color rounded-lg text-xs text-text-primary placeholder-text-muted focus:border-primary focus:outline-none" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-2.5 py-1.5 bg-card-bg border border-border-color rounded-lg text-xs text-text-primary focus:border-primary focus:outline-none">
          <option value="">全部状态</option>
          <option value="active">封禁中</option>
          <option value="unblocked">已解封</option>
          <option value="expired">已到期</option>
        </select>
        <Button variant="secondary" size="sm" icon={Search} onClick={() => { setPage(1); load(1); }}>查询</Button>
        {hasFilter && (
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => { setIpKw(''); setStatusFilter(''); setPage(1); }}>
            重置
          </Button>
        )}
        <span className="ml-auto text-xs text-text-muted">共 {total} 条</span>
      </div>

      {error && (
        <div className="px-4 py-2.5 rounded-lg bg-danger/10 border border-danger/30 text-xs text-danger">{error}</div>
      )}
      {unblockMsg && (
        <div className="px-4 py-2.5 rounded-lg bg-primary/10 border border-primary/30 text-xs text-primary">{unblockMsg}</div>
      )}

      {/* 历史表 */}
      <SectionCard title="封堵记录" icon={History} flush>
        {loading && items.length === 0 ? (
          <div className="px-4 py-8"><LoadingState inline label="加载中…" /></div>
        ) : items.length === 0 ? (
          <EmptyState icon={Ban} title={hasFilter ? '没有符合条件的封堵记录' : '还没有封堵记录'}
            description={hasFilter ? '调整筛选条件后重试' : '剧本执行封禁 IP 动作后，记录会出现在这里'} />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>IP</Th><Th>状态</Th><Th>封禁时间</Th><Th>解封时间</Th>
                <Th>封禁时长</Th><Th>封禁原因</Th><Th>封堵方式</Th><Th>来源</Th><Th>操作</Th>
              </tr>
            </thead>
            <tbody>
              {items.map(b => {
                const st = STATUS_META[b.status] || { text: b.status, tone: 'neutral' as const };
                return (
                  <tr key={b.id} className="hover:bg-page-bg/60 transition-colors">
                    <Td className="font-mono text-xs text-text-primary whitespace-nowrap">{b.ip}</Td>
                    <Td><StatusBadge tone={st.tone} dot>{st.text}</StatusBadge></Td>
                    <Td className="whitespace-nowrap text-xs text-text-secondary">{fmtTime(b.blocked_at)}</Td>
                    <Td className="whitespace-nowrap text-xs text-text-secondary">{fmtTime(b.unblocked_at)}</Td>
                    <Td className="whitespace-nowrap">
                      <div className="text-xs text-text-primary">
                        {b.status === 'active'
                          ? <span className="text-danger">{fmtDuration(b.block_seconds)}（持续中）</span>
                          : fmtDuration(b.block_seconds)}
                      </div>
                      {b.duration && (
                        <div className="text-[10px] text-text-muted mt-0.5">预设 {b.duration}</div>
                      )}
                    </Td>
                    <Td>
                      <span className="text-xs text-text-secondary max-w-[220px] truncate block" title={b.reason || ''}>
                        {b.reason || '-'}
                      </span>
                    </Td>
                    <Td className="text-xs text-text-muted whitespace-nowrap">
                      {METHOD_LABEL[b.method || ''] || b.method || '-'}
                    </Td>
                    <Td className="text-xs text-text-muted whitespace-nowrap">
                      {SOURCE_LABEL[b.source || ''] || b.source || '-'}
                    </Td>
                    <Td>
                      {b.status === 'active' ? (
                        <Button variant="danger" size="sm"
                          onClick={() => handleUnblock(b.ip)}
                          disabled={unblocking === b.ip}>
                          {unblocking === b.ip ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '解封'}
                        </Button>
                      ) : (
                        <span className="text-[10px] text-text-muted">
                          {b.operator ? `解封人 ${b.operator}` : (b.unblock_reason || '-')}
                        </span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border-color">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</Button>
            <span className="text-xs text-text-muted">{page} / {pages}</span>
            <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>下一页</Button>
          </div>
        )}
      </SectionCard>

      {/* 解封确认弹窗（应用内，替代浏览器原生 confirm） */}
      <ConfirmDialog {...confirmProps} />
    </ContentContainer>
  );
};

const Th: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <th className={`text-left px-4 py-2.5 text-[11px] font-medium text-text-muted border-b border-border-color whitespace-nowrap ${className || ''}`}>{children}</th>
);
const Td: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <td className={`px-4 py-2.5 border-b border-border-color/60 align-top ${className || ''}`}>{children}</td>
);

export default BlockedIps;
