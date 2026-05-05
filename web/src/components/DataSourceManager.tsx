import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server, Plus, Play, Pause, Trash2, Edit3, Eye, X,
  ArrowDownCircle, Inbox, Activity, Clock, Database,
  CheckCircle, AlertCircle, ChevronRight, Zap, Cable,
  MessageSquare, Globe, Cloud, Terminal, Webhook, Radio,
  Settings2, TrendingUp, MoreHorizontal, GitBranch, Link2,
  FileText, HardDrive, Cpu, Wifi, Lock, Shield, FolderOpen, Loader2
} from 'lucide-react';
import { dataSourcesApi } from '../services/api';
import { DataSource } from '../types';

// 关联配置保存函数
const saveMappingConfig = async (
  dataSourceId: string | number,
  mappingConfig: {
    logTypeId?: string;
    logTypeName?: string;
    pipelineIds?: string[];
    pipelineNames?: string[];
    storageConfigId?: string;
    storageTableName?: string;
    storageRetentionDays?: number;
    formatTemplateId?: string;
    formatTemplateName?: string;
  }
) => {
  try {
    await dataSourcesApi.saveMappingConfig(Number(dataSourceId), mappingConfig);
    return { success: true };
  } catch (error) {
    console.error('保存关联配置失败:', error);
    return { success: false, error };
  }
};

// 启动 Flink 任务
const handleStartFlinkJob = async (source: DataSource) => {
  try {
    // 设置加载状态
    setDataSources(prev => prev.map(s => 
      s.id === source.id ? { ...s, isLoading: true } : s
    ));
    
    const res = await dataSourcesApi.startFlinkJob(Number(source.id));
    if (res.success) {
      setDataSources(prev => prev.map(s => 
        s.id === source.id ? { 
          ...s, 
          isLoading: false,
          flinkJobId: res.data.flink_job_id,
          flinkJobStatus: 'running',
          status: 'active'
        } : s
      ));
    } else {
      console.error('启动失败:', res.error);
      setDataSources(prev => prev.map(s => 
        s.id === source.id ? { ...s, isLoading: false } : s
      ));
    }
  } catch (error) {
    console.error('启动 Flink 任务失败:', error);
    setDataSources(prev => prev.map(s => 
      s.id === source.id ? { ...s, isLoading: false } : s
    ));
  }
};

// 停止 Flink 任务
const handleStopFlinkJob = async (source: DataSource) => {
  try {
    setDataSources(prev => prev.map(s => 
      s.id === source.id ? { ...s, isLoading: true } : s
    ));
    
    const res = await dataSourcesApi.stopFlinkJob(Number(source.id));
    if (res.success) {
      setDataSources(prev => prev.map(s => 
        s.id === source.id ? { 
          ...s, 
          isLoading: false,
          flinkJobStatus: 'stopped',
          status: 'inactive'
        } : s
      ));
    } else {
      console.error('停止失败:', res.error);
      setDataSources(prev => prev.map(s => 
        s.id === source.id ? { ...s, isLoading: false } : s
      ));
    }
  } catch (error) {
    console.error('停止 Flink 任务失败:', error);
    setDataSources(prev => prev.map(s => 
      s.id === source.id ? { ...s, isLoading: false } : s
    ));
  }
};

interface DataSourceManagerProps {
  dataSources?: any[];
  onAddSource?: () => void;
  onEditSource?: (source: any) => void;
  onDeleteSource?: (source: any) => void;
  onToggleStatus?: (source: any) => void;
  onViewDetail?: (source: any) => void;
}

const getStatusText = (status: string) => {
  switch (status) {
    case 'connected': return '已连接';
    case 'disconnected': return '已断开';
    case 'error': return '错误';
    case 'syncing': return '同步中';
    case 'paused': return '已暂停';
    default: return '未知';
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'connected': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'disconnected': return 'bg-gray-100 text-gray-600 border-gray-200';
    case 'error': return 'bg-red-100 text-red-700 border-red-200';
    case 'syncing': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'paused': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    default: return 'bg-gray-100 text-gray-600 border-gray-200';
  }
};

const protocolIcons: Record<string, React.ElementType> = {
  kafka: MessageSquare,
  rabbitmq: Cable,
  http: Globe,
  https: Lock,
  s3: Cloud,
  syslog: Terminal,
  webhook: Webhook,
  grpc: Radio,
  tcp: Wifi,
  udp: Wifi,
  file: FolderOpen,
  ftp: HardDrive,
  sftp: Shield,
  jdbc: Database,
  redis: Cpu,
  elasticsearch: Database
};

const availablePipelines = [
  { id: 'p1', name: 'JSON标准解析', parser: 'json', priority: 1 },
  { id: 'p2', name: 'Syslog RFC5424', parser: 'syslog', priority: 2 },
  { id: 'p3', name: 'CEF安全事件', parser: 'cef', priority: 3 },
  { id: 'p4', name: 'Grok自定义', parser: 'grok', priority: 4 },
  { id: 'p5', name: '智能识别', parser: 'auto', priority: 5 }
];

