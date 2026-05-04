import type {
  DashboardMetrics,
  EventTrendData,
  EventTypeDistribution,
  AttackSource,
  RiskAsset,
  SecurityEvent,
  Asset,
  ScanTask,
  DetectionRule,
  Playbook,
  User,
  AuditLog,
  MenuItem,
  Notification
} from '../types';

export const dashboardMetrics: DashboardMetrics = {
  todayAlerts: 1234,
  pendingEvents: 23,
  highRiskAssets: 5,
  agentHealthRate: 98,
  alertsTrend: 12,
  pendingTrend: -5,
  assetsTrend: 0,
  healthTrend: -2
};

export const eventTrendData: EventTrendData = {
  timestamps: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '23:59'],
  critical: [2, 1, 3, 5, 2, 4, 3],
  high: [5, 3, 8, 12, 7, 9, 6],
  medium: [12, 8, 15, 20, 14, 18, 11],
  low: [20, 15, 25, 30, 22, 28, 18]
};

export const eventTypeDistribution: EventTypeDistribution[] = [
  { name: '恶意软件', value: 35, color: '#ef4444' },
  { name: '网络入侵', value: 28, color: '#f97316' },
  { name: '数据泄露', value: 18, color: '#eab308' },
  { name: '权限异常', value: 12, color: '#6366f1' },
  { name: '其他', value: 7, color: '#10b981' }
];

export const attackSources: AttackSource[] = [
  { ip: '192.168.1.100', country: 'CN', count: 156 },
  { ip: '10.0.0.50', country: 'US', count: 128 },
  { ip: '172.16.0.25', country: 'RU', count: 98 },
  { ip: '192.168.2.75', country: 'BR', count: 76 },
  { ip: '10.1.1.200', country: 'IN', count: 65 }
];

export const riskAssets: RiskAsset[] = [
  { id: '1', name: 'web-server-01', type: 'server', riskScore: 85, lastSeen: '2026-04-27T10:30:00Z' },
  { id: '2', name: 'db-server-prod', type: 'database', riskScore: 78, lastSeen: '2026-04-27T09:15:00Z' },
  { id: '3', name: 'api-gateway', type: 'service', riskScore: 72, lastSeen: '2026-04-27T11:00:00Z' },
  { id: '4', name: 'mail-server', type: 'server', riskScore: 65, lastSeen: '2026-04-27T08:45:00Z' },
  { id: '5', name: 'vpn-gateway', type: 'network', riskScore: 58, lastSeen: '2026-04-27T07:30:00Z' }
];

export const securityEvents: SecurityEvent[] = [
  {
    id: 'EVT-2026-001',
    title: '检测到可疑登录行为',
    severity: 'critical',
    confidence: 95,
    affectedAssets: ['web-server-01', 'api-gateway'],
    sourceIp: '192.168.1.100',
    timestamp: '2026-04-27T10:30:00Z',
    status: 'new',
    eventType: '权限异常',
    description: '检测到来自异常地理位置的多次登录尝试'
  },
  {
    id: 'EVT-2026-002',
    title: '恶意软件传播告警',
    severity: 'high',
    confidence: 88,
    affectedAssets: ['workstation-05'],
    sourceIp: '10.0.0.50',
    timestamp: '2026-04-27T09:15:00Z',
    status: 'investigating',
    eventType: '恶意软件',
    description: '终端检测到可疑文件执行行为'
  },
  {
    id: 'EVT-2026-003',
    title: '数据库异常访问',
    severity: 'high',
    confidence: 82,
    affectedAssets: ['db-server-prod'],
    sourceIp: '172.16.0.25',
    timestamp: '2026-04-27T08:45:00Z',
    status: 'new',
    eventType: '数据泄露',
    description: '检测到非工作时间的大量数据查询'
  },
  {
    id: 'EVT-2026-004',
    title: '端口扫描检测',
    severity: 'medium',
    confidence: 75,
    affectedAssets: ['firewall-01'],
    sourceIp: '192.168.2.75',
    timestamp: '2026-04-27T07:30:00Z',
    status: 'closed',
    eventType: '网络入侵',
    description: '外部IP对内部网络进行端口扫描'
  },
  {
    id: 'EVT-2026-005',
    title: '异常流量告警',
    severity: 'low',
    confidence: 65,
    affectedAssets: ['load-balancer-01'],
    sourceIp: '10.1.1.200',
    timestamp: '2026-04-27T06:00:00Z',
    status: 'false_positive',
    eventType: '网络入侵',
    description: '流量模式异常，经确认为正常业务高峰'
  }
];

