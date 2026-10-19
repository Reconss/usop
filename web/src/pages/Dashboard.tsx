import React, { useState, useEffect } from 'react';
import {
  AlertCircle,
  Activity,
  ShieldAlert,
  Server,
  HardDrive,
  RefreshCw,
  ArrowRight,
  type LucideIcon
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { dashboardApi, assetsApi, systemStatusApi } from '../services/api';
import EventTrendChart from '../components/EventTrendChart';
import EventTypeChart from '../components/EventTypeChart';
import AttackSourceChart from '../components/AttackSourceChart';
import RiskAssetList from '../components/RiskAssetList';
import {
  Button,
  ContentContainer,
  PageHeader,
  SectionCard,
  StatCard,
  LoadingState,
  type StatTone,
} from '../components/ui';

// 默认数据（API 失败时显示，全部为 0 空值，不使用任何编造数据）
const defaultMetrics = {
  todayAlerts: 0,
  pendingEvents: 0,
  totalAssets: 0,
  highRiskAssets: 0,
  alertsTrend: 0,
  pendingTrend: 0,
  assetsTrend: 0,
  healthTrend: 0
};

const defaultTrendData = {
  timestamps: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '23:59'],
  critical: [0, 0, 0, 0, 0, 0, 0],
  high: [0, 0, 0, 0, 0, 0, 0],
  medium: [0, 0, 0, 0, 0, 0, 0],
  low: [0, 0, 0, 0, 0, 0, 0]
};

const defaultDistribution: { name: string; value: number; color?: string }[] = [];

const defaultAttackSources = [
  { ip: '-', country: '-', count: 0 }
];

