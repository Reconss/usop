import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Filter, RefreshCw, Eye, EyeOff, AlertTriangle, CheckCircle, XCircle,
  Clock, Shield, Globe, Server, Database, Wifi, FileText, ChevronDown, ChevronRight,
  Loader2, CheckCircle2, Layers, Zap, Activity, Hash, ArrowUpDown, X,
  ExternalLink, Copy, Download, Plus, Trash2, AlertCircle, Cloud, Bell
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { alertsApi, eventsApi } from '../services/api';

// ==================== 类型定义 ====================

/** 告警来源类型 */
export type AlertSource = 'WAF' | 'HIDS' | 'NIDS' | 'EDR' | 'SIEM' | 'SOC' | 'CloudTrail' | 'Firewall' | 'IDS' | 'IPS' | 'Other';

/** 严重程度 */
export type Severity = 'critical' | 'high' | 'medium' | 'low';

/** 告警状态 */
export type AlertStatus = 'new' | 'investigating' | 'closed' | 'false_positive';

/** 通用告警接口 - 统一不同来源的告警格式 */
export interface UnifiedAlert {
  id: number | string;
  alertCode: string;
  title: string;
  description: string;
  severity: Severity;
  status: AlertStatus;
  confidence: number;
  
  // 通用字段（标准化）
  source: AlertSource;          // 告警来源
  sourceProduct: string;         // 产品名称
  sourceType: string;            // 原始类型
  category: string;             // 告警类别
  categoryCode?: string;        // 类别编码
  
  // 网络信息
  srcIp?: string;
  srcPort?: number;
  dstIp?: string;
  dstPort?: number;
  protocol?: string;
  
  // 资产信息
  assetId?: string;
  assetName?: string;
  hostname?: string;
  affectedAssets: string[];
  
  // 时间信息
  firstSeen: string;
  lastSeen: string;
  timestamp: string;
  
  // 关联信息
  eventId?: number;
  eventCode?: string;
  relatedAlertIds: number[];
  aggregated: boolean;
  aggregatedCount: number;
  
  // 原始数据
  rawLog?: string;
  parsedData?: Record<string, any>;
  extraData?: Record<string, any>;
  
  // 统计
  hitCount: number;
  
  // 时间戳
  createdAt: string;
  updatedAt: string;
}

/** 告警聚合组 */
export interface AlertAggregation {
  key: string;              // 聚合键
  title: string;            // 聚合标题
  description: string;      // 聚合描述
  severity: Severity;        // 最高严重度
  alertCount: number;        // 告警数量
  firstSeen: string;         // 首次发生
  lastSeen: string;          // 最后发生
  sourceCounts: Record<string, number>;  // 各来源数量
  alerts: UnifiedAlert[];    // 包含的告警
  affectedAssets: string[]; // 受影响资产
}

/** 聚合维度 */
export type AggregationDimension = 'time' | 'source' | 'category' | 'severity' | 'asset' | 'srcIp';

/** 原始日志格式（各来源可能有不同格式） */
export interface RawLogEntry {
  timestamp: string;
  source: string;
  raw: string;
  format?: 'json' | 'xml' | 'syslog' | 'cef' | 'keyvalue' | 'text';
  parsed?: Record<string, any>;
}

// ==================== 常量配置 ====================

