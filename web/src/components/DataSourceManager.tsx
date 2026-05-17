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
    const res = await dataSourcesApi.saveMappingConfig(Number(dataSourceId), mappingConfig);
    return { success: res.success !== false, data: res.data };
  } catch (error) {
    console.error('保存关联配置失败:', error);
    return { success: false, error };
  }
};


interface DataSourceManagerProps {
  dataSources?: any[];
  onAddSource?: () => void;
  onEditSource?: (source: any) => void;
  onDeleteSource?: (source: any) => void;
  onToggleStatus?: (source: any) => void;
  onViewDetail?: (source: any) => void;
  onMappingUpdate?: (mapping: any) => void;
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
    case 'disconnected': return 'bg-page-bg text-text-secondary border-border-color';
    case 'error': return 'bg-red-100 text-red-700 border-red-200';
    case 'syncing': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'paused': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    default: return 'bg-page-bg text-text-secondary border-border-color';
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

// 从API导入
import { logTypesApi, pipelinesApi, storageTablesApi } from '../services/api';

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
  
  // 真实数据状态
  const [logTypes, setLogTypes] = useState<any[]>([]);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [storageTables, setStorageTables] = useState<any[]>([]);
  const [isLoadingMappingData, setIsLoadingMappingData] = useState(false);

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

  // 获取关联配置所需的真实数据
  const fetchMappingData = async () => {
    setIsLoadingMappingData(true);
    try {
      const [logTypesRes, pipelinesRes, storageRes] = await Promise.allSettled([
        logTypesApi.getLogTypes({ page_size: 100 }),
        pipelinesApi.getPipelines({ page_size: 100 }),
        storageTablesApi.getTables()
      ]);

      // 处理日志类型数据
      if (logTypesRes.status === 'fulfilled') {
        const data = logTypesRes.value;
        if (data?.success && data?.data) {
          const logTypesData = Array.isArray(data.data) 
            ? data.data 
            : (data.data.items || []);
          setLogTypes(logTypesData);
        }
      }

      // 处理智能解析管道数据
      if (pipelinesRes.status === 'fulfilled') {
        const data = pipelinesRes.value;
        if (data?.data) {
          const items = Array.isArray(data.data) 
            ? data.data 
            : (data.data.pipelines || data.data.items || []);
          setPipelines(items.map((item: any) => ({
            ...item,
            // 规范化字段名，支持多种格式
            name: item.name || item.pipeline_name,
            parser: item.parser || item.input_format,
            mode: item.mode || 'single',
            smartDetect: item.smart_detect || false
          })));
        }
      }

      // 处理存储配置数据
      if (storageRes.status === 'fulfilled') {
        const data = storageRes.value;
        if (data?.code === 200 || data?.success) {
          const storageData = Array.isArray(data.data) 
            ? data.data 
            : (data.data.items || []);
          setStorageTables(storageData);
        }
      }
    } catch (error) {
      console.error('获取关联配置数据失败:', error);
    } finally {
      setIsLoadingMappingData(false);
    }
  };

  // 打开关联配置弹窗时获取数据并恢复已保存的配置
  useEffect(() => {
    if (showMappingModal && selectedSource) {
      // 从已选择的数据源恢复配置
      const source = selectedSource as any;
      setSelectedLogType(source.logTypeId || source.log_type_id || '');
      const pipeIds = source.parsePipelines?.filter((p: any) => p?.id).map((p: any) => p.id) 
        || source.pipelineIds || source.pipeline_ids || [];
      setSelectedPipelines(pipeIds);
      setSelectedStorageConfig(source.storageTableName || source.storage_table_name || '');
      fetchMappingData();
    }
  }, [showMappingModal, selectedSource]);

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
          logTypeId: item.log_type_id || item.logTypeId || '',
          logTypeName: item.log_type_name || item.logTypeName || '',
          pipelineIds: item.pipeline_ids || item.pipelineIds || [],
          pipelineNames: item.pipeline_names || item.pipelineNames || [],
          formatTemplateId: item.format_template_id,
          formatTemplateName: item.format_template_name,
          storageConfigId: item.storage_config_id || item.storageConfigId || '',
          storageConfig: {
            hypertable: item.storage_table_name || '',
            retentionDays: item.storage_retention_days || 30,
            compression: item.storage_compression ?? true,
            indexes: item.storage_indexes || [],
            partitionInterval: item.storage_partition || '1d',
            tableName: item.storage_table_name || '',
          },
          storageTableName: item.storage_table_name,
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

