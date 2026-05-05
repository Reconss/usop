// 安全告警与事件管理系统 - 完整类型定义

// ==================== 枚举定义 ====================

/** 严重程度 */
export type Severity = 'critical' | 'high' | 'medium' | 'low';

/** 告警/事件状态 */
export type AlertStatus = 'new' | 'investigating' | 'closed' | 'false_positive';

/** 数据源类型 */
export type DataSourceType = 'pull' | 'push';

/** 数据源协议 */
export type DataSourceProtocol = 'kafka' | 'syslog' | 's3' | 'webhook' | 'http' | 'file' | 'database';

/** 数据源状态 */
export type DataSourceStatus = 'connected' | 'disconnected' | 'error' | 'syncing' | 'paused';

/** 解析格式 */
export type ParserFormat = 'json' | 'xml' | 'csv' | 'keyvalue' | 'syslog' | 'cef' | 'grok' | 'regex';

/** 规则类型 */
export type RuleType = 'single' | 'correlation' | 'sequence';

/** 剧本状态 */
export type PlaybookStatus = 'draft' | 'published' | 'archived' | 'enabled' | 'disabled';

/** 事件动作类型 */
export type EventActionType = 
  | 'created'           // 创建事件
  | 'status_changed'    // 状态变更
  | 'severity_changed' // 严重度变更
  | 'assigned'          // 分配处理人
  | 'comment'           // 添加评论
  | 'attachment'        // 添加附件
  | 'playbook_triggered' // 剧本触发
  | 'enriched'          // 事件丰富
  | 'merged'            // 合并事件
  | 'escalated'         // 升级处理
  | 'closed';           // 关闭事件

/** 过滤操作符 */
export type FilterOperator = 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'startsWith' | 'endsWith' | 'regex';

// ==================== 数据源相关 ====================

/** 数据源配置 */
export interface DataSourceConfig {
  // Kafka配置
  brokers?: string[];
  topic?: string;
  groupId?: string;
  securityProtocol?: string;
  
  // Syslog配置
  host?: string;
  port?: number;
  protocol?: 'tcp' | 'udp';
  
  // S3配置
  bucket?: string;
  prefix?: string;
  region?: string;
  accessKey?: string;
  secretKey?: string;
  
  // Webhook配置
  endpoint?: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  
  // 通用配置
  encoding?: string;
  batchSize?: number;
  interval?: number;
}

