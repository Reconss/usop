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

export interface DataSource {
  id: number | string;
  name: string;
  type: 'pull' | 'push';
  protocol: string;
  status: 'connected' | 'disconnected' | 'error' | 'syncing' | 'paused';
  lastSync?: string;
  totalEvents?: number;
  health?: number;
  parsePipelines?: any[];
  storageConfig?: any;
  [key: string]: any;
}

export interface Playbook {
  id: string;
  name: string;
  triggerType: string;
  status: 'enabled' | 'disabled';
  lastModified: string;
  nodeCount: number;
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
