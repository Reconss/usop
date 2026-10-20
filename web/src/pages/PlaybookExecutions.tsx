import React, { useState, useEffect, useCallback } from 'react';
import { Button, StatCard, StatusBadge, EmptyState, LoadingState, SectionCard, Modal } from '../components/ui';
import { playbooksApi } from '../services/api';
import {
  Workflow, Play, XCircle, Loader2, History, Ban, Server, Mail,
  FileText, Globe, RefreshCw, Eye, Search, Shield
} from 'lucide-react';

/* ==========================================================================
   剧本执行记录
   --------------------------------------------------------------------------
   回答四个问题：执行了什么（剧本/关键动作）、为什么执行（关联事件/入参）、
   谁执行的（执行人/审批来源）、结果如何（状态/节点明细）。
   ========================================================================== */

interface ActionSummary {
  kind: string; tone: string; node_label?: string;
  targets: string[]; success: boolean; message: string;
}
interface ExecutionItem {
  id: string; playbook_id: number; playbook_name?: string;
  trigger_type: string; status: string;
  started_at?: string; completed_at?: string; duration?: number;
  executor: string; event_code?: string; event_title?: string;
  params?: Record<string, any>;
  actions_summary?: ActionSummary[];
  error_message?: string;
  result_summary?: any; trigger_data?: any;
}
interface NodeResult {
  node_id: string; node_label?: string; type?: string;
  success: boolean; message?: string; data?: any;
  item_count?: number; timestamp?: string;
}
const TRIGGER_LABEL: Record<string, { text: string; tone: 'primary' | 'info' | 'accent' | 'warning' }> = {
  event: { text: '事件触发', tone: 'info' },
  alert: { text: '告警触发', tone: 'info' },
  manual: { text: '手动执行', tone: 'primary' },
  schedule: { text: '定时任务', tone: 'accent' },
  webhook: { text: 'Webhook', tone: 'accent' },
  approval: { text: '审批执行', tone: 'warning' },
};

const STATUS_TONE: Record<string, 'success' | 'danger' | 'warning' | 'neutral'> = {
  completed: 'success', failed: 'danger', running: 'warning', cancelled: 'neutral',
};
const STATUS_TEXT: Record<string, string> = {
  completed: '成功', failed: '失败', running: '执行中', cancelled: '已取消',
};

const ACTION_ICON: Record<string, React.ReactNode> = {
  '封禁IP': <Ban className="w-3 h-3 text-danger flex-shrink-0" />,
  '解封IP': <Shield className="w-3 h-3 text-success flex-shrink-0" />,
  '隔离主机': <Server className="w-3 h-3 text-warning flex-shrink-0" />,
  '创建工单': <FileText className="w-3 h-3 text-primary flex-shrink-0" />,
  '发送通知': <Mail className="w-3 h-3 text-primary flex-shrink-0" />,
  'API调用': <Globe className="w-3 h-3 text-text-muted flex-shrink-0" />,
};