export const assets: Asset[] = [
  {
    id: '1',
    name: 'web-server-01.company.com',
    type: 'domain',
    status: 'verified',
    riskScore: 85,
    ports: [
      { port: 80, service: 'HTTP', version: 'nginx/1.20' },
      { port: 443, service: 'HTTPS', version: 'nginx/1.20' },
      { port: 22, service: 'SSH', version: 'OpenSSH 8.2' }
    ],
    owner: '张运维',
    lastScan: '2026-04-27T10:00:00Z',
    tags: ['production', 'web', 'critical']
  },
  {
    id: '2',
    name: '192.168.1.50',
    type: 'ip',
    status: 'verified',
    riskScore: 45,
    ports: [
      { port: 3306, service: 'MySQL', version: '8.0.32' },
      { port: 22, service: 'SSH', version: 'OpenSSH 8.2' }
    ],
    owner: '李数据库',
    lastScan: '2026-04-27T09:30:00Z',
    tags: ['production', 'database']
  },
  {
    id: '3',
    name: 'api-gateway.company.com',
    type: 'service',
    status: 'verified',
    riskScore: 72,
    ports: [
      { port: 8080, service: 'API Gateway', version: 'Kong 3.0' },
      { port: 8443, service: 'API Gateway SSL', version: 'Kong 3.0' }
    ],
    owner: '王架构',
    lastScan: '2026-04-27T08:00:00Z',
    tags: ['production', 'api', 'critical']
  }
];

export const scanTasks: ScanTask[] = [
  {
    id: 'SCAN-001',
    target: '192.168.1.0/24',
    type: '端口扫描',
    status: 'running',
    agent: 'agent-beijing-01',
    createdAt: '2026-04-27T10:00:00Z',
    progress: 65
  },
  {
    id: 'SCAN-002',
    target: 'web-server-01.company.com',
    type: 'Web指纹',
    status: 'completed',
    agent: 'agent-shanghai-01',
    createdAt: '2026-04-27T09:00:00Z',
    completedAt: '2026-04-27T09:15:00Z'
  },
  {
    id: 'SCAN-003',
    target: '10.0.0.0/16',
    type: '服务识别',
    status: 'queued',
    agent: 'agent-beijing-02',
    createdAt: '2026-04-27T11:00:00Z'
  }
];

export const detectionRules: DetectionRule[] = [
  {
    id: 'RULE-001',
    name: '暴力破解检测',
    type: 'single',
    status: 'enabled',
    hitCount: 156,
    lastHitTime: '2026-04-27T10:30:00Z',
    description: '检测短时间内多次登录失败'
  },
  {
    id: 'RULE-002',
    name: '横向移动检测',
    type: 'correlation',
    status: 'enabled',
    hitCount: 23,
    lastHitTime: '2026-04-27T09:15:00Z',
    description: '关联分析多台主机间的异常访问'
  },
  {
    id: 'RULE-003',
    name: '数据外泄检测',
    type: 'sequence',
    status: 'enabled',
    hitCount: 8,
    lastHitTime: '2026-04-26T18:00:00Z',
    description: '检测敏感数据的异常传输行为'
  }
];

export const playbooks: Playbook[] = [
  {
    id: 'PB-001',
    name: '自动封堵恶意IP',
    triggerType: '事件触发',
    status: 'enabled',
    lastModified: '2026-04-26T15:00:00Z',
    nodeCount: 5
  },
  {
    id: 'PB-002',
    name: '高危事件工单创建',
    triggerType: '事件触发',
    status: 'enabled',
    lastModified: '2026-04-25T10:00:00Z',
    nodeCount: 3
  },
  {
    id: 'PB-003',
    name: '每日安全报告',
    triggerType: '定时触发',
    status: 'disabled',
    lastModified: '2026-04-24T09:00:00Z',
    nodeCount: 4
  }
];