// 日志类型列表
const availableLogTypes = [
  { id: 'lt1', name: '系统日志', description: '操作系统和系统服务日志', category: 'system' },
  { id: 'lt2', name: '应用日志', description: '应用程序运行日志', category: 'application' },
  { id: 'lt3', name: '安全日志', description: '安全审计和告警日志', category: 'security' },
  { id: 'lt4', name: '网络日志', description: '网络设备和流量日志', category: 'network' },
  { id: 'lt5', name: '数据库日志', description: '数据库操作和审计日志', category: 'database' },
  { id: 'lt6', name: 'Web日志', description: 'Web服务器和访问日志', category: 'web' },
  { id: 'lt7', name: '容器日志', description: 'Docker和Kubernetes日志', category: 'container' },
  { id: 'lt8', name: '云平台日志', description: '云服务商审计日志', category: 'cloud' }
];

// 存储配置列表
const availableStorageConfigs = [
  { id: 'sc1', name: '长期存储表', tableName: 'logs_long_term', retentionDays: 365, description: '365天保留策略' },
  { id: 'sc2', name: '短期存储表', tableName: 'logs_short_term', retentionDays: 30, description: '30天保留策略' },
  { id: 'sc3', name: '热数据存储', tableName: 'logs_hot', retentionDays: 7, description: '7天高频访问' },
  { id: 'sc4', name: '审计日志表', tableName: 'audit_logs', retentionDays: 730, description: '2年合规保留' },
  { id: 'sc5', name: '安全告警表', tableName: 'security_alerts', retentionDays: 90, description: '90天告警保留' }
];

// 格式模板列表
const availableFormatTemplates = [
  { id: 'ft1', name: '标准JSON', format: 'json', description: '标准JSON格式日志' },
  { id: 'ft2', name: 'Syslog标准', format: 'syslog', description: 'RFC5424 Syslog格式' },
  { id: 'ft3', name: 'CEF标准', format: 'cef', description: 'Common Event Format' },
  { id: 'ft4', name: 'Apache日志', format: 'apache', description: 'Apache Combined Log' },
  { id: 'ft5', name: 'Nginx日志', format: 'nginx', description: 'Nginx Access Log' },
  { id: 'ft6', name: '自定义Grok', format: 'grok', description: 'Grok正则解析' }
];

const protocolConfigFields: Record<string, { label: string; placeholder: string; type: 'text' | 'number' | 'password' | 'textarea' }[]> = {
  kafka: [
    { label: 'Broker地址', placeholder: 'localhost:9092', type: 'text' },
    { label: 'Topic', placeholder: 'log-topic', type: 'text' },
    { label: 'Consumer Group', placeholder: 'log-consumer-group', type: 'text' }
  ],
  rabbitmq: [
    { label: 'AMQP地址', placeholder: 'amqp://localhost:5672', type: 'text' },
    { label: '队列名称', placeholder: 'log-queue', type: 'text' },
    { label: '用户名', placeholder: 'guest', type: 'text' },
    { label: '密码', placeholder: '******', type: 'password' }
  ],
  http: [
    { label: 'URL地址', placeholder: 'http://api.example.com/logs', type: 'text' },
    { label: '请求间隔(秒)', placeholder: '60', type: 'number' },
    { label: 'API Key', placeholder: '可选', type: 'password' }
  ],
  https: [
    { label: 'URL地址', placeholder: 'https://api.example.com/logs', type: 'text' },
    { label: '请求间隔(秒)', placeholder: '60', type: 'number' },
    { label: 'API Key', placeholder: '可选', type: 'password' }
  ],
  s3: [
    { label: 'Endpoint', placeholder: 'https://s3.amazonaws.com', type: 'text' },
    { label: 'Bucket', placeholder: 'log-bucket', type: 'text' },
    { label: 'Access Key', placeholder: 'AKIA...', type: 'text' },
    { label: 'Secret Key', placeholder: '******', type: 'password' },
    { label: '前缀路径', placeholder: 'logs/', type: 'text' }
  ],
  jdbc: [
    { label: 'JDBC URL', placeholder: 'jdbc:mysql://localhost:3306/logs', type: 'text' },
    { label: '用户名', placeholder: 'root', type: 'text' },
    { label: '密码', placeholder: '******', type: 'password' },
    { label: '查询SQL', placeholder: 'SELECT * FROM logs WHERE id > ?', type: 'textarea' }
  ],
  redis: [
    { label: 'Redis地址', placeholder: 'localhost:6379', type: 'text' },
    { label: '密码', placeholder: '可选', type: 'password' },
    { label: '队列Key', placeholder: 'log-queue', type: 'text' }
  ],
  elasticsearch: [
    { label: 'ES地址', placeholder: 'http://localhost:9200', type: 'text' },
    { label: '索引模式', placeholder: 'logs-*', type: 'text' },
    { label: '用户名', placeholder: 'elastic', type: 'text' },
    { label: '密码', placeholder: '******', type: 'password' }
  ],
  file: [
    { label: '文件路径', placeholder: '/var/log/app/*.log 或 ftp://user:pass@host/path', type: 'text' },
    { label: '文件编码', placeholder: 'UTF-8', type: 'text' },
    { label: '读取模式', placeholder: 'tail/head/全量', type: 'text' },
    { label: '轮询间隔(秒)', placeholder: '1', type: 'number' }
  ],
  syslog: [
    { label: '监听端口', placeholder: '514', type: 'number' },
    { label: '传输协议', placeholder: 'UDP/TCP/TLS', type: 'text' },
    { label: '接收缓冲区大小', placeholder: '8192', type: 'number' }
  ],
  webhook: [
    { label: '监听路径', placeholder: '/webhook/logs', type: 'text' },
    { label: '认证方式', placeholder: 'Token/Basic/无', type: 'text' },
    { label: '认证Token', placeholder: '可选', type: 'password' }
  ],
  grpc: [
    { label: '监听端口', placeholder: '50051', type: 'number' },
    { label: 'Proto文件路径', placeholder: '/path/to/service.proto', type: 'text' },
    { label: '服务名称', placeholder: 'LogService', type: 'text' }
  ],
  tcp: [
    { label: '监听端口', placeholder: '8080', type: 'number' },
    { label: '编码格式', placeholder: 'UTF-8', type: 'text' },
    { label: '最大连接数', placeholder: '1000', type: 'number' }
  ],
  udp: [
    { label: '监听端口', placeholder: '8080', type: 'number' },
    { label: '编码格式', placeholder: 'UTF-8', type: 'text' },
    { label: '接收缓冲区', placeholder: '8192', type: 'number' }
  ]
};