/** 数据源 */
export interface DataSource {
  id: number;
  name: string;
  sourceType: DataSourceType;
  protocol: DataSourceProtocol;
  status: DataSourceStatus;
  health: number;
  config: DataSourceConfig;
  parsePipelines: number[];
  storageConfig?: StorageConfig;
  totalEvents: number;
  eventsPerSecond?: number;
  lastSync?: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== 解析管道相关 ====================

/** 字段映射 */
export interface FieldMapping {
  sourceField: string;
  targetField: string;
  type?: 'string' | 'number' | 'date' | 'ip' | 'json';
  transform?: string;
}

/** 过滤规则 */
export interface FilterRule {
  field: string;
  operator: FilterOperator;
  value: string | number;
  logic?: 'and' | 'or';
}

/** 转换规则 */
export interface TransformRule {
  field: string;
  type: 'rename' | 'remove' | 'extract' | 'replace' | 'convert';
  config: Record<string, any>;
}

/** 解析管道 */
export interface Pipeline {
  id: number;
  name: string;
  description?: string;
  productId?: number;
  formatId?: string;
  inputFormat: ParserFormat;
  inputConfig: Record<string, any>;
  fieldMapping: FieldMapping[];
  filterRules: FilterRule[];
  transformRules: TransformRule[];
  outputTarget: 'alerts' | 'events' | 'logs';
  outputConfig: Record<string, any>;
  batchSize: number;
  parallelWorkers: number;
  status: 'active' | 'inactive';
  priority: number;
  matchConditions: any[];
  ruleType: 'exclusive' | 'inclusive';
  nextPipelineId?: number;
  createdAt: string;
  updatedAt: string;
}

// ==================== 告警相关 ====================

/** 告警 */
export interface Alert {
  id: number;
  alertCode: string;
  title: string;
  description: string;
  severity: Severity;
  confidence: number;
  status: AlertStatus;
  source: string;
  sourceIp?: string;
  destIp?: string;
  category: string;
  rawLog?: string;
  parsedData?: Record<string, any>;
  eventId?: number;
  eventCode?: string;
  aggregated: boolean;
  aggregatedIds: number[];
  affectedAssets: string[];
  firstSeen: string;
  lastSeen: string;
  hitCount: number;
  extraData?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

/** 告警统计 */
export interface AlertStats {
  total: number;
  todayNew: number;
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  byStatus: {
    new: number;
    investigating: number;
    closed: number;
    falsePositive: number;
  };
}

/** 告警查询参数 */
export interface AlertQueryParams {
  page?: number;
  pageSize?: number;
  severity?: Severity;
  status?: AlertStatus;
  search?: string;
  startDate?: string;
  endDate?: string;
  eventId?: number;
}

// ==================== 事件相关 ====================

/** 附件 */
export interface Attachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  uploadedAt: string;
  uploadedBy?: string;
}

/** 事件 */
export interface Event {
  id: number;
  eventCode: string;
  title: string;
  description: string;
  severity: Severity;
  status: AlertStatus;
  category: string;
  source: 'manual' | 'rule' | 'aggregation';
  assigneeId?: number;
  assigneeName?: string;
  rawLog?: string;
  affectedAssets: string[];
  relatedAlerts?: RelatedAlert[];
  extraData?: Record<string, any>;
  timestamp: string;
  createdAt: string;
  updatedAt: string;
}

/** 关联的告警信息 */
export interface RelatedAlert {
  id: number;
  alertCode: string;
  title: string;
  severity: Severity;
}

/** 事件统计 */
export interface EventStats {
  total: number;
  todayNew: number;
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  byStatus: {
    new: number;
    investigating: number;
    closed: number;
    falsePositive: number;
  };
}

/** 事件查询参数 */
export interface EventQueryParams {
  page?: number;
  pageSize?: number;
  severity?: Severity;
  status?: AlertStatus;
  search?: string;
  startDate?: string;
  endDate?: string;
  assigneeId?: number;
}

// ==================== 处置记录相关 ====================

/** 事件处置记录 */
export interface EventAction {
  id: number;
  eventId: number;
  eventCode: string;
  action: EventActionType;
  content?: string;
  userId: number;
  userName: string;
  previousStatus?: AlertStatus;
  newStatus?: AlertStatus;
  previousSeverity?: Severity;
  newSeverity?: Severity;
  assignee?: string;
  attachments: Attachment[];
  playbookId?: number;
  playbookName?: string;
  playbookExecutionId?: string;
  playbookResult?: Record<string, any>;
  extraData?: Record<string, any>;
  createdAt: string;
}

/** 剧本执行结果 */
export interface PlaybookExecutionResult {
  executionId: string;
  playbookId: number;
  playbookName: string;
  eventId: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  stepsCompleted: number;
  totalSteps: number;
  result?: Record<string, any>;
}

// ==================== 存储相关 ====================

/** 存储配置 */
export interface StorageConfig {
  hypertable: string;
  retentionDays: number;
  partitionInterval: string;
  indexes: string[];
  compression: boolean;
}

// ==================== API 请求/响应类型 ====================

/** 分页响应 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

/** 通用API响应 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/** 创建事件请求 */
export interface CreateEventRequest {
  title: string;
  description?: string;
  severity?: Severity;
  category?: string;
  alertIds?: number[];
  sourceIp?: string;
}

/** 更新事件状态请求 */
export interface UpdateEventStatusRequest {
  status: AlertStatus;
  reason?: string;
}

/** 聚合告警生成事件请求 */
export interface AggregateAlertsRequest {
  alertIds: number[];
  title?: string;
  severity?: Severity;
}

/** 分配处理人请求 */
export interface AssignEventRequest {
  assigneeId: number;
  assigneeName: string;
}

/** 创建告警请求 */
export interface CreateAlertRequest {
  title: string;
  description?: string;
  severity?: Severity;
  source?: string;
  sourceIp?: string;
  category?: string;
  rawLog?: string;
  extraData?: Record<string, any>;
}

// ==================== 动作类型映射 ====================

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

export const EventActionColors: Record<EventActionType, { text: string; bg: string }> = {
  created: { text: 'text-blue-400', bg: 'bg-blue-400/10' },
  status_changed: { text: 'text-amber-400', bg: 'bg-amber-400/10' },
  severity_changed: { text: 'text-rose-400', bg: 'bg-rose-400/10' },
  assigned: { text: 'text-purple-400', bg: 'bg-purple-400/10' },
  comment: { text: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  attachment: { text: 'text-cyan-400', bg: 'bg-cyan-400/10' },
  playbook_triggered: { text: 'text-orange-400', bg: 'bg-orange-400/10' },
  enriched: { text: 'text-indigo-400', bg: 'bg-indigo-400/10' },
  merged: { text: 'text-teal-400', bg: 'bg-teal-400/10' },
  escalated: { text: 'text-red-400', bg: 'bg-red-400/10' },
  closed: { text: 'text-gray-400', bg: 'bg-gray-400/10' }
};

export const SeverityLabels: Record<Severity, string> = {
  critical: '危急',
  high: '高危',
  medium: '中危',
  low: '低危'
};

export const SeverityConfig: Record<Severity, { color: string; text: string; bg: string; border: string }> = {
  critical: { color: 'bg-rose-500', text: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
  high: { color: 'bg-orange-500', text: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  medium: { color: 'bg-amber-500', text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  low: { color: 'bg-blue-500', text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' }
};

export const StatusLabels: Record<AlertStatus, string> = {
  new: '新建',
  investigating: '调查中',
  closed: '已关闭',
  false_positive: '误报'
};

export const StatusConfig: Record<AlertStatus, { color: string; text: string; bg: string; border: string }> = {
  new: { color: 'bg-blue-500', text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  investigating: { color: 'bg-orange-500', text: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  closed: { color: 'bg-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  false_positive: { color: 'bg-gray-500', text: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/20' }
};
