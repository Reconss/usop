export interface DashboardMetrics {
  todayAlerts: number;
  pendingEvents: number;
  highRiskAssets: number;
  agentHealthRate: number;
  alertsTrend: number;
  pendingTrend: number;
  assetsTrend: number;
  healthTrend: number;
}

export interface EventTrendData {
  timestamps: string[];
  critical: number[];
  high: number[];
  medium: number[];
  low: number[];
}

export interface EventTypeDistribution {
  name: string;
  value: number;
  color: string;
}

export interface AttackSource {
  ip: string;
  country: string;
  count: number;
}

export interface RiskAsset {
  id: string;
  name: string;
  type: string;
  riskScore: number;
  lastSeen: string;
}

export interface Attachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  uploadedAt: string;
  uploadedBy?: string;
}

export interface SecurityEvent {
  id: string;
  eventCode?: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
  affectedAssets: string[];
  sourceIp: string;
  timestamp: string;
  status: 'new' | 'investigating' | 'closed' | 'false_positive';
  eventType: string;
  description?: string;
  attachments?: Attachment[];
}

export interface AssetVulnInfo {
  vulnId: string;
  name: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  cvssScore: number;
  assessedScore?: number;
  status: 'open' | 'fixed' | 'ignored' | 'in_progress';
  discoveredAt: string;
}

export interface Asset {
  id: string;
  name: string;
  type: 'ip' | 'domain' | 'service';
  status: 'verified' | 'pending';
  riskScore: number;
  assessedRiskScore?: number;
  ports: { port: number; service: string; version?: string }[];
  owner: string;
  lastScan: string;
  tags: string[];
  vulnerabilities?: AssetVulnInfo[];
  vulnStats?: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };
}

export interface ScanTask {
  id: string;
  target: string;
  type: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  agent: string;
  createdAt: string;
  completedAt?: string;
  progress?: number;
}

export interface DetectionRule {
  id: string;
  name: string;
  type: 'single' | 'correlation' | 'sequence';
  status: 'enabled' | 'disabled';
  hitCount: number;
  lastHitTime?: string;
  description?: string;
  dataSourceIds?: string[];
}

export interface Playbook {
  id: string | number;
  name: string;
  description?: string;
  nodes?: any[];
  edges?: any[];
  status: 'draft' | 'published' | 'archived' | 'enabled' | 'disabled';
  version?: string;
  created_at?: string;
  updated_at?: string;
  triggerType?: string;
  lastModified?: string;
  nodeCount?: number;
}

export interface User {
  id: string;
  username: string;
  role: string;
  email: string;
  lastLogin: string;
  status: 'active' | 'inactive';
}

export interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  details: Record<string, unknown>;
  ip: string;
}

export interface MenuItem {
  id: string;
  label: string;
  icon: string;
  path: string;
  children?: MenuItem[];
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  timestamp: string;
  read: boolean;
}

// ==================== 漏洞管理模块类型 ====================

export interface AffectedAsset {
  id: string;
  name: string;
  type: string;
  ip?: string;
  owner: string;
  riskScore: number;
  tags: string[];
}

export interface Reassessment {
  assetImportance: 'critical' | 'high' | 'medium' | 'low';
  exploitability: 'easy' | 'moderate' | 'difficult';
  remediationDifficulty: 'easy' | 'moderate' | 'difficult';
  finalSeverity: 'critical' | 'high' | 'medium' | 'low';
  needsFix: boolean;
  reason: string;
  assessedAt: string;
}

export interface Vulnerability {
  id: string;
  cveId?: string;
  name: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  cvssScore: number;
  affectedAssets: AffectedAsset[];
  vulnType: 'host' | 'application';
  source: string;
  status: 'open' | 'fixed' | 'ignored' | 'in_progress';
  discoveredAt: string;
  fixedAt?: string;
  port?: number;
  service?: string;
  solution?: string;
  references?: string[];
  reassessment?: Reassessment;
}

// ==================== 数据接入模块类型 ====================

export interface FieldMapping {
  sourceField: string;
  targetField: string;
  type: string;
}

export interface TransformRule {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
}

export type ParserType = 'json' | 'xml' | 'csv' | 'logfmt' | 'regex' | 'auto' | 'syslog' | 'cef' | 'grok';

export type FilterOperator = 'eq' | 'ne' | 'gt' | 'lt' | 'contains' | 'regex';

export interface FilterRule {
  field: string;
  operator: FilterOperator;
  value: string;
  logic: 'and' | 'or';
}

export interface ParsePipeline {
  id: string;
  name: string;
  priority: number;
  condition?: string;
  parser: ParserType;
  customRule?: string;
  isActive: boolean;
  description?: string;
  fieldMappings?: FieldMapping[];
  transformRules?: TransformRule[];
  logTypeId?: string;
  logTypeName?: string;
  storageTableId?: string;
  storageTableName?: string;
  formatTemplateId?: string;
  formatTemplateName?: string;
  mode?: 'single' | 'multi';
  smartDetect?: boolean;
  parserConfig?: Record<string, any>;
  sample?: string;
  selectedRules?: string[];
  linkedPipelines?: string[];
  linkedTemplates?: string[];
  templateStorageMap?: Record<string, { tableId: string; tableName: string }>;
  filterRules?: FilterRule[];
}