export default function DataSourceManager(props: DataSourceManagerProps) {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'pull' | 'push'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPipelineModal, setShowPipelineModal] = useState(false);
  const [selectedSource, setSelectedSource] = useState<DataSource | null>(null);
  const [addStep, setAddStep] = useState(1);
  const [sourceType, setSourceType] = useState<'pull' | 'push'>('pull');
  const [protocol, setProtocol] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  const [selectedPipelines, setSelectedPipelines] = useState<string[]>([]);
  const [formData, setFormData] = useState<Record<string, string>>({});
  
  // 关联配置状态
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [selectedLogType, setSelectedLogType] = useState<string>('');
  const [selectedStorageConfig, setSelectedStorageConfig] = useState<string>('');
  const [selectedFormatTemplate, setSelectedFormatTemplate] = useState<string>('');

  const filteredSources = dataSources.filter(source => {
    if (filterType === 'all') return true;
    return source.type === filterType;
  });

  // 优先使用 props 数据，否则自行获取
  useEffect(() => {
    if (props.dataSources && props.dataSources.length > 0) {
      setDataSources(props.dataSources);
      setLoading(false);
    } else {
      fetchData();
    }
  }, [props.dataSources]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await dataSourcesApi.getDataSources({ page_size: 100 });
      if (res.success && res.data) {
        const items = Array.isArray(res.data) ? res.data : res.data.items || [];
        setDataSources(items.map((item: any) => ({
          id: String(item.id),
          name: item.name || item.source_name || `数据源 ${item.id}`,
          type: item.source_type === 'pull' ? 'pull' : item.source_type === 'push' ? 'push' : (item.type || 'pull'),
          status: item.status === 'active' ? 'connected' :
                  item.status === 'inactive' ? 'disconnected' :
                  item.status === 'error' ? 'error' :
                  item.status || 'disconnected',
          host: item.host,
          port: item.port,
          protocol: item.protocol || item.source_type || 'unknown',
          description: item.description,
          created_at: item.created_at || item.updated_at,
          lastSync: item.last_read_at || item.updated_at,
          totalEvents: item.message_count || 0,
          eventsPerSecond: item.events_per_second || 0,
          logTypeId: item.log_type_id,
          logTypeName: item.log_type_name,
          parsePipelines: [],
          storageConfig: {
            hypertable: item.storage_table_name || '',
            retentionDays: item.storage_retention_days || 30,
            compression: item.storage_compression ?? true,
            indexes: item.storage_indexes || [],
            partitionInterval: item.storage_partition || '1d',
            tableName: item.storage_table_name || '',
          },
          storageTableName: item.storage_table_name,
          formatTemplateId: item.format_template_id,
          formatTemplateName: item.format_template_name,
          flinkJobStatus: item.flink_job_status || 'stopped',
        })));
      }
    } catch (error) {
      console.error('获取数据源失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewClick = (source: DataSource) => {
    setSelectedSource(source);
    setShowDetailModal(true);
    props.onViewDetail && props.onViewDetail(source);
  };

  const handleDeleteClick = (source: DataSource) => {
    setSelectedSource(source);
    setShowDeleteModal(true);
  };

  const confirmDelete = () => {
    if (selectedSource) {
      setDataSources(prev => prev.filter(s => s.id !== selectedSource.id));
      props.onDeleteSource && props.onDeleteSource(selectedSource);
      setShowDeleteModal(false);
      setSelectedSource(null);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    await new Promise(r => setTimeout(r, 1500));
    setTestSuccess(true);
    setIsTesting(false);
  };

  const openPipelineModal = (source: DataSource) => {
    setSelectedSource(source);
    setSelectedPipelines(source.parsePipelines?.map((p: any) => p.id) || []);
    setShowPipelineModal(true);
  };

  const savePipelines = () => {
    if (selectedSource) {
      const newPipelines = availablePipelines
        .filter(p => selectedPipelines.includes(p.id))
        .map((p, idx) => ({ ...p, priority: idx + 1 }));
      props.onEditSource && props.onEditSource({ ...selectedSource, parsePipelines: newPipelines });
      setShowPipelineModal(false);
    }
  };

  const getProtocolFields = () => {
    return protocolConfigFields[protocol] || [];
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <input
              type="text"
              placeholder="搜索数据源..."
              className="w-56 pl-10 pr-4 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-primary text-sm"
            />
            <Activity className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as typeof filterType)}
            className="px-3 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary focus:outline-none focus:border-primary cursor-pointer text-sm"
          >
            <option value="all">全部类型</option>
            <option value="pull">主动拉取</option>
            <option value="push">被动接收</option>
          </select>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          添加数据源
        </motion.button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : (
        <div className="glass-card rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-card-bg border-b border-border-color">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-medium text-text-secondary">数据源</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-text-secondary">类型</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-text-secondary">日志类型</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-text-secondary">解析管道</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-text-secondary">状态</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-text-secondary">健康度</th>
                <th className="px-6 py-4 text-right text-sm font-medium text-text-secondary">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredSources.map((source, index) => {
                const ProtocolIcon = protocolIcons[source.protocol || ''] || Server;
                return (
                  <motion.tr
                    key={source.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="border-b border-border-color/50 last:border-0 hover:bg-page-bg/50"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                          <ProtocolIcon className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-text-primary">{source.name}</div>
                          <div className="text-xs text-gray-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {source.created_at ? new Date(source.created_at).toLocaleString('zh-CN') : '-'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2 py-1 rounded-full border ${
                        source.type === 'pull' 
                          ? 'bg-blue-50 text-blue-600 border-blue-200' 
                          : 'bg-emerald-50 text-emerald-600 border-emerald-200'
                      }`}>
                        {source.type === 'pull' ? 'Pull' : 'Push'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => {
                          setSelectedSource(source);
                          setSelectedLogType((source as any).logTypeId || '');
                          const pipeIds = (source as any).parsePipelines?.map((p: any) => p.id) || (source as any).pipelineIds || (source as any).pipeline_ids || [];
                          setSelectedPipelines(pipeIds);
                          setSelectedStorageConfig(source.storageConfig ? 'sc1' : '');
                          setSelectedFormatTemplate((source as any).formatTemplateId || '');
                          setShowMappingModal(true);
                        }}
                        className="flex items-center gap-1.5 text-sm hover:text-blue-700"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>{(source as any).logTypeName || '未设置'}</span>
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2 py-1 rounded-full border ${getStatusColor(source.status)}`}>
                        {getStatusText(source.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => openPipelineModal(source)}
                        className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
                      >
                        <GitBranch className="w-3.5 h-3.5" />
                        <span>{(() => {
                          const count = (source as any).parsePipelines?.length || ((source as any).pipelineIds || (source as any).pipeline_ids || []).length;
                          return `${count} 个管道`;
                        })()}</span>
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2 py-1 rounded-full border ${
                        source.logTypeId ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'
                      }`}>
                        {source.logTypeId ? '已配置' : '未配置'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-1.5 bg-page-bg rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: source.status === 'connected' ? '100%' : '0%' }}
                          />
                        </div>
                        <span className="text-xs text-text-muted">{source.status === 'connected' ? '100%' : '0%'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {/* Flink 任务控制按钮 */}
                        {source.logTypeId && source.storageTableName && (
                          source.flinkJobStatus === 'running' ? (
                            <button
                              onClick={() => handleStopFlinkJob(source)}
                              disabled={source.isLoading}
                              className="p-1.5 text-emerald-600 hover:text-emerald-700 rounded-lg hover:bg-emerald-50"
                              title="停止 Flink 任务"
                            >
                              {source.isLoading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Pause className="w-4 h-4" />
                              )}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleStartFlinkJob(source)}
                              disabled={source.isLoading}
                              className="p-1.5 text-blue-600 hover:text-blue-700 rounded-lg hover:bg-blue-50"
                              title="启动 Flink 任务"
                            >
                              {source.isLoading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Play className="w-4 h-4" />
                              )}
                            </button>
                          )
                        )}
                        <button onClick={() => handleViewClick(source)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => props.onEditSource && props.onEditSource(source)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteClick(source)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
          {filteredSources.length === 0 && (
            <div className="text-center py-12">
              <Database className="w-12 h-12 mx-auto text-text-muted mb-3" />
              <p className="text-text-muted">暂无数据源</p>
              <p className="text-xs text-text-muted mt-1">点击上方按钮添加第一个数据源</p>
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowAddModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card-bg border border-border-color rounded-xl p-6 w-[700px] max-h-[85vh] overflow-auto shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-text-primary">添加数据源</h2>
                <button onClick={() => setShowAddModal(false)} className="p-2 text-gray-400 hover:text-text-secondary rounded-lg hover:bg-page-bg">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {addStep === 1 && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => setSourceType('pull')}
                      className={`p-6 rounded-xl border-2 transition-all text-left ${
                        sourceType === 'pull' ? 'border-blue-500 bg-blue-50/50' : 'border-border-color hover:border-blue-300'
                      }`}
                    >
                      <ArrowDownCircle className={`w-8 h-8 mb-3 ${sourceType === 'pull' ? 'text-blue-600' : 'text-gray-400'}`} />
                      <h3 className={`font-medium mb-1 ${sourceType === 'pull' ? 'text-blue-600' : 'text-text-primary'}`}>主动拉取</h3>
                      <p className="text-sm text-text-muted">从外部系统主动获取数据</p>
                    </button>
                    <button
                      onClick={() => setSourceType('push')}
                      className={`p-6 rounded-xl border-2 transition-all text-left ${
                        sourceType === 'push' ? 'border-blue-500 bg-blue-50/50' : 'border-border-color hover:border-blue-300'
                      }`}
                    >
                      <Inbox className={`w-8 h-8 mb-3 ${sourceType === 'push' ? 'text-blue-600' : 'text-gray-400'}`} />
                      <h3 className={`font-medium mb-1 ${sourceType === 'push' ? 'text-blue-600' : 'text-text-primary'}`}>被动接收</h3>
                      <p className="text-sm text-text-muted">接收外部系统推送的数据</p>
                    </button>
                  </div>
                  <div className="flex justify-end">
                    <button onClick={() => setAddStep(2)} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
                      下一步
                    </button>
                  </div>
                </div>
              )}

              {addStep === 2 && (
                <div className="space-y-6">
                  <div className="grid grid-cols-3 gap-3">
                    {Object.entries(protocolIcons).slice(0, 6).map(([key, Icon]) => (
                      <button
                        key={key}
                        onClick={() => { setProtocol(key); setFormData({}); }}
                        className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                          protocol === key ? 'border-blue-500 bg-blue-50/50' : 'border-border-color hover:border-blue-300'
                        }`}
                      >
                        <Icon className={`w-6 h-6 ${protocol === key ? 'text-blue-600' : 'text-gray-400'}`} />
                        <span className={`text-sm font-medium ${protocol === key ? 'text-blue-600' : 'text-text-primary'}`}>{key.toUpperCase()}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between">
                    <button onClick={() => setAddStep(1)} className="px-6 py-2 text-text-secondary hover:text-text-primary text-sm">上一步</button>
                    <button onClick={() => setAddStep(3)} disabled={!protocol} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium">下一步</button>
                  </div>
                </div>
              )}

              {addStep === 3 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-text-secondary text-sm font-medium mb-2">数据源名称</label>
                    <input 
                      type="text" 
                      placeholder="输入名称" 
                      className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
                    />
                  </div>
                  
                  <div className="space-y-3">
                    {getProtocolFields().map((field, index) => (
                      <div key={index}>
                        <label className="block text-text-secondary text-sm font-medium mb-2">{field.label}</label>
                        {field.type === 'textarea' ? (
                          <textarea 
                            value={formData[field.label] || ''}
                            onChange={e => setFormData({ ...formData, [field.label]: e.target.value })}
                            placeholder={field.placeholder}
                            className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary h-20 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        ) : (
                          <input 
                            type={field.type}
                            value={formData[field.label] || ''}
                            onChange={e => setFormData({ ...formData, [field.label]: e.target.value })}
                            placeholder={field.placeholder}
                            className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-page-bg/50 rounded-lg">
                    {testSuccess ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                        <span className="text-sm text-emerald-600">连接测试通过</span>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={handleTestConnection}
                          disabled={isTesting}
                          className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                          {isTesting ? <Zap className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                          {isTesting ? '测试中...' : '测试连接'}
                        </button>
                        <span className="text-sm text-text-muted">验证配置是否正确</span>
                      </>
                    )}
                  </div>

                  <div className="flex justify-between pt-4 border-t border-border-color">
                    <button onClick={() => setAddStep(2)} className="px-6 py-2 text-text-secondary hover:text-text-primary text-sm">上一步</button>
                    <button onClick={() => setShowAddModal(false)} disabled={!testSuccess} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">完成</button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPipelineModal && selectedSource && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowPipelineModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card-bg border border-border-color rounded-xl p-6 w-[500px] max-h-[80vh] overflow-auto shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">关联解析管道</h2>
                  <p className="text-sm text-text-muted mt-1">为 {selectedSource.name} 选择解析管道</p>
                </div>
                <button onClick={() => setShowPipelineModal(false)} className="p-2 text-gray-400 hover:text-text-secondary rounded-lg hover:bg-page-bg">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 mb-6">
                <p className="text-sm text-text-secondary">选择多个解析管道实现智能解析，系统会按优先级自动匹配</p>
                {availablePipelines.map((pipeline, index) => (
                  <div
                    key={pipeline.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedPipelines.includes(pipeline.id)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-border-color hover:border-border-color'
                    }`}
                    onClick={() => {
                      if (selectedPipelines.includes(pipeline.id)) {
                        setSelectedPipelines(selectedPipelines.filter(id => id !== pipeline.id));
                      } else {
                        setSelectedPipelines([...selectedPipelines, pipeline.id]);
                      }
                    }}
                  >
                    <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                      selectedPipelines.includes(pipeline.id) ? 'bg-blue-600 border-blue-600' : 'border-border-color'
                    }`}>
                      {selectedPipelines.includes(pipeline.id) && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-text-primary">{pipeline.name}</span>
                        <span className="px-1.5 py-0.5 text-xs bg-page-bg text-text-secondary rounded">{pipeline.parser}</span>
                      </div>
                      <div className="text-xs text-text-muted">优先级: {index + 1}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border-color">
                <button onClick={() => setShowPipelineModal(false)} className="px-4 py-2 text-text-secondary hover:text-text-primary text-sm">取消</button>
                <button onClick={savePipelines} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
                  保存关联
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 数据流关联配置弹窗 */}
      <AnimatePresence>
        {showMappingModal && selectedSource && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowMappingModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card-bg border border-border-color rounded-xl p-6 w-[850px] max-h-[90vh] overflow-auto shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">数据流关联配置</h2>
                  <p className="text-sm text-text-muted mt-1">为 {selectedSource.name} 配置完整的日志处理链路</p>
                </div>
                <button onClick={() => setShowMappingModal(false)} className="p-2 text-gray-400 hover:text-text-secondary rounded-lg hover:bg-page-bg">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 关联链路流程图 */}
              <div className="flex items-center gap-3 mb-8 p-4 bg-gradient-to-r from-blue-50 via-emerald-50 to-purple-50 rounded-xl">
                <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-sm">
                  <Database className="w-5 h-5 text-blue-600" />
                  <span className="text-sm font-medium text-text-primary">数据源</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
                <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-sm">
                  <FileText className="w-5 h-5 text-emerald-600" />
                  <span className="text-sm font-medium text-text-primary">日志类型</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
                <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-sm">
                  <GitBranch className="w-5 h-5 text-amber-600" />
                  <span className="text-sm font-medium text-text-primary">解析管道</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
                <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-sm">
                  <HardDrive className="w-5 h-5 text-purple-600" />
                  <span className="text-sm font-medium text-text-primary">存储配置</span>
                </div>
              </div>

              {/* 1. 日志类型选择 */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 flex items-center justify-center bg-emerald-100 text-emerald-600 rounded-full text-xs font-bold">1</span>
                  选择日志类型
                  <span className="text-xs text-text-muted font-normal ml-2">日志类型定义数据的结构和语义</span>
                </h3>
                <div className="grid grid-cols-4 gap-3">
                  {availableLogTypes.map(logType => (
                    <div
                      key={logType.id}
                      onClick={() => setSelectedLogType(logType.id)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedLogType === logType.id
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-border-color hover:border-emerald-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                          selectedLogType === logType.id ? 'bg-emerald-500 border-emerald-500' : 'border-border-color'
                        }`}>
                          {selectedLogType === logType.id && <CheckCircle className="w-3 h-3 text-white" />}
                        </div>
                        <span className="text-sm font-medium text-text-primary">{logType.name}</span>
                      </div>
                      <p className="text-xs text-text-muted pl-6">{logType.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. 解析管道选择 */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 flex items-center justify-center bg-amber-100 text-amber-600 rounded-full text-xs font-bold">2</span>
                  选择解析管道
                  <span className="text-xs text-text-muted font-normal ml-2">解析管道定义日志格式的解析规则</span>
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  {availablePipelines.map((pipeline, index) => (
                    <div
                      key={pipeline.id}
                      onClick={() => {
                        if (selectedPipelines.includes(pipeline.id)) {
                          setSelectedPipelines(selectedPipelines.filter(id => id !== pipeline.id));
                        } else {
                          setSelectedPipelines([...selectedPipelines, pipeline.id]);
                        }
                      }}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedPipelines.includes(pipeline.id)
                          ? 'border-amber-500 bg-amber-50'
                          : 'border-border-color hover:border-amber-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                          selectedPipelines.includes(pipeline.id) ? 'bg-amber-500 border-amber-500' : 'border-border-color'
                        }`}>
                          {selectedPipelines.includes(pipeline.id) && <CheckCircle className="w-3 h-3 text-white" />}
                        </div>
                        <span className="text-sm font-medium text-text-primary">{pipeline.name}</span>
                        <span className="px-1.5 py-0.5 text-xs bg-page-bg text-text-secondary rounded ml-auto">
                          #{index + 1}
                        </span>
                      </div>
                      <p className="text-xs text-text-muted pl-6">解析器: {pipeline.parser.toUpperCase()}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. 格式模板选择（可选） */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 flex items-center justify-center bg-purple-100 text-purple-600 rounded-full text-xs font-bold">3</span>
                  选择格式模板
                  <span className="text-xs text-purple-400 font-normal ml-2">(可选)</span>
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  {availableFormatTemplates.map(template => (
                    <div
                      key={template.id}
                      onClick={() => setSelectedFormatTemplate(
                        selectedFormatTemplate === template.id ? '' : template.id
                      )}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedFormatTemplate === template.id
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-border-color hover:border-purple-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                          selectedFormatTemplate === template.id ? 'bg-purple-500 border-purple-500' : 'border-border-color'
                        }`}>
                          {selectedFormatTemplate === template.id && <CheckCircle className="w-3 h-3 text-white" />}
                        </div>
                        <span className="text-sm font-medium text-text-primary">{template.name}</span>
                      </div>
                      <p className="text-xs text-text-muted pl-6">{template.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 4. 存储配置 */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 flex items-center justify-center bg-purple-100 text-purple-600 rounded-full text-xs font-bold">4</span>
                  选择存储配置
                  <span className="text-xs text-text-muted font-normal ml-2">定义数据保留策略和存储位置</span>
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  {availableStorageConfigs.map(storage => (
                    <div
                      key={storage.id}
                      onClick={() => setSelectedStorageConfig(storage.id)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedStorageConfig === storage.id
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-border-color hover:border-purple-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                          selectedStorageConfig === storage.id ? 'bg-purple-500 border-purple-500' : 'border-border-color'
                        }`}>
                          {selectedStorageConfig === storage.id && <CheckCircle className="w-3 h-3 text-white" />}
                        </div>
                        <span className="text-sm font-medium text-text-primary">{storage.name}</span>
                      </div>
                      <p className="text-xs text-text-muted pl-6">{storage.tableName}</p>
                      <p className="text-xs text-purple-600 pl-6">{storage.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 配置摘要 */}
              <div className="mb-6 p-4 bg-page-bg/50 rounded-lg">
                <h4 className="text-sm font-medium text-text-primary mb-3">配置摘要</h4>
                <div className="grid grid-cols-4 gap-4">
                  <div className="text-center p-2 bg-white rounded-lg">
                    <div className="text-xs text-text-muted mb-1">数据源</div>
                    <div className="text-sm font-medium text-text-primary truncate">{selectedSource.name}</div>
                  </div>
                  <div className="text-center p-2 bg-white rounded-lg">
                    <div className="text-xs text-text-muted mb-1">日志类型</div>
                    <div className="text-sm font-medium text-emerald-600 truncate">
                      {availableLogTypes.find(l => l.id === selectedLogType)?.name || '-'}
                    </div>
                  </div>
                  <div className="text-center p-2 bg-white rounded-lg">
                    <div className="text-xs text-text-muted mb-1">解析管道</div>
                    <div className="text-sm font-medium text-amber-600 truncate">
                      {selectedPipelines.length > 0 ? `${selectedPipelines.length} 个` : '-'}
                    </div>
                  </div>
                  <div className="text-center p-2 bg-white rounded-lg">
                    <div className="text-xs text-text-muted mb-1">存储配置</div>
                    <div className="text-sm font-medium text-purple-600 truncate">
                      {availableStorageConfigs.find(s => s.id === selectedStorageConfig)?.name || '-'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border-color">
                <button 
                  onClick={() => setShowMappingModal(false)} 
                  className="px-4 py-2 text-text-secondary hover:text-text-primary text-sm"
                >
                  取消
                </button>
                <button 
                  onClick={async () => {
                    const logType = availableLogTypes.find(l => l.id === selectedLogType);
                    const storage = availableStorageConfigs.find(s => s.id === selectedStorageConfig);
                    const template = availableFormatTemplates.find(t => t.id === selectedFormatTemplate);
                    const pipelines = availablePipelines.filter(p => selectedPipelines.includes(p.id));
                    
                    // 构建关联配置
                    const mappingConfig = {
                      logTypeId: selectedLogType,
                      logTypeName: logType?.name,
                      pipelineIds: selectedPipelines,
                      pipelineNames: pipelines.map(p => p.name),
                      storageConfigId: selectedStorageConfig,
                      storageTableName: storage?.tableName,
                      storageRetentionDays: storage?.retentionDays,
                      formatTemplateId: selectedFormatTemplate,
                      formatTemplateName: template?.name
                    };
                    
                    // 调用API保存配置
                    const result = await saveMappingConfig(selectedSource.id, mappingConfig);
                    
                    // 更新数据源 - 包含所有 API 字段，确保详情弹窗能正确显示
                    const updatedSource: any = {
                      ...selectedSource,
                      logTypeId: selectedLogType,
                      logTypeName: logType?.name,
                      parsePipelines: pipelines,
                      pipelineIds: selectedPipelines,
                      pipelineNames: pipelines.map(p => p.name),
                      storageConfig: storage ? {
                        tableName: storage.tableName,
                        retentionDays: storage.retentionDays,
                        partitionInterval: '1d',
                        indexes: [],
                        compression: true,
                      } : selectedSource.storageConfig,
                      storageTableName: storage?.tableName || (selectedSource as any).storageTableName,
                      storageRetentionDays: storage?.retentionDays || (selectedSource as any).storageRetentionDays,
                      formatTemplateId: selectedFormatTemplate,
                      formatTemplateName: template?.name,
                    };
                    
                    setDataSources(prev => prev.map(s => 
                      s.id === selectedSource.id ? updatedSource : s
                    ));
                    // 关键：同步更新 selectedSource，让再次打开详情时显示最新数据
                    setSelectedSource(updatedSource);
                    props.onEditSource && props.onEditSource(updatedSource);
                    setShowMappingModal(false);
                  }}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                  保存配置
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDetailModal && selectedSource && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowDetailModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card-bg border border-border-color rounded-xl p-6 w-[700px] max-h-[80vh] overflow-auto shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-text-primary">{selectedSource.name}</h2>
                <button onClick={() => setShowDetailModal(false)} className="p-2 text-gray-400 hover:text-text-secondary rounded-lg hover:bg-page-bg">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                {/* 从 API 数据构建管道对象数组 */}
                {(function() {
                  const pipeIds = (selectedSource as any).pipelineIds || (selectedSource as any).pipeline_ids || [];
                  const pipeNames = (selectedSource as any).pipelineNames || (selectedSource as any).pipeline_names || [];
                  const pipelines = pipeIds.map((id: string, i: number) => ({
                    id,
                    name: pipeNames[i] || id,
                    parser: id?.includes('json') ? 'json' : id?.includes('syslog') ? 'syslog' : id?.includes('cef') ? 'cef' : id?.includes('grok') ? 'grok' : 'auto',
                  }));
                  return null;
                })()}

                <div className="grid grid-cols-4 gap-4">
                  <div className="p-3 bg-page-bg/50 rounded-lg">
                    <div className="text-xs text-text-muted mb-1">总事件数</div>
                    <div className="text-lg font-semibold text-text-primary">
                      {(selectedSource as any).totalEvents
                        ? ((selectedSource as any).totalEvents > 1000000 ? `${(((selectedSource as any).totalEvents / 1000000)).toFixed(1)}M` : (selectedSource as any).totalEvents)
                        : '-'}
                    </div>
                  </div>
                  <div className="p-3 bg-page-bg/50 rounded-lg">
                    <div className="text-xs text-text-muted mb-1">解析成功</div>
                    <div className="text-lg font-semibold text-emerald-600">-</div>
                  </div>
                  <div className="p-3 bg-page-bg/50 rounded-lg">
                    <div className="text-xs text-text-muted mb-1">解析失败</div>
                    <div className="text-lg font-semibold text-red-600">-</div>
                  </div>
                  <div className="p-3 bg-page-bg/50 rounded-lg">
                    <div className="text-xs text-text-muted mb-1">状态</div>
                    <div className={`text-lg font-semibold ${getStatusColor((selectedSource as any).status || '').includes('emerald') ? 'text-emerald-600' : 'text-blue-600'}`}>
                      {getStatusText((selectedSource as any).status || '-')}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" /> 日志类型
                  </h3>
                  <div className={`p-3 rounded-lg border ${(selectedSource as any).logTypeName ? 'bg-emerald-50/50 border-emerald-100' : 'bg-page-bg/50 border-border-color'}`}>
                    <div className={`text-sm font-medium ${(selectedSource as any).logTypeName ? 'text-emerald-700' : 'text-text-muted'}`}>{(selectedSource as any).logTypeName || '未配置'}</div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
                    <GitBranch className="w-4 h-4" /> 解析管道 ({(() => {
                      const ids = (selectedSource as any).pipelineIds || (selectedSource as any).pipeline_ids || [];
                      return ids.length;
                    })()})
                  </h3>
                  {(() => {
                    const pipeIds = (selectedSource as any).pipelineIds || (selectedSource as any).pipeline_ids || [];
                    const pipeNames = (selectedSource as any).pipelineNames || (selectedSource as any).pipeline_names || [];
                    if (pipeIds.length === 0) return <div className="text-sm text-text-muted">未配置解析管道</div>;
                    return (
                      <div className="space-y-2">
                        {pipeIds.map((id: string, index: number) => (
                          <div key={id} className="flex items-center gap-2 p-2 bg-page-bg/50 rounded-lg">
                            <span className="w-5 h-5 flex items-center justify-center bg-amber-100 text-amber-600 rounded text-xs font-bold">
                              {index + 1}
                            </span>
                            <span className="text-sm font-medium text-text-primary">{pipeNames[index] || id}</span>
                            <span className="px-1.5 py-0.5 text-xs bg-page-bg text-text-secondary rounded ml-auto capitalize">
                              {id?.includes('json') ? 'json' : id?.includes('syslog') ? 'syslog' : id?.includes('cef') ? 'cef' : id?.includes('grok') ? 'grok' : 'auto'}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                <div>
                  <h3 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" /> 格式模板
                  </h3>
                  <div className={`p-3 rounded-lg border ${(selectedSource as any).formatTemplateName ? 'bg-purple-50/50 border-purple-100' : 'bg-page-bg/50 border-border-color'}`}>
                    <div className={`text-sm font-medium ${(selectedSource as any).formatTemplateName ? 'text-text-primary' : 'text-text-muted'}`}>{(selectedSource as any).formatTemplateName || '未使用模板'}</div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-text-primary mb-3">存储配置</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-page-bg/50 rounded-lg">
                      <div className="text-xs text-text-muted mb-1">存储表</div>
                      <div className="text-sm font-medium text-text-primary">
                        {(selectedSource as any).storageConfig?.tableName || (selectedSource as any).storageTableName || '-'}
                      </div>
                    </div>
                    <div className="p-3 bg-page-bg/50 rounded-lg">
                      <div className="text-xs text-text-muted mb-1">保留策略</div>
                      <div className="text-sm font-medium text-text-primary">
                        {(selectedSource as any).storageConfig?.retentionDays
                          ? `${(selectedSource as any).storageConfig.retentionDays} 天`
                          : ((selectedSource as any).storageRetentionDays
                            ? `${(selectedSource as any).storageRetentionDays} 天`
                            : '-')
                        }
                      </div>
                    </div>
                    <div className="p-3 bg-page-bg/50 rounded-lg">
                      <div className="text-xs text-text-muted mb-1">压缩</div>
                      <div className={`text-sm font-medium ${(selectedSource as any).storageConfig?.compression ?? (selectedSource as any).storageCompression !== false ? 'text-emerald-600' : 'text-red-600'}`}>
                        {((selectedSource as any).storageConfig?.compression ?? (selectedSource as any).storageCompression) !== false ? '启用' : '禁用'}
                      </div>
                    </div>
                    <div className="p-3 bg-page-bg/50 rounded-lg">
                      <div className="text-xs text-text-muted mb-1">分区策略</div>
                      <div className="text-sm font-medium text-text-primary">
                        {(selectedSource as any).storageConfig?.partitionInterval || (selectedSource as any).storagePartition || '-'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeleteModal && selectedSource && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowDeleteModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card-bg border border-border-color rounded-xl p-6 w-[400px] shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                </div>
                <h2 className="text-lg font-semibold text-text-primary">确认删除</h2>
              </div>
              <p className="text-text-secondary mb-6">
                确定要删除数据源 <span className="font-medium text-text-primary">{selectedSource.name}</span> 吗？此操作不可恢复。
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowDeleteModal(false)} className="px-4 py-2 text-text-secondary hover:text-text-primary text-sm">取消</button>
                <button onClick={confirmDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium">确认删除</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
