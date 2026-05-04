import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database, Activity, ArrowDownCircle, HardDrive, LayoutGrid
} from 'lucide-react';
import LogConfigSidebar from '../components/LogConfigSidebar';
import DataSourceManager from '../components/DataSourceManager';
import SmartParser from '../components/SmartParser';
import LogTypeManager from '../components/LogTypeManager';
import FormatTemplate from '../components/FormatTemplate';
import StorageConfig from '../components/StorageConfig';
import { dataSourcesApi } from '../services/api';

// ==================== Mock数据 ====================

const mockDataSources: any[] = [
  {
    id: 1,
    name: 'Kafka-安全日志',
    type: 'pull',
    protocol: 'kafka',
    status: 'connected',
    lastSync: '2026-05-01T10:30:00Z',
    totalEvents: 156729384,
    health: 99
  },
  {
    id: 2,
    name: 'Syslog-网络设备',
    type: 'push',
    protocol: 'syslog',
    status: 'connected',
    lastSync: '2026-05-01T10:29:45Z',
    totalEvents: 28473920,
    health: 95
  },
  {
    id: 3,
    name: 'S3-审计日志',
    type: 'pull',
    protocol: 's3',
    status: 'syncing',
    lastSync: '2026-05-01T10:28:00Z',
    totalEvents: 89347291,
    health: 92
  },
  {
    id: 4,
    name: 'Webhook-告警推送',
    type: 'push',
    protocol: 'webhook',
    status: 'error',
    lastSync: '2026-05-01T09:15:00Z',
    totalEvents: 45238901,
    health: 45
  }
];

export default function DataIngestion() {
  const [activeSection, setActiveSection] = useState('sources');
  const [dataSources, setDataSources] = useState<any[]>([]);

  // 从后端 API 获取数据源
  useEffect(() => {
    const fetchDataSources = async () => {
      try {
        const response = await dataSourcesApi.getDataSources({ page_size: 100 });
        if (response.success && response.data) {
          const items = Array.isArray(response.data) ? response.data : response.data.items || [];
          // 转换后端数据格式为前端格式
          const formattedSources: any[] = items.map((item: any) => ({
            id: String(item.id),
            name: item.name || item.source_name || `数据源 ${item.id}`,
            type: item.type === 'pull' ? 'pull' : item.type === 'push' ? 'push' : 'pull',
            protocol: item.protocol || item.source_type || 'unknown',
            status: item.status === 'active' ? 'connected' : 
                    item.status === 'inactive' ? 'disconnected' : 
                    item.status || 'connected',
            lastSync: item.last_sync || item.updated_at || new Date().toISOString(),
            eventsPerSecond: item.events_per_second || 0,
            totalEvents: item.total_events || 0,
            health: item.health || 100,
            config: item.config || {},
            parsePipelines: item.parse_pipelines || [],
            storageConfig: item.storage_config || { hypertable: '', retentionDays: 30, compression: true, indexes: [], partitionInterval: '1 day' },
            productMappings: item.product_mappings || [],
            stats: item.stats || { parsedSuccess: 0, parsedFailed: 0 }
          }));
          setDataSources(formattedSources);
        }
      } catch (error) {
        console.error('获取数据源失败:', error);
        // 如果 API 失败，使用 mock 数据作为后备
        setDataSources(mockDataSources);
      }
    };

    fetchDataSources();
  }, []);

  // 计算统计数据
  const stats = {
    total: dataSources.length,
    connected: dataSources.filter(s => s.status === 'connected').length,
    syncing: dataSources.filter(s => s.status === 'syncing').length,
    errors: dataSources.filter(s => s.status === 'error').length,
    totalEvents: dataSources.reduce((sum, s) => sum + (s.totalEvents || 0), 0),
  };

  // 直接传递所有数据源给 DataSourceManager，让它自己处理过滤
  const renderContent = () => {
    switch (activeSection) {
      case 'sources':
        return <DataSourceManager dataSources={dataSources} />;
      case 'parsing':
        return <SmartParser />;
      case 'logtypes':
        return <LogTypeManager />;
      case 'templates':
        return <FormatTemplate />;
      case 'storage':
        return <StorageConfig />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full gap-6">
      <LogConfigSidebar activeSection={activeSection} onSectionChange={setActiveSection} dataSourceCount={dataSources.length} />
      
      <div className="flex-1 overflow-auto">
        {/* 页面头部和统计概览 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-semibold text-text-primary">数据接入</h1>
              <p className="text-sm text-text-muted mt-1">管理和监控所有日志数据源</p>
            </div>
          </div>
          
          {/* 统计概览卡片 */}
          <div className="grid grid-cols-5 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-xl p-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Database className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-text-primary">{stats.total}</div>
                  <div className="text-xs text-text-muted">数据源总数</div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20 rounded-xl p-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-emerald-600">{stats.connected}</div>
                  <div className="text-xs text-text-muted">已连接</div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-gradient-to-br from-indigo-500/10 to-indigo-600/5 border border-indigo-500/20 rounded-xl p-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                  <ArrowDownCircle className="w-5 h-5 text-indigo-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-indigo-600">{stats.syncing}</div>
                  <div className="text-xs text-text-muted">同步中</div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="bg-gradient-to-br from-rose-500/10 to-rose-600/5 border border-rose-500/20 rounded-xl p-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-rose-500/20 flex items-center justify-center">
                  <HardDrive className="w-5 h-5 text-rose-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-rose-600">{stats.errors}</div>
                  <div className="text-xs text-text-muted">异常</div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20 rounded-xl p-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <LayoutGrid className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-purple-600">
                    {stats.totalEvents > 1000000000 
                      ? `${(stats.totalEvents / 1000000000).toFixed(1)}B` 
                      : stats.totalEvents > 1000000 
                      ? `${(stats.totalEvents / 1000000).toFixed(1)}M` 
                      : stats.totalEvents > 1000 
                      ? `${(stats.totalEvents / 1000).toFixed(1)}K` 
                      : stats.totalEvents}
                  </div>
                  <div className="text-xs text-text-muted">总事件数</div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
