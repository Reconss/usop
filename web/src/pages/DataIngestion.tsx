import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database, Plus, Server, Activity, ArrowDownCircle, Inbox,
  Search, ChevronRight, HardDrive, LayoutGrid
} from 'lucide-react';
import LogConfigSidebar from '../components/LogConfigSidebar';
import DataSourceManager from '../components/DataSourceManager';
import SmartParser from '../components/SmartParser';
import LogTypeManager from '../components/LogTypeManager';
import FormatTemplate from '../components/FormatTemplate';
import StorageConfig from '../components/StorageConfig';

// ==================== 类型定义 ====================

interface DataSource {
  id: string;
  name: string;
  type: 'pull' | 'push';
  protocol: string;
  status: 'connected' | 'disconnected' | 'error' | 'syncing' | 'paused';
  lastSync: string;
  eventsPerSecond: number;
  totalEvents: number;
  health: number;
  config: Record<string, any>;
  parsePipelines: ParsePipeline[];
  storageConfig: StorageConfigType;
  productMappings: ProductMapping[];
  stats: {
    parsedSuccess: number;
    parsedFailed: number;
    lastError?: string;
    lastErrorTime?: string;
  };
}

interface ParsePipeline {
  id: string;
  name: string;
  priority: number;
  condition: string;
  parser: 'json' | 'xml' | 'csv' | 'logfmt' | 'regex' | 'auto' | 'syslog' | 'cef' | 'grok';
  customRule?: string;
  isActive: boolean;
  description?: string;
  fieldMappings?: FieldMapping[];
  transformRules?: TransformRule[];
}

interface FieldMapping {
  sourceField: string;
  targetField: string;
  fieldType: 'string' | 'number' | 'boolean' | 'datetime' | 'ip' | 'json';
  required: boolean;
  defaultValue?: string;
}

interface TransformRule {
  id: string;
  name: string;
  type: 'replace' | 'regex' | 'split' | 'join' | 'math' | 'date' | 'custom';
  config: Record<string, any>;
  enabled: boolean;
}

interface StorageConfigType {
  hypertable: string;
  retentionDays: number;
  compression: boolean;
  indexes: string[];
  partitionInterval: string;
}

interface ProductMapping {
  id: string;
  productId: string;
  productName: string;
  enabled: boolean;
  fieldMappings: FieldMapping[];
  filterRules: FilterRule[];
}

interface FilterRule {
  id: string;
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'contains' | 'regex' | 'in';
  value: string;
  logic: 'and' | 'or';
}

// ==================== Mock数据 ====================

