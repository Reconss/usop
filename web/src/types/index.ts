// ==================== 仪表盘图表类型 ====================

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
  /** 可选：后端返回真实分类色时优先使用，缺失则用设计系统系列色 */
  color?: string;
}

export interface RiskAsset {
  id: string;
  name: string;
  type: string;
  riskScore: number;
  lastSeen: string;
}

// ==================== 用户与审计 ====================

export interface User {
  id: string;
  username: string;
  role: string;
  email: string;
  lastLogin: string;
  status: 'active' | 'inactive';
  authType?: 'local' | 'ad';
  adUpn?: string | null;
  adDomain?: string | null;
  /** 角色权限点（登录/me 响应按数据库实际角色解析，缺失时前端放行全部菜单） */
  permissions?: string[];
}

export interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  details: Record<string, unknown>;
  ip: string;
}

// ==================== 资产 ====================

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
  /** 后端真实取值含 server/web/webapp/container/database/network 等，保持宽松 */
  type: string;
  status: string;
  riskScore: number;
  assessedRiskScore?: number;
  osInfo?: string;
  domain?: string;
  hostname?: string;
  ip?: string;
  ports: {
    id?: number;
    port: number;
    protocol?: string;
    service: string;
    version?: string;
    state?: string;
    banner?: string;
    discovered_at?: string;
  }[];
  owner: string;
  lastScan: string;
  lastScanId?: number;
  tags: string[];
  webResults?: { url: string; status_code: number; title: string; tech: string[]; server: string; }[];
  subdomains?: string[];
  vulnerabilities?: AssetVulnInfo[];
  vulnStats?: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };
  metadata?: Record<string, any>;
}

// ==================== 安全事件（工作台） ====================

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
  affectedAssets: string[];
  sourceIp: string;
  timestamp: string;
  status: 'new' | 'acknowledged' | 'investigating' | 'resolved' | 'closed' | 'false_positive' | 'pending_approval' | 'approval_rejected';
  eventType: string;
  description?: string;
  attachments?: Attachment[];
  extraData?: Record<string, any>;
  relatedAlerts?: Array<{ id: number; alert_code: string; title: string; severity: string }>;
}

export interface Playbook {
  id: string | number;
  name: string;
  description?: string;
  nodes?: any[];
  edges?: any[];
  status: 'draft' | 'published' | 'archived' | 'enabled' | 'disabled';
  version?: string;
  /** 执行需审批（剧本配置项）：事件工作台执行时自动走审批流 */
  approval_required?: boolean;
  created_at?: string;
  updated_at?: string;
  triggerType?: string;
  lastModified?: string;
  nodeCount?: number;
}

// ==================== 事件处置记录类型 ====================

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
  | 'approval_requested' // 剧本执行审批申请
  | 'closed';           // 关闭事件

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