/** 来源类型配置 */
export const SOURCE_CONFIG: Record<AlertSource, { label: string; icon: React.ElementType; color: string; bgColor: string }> = {
  WAF: { label: 'Web应用防火墙', icon: Globe, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  HIDS: { label: '主机入侵检测', icon: Server, color: 'text-purple-400', bgColor: 'bg-purple-500/10' },
  NIDS: { label: '网络入侵检测', icon: Wifi, color: 'text-orange-400', bgColor: 'bg-orange-500/10' },
  EDR: { label: '终端检测响应', icon: Shield, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  SIEM: { label: '安全信息管理', icon: Activity, color: 'text-cyan-400', bgColor: 'bg-cyan-500/10' },
  SOC: { label: '安全运营中心', icon: AlertTriangle, color: 'text-rose-400', bgColor: 'bg-rose-500/10' },
  CloudTrail: { label: '云审计日志', icon: Cloud, color: 'text-amber-400', bgColor: 'bg-amber-500/10' },
  Firewall: { label: '防火墙', icon: Shield, color: 'text-indigo-400', bgColor: 'bg-indigo-500/10' },
  IDS: { label: '入侵检测系统', icon: Wifi, color: 'text-orange-400', bgColor: 'bg-orange-500/10' },
  IPS: { label: '入侵防御系统', icon: Wifi, color: 'text-red-400', bgColor: 'bg-red-500/10' },
  Other: { label: '其他来源', icon: AlertCircle, color: 'text-gray-400', bgColor: 'bg-gray-500/10' }
};

/** 严重度配置 */
export const SEVERITY_CONFIG: Record<Severity, { label: string; color: string; textColor: string; bgColor: string; borderColor: string }> = {
  critical: { label: '危急', color: 'bg-rose-500', textColor: 'text-rose-400', bgColor: 'bg-rose-500/10', borderColor: 'border-rose-500/30' },
  high: { label: '高危', color: 'bg-orange-500', textColor: 'text-orange-400', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/30' },
  medium: { label: '中危', color: 'bg-amber-500', textColor: 'text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/30' },
  low: { label: '低危', color: 'bg-blue-500', textColor: 'text-blue-400', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/30' }
};

/** 状态配置 */
export const STATUS_CONFIG: Record<AlertStatus, { label: string; color: string; textColor: string; bgColor: string }> = {
  new: { label: '新建', color: 'bg-blue-500', textColor: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  investigating: { label: '调查中', color: 'bg-orange-500', textColor: 'text-orange-400', bgColor: 'bg-orange-500/10' },
  closed: { label: '已关闭', color: 'bg-emerald-500', textColor: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  false_positive: { label: '误报', color: 'bg-gray-500', textColor: 'text-gray-400', bgColor: 'bg-gray-500/10' }
};

// ==================== 工具函数 ====================

/** 标准化来源类型 */
export function normalizeSource(source: string): AlertSource {
  const upperSource = source.toUpperCase();
  if (upperSource.includes('WAF')) return 'WAF';
  if (upperSource.includes('HIDS') || upperSource.includes('HOST')) return 'HIDS';
  if (upperSource.includes('NIDS') || upperSource.includes('NETWORK')) return 'NIDS';
  if (upperSource.includes('EDR') || upperSource.includes('ENDPOINT')) return 'EDR';
  if (upperSource.includes('SIEM')) return 'SIEM';
  if (upperSource.includes('SOC')) return 'SOC';
  if (upperSource.includes('CLOUD') || upperSource.includes('TRAIL')) return 'CloudTrail';
  if (upperSource.includes('FIREWALL') || upperSource.includes('FW')) return 'Firewall';
  if (upperSource.includes('IPS')) return 'IPS';
  if (upperSource.includes('IDS')) return 'IDS';
  return 'Other';
}

/** 标准化告警数据为统一格式 */
export function normalizeAlert(rawAlert: any): UnifiedAlert {
  const source = normalizeSource(rawAlert.source || rawAlert.source_product || 'Other');
  
  return {
    id: rawAlert.id,
    alertCode: rawAlert.alert_code || rawAlert.alertCode || `ALT-${rawAlert.id}`,
    title: rawAlert.title || rawAlert.name || '未命名告警',
    description: rawAlert.description || rawAlert.detail || '',
    severity: rawAlert.severity || 'medium',
    status: rawAlert.status || 'new',
    confidence: rawAlert.confidence || rawAlert.score || 80,
    
    source: source,
    sourceProduct: rawAlert.source_product || rawAlert.source || rawAlert.product_name || SOURCE_CONFIG[source].label,
    sourceType: rawAlert.source_type || rawAlert.type || source,
    category: rawAlert.category || rawAlert.event_type || '其他',
    categoryCode: rawAlert.category_code,
    
    srcIp: rawAlert.src_ip || rawAlert.source_ip || rawAlert.srcip || rawAlert.srcIp,
    srcPort: rawAlert.src_port || rawAlert.source_port || rawAlert.srcPort,
    dstIp: rawAlert.dst_ip || rawAlert.dest_ip || rawAlert.dstip || rawAlert.dstIp,
    dstPort: rawAlert.dst_port || rawAlert.dest_port || rawAlert.dstPort,
    protocol: rawAlert.protocol,
    
    assetId: rawAlert.asset_id || rawAlert.assetId,
    assetName: rawAlert.asset_name || rawAlert.assetName,
    hostname: rawAlert.hostname || rawAlert.host,
    affectedAssets: rawAlert.affected_assets || rawAlert.affectedAssets || [],
    
    firstSeen: rawAlert.first_seen || rawAlert.firstSeen || rawAlert.created_at || new Date().toISOString(),
    lastSeen: rawAlert.last_seen || rawAlert.lastSeen || rawAlert.updated_at || rawAlert.created_at || new Date().toISOString(),
    timestamp: rawAlert.timestamp || rawAlert.time || rawAlert.created_at || new Date().toISOString(),
    
    eventId: rawAlert.event_id || rawAlert.eventId,
    eventCode: rawAlert.event_code || rawAlert.eventCode,
    relatedAlertIds: rawAlert.related_alert_ids || rawAlert.relatedAlertIds || [],
    aggregated: rawAlert.aggregated || false,
    aggregatedCount: rawAlert.aggregated_count || rawAlert.aggregatedCount || 0,
    
    rawLog: rawAlert.raw_log || rawAlert.rawLog || rawAlert.raw_log_entry,
    parsedData: rawAlert.parsed_data || rawAlert.parsedData,
    extraData: rawAlert.extra_data || rawAlert.extraData,
    
    hitCount: rawAlert.hit_count || rawAlert.hitCount || 1,
    
    createdAt: rawAlert.created_at || new Date().toISOString(),
    updatedAt: rawAlert.updated_at || rawAlert.updatedAt || rawAlert.created_at || new Date().toISOString()
  };
}

/** 按时间窗口聚合告警 */
function aggregateByTimeWindow(alerts: UnifiedAlert[], windowMinutes: number): AlertAggregation[] {
  const groups = new Map<string, UnifiedAlert[]>();
  
  alerts.forEach(alert => {
    const time = new Date(alert.timestamp).getTime();
    const windowStart = Math.floor(time / (windowMinutes * 60 * 1000)) * (windowMinutes * 60 * 1000);
    const key = `${windowStart}-${alert.category}-${alert.srcIp || 'unknown'}`;
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(alert);
  });
  
  return Array.from(groups.entries())
    .filter(([_, group]) => group.length > 0)
    .map(([key, groupAlerts]) => {
      const [timeStr, category, srcIp] = key.split('-');
      const time = new Date(parseInt(timeStr));
      const maxSeverity = getMaxSeverity(groupAlerts);
      
      return {
        key,
        title: `${category} - ${time.toLocaleTimeString('zh-CN')}`,
        description: `在 ${time.toLocaleTimeString()} 至 ${new Date(time.getTime() + windowMinutes * 60 * 1000).toLocaleTimeString()} 内检测到 ${groupAlerts.length} 次告警`,
        severity: maxSeverity,
        alertCount: groupAlerts.length,
        firstSeen: time.toISOString(),
        lastSeen: groupAlerts.reduce((max, a) => new Date(a.timestamp) > new Date(max.timestamp) ? a : max, groupAlerts[0]).timestamp,
        sourceCounts: groupAlerts.reduce((acc, a) => {
          acc[a.source] = (acc[a.source] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        alerts: groupAlerts,
        affectedAssets: [...new Set(groupAlerts.flatMap(a => a.affectedAssets))]
      };
    })
    .sort((a, b) => new Date(b.firstSeen).getTime() - new Date(a.firstSeen).getTime());
}

/** 按来源聚合告警 */
function aggregateBySource(alerts: UnifiedAlert[]): AlertAggregation[] {
  const groups = new Map<string, UnifiedAlert[]>();
  
  alerts.forEach(alert => {
    const key = `${alert.source}-${alert.category}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(alert);
  });
  
  return Array.from(groups.entries())
    .map(([key, groupAlerts]) => {
      const [source, category] = key.split('-');
      const maxSeverity = getMaxSeverity(groupAlerts);
      
      return {
        key,
        title: `${SOURCE_CONFIG[source as AlertSource]?.label || source} - ${category}`,
        description: `来自 ${SOURCE_CONFIG[source as AlertSource]?.label || source} 的 ${category} 类告警，共 ${groupAlerts.length} 条`,
        severity: maxSeverity,
        alertCount: groupAlerts.length,
        firstSeen: groupAlerts.reduce((min, a) => new Date(a.firstSeen) < new Date(min.firstSeen) ? a : min, groupAlerts[0]).firstSeen,
        lastSeen: groupAlerts.reduce((max, a) => new Date(a.lastSeen) > new Date(max.lastSeen) ? a : max, groupAlerts[0]).lastSeen,
        sourceCounts: { [source]: groupAlerts.length },
        alerts: groupAlerts,
        affectedAssets: [...new Set(groupAlerts.flatMap(a => a.affectedAssets))]
      };
    })
    .sort((a, b) => b.alertCount - a.alertCount);
}

/** 按类别聚合告警 */
function aggregateByCategory(alerts: UnifiedAlert[]): AlertAggregation[] {
  const groups = new Map<string, UnifiedAlert[]>();
  
  alerts.forEach(alert => {
    const key = alert.category;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(alert);
  });
  
  return Array.from(groups.entries())
    .map(([category, groupAlerts]) => {
      const maxSeverity = getMaxSeverity(groupAlerts);
      
      return {
        key: category,
        title: category,
        description: `共检测到 ${groupAlerts.length} 次 ${category} 类告警`,
        severity: maxSeverity,
        alertCount: groupAlerts.length,
        firstSeen: groupAlerts.reduce((min, a) => new Date(a.firstSeen) < new Date(min.firstSeen) ? a : min, groupAlerts[0]).firstSeen,
        lastSeen: groupAlerts.reduce((max, a) => new Date(a.lastSeen) > new Date(max.lastSeen) ? a : max, groupAlerts[0]).lastSeen,
        sourceCounts: groupAlerts.reduce((acc, a) => {
          acc[a.source] = (acc[a.source] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        alerts: groupAlerts,
        affectedAssets: [...new Set(groupAlerts.flatMap(a => a.affectedAssets))]
      };
    })
    .sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
}

/** 按资产聚合告警 */
function aggregateByAsset(alerts: UnifiedAlert[]): AlertAggregation[] {
  const groups = new Map<string, UnifiedAlert[]>();
  
  alerts.forEach(alert => {
    const assets = alert.affectedAssets.length > 0 ? alert.affectedAssets : [alert.assetName || alert.hostname || 'unknown'];
    assets.forEach(asset => {
      const key = asset;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      if (!groups.get(key)!.includes(alert)) {
        groups.get(key)!.push(alert);
      }
    });
  });
  
  return Array.from(groups.entries())
    .map(([asset, groupAlerts]) => {
      const maxSeverity = getMaxSeverity(groupAlerts);
      
      return {
        key: asset,
        title: asset,
        description: `资产 ${asset} 受到 ${groupAlerts.length} 次告警`,
        severity: maxSeverity,
        alertCount: groupAlerts.length,
        firstSeen: groupAlerts.reduce((min, a) => new Date(a.firstSeen) < new Date(min.firstSeen) ? a : min, groupAlerts[0]).firstSeen,
        lastSeen: groupAlerts.reduce((max, a) => new Date(a.lastSeen) > new Date(max.lastSeen) ? a : max, groupAlerts[0]).lastSeen,
        sourceCounts: groupAlerts.reduce((acc, a) => {
          acc[a.source] = (acc[a.source] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        alerts: groupAlerts,
        affectedAssets: [asset]
      };
    })
    .sort((a, b) => b.alertCount - a.alertCount);
}

/** 按源IP聚合告警 */
function aggregateBySrcIp(alerts: UnifiedAlert[]): AlertAggregation[] {
  const groups = new Map<string, UnifiedAlert[]>();
  
  alerts.forEach(alert => {
    const key = alert.srcIp || 'unknown';
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(alert);
  });
  
  return Array.from(groups.entries())
    .map(([srcIp, groupAlerts]) => {
      const maxSeverity = getMaxSeverity(groupAlerts);
      
      return {
        key: srcIp,
        title: srcIp === 'unknown' ? '未知来源' : srcIp,
        description: `来自 ${srcIp === 'unknown' ? '未知来源' : srcIp} 的 ${groupAlerts.length} 次告警`,
        severity: maxSeverity,
        alertCount: groupAlerts.length,
        firstSeen: groupAlerts.reduce((min, a) => new Date(a.firstSeen) < new Date(min.firstSeen) ? a : min, groupAlerts[0]).firstSeen,
        lastSeen: groupAlerts.reduce((max, a) => new Date(a.lastSeen) > new Date(max.lastSeen) ? a : max, groupAlerts[0]).lastSeen,
        sourceCounts: groupAlerts.reduce((acc, a) => {
          acc[a.source] = (acc[a.source] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        alerts: groupAlerts,
        affectedAssets: [...new Set(groupAlerts.flatMap(a => a.affectedAssets))]
      };
    })
    .sort((a, b) => b.alertCount - a.alertCount);
}

/** 获取最高严重度 */
function getMaxSeverity(alerts: UnifiedAlert[]): Severity {
  const severityOrder: Severity[] = ['critical', 'high', 'medium', 'low'];
  return alerts.reduce((max, alert) => {
    return severityOrder.indexOf(alert.severity) < severityOrder.indexOf(max) ? alert.severity : max;
  }, 'low' as Severity);
}

// ==================== 组件定义 ====================

export default function SecurityAlertCenter() {
  const navigate = useNavigate();
  
  // 状态
  const [alerts, setAlerts] = useState<UnifiedAlert[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAlerts, setSelectedAlerts] = useState<Set<string>>(new Set());
  const [expandedAggregations, setExpandedAggregations] = useState<Set<string>>(new Set());
  
  // 筛选状态
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<AlertStatus | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<AlertSource | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  
  // 聚合状态
  const [aggregationDimension, setAggregationDimension] = useState<AggregationDimension>('time');
  const [timeWindowMinutes, setTimeWindowMinutes] = useState(15);
  const [isAggregatedView, setIsAggregatedView] = useState(true);
  
  // 详情面板
  const [selectedAlert, setSelectedAlert] = useState<UnifiedAlert | null>(null);
  const [showRawLog, setShowRawLog] = useState(false);
  
  // 创建事件弹窗
  const [showCreateEventModal, setShowCreateEventModal] = useState(false);
  const [eventForm, setEventForm] = useState({
    title: '',
    severity: 'medium' as Severity,
    description: ''
  });
  
  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);
  
  // 获取告警数据
  const fetchAlerts = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await alertsApi.getAlerts({ page_size: 200 });
      if (res.success && res.data) {
        const items = Array.isArray(res.data) ? res.data : res.data.items || [];
        setAlerts(items.map(normalizeAlert));
      }
    } catch (error) {
      console.error('获取告警失败:', error);
      showToast('获取告警数据失败', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);
  
  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);
  
  // 筛选后的告警
  const filteredAlerts = useMemo(() => {
    return alerts.filter(alert => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!alert.title.toLowerCase().includes(query) &&
            !alert.alertCode.toLowerCase().includes(query) &&
            !alert.description.toLowerCase().includes(query) &&
            !alert.srcIp?.toLowerCase().includes(query) &&
            !alert.dstIp?.toLowerCase().includes(query)) {
          return false;
        }
      }
      if (severityFilter !== 'all' && alert.severity !== severityFilter) return false;
      if (statusFilter !== 'all' && alert.status !== statusFilter) return false;
      if (sourceFilter !== 'all' && alert.source !== sourceFilter) return false;
      if (categoryFilter !== 'all' && alert.category !== categoryFilter) return false;
      return true;
    });
  }, [alerts, searchQuery, severityFilter, statusFilter, sourceFilter, categoryFilter]);
  
  // 聚合视图
  const aggregatedAlerts = useMemo(() => {
    if (!isAggregatedView) return [];
    
    switch (aggregationDimension) {
      case 'time':
        return aggregateByTimeWindow(filteredAlerts, timeWindowMinutes);
      case 'source':
        return aggregateBySource(filteredAlerts);
      case 'category':
        return aggregateByCategory(filteredAlerts);
      case 'asset':
        return aggregateByAsset(filteredAlerts);
      case 'srcIp':
        return aggregateBySrcIp(filteredAlerts);
      default:
        return [];
    }
  }, [filteredAlerts, isAggregatedView, aggregationDimension, timeWindowMinutes]);
  
  // 获取所有来源
  const allSources = useMemo(() => {
    const sources = new Set(alerts.map(a => a.source));
    return Array.from(sources);
  }, [alerts]);
  
  // 获取所有类别
  const allCategories = useMemo(() => {
    const categories = new Set(alerts.map(a => a.category));
    return Array.from(categories);
  }, [alerts]);
  
  // 统计信息
  const stats = useMemo(() => ({
    total: alerts.length,
    critical: alerts.filter(a => a.severity === 'critical').length,
    high: alerts.filter(a => a.severity === 'high').length,
    new: alerts.filter(a => a.status === 'new').length,
    investigating: alerts.filter(a => a.status === 'investigating').length
  }), [alerts]);
  
  // 切换聚合展开状态
  const toggleAggregation = (key: string) => {
    const newSet = new Set(expandedAggregations);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    setExpandedAggregations(newSet);
  };
  
  // 选择/取消选择告警
  const toggleAlertSelection = (alertId: string) => {
    const newSet = new Set(selectedAlerts);
    if (newSet.has(alertId)) {
      newSet.delete(alertId);
    } else {
      newSet.add(alertId);
    }
    setSelectedAlerts(newSet);
  };
  
  // 全选当前视图中的告警
  const selectAllVisible = () => {
    if (isAggregatedView) {
      const allIds = new Set(aggregatedAlerts.flatMap(g => g.alerts.map(a => String(a.id))));
      setSelectedAlerts(allIds);
    } else {
      const allIds = new Set(filteredAlerts.map(a => String(a.id)));
      setSelectedAlerts(allIds);
    }
  };
  
  // 批量更新告警状态
  const batchUpdateStatus = async (status: AlertStatus) => {
    if (selectedAlerts.size === 0) return;
    
    setIsLoading(true);
    try {
      for (const id of selectedAlerts) {
        await alertsApi.updateAlertStatus(Number(id), status);
      }
      showToast(`已更新 ${selectedAlerts.size} 条告警状态`);
      setSelectedAlerts(new Set());
      fetchAlerts();
    } catch (error) {
      showToast('批量更新失败', 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  // 创建事件
  const handleCreateEvent = async () => {
    if (selectedAlerts.size === 0) {
      showToast('请先选择要关联的告警', 'error');
      return;
    }
    
    if (!eventForm.title.trim()) {
      showToast('请输入事件标题', 'error');
      return;
    }
    
    setIsLoading(true);
    try {
      const res = await eventsApi.createEvent({
        title: eventForm.title,
        description: eventForm.description,
        severity: eventForm.severity,
        alert_ids: Array.from(selectedAlerts).map(Number),
        category: '安全告警聚合'
      });
      
      if (res.success) {
        showToast(`已创建事件 ${res.data?.event_code || ''}，关联 ${selectedAlerts.size} 条告警`);
        setShowCreateEventModal(false);
        setSelectedAlerts(new Set());
        setEventForm({ title: '', severity: 'medium', description: '' });
        navigate('/detection/events');
      }
    } catch (error) {
      showToast('创建事件失败', 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  // 渲染来源图标
  const SourceIcon = ({ source, size = 16 }: { source: AlertSource; size?: number }) => {
    const config = SOURCE_CONFIG[source];
    const Icon = config.icon;
    return <Icon className={`${config.color}`} size={size} />;
  };

  return (
    <div className="space-y-6">
      {/* Toast 提示 */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 ${
              toast.type === 'success' ? 'bg-emerald-500/90' : 'bg-rose-500/90'
            } text-white`}
          >
            {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span className="text-sm font-medium">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">安全告警中心</h1>
          <p className="text-text-secondary mt-1">统一查看和管理来自多种安全产品的告警</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsAggregatedView(!isAggregatedView)}
            className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
              isAggregatedView
                ? 'bg-primary text-white'
                : 'bg-card-bg text-text-secondary hover:bg-white/5'
            }`}
          >
            <Layers size={18} />
            {isAggregatedView ? '聚合视图' : '列表视图'}
          </button>
          <button
            onClick={fetchAlerts}
            disabled={isLoading}
            className="p-2 bg-card-bg rounded-lg hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={18} className={isLoading ? 'animate-spin text-text-secondary' : 'text-text-secondary'} />
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-5 gap-4">
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <AlertTriangle className="text-blue-400" size={20} />
            </div>
            <div>
              <div className="text-2xl font-semibold text-text-primary">{stats.total}</div>
              <div className="text-sm text-text-muted">告警总数</div>
            </div>
          </div>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center">
              <XCircle className="text-rose-400" size={20} />
            </div>
            <div>
              <div className="text-2xl font-semibold text-rose-400">{stats.critical}</div>
              <div className="text-sm text-text-muted">危急告警</div>
            </div>
          </div>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <AlertCircle className="text-orange-400" size={20} />
            </div>
            <div>
              <div className="text-2xl font-semibold text-orange-400">{stats.high}</div>
              <div className="text-sm text-text-muted">高危告警</div>
            </div>
          </div>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Bell className="text-blue-400" size={20} />
            </div>
            <div>
              <div className="text-2xl font-semibold text-blue-400">{stats.new}</div>
              <div className="text-sm text-text-muted">待分诊</div>
            </div>
          </div>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <Clock className="text-orange-400" size={20} />
            </div>
            <div>
              <div className="text-2xl font-semibold text-orange-400">{stats.investigating}</div>
              <div className="text-sm text-text-muted">调查中</div>
            </div>
          </div>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="glass-card rounded-xl p-4">
        <div className="flex items-center gap-4 flex-wrap">
          {/* 搜索框 */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索告警标题、ID、IP..."
              className="w-full pl-10 pr-4 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-primary"
            />
          </div>

          {/* 来源筛选 */}
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as AlertSource | 'all')}
            className="px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:outline-none focus:border-primary"
          >
            <option value="all">全部来源</option>
            {allSources.map(source => (
              <option key={source} value={source}>{SOURCE_CONFIG[source]?.label || source}</option>
            ))}
          </select>

          {/* 严重度筛选 */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as Severity | 'all')}
            className="px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:outline-none focus:border-primary"
          >
            <option value="all">全部严重度</option>
            <option value="critical">危急</option>
            <option value="high">高危</option>
            <option value="medium">中危</option>
            <option value="low">低危</option>
          </select>

          {/* 状态筛选 */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as AlertStatus | 'all')}
            className="px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:outline-none focus:border-primary"
          >
            <option value="all">全部状态</option>
            <option value="new">新建</option>
            <option value="investigating">调查中</option>
            <option value="closed">已关闭</option>
            <option value="false_positive">误报</option>
          </select>

          {/* 类别筛选 */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:outline-none focus:border-primary"
          >
            <option value="all">全部类别</option>
            {allCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* 聚合选项 */}
        {isAggregatedView && (
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border-color">
            <span className="text-sm text-text-muted">聚合维度:</span>
            {[
              { value: 'time', label: '时间' },
              { value: 'source', label: '来源' },
              { value: 'category', label: '类别' },
              { value: 'asset', label: '资产' },
              { value: 'srcIp', label: '源IP' }
            ].map(dim => (
              <button
                key={dim.value}
                onClick={() => setAggregationDimension(dim.value as AggregationDimension)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  aggregationDimension === dim.value
                    ? 'bg-primary/20 text-primary'
                    : 'text-text-secondary hover:bg-white/5'
                }`}
              >
                {dim.label}
              </button>
            ))}
            
            {aggregationDimension === 'time' && (
              <>
                <span className="text-sm text-text-muted ml-4">时间窗口:</span>
                <select
                  value={timeWindowMinutes}
                  onChange={(e) => setTimeWindowMinutes(Number(e.target.value))}
                  className="px-2 py-1 bg-page-bg border border-border-color rounded text-text-primary text-sm"
                >
                  <option value={5}>5分钟</option>
                  <option value={15}>15分钟</option>
                  <option value={30}>30分钟</option>
                  <option value={60}>1小时</option>
                </select>
              </>
            )}
          </div>
        )}
      </div>

      {/* 批量操作栏 */}
      {selectedAlerts.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-xl p-4 bg-primary/5 border border-primary/20"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-primary font-medium">已选择 {selectedAlerts.size} 条告警</span>
              <button
                onClick={() => setSelectedAlerts(new Set())}
                className="text-sm text-text-muted hover:text-text-primary"
              >
                取消选择
              </button>
              <button
                onClick={selectAllVisible}
                className="text-sm text-text-muted hover:text-text-primary"
              >
                全选可见项
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => batchUpdateStatus('investigating')}
                className="px-3 py-1.5 text-sm bg-orange-500/20 text-orange-400 rounded-lg hover:bg-orange-500/30 transition-colors"
              >
                标记调查中
              </button>
              <button
                onClick={() => batchUpdateStatus('false_positive')}
                className="px-3 py-1.5 text-sm bg-gray-500/20 text-gray-400 rounded-lg hover:bg-gray-500/30 transition-colors"
              >
                标记误报
              </button>
              <button
                onClick={() => batchUpdateStatus('closed')}
                className="px-3 py-1.5 text-sm bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors"
              >
                关闭告警
              </button>
              <button
                onClick={() => {
                  setEventForm({ title: '', severity: 'medium', description: `聚合 ${selectedAlerts.size} 条告警生成安全事件` });
                  setShowCreateEventModal(true);
                }}
                className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors flex items-center gap-2"
              >
                <Zap size={14} />
                生成事件
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* 告警列表/聚合视图 */}
      <div className="glass-card rounded-xl overflow-hidden">
        {isLoading && alerts.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : isAggregatedView ? (
          // 聚合视图
          <div className="divide-y divide-border-color/50">
            {aggregatedAlerts.length === 0 ? (
              <div className="text-center py-20 text-text-muted">
                <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>暂无聚合告警</p>
              </div>
            ) : (
              aggregatedAlerts.map((group) => (
                <div key={group.key} className="border-l-2 border-transparent hover:border-primary/50 transition-colors">
                  {/* 聚合组头部 */}
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => toggleAggregation(group.key)}
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <button className="p-1 hover:bg-white/10 rounded transition-colors">
                        {expandedAggregations.has(group.key) ? (
                          <ChevronDown size={18} className="text-text-muted" />
                        ) : (
                          <ChevronRight size={18} className="text-text-muted" />
                        )}
                      </button>
                      
                      {/* 严重度 */}
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_CONFIG[group.severity].bgColor} ${SEVERITY_CONFIG[group.severity].textColor}`}>
                        {SEVERITY_CONFIG[group.severity].label}
                      </span>
                      
                      {/* 标题 */}
                      <span className="font-medium text-text-primary">{group.title}</span>
                      
                      {/* 数量 */}
                      <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">
                        {group.alertCount} 条
                      </span>
                      
                      {/* 来源分布 */}
                      <div className="flex items-center gap-1">
                        {Object.entries(group.sourceCounts).map(([source, count]) => (
                          <span key={source} className={`px-1.5 py-0.5 ${SOURCE_CONFIG[source as AlertSource]?.bgColor} ${SOURCE_CONFIG[source as AlertSource]?.color} rounded text-xs flex items-center gap-1`}>
                            <SourceIcon source={source as AlertSource} size={12} />
                            {count}
                          </span>
                        ))}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-text-muted">
                      <span>{new Date(group.firstSeen).toLocaleString('zh-CN')}</span>
                      {group.affectedAssets.length > 0 && (
                        <span className="text-xs">资产: {group.affectedAssets.slice(0, 2).join(', ')}{group.affectedAssets.length > 2 ? '...' : ''}</span>
                      )}
                    </div>
                  </div>
                  
                  {/* 展开的告警列表 */}
                  <AnimatePresence>
                    {expandedAggregations.has(group.key) && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 pl-12 space-y-2">
                          {group.alerts.map((alert) => (
                            <AlertRow
                              key={alert.id}
                              alert={alert}
                              isSelected={selectedAlerts.has(String(alert.id))}
                              onToggle={() => toggleAlertSelection(String(alert.id))}
                              onViewDetail={() => setSelectedAlert(alert)}
                            />
                          ))}
                          {/* 批量操作 */}
                          <div className="flex items-center gap-2 pt-2">
                            <button
                              onClick={() => {
                                const ids = group.alerts.map(a => String(a.id));
                                setSelectedAlerts(prev => {
                                  const newSet = new Set(prev);
                                  ids.forEach(id => newSet.add(id));
                                  return newSet;
                                });
                              }}
                              className="text-xs text-primary hover:underline"
                            >
                              全选本组
                            </button>
                            <button
                              onClick={() => {
                                setEventForm({
                                  title: group.title,
                                  severity: group.severity,
                                  description: group.description
                                });
                                const ids = group.alerts.map(a => String(a.id));
                                setSelectedAlerts(new Set(ids));
                                setShowCreateEventModal(true);
                              }}
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                              <Zap size={12} />
                              生成事件
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))
            )}
          </div>
        ) : (
          // 列表视图
          <div className="divide-y divide-border-color/50">
            {filteredAlerts.length === 0 ? (
              <div className="text-center py-20 text-text-muted">
                <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>暂无告警</p>
              </div>
            ) : (
              filteredAlerts.map((alert) => (
                <AlertRow
                  key={alert.id}
                  alert={alert}
                  isSelected={selectedAlerts.has(String(alert.id))}
                  onToggle={() => toggleAlertSelection(String(alert.id))}
                  onViewDetail={() => setSelectedAlert(alert)}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* 告警详情侧边栏 */}
      <AnimatePresence>
        {selectedAlert && (
          <AlertDetailPanel
            alert={selectedAlert}
            onClose={() => {
              setSelectedAlert(null);
              setShowRawLog(false);
            }}
            showRawLog={showRawLog}
            onToggleRawLog={() => setShowRawLog(!showRawLog)}
            onCreateEvent={() => {
              setEventForm({
                title: selectedAlert.title,
                severity: selectedAlert.severity,
                description: selectedAlert.description
              });
              setSelectedAlerts(new Set([String(selectedAlert.id)]));
              setShowCreateEventModal(true);
            }}
          />
        )}
      </AnimatePresence>

      {/* 创建事件弹窗 */}
      <AnimatePresence>
        {showCreateEventModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
            onClick={() => setShowCreateEventModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card rounded-xl p-6 w-[500px] max-h-[80vh] overflow-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                  <Zap className="text-primary" size={20} />
                  生成安全事件
                </h3>
                <button onClick={() => setShowCreateEventModal(false)} className="p-1 hover:bg-white/10 rounded">
                  <X size={20} className="text-text-muted" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-2">事件标题</label>
                  <input
                    type="text"
                    value={eventForm.title}
                    onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                    placeholder="请输入事件标题"
                    className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none"
                  />
                </div>
                
                <div>
                  <label className="block text-sm text-text-secondary mb-2">严重程度</label>
                  <div className="flex gap-2">
                    {(['critical', 'high', 'medium', 'low'] as Severity[]).map(sev => (
                      <button
                        key={sev}
                        onClick={() => setEventForm({ ...eventForm, severity: sev })}
                        className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-all ${
                          eventForm.severity === sev
                            ? `${SEVERITY_CONFIG[sev].borderColor} ${SEVERITY_CONFIG[sev].bgColor} ${SEVERITY_CONFIG[sev].textColor}`
                            : 'border-border-color text-text-secondary hover:bg-white/5'
                        }`}
                      >
                        {SEVERITY_CONFIG[sev].label}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm text-text-secondary mb-2">事件描述</label>
                  <textarea
                    value={eventForm.description}
                    onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                    rows={4}
                    placeholder="请输入事件描述..."
                    className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none resize-none"
                  />
                </div>
                
                <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
                  <div className="text-sm text-text-secondary mb-2">将关联的告警</div>
                  <div className="space-y-1 max-h-32 overflow-auto">
                    {Array.from(selectedAlerts).map(id => {
                      const alert = alerts.find(a => String(a.id) === id);
                      return alert ? (
                        <div key={id} className="flex items-center gap-2 text-sm">
                          <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_CONFIG[alert.severity].color}`} />
                          <span className="text-text-muted font-mono">{alert.alertCode}</span>
                          <span className="text-text-primary truncate">{alert.title}</span>
                        </div>
                      ) : null;
                    })}
                  </div>
                  <div className="text-sm text-text-muted mt-2">共 {selectedAlerts.size} 条告警</div>
                </div>
              </div>
              
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowCreateEventModal(false)}
                  className="flex-1 py-2 bg-page-bg text-text-secondary rounded-lg hover:bg-white/5"
                >
                  取消
                </button>
                <button
                  onClick={handleCreateEvent}
                  disabled={isLoading || !eventForm.title.trim()}
                  className="flex-1 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap size={16} />}
                  生成事件
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ==================== 子组件 ====================

/** 告警行组件 */
function AlertRow({
  alert,
  isSelected,
  onToggle,
  onViewDetail
}: {
  alert: UnifiedAlert;
  isSelected: boolean;
  onToggle: () => void;
  onViewDetail: () => void;
}) {
  const sourceConfig = SOURCE_CONFIG[alert.source];
  
  return (
    <div className={`flex items-center gap-4 p-4 hover:bg-white/5 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}>
      {/* 选择框 */}
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggle}
        className="w-4 h-4 rounded border-border-color text-primary focus:ring-primary"
      />
      
      {/* 来源图标 */}
      <div className={`w-8 h-8 rounded-lg ${sourceConfig.bgColor} flex items-center justify-center flex-shrink-0`}>
        {React.createElement(sourceConfig.icon, { className: sourceConfig.color, size: 16 })}
      </div>
      
      {/* 严重度 */}
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_CONFIG[alert.severity].bgColor} ${SEVERITY_CONFIG[alert.severity].textColor} flex-shrink-0`}>
        {SEVERITY_CONFIG[alert.severity].label}
      </span>
      
      {/* 状态 */}
      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_CONFIG[alert.status].bgColor} ${STATUS_CONFIG[alert.status].textColor} flex-shrink-0`}>
        {STATUS_CONFIG[alert.status].label}
      </span>
      
      {/* 主信息 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-text-primary truncate">{alert.title}</span>
          {alert.aggregated && alert.aggregatedCount > 1 && (
            <span className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-xs flex-shrink-0">
              聚合 {alert.aggregatedCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 mt-1 text-sm text-text-muted">
          <span className="font-mono text-xs">{alert.alertCode}</span>
          {alert.srcIp && (
            <span className="font-mono text-xs">
              {alert.srcIp}{alert.srcPort ? `:${alert.srcPort}` : ''} → {alert.dstIp || '*'}
            </span>
          )}
        </div>
      </div>
      
      {/* 资产 */}
      {alert.affectedAssets.length > 0 && (
        <div className="flex items-center gap-1 text-sm text-text-muted flex-shrink-0">
          <Server size={14} />
          <span className="truncate max-w-[100px]">{alert.affectedAssets[0]}</span>
          {alert.affectedAssets.length > 1 && (
            <span className="text-xs">+{alert.affectedAssets.length - 1}</span>
          )}
        </div>
      )}
      
      {/* 时间 */}
      <div className="text-sm text-text-muted flex-shrink-0 min-w-[140px] text-right">
        {new Date(alert.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
      </div>
      
      {/* 操作 */}
      <button
        onClick={onViewDetail}
        className="p-2 text-text-muted hover:text-primary transition-colors flex-shrink-0"
        title="查看详情"
      >
        <Eye size={18} />
      </button>
    </div>
  );
}

/** 告警详情面板组件 */
function AlertDetailPanel({
  alert,
  onClose,
  showRawLog,
  onToggleRawLog,
  onCreateEvent
}: {
  alert: UnifiedAlert;
  onClose: () => void;
  showRawLog: boolean;
  onToggleRawLog: () => void;
  onCreateEvent: () => void;
}) {
  const sourceConfig = SOURCE_CONFIG[alert.source];
  
  return (
    <>
      {/* 背景遮罩 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />
      
      {/* 侧边栏 */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed right-0 top-0 bottom-0 w-[600px] bg-page-bg border-l border-border-color z-50 overflow-auto"
      >
        {/* 头部 */}
        <div className="sticky top-0 bg-page-bg border-b border-border-color p-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-primary">告警详情</h3>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded transition-colors">
            <X size={20} className="text-text-muted" />
          </button>
        </div>
        
        <div className="p-4 space-y-6">
          {/* 基本信息 */}
          <section>
            <h4 className="text-sm font-medium text-text-secondary mb-3">基本信息</h4>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg ${sourceConfig.bgColor} flex items-center justify-center flex-shrink-0`}>
                  {React.createElement(sourceConfig.icon, { className: sourceConfig.color, size: 20 })}
                </div>
                <div>
                  <div className="font-medium text-text-primary">{alert.title}</div>
                  <div className="text-sm text-text-muted mt-1">{alert.description}</div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-text-muted">告警编号</div>
                  <div className="text-sm text-text-primary font-mono">{alert.alertCode}</div>
                </div>
                <div>
                  <div className="text-xs text-text-muted">来源产品</div>
                  <div className="text-sm text-text-primary">{alert.sourceProduct}</div>
                </div>
                <div>
                  <div className="text-xs text-text-muted">严重程度</div>
                  <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-sm ${SEVERITY_CONFIG[alert.severity].bgColor} ${SEVERITY_CONFIG[alert.severity].textColor}`}>
                    <span className={`w-2 h-2 rounded-full ${SEVERITY_CONFIG[alert.severity].color}`} />
                    {SEVERITY_CONFIG[alert.severity].label}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-text-muted">状态</div>
                  <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-sm ${STATUS_CONFIG[alert.status].bgColor} ${STATUS_CONFIG[alert.status].textColor}`}>
                    {STATUS_CONFIG[alert.status].label}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-text-muted">置信度</div>
                  <div className="text-sm text-text-primary">{alert.confidence}%</div>
                </div>
                <div>
                  <div className="text-xs text-text-muted">告警类别</div>
                  <div className="text-sm text-text-primary">{alert.category}</div>
                </div>
              </div>
            </div>
          </section>
          
          {/* 网络信息 */}
          {(alert.srcIp || alert.dstIp) && (
            <section>
              <h4 className="text-sm font-medium text-text-secondary mb-3">网络信息</h4>
              <div className="glass-card rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="text-xs text-text-muted">源地址</div>
                    <div className="text-sm text-text-primary font-mono">{alert.srcIp || '-'}</div>
                  </div>
                  <div className="text-text-muted">→</div>
                  <div className="flex-1">
                    <div className="text-xs text-text-muted">目标地址</div>
                    <div className="text-sm text-text-primary font-mono">{alert.dstIp || '-'}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-text-muted">源端口</div>
                    <div className="text-sm text-text-primary font-mono">{alert.srcPort || '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-text-muted">目标端口</div>
                    <div className="text-sm text-text-primary font-mono">{alert.dstPort || '-'}</div>
                  </div>
                </div>
                {alert.protocol && (
                  <div>
                    <div className="text-xs text-text-muted">协议</div>
                    <div className="text-sm text-text-primary">{alert.protocol}</div>
                  </div>
                )}
              </div>
            </section>
          )}
          
          {/* 资产信息 */}
          {(alert.assetName || alert.hostname || alert.affectedAssets.length > 0) && (
            <section>
              <h4 className="text-sm font-medium text-text-secondary mb-3">资产信息</h4>
              <div className="space-y-2">
                {alert.assetName && (
                  <div className="flex items-center gap-2">
                    <Server size={16} className="text-text-muted" />
                    <span className="text-sm text-text-primary">{alert.assetName}</span>
                  </div>
                )}
                {alert.hostname && (
                  <div className="flex items-center gap-2">
                    <Globe size={16} className="text-text-muted" />
                    <span className="text-sm text-text-primary">{alert.hostname}</span>
                  </div>
                )}
                {alert.affectedAssets.length > 0 && (
                  <div>
                    <div className="text-xs text-text-muted mb-1">受影响资产</div>
                    <div className="flex flex-wrap gap-2">
                      {alert.affectedAssets.map((asset, i) => (
                        <span key={i} className="px-2 py-1 bg-card-bg rounded text-sm text-text-primary">
                          {asset}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
          
          {/* 时间信息 */}
          <section>
            <h4 className="text-sm font-medium text-text-secondary mb-3">时间信息</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-text-muted">首次出现</div>
                <div className="text-sm text-text-primary">{new Date(alert.firstSeen).toLocaleString('zh-CN')}</div>
              </div>
              <div>
                <div className="text-xs text-text-muted">最后出现</div>
                <div className="text-sm text-text-primary">{new Date(alert.lastSeen).toLocaleString('zh-CN')}</div>
              </div>
              <div>
                <div className="text-xs text-text-muted">命中次数</div>
                <div className="text-sm text-text-primary">{alert.hitCount}</div>
              </div>
              <div>
                <div className="text-xs text-text-muted">创建时间</div>
                <div className="text-sm text-text-primary">{new Date(alert.createdAt).toLocaleString('zh-CN')}</div>
              </div>
            </div>
          </section>
          
          {/* 原始日志 */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-text-secondary">原始日志</h4>
              <button
                onClick={onToggleRawLog}
                className="flex items-center gap-1 text-sm text-primary hover:underline"
              >
                {showRawLog ? <EyeOff size={14} /> : <Eye size={14} />}
                {showRawLog ? '收起' : '展开'}
              </button>
            </div>
            {showRawLog && alert.rawLog && (
              <div className="glass-card rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-text-muted">原始数据</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(alert.rawLog || '')}
                    className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary"
                  >
                    <Copy size={12} />
                    复制
                  </button>
                </div>
                <pre className="text-xs text-text-primary font-mono whitespace-pre-wrap break-all bg-page-bg p-2 rounded">
                  {alert.rawLog}
                </pre>
                
                {alert.parsedData && Object.keys(alert.parsedData).length > 0 && (
                  <>
                    <div className="flex items-center justify-between mt-4 mb-2">
                      <span className="text-xs text-text-muted">解析后数据</span>
                    </div>
                    <pre className="text-xs text-text-primary font-mono whitespace-pre-wrap break-all bg-page-bg p-2 rounded">
                      {JSON.stringify(alert.parsedData, null, 2)}
                    </pre>
                  </>
                )}
              </div>
            )}
          </section>
          
          {/* 操作按钮 */}
          <div className="flex gap-3 pt-4 border-t border-border-color">
            <button
              onClick={onCreateEvent}
              className="flex-1 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors flex items-center justify-center gap-2"
            >
              <Zap size={16} />
              生成事件
            </button>
            <button
              onClick={() => {
                const status = alert.status === 'new' ? 'investigating' : alert.status;
                alertsApi.updateAlertStatus(alert.id as number, status as any);
              }}
              className="flex-1 py-2.5 bg-card-bg text-text-secondary rounded-lg hover:bg-white/5 transition-colors"
            >
              标记处理
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}
