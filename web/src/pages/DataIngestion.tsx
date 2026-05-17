import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Database, Activity, ArrowDownCircle, HardDrive, LayoutGrid,
  Server, Workflow, FileText, Code
} from 'lucide-react';
import LogConfigSidebar from '../components/LogConfigSidebar';
import DataSourceManager from '../components/DataSourceManager';
import SmartParser from '../components/SmartParser';
import LogTypeManager from '../components/LogTypeManager';
import FormatTemplate from '../components/FormatTemplate';
import StorageConfig from '../components/StorageConfig';
import { dataSourcesApi } from '../services/api';

interface SectionConfig {
  title: string;
  description: string;
  icon: any;
  bannerBg: string;
  bannerBorder: string;
  iconBg: string;
  iconColor: string;
}

const sectionConfigs: Record<string, SectionConfig> = {
  sources: {
    title: '数据源管理',
    description: '配置数据源接入方式，管理数据采集连接和同步状态',
    icon: Server,
    bannerBg: 'bg-gradient-to-r from-blue-50 to-blue-100/50',
    bannerBorder: 'border-blue-200',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
  },
  parsing: {
    title: '智能解析',
    description: '定义解析管道和字段映射规则，将原始日志转换为结构化数据',
    icon: Workflow,
    bannerBg: 'bg-gradient-to-r from-indigo-50 to-indigo-100/50',
    bannerBorder: 'border-indigo-200',
    iconBg: 'bg-indigo-100',
    iconColor: 'text-indigo-600',
  },
  logtypes: {
    title: '日志类型',
    description: '建立日志分类体系，定义每类日志的属性和关联解析规则',
    icon: FileText,
    bannerBg: 'bg-gradient-to-r from-amber-50 to-amber-100/50',
    bannerBorder: 'border-amber-200',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
  },
  templates: {
    title: '格式模板',
    description: '管理可复用的日志解析格式模板，标准化字段提取规则',
    icon: Code,
    bannerBg: 'bg-gradient-to-r from-emerald-50 to-emerald-100/50',
    bannerBorder: 'border-emerald-200',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
  },
  storage: {
    title: '存储配置',
    description: '配置和管理数据库、搜索引擎、消息队列等存储目标',
    icon: Database,
    bannerBg: 'bg-gradient-to-r from-purple-50 to-purple-100/50',
    bannerBorder: 'border-purple-200',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
  },
};

const statCardStyles: Record<string, { card: string; iconBg: string; iconColor: string }> = {
  blue:    { card: 'from-blue-500/10 to-blue-600/5 border-blue-500/20',    iconBg: 'bg-blue-500/20',    iconColor: 'text-blue-500' },
  emerald: { card: 'from-emerald-500/10 to-emerald-600/5 border-emerald-500/20', iconBg: 'bg-emerald-500/20', iconColor: 'text-emerald-500' },
  indigo:  { card: 'from-indigo-500/10 to-indigo-600/5 border-indigo-500/20',  iconBg: 'bg-indigo-500/20',  iconColor: 'text-indigo-500' },
  rose:    { card: 'from-rose-500/10 to-rose-600/5 border-rose-500/20',       iconBg: 'bg-rose-500/20',    iconColor: 'text-rose-500' },
  purple:  { card: 'from-purple-500/10 to-purple-600/5 border-purple-500/20',  iconBg: 'bg-purple-500/20',  iconColor: 'text-purple-500' },
};

