import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  Activity,
  ShieldAlert,
  Server,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Loader2
} from 'lucide-react';
import {
  dashboardMetrics,
  eventTrendData,
  eventTypeDistribution,
  attackSources,
  riskAssets
} from '../data/mockData';
import MetricCard from '../components/MetricCard';
import EventTrendChart from '../components/EventTrendChart';
import EventTypeChart from '../components/EventTypeChart';
import AttackSourceChart from '../components/AttackSourceChart';
import RiskAssetList from '../components/RiskAssetList';

const Dashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      setLastUpdate(new Date());
    }, 1000);
  };

  const metrics = [
    { title: '今日告警数', value: dashboardMetrics.todayAlerts.toLocaleString(), trend: dashboardMetrics.alertsTrend, icon: AlertCircle, color: '#6366f1' },
    { title: '待处理事件', value: dashboardMetrics.pendingEvents.toString(), trend: dashboardMetrics.pendingTrend, icon: Activity, color: '#f97316' },
    { title: '资产数量', value: '1,234', trend: 5, icon: Server, color: '#10b981' },
    { title: '高危资产', value: dashboardMetrics.highRiskAssets.toString(), trend: dashboardMetrics.assetsTrend, icon: ShieldAlert, color: '#ef4444' }
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
        {metrics.map((metric, index) => (
          <motion.div key={metric.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }}>
            <MetricCard title={metric.title} value={metric.value} icon={metric.icon} color={metric.color} trend={metric.trend} />
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <motion.div className="col-span-2" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <div className="glass-card rounded-card p-5">
            <h2 className="text-card-title text-text-primary mb-4">事件趋势 (24小时)</h2>
            <EventTrendChart data={eventTrendData} />
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <div className="glass-card rounded-card p-5">
            <h2 className="text-card-title text-text-primary mb-4">事件类型分布</h2>
            <EventTypeChart data={eventTypeDistribution} />
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

export default Dashboard;