export const users: User[] = [
  {
    id: '1',
    username: 'admin',
    role: '超级管理员',
    email: 'admin@company.com',
    lastLogin: '2026-04-27T10:00:00Z',
    status: 'active'
  },
  {
    id: '2',
    username: 'analyst01',
    role: '安全分析师',
    email: 'analyst01@company.com',
    lastLogin: '2026-04-27T09:30:00Z',
    status: 'active'
  },
  {
    id: '3',
    username: 'operator01',
    role: '运营人员',
    email: 'operator01@company.com',
    lastLogin: '2026-04-26T18:00:00Z',
    status: 'active'
  }
];

export const auditLogs: AuditLog[] = [
  {
    id: '1',
    timestamp: '2026-04-27T10:30:00Z',
    user: 'admin',
    action: '用户登录',
    details: { ip: '192.168.1.10' },
    ip: '192.168.1.10'
  },
  {
    id: '2',
    timestamp: '2026-04-27T10:25:00Z',
    user: 'analyst01',
    action: '事件确认',
    details: { eventId: 'EVT-2026-001' },
    ip: '192.168.1.20'
  },
  {
    id: '3',
    timestamp: '2026-04-27T10:20:00Z',
    user: 'admin',
    action: '规则更新',
    details: { ruleId: 'RULE-001', action: '启用' },
    ip: '192.168.1.10'
  }
];

export const menuItems: MenuItem[] = [
  {
    id: 'dashboard',
    label: '仪表盘',
    icon: 'LayoutDashboard',
    path: '/'
  },
  {
    id: 'detection',
    label: '检测与分析',
    icon: 'Shield',
    path: '/detection',
    children: [
      { id: 'events', label: '事件工作台', icon: 'AlertTriangle', path: '/detection/events' },
      { id: 'investigation', label: '调查记录', icon: 'FileSearch', path: '/detection/investigation' },
      { id: 'hunting', label: '威胁狩猎', icon: 'Target', path: '/detection/hunting' },
      { id: 'ai', label: 'AI中心', icon: 'Brain', path: '/detection/ai' }
    ]
  },
  {
    id: 'response',
    label: '响应与自动化',
    icon: 'Zap',
    path: '/response',
    children: [
      { id: 'playbooks', label: '剧本编排', icon: 'Workflow', path: '/response/playbooks' },
      { id: 'rules', label: '规则管理', icon: 'Rule', path: '/response/rules' }
    ]
  },
  {
    id: 'assets',
    label: '资产与攻击面',
    icon: 'Server',
    path: '/assets',
    children: [
      { id: 'inventory', label: '资产清单', icon: 'List', path: '/assets/inventory' },
      { id: 'scans', label: '扫描任务', icon: 'Scan', path: '/assets/scans' },
      { id: 'agents', label: '扫描代理', icon: 'Cpu', path: '/assets/agents' }
    ]
  },
  {
    id: 'system',
    label: '系统管理',
    icon: 'Settings',
    path: '/system',
    children: [
      { id: 'users', label: '用户管理', icon: 'Users', path: '/system/users' },
      { id: 'roles', label: '角色权限', icon: 'UserCog', path: '/system/roles' },
      { id: 'audit', label: '审计日志', icon: 'ClipboardList', path: '/system/audit' },
      { id: 'config', label: '全局配置', icon: 'Sliders', path: '/system/config' }
    ]
  }
];

export const notifications: Notification[] = [
  {
    id: '1',
    title: '高危事件告警',
    message: '检测到新的高危安全事件 EVT-2026-001',
    type: 'error',
    timestamp: '2026-04-27T10:30:00Z',
    read: false
  },
  {
    id: '2',
    title: '扫描任务完成',
    message: '资产扫描任务 SCAN-002 已完成',
    type: 'success',
    timestamp: '2026-04-27T09:15:00Z',
    read: false
  },
  {
    id: '3',
    title: 'Agent离线',
    message: '扫描代理 agent-shanghai-02 已离线',
    type: 'warning',
    timestamp: '2026-04-27T08:00:00Z',
    read: true
  }
];

// ==================== 日志配置模块数据 ====================