export default function DataIngestion() {
  const [activeSection, setActiveSection] = useState('sources');
  const [dataSources, setDataSources] = useState<any[]>([]);
  const [currentMapping, setCurrentMapping] = useState<any>(null);

  const handleMappingUpdate = useCallback((mapping: any) => {
    setCurrentMapping(mapping);
    // 同步更新 dataSources 中的对应数据源
    if (mapping && mapping.id) {
      setDataSources(prev => prev.map(ds =>
        String(ds.id) === String(mapping.id) ? { ...ds, ...mapping } : ds
      ));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchDataSources = async () => {
      try {
        const response = await dataSourcesApi.getDataSources({ page_size: 100 });
        if (cancelled) return;
        if (response.success && response.data) {
          const items = Array.isArray(response.data) ? response.data : response.data.items || [];
          setDataSources(items.map((item: any) => ({
            id: String(item.id),
            name: item.name || item.source_name || `数据源 ${item.id}`,
            type: item.source_type === 'pull' ? 'pull' : item.source_type === 'push' ? 'push' : 'pull',
            protocol: item.protocol || item.source_type || 'unknown',
            status: item.status === 'active' ? 'connected' :
                    item.status === 'inactive' ? 'disconnected' :
                    item.status || 'connected',
            flinkJobStatus: item.flink_job_status || 'stopped',
            lastSync: item.last_read_at || item.updated_at || new Date().toISOString(),
            eventsPerSecond: item.events_per_second || 0,
            totalEvents: item.message_count || 0,
            health: 100,
            config: item.config || {},
            parsePipelines: item.pipeline_ids || [],
            logTypeId: item.log_type_id || '',
            logTypeName: item.log_type_name || '',
            pipelineIds: item.pipeline_ids || [],
            pipelineNames: item.pipeline_names || [],
            formatTemplateId: item.format_template_id,
            formatTemplateName: item.format_template_name,
            storageTableName: item.storage_table_name || '',
            storageRetentionDays: item.storage_retention_days || 30,
            storageConfigId: String(item.storage_config_id || ''),
            storageConfig: item.storage_config || {
              hypertable: item.storage_table_name || '',
              retentionDays: item.storage_retention_days || 30,
              compression: item.storage_compression ?? true,
              indexes: item.storage_indexes || [],
              partitionInterval: item.storage_partition || '1 day'
            },
            productMappings: [],
            stats: { parsedSuccess: 0, parsedFailed: 0 }
          })));
        }
      } catch (error) {
        if (!cancelled) setDataSources([]);
      }
    };
    fetchDataSources();
    return () => { cancelled = true; };
  }, []);

  const dsStats = useMemo(() => ({
    total: dataSources.length,
    connected: dataSources.filter(s => s.status === 'connected').length,
    syncing: dataSources.filter(s => s.status === 'syncing').length,
    errors: dataSources.filter(s => s.status === 'error').length,
    totalEvents: dataSources.reduce((sum, s) => sum + (s.totalEvents || 0), 0),
  }), [dataSources]);

  const formatNum = useCallback((n: number) => {
    if (n > 1000000000) return `${(n / 1000000000).toFixed(1)}B`;
    if (n > 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n > 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  }, []);

  const section = sectionConfigs[activeSection] || sectionConfigs.sources;
  const SectionIcon = section.icon;

  const content = useMemo(() => {
    switch (activeSection) {
      case 'sources':
        return <DataSourceManager 
          key="sources" 
          dataSources={dataSources} 
          onMappingUpdate={handleMappingUpdate}
          onEditSource={(source) => {
            // 不自动跳转，留在当前页面
          }}
          onDeleteSource={(source) => {
            setDataSources(prev => prev.filter(s => s.id !== source.id));
          }}
        />;
      case 'parsing':
        return <SmartParser key="parsing" />;
      case 'logtypes':
        return <LogTypeManager key="logtypes" />;
      case 'templates':
        return <FormatTemplate key="templates" />;
      case 'storage':
        return <StorageConfig key="storage" />;
      default:
        return null;
    }
  }, [activeSection, dataSources]);

  return (
    <div className="flex h-full gap-6">
      <LogConfigSidebar activeSection={activeSection} onSectionChange={setActiveSection} dataSourceCount={dataSources.length} currentMapping={currentMapping} />

      <div className="flex-1 overflow-auto">
        {/* Context-Aware Header */}
        <div className="mb-6">
          <div className={`flex items-center gap-4 p-5 rounded-2xl ${section.bannerBg} border ${section.bannerBorder} mb-4`}>
            <div className={`w-12 h-12 rounded-xl ${section.iconBg} flex items-center justify-center`}>
              <SectionIcon className={`w-6 h-6 ${section.iconColor}`} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-text-primary">{section.title}</h1>
              <p className="text-sm text-text-muted mt-0.5">{section.description}</p>
            </div>
          </div>

          {/* Data source stats - only shown on sources tab */}
          {activeSection === 'sources' && (
            <motion.div
              key="source-stats"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-5 gap-4"
            >
              <StatCard icon={Database} s="blue"    value={dsStats.total}          label="数据源总数" />
              <StatCard icon={Activity}  s="emerald" value={dsStats.connected}      label="已连接" />
              <StatCard icon={ArrowDownCircle} s="indigo" value={dsStats.syncing} label="同步中" />
              <StatCard icon={HardDrive}  s="rose"    value={dsStats.errors}        label="异常" />
              <StatCard icon={LayoutGrid} s="purple"  value={formatNum(dsStats.totalEvents)} label="总事件数" />
            </motion.div>
          )}

        </div>

        <div key={activeSection}>
          {content}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, s, value, label }: {
  icon: any; s: keyof typeof statCardStyles; value: string | number; label: string;
}) {
  const style = statCardStyles[s];
  return (
    <div className={`bg-gradient-to-br ${style.card} rounded-xl p-4`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg ${style.iconBg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${style.iconColor}`} />
        </div>
        <div>
          <div className="text-2xl font-bold text-text-primary">{value}</div>
          <div className="text-xs text-text-muted">{label}</div>
        </div>
      </div>
    </div>
  );
}