export interface StorageConfigType {
  tableName: string;
  retentionDays: number;
  partitionInterval: string;
  indexes: string[];
  compression: boolean;
}

export interface ProductMapping {
  id: string;
  productName: string;
  vendor: string;
  logType: string;
  parsePipelineId: string;
  enabled: boolean;
}

export interface ParseStats {
  parsedSuccess: number;
  parsedFailed: number;
  lastError?: string;
  lastErrorTime?: string;
}

export interface DataSource {
  id: string;
  name: string;
  type: 'pull' | 'push';
  protocol: string;
  status: 'connected' | 'disconnected' | 'error' | 'syncing' | 'paused';
  lastSync?: string;
  eventsPerSecond?: number;
  totalEvents?: number;
  health?: number;
  config: Record<string, any>;
  parsePipelines?: ParsePipeline[];
  storageConfig?: StorageConfigType;
  productMappings?: ProductMapping[];
  stats?: ParseStats;
}

// ==================== 格式模板类型 ====================

export interface TemplateField {
  name: string;
  type: string;
  sample?: string;
  description?: string;
}

export interface ParserConfig {
  jsonPath?: string;
  kvDelimiter?: string;
  pairDelimiter?: string;
  grokPattern?: string;
  regexPattern?: string;
  regexFlags?: string;
  csvDelimiter?: string;
  csvHeader?: boolean;
  syslogVariant?: 'rfc3164' | 'rfc5424';
  cefVersion?: string;
}

export interface FormatTemplate {
  id: string;
  name: string;
  description: string;
  format: string;
  category: string;
  parserType: string;
  parserConfig?: ParserConfig;
  fields: TemplateField[];
  sample: string;
  usageCount: number;
  isPreset: boolean;
}

// ==================== 日志类型 ====================

export interface LogTypeField {
  name: string;
  type: string;
  required: boolean;
}

export interface LogType {
  id: string;
  name: string;
  description: string;
  fields: LogTypeField[];
}

// ==================== 存储表类型 ====================

export interface StorageTable {
  id: string;
  name: string;
  displayName: string;
  dataSource: string;
  logType?: string;
  retentionDays: number;
  partitionInterval: string;
  indexes: string[];
  rowCount: number;
  size: string;
  compression: boolean;
  autoCreated: boolean;
  lastOptimized: string;
  createdByPipeline?: string;
}

// ==================== 告警日志类型 ====================

export interface AlertLog {
  id: string;
  timestamp: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  source: string;
  sourceIp: string;
  destIp?: string;
  eventType: string;
  message: string;
  rawLog?: string;
  status: 'new' | 'acknowledged' | 'resolved' | 'false_positive';
  assignee?: string;
  resolvedAt?: string;
  duration?: number;
}

// ==================== 事件处置记录类型 ====================

export interface EventActionRecord {
  id: string;
  eventId: string;
  timestamp: string;
  user: string;
  userId?: string;
  action: EventActionType;
  content?: string;
  attachments?: Attachment[];
  previousStatus?: SecurityEvent['status'];
  newStatus?: SecurityEvent['status'];
  previousSeverity?: SecurityEvent['severity'];
  newSeverity?: SecurityEvent['severity'];
  assignee?: string;
  metadata?: Record<string, any>;
}

export type EventActionType = 
  | 'created'           // 事件创建
  | 'status_changed'    // 状态变更
  | 'severity_changed' // 严重度变更
  | 'assigned'          // 分配处理人
  | 'comment'           // 添加评论
  | 'attachment'        // 添加附件
  | 'playbook_triggered' // 剧本触发
  | 'enriched'          // 事件 enrichment
  | 'merged'            // 合并事件
  | 'escalated'         // 升级处理
  | 'closed';           // 关闭事件

export const EventActionLabels: Record<EventActionType, string> = {
  created: '创建事件',
  status_changed: '状态变更',
  severity_changed: '严重度变更',
  assigned: '分配处理人',
  comment: '添加评论',
  attachment: '添加附件',
  playbook_triggered: '触发剧本',
  enriched: '事件丰富',
  merged: '合并事件',
  escalated: '升级处理',
  closed: '关闭事件'
};

export const EventActionColors: Record<EventActionType, string> = {
  created: 'text-blue-400 bg-blue-400/10',
  status_changed: 'text-amber-400 bg-amber-400/10',
  severity_changed: 'text-rose-400 bg-rose-400/10',
  assigned: 'text-purple-400 bg-purple-400/10',
  comment: 'text-emerald-400 bg-emerald-400/10',
  attachment: 'text-cyan-400 bg-cyan-400/10',
  playbook_triggered: 'text-orange-400 bg-orange-400/10',
  enriched: 'text-indigo-400 bg-indigo-400/10',
  merged: 'text-teal-400 bg-teal-400/10',
  escalated: 'text-red-400 bg-red-400/10',
  closed: 'text-gray-400 bg-gray-400/10'
};