export interface DataSource {
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

export interface ParsePipeline {
  id: string;
  name: string;
  priority: number;
  condition?: string;
  parser: 'json' | 'xml' | 'csv' | 'logfmt' | 'regex' | 'auto' | 'syslog' | 'cef' | 'grok';
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
  parserConfig?: any;
  sample?: string;
  selectedRules?: string[];
  linkedPipelines?: string[];
  linkedTemplates?: string[];
  templateStorageMap?: Record<string, { tableId: string; tableName: string }>;
  filterRules?: Array<{ field: string; operator: 'eq' | 'ne' | 'gt' | 'lt' | 'contains' | 'regex'; value: string; logic: 'and' | 'or' }>;
}

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

export interface AffectedAsset {
  id: string;
  name: string;
  type: string;
  ip?: string;
  owner: string;
  riskScore: number;
  tags: string[];
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
  reassessment?: {
    assetImportance: 'critical' | 'high' | 'medium' | 'low';
    exploitability: 'easy' | 'moderate' | 'difficult';
    remediationDifficulty: 'easy' | 'moderate' | 'difficult';
    finalSeverity: 'critical' | 'high' | 'medium' | 'low';
    needsFix: boolean;
    reason: string;
    assessedAt: string;
  };
}

export const vulnerabilities: Vulnerability[] = [
  {
    id: 'VULN-001',
    cveId: 'CVE-2024-1234',
    name: 'OpenSSL 缓冲区溢出',
    description: 'OpenSSL 库存在缓冲区溢出漏洞，可能导致远程代码执行',
    severity: 'critical',
    cvssScore: 9.8,
    affectedAssets: [
      { id: '1', name: 'web-server-01.company.com', type: 'domain', ip: '192.168.1.10', owner: '张运维', riskScore: 85, tags: ['production', 'web', 'critical'] },
      { id: '3', name: 'api-gateway.company.com', type: 'service', ip: '192.168.1.30', owner: '王架构', riskScore: 72, tags: ['production', 'api', 'critical'] }
    ],
    vulnType: 'host',
    source: 'Nessus',
    status: 'open',
    discoveredAt: '2026-05-01T10:00:00Z',
    port: 443,
    service: 'https',
    solution: '升级 OpenSSL 到 3.0.12 或更高版本',
    references: ['https://nvd.nist.gov/vuln/detail/CVE-2024-1234']
  },
  {
    id: 'VULN-002',
    cveId: 'CVE-2024-5678',
    name: 'Apache Struts RCE',
    description: 'Apache Struts 框架存在远程代码执行漏洞',
    severity: 'high',
    cvssScore: 8.5,
    affectedAssets: [
      { id: '4', name: 'app-server-01', type: 'server', ip: '192.168.1.40', owner: '李开发', riskScore: 65, tags: ['production', 'app'] }
    ],
    vulnType: 'application',
    source: 'Qualys',
    status: 'in_progress',
    discoveredAt: '2026-04-28T14:30:00Z',
    service: 'struts',
    solution: '升级 Apache Struts 到 6.3.0.2',
    references: ['https://nvd.nist.gov/vuln/detail/CVE-2024-5678']
  },
  {
    id: 'VULN-003',
    name: '弱密码策略',
    description: '系统未启用强密码策略，存在暴力破解风险',
    severity: 'medium',
    cvssScore: 5.3,
    affectedAssets: [
      { id: '2', name: '192.168.1.50', type: 'ip', ip: '192.168.1.50', owner: '李数据库', riskScore: 45, tags: ['production', 'database'] },
      { id: '5', name: 'mail-server', type: 'server', ip: '192.168.1.60', owner: '赵运维', riskScore: 55, tags: ['production', 'mail'] }
    ],
    vulnType: 'host',
    source: 'Rapid7',
    status: 'fixed',
    discoveredAt: '2026-04-20T09:00:00Z',
    fixedAt: '2026-04-25T16:00:00Z',
    solution: '启用密码复杂度策略，最小长度12位'
  },
  {
    id: 'VULN-004',
    cveId: 'CVE-2024-9012',
    name: 'Redis 未授权访问',
    description: 'Redis 服务未配置认证，可被未授权访问',
    severity: 'high',
    cvssScore: 7.5,
    affectedAssets: [
      { id: '6', name: 'cache-server-01', type: 'server', ip: '192.168.1.70', owner: '孙运维', riskScore: 60, tags: ['production', 'cache'] }
    ],
    vulnType: 'host',
    source: 'Nessus',
    status: 'open',
    discoveredAt: '2026-05-02T11:00:00Z',
    port: 6379,
    service: 'redis',
    solution: '配置 requirepass 并绑定内网IP'
  },
  {
    id: 'VULN-005',
    name: 'SQL注入漏洞',
    description: '用户输入未充分过滤，存在SQL注入风险',
    severity: 'critical',
    cvssScore: 9.1,
    affectedAssets: [
      { id: '7', name: 'web-app-01', type: 'application', ip: '192.168.1.80', owner: '周开发', riskScore: 78, tags: ['production', 'webapp'] }
    ],
    vulnType: 'application',
    source: 'Burp Suite',
    status: 'open',
    discoveredAt: '2026-05-03T08:00:00Z',
    service: 'web',
    solution: '使用参数化查询，对用户输入进行严格校验'
  }
];

export const mockDataSources: DataSource[] = [
  {
    id: 'ds-001',
    name: 'Kafka-安全日志',
    type: 'pull',
    protocol: 'Kafka',
    status: 'connected',
    lastSync: '2026-05-03T10:30:00Z',
    eventsPerSecond: 1250,
    totalEvents: 156729384,
    health: 98,
    config: { brokers: ['kafka-1:9092', 'kafka-2:9092'], topic: 'security-logs' },
    parsePipelines: [
      { id: 'p1', name: 'JSON标准解析', priority: 1, condition: 'header.format=="json"', parser: 'json', isActive: true },
      { id: 'p2', name: 'CEF安全事件', priority: 2, condition: 'content.startsWith("CEF:")', parser: 'cef', isActive: true }
    ],
    storageConfig: { tableName: 'alert_logs', retentionDays: 90, partitionInterval: '1天', indexes: ['timestamp', 'severity'], compression: true },
    productMappings: [
      { id: 'pm-001', productName: 'WAF', vendor: '阿里云', logType: '安全日志', parsePipelineId: 'p1', enabled: true },
      { id: 'pm-002', productName: 'IDS', vendor: 'Snort', logType: '入侵检测', parsePipelineId: 'p2', enabled: true }
    ],
    stats: { parsedSuccess: 156729000, parsedFailed: 384, lastError: 'Connection timeout', lastErrorTime: '2026-05-03T08:00:00Z' }
  },
  {
    id: 'ds-002',
    name: 'Syslog-网络设备',
    type: 'push',
    protocol: 'Syslog',
    status: 'connected',
    lastSync: '2026-05-03T10:29:00Z',
    eventsPerSecond: 850,
    totalEvents: 89234567,
    health: 95,
    config: { port: 514, protocol: 'udp' },
    parsePipelines: [
      { id: 'p3', name: 'Syslog RFC5424', priority: 1, condition: 'content.startsWith("<")', parser: 'syslog', isActive: true }
    ],
    storageConfig: { tableName: 'security_events', retentionDays: 180, partitionInterval: '1天', indexes: ['timestamp', 'source_ip'], compression: true },
    productMappings: [
      { id: 'pm-003', productName: '路由器', vendor: '华为', logType: '网络日志', parsePipelineId: 'p3', enabled: true }
    ],
    stats: { parsedSuccess: 89234000, parsedFailed: 567 }
  },
  {
    id: 'ds-003',
    name: 'HTTP-应用日志',
    type: 'push',
    protocol: 'HTTP',
    status: 'syncing',
    lastSync: '2026-05-03T10:28:00Z',
    eventsPerSecond: 2100,
    totalEvents: 234567890,
    health: 92,
    config: { endpoint: '/api/logs', port: 8080 },
    parsePipelines: [
      { id: 'p4', name: 'Grok自定义', priority: 1, condition: 'default', parser: 'grok', customRule: '%{IPORHOST:client_ip} %{USER:ident}', isActive: true }
    ],
    storageConfig: { tableName: 'app_logs_json', retentionDays: 60, partitionInterval: '1天', indexes: ['timestamp', 'app_name', 'level'], compression: true },
    productMappings: [
      { id: 'pm-004', productName: 'Web应用', vendor: '内部', logType: '应用日志', parsePipelineId: 'p4', enabled: true }
    ],
    stats: { parsedSuccess: 234560000, parsedFailed: 7890 }
  }
];

export interface FormatTemplate {
  id: string;
  name: string;
  description: string;
  format: string;
  category: string;
  parserType: string;
  parserConfig?: {
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
  };
  fields: { name: string; type: string; sample?: string; description?: string }[];
  sample: string;
  usageCount: number;
  isPreset: boolean;
}

export const formatTemplates: FormatTemplate[] = [
  {
    id: 'tpl-apache',
    name: 'Apache访问日志',
    description: 'Apache HTTP Server标准访问日志格式',
    format: 'apache',
    category: 'web',
    parserType: 'grok',
    parserConfig: {
      grokPattern: '%{IPORHOST:client_ip} %{USER:ident} %{USER:auth_user} \\[%{HTTPDATE:timestamp}\\] "%{WORD:method} %{URIPATHPARAM:request} HTTP/%{NUMBER:http_version}" %{NUMBER:status} %{NUMBER:bytes}'
    },
    fields: [
      { name: 'client_ip', type: 'ip', sample: '192.168.1.100', description: '客户端IP' },
      { name: 'timestamp', type: 'datetime', sample: '03/May/2026:10:30:00 +0800', description: '请求时间' },
      { name: 'method', type: 'string', sample: 'GET', description: 'HTTP方法' },
      { name: 'request', type: 'string', sample: '/api/users', description: '请求路径' },
      { name: 'status', type: 'number', sample: '200', description: '状态码' },
      { name: 'bytes', type: 'number', sample: '1234', description: '字节数' }
    ],
    sample: '192.168.1.100 - john [03/May/2026:10:30:00 +0800] "GET /api/users HTTP/1.1" 200 1234',
    usageCount: 256,
    isPreset: true
  },
  {
    id: 'tpl-nginx',
    name: 'Nginx访问日志',
    description: 'Nginx标准访问日志格式',
    format: 'nginx',
    category: 'web',
    parserType: 'grok',
    parserConfig: {
      grokPattern: '%{IPORHOST:client_ip} - %{USER:auth_user} \\[%{HTTPDATE:timestamp}\\] "%{WORD:method} %{URIPATHPARAM:request} %{DATA:protocol}" %{NUMBER:status} %{NUMBER:bytes_sent}'
    },
    fields: [
      { name: 'client_ip', type: 'ip', sample: '10.0.0.1', description: '客户端IP' },
      { name: 'method', type: 'string', sample: 'POST', description: 'HTTP方法' },
      { name: 'status', type: 'number', sample: '201', description: '状态码' },
      { name: 'request_time', type: 'number', sample: '0.023', description: '请求耗时' }
    ],
    sample: '10.0.0.1 - - [03/May/2026:10:30:00 +0800] "POST /api/login HTTP/2.0" 201 456',
    usageCount: 312,
    isPreset: true
  },
  {
    id: 'tpl-json',
    name: '通用JSON',
    description: '通用JSON格式日志',
    format: 'json',
    category: 'application',
    parserType: 'json',
    parserConfig: { jsonPath: '$' },
    fields: [
      { name: 'timestamp', type: 'datetime', sample: '2026-05-03T10:30:00Z', description: '时间' },
      { name: 'level', type: 'string', sample: 'info', description: '级别' },
      { name: 'message', type: 'string', sample: 'log message', description: '消息' }
    ],
    sample: '{"timestamp":"2026-05-03T10:30:00Z","level":"info","message":"log message"}',
    usageCount: 1024,
    isPreset: true
  },
  {
    id: 'tpl-syslog',
    name: 'Syslog RFC5424',
    description: '标准Syslog格式',
    format: 'syslog',
    category: 'system',
    parserType: 'syslog',
    parserConfig: { syslogVariant: 'rfc5424' },
    fields: [
      { name: 'priority', type: 'number', sample: '165', description: '优先级' },
      { name: 'timestamp', type: 'datetime', sample: '2026-05-03T10:30:00.123Z', description: '时间' },
      { name: 'hostname', type: 'string', sample: 'server01', description: '主机名' },
      { name: 'app_name', type: 'string', sample: 'sshd', description: '应用名' }
    ],
    sample: '<165>1 2026-05-03T10:30:00.123Z server01 sshd 1234 - - message',
    usageCount: 678,
    isPreset: true
  },
  {
    id: 'tpl-cef',
    name: 'CEF标准',
    description: '通用事件格式',
    format: 'cef',
    category: 'system',
    parserType: 'cef',
    parserConfig: { cefVersion: '0' },
    fields: [
      { name: 'deviceVendor', type: 'string', sample: 'Vendor', description: '设备厂商' },
      { name: 'signatureId', type: 'string', sample: '100', description: '签名ID' },
      { name: 'severity', type: 'string', sample: '5', description: '严重级别' }
    ],
    sample: 'CEF:0|Vendor|Product|1.0|100|Event|5|msg=message',
    usageCount: 345,
    isPreset: true
  }
];

export interface LogType {
  id: string;
  name: string;
  description: string;
  fields: { name: string; type: string; required: boolean }[];
}

export const logTypes: LogType[] = [
  {
    id: 'lt-001',
    name: '安全日志',
    description: '防火墙、IDS/IPS、WAF等安全设备日志',
    fields: [
      { name: 'timestamp', type: 'datetime', required: true },
      { name: 'severity', type: 'string', required: true },
      { name: 'source_ip', type: 'ip', required: true },
      { name: 'dest_ip', type: 'ip', required: false },
      { name: 'action', type: 'string', required: true }
    ]
  },
  {
    id: 'lt-002',
    name: '系统日志',
    description: '操作系统、服务器系统日志',
    fields: [
      { name: 'timestamp', type: 'datetime', required: true },
      { name: 'hostname', type: 'string', required: true },
      { name: 'process', type: 'string', required: true },
      { name: 'message', type: 'string', required: true }
    ]
  },
  {
    id: 'lt-003',
    name: '应用日志',
    description: '业务应用、中间件日志',
    fields: [
      { name: 'timestamp', type: 'datetime', required: true },
      { name: 'level', type: 'string', required: true },
      { name: 'app_name', type: 'string', required: true },
      { name: 'message', type: 'string', required: true }
    ]
  },
  {
    id: 'lt-004',
    name: '网络日志',
    description: '路由器、交换机、DNS日志',
    fields: [
      { name: 'timestamp', type: 'datetime', required: true },
      { name: 'device_ip', type: 'ip', required: true },
      { name: 'event_type', type: 'string', required: true },
      { name: 'details', type: 'string', required: false }
    ]
  },
  {
    id: 'lt-005',
    name: '审计日志',
    description: '用户操作、权限变更审计日志',
    fields: [
      { name: 'timestamp', type: 'datetime', required: true },
      { name: 'user', type: 'string', required: true },
      { name: 'action', type: 'string', required: true },
      { name: 'resource', type: 'string', required: true }
    ]
  }
];

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

export const storageTables: StorageTable[] = [
  {
    id: 'st-001',
    name: 'alert_logs',
    displayName: '告警日志',
    dataSource: 'Kafka-安全日志',
    logType: '安全日志',
    retentionDays: 90,
    partitionInterval: '1天',
    indexes: ['timestamp', 'severity'],
    rowCount: 156729384,
    size: '2.3 GB',
    compression: true,
    autoCreated: false,
    lastOptimized: '2026-04-28T10:00:00Z'
  },
  {
    id: 'st-002',
    name: 'security_events',
    displayName: '安全事件',
    dataSource: 'Syslog-网络设备',
    logType: '系统日志',
    retentionDays: 180,
    partitionInterval: '1天',
    indexes: ['timestamp', 'source_ip'],
    rowCount: 28473920,
    size: '890 MB',
    compression: true,
    autoCreated: false,
    lastOptimized: '2026-04-29T08:30:00Z'
  },
  {
    id: 'st-003',
    name: 'raw_logs',
    displayName: '原始日志',
    dataSource: 'S3-审计日志',
    logType: '审计日志',
    retentionDays: 30,
    partitionInterval: '7天',
    indexes: ['timestamp'],
    rowCount: 89347291,
    size: '1.5 GB',
    compression: true,
    autoCreated: true,
    lastOptimized: '2026-04-30T15:20:00Z',
    createdByPipeline: '智能识别'
  },
  {
    id: 'st-004',
    name: 'app_logs_json',
    displayName: '应用日志(JSON)',
    dataSource: 'HTTP-应用日志',
    logType: '应用日志',
    retentionDays: 60,
    partitionInterval: '1天',
    indexes: ['timestamp', 'app_name', 'level'],
    rowCount: 45283910,
    size: '3.1 GB',
    compression: true,
    autoCreated: true,
    lastOptimized: '2026-04-30T12:00:00Z',
    createdByPipeline: 'JSON标准解析'
  }
];