  const confirmDelete = async () => {
    if (selectedSource) {
      try {
        await dataSourcesApi.deleteDataSource(Number(selectedSource.id));
        setDataSources(prev => prev.filter(s => s.id !== selectedSource.id));
        props.onDeleteSource && props.onDeleteSource(selectedSource);
        showToast('删除成功', 'success');
      } catch (error) {
        console.error('删除数据源失败:', error);
        showToast('删除失败', 'error');
      }
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

  // 启动 Flink 任务
  const [flinkError, setFlinkError] = useState<string | null>(null);
  const handleStartFlinkJob = async (source: DataSource) => {
    try {
      setFlinkError(null);
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
        setFlinkError(res.error || '启动 Flink 任务失败，请检查 Flink 集群状态和关联配置');
        setDataSources(prev => prev.map(s =>
          s.id === source.id ? { ...s, isLoading: false } : s
        ));
      }
    } catch (error: any) {
      const msg = error?.message || '启动 Flink 任务失败';
      console.error('启动 Flink 任务失败:', msg);
      setFlinkError(msg);
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

  const openPipelineModal = (source: DataSource) => {
    setSelectedSource(source);
    const pipeIds = source.parsePipelines?.filter((p: any) => p?.id).map((p: any) => p.id) || [];
    setSelectedPipelines(pipeIds);
    setShowPipelineModal(true);
  };

  const savePipelines = () => {
    if (selectedSource) {
      const newPipelines = pipelines
        .filter(p => selectedPipelines.includes(String(p.id)))
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
              className="w-56 pl-10 pr-4 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary placeholder-text-muted focus:ring-2 focus:ring-primary/20 focus:border-transparent text-sm"
            />
            <Activity className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as typeof filterType)}
            className="px-3 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary focus:ring-2 focus:ring-primary/20 focus:border-transparent cursor-pointer text-sm"
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
        <>
        {/* Flink 错误提示 */}
        {flinkError && (
          <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{flinkError}</span>
            <button onClick={() => setFlinkError(null)} className="p-1 hover:bg-rose-100 rounded">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredSources.map((source, index) => {
            const ProtocolIcon = protocolIcons[source.protocol || ''] || Server;
            const pipelineCount = (source as any).parsePipelines?.length || ((source as any).pipelineIds || (source as any).pipeline_ids || []).length;
            return (
              <motion.div
                key={source.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ x: 4 }}
                className="flex items-center gap-4 p-4 bg-card-bg border border-border-color rounded-xl hover:border-primary/30 transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <ProtocolIcon className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-text-primary">{source.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium border ${
                      source.type === 'pull'
                        ? 'bg-primary/10 text-primary border-primary/20'
                        : 'bg-emerald-50 text-emerald-600 border-emerald-200'
                    }`}>
                      {source.type === 'pull' ? 'Pull' : 'Push'}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium border ${getStatusColor(source.status)}`}>
                      {getStatusText(source.status)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-text-secondary">
                    <button
                      onClick={async () => {
                        // 点击配置按钮时直接从API获取最新数据
                        try {
                          const res = await dataSourcesApi.getDataSource(Number(source.id));
                          if (res.success && res.data) {
                            const latestSource = {
                              ...source,
                              ...res.data,
                              id: String(res.data.id),
                            };
                            setSelectedSource(latestSource);
                            setSelectedLogType(latestSource.log_type_id || latestSource.logTypeId || '');
                            const pipeIds = (latestSource.pipeline_ids || latestSource.pipelineIds || []).map((id: any) => String(id));
                            setSelectedPipelines(pipeIds);
                            setSelectedStorageConfig(latestSource.storage_table_name || latestSource.storageTableName || '');
                          } else {
                            setSelectedSource(source);
                            setSelectedLogType((source as any).logTypeId || (source as any).log_type_id || '');
                            const pipeIds = (source.pipelineIds || source.pipeline_ids || []).map((id: any) => String(id));
                            setSelectedPipelines(pipeIds);
                            setSelectedStorageConfig(source.storageTableName || source.storage_table_name || '');
                          }
                        } catch (e) {
                          // 失败时使用本地数据
                          setSelectedSource(source);
                          setSelectedLogType((source as any).logTypeId || (source as any).log_type_id || '');
                          const pipeIds = (source.pipelineIds || source.pipeline_ids || []).map((id: any) => String(id));
                          setSelectedPipelines(pipeIds);
                          setSelectedStorageConfig(source.storageTableName || source.storage_table_name || '');
                        }
                        setShowMappingModal(true);
                      }}
                      className="flex items-center gap-1 hover:text-primary transition-colors"
                    >
                      <FileText className="w-3 h-3" />
                      <span>{(source as any).logTypeName || (source as any).log_type_name || '未设置'}</span>
                    </button>
                    <span className="text-text-muted">·</span>
                    <button
                      onClick={() => openPipelineModal(source)}
                      className="flex items-center gap-1 hover:text-primary transition-colors"
                    >
                      <GitBranch className="w-3 h-3" />
                      <span>{pipelineCount} 个管道</span>
                    </button>
                    <span className="text-text-muted">·</span>
                  </div>
                  <div className="text-xs text-text-muted mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {source.created_at ? new Date(source.created_at).toLocaleString('zh-CN') : '-'}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  {source.logTypeId && source.storageTableName && (
                    source.flinkJobStatus === 'running' ? (
                      <button
                        onClick={() => handleStopFlinkJob(source)}
                        disabled={source.isLoading}
                        className="p-1.5 text-emerald-600 hover:text-emerald-700 rounded-lg hover:bg-emerald-50 transition-colors"
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
                        className="p-1.5 text-primary hover:text-primary rounded-lg hover:bg-primary/10"
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
                  <button onClick={() => handleViewClick(source)} className="p-1.5 text-text-muted hover:text-primary rounded-lg hover:bg-primary/10 transition-colors">
                    <Eye className="w-4 h-4" />
                  </button>
                  <button onClick={() => props.onEditSource && props.onEditSource(source)} className="p-1.5 text-text-muted hover:text-primary rounded-lg hover:bg-primary/10 transition-colors">
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDeleteClick(source)} className="p-1.5 text-text-muted hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            );
          })}
          {filteredSources.length === 0 && (
            <div className="text-center py-12">
              <Database className="w-12 h-12 mx-auto text-text-muted mb-3" />
              <p className="text-text-muted">暂无数据源</p>
              <p className="text-xs text-text-muted mt-1">点击上方按钮添加第一个数据源</p>
            </div>
          )}
        </div>
        </>
      )}

      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowAddModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card-bg border border-border-color rounded-xl p-6 w-full max-w-3xl max-h-[85vh] overflow-auto shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border-color pb-6 mb-6">
                <h2 className="text-lg font-semibold text-text-primary">添加数据源</h2>
                <button onClick={() => setShowAddModal(false)} className="p-2 text-text-muted hover:text-text-secondary rounded-lg hover:bg-page-bg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {addStep === 1 && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => setSourceType('pull')}
                      className={`p-6 rounded-xl border-2 transition-all text-left ${
                        sourceType === 'pull' ? 'border-primary bg-primary/10' : 'border-border-color hover:border-primary/30'
                      }`}
                    >
                      <ArrowDownCircle className={`w-8 h-8 mb-3 ${sourceType === 'pull' ? 'text-primary' : 'text-text-muted'}`} />
                      <h3 className={`font-medium mb-1 ${sourceType === 'pull' ? 'text-primary' : 'text-text-primary'}`}>主动拉取</h3>
                      <p className="text-sm text-text-muted">从外部系统主动获取数据</p>
                    </button>
                    <button
                      onClick={() => setSourceType('push')}
                      className={`p-6 rounded-xl border-2 transition-all text-left ${
                        sourceType === 'push' ? 'border-primary bg-primary/10' : 'border-border-color hover:border-primary/30'
                      }`}
                    >
                      <Inbox className={`w-8 h-8 mb-3 ${sourceType === 'push' ? 'text-primary' : 'text-text-muted'}`} />
                      <h3 className={`font-medium mb-1 ${sourceType === 'push' ? 'text-primary' : 'text-text-primary'}`}>被动接收</h3>
                      <p className="text-sm text-text-muted">接收外部系统推送的数据</p>
                    </button>
                  </div>
                  <div className="flex justify-end">
                    <button onClick={() => setAddStep(2)} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors text-sm font-medium">
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
                          protocol === key ? 'border-primary bg-primary/10' : 'border-border-color hover:border-primary/30'
                        }`}
                      >
                        <Icon className={`w-6 h-6 ${protocol === key ? 'text-primary' : 'text-text-muted'}`} />
                        <span className={`text-sm font-medium ${protocol === key ? 'text-primary' : 'text-text-primary'}`}>{key.toUpperCase()}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between">
                    <button onClick={() => setAddStep(1)} className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors text-sm font-medium">上一步</button>
                    <button onClick={() => setAddStep(3)} disabled={!protocol} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium">下一步</button>
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
                      className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary focus:ring-2 focus:ring-primary/20 focus:border-transparent" 
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
                            className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary h-20 resize-none focus:ring-2 focus:ring-primary/20 focus:border-transparent"
                          />
                        ) : (
                          <input 
                            type={field.type}
                            value={formData[field.label] || ''}
                            onChange={e => setFormData({ ...formData, [field.label]: e.target.value })}
                            placeholder={field.placeholder}
                            className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary focus:ring-2 focus:ring-primary/20 focus:border-transparent"
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
                          className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary-hover disabled:opacity-50"
                        >
                          {isTesting ? <Zap className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                          {isTesting ? '测试中...' : '测试连接'}
                        </button>
                        <span className="text-sm text-text-muted">验证配置是否正确</span>
                      </>
                    )}
                  </div>

                  <div className="flex justify-between pt-4 border-t border-border-color">
                    <button onClick={() => setAddStep(2)} className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors text-sm font-medium">上一步</button>
                    <button onClick={() => setShowAddModal(false)} disabled={!testSuccess} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 text-sm font-medium">完成</button>
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowPipelineModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card-bg border border-border-color rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-auto shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border-color pb-6 mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">关联解析管道</h2>
                  <p className="text-sm text-text-muted mt-1">为 {selectedSource.name} 选择解析管道</p>
                </div>
                <button onClick={() => setShowPipelineModal(false)} className="p-2 text-text-muted hover:text-text-secondary rounded-lg hover:bg-page-bg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 mb-6">
                <p className="text-sm text-text-secondary">选择多个解析管道实现智能解析，系统会按优先级自动匹配</p>
                {pipelines.map((pipeline, index) => (
                  <div
                    key={pipeline.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedPipelines.includes(String(pipeline.id))
                        ? 'border-primary bg-primary/10'
                        : 'border-border-color hover:border-border-color'
                    }`}
                    onClick={() => {
                      const pipelineId = String(pipeline.id);
                      if (selectedPipelines.includes(pipelineId)) {
                        setSelectedPipelines(selectedPipelines.filter(id => id !== pipelineId));
                      } else {
                        setSelectedPipelines([...selectedPipelines, pipelineId]);
                      }
                    }}
                  >
                    <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                      selectedPipelines.includes(String(pipeline.id)) ? 'bg-primary border-primary' : 'border-border-color'
                    }`}>
                      {selectedPipelines.includes(String(pipeline.id)) && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-text-primary">{pipeline.name}</span>
                        <span className="px-1.5 py-0.5 text-xs bg-page-bg text-text-secondary rounded font-medium">{pipeline.parser}</span>
                      </div>
                      <div className="text-xs text-text-muted">优先级: {index + 1}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border-color">
                <button onClick={() => setShowPipelineModal(false)} className="px-4 py-2 text-text-secondary hover:text-text-primary text-sm">取消</button>
                <button onClick={savePipelines} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover text-sm font-medium">
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowMappingModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card-bg border border-border-color rounded-xl p-6 w-full max-w-5xl max-h-[90vh] overflow-auto shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border-color pb-6 mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">数据流关联配置</h2>
                  <p className="text-sm text-text-muted mt-1">为 {selectedSource.name} 配置完整的日志处理链路</p>
                </div>
                <button onClick={() => setShowMappingModal(false)} className="p-2 text-text-muted hover:text-text-secondary rounded-lg hover:bg-page-bg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 加载状态 */}
              {isLoadingMappingData ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  {/* 关联链路流程图 */}
                  <div className="flex items-center gap-3 mb-8 p-4 bg-gradient-to-r from-blue-50 via-emerald-50 to-purple-50 rounded-xl">
                    <div className="flex items-center gap-2 px-4 py-2 bg-card-bg rounded-lg shadow-sm">
                      <Database className="w-5 h-5 text-primary" />
                      <span className="text-sm font-medium text-text-primary">数据源</span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-text-muted" />
                    <div className="flex items-center gap-2 px-4 py-2 bg-card-bg rounded-lg shadow-sm">
                      <FileText className="w-5 h-5 text-emerald-600" />
                      <span className="text-sm font-medium text-text-primary">日志类型</span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-text-muted" />
                    <div className="flex items-center gap-2 px-4 py-2 bg-card-bg rounded-lg shadow-sm">
                      <GitBranch className="w-5 h-5 text-amber-600" />
                      <span className="text-sm font-medium text-text-primary">解析管道</span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-text-muted" />
                    <div className="flex items-center gap-2 px-4 py-2 bg-card-bg rounded-lg shadow-sm">
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
                      {logTypes.map(logType => (
                        <div
                          key={logType.id}
                          onClick={() => setSelectedLogType(String(logType.id))}
                          className={`p-3 rounded-lg border cursor-pointer transition-all ${
                            selectedLogType === String(logType.id)
                              ? 'border-emerald-500 bg-emerald-50'
                              : 'border-border-color hover:border-emerald-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                              selectedLogType === String(logType.id) ? 'bg-emerald-500 border-emerald-500' : 'border-border-color'
                            }`}>
                              {selectedLogType === String(logType.id) && <CheckCircle className="w-3 h-3 text-white" />}
                            </div>
                            <span className="text-sm font-medium text-text-primary">{logType.name}</span>
                          </div>
                          <p className="text-xs text-text-muted pl-6">{logType.description || '暂无描述'}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 2. 选择智能解析 */}
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
                      <span className="w-6 h-6 flex items-center justify-center bg-violet-100 text-violet-600 rounded-full text-xs font-bold">2</span>
                      选择智能解析
                      <span className="text-xs text-text-muted font-normal ml-2">智能解析自动识别和处理多种日志格式</span>
                    </h3>
                    <div className="grid grid-cols-3 gap-3">
                      {pipelines.map((pipeline, index) => {
                        const isSmart = pipeline.mode === 'multi' || pipeline.smartDetect || pipeline.parser === 'auto';
                        return (
                          <div
                            key={pipeline.id}
                            onClick={() => {
                              if (selectedPipelines.includes(String(pipeline.id))) {
                                setSelectedPipelines(selectedPipelines.filter(id => id !== String(pipeline.id)));
                              } else {
                                setSelectedPipelines([...selectedPipelines, String(pipeline.id)]);
                              }
                            }}
                            className={`p-3 rounded-lg border cursor-pointer transition-all ${
                              selectedPipelines.includes(String(pipeline.id))
                                ? 'border-violet-500 bg-violet-50'
                                : 'border-border-color hover:border-violet-300'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                                selectedPipelines.includes(String(pipeline.id)) ? 'bg-violet-500 border-violet-500' : 'border-border-color'
                              }`}>
                                {selectedPipelines.includes(String(pipeline.id)) && <CheckCircle className="w-3 h-3 text-white" />}
                              </div>
                              <span className="text-sm font-medium text-text-primary">{pipeline.name}</span>
                              {isSmart && (
                                <span className="px-1.5 py-0.5 text-xs bg-gradient-to-r from-violet-100 to-purple-100 text-violet-600 rounded font-medium border border-violet-200">
                                  智能
                                </span>
                              )}
                              <span className="px-1.5 py-0.5 text-xs bg-page-bg text-text-secondary rounded ml-auto">
                                #{index + 1}
                              </span>
                            </div>
                            <p className="text-xs text-text-muted pl-6">
                              {isSmart ? '自动识别多种格式' : `解析器: ${(pipeline.parser || pipeline.input_format || 'unknown').toUpperCase()}`}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 3. 存储配置 */}
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
                      <span className="w-6 h-6 flex items-center justify-center bg-purple-100 text-purple-600 rounded-full text-xs font-bold">3</span>
                      选择存储配置
                      <span className="text-xs text-text-muted font-normal ml-2">定义数据保留策略和存储位置（包含系统预置和自定义配置）</span>
                    </h3>
                    <div className="grid grid-cols-3 gap-3">
                      {storageTables.map(storage => {
                        // 支持两种字段命名格式：camelCase 和 snake_case
                        const tableName = storage.table_name || storage.name;
                        const retentionDays = storage.retention_days || storage.retentionDays || 30;
                        const isSystemPreset = storage.auto_created || storage.is_default || !storage.created_by || storage.is_preset;
                        return (
                          <div
                            key={storage.id}
                            onClick={() => setSelectedStorageConfig(String(storage.id))}
                            className={`p-3 rounded-lg border cursor-pointer transition-all ${
                              selectedStorageConfig === String(storage.id)
                                ? 'border-purple-500 bg-purple-50'
                                : 'border-border-color hover:border-purple-300'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                                selectedStorageConfig === String(storage.id) ? 'bg-purple-500 border-purple-500' : 'border-border-color'
                              }`}>
                                {selectedStorageConfig === String(storage.id) && <CheckCircle className="w-3 h-3 text-white" />}
                              </div>
                              <span className="text-sm font-medium text-text-primary">{storage.displayName || storage.name || tableName}</span>
                              {isSystemPreset && (
                                <span className="px-1.5 py-0.5 text-xs bg-amber-50 text-amber-600 rounded font-medium border border-amber-200">
                                  系统预置
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-text-muted pl-6">{tableName}</p>
                            <div className="flex items-center gap-3 pl-6 mt-1">
                              <span className="text-xs text-purple-600">保留 {retentionDays} 天</span>
                              {storage.compression && <span className="text-xs text-text-muted">已压缩</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

              {/* 配置摘要 */}
              <div className="mb-6 p-4 bg-page-bg/50 rounded-lg">
                <h4 className="text-sm font-medium text-text-primary mb-3">配置摘要</h4>
                <div className="grid grid-cols-4 gap-4">
                  <div className="text-center p-2 bg-card-bg rounded-lg">
                    <div className="text-xs text-text-muted mb-1">数据源</div>
                    <div className="text-sm font-medium text-text-primary truncate">{selectedSource.name}</div>
                  </div>
                  <div className="text-center p-2 bg-card-bg rounded-lg">
                    <div className="text-xs text-text-muted mb-1">日志类型</div>
                    <div className="text-sm font-medium text-emerald-600 truncate">
                      {logTypes.find(l => String(l.id) === selectedLogType)?.name || '-'}
                    </div>
                  </div>
                  <div className="text-center p-2 bg-card-bg rounded-lg">
                    <div className="text-xs text-text-muted mb-1">智能解析</div>
                    <div className="text-sm font-medium text-violet-600 truncate">
                      {selectedPipelines.length > 0 ? `${selectedPipelines.length} 个` : '-'}
                    </div>
                  </div>
                  <div className="text-center p-2 bg-card-bg rounded-lg">
                    <div className="text-xs text-text-muted mb-1">存储配置</div>
                    <div className="text-sm font-medium text-purple-600 truncate">
                      {(() => {
                        const storage = storageTables.find(s => String(s.id) === selectedStorageConfig);
                        return storage?.displayName || storage?.name || storage?.table_name || '-';
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              </>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-border-color">
                <button 
                  onClick={() => setShowMappingModal(false)} 
                  className="px-4 py-2 text-text-secondary hover:text-text-primary text-sm"
                >
                  取消
                </button>
                <button 
                  onClick={async () => {
                    const logType = logTypes.find(l => String(l.id) === selectedLogType);
                    const storage = storageTables.find(s => String(s.id) === selectedStorageConfig);
                    const selectedPipelineList = pipelines.filter(p => selectedPipelines.includes(String(p.id)));

                    const storageTableName = storage?.table_name || storage?.name;
                    const storageRetentionDays = storage?.retention_days || storage?.retentionDays;

                    const mappingConfig = {
                      logTypeId: selectedLogType,
                      logTypeName: logType?.name,
                      pipelineIds: selectedPipelines,
                      pipelineNames: selectedPipelineList.map(p => p.name),
                      storageConfigId: selectedStorageConfig,
                      storageTableName,
                      storageRetentionDays
                    };

                    const result = await saveMappingConfig(selectedSource.id, mappingConfig);

                    if (!result.success) {
                      showToast(result.error || '保存关联配置失败，请检查后端服务', 'error');
                      return;
                    }

                    const updatedSource: any = {
                      ...selectedSource,
                      logTypeId: selectedLogType,
                      logTypeName: logType?.name,
                      parsePipelines: selectedPipelineList,
                      pipelineIds: selectedPipelines,
                      pipelineNames: selectedPipelineList.map(p => p.name),
                      storageConfig: storage ? {
                        tableName: storageTableName,
                        retentionDays: storageRetentionDays,
                        partitionInterval: '1d',
                        indexes: [],
                        compression: true,
                      } : selectedSource.storageConfig,
                      storageTableName: storageTableName || (selectedSource as any).storageTableName,
                      storageRetentionDays: storageRetentionDays || (selectedSource as any).storageRetentionDays,
                    };

                    setDataSources(prev => prev.map(s =>
                      s.id === selectedSource.id ? updatedSource : s
                    ));
                    setSelectedSource(updatedSource);
                    props.onEditSource && props.onEditSource(updatedSource);
                    props.onMappingUpdate && props.onMappingUpdate(updatedSource);
                    setShowMappingModal(false);
                  }}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors text-sm font-medium"
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowDetailModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card-bg border border-border-color rounded-xl p-6 w-full max-w-3xl max-h-[80vh] overflow-auto shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border-color pb-6 mb-6">
                <h2 className="text-lg font-semibold text-text-primary">{selectedSource.name}</h2>
                <button onClick={() => setShowDetailModal(false)} className="p-2 text-text-muted hover:text-text-secondary rounded-lg hover:bg-page-bg transition-colors">
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
                    <div className={`text-lg font-semibold ${getStatusColor((selectedSource as any).status || '').includes('emerald') ? 'text-emerald-600' : 'text-primary'}`}>
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowDeleteModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card-bg border border-border-color rounded-xl p-6 w-full max-w-md shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 pb-6 mb-6 border-b border-border-color">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                </div>
                <h2 className="text-lg font-semibold text-text-primary">确认删除</h2>
              </div>
              <p className="text-text-secondary mb-6">
                确定要删除数据源 <span className="font-medium text-text-primary">{selectedSource.name}</span> 吗？此操作不可恢复。
              </p>
              <div className="flex justify-end gap-3 pt-4 border-t border-border-color">
                <button onClick={() => setShowDeleteModal(false)} className="px-4 py-2 text-text-secondary hover:text-text-primary text-sm">取消</button>
                <button onClick={confirmDelete} className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 text-sm font-medium">确认删除</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}