const mockDataSources: DataSource[] = [
  {
    id: 'ds-001',
    name: 'Kafka-安全日志',
    type: 'pull',
    protocol: 'kafka',
    status: 'connected',
    lastSync: '2026-05-01T10:30:00Z',
    eventsPerSecond: 3200,
    totalEvents: 156729384,
    health: 99,
    config: { brokers: 'kafka:9092', topic: 'security-logs', group: 'usop-consumer' },
    parsePipelines: [
      { id: 'p1', name: 'JSON标准解析', priority: 1, condition: 'header.format=="json"', parser: 'json', isActive: true },
      { id: 'p2', name: 'CEF格式解析', priority: 2, condition: 'content.startsWith("CEF:")', parser: 'regex', customRule: '^CEF:\d+\|([^|]+)\|', isActive: true }
    ],
    storageConfig: { hypertable: 'security_logs', retentionDays: 90, compression: true, indexes: ['timestamp', 'source_ip', 'severity'], partitionInterval: '1 day' },
    productMappings: [
      { id: 'pm1', productId: 'prod-001', productName: 'SIEM安全分析', enabled: true, fieldMappings: [{ sourceField: 'source_ip', targetField: 'src_ip', fieldType: 'ip', required: true }, { sourceField: 'severity', targetField: 'level', fieldType: 'string', required: true }], filterRules: [{ id: 'f1', field: 'severity', operator: 'in', value: 'high,critical', logic: 'and' }] }
    ],
    stats: { parsedSuccess: 156728000, parsedFailed: 1384 }
  },
  {
    id: 'ds-002',
    name: 'Syslog-网络设备',
    type: 'push',
    protocol: 'syslog',
    status: 'connected',
    lastSync: '2026-05-01T10:29:45Z',
    eventsPerSecond: 850,
    totalEvents: 28473920,
    health: 95,
    config: { host: '0.0.0.0', port: 514, protocol: 'udp', format: 'RFC5424' },
    parsePipelines: [
      { id: 'p1', name: 'Syslog RFC5424', priority: 1, condition: 'default', parser: 'syslog', isActive: true },
      { id: 'p2', name: 'Syslog RFC3164', priority: 2, condition: 'default', parser: 'syslog', isActive: true }
    ],
    storageConfig: { hypertable: 'syslog_events', retentionDays: 30, compression: true, indexes: ['timestamp', 'hostname', 'facility'], partitionInterval: '1 day' },
    productMappings: [],
    stats: { parsedSuccess: 28473000, parsedFailed: 920 }
  },
  {
    id: 'ds-003',
    name: 'S3-审计日志',
    type: 'pull',
    protocol: 's3',
    status: 'syncing',
    lastSync: '2026-05-01T10:28:00Z',
    eventsPerSecond: 2100,
    totalEvents: 89347291,
    health: 92,
    config: { bucket: 'audit-logs', region: 'cn-beijing', prefix: 'logs/', pollInterval: 300 },
    parsePipelines: [
      { id: 'p1', name: '自动识别', priority: 1, condition: 'default', parser: 'auto', isActive: true },
      { id: 'p2', name: 'CSV解析', priority: 2, condition: 'content.includes(",")', parser: 'csv', isActive: true }
    ],
    storageConfig: { hypertable: 'audit_logs', retentionDays: 180, compression: true, indexes: ['timestamp', 'user_id', 'action'], partitionInterval: '7 days' },
    productMappings: [],
    stats: { parsedSuccess: 89346000, parsedFailed: 1291 }
  },
  {
    id: 'ds-004',
    name: 'Webhook-告警推送',
    type: 'push',
    protocol: 'webhook',
    status: 'error',
    lastSync: '2026-05-01T09:15:00Z',
    eventsPerSecond: 0,
    totalEvents: 45238901,
    health: 45,
    config: { path: '/webhook/alerts', method: 'POST', auth: 'bearer' },
    parsePipelines: [
      { id: 'p1', name: 'JSON解析', priority: 1, condition: 'default', parser: 'json', isActive: true }
    ],
    storageConfig: { hypertable: 'webhook_alerts', retentionDays: 60, compression: true, indexes: ['timestamp', 'alert_id'], partitionInterval: '1 day' },
    productMappings: [],
    stats: { parsedSuccess: 45238000, parsedFailed: 901, lastError: 'Connection timeout', lastErrorTime: '2026-05-01T09:15:00Z' }
  }
];

// ==================== 辅助函数 ====================

const getStatusColor = (status: string) => {
  switch (status) {
    case 'connected': return 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30';
    case 'disconnected': return 'bg-slate-500/20 text-slate-500 border-slate-500/30';
    case 'error': return 'bg-rose-500/20 text-rose-500 border-rose-500/30';
    case 'syncing': return 'bg-indigo-500/20 text-indigo-500 border-indigo-500/30';
    case 'paused': return 'bg-amber-500/20 text-amber-500 border-amber-500/30';
    default: return 'bg-slate-500/20 text-slate-500 border-slate-500/30';
  }
};

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

// ==================== 主组件 ====================

export default function DataIngestion() {
  const [activeSection, setActiveSection] = useState('sources');
  const [dataSources, setDataSources] = useState<DataSource[]>(mockDataSources);
  const [selectedSource, setSelectedSource] = useState<DataSource | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'pull' | 'push'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'connected' | 'error' | 'syncing'>('all');

  const filteredSources = dataSources.filter(source => {
    if (searchQuery && !source.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterType !== 'all' && source.type !== filterType) return false;
    if (filterStatus !== 'all' && source.status !== filterStatus) return false;
    return true;
  });

  const handleAddSource = () => setShowAddModal(true);
  const handleEditSource = (source: DataSource) => {
    setSelectedSource(source);
    setShowAddModal(true);
  };
  const handleDeleteSource = (source: DataSource) => {
    setDataSources(prev => prev.filter(s => s.id !== source.id));
  };
  const handleToggleStatus = (source: DataSource) => {
    setDataSources(prev => prev.map(s => 
      s.id === source.id ? { ...s, status: s.status === 'paused' ? 'connected' : 'paused' } : s
    ));
  };
  const handleViewDetail = (source: DataSource) => {
    setSelectedSource(source);
    setShowDetailModal(true);
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'sources':
        return (
          <DataSourceManager
            dataSources={filteredSources}
            onAddSource={handleAddSource}
            onEditSource={handleEditSource}
            onDeleteSource={handleDeleteSource}
            onToggleStatus={handleToggleStatus}
            onViewDetail={handleViewDetail}
          />
        );
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
      <LogConfigSidebar activeSection={activeSection} onSectionChange={setActiveSection} />
      
      <div className="flex-1 overflow-auto">
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