const defaultRiskAssets = [
  { id: '-', name: '暂无数据', type: '-', riskScore: 0, lastSeen: '-' }
];

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  // 数据状态
  const [metrics, setMetrics] = useState(defaultMetrics);
  const [trendData, setTrendData] = useState(defaultTrendData);
  const [distribution, setDistribution] = useState(defaultDistribution);
  const [attackSources, setAttackSources] = useState(defaultAttackSources);
  const [riskAssets, setRiskAssets] = useState(defaultRiskAssets);
  const [storageStatus, setStorageStatus] = useState<any>(null);

  const fetchData = async () => {
    try {
      // 并行获取多个API数据
      const [metricsRes, trendRes, distributionRes, alertsRes, assetsRes, storageRes] = await Promise.allSettled([
        dashboardApi.getMetrics(),
        dashboardApi.getAlertsTrend(7),
        dashboardApi.getEventDistribution(),
        dashboardApi.getTopAlerts(5),
        assetsApi.getAssets({ page_size: 100 }),
        systemStatusApi.getStorageStatus()
      ]);

      // 处理指标数据
      if (metricsRes.status === 'fulfilled' && metricsRes.value.success) {
        setMetrics(metricsRes.value.data);
      }

      // 处理趋势数据
      if (trendRes.status === 'fulfilled' && trendRes.value.success) {
        setTrendData(trendRes.value.data);
      }

      // 处理分布数据
      if (distributionRes.status === 'fulfilled' && distributionRes.value.success) {
        setDistribution(distributionRes.value.data);
      }

      // 处理攻击源数据（从告警中提取）
      if (alertsRes.status === 'fulfilled' && alertsRes.value.success) {
        const sources: Record<string, { ip: string; country: string; count: number }> = {};
        alertsRes.value.data.items?.forEach((alert: any) => {
          if (alert.source_ip) {
            if (!sources[alert.source_ip]) {
              sources[alert.source_ip] = { ip: alert.source_ip, country: 'CN', count: 0 };
            }
            sources[alert.source_ip].count++;
          }
        });
        const topSources = Object.values(sources)
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);
        if (topSources.length > 0) setAttackSources(topSources);
      }

      // 处理风险资产数据
      if (assetsRes.status === 'fulfilled' && assetsRes.value.success) {
        const assets = assetsRes.value.data.items || [];
        const riskyAssets = assets
          .filter((a: any) => a.risk_score && a.risk_score > 70)
          .sort((a: any, b: any) => b.risk_score - a.risk_score)
          .slice(0, 5)
          .map((a: any) => ({
            id: String(a.id),
            name: a.name || a.hostname || '-',
            type: a.asset_type || a.type || 'unknown',
            riskScore: a.risk_score || 0,
            lastSeen: a.last_seen || a.updated_at || '-'
          }));
        if (riskyAssets.length > 0) setRiskAssets(riskyAssets);
      }

      // 处理存储状态
      if (storageRes.status === 'fulfilled' && storageRes.value.success) {
        setStorageStatus(storageRes.value.data);
      }
    } catch (error) {
      console.error('Dashboard API Error:', error);
    }
  };

  useEffect(() => {
    fetchData();
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
    setLastUpdate(new Date());
  };

  // 指标卡片点击处理
  const handleCardClick = (cardType: string) => {
    switch (cardType) {
      case 'alerts':
        navigate('/detection/investigation?status=new&severity=all');
        break;
      case 'events':
        navigate('/detection/events?status=open');
        break;
      case 'assets':
        navigate('/assets/inventory');
        break;
      case 'risk':
        navigate('/assets/inventory?risk=high');
        break;
    }
  };

  const storageHealthy = storageStatus?.elasticsearch?.status === 'healthy';

  const metricCards: {
    id: string;
    title: string;
    value: string;
    trend: number;
    icon: LucideIcon;
    tone: StatTone;
  }[] = [
    { id: 'alerts', title: '今日告警数', value: (metrics.todayAlerts || 0).toLocaleString(), trend: metrics.alertsTrend || 0, icon: AlertCircle, tone: 'primary' },
    { id: 'events', title: '待处理事件', value: (metrics.pendingEvents || 0).toString(), trend: metrics.pendingTrend || 0, icon: Activity, tone: 'warning' },
    { id: 'assets', title: '资产数量', value: (metrics.totalAssets || 0).toLocaleString(), trend: metrics.assetsTrend || 0, icon: Server, tone: 'info' },
    { id: 'risk', title: '高危资产', value: (metrics.highRiskAssets || 0).toString(), trend: metrics.healthTrend || 0, icon: ShieldAlert, tone: 'danger' },
    { id: 'storage', title: '存储状态', value: storageHealthy ? '正常' : '未知', trend: 0, icon: HardDrive, tone: storageHealthy ? 'success' : 'neutral' }
  ];

  if (loading) {
    return (
      <ContentContainer>
        <LoadingState label="正在加载安全态势数据…" />
      </ContentContainer>
    );
  }

  return (
    <ContentContainer>
      <PageHeader
        title="安全态势仪表盘"
        icon={Activity}        meta={
          <span className="text-caption text-text-muted">
            最后更新 {lastUpdate.toLocaleTimeString()}
          </span>
        }
        actions={
          <Button
            variant="secondary"
            icon={RefreshCw}
            loading={refreshing}
            onClick={handleRefresh}
          >
            刷新
          </Button>
        }
      />

      {/* 核心指标 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metricCards.map((metric) => (
          <StatCard
            key={metric.id}
            label={metric.title}
            value={metric.value}
            icon={metric.icon}
            tone={metric.tone}
            emphasize={metric.id === 'alerts'}
            hint={
              metric.id === 'storage'
                ? undefined
                : metric.trend === 0
                  ? '与昨日持平'
                  : undefined
            }
            onClick={metric.id === 'storage' ? () => navigate('/data/ingestion') : () => handleCardClick(metric.id)}
          />
        ))}
      </div>

      {/* 趋势与分布 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <SectionCard
          className="lg:col-span-2"
          title="事件趋势（24 小时）"
          description="按严重级别统计的事件数量变化"
          actions={
            <span className="flex items-center gap-3 text-caption text-text-muted">
              <span className="flex items-center gap-1"><i className="status-dot critical" />危急</span>
              <span className="flex items-center gap-1"><i className="status-dot high" />高危</span>
              <span className="flex items-center gap-1"><i className="status-dot medium" />中危</span>
              <span className="flex items-center gap-1"><i className="status-dot low" />低危</span>
            </span>
          }
        >
          <EventTrendChart data={trendData} />
        </SectionCard>

        <SectionCard title="事件类型分布" description="按分类的事件占比">
          {distribution.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-[12px] text-text-muted">
              暂无分布数据
            </div>
          ) : (
            <EventTypeChart data={distribution} />
          )}
        </SectionCard>
      </div>

      {/* 攻击源与风险资产 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard
          title="Top 5 攻击源 IP"
          description="按告警条数排序"
          actions={
            <Button variant="ghost" size="sm" iconRight={ArrowRight} onClick={() => navigate('/detection/investigation')}>
              查看告警
            </Button>
          }
        >
          <AttackSourceChart data={attackSources.filter((s) => s.ip !== '-')} />
        </SectionCard>

        <SectionCard
          title="Top 5 风险资产"
          description="风险分高于 70 的资产"
          actions={
            <Button variant="ghost" size="sm" iconRight={ArrowRight} onClick={() => navigate('/assets/inventory')}>
              资产清单
            </Button>
          }
        >
          {riskAssets.filter((a) => a.id !== '-').length === 0 ? (
            <div className="py-8 text-center text-[12px] text-text-muted">暂无高风险资产</div>
          ) : (
            <RiskAssetList data={riskAssets} />
          )}
        </SectionCard>
      </div>
    </ContentContainer>
  );
};

export default Dashboard;
