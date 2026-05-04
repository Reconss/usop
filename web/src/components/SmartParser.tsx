import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, CheckCircle, XCircle, Sparkles, Braces, FileCode, Table,
  ScrollText, Terminal, AlertTriangle, Code, Wand2, X, Trash2, Edit3, Eye,
  ArrowUp, ArrowDown, Save, AlertCircle, Settings2, Play, Pause,
  Database, Layers, FileJson, Link2, Cpu, Zap, Beaker, Fingerprint,
  GitMerge, Workflow, Search, Copy, ChevronRight,
  RefreshCw, Shield, Activity, Brain, Siren, ShieldCheck,
  Clock, Calendar, FileSearch, BarChart3, Target,
  HardDrive, Upload, Download, ShieldAlert,
  Globe, Lock, Server, Check, LayoutGrid, Filter, Loader2
} from 'lucide-react';
import { logTypesApi, dataSourcesApi, rulesApi } from '../services/api';

interface ParsePipeline {
  id?: number;
  name: string;
  parserType: string;
  sourceType: string;
  storageTarget: string;
  status?: 'active' | 'paused' | 'stopped';
}

interface LogType {
  id: number;
  name: string;
  category: string;
  description?: string;
}

interface StorageTable {
  id: number;
  name: string;
  columns: number;
  rows: number;
}

interface FormatTemplate {
  id: number;
  name: string;
  type: string;
  fields: number;
}

interface DetectionRule {
  id: number;
  name: string;
  type: string;
  status: string;
}

interface DataSource {
  id: number;
  name: string;
  type: string;
  status: string;
}

// 默认数据
const defaultFormatTemplates: FormatTemplate[] = [];
const defaultLogTypes: LogType[] = [];
const defaultStorageTables: StorageTable[] = [];
const defaultDataSources: DataSource[] = [];
const defaultDetectionRules: DetectionRule[] = [];

const parserTypes = [
  { id: 'json', name: 'JSON', icon: Braces, color: 'from-blue-500 to-indigo-500', bgColor: 'bg-blue-50', textColor: 'text-blue-600', borderColor: 'border-blue-200', desc: 'JSON结构化数据解析' },
  { id: 'xml', name: 'XML', icon: FileCode, color: 'from-orange-500 to-amber-500', bgColor: 'bg-orange-50', textColor: 'text-orange-600', borderColor: 'border-orange-200', desc: 'XML标记语言解析' },
  { id: 'csv', name: 'CSV', icon: Table, color: 'from-emerald-500 to-teal-500', bgColor: 'bg-emerald-50', textColor: 'text-emerald-600', borderColor: 'border-emerald-200', desc: 'CSV表格数据解析' },
  { id: 'logfmt', name: 'Logfmt', icon: ScrollText, color: 'from-cyan-500 to-blue-500', bgColor: 'bg-cyan-50', textColor: 'text-cyan-600', borderColor: 'border-cyan-200', desc: 'Key=Value格式解析' },
  { id: 'syslog', name: 'Syslog', icon: Terminal, color: 'from-violet-500 to-purple-500', bgColor: 'bg-violet-50', textColor: 'text-violet-600', borderColor: 'border-violet-200', desc: 'Syslog标准格式解析' },
  { id: 'cef', name: 'CEF', icon: AlertTriangle, color: 'from-rose-500 to-red-500', bgColor: 'bg-rose-50', textColor: 'text-rose-600', borderColor: 'border-rose-200', desc: 'CEF通用事件格式解析' },
  { id: 'grok', name: 'Grok', icon: Code, color: 'from-indigo-500 to-purple-500', bgColor: 'bg-indigo-50', textColor: 'text-indigo-600', borderColor: 'border-indigo-200', desc: 'Grok模式匹配解析' },
  { id: 'regex', name: 'Regex', icon: Fingerprint, color: 'from-amber-500 to-orange-500', bgColor: 'bg-amber-50', textColor: 'text-amber-600', borderColor: 'border-amber-200', desc: '正则表达式解析' },
  { id: 'auto', name: 'Auto', icon: Wand2, color: 'from-pink-500 to-rose-500', bgColor: 'bg-pink-50', textColor: 'text-pink-600', borderColor: 'border-pink-200', desc: '自动识别格式解析' }
];

const storageTargets = [
  { id: 'timescaledb', name: 'TimescaleDB', icon: Database, color: 'bg-blue-500', desc: '时序数据库存储', features: ['自动分区', '数据压缩', '时序索引', 'SQL查询'] },
  { id: 'elasticsearch', name: 'Elasticsearch', icon: Search, color: 'bg-amber-500', desc: '搜索引擎存储', features: ['全文检索', '倒排索引', '聚合分析', '近实时'] },
  { id: 'kafka', name: 'Kafka', icon: Workflow, color: 'bg-emerald-500', desc: '消息队列转发', features: ['高吞吐', '流式处理', '多订阅', '持久化'] },
  { id: 's3', name: 'S3存储', icon: HardDrive, color: 'bg-cyan-500', desc: '对象存储归档', features: ['低成本', '高可靠', '生命周期', '跨区域'] },
  { id: 'local', name: '本地文件', icon: FileJson, color: 'bg-gray-500', desc: '本地文件系统存储', features: ['简单快速', '无需网络', '文件格式', '本地访问'] }
];

const storageTargetConfigs: Record<string, {
  fields: Array<{ key: string; label: string; type: 'text' | 'number' | 'select' | 'checkbox' | 'password'; options?: string[]; placeholder?: string }>;
  advancedFields?: Array<{ key: string; label: string; type: 'text' | 'number' | 'select' | 'checkbox'; options?: string[]; placeholder?: string }>;
}> = {
  timescaledb: {
    fields: [
      { key: 'host', label: '主机地址', type: 'text', placeholder: 'localhost:5432' },
      { key: 'database', label: '数据库名', type: 'text', placeholder: 'logs_db' },
      { key: 'username', label: '用户名', type: 'text', placeholder: 'postgres' },
      { key: 'password', label: '密码', type: 'password', placeholder: '******' },
      { key: 'tableName', label: '存储表名', type: 'text', placeholder: 'log_events' },
      { key: 'retention', label: '数据保留(天)', type: 'number', placeholder: '30' }
    ],
    advancedFields: [
      { key: 'compression', label: '启用压缩', type: 'checkbox' },
      { key: 'partitionInterval', label: '分区间隔', type: 'select', options: ['1小时', '1天', '7天', '30天'] },
      { key: 'chunkSize', label: 'Chunk大小', type: 'text', placeholder: '1GB' },
      { key: 'connectionPool', label: '连接池大小', type: 'number', placeholder: '10' }
    ]
  },
  elasticsearch: {
    fields: [
      { key: 'hosts', label: 'ES节点地址', type: 'text', placeholder: 'http://localhost:9200' },
      { key: 'index', label: '索引名称', type: 'text', placeholder: 'logs-{date}' },
      { key: 'username', label: '用户名', type: 'text', placeholder: 'elastic' },
      { key: 'password', label: '密码', type: 'password', placeholder: '******' },
      { key: 'shards', label: '分片数', type: 'number', placeholder: '1' },
      { key: 'replicas', label: '副本数', type: 'number', placeholder: '1' }
    ],
    advancedFields: [
      { key: 'refreshInterval', label: '刷新间隔', type: 'text', placeholder: '1s' },
      { key: 'indexLifecycle', label: '索引生命周期', type: 'select', options: ['热', '温', '冷', '冻结'] },
      { key: 'mappingType', label: 'Mapping类型', type: 'select', options: ['strict', 'dynamic', 'runtime'] }
    ]
  },
  kafka: {
    fields: [
      { key: 'brokers', label: 'Broker地址', type: 'text', placeholder: 'localhost:9092' },
      { key: 'topic', label: 'Topic名称', type: 'text', placeholder: 'security-logs' },
      { key: 'acks', label: '确认级别', type: 'select', options: ['0', '1', 'all'] },
      { key: 'retries', label: '重试次数', type: 'number', placeholder: '3' },
      { key: 'batchSize', label: '批量大小', type: 'number', placeholder: '16384' },
      { key: 'lingerMs', label: '延迟发送(ms)', type: 'number', placeholder: '5' }
    ],
    advancedFields: [
      { key: 'compression', label: '压缩类型', type: 'select', options: ['none', 'gzip', 'snappy', 'lz4', 'zstd'] },
      { key: 'maxInFlight', label: '最大并发请求', type: 'number', placeholder: '5' },
      { key: 'enableIdempotence', label: '幂等性', type: 'checkbox' }
    ]
  },
  s3: {
    fields: [
      { key: 'endpoint', label: 'Endpoint', type: 'text', placeholder: 'https://s3.amazonaws.com' },
      { key: 'bucket', label: 'Bucket名称', type: 'text', placeholder: 'log-archive' },
      { key: 'accessKey', label: 'Access Key', type: 'text', placeholder: 'AKIA...' },
      { key: 'secretKey', label: 'Secret Key', type: 'password', placeholder: '******' },
      { key: 'prefix', label: '路径前缀', type: 'text', placeholder: 'logs/{date}/' },
      { key: 'format', label: '文件格式', type: 'select', options: ['JSON', 'Parquet', 'CSV', 'ORC'] }
    ],
    advancedFields: [
      { key: 'compression', label: '压缩格式', type: 'select', options: ['none', 'gzip', 'bzip2', 'snappy'] },
      { key: 'storageClass', label: '存储类型', type: 'select', options: ['STANDARD', 'IA', 'GLACIER', 'DEEP_ARCHIVE'] },
      { key: 'multipartSize', label: '分片大小(MB)', type: 'number', placeholder: '100' }
    ]
  },
  local: {
    fields: [
      { key: 'path', label: '存储路径', type: 'text', placeholder: '/var/log/parsed/' },
      { key: 'filename', label: '文件名格式', type: 'text', placeholder: 'logs_{date}.json' },
      { key: 'format', label: '文件格式', type: 'select', options: ['JSON', 'JSON Lines', 'CSV', 'Plain Text'] },
      { key: 'maxSize', label: '单文件最大(MB)', type: 'number', placeholder: '100' },
      { key: 'maxFiles', label: '保留文件数', type: 'number', placeholder: '30' },
      { key: 'rotateInterval', label: '轮转间隔', type: 'select', options: ['小时', '天', '周', '月'] }
    ],
    advancedFields: [
      { key: 'compression', label: '启用压缩', type: 'checkbox' },
      { key: 'syncWrite', label: '同步写入', type: 'checkbox' },
      { key: 'bufferSize', label: '缓冲区大小(KB)', type: 'number', placeholder: '64' }
    ]
  }
};