function fmtTime(t?: string) {
  if (!t) return '-';
  return t.replace('T', ' ').slice(0, 19);
}
function fmtDuration(sec?: number) {
  if (sec == null) return '-';
  if (sec < 1) return '<1s';
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m${sec % 60}s`;
}

const PlaybookExecutions: React.FC = () => {
  const [items, setItems] = useState<ExecutionItem[]>([]);
  const [stats, setStats] = useState({ total: 0, completed: 0, failed: 0, running: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 筛选
  const [playbooks, setPlaybooks] = useState<{ id: number; name: string }[]>([]);
  const [pbFilter, setPbFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [triggerFilter, setTriggerFilter] = useState('');
  const [keyword, setKeyword] = useState('');

  // 详情弹窗
  const [detail, setDetail] = useState<ExecutionItem | null>(null);
  const [detailNodes, setDetailNodes] = useState<NodeResult[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async (p = page) => {
    setLoading(true);
    setError('');
    try {
      const res = await playbooksApi.getExecutions({
        page: p, page_size: 20,
        playbook_id: pbFilter ? Number(pbFilter) : undefined,
        status: statusFilter || undefined,
        trigger_type: triggerFilter || undefined,
        keyword: keyword.trim() || undefined,
      });
      setItems(res?.data?.items || []);
      setStats(res?.data?.stats || { total: 0, completed: 0, failed: 0, running: 0 });
      setTotal(res?.data?.total || 0);
      setPages(res?.data?.pages || 1);
    } catch (e: any) {
      setError(e?.message || '加载执行记录失败');
    } finally {
      setLoading(false);
    }
  }, [page, pbFilter, statusFilter, triggerFilter, keyword]);

  useEffect(() => { load(1); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [pbFilter, statusFilter, triggerFilter]);
  useEffect(() => { if (page > 1) load(page); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [page]);

  useEffect(() => {
    playbooksApi.getPlaybooks({ page_size: 200 }).then((res: any) => {
      setPlaybooks((res?.data?.items || res?.data || []).map((p: any) => ({ id: p.id, name: p.name })));
    }).catch(() => { /* 筛选下拉加载失败不阻塞列表 */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDetail = async (exec: ExecutionItem) => {
    setDetail(exec);
    setDetailNodes([]);
    setDetailLoading(true);
    try {
      const res = await playbooksApi.getExecution(exec.id);
      setDetailNodes(res?.data?.node_results || []);
    } catch {
      // 详情加载失败时展示列表已有的摘要
    } finally {
      setDetailLoading(false);
    }
  };

  const hasFilter = pbFilter || statusFilter || triggerFilter || keyword.trim();

  return (
    <>
      {/* 统计栏 */}
      <div className="app-grid">
        <StatCard label="总执行次数" value={stats.total} icon={History} tone="primary" />
        <StatCard label="成功" value={stats.completed} icon={Play} tone="success" />
        <StatCard label="失败" value={stats.failed} icon={XCircle} tone="danger" />
        <StatCard label="执行中" value={stats.running} icon={Loader2} tone="warning" />
      </div>

      {/* 筛选栏 */}
      <div className="flex items-center gap-2 flex-wrap">
        <select value={pbFilter} onChange={e => { setPage(1); setPbFilter(e.target.value); }}
          className="px-2.5 py-1.5 bg-card-bg border border-border-color rounded-lg text-xs text-text-primary focus:border-primary focus:outline-none min-w-[160px]">
          <option value="">全部剧本</option>
          {playbooks.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => { setPage(1); setStatusFilter(e.target.value); }}
          className="px-2.5 py-1.5 bg-card-bg border border-border-color rounded-lg text-xs text-text-primary focus:border-primary focus:outline-none">
          <option value="">全部状态</option>
          {Object.entries(STATUS_TEXT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={triggerFilter} onChange={e => { setPage(1); setTriggerFilter(e.target.value); }}
          className="px-2.5 py-1.5 bg-card-bg border border-border-color rounded-lg text-xs text-text-primary focus:border-primary focus:outline-none">
          <option value="">全部触发方式</option>
          {Object.entries(TRIGGER_LABEL).map(([k, v]) => <option key={k} value={k}>{v.text}</option>)}
        </select>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input value={keyword} onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { setPage(1); load(1); } }}
            placeholder="搜执行人 / 事件编号 / IP"
            className="pl-8 pr-2.5 py-1.5 w-56 bg-card-bg border border-border-color rounded-lg text-xs text-text-primary placeholder-text-muted focus:border-primary focus:outline-none" />
        </div>
        <Button variant="secondary" size="sm" icon={Search} onClick={() => { setPage(1); load(1); }}>查询</Button>
        {hasFilter && (
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => { setPbFilter(''); setStatusFilter(''); setTriggerFilter(''); setKeyword(''); setPage(1); }}>
            重置
          </Button>
        )}
        <span className="ml-auto text-xs text-text-muted">共 {total} 条</span>
      </div>

      {error && (
        <div className="px-4 py-2.5 rounded-lg bg-danger/10 border border-danger/30 text-xs text-danger">{error}</div>
      )}

      {/* 执行记录表 */}
      <SectionCard title="执行记录" icon={History} flush
        actions={<Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => load()}>刷新</Button>}>
        {loading ? (
          <LoadingState text="加载执行记录..." />
        ) : items.length === 0 ? (
          <EmptyState icon={History} title={hasFilter ? '没有符合筛选条件的执行记录' : '还没有剧本执行记录'}
            description={hasFilter ? '调整筛选条件后重试' : '在事件工作台执行剧本或等待定时/告警触发后，这里会记录每次执行'} />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>开始时间</Th><Th>剧本</Th><Th>触发方式</Th><Th>执行人</Th>
                <Th>关联事件</Th><Th>关键动作</Th><Th>状态</Th><Th>耗时</Th><Th>操作</Th>
              </tr>
            </thead>
            <tbody>
              {items.map(e => {
                const trig = TRIGGER_LABEL[e.trigger_type] || { text: e.trigger_type || '-', tone: 'neutral' as const };
                return (
                  <tr key={e.id} className="hover:bg-page-bg/60 transition-colors">
                    <Td className="whitespace-nowrap">{fmtTime(e.started_at)}</Td>
                    <Td className="font-medium text-text-primary">{e.playbook_name || `#${e.playbook_id}`}</Td>
                    <Td><StatusBadge tone={trig.tone}>{trig.text}</StatusBadge></Td>
                    <Td>
                      <div className="text-xs text-text-primary">{e.executor || 'system'}</div>
                      {e.trigger_type === 'approval' && e.params && Object.keys(e.params).length > 0 && (
                        <div className="text-[10px] text-text-muted">申请人入参：{Object.values(e.params).slice(0, 2).join('、')}</div>
                      )}
                    </Td>
                    <Td>
                      {e.event_code ? (
                        <div>
                          <div className="text-xs text-primary">{e.event_code}</div>
                          {e.event_title && <div className="text-[10px] text-text-muted max-w-[180px] truncate" title={e.event_title}>{e.event_title}</div>}
                        </div>
                      ) : <span className="text-xs text-text-muted">-</span>}
                    </Td>
                    <Td>
                      {(e.actions_summary || []).length === 0 ? (
                        <span className="text-xs text-text-muted">-</span>
                      ) : (
                        <div className="space-y-1">
                          {e.actions_summary!.slice(0, 3).map((a, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-xs">
                              {ACTION_ICON[a.kind] || <Workflow className="w-3 h-3 text-text-muted flex-shrink-0" />}
                              <span className={a.success ? 'text-text-primary' : 'text-text-muted line-through'}>{a.kind}</span>
                              {a.targets.length > 0 && (
                                <span className={`font-mono text-[11px] ${a.success ? 'text-danger' : 'text-text-muted'}`}>{a.targets.join(' · ')}</span>
                              )}
                            </div>
                          ))}
                          {e.actions_summary!.length > 3 && (
                            <div className="text-[10px] text-text-muted">还有 {e.actions_summary.length - 3} 项…</div>
                          )}
                        </div>
                      )}
                    </Td>
                    <Td>
                      <StatusBadge tone={STATUS_TONE[e.status] || 'neutral'} dot>
                        {STATUS_TEXT[e.status] || e.status}
                      </StatusBadge>
                      {e.status === 'failed' && e.error_message && (
                        <div className="text-[10px] text-danger max-w-[160px] truncate mt-0.5" title={e.error_message}>{e.error_message}</div>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-text-muted">{fmtDuration(e.duration)}</Td>
                    <Td>
                      <Button variant="ghost" size="sm" icon={Eye} onClick={() => openDetail(e)}>详情</Button>
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

      {/* 执行详情弹窗 */}
      <Modal open={!!detail} onClose={() => setDetail(null)} width={760}
        title={`执行详情${detail?.playbook_name ? ` · ${detail.playbook_name}` : ''}`}
        description={detail ? `${fmtTime(detail.started_at)} · ${STATUS_TEXT[detail.status] || detail.status} · 耗时 ${fmtDuration(detail.duration)}` : ''}>
        {detail && (
          <div className="space-y-4">
            {/* 基本信息 */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
              <InfoRow label="执行人" value={detail.executor || 'system'} />
              <InfoRow label="触发方式" value={TRIGGER_LABEL[detail.trigger_type]?.text || detail.trigger_type || '-'} />
              <InfoRow label="关联事件" value={detail.event_code || '-'} />
              <InfoRow label="完成时间" value={fmtTime(detail.completed_at)} />
            </div>

            {/* 入参 */}
            {detail.params && Object.keys(detail.params).length > 0 && (
              <div>
                <div className="text-xs font-medium text-text-primary mb-1.5">执行入参</div>
                <div className="px-3 py-2 bg-page-bg rounded-lg border border-border-color font-mono text-[11px] text-text-primary space-y-0.5">
                  {Object.entries(detail.params).map(([k, v]) => (
                    <div key={k}>{k} = {typeof v === 'object' ? JSON.stringify(v) : String(v)}</div>
                  ))}
                </div>
              </div>
            )}

            {/* 关键动作 */}
            {(detail.actions_summary || []).length > 0 && (
              <div>
                <div className="text-xs font-medium text-text-primary mb-1.5">关键处置动作</div>
                <div className="space-y-1.5">
                  {detail.actions_summary!.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs px-3 py-2 bg-page-bg rounded-lg border border-border-color">
                      {ACTION_ICON[a.kind] || <Workflow className="w-3.5 h-3.5 text-text-muted mt-0.5 flex-shrink-0" />}
                      <div>
                        <span className={a.success ? 'text-text-primary' : 'text-text-muted line-through'}>{a.kind}</span>
                        {a.node_label && <span className="text-text-muted">（{a.node_label}）</span>}
                        {a.targets.length > 0 && <span className="ml-1 font-mono text-danger">{a.targets.join(' · ')}</span>}
                        <div className="text-[11px] text-text-muted mt-0.5">{a.message}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 节点时间线 */}
            <div>
              <div className="text-xs font-medium text-text-primary mb-1.5">节点执行明细</div>
              {detailLoading ? (
                <LoadingState text="加载节点明细..." />
              ) : detailNodes.length === 0 ? (
                <EmptyState title="无节点明细" description="执行记录未包含节点级结果（可能是早期记录）" />
              ) : (
                <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                  {detailNodes.map((n, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-xs px-3 py-2 bg-page-bg rounded-lg border border-border-color">
                      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${n.success ? 'bg-success' : 'bg-danger'}`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-text-primary font-medium">{n.node_label || n.node_id}</span>
                          {n.type && <span className="px-1.5 py-0.5 rounded bg-card-bg border border-border-color text-[10px] text-text-muted">{n.type}</span>}
                          {n.item_count != null && n.item_count > 0 && <span className="text-[10px] text-text-muted">{n.item_count} 项输出</span>}
                        </div>
                        {n.message && <div className="text-[11px] text-text-muted mt-0.5 break-all">{n.message}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center gap-2 min-w-0">
    <span className="text-text-muted flex-shrink-0">{label}</span>
    <span className="text-text-primary truncate">{value}</span>
  </div>
);

const TableWrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="overflow-x-auto"><table className="w-full text-xs">{children}</table></div>
);
const Th: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <th className={`text-left px-4 py-2.5 text-[11px] font-medium text-text-muted border-b border-border-color whitespace-nowrap ${className || ''}`}>{children}</th>
);
const Td: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <td className={`px-4 py-2.5 border-b border-border-color/60 align-top ${className || ''}`}>{children}</td>
);

export default PlaybookExecutions;
