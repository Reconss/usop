import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Filter, Download, CheckCircle, XCircle, AlertTriangle,
  Shield, Clock, ChevronDown,
  Trash2, Plus, FileText, X, File, Image,
  Eye, History, Loader2, Zap,
  Play, BookOpen, Send
} from 'lucide-react';
import { alertsApi, eventActionsApi, playbooksApi } from '../services/api';
import type { SecurityEvent, Attachment, EventActionRecord, EventActionType, Playbook } from '../types';

const actionLabels: Record<EventActionType, string> = {
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

const actionColors: Record<EventActionType, { text: string; bg: string }> = {
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

const severityConfig = {
  critical: { color: 'bg-rose-500', text: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20', label: '危急' },
  high: { color: 'bg-orange-500', text: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', label: '高危' },
  medium: { color: 'bg-amber-500', text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', label: '中危' },
  low: { color: 'bg-blue-500', text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', label: '低危' }
};

const statusConfig = {
  new: { color: 'bg-blue-500', text: 'text-blue-400', bg: 'bg-blue-500/10', label: '新建', icon: AlertTriangle },
  investigating: { color: 'bg-orange-500', text: 'text-orange-400', bg: 'bg-orange-500/10', label: '调查中', icon: Clock },
  closed: { color: 'bg-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-500/10', label: '已关闭', icon: CheckCircle },
  false_positive: { color: 'bg-gray-500', text: 'text-gray-400', bg: 'bg-gray-500/10', label: '误报', icon: XCircle }
};

const eventTypes = ['权限异常', '恶意软件', '数据泄露', '网络入侵', 'Web攻击', '横向移动'];

const fileTypeIcons: Record<string, React.ElementType> = {
  'image': Image,
  'application/pdf': FileText,
  'text': FileText,
  'default': File
};

const getFileIcon = (type: string) => {
  if (type.startsWith('image/')) return fileTypeIcons.image;
  if (type === 'application/pdf') return fileTypeIcons['application/pdf'];
  if (type.startsWith('text/')) return fileTypeIcons.text;
  return fileTypeIcons.default;
};

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export default function EventWorkspace() {
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [detailEvent, setDetailEvent] = useState<SecurityEvent | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<SecurityEvent[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEvent, setNewEvent] = useState<Partial<SecurityEvent>>({
    title: '', severity: 'medium', status: 'new', eventType: '权限异常',
    sourceIp: '', affectedAssets: [], description: '', attachments: []
  });
  
  // 筛选状态
  const [filters, setFilters] = useState({
    severity: '',
    status: '',
    eventType: '',
    timeRange: '',
    search: ''
  });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionRecords, setActionRecords] = useState<EventActionRecord[]>([]);
  const [newComment, setNewComment] = useState('');
  
  // 剧本相关状态
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [showPlaybookPanel, setShowPlaybookPanel] = useState(false);
  const [executingPlaybook, setExecutingPlaybook] = useState<string | number | null>(null);
  const [playbookResults, setPlaybookResults] = useState<Record<string | number, any>>({});

  // 获取剧本列表
  const fetchPlaybooks = useCallback(async () => {
    try {
      console.log('正在获取剧本列表...');
      const res = await playbooksApi.getPlaybooks({ page_size: 100 });
      console.log('剧本列表响应:', res);
      if (res.success && res.data) {
        const items = Array.isArray(res.data) ? res.data : res.data.items || [];
        console.log('所有剧本:', items);
        // 支持 published 和 enabled 状态的剧本
        const filteredPlaybooks = items.filter((p: any) => p.status === 'published' || p.status === 'enabled') as Playbook[];
        console.log('筛选后的剧本:', filteredPlaybooks);
        setPlaybooks(filteredPlaybooks);
      } else {
        console.log('获取剧本失败或无数据:', res);
      }
    } catch (error) {
      console.error('获取剧本列表失败:', error);
    }
  }, []);

  // 从后端获取处置记录
  const fetchEventActions = useCallback(async (eventId: string, eventCode?: string) => {
    try {
      // 优先使用 eventCode 查询，如果没有则用 eventId
      const queryId = eventCode || eventId;
      const res = await eventActionsApi.getEventActions(queryId);
      if (res.success && res.data) {
        const records: EventActionRecord[] = (Array.isArray(res.data) ? res.data : res.data.items || []).map((item: any) => ({
          id: String(item.id),
          eventId: String(item.event_id || eventId),
          timestamp: item.created_at || new Date().toISOString(),
          user: item.user_name || item.user || '系统',
          userId: item.user_id,
          action: item.action as EventActionType,
          content: item.content || item.description || '',
          attachments: item.attachments || [],
          previousStatus: item.previous_status,
          newStatus: item.new_status,
          previousSeverity: item.previous_severity,
          newSeverity: item.new_severity,
          assignee: item.assignee,
          metadata: item.metadata || item.playbook_result
        }));
        return records;
      }
      return [];
    } catch (error) {
      console.error('获取处置记录失败:', error);
      return [];
    }
  }, []);

  // 添加新的处置记录（评论）
  const handleAddComment = async () => {
    if (!newComment.trim() || !detailEvent) return;
    try {
      // 使用 eventCode 或 id
      const eventId = detailEvent.eventCode || detailEvent.id;
      const res = await eventActionsApi.createEventAction(eventId, {
        action: 'comment',
        content: newComment.trim()
      });
      if (res.success && res.data) {
        const newRecord: EventActionRecord = {
          id: String(res.data.id),
          eventId: detailEvent.id,
          timestamp: res.data.created_at || new Date().toISOString(),
          user: res.data.user_name || '当前用户',
          action: 'comment',
          content: newComment.trim()
        };
        setActionRecords(prev => [newRecord, ...prev]);
        setNewComment('');
        showToast('处置记录已添加');
      }
    } catch (error) {
      console.error('添加处置记录失败:', error);
      showToast('添加失败', 'error');
    }
  };

  // 执行剧本
  const handleExecutePlaybook = async (playbook: Playbook) => {
    if (!detailEvent) {
      showToast('请先选择一个事件', 'error');
      return;
    }
    setExecutingPlaybook(playbook.id);
    try {
      // 使用 eventCode 或 id
      const eventId = detailEvent.eventCode || detailEvent.id;
      console.log('执行剧本:', { eventId, playbookId: playbook.id, playbookName: playbook.name });
      const res = await eventActionsApi.executePlaybook(eventId, playbook.id);
      console.log('执行剧本响应:', res);
      if (res.success && res.data) {
        // 添加剧本执行记录
        const newRecord: EventActionRecord = {
          id: `temp-${Date.now()}`,
          eventId: detailEvent.id,
          timestamp: new Date().toISOString(),
          user: '当前用户',
          action: 'playbook_triggered',
          content: `触发了剧本：${playbook.name}`,
          metadata: res.data
        };
        setActionRecords(prev => [newRecord, ...prev]);
        setPlaybookResults(prev => ({
          ...prev,
          [playbook.id]: res.data
        }));
        showToast(`剧本"${playbook.name}"已启动`);
      } else {
        showToast(res.error || '执行剧本失败', 'error');
      }
    } catch (error: any) {
      console.error('执行剧本失败:', error);
      // 尝试从错误中提取有意义的消息
      const errorMsg = error?.message || error?.error || '执行剧本失败，请稍后重试';
      showToast(errorMsg, 'error');
    } finally {
      setExecutingPlaybook(null);
    }
  };

  // 更新事件状态（并自动记录）
  const handleUpdateStatus = async (eventId: string, newStatus: string, reason?: string) => {
    try {
      const res = await eventActionsApi.updateEventStatus(eventId, newStatus, reason);
      if (res.success) {
        // 刷新事件列表
        fetchEvents();
        // 刷新处置记录
        const records = await fetchEventActions(eventId);
        setActionRecords(records);
        
        // 更新当前详情
        if (detailEvent && detailEvent.id === eventId) {
          setDetailEvent({ ...detailEvent, status: newStatus as SecurityEvent['status'] });
        }
        
        showToast(`状态已更新为: ${statusConfig[newStatus as keyof typeof statusConfig]?.label || newStatus}`);
      }
    } catch (error) {
      console.error('更新状态失败:', error);
      showToast('更新失败', 'error');
    }
  };

  // 创建新事件
  const handleCreateEvent = async () => {
    if (!newEvent.title) return;
    try {
      const res = await eventActionsApi.createEvent({
        title: newEvent.title,
        description: newEvent.description,
        severity: newEvent.severity,
        event_type: newEvent.eventType,
        source_ip: newEvent.sourceIp
      });
      if (res.success && res.data) {
        showToast('事件创建成功');
        fetchEvents();
        setShowAddForm(false);
        setNewEvent({
          title: '', severity: 'medium', status: 'new', eventType: '权限异常',
          sourceIp: '', affectedAssets: [], description: '', attachments: []
        });
      }
    } catch (error) {
      console.error('创建事件失败:', error);
      showToast('创建失败', 'error');
    }
  };

  // 删除事件
  const handleDeleteEvent = async (event: SecurityEvent) => {
    try {
      // 优先使用 eventCode 删除，如果没有则使用 id
      const eventIdToDelete = event.eventCode || event.id;
      await eventActionsApi.deleteEvent(eventIdToDelete);
      const updatedEvents = events.filter(e => e.id !== event.id);
      setEvents(updatedEvents);
      // 同步更新 filteredEvents
      applyFilters(updatedEvents, filters);
      if (detailEvent?.id === event.id) {
        setDetailEvent(null);
        setActionRecords([]);
      }
      // 清除选中状态
      setSelectedEvents(prev => prev.filter(id => id !== event.id));
      showToast('事件已删除');
    } catch (error) {
      console.error('删除失败:', error);
      showToast('删除失败', 'error');
    }
  };

  // 打开事件详情
  const handleOpenDetail = async (event: SecurityEvent) => {
    setDetailEvent(event);
    // 使用 eventCode 查询处置记录，如果没有则用 id
    const records = await fetchEventActions(event.id, event.eventCode);
    setActionRecords(records);
    await fetchPlaybooks();
  };

  // 获取事件列表
  const fetchEvents = async () => {
    try {
      setLoading(true);
      const res = await eventActionsApi.getEvents({ page_size: 100 });
      if (res.success && res.data) {
        const items = Array.isArray(res.data) ? res.data : res.data.items || [];
        const mappedEvents: SecurityEvent[] = items.map((item: any) => ({
          id: String(item.id),
          eventCode: item.event_code,
          title: item.title || item.name || '未命名事件',
          severity: item.severity || 'medium',
          affectedAssets: item.affected_assets || item.assets || [],
          sourceIp: item.source_ip || item.ip || '',
          timestamp: item.created_at || item.timestamp || new Date().toISOString(),
          status: item.status || 'new',
          eventType: item.category || item.event_type || item.type || '其他',
          description: item.description || item.message || '',
          attachments: item.attachments || []
        }));
        setEvents(mappedEvents);
        applyFilters(mappedEvents, filters);
      }
    } catch (error) {
      console.error('获取事件失败:', error);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  // 筛选逻辑
  const applyFilters = (eventList: SecurityEvent[], filterValues: typeof filters) => {
    let result = [...eventList];
    
    // 搜索筛选
    if (filterValues.search) {
      const searchLower = filterValues.search.toLowerCase();
      result = result.filter(e => 
        e.title.toLowerCase().includes(searchLower) ||
        (e.eventCode && e.eventCode.toLowerCase().includes(searchLower)) ||
        (e.id && e.id.toLowerCase().includes(searchLower)) ||
        (e.description && e.description.toLowerCase().includes(searchLower))
      );
    }
    
    // 严重程度筛选
    if (filterValues.severity) {
      result = result.filter(e => e.severity === filterValues.severity);
    }
    
    // 状态筛选
    if (filterValues.status) {
      result = result.filter(e => e.status === filterValues.status);
    }
    
    // 事件类型筛选
    if (filterValues.eventType) {
      result = result.filter(e => e.eventType === filterValues.eventType);
    }
    
    // 时间范围筛选
    if (filterValues.timeRange) {
      const now = new Date();
      let startTime: Date;
      switch (filterValues.timeRange) {
        case '1h':
          startTime = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case '24h':
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          startTime = new Date(0);
      }
      result = result.filter(e => new Date(e.timestamp) >= startTime);
    }
    
    setFilteredEvents(result);
  };

  // 处理筛选条件变化
  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    applyFilters(events, newFilters);
  };

  // 清除所有筛选
  const clearFilters = () => {
    const emptyFilters = { severity: '', status: '', eventType: '', timeRange: '', search: '' };
    setFilters(emptyFilters);
    setFilteredEvents(events);
  };

  // 检查是否有活跃筛选
  const hasActiveFilters = Object.values(filters).some(v => v !== '');

  useEffect(() => {
    fetchEvents();
  }, []);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const toggleSelect = (id: string) => {
    setSelectedEvents(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    setSelectedEvents(selectedEvents.length === filteredEvents.length ? [] : filteredEvents.map(e => e.id));
  };

  return (
    <div className="space-y-6">
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg ${
              toast.type === 'success' ? 'bg-emerald-500/90' : 'bg-rose-500/90'
            } text-white flex items-center gap-2`}
          >
            {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">事件工作台</h1>
          <p className="text-sm text-text-secondary mt-1">处理和管理安全事件，支持状态流转和批量操作</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary-hover transition-all"
        >
          <Plus className="w-4 h-4" />新建事件
        </button>
      </div>

      {/* 搜索栏 */}
      <div className="glass-card rounded-xl p-4 flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            placeholder="搜索事件标题、ID..."
            className="w-full pl-10 pr-4 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:outline-none focus:border-primary"
          />
        </div>
        <button
          onClick={() => setFilterOpen(!filterOpen)}
          className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors ${
            hasActiveFilters 
              ? 'bg-primary/20 border-primary/50 text-primary' 
              : 'border-border-color text-text-secondary hover:bg-white/5'
          }`}
        >
          <Filter className="w-4 h-4" />
          筛选
          {hasActiveFilters && (
            <span className="ml-1 px-1.5 py-0.5 bg-primary text-white text-xs rounded-full">
              {Object.values(filters).filter(v => v !== '').length}
            </span>
          )}
        </button>
        <button className="flex items-center gap-2 px-4 py-2 border border-border-color rounded-lg text-text-secondary hover:bg-white/5 transition-colors">
          <Download className="w-4 h-4" />导出
        </button>
      </div>

      {/* 活跃筛选标签 */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-text-muted">当前筛选:</span>
          {filters.severity && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-rose-500/20 text-rose-400 text-xs rounded-lg">
              {severityConfig[filters.severity as keyof typeof severityConfig]?.label || filters.severity}
              <button onClick={() => handleFilterChange('severity', '')} className="hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.status && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded-lg">
              {statusConfig[filters.status as keyof typeof statusConfig]?.label || filters.status}
              <button onClick={() => handleFilterChange('status', '')} className="hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.eventType && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded-lg">
              {filters.eventType}
              <button onClick={() => handleFilterChange('eventType', '')} className="hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.timeRange && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded-lg">
              {filters.timeRange === '1h' ? '最近1小时' : filters.timeRange === '24h' ? '最近24小时' : filters.timeRange === '7d' ? '最近7天' : '最近30天'}
              <button onClick={() => handleFilterChange('timeRange', '')} className="hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          <button onClick={clearFilters} className="text-xs text-text-muted hover:text-text-secondary">
            清除全部
          </button>
        </div>
      )}

      {/* 筛选面板 - 紧凑内联形式 */}
      <AnimatePresence>
        {filterOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="glass-card rounded-xl p-4 overflow-hidden"
          >
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-xs text-text-muted whitespace-nowrap">严重程度:</label>
                <select
                  value={filters.severity}
                  onChange={(e) => handleFilterChange('severity', e.target.value)}
                  className="px-2 py-1.5 bg-page-bg border border-border-color rounded-lg text-sm text-text-primary focus:outline-none focus:border-primary"
                >
                  <option value="">全部</option>
                  <option value="critical">危急</option>
                  <option value="high">高危</option>
                  <option value="medium">中危</option>
                  <option value="low">低危</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-text-muted whitespace-nowrap">状态:</label>
                <select
                  value={filters.status}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  className="px-2 py-1.5 bg-page-bg border border-border-color rounded-lg text-sm text-text-primary focus:outline-none focus:border-primary"
                >
                  <option value="">全部</option>
                  <option value="new">新建</option>
                  <option value="investigating">调查中</option>
                  <option value="closed">已关闭</option>
                  <option value="false_positive">误报</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-text-muted whitespace-nowrap">类型:</label>
                <select
                  value={filters.eventType}
                  onChange={(e) => handleFilterChange('eventType', e.target.value)}
                  className="px-2 py-1.5 bg-page-bg border border-border-color rounded-lg text-sm text-text-primary focus:outline-none focus:border-primary"
                >
                  <option value="">全部</option>
                  {eventTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-text-muted whitespace-nowrap">时间:</label>
                <select
                  value={filters.timeRange}
                  onChange={(e) => handleFilterChange('timeRange', e.target.value)}
                  className="px-2 py-1.5 bg-page-bg border border-border-color rounded-lg text-sm text-text-primary focus:outline-none focus:border-primary"
                >
                  <option value="">全部时间</option>
                  <option value="1h">最近1小时</option>
                  <option value="24h">最近24小时</option>
                  <option value="7d">最近7天</option>
                  <option value="30d">最近30天</option>
                </select>
              </div>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="ml-auto text-xs text-text-muted hover:text-text-secondary flex items-center gap-1"
                >
                  <X className="w-3 h-3" />清除筛选
                </button>
              )}
            </div>
            <div className="mt-3 pt-3 border-t border-border-color/50 flex items-center justify-between">
              <span className="text-xs text-text-muted">
                共 {filteredEvents.length} 个事件
                {filteredEvents.length !== events.length && (
                  <span className="ml-1">(已筛选)</span>
                )}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 批量操作栏 */}
      {selectedEvents.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-3 bg-primary/10 border border-primary/20 rounded-xl"
        >
          <span className="text-sm text-primary">已选择 {selectedEvents.length} 个事件</span>
          <div className="flex-1" />
          <button
            onClick={() => selectedEvents.forEach(id => handleUpdateStatus(id, 'investigating'))}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 bg-orange-500/20 text-orange-400 rounded-lg text-xs hover:bg-orange-500/30 transition-colors disabled:opacity-50"
          >
            <Clock className="w-3 h-3" />开始调查
          </button>
          <button
            onClick={() => selectedEvents.forEach(id => handleUpdateStatus(id, 'closed'))}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
          >
            <CheckCircle className="w-3 h-3" />批量关闭
          </button>
          <button
            onClick={async () => {
              for (const id of selectedEvents) {
                const event = events.find(e => e.id === id);
                if (event) await handleDeleteEvent(event);
              }
              setSelectedEvents([]);
            }}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 bg-rose-500/20 text-rose-400 rounded-lg text-xs hover:bg-rose-500/30 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3 h-3" />批量删除
          </button>
        </motion.div>
      )}

      {/* 事件列表 */}
      <div className="glass-card rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-page-bg/50">
            <tr className="text-left text-xs text-text-muted border-b border-border-color">
              <th className="p-4">
                <input
                  type="checkbox"
                  checked={selectedEvents.length === filteredEvents.length && filteredEvents.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-border-color"
                />
              </th>
              <th className="p-4 font-medium">事件ID</th>
              <th className="p-4 font-medium">事件信息</th>
              <th className="p-4 font-medium">严重程度</th>
              <th className="p-4 font-medium">状态</th>
              <th className="p-4 font-medium">影响资产</th>
              <th className="p-4 font-medium">时间</th>
              <th className="p-4 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredEvents.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center">
                  <Shield className="w-12 h-12 text-text-muted mx-auto mb-3" />
                  <p className="text-text-secondary">{hasActiveFilters ? '没有符合筛选条件的事件' : '暂无安全事件'}</p>
                  {hasActiveFilters ? (
                    <button
                      onClick={clearFilters}
                      className="mt-3 text-primary hover:underline text-sm"
                    >
                      清除筛选
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowAddForm(true)}
                      className="mt-3 text-primary hover:underline text-sm"
                    >
                      创建新事件
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              filteredEvents.map((event, index) => (
                <motion.tr
                  key={event.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.05 }}
                  className="border-b border-border-color/50 hover:bg-white/5 transition-colors"
                >
                  <td className="p-4">
                    <input
                      type="checkbox"
                      checked={selectedEvents.includes(event.id)}
                      onChange={() => toggleSelect(event.id)}
                      className="w-4 h-4 rounded border-border-color"
                    />
                  </td>
                  <td className="p-4">
                    <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-1 rounded">
                      {event.eventCode || event.id}
                    </span>
                  </td>
                  <td className="p-4">
                    <div>
                      <p className="text-sm font-medium text-text-primary">{event.title}</p>
                      <p className="text-xs text-text-muted mt-0.5">{event.eventType}</p>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${
                      severityConfig[event.severity]?.bg || 'bg-gray-500/10'
                    } ${severityConfig[event.severity]?.text || 'text-gray-400'} border ${
                      severityConfig[event.severity]?.border || 'border-gray-500/20'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${severityConfig[event.severity]?.color || 'bg-gray-500'}`} />
                      {severityConfig[event.severity]?.label || event.severity}
                    </span>
                  </td>
                  <td className="p-4">
                    <select
                      value={event.status}
                      onChange={(e) => handleUpdateStatus(event.id, e.target.value)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer hover:opacity-80 transition-opacity ${
                        statusConfig[event.status]?.bg || 'bg-gray-500/10'
                      } ${statusConfig[event.status]?.text || 'text-gray-400'} ${
                        (statusConfig[event.status]?.bg || 'bg-gray-500/10').replace('/10', '/20').replace('bg-', 'border-') || 'border-gray-500/20'
                      }`}
                    >
                      <option value="new">新建</option>
                      <option value="investigating">调查中</option>
                      <option value="closed">已关闭</option>
                      <option value="false_positive">误报</option>
                    </select>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-1">
                      {event.affectedAssets.slice(0, 2).map((asset, i) => (
                        <span key={i} className="px-2 py-0.5 bg-border-color/50 text-text-secondary text-xs rounded">
                          {asset}
                        </span>
                      ))}
                      {event.affectedAssets.length > 2 && (
                        <span className="text-xs text-text-muted">+{event.affectedAssets.length - 2}</span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-sm text-text-secondary">{new Date(event.timestamp).toLocaleString()}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenDetail(event)}
                        className="p-1.5 hover:bg-primary/10 rounded-lg text-text-secondary hover:text-primary transition-colors"
                        title="查看详情"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteEvent(event)}
                        className="p-1.5 hover:bg-rose-500/10 rounded-lg text-text-secondary hover:text-rose-400 transition-colors"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 新建事件弹窗 */}
      <AnimatePresence>
        {showAddForm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setShowAddForm(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
            >
              <div
                className="glass-card rounded-xl p-6 w-[600px] pointer-events-auto max-h-[85vh] overflow-auto"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-text-primary">新建安全事件</h2>
                  <button onClick={() => setShowAddForm(false)} className="p-2 text-text-secondary hover:text-text-primary">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-text-secondary text-sm mb-2">
                      事件标题 <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={newEvent.title}
                      onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
                      className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:outline-none focus:border-primary"
                      placeholder="输入事件标题"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-text-secondary text-sm mb-2">严重程度</label>
                      <select
                        value={newEvent.severity}
                        onChange={e => setNewEvent({ ...newEvent, severity: e.target.value as SecurityEvent['severity'] })}
                        className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:outline-none focus:border-primary"
                      >
                        <option value="critical">危急</option>
                        <option value="high">高危</option>
                        <option value="medium">中危</option>
                        <option value="low">低危</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-text-secondary text-sm mb-2">事件类型</label>
                      <select
                        value={newEvent.eventType}
                        onChange={e => setNewEvent({ ...newEvent, eventType: e.target.value })}
                        className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:outline-none focus:border-primary"
                      >
                        {eventTypes.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-text-secondary text-sm mb-2">源IP地址</label>
                    <input
                      type="text"
                      value={newEvent.sourceIp}
                      onChange={e => setNewEvent({ ...newEvent, sourceIp: e.target.value })}
                      className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:outline-none focus:border-primary"
                      placeholder="例如: 192.168.1.1"
                    />
                  </div>
                  <div>
                    <label className="block text-text-secondary text-sm mb-2">事件描述</label>
                    <textarea
                      value={newEvent.description}
                      onChange={e => setNewEvent({ ...newEvent, description: e.target.value })}
                      rows={4}
                      className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:outline-none focus:border-primary resize-none"
                      placeholder="描述事件详情..."
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-border-color">
                    <button
                      onClick={() => setShowAddForm(false)}
                      className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleCreateEvent}
                      disabled={!newEvent.title}
                      className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      创建事件
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 事件详情侧边栏 */}
      <AnimatePresence>
        {detailEvent && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => { setDetailEvent(null); setActionRecords([]); setNewComment(''); setShowPlaybookPanel(false); }}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-[550px] bg-card-bg border-l border-border-color z-50 overflow-auto"
            >
              {/* 详情头部 */}
              <div className="p-6 border-b border-border-color flex items-center justify-between sticky top-0 bg-card-bg z-10">
                <h2 className="text-xl font-semibold text-text-primary">事件详情</h2>
                <button
                  onClick={() => { setDetailEvent(null); setActionRecords([]); setNewComment(''); setShowPlaybookPanel(false); }}
                  className="p-2 hover:bg-white/5 rounded-lg"
                >
                  <X className="w-5 h-5 text-text-secondary" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* 事件基本信息 */}
                <div>
                  <h3 className="text-lg font-medium text-text-primary mb-2">{detailEvent.title}</h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs ${
                      severityConfig[detailEvent.severity]?.bg || 'bg-gray-500/10'
                    } ${severityConfig[detailEvent.severity]?.text || 'text-gray-400'}`}>
                      {severityConfig[detailEvent.severity]?.label || detailEvent.severity}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                      statusConfig[detailEvent.status]?.bg || 'bg-gray-500/10'
                    } ${statusConfig[detailEvent.status]?.text || 'text-gray-400'}`}>
                      {statusConfig[detailEvent.status]?.icon && React.createElement(statusConfig[detailEvent.status].icon, { className: 'w-3 h-3' })}
                      {statusConfig[detailEvent.status]?.label || detailEvent.status}
                    </span>
                  </div>
                </div>

                {/* 事件属性 */}
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-secondary">事件ID:</span>
                    <span className="text-text-primary font-mono">{detailEvent.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">事件类型:</span>
                    <span className="text-text-primary">{detailEvent.eventType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">源IP:</span>
                    <span className="text-text-primary font-mono">{detailEvent.sourceIp || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">发生时间:</span>
                    <span className="text-text-primary">{new Date(detailEvent.timestamp).toLocaleString()}</span>
                  </div>
                </div>

                {/* 事件描述 */}
                <div className="p-4 bg-page-bg/50 rounded-xl border border-border-color">
                  <h4 className="text-sm font-medium text-text-secondary mb-2">事件描述</h4>
                  <p className="text-sm text-text-primary">{detailEvent.description || '暂无描述'}</p>
                </div>

                {/* 影响资产 */}
                <div>
                  <h4 className="text-sm font-medium text-text-secondary mb-2">影响资产</h4>
                  <div className="flex flex-wrap gap-2">
                    {detailEvent.affectedAssets.length > 0 ? (
                      detailEvent.affectedAssets.map((asset, i) => (
                        <span key={i} className="px-2 py-1 bg-border-color/50 text-text-secondary text-xs rounded">
                          {asset}
                        </span>
                      ))
                    ) : (
                      <span className="text-text-muted text-sm">暂无</span>
                    )}
                  </div>
                </div>

                {/* 状态切换（支持任意状态间切换） */}
                <div className="pt-4 border-t border-border-color">
                  <label className="block text-sm font-medium text-text-secondary mb-2">事件状态</label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(statusConfig).map(([key, config]) => (
                      <button
                        key={key}
                        onClick={() => handleUpdateStatus(detailEvent.eventCode || detailEvent.id, key)}
                        disabled={detailEvent.status === key}
                        className={`py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                          detailEvent.status === key
                            ? `${config.bg} ${config.text} ring-1 ring-current/30 cursor-default opacity-70`
                            : `bg-page-bg border border-border-color hover:${config.bg} hover:${config.text} text-text-secondary`
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${config.color}`} />
                        {config.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 剧本执行下拉框 */}
                <div className="pt-4 border-t border-border-color">
                  <div className="relative">
                    <button
                      onClick={() => setShowPlaybookPanel(!showPlaybookPanel)}
                      className="w-full py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors flex items-center justify-center gap-2"
                    >
                      <BookOpen className="w-4 h-4" />
                      选择剧本执行
                      <ChevronDown className={`w-4 h-4 transition-transform ${showPlaybookPanel ? 'rotate-180' : ''}`} />
                    </button>

                    {/* 下拉框列表 */}
                    {showPlaybookPanel && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-card-bg border border-border-color rounded-lg shadow-lg overflow-hidden z-20 max-h-60 overflow-y-auto">
                        {playbooks.length === 0 ? (
                          <div className="px-4 py-6 text-center text-text-muted text-sm">
                            <BookOpen className="w-6 h-6 mx-auto mb-2 opacity-50" />
                            暂无可用的剧本
                          </div>
                        ) : (
                          playbooks.map(playbook => (
                            <button
                              key={playbook.id}
                              onClick={() => {
                                handleExecutePlaybook(playbook);
                                setShowPlaybookPanel(false);
                              }}
                              disabled={executingPlaybook === playbook.id}
                              className="w-full px-4 py-2.5 text-left hover:bg-purple-500/10 transition-colors disabled:opacity-50 flex items-center justify-between gap-3 border-b border-border-color/50 last:border-0"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-text-primary truncate">{playbook.name}</div>
                                {playbook.description && (
                                  <div className="text-xs text-text-muted truncate">{playbook.description}</div>
                                )}
                              </div>
                              {executingPlaybook === playbook.id ? (
                                <Loader2 className="w-4 h-4 text-purple-400 animate-spin flex-shrink-0" />
                              ) : (
                                <Play className="w-4 h-4 text-purple-400 flex-shrink-0" />
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* 剧本执行进度展示 */}
                  {executingPlaybook && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-3 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                        <span className="text-sm text-purple-300">剧本执行中...</span>
                      </div>
                      {/* 进度条 */}
                      <div className="h-1.5 bg-purple-500/20 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-purple-500 rounded-full"
                          initial={{ width: '0%' }}
                          animate={{ width: '100%' }}
                          transition={{ duration: 3, ease: 'linear' }}
                        />
                      </div>
                      <div className="flex justify-between mt-2 text-xs text-purple-300/70">
                        <span>正在执行自动化处置...</span>
                        <span>预计 3 秒</span>
                      </div>
                    </motion.div>
                  )}

                  {/* 执行结果提示 */}
                  {playbookResults && Object.keys(playbookResults).length > 0 && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm text-emerald-300">已执行 {Object.keys(playbookResults).length} 个剧本</span>
                      </div>
                      <div className="text-xs text-emerald-300/70 space-y-1">
                        {Object.entries(playbookResults).map(([id, result]: [string, any]) => (
                          <div key={id} className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                            <span>{result?.message || result?.result || '执行成功'}</span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* 处置记录区域 */}
                <div className="pt-6 border-t border-border-color">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-medium text-text-secondary flex items-center gap-2">
                      <History className="w-4 h-4" />处置记录
                    </h4>
                    <span className="text-xs text-text-muted">{actionRecords.length} 条记录</span>
                  </div>

                  {/* 添加评论输入框 */}
                  <div className="mb-4">
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                          handleAddComment();
                        }
                      }}
                      placeholder="添加处置记录... (Ctrl+Enter 发送)"
                      rows={2}
                      className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-sm text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-primary"
                    />
                    <div className="flex justify-end mt-2">
                      <button
                        onClick={handleAddComment}
                        disabled={!newComment.trim()}
                        className="px-3 py-1.5 bg-primary text-white text-xs rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        <Send className="w-3 h-3" />
                        添加记录
                      </button>
                    </div>
                  </div>

                  {/* 处置记录时间线 */}
                  <div className="space-y-0 relative">
                    {/* 时间线竖线 */}
                    <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border-color" />

                    {actionRecords.length === 0 ? (
                      <div className="text-center py-8 text-text-muted text-sm">
                        <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        暂无处置记录
                      </div>
                    ) : (
                      actionRecords.map((record) => (
                        <div key={record.id} className="relative pl-10 pb-4 last:pb-0">
                          {/* 时间线圆点 */}
                          <div className={`absolute left-[8px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-card-bg ${
                            actionColors[record.action]?.bg || 'bg-gray-500/10'
                          }`}>
                            <div className={`absolute inset-0.5 rounded-full ${
                              actionColors[record.action]?.bg.replace('/10', '') || 'bg-gray-500'
                            }`} />
                          </div>

                          {/* 记录内容 */}
                          <div className="bg-page-bg/50 rounded-lg p-3 border border-border-color">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                  actionColors[record.action]?.bg || 'bg-gray-500/10'
                                } ${actionColors[record.action]?.text || 'text-gray-400'}`}>
                                  {actionLabels[record.action] || record.action}
                                </span>
                              </div>
                              <span className="text-xs text-text-muted">
                                {new Date(record.timestamp).toLocaleTimeString()}
                              </span>
                            </div>

                            <p className="text-sm text-text-primary mb-1">
                              <span className="font-medium text-primary/80">{record.user}</span>
                              {record.action === 'assigned' && record.assignee && (
                                <span className="text-text-secondary"> 分配给 <span className="text-primary">{record.assignee}</span></span>
                              )}
                              {record.action === 'status_changed' && record.previousStatus && record.newStatus && (
                                <span className="text-text-secondary">
                                  {' '}{statusConfig[record.previousStatus as keyof typeof statusConfig]?.label || record.previousStatus} → {statusConfig[record.newStatus as keyof typeof statusConfig]?.label || record.newStatus}
                                </span>
                              )}
                              {record.content && (
                                <span className="text-text-secondary">：{record.content}</span>
                              )}
                            </p>

                            {/* 剧本执行结果 */}
                            {record.action === 'playbook_triggered' && record.metadata?.playbookId && (
                              <div className="mt-2 p-2 bg-black/20 rounded text-xs">
                                <div className="flex items-center gap-1 text-orange-400">
                                  <Zap className="w-3 h-3" />
                                  剧本执行中
                                </div>
                                {record.metadata.execution_id && (
                                  <div className="text-text-muted mt-1">
                                    执行ID: {record.metadata.execution_id}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* 关闭事件详情 */}
                            {record.action === 'closed' && record.metadata && (
                              <div className="mt-2 text-xs text-text-muted flex items-center gap-1">
                                <CheckCircle className="w-3 h-3 text-emerald-400" />
                                事件已关闭
                                {record.metadata.close_reason && (
                                  <span> - {record.metadata.close_reason}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
