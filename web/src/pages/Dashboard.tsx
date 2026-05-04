import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Activity,
  ShieldAlert,
  Server,
  RefreshCw,
  Loader2,
  ArrowRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { dashboardApi } from '../services/api';
import MetricCard from '../components/MetricCard';
import EventTrendChart from '../components/EventTrendChart';
import EventTypeChart from '../components/EventTypeChart';
import AttackSourceChart from '../components/AttackSourceChart';
import RiskAssetList from '../components/RiskAssetList';

// 默认数据（API失败时显示）
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

const defaultDistribution = [
  { name: '无数据', value: 1, color: '#6366f1' }
];

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
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  
  // 数据状态
  const [metrics, setMetrics] = useState(defaultMetrics);
  const [trendData, setTrendData] = useState(defaultTrendData);
  const [distribution, setDistribution] = useState(defaultDistribution);
  const [attackSources, setAttackSources] = useState(defaultAttackSources);
  const [riskAssets, setRiskAssets] = useState(defaultRiskAssets);

  const fetchData = async () => {
    try {
      // 并行获取多个API数据
      const [metricsRes, trendRes, distributionRes, alertsRes, assetsRes] = await Promise.allSettled([
        dashboardApi.getMetrics(),
        dashboardApi.getAlertsTrend(7),
        dashboardApi.getEventDistribution(),
        dashboardApi.getTopAlerts(5),
        assetsApi.getAssets({ page_size: 100 })
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

  const metricCards = [
    { id: 'alerts', title: '今日告警数', value: (metrics.todayAlerts || 0).toLocaleString(), trend: metrics.alertsTrend || 0, icon: AlertCircle, color: '#6366f1', link: '/detection/investigation' },
    { id: 'events', title: '待处理事件', value: (metrics.pendingEvents || 0).toString(), trend: metrics.pendingTrend || 0, icon: Activity, color: '#f97316', link: '/detection/events' },
    { id: 'assets', title: '资产数量', value: (metrics.totalAssets || 0).toLocaleString(), trend: metrics.assetsTrend || 0, icon: Server, color: '#10b981', link: '/assets/inventory' },
    { id: 'risk', title: '高危资产', value: (metrics.highRiskAssets || 0).toString(), trend: metrics.healthTrend || 0, icon: ShieldAlert, color: '#ef4444', link: '/assets/inventory' }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <p className="text-text-secondary">加载中...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-page-title text-text-primary">安全态势仪表盘</h1>
        <div className="flex items-center gap-4">
          <span className="text-label text-text-muted">最后更新: {lastUpdate.toLocaleTimeString()}</span>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            刷新
          </motion.button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {metricCards.map((metric, index) => (
          <motion.div
            key={metric.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="relative"
            onMouseEnter={() => setHoveredCard(metric.id)}
            onMouseLeave={() => setHoveredCard(null)}
          >
            <div onClick={() => handleCardClick(metric.id)} className="cursor-pointer">
              <MetricCard title={metric.title} value={metric.value} icon={metric.icon} color={metric.color} trend={metric.trend} />
            </div>
            {/* 悬停时显示跳转提示 */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: hoveredCard === metric.id ? 1 : 0, y: hoveredCard === metric.id ? 0 : 10 }}
              className="absolute bottom-2 right-2 flex items-center gap-1 text-xs text-primary"
            >
              <span>点击查看</span>
              <ArrowRight className="w-3 h-3" />
            </motion.div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <motion.div className="col-span-2" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <div className="glass-card rounded-card p-5">
            <h2 className="text-card-title text-text-primary mb-4">事件趋势 (24小时)</h2>
            <EventTrendChart data={trendData} />
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <div className="glass-card rounded-card p-5">
            <h2 className="text-card-title text-text-primary mb-4">事件类型分布</h2>
            <EventTypeChart data={distribution} />
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
          <div className="glass-card rounded-card p-5">
            <h2 className="text-card-title text-text-primary mb-4">Top 5 攻击源 IP</h2>
            <AttackSourceChart data={attackSources} />
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
          <div className="glass-card rounded-card p-5">
            <h2 className="text-card-title text-text-primary mb-4">Top 5 风险资产</h2>
            <RiskAssetList data={riskAssets} />
          </div>
        </motion.div>
      </div>
    </div>
  );
};

// 导入assetsApi
import { assetsApi } from '../services/api';

export default Dashboard;
