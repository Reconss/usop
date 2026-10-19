import React, { useState, useEffect, useCallback } from 'react';
import {
  Gauge, CheckCircle2, ShieldX, Timer, Crosshair, TrendingUp, AlertTriangle,
  ListOrdered, Network, BarChart3, RefreshCw
} from 'lucide-react';
import { kpiApi } from '../services/api';
import { useChartTokens } from '../styles/chartTheme';
import {
  Button,
  ContentContainer,
  EmptyState,
  LoadingState,
  PageHeader,
  SectionCard,
  Segmented,
  StatCard,
} from '../components/ui';

interface KpiData {
  days: number; total_alerts: number; resolved: number; false_positives: number;
  resolution_rate: number; false_positive_rate: number; mttr_hours: number;
  asset_hit_rate: number; by_severity: Record<string, number>;
  top_categories: { category: string; count: number }[];
  top_src_ips: { src_ip: string; count: number }[];
}

/** 排行条：统一横条样式，避免每个页面各写一套 */
const RankBars: React.FC<{
  rows: { label: string; value: number; mono?: boolean }[];
  colorFrom: string;
  colorTo: string;
  emptyText: string;
}> = ({ rows, colorFrom, colorTo, emptyText }) => {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) {
    return <EmptyState compact title={emptyText} />;
  }
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={`${r.label}-${i}`}>
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className={`truncate-1 text-[12px] text-text-secondary ${r.mono ? 'font-mono' : ''}`}>
              {r.label}
            </span>
            <span className="num shrink-0 text-[11px] text-text-muted">{r.value}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(3, (r.value / max) * 100)}%`,
                background: `linear-gradient(90deg, ${colorFrom}, ${colorTo})`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

const OperationsKPI: React.FC = () => {
  const t = useChartTokens();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res: any = await kpiApi.overview(days);
      if (res?.success) setData(res.data);
      else setError(res?.error || '加载失败');
    } catch (e: any) { setError('加载失败: ' + e.message); }
    finally { setLoading(false); }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  return (
    <ContentContainer>
      <PageHeader
        title="运营总览"
        icon={Gauge}        meta={<span className="num text-caption text-text-muted">统计周期 {days} 天</span>}
        actions={
          <>
            <Segmented
              items={[
                { value: 7, label: '近 7 天' },
                { value: 30, label: '近 30 天' },
                { value: 90, label: '近 90 天' },
              ]}
              value={days}
              onChange={setDays}
            />
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={load} disabled={loading}>
              刷新
            </Button>
          </>
        }
      />

      {loading && !data && <LoadingState label="正在统计运营指标…" skeletonRows={5} />}

      {error && (
        <SectionCard>
          <EmptyState
            icon={AlertTriangle}
            title="运营指标加载失败"
            description={error}
            action={<Button variant="secondary" size="sm" onClick={load}>重试</Button>}
          />
        </SectionCard>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard
              label="告警总量"
              value={String(data.total_alerts)}
              icon={BarChart3}
              tone="primary"
              emphasize
              hint={`近 ${data.days} 天`}
            />
            <StatCard
              label="处置率"
              value={data.resolution_rate}
              unit="%"
              icon={CheckCircle2}
              tone="success"
              hint={`${data.resolved} 条已处置`}
            />
            <StatCard
              label="误报率"
              value={data.false_positive_rate}
              unit="%"
              icon={ShieldX}
              tone="danger"
              hint={`${data.false_positives} 条误报`}
            />
            <StatCard
              label="平均处置耗时"
              value={data.mttr_hours}
              unit="h"
              icon={Timer}
              tone="warning"
              hint="MTTR"
            />
            <StatCard
              label="资产命中率"
              value={data.asset_hit_rate}
              unit="%"
              icon={Crosshair}
              tone="info"
              hint="告警命中资产占比"
            />
            <StatCard
              label="严重级别分布"
              value={Object.keys(data.by_severity || {}).length}
              unit="级"
              icon={TrendingUp}
              tone="accent"
              hint={
                Object.entries(data.by_severity || {})
                  .slice(0, 2)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(' · ') || undefined
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SectionCard title="Top 5 告警分类" description="按告警条数排序" icon={ListOrdered}>
              <RankBars
                rows={(data.top_categories || []).map((c) => ({ label: c.category || '未分类', value: c.count }))}
                colorFrom={t.primary}
                colorTo={t.accent}
                emptyText="该周期内没有告警分类数据"
              />
            </SectionCard>

            <SectionCard title="Top 5 源 IP" description="按告警条数排序" icon={Network}>
              <RankBars
                rows={(data.top_src_ips || []).map((c) => ({ label: c.src_ip || '未知', value: c.count, mono: true }))}
                colorFrom={t.danger}
                colorTo={t.high}
                emptyText="该周期内没有可统计的源 IP"
              />
            </SectionCard>
          </div>
        </>
      )}
    </ContentContainer>
  );
};

export default OperationsKPI;