const severityConfig: Record<string, { color: string; bg: string; label: string }> = {
  critical: { color: 'text-rose-600', bg: 'bg-rose-50 border-rose-200', label: '危急' },
  high: { color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200', label: '高危' },
  medium: { color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', label: '中危' },
  low: { color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', label: '低危' }
};

const defaultPipelines: ParsePipeline[] = [
  { id: 'p1', name: 'JSON标准解析', priority: 1, parser: 'json', isActive: true, description: '标准JSON格式日志解析', fieldMappings: [{ sourceField: 'timestamp', targetField: 'ts', type: 'datetime' }], logTypeId: 'lt-003', logTypeName: '应用日志', storageTableId: 'st-001', storageTableName: 'alert_logs', mode: 'single', formatTemplateId: 'tpl-json', formatTemplateName: '通用JSON' },
  { id: 'p2', name: 'Syslog RFC5424', priority: 2, parser: 'syslog', isActive: true, description: 'Syslog RFC5424格式', logTypeId: 'lt-002', logTypeName: '系统日志', storageTableId: 'st-002', storageTableName: 'security_events', mode: 'single', formatTemplateId: 'tpl-syslog', formatTemplateName: 'Syslog RFC5424' },
  { id: 'p3', name: 'CEF安全事件', priority: 3, parser: 'cef', isActive: true, description: 'ArcSight CEF格式', logTypeId: 'lt-001', logTypeName: '安全日志', storageTableId: 'st-001', storageTableName: 'alert_logs', mode: 'single', formatTemplateId: 'tpl-cef', formatTemplateName: 'CEF标准格式' },
  { id: 'p4', name: 'Grok自定义', priority: 4, parser: 'grok', isActive: false, description: '自定义Grok模式', mode: 'single' },
  { id: 'p5', name: '智能识别', priority: 5, parser: 'auto', isActive: true, description: '自动识别格式', mode: 'multi', smartDetect: true }
];

const generateSecurityEvent = (rule: DetectionRule, logData: Record<string, any>): SecurityEvent => {
  const severities: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
    'RULE-001': 'high',
    'RULE-002': 'critical',
    'RULE-003': 'critical',
    'RULE-004': 'medium',
    'RULE-005': 'high'
  };

  return {
    id: `EVT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    title: `${rule.name} - 实时检测`,
    severity: severities[rule.id] || 'medium',
    confidence: Math.floor(Math.random() * 15) + 85,
    affectedAssets: logData.hostname ? [logData.hostname] : logData.server ? [logData.server] : ['unknown'],
    sourceIp: logData.source_ip || logData.client_ip || logData.src_ip || 'unknown',
    timestamp: new Date().toISOString(),
    status: 'new',
    eventType: '实时检测',
    description: `规则「${rule.name}」检测到异常行为: ${rule.description}`,
    ruleId: rule.id,
    rawLog: logData
  };
};

const getParserConfig = (parserId: string) => parserTypes.find(p => p.id === parserId) || parserTypes[0];

const parseWithConfig = (sample: string, parserType: string, config?: any): Array<{name: string; type: string; value: any}> => {
  if (!sample.trim()) return [];
  const fields: Array<{name: string; type: string; value: any}> = [];

  fields.push({ name: 'raw_log', type: 'string', value: sample.substring(0, 200) });

  try {
    switch (parserType) {
      case 'json':
        const jsonData = JSON.parse(sample);
        const extractFields = (obj: any, prefix = '') => {
          Object.entries(obj).forEach(([key, value]) => {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            if (value && typeof value === 'object' && !Array.isArray(value)) {
              extractFields(value, fullKey);
            } else {
              const type = typeof value === 'number' ? 'number' :
                           typeof value === 'boolean' ? 'boolean' :
                           /\d{4}-\d{2}-\d{2}/.test(String(value)) ? 'datetime' : 'string';
              fields.push({ name: fullKey, type, value: String(value).substring(0, 50) });
            }
          });
        };
        extractFields(jsonData);
        break;

      case 'keyvalue':
        const kvDelim = config?.kvDelimiter || '=';
        const pairDelim = config?.pairDelimiter || ' ';
        const pairs = sample.split(pairDelim);
        pairs.forEach(pair => {
          const [key, ...valueParts] = pair.split(kvDelim);
          if (key && valueParts.length > 0) {
            const value = valueParts.join(kvDelim).replace(/^["']|["']$/g, '');
            const type = /^\d+$/.test(value) ? 'number' :
                         /\d{4}-\d{2}-\d{2}/.test(value) ? 'datetime' : 'string';
            fields.push({ name: key.trim(), type, value });
          }
        });
        break;

      case 'grok':
        if (config?.grokPattern) {
          const pattern = config.grokPattern;
          const fieldMatches = pattern.match(/%{\w+:(\w+)}/g) || [];
          fieldMatches.forEach((match, idx) => {
            const fieldName = match.replace(/%{\w+:/, '').replace(/}$/, '');
            fields.push({ name: fieldName, type: 'string', value: `匹配组${idx + 1}` });
          });
        }
        break;

      case 'regex':
        if (config?.regexPattern) {
          const namedGroups = config.regexPattern.match(/\(\?<(\w+)>/g) || [];
          namedGroups.forEach((group) => {
            const name = group.replace('(?<', '').replace('>', '');
            fields.push({ name, type: 'string', value: '捕获值' });
          });
          if (namedGroups.length === 0) {
            const groups = config.regexPattern.match(/\([^?]/g) || [];
            groups.forEach((_, idx) => {
              fields.push({ name: `group${idx + 1}`, type: 'string', value: `捕获组${idx + 1}` });
            });
          }
        }
        break;

      case 'csv':
        const lines = sample.split('\n').filter(l => l.trim());
        if (lines.length > 0) {
          const delimiter = config?.csvDelimiter || ',';
          const hasHeader = config?.csvHeader !== false;
          const values = lines[0].split(delimiter).map(v => v.trim().replace(/^["']|["']$/g, ''));
          values.forEach((val, idx) => {
            const name = hasHeader ? val : `col${idx + 1}`;
            const sampleVal = hasHeader && lines[1] ? lines[1].split(delimiter)[idx]?.trim().replace(/^["']|["']$/g, '') : val;
            const type = /^\d+$/.test(sampleVal) ? 'number' :
                         /\d{4}-\d{2}-\d{2}/.test(sampleVal) ? 'datetime' : 'string';
            fields.push({ name, type, value: sampleVal || val });
          });
        }
        break;

      case 'syslog':
        const syslogMatch = sample.match(/<(\d+)>(\d+\s+)?(\S+)\s+(.*)/);
        if (syslogMatch) {
          fields.push(
            { name: 'priority', type: 'number', value: syslogMatch[1] },
            { name: 'timestamp', type: 'datetime', value: syslogMatch[3] || '' },
            { name: 'message', type: 'string', value: syslogMatch[4] || '' }
          );
        }
        break;

      case 'cef':
        const cefMatch = sample.match(/CEF:(\d+)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|(\d+)\|(.*)/);
        if (cefMatch) {
          fields.push(
            { name: 'version', type: 'string', value: cefMatch[1] },
            { name: 'deviceVendor', type: 'string', value: cefMatch[2] },
            { name: 'signatureId', type: 'string', value: cefMatch[5] },
            { name: 'severity', type: 'string', value: cefMatch[7] }
          );
        }
        break;
    }
  } catch (e) {
    console.error('Parse error:', e);
  }
  return fields;
};

export default function SmartParser() {
  const [pipelines, setPipelines] = useState<ParsePipeline[]>([]);
  const [formatTemplates, setFormatTemplates] = useState<FormatTemplate[]>([]);
  const [logTypes, setLogTypes] = useState<LogType[]>([]);
  const [storageTables, setStorageTables] = useState<StorageTable[]>([]);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [detectionRules, setDetectionRules] = useState<DetectionRule[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeFilter, setActiveFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<ParsePipeline | null>(null);
  const [showTestModal, setShowTestModal] = useState(false);
  const [editingPipeline, setEditingPipeline] = useState<ParsePipeline | null>(null);
  const [selectedPipeline, setSelectedPipeline] = useState<ParsePipeline | null>(null);

  const [activeTab, setActiveTab] = useState<'basic' | 'parse' | 'analysis' | 'filter' | 'storage'>('basic');

  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [templateSearchQuery, setTemplateSearchQuery] = useState('');
  const [templateCategory, setTemplateCategory] = useState('all');

  // 从API获取数据
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [logTypesRes, dataSourcesRes, rulesRes] = await Promise.allSettled([
          logTypesApi.getLogTypes({ page_size: 100 }),
          dataSourcesApi.getDataSources({ page_size: 100 }),
          rulesApi.getRules({ page_size: 100 })
        ]);

        if (logTypesRes.status === 'fulfilled' && logTypesRes.value.success) {
          const items = Array.isArray(logTypesRes.value.data) ? logTypesRes.value.data : logTypesRes.value.data?.items || [];
          setLogTypes(items.map((item: any) => ({
            id: item.id,
            name: item.name || item.type_name,
            category: item.category || 'other',
            description: item.description
          })));
        }

        if (dataSourcesRes.status === 'fulfilled' && dataSourcesRes.value.success) {
          const items = Array.isArray(dataSourcesRes.value.data) ? dataSourcesRes.value.data : dataSourcesRes.value.data?.items || [];
          setDataSources(items.map((item: any) => ({
            id: item.id,
            name: item.name || item.source_name,
            type: item.type || item.source_type,
            status: item.status || 'active'
          })));
        }

        if (rulesRes.status === 'fulfilled' && rulesRes.value.success) {
          const items = Array.isArray(rulesRes.value.data) ? rulesRes.value.data : rulesRes.value.data?.items || [];
          setDetectionRules(items.map((item: any) => ({
            id: item.id,
            name: item.name || item.rule_name,
            type: item.type || 'custom',
            status: item.status || 'active'
          })));
        }
      } catch (error) {
        console.error('获取数据失败:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const [formData, setFormData] = useState({
    name: '',
    parser: 'json',
    description: '',
    priority: 1,
    logTypeId: '',
    storageTableId: '',
    formatTemplateId: '',
    mode: 'single' as 'single' | 'multi',
    smartDetect: false,
    parserConfig: {} as any,
    sample: '',
    selectedRules: [] as string[],
    linkedPipelines: [] as string[],
    linkedTemplates: [] as string[],
    templateStorageMap: {} as Record<string, { tableId: string; tableName: string }>,
    filterRules: [] as Array<{ field: string; operator: 'eq' | 'ne' | 'gt' | 'lt' | 'contains' | 'regex'; value: string; logic: 'and' | 'or' }>
  });

  const [configDetectedFields, setConfigDetectedFields] = useState<{ name: string; type: string; value: any; selected: boolean; targetName?: string }[]>([]);
  const [isTestingConfig, setIsTestingConfig] = useState(false);

  const [storageConfig, setStorageConfig] = useState<Record<string, any>>({
    target: 'timescaledb',
    timescaledb: { host: 'localhost:5432', database: 'logs_db', username: 'postgres', password: '', tableName: '', retention: 30, compression: true, partitionInterval: '1天', chunkSize: '1GB', connectionPool: 10 },
    elasticsearch: { hosts: 'http://localhost:9200', index: 'logs-{date}', username: '', password: '', shards: 1, replicas: 1, refreshInterval: '1s', indexLifecycle: '热', mappingType: 'dynamic' },
    kafka: { brokers: 'localhost:9092', topic: 'security-logs', acks: 'all', retries: 3, batchSize: 16384, lingerMs: 5, compression: 'snappy', maxInFlight: 5, enableIdempotence: true },
    s3: { endpoint: 'https://s3.amazonaws.com', bucket: 'log-archive', accessKey: '', secretKey: '', prefix: 'logs/{date}/', format: 'JSON', compression: 'gzip', storageClass: 'STANDARD', multipartSize: 100 },
    local: { path: '/var/log/parsed/', filename: 'logs_{date}.json', format: 'JSON', maxSize: 100, maxFiles: 30, rotateInterval: '天', compression: true, syncWrite: false, bufferSize: 64 }
  });
  const [showAdvancedStorage, setShowAdvancedStorage] = useState(false);

  const [testLog, setTestLog] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [detectedFields, setDetectedFields] = useState<{ name: string; type: string; value: any; mapped: boolean; targetName?: string }[]>([]);

  const [analysisResults, setAnalysisResults] = useState<Array<{
    rule: DetectionRule;
    matched: boolean;
    event?: SecurityEvent;
    severity: string;
  }>>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [generatedEvents, setGeneratedEvents] = useState<SecurityEvent[]>([]);

  const filteredPipelines = useMemo(() => {
    return activeFilter === 'all'
      ? pipelines
      : pipelines.filter(p => p.parser === activeFilter);
  }, [pipelines, activeFilter]);

  const filteredTemplates = useMemo(() => {
    return formatTemplates.filter(t => {
      const matchesSearch = t.name.toLowerCase().includes(templateSearchQuery.toLowerCase()) ||
                           (t.description || '').toLowerCase().includes(templateSearchQuery.toLowerCase());
      const matchesCategory = templateCategory === 'all' || t.category === templateCategory;
      return matchesSearch && matchesCategory;
    });
  }, [templateSearchQuery, templateCategory, formatTemplates]);

  const getParserIcon = useCallback((parser: string) => {
    const found = parserTypes.find(p => p.id === parser);
    return found?.icon || Code;
  }, []);

  const handleSelectTemplate = useCallback((template: FormatTemplate) => {
    setFormData(prev => ({
      ...prev,
      parser: template.parserType,
      formatTemplateId: template.id,
      description: template.description,
      parserConfig: template.parserConfig || {}
    }));
    setShowTemplateSelector(false);
  }, []);

  const handleConfigTest = useCallback(async () => {
    if (!formData.sample.trim()) return;
    setIsTestingConfig(true);
    await new Promise(r => setTimeout(r, 300));
    const result = parseWithConfig(formData.sample, formData.parser, formData.parserConfig);
    const fieldsWithSelection = result.map((f: any) => ({ ...f, selected: false, targetName: f.name }));
    setConfigDetectedFields(fieldsWithSelection);
    setIsTestingConfig(false);
  }, [formData.sample, formData.parser, formData.parserConfig]);

  const toggleConfigFieldSelected = useCallback((index: number) => {
    setConfigDetectedFields(prev => prev.map((f, i) => i === index ? { ...f, selected: !f.selected } : f));
  }, []);

  const selectAllConfigFields = useCallback(() => {
    setConfigDetectedFields(prev => prev.map(f => ({ ...f, selected: true })));
  }, []);

  const deselectAllConfigFields = useCallback(() => {
    setConfigDetectedFields(prev => prev.map(f => ({ ...f, selected: false })));
  }, []);

  const updateConfigFieldTargetName = useCallback((index: number, targetName: string) => {
    setConfigDetectedFields(prev => prev.map((f, i) => i === index ? { ...f, targetName } : f));
  }, []);

  const runRealTimeAnalysis = useCallback(async (logData: Record<string, any>) => {
    const results: Array<{rule: DetectionRule; matched: boolean; event?: SecurityEvent; severity: string}> = [];
    const events: SecurityEvent[] = [];

    detectionRules.filter(r => r.status === 'enabled').forEach(rule => {
      let isMatch = false;
      let severity = 'medium';

      switch (rule.id) {
        case 'RULE-001':
          isMatch = logData.event_type === 'login' && logData.status === 'failed';
          severity = 'high';
          break;
        case 'RULE-002':
          isMatch = logData.event_type === 'network' && logData.action === 'lateral_movement';
          severity = 'critical';
          break;
        case 'RULE-003':
          isMatch = logData.event_type === 'data_access' && logData.sensitivity === 'high';
          severity = 'critical';
          break;
        case 'RULE-004':
          const hour = new Date().getHours();
          isMatch = logData.event_type === 'login' && (hour < 8 || hour > 20);
          severity = 'medium';
          break;
        case 'RULE-005':
          isMatch = logData.event_type === 'command' && /(rm|del|drop)/i.test(String(logData.command));
          severity = 'high';
          break;
      }

      if (isMatch) {
        const event = generateSecurityEvent(rule, logData);
        events.push(event);
        results.push({ rule, matched: true, event, severity });
      }
    });

    return { results, events };
  }, []);

  const handleAdd = useCallback(() => {
    const selectedFields = configDetectedFields.filter(f => f.selected).map(f => ({
      sourceField: f.name,
      targetField: f.targetName || f.name,
      type: f.type
    }));

    const newPipeline: ParsePipeline = {
      id: `p${Date.now()}`,
      name: formData.name,
      parser: formData.parser,
      priority: formData.priority,
      isActive: true,
      description: formData.description,
      fieldMappings: selectedFields,
      logTypeId: formData.logTypeId,
      logTypeName: logTypes.find(l => l.id === formData.logTypeId)?.name,
      storageTableId: formData.storageTableId,
      storageTableName: storageTables.find(s => s.id === formData.storageTableId)?.name,
      formatTemplateId: formData.formatTemplateId,
      formatTemplateName: formatTemplates.find(f => f.id === formData.formatTemplateId)?.name,
      mode: formData.mode,
      smartDetect: formData.smartDetect,
      selectedRules: formData.selectedRules,
      linkedPipelines: formData.linkedPipelines
    };
    setPipelines(prev => [...prev, newPipeline]);
    setShowAddModal(false);
    resetForm();
  }, [configDetectedFields, formData]);

  const resetForm = useCallback(() => {
    setFormData({ name: '', parser: 'json', description: '', priority: pipelines.length + 1, logTypeId: '', storageTableId: '', formatTemplateId: '', mode: 'single', smartDetect: false, parserConfig: {}, sample: '', selectedRules: [], linkedPipelines: [], linkedTemplates: [], templateStorageMap: {}, filterRules: [] });
    setConfigDetectedFields([]);
    setStorageConfig({ target: 'timescaledb', timescaledb: { host: 'localhost:5432', database: 'logs_db', username: 'postgres', password: '', tableName: '', retention: 30, compression: true, partitionInterval: '1天', chunkSize: '1GB', connectionPool: 10 }, elasticsearch: { hosts: 'http://localhost:9200', index: 'logs-{date}', username: '', password: '', shards: 1, replicas: 1, refreshInterval: '1s', indexLifecycle: '热', mappingType: 'dynamic' }, kafka: { brokers: 'localhost:9092', topic: 'security-logs', acks: 'all', retries: 3, batchSize: 16384, lingerMs: 5, compression: 'snappy', maxInFlight: 5, enableIdempotence: true }, s3: { endpoint: 'https://s3.amazonaws.com', bucket: 'log-archive', accessKey: '', secretKey: '', prefix: 'logs/{date}/', format: 'JSON', compression: 'gzip', storageClass: 'STANDARD', multipartSize: 100 }, local: { path: '/var/log/parsed/', filename: 'logs_{date}.json', format: 'JSON', maxSize: 100, maxFiles: 30, rotateInterval: '天', compression: true, syncWrite: false, bufferSize: 64 } });
    setActiveTab('basic');
    setTestLog('');
    setTestResult(null);
    setDetectedFields([]);
    setAnalysisResults([]);
    setGeneratedEvents([]);
    setTemplateSearchQuery('');
    setTemplateCategory('all');
    setShowAdvancedStorage(false);
  }, [pipelines.length]);

  const handleEdit = useCallback(() => {
    if (!editingPipeline) return;
    const selectedFields = configDetectedFields.filter(f => f.selected).map(f => ({
      sourceField: f.name,
      targetField: f.targetName || f.name,
      type: f.type
    }));

    setPipelines(prev => prev.map(p => p.id === editingPipeline.id ? {
      ...p,
      ...formData,
      fieldMappings: selectedFields,
      logTypeName: logTypes.find(l => l.id === formData.logTypeId)?.name,
      storageTableName: storageTables.find(s => s.id === formData.storageTableId)?.name,
      formatTemplateName: formatTemplates.find(f => f.id === formData.formatTemplateId)?.name
    } : p));
    setEditingPipeline(null);
    setShowAddModal(false);
    resetForm();
  }, [editingPipeline, configDetectedFields, formData, resetForm]);

  const handleDelete = useCallback(() => {
    if (!showDeleteConfirm) return;
    setPipelines(prev => prev.filter(p => p.id !== showDeleteConfirm.id));
    setShowDeleteConfirm(null);
  }, [showDeleteConfirm]);

  const toggleActive = useCallback((id: string) => {
    setPipelines(prev => prev.map(p => p.id === id ? { ...p, isActive: !p.isActive } : p));
  }, []);

  const movePriority = useCallback((id: string, direction: 'up' | 'down') => {
    const index = pipelines.findIndex(p => p.id === id);
    if (direction === 'up' && index > 0) {
      const newPipelines = [...pipelines];
      [newPipelines[index], newPipelines[index - 1]] = [newPipelines[index - 1], newPipelines[index]];
      setPipelines(newPipelines.map((p, i) => ({ ...p, priority: i + 1 })));
    } else if (direction === 'down' && index < pipelines.length - 1) {
      const newPipelines = [...pipelines];
      [newPipelines[index], newPipelines[index + 1]] = [newPipelines[index + 1], newPipelines[index]];
      setPipelines(newPipelines.map((p, i) => ({ ...p, priority: i + 1 })));
    }
  }, [pipelines]);

  const openAdd = useCallback(() => {
    setEditingPipeline(null);
    resetForm();
    setShowAddModal(true);
  }, [resetForm]);

  const openEdit = useCallback((pipeline: ParsePipeline) => {
    setEditingPipeline(pipeline);
    setFormData({
      name: pipeline.name,
      parser: pipeline.parser,
      description: pipeline.description || '',
      priority: pipeline.priority,
      logTypeId: pipeline.logTypeId || '',
      storageTableId: pipeline.storageTableId || '',
      formatTemplateId: pipeline.formatTemplateId || '',
      mode: pipeline.mode || 'single',
      smartDetect: pipeline.smartDetect || false,
      parserConfig: pipeline.parserConfig || {},
      sample: pipeline.sample || '',
      selectedRules: pipeline.selectedRules || [],
      linkedPipelines: pipeline.linkedPipelines || [],
      linkedTemplates: pipeline.linkedTemplates || []
    });
    setConfigDetectedFields((pipeline.fieldMappings || []).map(fm => ({
      name: fm.sourceField,
      type: fm.type,
      value: '',
      selected: true,
      targetName: fm.targetField
    })));
    setShowAddModal(true);
  }, []);

  const openDetail = useCallback((pipeline: ParsePipeline) => {
    setSelectedPipeline(pipeline);
    setShowDetailModal(true);
  }, []);

  const openTestModal = useCallback((pipeline: ParsePipeline) => {
    setSelectedPipeline(pipeline);
    setTestLog('');
    setTestResult(null);
    setDetectedFields([]);
    setAnalysisResults([]);
    setGeneratedEvents([]);
    setShowTestModal(true);
  }, []);

  const detectFieldsFromLog = useCallback((logContent: string) => {
    const fields: Array<{name: string; type: string; value: any}> = [];

    try {
      const jsonMatch = logContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonData = JSON.parse(jsonMatch[0]);
        Object.entries(jsonData).forEach(([key, value]) => {
          const type = typeof value === 'number' ? 'number' :
                       typeof value === 'boolean' ? 'boolean' :
                       /\d{4}-\d{2}-\d{2}/.test(String(value)) ? 'datetime' : 'string';
          fields.push({ name: key, type, value });
        });
        return { format: 'json', fields };
      }

      const syslogMatch = logContent.match(/<(\d+)>(\w+\s+\d+\s+\d+:\d+:\d+)\s+(\S+)\s+(.*)/);
      if (syslogMatch) {
        fields.push(
          { name: 'priority', type: 'number', value: syslogMatch[1] },
          { name: 'timestamp', type: 'datetime', value: syslogMatch[2] },
          { name: 'hostname', type: 'string', value: syslogMatch[3] },
          { name: 'message', type: 'string', value: syslogMatch[4] }
        );
        return { format: 'syslog', fields };
      }

      const cefMatch = logContent.match(/CEF:(\d+)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|(\d+)\|(.*)/);
      if (cefMatch) {
        fields.push(
          { name: 'version', type: 'string', value: cefMatch[1] },
          { name: 'deviceVendor', type: 'string', value: cefMatch[2] },
          { name: 'deviceProduct', type: 'string', value: cefMatch[3] },
          { name: 'deviceVersion', type: 'string', value: cefMatch[4] },
          { name: 'signatureId', type: 'string', value: cefMatch[5] },
          { name: 'name', type: 'string', value: cefMatch[6] },
          { name: 'severity', type: 'number', value: cefMatch[7] },
          { name: 'extensions', type: 'string', value: cefMatch[8] }
        );
        return { format: 'cef', fields };
      }

      const kvMatch = logContent.match(/(\w+)=([^\s]+)/g);
      if (kvMatch && kvMatch.length >= 2) {
        kvMatch.forEach(pair => {
          const [key, value] = pair.split('=');
          const type = /\d{4}-\d{2}-\d{2}/.test(value) ? 'datetime' :
                       /^\d+$/.test(value) ? 'number' : 'string';
          fields.push({ name: key, type, value });
        });
        return { format: 'key-value', fields };
      }

      const timestampMatch = logContent.match(/(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})/);
      const levelMatch = logContent.match(/\b(ERROR|WARN|INFO|DEBUG|TRACE)\b/i);
      const ipMatch = logContent.match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/);

      if (timestampMatch) fields.push({ name: 'timestamp', type: 'datetime', value: timestampMatch[1] });
      if (levelMatch) fields.push({ name: 'level', type: 'string', value: levelMatch[1] });
      if (ipMatch) fields.push({ name: 'ip', type: 'string', value: ipMatch[1] });

      const remaining = logContent
        .replace(timestampMatch?.[0] || '', '')
        .replace(levelMatch?.[0] || '', '')
        .replace(ipMatch?.[0] || '', '')
        .trim();
      if (remaining) fields.push({ name: 'message', type: 'string', value: remaining });

      return { format: 'auto-detected', fields };
    } catch {
      return { format: 'unknown', fields: [{ name: 'raw', type: 'string', value: logContent }] };
    }
  }, []);

  const runTest = useCallback(async () => {
    if (!testLog.trim()) return;
    const detection = detectFieldsFromLog(testLog);
    const fieldsWithMapped = detection.fields.map((f: any) => ({ ...f, mapped: false }));
    setDetectedFields(fieldsWithMapped);
    setTestResult({
      success: true,
      format: detection.format,
      fields: fieldsWithMapped,
      matchedPipeline: selectedPipeline?.name
    });

    const logData = detection.fields.reduce((acc, field) => {
      acc[field.name] = field.value;
      return acc;
    }, {} as Record<string, any>);

    setIsAnalyzing(true);
    await new Promise(r => setTimeout(r, 500));
    const { results, events } = await runRealTimeAnalysis(logData);
    setAnalysisResults(results);
    setGeneratedEvents(events);
    setIsAnalyzing(false);
  }, [testLog, selectedPipeline, detectFieldsFromLog, runRealTimeAnalysis]);

  const toggleFieldMapped = useCallback((index: number) => {
    setDetectedFields(prev => prev.map((f, i) => i === index ? { ...f, mapped: !f.mapped } : f));
  }, []);

  const saveFieldMappings = useCallback(() => {
    const mappedFields = detectedFields.filter(f => f.mapped);
    if (selectedPipeline && mappedFields.length > 0) {
      const newMappings = mappedFields.map(f => ({
        sourceField: f.name,
        targetField: f.targetName || f.name,
        type: f.type
      }));
      setPipelines(prev => prev.map(p => p.id === selectedPipeline.id ? {
        ...p,
        fieldMappings: [...(p.fieldMappings || []), ...newMappings]
      } : p));
      setShowTestModal(false);
      setTestLog('');
      setTestResult(null);
      setDetectedFields([]);
      setAnalysisResults([]);
      setGeneratedEvents([]);
    }
  }, [detectedFields, selectedPipeline]);

  const renderTemplateSelector = useCallback(() => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={templateSearchQuery}
            onChange={e => setTemplateSearchQuery(e.target.value)}
            placeholder="搜索格式模板..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <select
          value={templateCategory}
          onChange={e => setTemplateCategory(e.target.value)}
          className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">全部分类</option>
          <option value="web">Web服务器</option>
          <option value="system">系统日志</option>
          <option value="application">应用日志</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 max-h-80 overflow-auto">
        {filteredTemplates.map((template) => {
          const parserConfig = getParserConfig(template.parserType);
          return (
            <div
              key={template.id}
              onClick={() => handleSelectTemplate(template)}
              className="p-4 bg-white border border-gray-200 rounded-xl cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all"
            >
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg ${parserConfig.bgColor} flex items-center justify-center border ${parserConfig.borderColor}`}>
                  <FileJson className={`w-5 h-5 ${parserConfig.textColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-gray-900 text-sm">{template.name}</h4>
                    {template.isPreset && (
                      <span className="px-1.5 py-0.5 text-xs bg-amber-100 text-amber-600 rounded font-medium">预设</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mb-2 line-clamp-1">{template.description}</p>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-xs rounded font-medium ${parserConfig.bgColor} ${parserConfig.textColor}`}>
                      {template.parserType}
                    </span>
                    <span className="text-xs text-gray-400">{template.fields.length} 字段</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-center pt-2 border-t border-gray-100">
        <button
          onClick={() => setShowTemplateSelector(false)}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          手动配置
        </button>
      </div>
    </div>
  ), [filteredTemplates, templateSearchQuery, templateCategory, handleSelectTemplate]);

  const renderParserConfig = useCallback(() => {
    const { parser, parserConfig } = formData;

    switch (parser) {
      case 'grok':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Grok模式</label>
              <textarea
                value={parserConfig?.grokPattern || ''}
                onChange={e => setFormData(prev => ({ ...prev, parserConfig: { ...parserConfig, grokPattern: e.target.value } }))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm font-mono text-emerald-400 h-24 resize-none"
                placeholder="%{IPORHOST:client_ip} %{USER:ident}..."
              />
            </div>
          </div>
        );

      case 'regex':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">正则表达式</label>
              <textarea
                value={parserConfig?.regexPattern || ''}
                onChange={e => setFormData(prev => ({ ...prev, parserConfig: { ...parserConfig, regexPattern: e.target.value } }))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm font-mono text-amber-400 h-24 resize-none"
                placeholder="(?&lt;ip&gt;\\d+\\.\\d+\\.\\d+\\.\\d+) - (?&lt;user&gt;\\w+)..."
              />
            </div>
          </div>
        );

      case 'csv':
        return (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">分隔符</label>
              <select
                value={parserConfig?.csvDelimiter || ','}
                onChange={e => setFormData(prev => ({ ...prev, parserConfig: { ...parserConfig, csvDelimiter: e.target.value } }))}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
              >
                <option value=",">逗号 (,)</option>
                <option value="\t">制表符 (Tab)</option>
                <option value=";">分号 (;)</option>
                <option value="|">竖线 (|)</option>
              </select>
            </div>
            <div className="flex items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={parserConfig?.csvHeader !== false}
                  onChange={e => setFormData(prev => ({ ...prev, parserConfig: { ...parserConfig, csvHeader: e.target.checked } }))}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">第一行是表头</span>
              </label>
            </div>
          </div>
        );

      default:
        return null;
    }
  }, [formData.parser, formData.parserConfig]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">智能解析</h2>
          <p className="text-sm text-gray-500 mt-1">配置日志解析管道，支持实时安全分析并生成安全事件</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-xl text-sm font-medium shadow-lg shadow-indigo-200"
        >
          <Plus className="w-4 h-4" />添加管道
        </motion.button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <motion.div
          whileHover={{ y: -2, boxShadow: '0 10px 40px -10px rgba(99, 102, 241, 0.3)' }}
          className="bg-gradient-to-br from-indigo-50 via-blue-50 to-indigo-100 border border-indigo-200 rounded-2xl p-6 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-200/30 to-transparent rounded-full -mr-10 -mt-10" />
          <div className="flex items-start gap-4 relative">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-200">
              <Workflow className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">单一来源单一格式</h3>
              <p className="text-sm text-gray-600 leading-relaxed">使用单个解析管道处理固定格式的日志，适用于日志格式统一的场景。配置简单，解析效率高。</p>
              <div className="flex items-center gap-2 mt-4">
                <span className="px-2 py-1 text-xs bg-indigo-100 text-indigo-700 rounded-lg font-medium">固定格式</span>
                <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-lg font-medium">高性能</span>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -2, boxShadow: '0 10px 40px -10px rgba(139, 92, 246, 0.3)' }}
          className="bg-gradient-to-br from-violet-50 via-purple-50 to-pink-50 border border-violet-200 rounded-2xl p-6 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-violet-200/30 to-transparent rounded-full -mr-10 -mt-10" />
          <div className="flex items-start gap-4 relative">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-200">
              <Cpu className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">单一来源多种格式</h3>
              <p className="text-sm text-gray-600 leading-relaxed">使用多管道智能选择，自动识别并匹配最合适的解析器。适用于混合日志格式场景。</p>
              <div className="flex items-center gap-2 mt-4">
                <span className="px-2 py-1 text-xs bg-violet-100 text-violet-700 rounded-lg font-medium">智能识别</span>
                <span className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded-lg font-medium">多格式</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveFilter('all')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            activeFilter === 'all'
              ? 'bg-gray-900 text-white shadow-lg'
              : 'bg-white border border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-300'
          }`}
        >
          全部
        </button>
        {parserTypes.map(type => (
          <button
            key={type.id}
            onClick={() => setActiveFilter(type.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
              activeFilter === type.id
                ? `bg-gradient-to-r ${type.color} text-white shadow-lg`
                : 'bg-white border border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <type.icon className="w-4 h-4" />
            {type.name}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-700">解析管道 ({filteredPipelines.length})</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">启用的管道: {pipelines.filter(p => p.isActive).length}</span>
          </div>
        </div>

        <div className="space-y-3">
          {filteredPipelines.map((pipeline, index) => {
            const Icon = getParserIcon(pipeline.parser);
            const parserConfig = getParserConfig(pipeline.parser);
            return (
              <motion.div
                key={pipeline.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ y: -2, boxShadow: '0 4px 20px -4px rgba(0,0,0,0.1)' }}
                className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-2xl hover:border-indigo-300 transition-all group"
              >
                <div className="flex flex-col items-center gap-1">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => movePriority(pipeline.id, 'up')}
                    className="p-1 text-gray-300 hover:text-indigo-600 transition-colors"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </motion.button>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white text-sm font-bold shadow-md">
                    {pipeline.priority}
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => movePriority(pipeline.id, 'down')}
                    className="p-1 text-gray-300 hover:text-indigo-600 transition-colors"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </motion.button>
                </div>

                <div className={`w-12 h-12 rounded-xl ${parserConfig.bgColor} flex items-center justify-center border ${parserConfig.borderColor}`}>
                  <Icon className={`w-6 h-6 ${parserConfig.textColor}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-900">{pipeline.name}</span>
                    <span className={`px-2 py-0.5 text-xs rounded-lg font-medium ${parserConfig.bgColor} ${parserConfig.textColor} border ${parserConfig.borderColor}`}>
                      {pipeline.parser}
                    </span>
                    {pipeline.mode === 'multi' && (
                      <span className="px-2 py-0.5 text-xs bg-gradient-to-r from-violet-100 to-purple-100 text-violet-700 rounded-lg font-medium border border-violet-200 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> 智能
                      </span>
                    )}
                    {pipeline.isActive ? (
                      <span className="flex items-center gap-1 px-2 py-0.5 text-xs bg-emerald-50 text-emerald-600 rounded-lg font-medium border border-emerald-200">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> 运行中
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-500 rounded-lg font-medium border border-gray-200">
                        <div className="w-1.5 h-1.5 rounded-full bg-gray-400" /> 已暂停
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-2">
                    {pipeline.logTypeName && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Link2 className="w-3 h-3" /> {pipeline.logTypeName}
                      </span>
                    )}
                    {pipeline.formatTemplateName && (
                      <span className="text-xs text-indigo-600 flex items-center gap-1">
                        <FileJson className="w-3 h-3" /> {pipeline.formatTemplateName}
                      </span>
                    )}
                    {pipeline.fieldMappings && pipeline.fieldMappings.length > 0 && (
                      <span className="text-xs text-indigo-600 flex items-center gap-1">
                        <Database className="w-3 h-3" /> {pipeline.fieldMappings.length} 个字段映射
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => openTestModal(pipeline)}
                    className="p-2 text-gray-400 hover:text-emerald-600 rounded-xl hover:bg-emerald-50 transition-colors"
                    title="测试解析"
                  >
                    <Beaker className="w-4 h-4" />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => openDetail(pipeline)}
                    className="p-2 text-gray-400 hover:text-indigo-600 rounded-xl hover:bg-indigo-50 transition-colors"
                    title="查看详情"
                  >
                    <Eye className="w-4 h-4" />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => openEdit(pipeline)}
                    className="p-2 text-gray-400 hover:text-indigo-600 rounded-xl hover:bg-indigo-50 transition-colors"
                    title="编辑"
                  >
                    <Edit3 className="w-4 h-4" />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => toggleActive(pipeline.id)}
                    className={`p-2 rounded-xl transition-colors ${
                      pipeline.isActive
                        ? 'text-amber-500 hover:bg-amber-50'
                        : 'text-emerald-500 hover:bg-emerald-50'
                    }`}
                    title={pipeline.isActive ? '暂停' : '启用'}
                  >
                    {pipeline.isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setShowDeleteConfirm(pipeline)}
                    className="p-2 text-gray-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </motion.button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

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
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white border border-gray-200 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between z-10">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">{editingPipeline ? '编辑解析管道' : '添加解析管道'}</h2>
                  <p className="text-sm text-gray-500 mt-1">配置完整的日志解析流程：基础配置 → 日志解析 → 规则分析 → 存储</p>
                </div>
                <button onClick={() => setShowAddModal(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex border-b border-gray-200 bg-gray-50/50">
                {[
                  { id: 'basic', label: '基本配置', icon: Settings2 },
                  { id: 'parse', label: '日志解析', icon: FileJson },
                  { id: 'analysis', label: '规则分析', icon: Brain },
                  { id: 'filter', label: '过滤', icon: Filter },
                  { id: 'storage', label: '存储', icon: Database }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-all relative ${
                      activeTab === tab.id
                        ? 'text-indigo-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600"
                      />
                    )}
                  </button>
                ))}
              </div>

              <div className="p-6 overflow-auto max-h-[calc(90vh-220px)]">
                {activeTab === 'basic' && (
                  <div className="space-y-6">
                    <div className="p-5 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-2xl border border-indigo-200">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg">
                          <FileJson className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-base font-semibold text-gray-900 mb-2">格式模板</h3>
                          {formData.formatTemplateId ? (
                            <div className="space-y-3">
                              <div className="flex items-center gap-3">
                                <span className="text-sm text-gray-700">
                                  已选择: <span className="font-medium text-indigo-700">{formatTemplates.find(f => f.id === formData.formatTemplateId)?.name}</span>
                                </span>
                                <span className="px-2 py-0.5 text-xs bg-indigo-100 text-indigo-600 rounded font-medium">
                                  {formatTemplates.find(f => f.id === formData.formatTemplateId)?.type}
                                </span>
                              </div>
                              <button
                                onClick={() => setShowTemplateSelector(true)}
                                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
                              >
                                <RefreshCw className="w-3.5 h-3.5" /> 更换模板
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <p className="text-sm text-gray-600">选择格式模板可自动配置解析规则</p>
                              <button
                                onClick={() => setShowTemplateSelector(true)}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2"
                              >
                                <LayoutGrid className="w-4 h-4" /> 选择模板
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">管道名称</label>
                        <input
                          type="text"
                          value={formData.name}
                          onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                          placeholder="输入管道名称"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">优先级</label>
                        <input
                          type="number"
                          value={formData.priority}
                          onChange={e => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value) || 1 }))}
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">解析模式</label>
                      <div className="grid grid-cols-2 gap-4">
                        <motion.button
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => setFormData(prev => ({ ...prev, mode: 'single', linkedPipelines: [] }))}
                          className={`p-4 rounded-xl border-2 transition-all text-left ${
                            formData.mode === 'single'
                              ? 'border-indigo-500 bg-gradient-to-br from-indigo-50 to-blue-50'
                              : 'border-gray-200 hover:border-indigo-300'
                          }`}
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              formData.mode === 'single' ? 'bg-indigo-500' : 'bg-gray-100'
                            }`}>
                              <Workflow className={`w-4 h-4 ${formData.mode === 'single' ? 'text-white' : 'text-gray-400'}`} />
                            </div>
                            <span className={`font-medium ${formData.mode === 'single' ? 'text-indigo-700' : 'text-gray-900'}`}>单一格式</span>
                          </div>
                          <p className="text-xs text-gray-500">处理固定格式的日志</p>
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => setFormData(prev => ({ ...prev, mode: 'multi' }))}
                          className={`p-4 rounded-xl border-2 transition-all text-left ${
                            formData.mode === 'multi'
                              ? 'border-violet-500 bg-gradient-to-br from-violet-50 to-purple-50'
                              : 'border-gray-200 hover:border-violet-300'
                          }`}
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              formData.mode === 'multi' ? 'bg-violet-500' : 'bg-gray-100'
                            }`}>
                              <Cpu className={`w-4 h-4 ${formData.mode === 'multi' ? 'text-white' : 'text-gray-400'}`} />
                            </div>
                            <span className={`font-medium ${formData.mode === 'multi' ? 'text-violet-700' : 'text-gray-900'}`}>智能多格式</span>
                          </div>
                          <p className="text-xs text-gray-500">关联多个解析管道处理混合日志</p>
                        </motion.button>
                      </div>
                    </div>

                    {formData.mode === 'multi' && (
                      <div className="p-5 bg-gradient-to-r from-violet-50 to-purple-50 rounded-2xl border border-violet-200">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h4 className="text-sm font-semibold text-gray-900">关联格式模板</h4>
                            <p className="text-xs text-gray-500 mt-1">选择要关联的格式模板，系统会智能匹配最合适的模板解析日志</p>
                          </div>
                          <span className="text-xs text-gray-500">
                            已选择 {formData.linkedTemplates?.length || 0} 个
                          </span>
                        </div>

                        <div className="space-y-2 max-h-48 overflow-auto">
                          {formatTemplates.map(template => {
                            const isSelected = formData.linkedTemplates?.includes(String(template.id));
                            const parserConfig = getParserConfig(template.type || 'json');
                            const storageTable = formData.templateStorageMap?.[template.id];
                            return (
                              <div
                                key={template.id}
                                onClick={() => {
                                  const current = formData.linkedTemplates || [];
                                  const newLinked = isSelected
                                    ? current.filter(id => id !== template.id)
                                    : [...current, template.id];
                                  setFormData(prev => ({ ...prev, linkedTemplates: newLinked }));
                                }}
                                className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${
                                  isSelected
                                    ? 'bg-white border-violet-400 shadow-sm'
                                    : 'bg-white/50 border-transparent hover:border-violet-300'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                    isSelected ? 'bg-violet-500 border-violet-500' : 'border-gray-300'
                                  }`}>
                                    {isSelected && <Check className="w-3 h-3 text-white" />}
                                  </div>
                                  <div className={`w-8 h-8 rounded-lg ${parserConfig.bgColor} flex items-center justify-center`}>
                                    <FileJson className={`w-4 h-4 ${parserConfig.textColor}`} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-gray-900 text-sm">{template.name}</span>
                                      <span className={`px-2 py-0.5 text-xs rounded ${parserConfig.bgColor} ${parserConfig.textColor}`}>
                                        {template.parserType}
                                      </span>
                                      {template.isPreset && (
                                        <span className="px-1.5 py-0.5 text-xs bg-amber-100 text-amber-600 rounded">预设</span>
                                      )}
                                    </div>
                                    <p className="text-xs text-gray-500 truncate">{template.description}</p>
                                  </div>
                                  <div className="text-xs text-gray-400">{template.fields.length} 字段</div>
                                </div>
                                {isSelected && (
                                  <div className="mt-2 pt-2 border-t border-violet-100">
                                    <div className="flex items-center gap-2">
                                      <Database className="w-3 h-3 text-indigo-500" />
                                      <span className="text-xs text-gray-600">存储表:</span>
                                      <select
                                        value={storageTable?.tableId || ''}
                                        onChange={e => {
                                          e.stopPropagation();
                                          const table = storageTables.find(t => t.id === Number(e.target.value));
                                          setFormData(prev => ({
                                            ...prev,
                                            templateStorageMap: {
                                              ...prev.templateStorageMap,
                                              [template.id]: { tableId: e.target.value, tableName: table?.name || '' }
                                            }
                                          }));
                                        }}
                                        className="text-xs px-2 py-1 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                      >
                                        <option value="">选择存储表</option>
                                        {storageTables.map(table => (
                                          <option key={table.id} value={table.id}>{table.name}</option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
                            <p className="text-xs text-gray-600">
                              智能多格式模式会按优先级顺序尝试匹配关联的格式模板，第一个成功匹配的模板将解析该日志，并可存储到各自配置的表中。
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {!formData.formatTemplateId && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">解析器类型</label>
                        <div className="grid grid-cols-5 gap-2">
                          {parserTypes.map(parser => (
                            <motion.button
                              key={parser.id}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => setFormData(prev => ({ ...prev, parser: parser.id }))}
                              className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1 ${
                                formData.parser === parser.id
                                  ? `border-transparent bg-gradient-to-r ${parser.color} text-white shadow-lg`
                                  : 'border-gray-200 hover:border-gray-300'
                              }`}
                            >
                              <parser.icon className="w-4 h-4" />
                              <span className="text-xs font-medium">{parser.name}</span>
                            </motion.button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">描述</label>
                      <textarea
                        value={formData.description}
                        onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 h-20 resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        placeholder="输入描述"
                      />
                    </div>
                  </div>
                )}

                {activeTab === 'parse' && (
                  <div className="space-y-6">
                    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200">
                      <div className="flex items-center justify-between mb-3">
                        <label className="block text-sm font-medium text-gray-700 flex items-center gap-2">
                          <Beaker className="w-4 h-4 text-indigo-600" /> 样本日志
                        </label>
                        <button
                          onClick={handleConfigTest}
                          disabled={!formData.sample.trim() || isTestingConfig}
                          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {isTestingConfig ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                          运行测试
                        </button>
                      </div>
                      <textarea
                        value={formData.sample}
                        onChange={e => setFormData(prev => ({ ...prev, sample: e.target.value }))}
                        className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-emerald-400 h-32 font-mono text-sm resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="粘贴日志内容，点击运行测试识别字段..."
                      />
                    </div>

                    {renderParserConfig()}

                    {configDetectedFields.length > 0 && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-amber-500" />
                            <span className="font-semibold text-gray-900">识别字段</span>
                            <span className="text-sm text-gray-500">({configDetectedFields.filter(f => f.selected).length}/{configDetectedFields.length})</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={selectAllConfigFields}
                              className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                              全选
                            </button>
                            <button
                              onClick={deselectAllConfigFields}
                              className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                              清空
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2 max-h-64 overflow-auto">
                          {configDetectedFields.map((field, idx) => (
                            <div
                              key={idx}
                              className={`p-3 rounded-xl border transition-all ${
                                field.selected ? 'bg-indigo-50 border-indigo-300' : 'bg-gray-50 border-gray-200'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <button
                                  onClick={() => toggleConfigFieldSelected(idx)}
                                  className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center transition-colors ${
                                    field.selected ? 'bg-indigo-600 text-white' : 'border-2 border-gray-300 hover:border-indigo-400'
                                  }`}
                                >
                                  {field.selected && <CheckCircle className="w-3.5 h-3.5" />}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-3 mb-2">
                                    <span className="font-semibold text-gray-900">{field.name}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${
                                      field.type === 'datetime' ? 'bg-purple-100 text-purple-600' :
                                      field.type === 'number' ? 'bg-blue-100 text-blue-600' :
                                      field.type === 'boolean' ? 'bg-amber-100 text-amber-600' :
                                      'bg-gray-100 text-gray-600'
                                    }`}>{field.type}</span>
                                    <button
                                      onClick={() => navigator.clipboard.writeText(field.name)}
                                      className="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
                                      title="复制字段名"
                                    >
                                      <Copy className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  {field.selected && (
                                    <div className="mb-2">
                                      <label className="text-xs text-gray-500 mb-1 block">目标字段名</label>
                                      <input
                                        type="text"
                                        value={field.targetName || field.name}
                                        onChange={e => updateConfigFieldTargetName(idx, e.target.value)}
                                        className="w-full px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                        placeholder="输入目标字段名"
                                      />
                                    </div>
                                  )}
                                  <div className="text-sm text-gray-600 font-mono bg-white p-2 rounded-lg border border-gray-200 break-all">
                                    {String(field.value).length > 100 ? String(field.value).substring(0, 100) + '...' : String(field.value)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'analysis' && (
                  <div className="space-y-6">
                    <div className="p-5 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-2xl border border-indigo-200">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg">
                          <Brain className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-base font-semibold text-gray-900 mb-2">实时安全分析配置</h3>
                          <p className="text-sm text-gray-600">配置当前解析管道需要执行的检测规则。解析完成后，系统会自动将日志与选中的规则进行匹配。</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-semibold text-gray-900">选择检测规则</h4>
                        <span className="text-xs text-gray-500">
                          已选择 {formData.selectedRules?.length || 0} 条规则
                        </span>
                      </div>

                      <div className="space-y-3">
                        {detectionRules.filter(r => r.status === 'enabled').map(rule => {
                          const isSelected = formData.selectedRules?.includes(rule.id);
                          return (
                            <div
                              key={rule.id}
                              onClick={() => {
                                const currentRules = formData.selectedRules || [];
                                const newRules = isSelected
                                  ? currentRules.filter(id => id !== rule.id)
                                  : [...currentRules, rule.id];
                                setFormData(prev => ({ ...prev, selectedRules: newRules }));
                              }}
                              className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                                isSelected
                                  ? 'bg-gradient-to-r from-violet-50 to-purple-50 border-violet-400 shadow-md'
                                  : 'bg-white border-gray-200 hover:border-violet-300'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                  isSelected ? 'bg-violet-500 border-violet-500' : 'border-gray-300'
                                }`}>
                                  {isSelected && <Check className="w-3 h-3 text-white" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-gray-900 text-sm">{rule.name}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded ${
                                      rule.severity === 'critical' ? 'bg-rose-100 text-rose-600' :
                                      rule.severity === 'high' ? 'bg-orange-100 text-orange-600' :
                                      rule.severity === 'medium' ? 'bg-amber-100 text-amber-600' :
                                      'bg-blue-100 text-blue-600'
                                    }`}>
                                      {rule.severity === 'critical' ? '危急' :
                                       rule.severity === 'high' ? '高危' :
                                       rule.severity === 'medium' ? '中危' : '低危'}
                                    </span>
                                    <span className={`text-xs px-2 py-0.5 rounded ${
                                      rule.type === 'single' ? 'bg-blue-100 text-blue-600' :
                                      rule.type === 'correlation' ? 'bg-purple-100 text-purple-600' :
                                      'bg-orange-100 text-orange-600'
                                    }`}>
                                      {rule.type === 'single' ? '单事件' : rule.type === 'correlation' ? '关联' : '时序'}
                                    </span>
                                  </div>
                                  <p className="text-xs text-gray-500 mt-1">{rule.description}</p>
                                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                                    <span>数据源: {rule.dataSourceIds?.length || 0} 个</span>
                                    <span>命中: {rule.hitCount} 次</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                        <div>
                          <h4 className="font-medium text-gray-900 text-sm">分析流程说明</h4>
                          <p className="text-sm text-gray-600 mt-1">
                            1. 日志解析完成后，系统自动提取关键字段<br/>
                            2. 将解析结果与选中的检测规则进行匹配<br/>
                            3. 规则命中时立即生成安全事件并推送至事件工作台<br/>
                            4. 分析失败不影响日志的正常存储流程
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'filter' && (
                  <div className="space-y-6">
                    <div className="p-5 bg-gradient-to-r from-cyan-50 to-blue-50 rounded-2xl border border-cyan-200">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg">
                          <Filter className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-base font-semibold text-gray-900 mb-2">解析后过滤</h3>
                          <p className="text-sm text-gray-600">配置过滤规则，只保留符合条件的日志。不满足过滤条件的日志将被丢弃，不会进入存储和分析流程。</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-semibold text-gray-900">过滤规则</h4>
                        <button
                          onClick={() => {
                            setFormData(prev => ({
                              ...prev,
                              filterRules: [...(prev.filterRules || []), { field: '', operator: 'eq', value: '', logic: 'and' }]
                            }));
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 bg-cyan-600 text-white rounded-lg text-xs font-medium hover:bg-cyan-700 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />添加规则
                        </button>
                      </div>

                      {(formData.filterRules || []).length === 0 ? (
                        <div className="text-center py-8 bg-gray-50 rounded-xl border border-gray-200">
                          <Filter className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                          <p className="text-sm text-gray-500">暂无过滤规则</p>
                          <p className="text-xs text-gray-400 mt-1">所有解析后的日志都将被保留</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {(formData.filterRules || []).map((rule, index) => (
                            <motion.div
                              key={index}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="p-4 bg-white border border-gray-200 rounded-xl"
                            >
                              <div className="flex items-center gap-3">
                                {index > 0 && (
                                  <select
                                    value={rule.logic}
                                    onChange={e => {
                                      const newRules = [...(formData.filterRules || [])];
                                      newRules[index].logic = e.target.value as 'and' | 'or';
                                      setFormData(prev => ({ ...prev, filterRules: newRules }));
                                    }}
                                    className="px-2 py-1.5 bg-gray-100 border border-gray-200 rounded-lg text-xs font-medium"
                                  >
                                    <option value="and">且</option>
                                    <option value="or">或</option>
                                  </select>
                                )}
                                <div className="flex-1 grid grid-cols-3 gap-2">
                                  <input
                                    type="text"
                                    value={rule.field}
                                    onChange={e => {
                                      const newRules = [...(formData.filterRules || [])];
                                      newRules[index].field = e.target.value;
                                      setFormData(prev => ({ ...prev, filterRules: newRules }));
                                    }}
                                    placeholder="字段名"
                                    className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500"
                                  />
                                  <select
                                    value={rule.operator}
                                    onChange={e => {
                                      const newRules = [...(formData.filterRules || [])];
                                      newRules[index].operator = e.target.value as any;
                                      setFormData(prev => ({ ...prev, filterRules: newRules }));
                                    }}
                                    className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500"
                                  >
                                    <option value="eq">等于</option>
                                    <option value="ne">不等于</option>
                                    <option value="gt">大于</option>
                                    <option value="lt">小于</option>
                                    <option value="contains">包含</option>
                                    <option value="regex">正则匹配</option>
                                  </select>
                                  <input
                                    type="text"
                                    value={rule.value}
                                    onChange={e => {
                                      const newRules = [...(formData.filterRules || [])];
                                      newRules[index].value = e.target.value;
                                      setFormData(prev => ({ ...prev, filterRules: newRules }));
                                    }}
                                    placeholder="值"
                                    className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500"
                                  />
                                </div>
                                <button
                                  onClick={() => {
                                    const newRules = (formData.filterRules || []).filter((_, i) => i !== index);
                                    setFormData(prev => ({ ...prev, filterRules: newRules }));
                                  }}
                                  className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="p-4 bg-cyan-50 rounded-xl border border-cyan-200">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-cyan-600 mt-0.5" />
                        <div>
                          <h4 className="font-medium text-gray-900 text-sm">过滤规则说明</h4>
                          <p className="text-sm text-gray-600 mt-1">
                            • 支持多条件组合，使用"且"/"或"逻辑连接<br/>
                            • 正则匹配支持标准正则表达式语法<br/>
                            • 字段名支持嵌套路径，如 user.name、data.level<br/>
                            • 不满足过滤条件的日志将被丢弃，不会存储和分析
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'storage' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900 mb-4">存储目标</h3>
                      <div className="grid grid-cols-5 gap-3">
                        {storageTargets.map(target => (
                          <motion.button
                            key={target.id}
                            whileHover={{ scale: 1.02, y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setStorageConfig(prev => ({ ...prev, target: target.id }))}
                            className={`p-4 rounded-xl border-2 transition-all text-left relative overflow-hidden ${
                              storageConfig.target === target.id
                                ? 'border-indigo-500 bg-gradient-to-br from-indigo-50 to-blue-50 shadow-lg shadow-indigo-100'
                                : 'border-gray-200 hover:border-indigo-300 hover:shadow-md bg-white'
                            }`}
                          >
                            <div className={`w-10 h-10 rounded-lg ${target.color} flex items-center justify-center mb-3 shadow-md`}>
                              <target.icon className="w-5 h-5 text-white" />
                            </div>
                            <span className="font-medium text-gray-900 text-sm">{target.name}</span>
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{target.desc}</p>
                            {storageConfig.target === target.id && (
                              <div className="absolute top-2 right-2">
                                <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center">
                                  <Check className="w-3 h-3 text-white" />
                                </div>
                              </div>
                            )}
                          </motion.button>
                        ))}
                      </div>
                    </div>

                    {storageConfig.target && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6"
                      >
                        <div className="p-4 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl border border-indigo-200">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg ${storageTargets.find(t => t.id === storageConfig.target)?.color} flex items-center justify-center`}>
                              {storageTargets.find(t => t.id === storageConfig.target)?.icon && (
                                <span className="text-white text-sm">
                                  {React.createElement(storageTargets.find(t => t.id === storageConfig.target)!.icon, { className: 'w-4 h-4' })}
                                </span>
                              )}
                            </div>
                            <div>
                              <span className="font-medium text-gray-900">{storageTargets.find(t => t.id === storageConfig.target)?.name}</span>
                              <span className="text-sm text-gray-500 ml-2">特性:</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {storageTargets.find(t => t.id === storageConfig.target)?.features.map((feature, idx) => (
                                <span key={idx} className="px-2 py-0.5 text-xs bg-white text-indigo-600 rounded-lg border border-indigo-200">
                                  {feature}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-2xl p-6">
                          <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <Settings2 className="w-4 h-4 text-indigo-600" />
                            基础配置
                          </h4>
                          <div className="grid grid-cols-2 gap-4">
                            {storageTargetConfigs[storageConfig.target]?.fields.map((field: any) => (
                              <div key={field.key}>
                                <label className="block text-sm font-medium text-gray-700 mb-2">{field.label}</label>
                                {field.type === 'select' ? (
                                  <select
                                    value={storageConfig[storageConfig.target]?.[field.key] || ''}
                                    onChange={e => setStorageConfig(prev => ({
                                      ...prev,
                                      [storageConfig.target]: { ...prev[storageConfig.target], [field.key]: e.target.value }
                                    }))}
                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                  >
                                    {field.options?.map((opt: string) => (
                                      <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                  </select>
                                ) : field.type === 'checkbox' ? (
                                  <label className="flex items-center gap-2 cursor-pointer py-2">
                                    <input
                                      type="checkbox"
                                      checked={storageConfig[storageConfig.target]?.[field.key] || false}
                                      onChange={e => setStorageConfig(prev => ({
                                        ...prev,
                                        [storageConfig.target]: { ...prev[storageConfig.target], [field.key]: e.target.checked }
                                      }))}
                                      className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="text-sm text-gray-600">启用</span>
                                  </label>
                                ) : (
                                  <input
                                    type={field.type === 'number' ? 'number' : field.type === 'password' ? 'password' : 'text'}
                                    value={storageConfig[storageConfig.target]?.[field.key] || ''}
                                    onChange={e => setStorageConfig(prev => ({
                                      ...prev,
                                      [storageConfig.target]: { ...prev[storageConfig.target], [field.key]: e.target.value }
                                    }))}
                                    placeholder={field.placeholder}
                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-2xl p-6">
                          <button
                            onClick={() => setShowAdvancedStorage(!showAdvancedStorage)}
                            className="flex items-center justify-between w-full text-left"
                          >
                            <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                              <Zap className="w-4 h-4 text-amber-500" />
                              高级配置
                            </h4>
                            <motion.div
                              animate={{ rotate: showAdvancedStorage ? 180 : 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <ChevronRight className="w-5 h-5 text-gray-400 rotate-90" />
                            </motion.div>
                          </button>
                          <AnimatePresence>
                            {showAdvancedStorage && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="mt-4 pt-4 border-t border-gray-100"
                              >
                                <div className="grid grid-cols-2 gap-4">
                                  {storageTargetConfigs[storageConfig.target]?.advancedFields?.map((field: any) => (
                                    <div key={field.key}>
                                      <label className="block text-sm font-medium text-gray-700 mb-2">{field.label}</label>
                                      {field.type === 'select' ? (
                                        <select
                                          value={storageConfig[storageConfig.target]?.[field.key] || ''}
                                          onChange={e => setStorageConfig(prev => ({
                                            ...prev,
                                            [storageConfig.target]: { ...prev[storageConfig.target], [field.key]: e.target.value }
                                          }))}
                                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                        >
                                          {field.options?.map((opt: string) => (
                                            <option key={opt} value={opt}>{opt}</option>
                                          ))}
                                        </select>
                                      ) : field.type === 'checkbox' ? (
                                        <label className="flex items-center gap-2 cursor-pointer py-2">
                                          <input
                                            type="checkbox"
                                            checked={storageConfig[storageConfig.target]?.[field.key] || false}
                                            onChange={e => setStorageConfig(prev => ({
                                              ...prev,
                                              [storageConfig.target]: { ...prev[storageConfig.target], [field.key]: e.target.checked }
                                            }))}
                                            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                          />
                                          <span className="text-sm text-gray-600">启用</span>
                                        </label>
                                      ) : (
                                        <input
                                          type={field.type === 'number' ? 'number' : 'text'}
                                          value={storageConfig[storageConfig.target]?.[field.key] || ''}
                                          onChange={e => setStorageConfig(prev => ({
                                            ...prev,
                                            [storageConfig.target]: { ...prev[storageConfig.target], [field.key]: e.target.value }
                                          }))}
                                          placeholder={field.placeholder}
                                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                        />
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                            <div>
                              <h4 className="font-medium text-gray-900 text-sm">存储配置说明</h4>
                              <p className="text-sm text-gray-600 mt-1">
                                {storageConfig.target === 'timescaledb' && 'TimescaleDB 适合时序数据存储，支持自动分区和数据压缩，推荐用于需要复杂查询分析的场景。'}
                                {storageConfig.target === 'elasticsearch' && 'Elasticsearch 提供强大的全文检索能力，适合需要快速搜索和聚合分析的场景。'}
                                {storageConfig.target === 'kafka' && 'Kafka 作为消息队列，适合流式处理和实时消费场景，可对接多个下游系统。'}
                                {storageConfig.target === 's3' && 'S3 对象存储成本低、可靠性高，适合长期归档和备份场景。'}
                                {storageConfig.target === 'local' && '本地文件存储简单快速，无需网络依赖，适合开发和测试环境。'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}
              </div>

              <div className="sticky bottom-0 bg-white border-t border-gray-200 p-6 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">
                    步骤 {['basic', 'parse', 'analysis', 'filter', 'storage'].indexOf(activeTab) + 1} / 5
                  </span>
                  <div className="flex items-center gap-1">
                    {['basic', 'parse', 'analysis', 'filter', 'storage'].map((tab, idx) => (
                      <div
                        key={tab}
                        className={`w-2 h-2 rounded-full transition-colors ${
                          ['basic', 'parse', 'analysis', 'filter', 'storage'].indexOf(activeTab) >= idx
                            ? 'bg-indigo-500'
                            : 'bg-gray-300'
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="px-6 py-2 text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors"
                  >
                    取消
                  </button>
                  {activeTab !== 'storage' ? (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        const tabs = ['basic', 'parse', 'analysis', 'filter', 'storage'];
                        const currentIndex = tabs.indexOf(activeTab);
                        if (currentIndex < tabs.length - 1) {
                          setActiveTab(tabs[currentIndex + 1] as any);
                        }
                      }}
                      className="px-6 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-xl text-sm font-medium shadow-lg shadow-indigo-200 hover:shadow-xl transition-all flex items-center gap-2"
                    >
                      下一步<ChevronRight className="w-4 h-4" />
                    </motion.button>
                  ) : (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={editingPipeline ? handleEdit : handleAdd}
                      className="px-6 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-sm font-medium shadow-lg shadow-emerald-200 hover:shadow-xl transition-all flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />保存
                    </motion.button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showTemplateSelector && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowTemplateSelector(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-gray-200 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between z-10">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">选择格式模板</h2>
                  <p className="text-sm text-gray-500 mt-1">选择模板将自动配置解析规则</p>
                </div>
                <button onClick={() => setShowTemplateSelector(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6">
                {renderTemplateSelector()}
              </div>
            </motion.div>
          </motion.div>
        )}

        {showTestModal && selectedPipeline && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowTestModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-4xl shadow-2xl max-h-[90vh] overflow-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">测试解析与实时分析</h2>
                  <p className="text-sm text-gray-500 mt-1">测试 {selectedPipeline.name} 的解析效果并执行实时安全分析</p>
                </div>
                <button onClick={() => setShowTestModal(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-gray-700 flex items-center gap-2">
                      <Beaker className="w-4 h-4 text-indigo-600" /> 样本日志
                    </label>
                    <button
                      onClick={runTest}
                      disabled={!testLog.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Zap className="w-4 h-4" /> 解析并分析
                    </button>
                  </div>
                  <textarea
                    value={testLog}
                    onChange={e => setTestLog(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-emerald-400 h-32 font-mono text-sm resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder={`示例日志格式：
{"timestamp":"2026-05-03T10:30:00Z","event_type":"login","status":"failed","source_ip":"192.168.1.100","hostname":"web-server-01","user":"admin"}`}
                  />
                </div>

                {testResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <CheckCircle className="w-5 h-5 text-emerald-600" />
                      <span className="text-sm font-medium text-emerald-700">解析成功</span>
                      <span className="text-xs text-emerald-600 px-2 py-1 bg-emerald-100 rounded-lg font-medium">{testResult.format}</span>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-2xl p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-amber-500" />
                          <span className="font-semibold text-gray-900">识别字段</span>
                          <span className="text-sm text-gray-500">({detectedFields.length}个)</span>
                        </div>
                      </div>

                      <div className="space-y-2 max-h-48 overflow-auto">
                        {detectedFields.map((field, idx) => (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="p-3 rounded-xl border bg-gray-50 border-gray-200"
                          >
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-gray-900">{field.name}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${
                                field.type === 'datetime' ? 'bg-purple-100 text-purple-600' :
                                field.type === 'number' ? 'bg-blue-100 text-blue-600' :
                                field.type === 'boolean' ? 'bg-amber-100 text-amber-600' :
                                'bg-gray-100 text-gray-600'
                              }`}>{field.type}</span>
                            </div>
                            <div className="text-sm text-gray-600 font-mono mt-1 break-all">
                              {String(field.value).length > 100 ? String(field.value).substring(0, 100) + '...' : String(field.value)}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-2xl p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <Brain className="w-5 h-5 text-violet-500" />
                          <span className="font-semibold text-gray-900">实时安全分析</span>
                        </div>
                        {isAnalyzing && (
                          <span className="flex items-center gap-2 text-sm text-gray-500">
                            <RefreshCw className="w-4 h-4 animate-spin" /> 分析中...
                          </span>
                        )}
                      </div>

                      {!isAnalyzing && analysisResults.length > 0 ? (
                        <div className="space-y-3">
                          {analysisResults.map((result, idx) => (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className={`p-4 rounded-xl border ${
                                result.severity === 'critical' ? 'bg-rose-50 border-rose-200' :
                                result.severity === 'high' ? 'bg-orange-50 border-orange-200' :
                                'bg-amber-50 border-amber-200'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                  result.severity === 'critical' ? 'bg-rose-500' :
                                  result.severity === 'high' ? 'bg-orange-500' :
                                  'bg-amber-500'
                                }`}>
                                  <Siren className="w-5 h-5 text-white" />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-semibold text-gray-900">{result.rule.name}</span>
                                    <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                                      result.severity === 'critical' ? 'bg-rose-100 text-rose-600' :
                                      result.severity === 'high' ? 'bg-orange-100 text-orange-600' :
                                      'bg-amber-100 text-amber-600'
                                    }`}>
                                      {result.severity}
                                    </span>
                                  </div>
                                  <p className="text-sm text-gray-600">{result.rule.description}</p>
                                  {result.event && (
                                    <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200">
                                      <div className="flex items-center gap-2 mb-2">
                                        <ShieldAlert className="w-4 h-4 text-rose-500" />
                                        <span className="font-medium text-gray-900">生成的安全事件</span>
                                      </div>
                                      <div className="text-xs text-gray-500 space-y-1">
                                        <div>事件ID: <span className="font-mono text-gray-700">{result.event.id}</span></div>
                                        <div>标题: {result.event.title}</div>
                                        <div>置信度: {result.event.confidence}%</div>
                                        <div>受影响资产: {result.event.affectedAssets.join(', ')}</div>
                                        <div>源IP: {result.event.sourceIp}</div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      ) : !isAnalyzing && testResult ? (
                        <div className="text-center py-8 text-gray-400">
                          <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-50" />
                          <p>未检测到安全威胁</p>
                          <p className="text-sm mt-1">当前日志未命中任何检测规则</p>
                        </div>
                      ) : null}
                    </div>

                    {generatedEvents.length > 0 && (
                      <div className="bg-gradient-to-r from-rose-50 to-orange-50 border border-rose-200 rounded-2xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Target className="w-5 h-5 text-rose-500" />
                          <span className="font-semibold text-gray-900">已生成 {generatedEvents.length} 个安全事件</span>
                        </div>
                        <p className="text-sm text-gray-600">
                          这些事件已推送至事件工作台，可在"检测与分析" → "事件工作台"中查看详情
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
                <button onClick={() => setShowTestModal(false)} className="px-6 py-2 text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors">关闭</button>
                {testResult && (
                  <button
                    onClick={saveFieldMappings}
                    className="px-6 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-xl text-sm font-medium shadow-lg shadow-indigo-200 hover:shadow-xl transition-all flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />保存字段映射
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}

        {showDetailModal && selectedPipeline && (
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
              className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-auto shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-gray-900">{selectedPipeline.name}</h2>
                <button onClick={() => setShowDetailModal(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-4 bg-gray-50 rounded-xl">
                    <div className="text-gray-500 text-xs mb-1">解析器</div>
                    <div className="text-gray-900 font-semibold">{selectedPipeline.parser}</div>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-xl">
                    <div className="text-gray-500 text-xs mb-1">优先级</div>
                    <div className="text-gray-900 font-semibold">{selectedPipeline.priority}</div>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-xl">
                    <div className="text-gray-500 text-xs mb-1">状态</div>
                    <div className={selectedPipeline.isActive ? 'text-emerald-600 font-semibold' : 'text-gray-500'}>
                      {selectedPipeline.isActive ? '运行中' : '已暂停'}
                    </div>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-xl">
                    <div className="text-gray-500 text-xs mb-1">解析模式</div>
                    <div className="text-gray-900 font-semibold">{selectedPipeline.mode === 'multi' ? '智能多格式' : '单一格式'}</div>
                  </div>
                </div>

                {(selectedPipeline.logTypeName || selectedPipeline.storageTableName || selectedPipeline.formatTemplateName) && (
                  <div className="p-4 bg-gray-50 rounded-xl">
                    <div className="text-gray-500 text-xs mb-3">关联配置</div>
                    <div className="space-y-2">
                      {selectedPipeline.logTypeName && (
                        <div className="flex items-center gap-2 text-sm">
                          <Layers className="w-4 h-4 text-indigo-600" />
                          <span className="text-gray-600">日志类型:</span>
                          <span className="text-gray-900 font-medium">{selectedPipeline.logTypeName}</span>
                        </div>
                      )}
                      {selectedPipeline.storageTableName && (
                        <div className="flex items-center gap-2 text-sm">
                          <Database className="w-4 h-4 text-indigo-600" />
                          <span className="text-gray-600">存储表:</span>
                          <span className="text-gray-900 font-medium">{selectedPipeline.storageTableName}</span>
                        </div>
                      )}
                      {selectedPipeline.formatTemplateName && (
                        <div className="flex items-center gap-2 text-sm">
                          <FileJson className="w-4 h-4 text-indigo-600" />
                          <span className="text-gray-600">格式模板:</span>
                          <span className="text-gray-900 font-medium">{selectedPipeline.formatTemplateName}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {selectedPipeline.fieldMappings && selectedPipeline.fieldMappings.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 mb-3">字段映射</h3>
                    <div className="space-y-2">
                      {selectedPipeline.fieldMappings.map((fm, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl text-sm">
                          <span className="text-gray-600 font-mono">{fm.sourceField}</span>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-900 font-mono">{fm.targetField}</span>
                          <span className="px-2 py-0.5 text-xs bg-indigo-100 text-indigo-600 rounded-lg font-medium">{fm.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}

        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowDeleteConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-rose-600" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900">确认删除</h2>
              </div>
              <p className="text-gray-600 mb-6">确定要删除解析管道 <span className="font-semibold text-gray-900">{showDeleteConfirm.name}</span> 吗？</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowDeleteConfirm(null)} className="px-6 py-2 text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors">取消</button>
                <button onClick={handleDelete} className="px-6 py-2 bg-rose-600 text-white rounded-xl hover:bg-rose-700 text-sm font-medium transition-colors">确认删除</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}