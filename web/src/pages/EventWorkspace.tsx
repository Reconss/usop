// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Filter, Download, CheckCircle, XCircle, AlertTriangle,
  Shield, Clock, ChevronDown,
  Trash2, Plus, FileText, X, File, Image,
  Eye, History, Loader2, Zap, Layers,
  Play, BookOpen, Send
} from 'lucide-react';
import { alertsApi, eventActionsApi, playbooksApi } from '../services/api';
import { Button, ContentContainer, PageHeader } from '../components/ui';
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
  approval_requested: '审批申请',
  closed: '关闭事件'
};

const actionColors: Record<EventActionType, { text: string; bg: string }> = {
  created: { text: 'text-info', bg: 'bg-info/10' },
  status_changed: { text: 'text-warning', bg: 'bg-warning/10' },
  severity_changed: { text: 'text-danger', bg: 'bg-danger/10' },
  assigned: { text: 'text-accent', bg: 'bg-accent/10' },
  comment: { text: 'text-success', bg: 'bg-success/10' },
  attachment: { text: 'text-info', bg: 'bg-info/10' },
  playbook_triggered: { text: 'text-warning', bg: 'bg-warning/10' },
  enriched: { text: 'text-accent', bg: 'bg-accent/10' },
  merged: { text: 'text-success', bg: 'bg-success/10' },
  escalated: { text: 'text-danger', bg: 'bg-danger/10' },
  approval_requested: { text: 'text-warning', bg: 'bg-warning/10' },
  closed: { text: 'text-text-muted', bg: 'bg-surface-3' }
};

const severityConfig = {
  critical: { color: 'bg-danger-solid', text: 'text-danger', bg: 'bg-danger/10', border: 'border-danger/20', label: '危急' },
  high: { color: 'bg-warning-solid', text: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20', label: '高危' },
  medium: { color: 'bg-warning-solid', text: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20', label: '中危' },
  low: { color: 'bg-primary-solid', text: 'text-info', bg: 'bg-info/10', border: 'border-info/20', label: '低危' }
};

const statusConfig = {
  new: { color: 'bg-primary-solid', text: 'text-info', bg: 'bg-info/10', label: '新建', icon: AlertTriangle },
  acknowledged: { color: 'bg-info-solid', text: 'text-info', bg: 'bg-info/10', label: '已受理', icon: Shield },
  pending_approval: { color: 'bg-warning-solid', text: 'text-warning', bg: 'bg-warning/10', label: '待审批', icon: Shield },
  investigating: { color: 'bg-warning-solid', text: 'text-warning', bg: 'bg-warning/10', label: '调查中', icon: Clock },
  resolved: { color: 'bg-success-solid', text: 'text-success', bg: 'bg-success/10', label: '已解决', icon: CheckCircle },
  closed: { color: 'bg-success-solid', text: 'text-success', bg: 'bg-success/10', label: '已关闭', icon: CheckCircle },
  false_positive: { color: 'bg-surface-2', text: 'text-text-muted', bg: 'bg-surface-3', label: '误报', icon: XCircle }
};

// ===== 事件处置状态机（与后端 STATUS_TRANSITIONS 一致）=====
// 主流程: 新建 → 已受理 → 调查中 → 已解决 → 已关闭
// 旁路:   非终态均可标记误报；终态/已解决可重新打开回调查中
const STATUS_FLOW = ['new', 'acknowledged', 'investigating', 'resolved', 'closed'];
const TERMINAL_STATUSES = ['closed', 'false_positive'];
const NEXT_ACTION: Record<string, { target: string; label: string; icon: React.ElementType; needReason: boolean }> = {
  new: { target: 'acknowledged', label: '受理', icon: Shield, needReason: false },
  acknowledged: { target: 'investigating', label: '开始调查', icon: Clock, needReason: false },
  investigating: { target: 'resolved', label: '标记已解决', icon: CheckCircle, needReason: true },
  resolved: { target: 'closed', label: '关闭事件', icon: CheckCircle, needReason: true },
};
const REOPENABLE = ['resolved', 'closed', 'false_positive'];

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


// ===== 剧本运行时入参（声明式）=====
// 入参清单来自 /playbooks-api/playbooks/<id>/params —— 只包含剧本触发器
// 显式声明的运行时入参（key/label/required），每个入参带事件上下文预填值。
// 节点的其余配置是剧本作者在画布上定好的，执行时不向操作人收集。
interface PlaybookInputDef {
  key: string; label: string;
  type: 'text' | 'textarea' | 'select' | 'number' | 'ip';
  required?: boolean; placeholder?: string; description?: string;
  prefill?: string; prefill_source?: string;
}

// 校验运行时入参：必填项非空 + IP 类型格式轻校验
function validatePlaybookInputs(inputs: PlaybookInputDef[] | null, params: Record<string, string>): { valid: boolean; error?: string } {
  for (const input of inputs || []) {
    const v = (params[input.key] ?? input.prefill ?? '').trim();
    if (input.required && !v) {
      return { valid: false, error: `请填写入参「${input.label || input.key}」（必填）` };
    }
    if (v && input.type === 'ip' && !/^([0-9]{1,3}\.){3}[0-9]{1,3}$|^([0-9a-fA-F:]+:+)+[0-9a-fA-F]+$/.test(v)) {
      return { valid: false, error: `入参「${input.label || input.key}」IP 格式不正确（示例：192.168.1.100）` };
    }
  }
  return { valid: true };
}

export default function EventWorkspace() {
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [detailEvent, setDetailEvent] = useState<SecurityEvent | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<SecurityEvent[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showPlaybookParams, setShowPlaybookParams] = useState(false);
  const [newEvent, setNewEvent] = useState<Partial<SecurityEvent>>({
    title: '', severity: 'medium', status: 'new', eventType: '权限异常',
    sourceIp: '', affectedAssets: [], description: '', attachments: []
  });
  
  // 筛选状态
  const [filters, setFilters] = useState({
    severity: [] as string[],
    status: [] as string[],
    eventType: [] as string[],
    timeRange: '',
    search: ''
  });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalEvents, setTotalEvents] = useState(0);
  const [actionRecords, setActionRecords] = useState<EventActionRecord[]>([]);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [actionAttachments, setActionAttachments] = useState<Array<{name: string; size: number; type: string; data: string}>>([]);
  const [newComment, setNewComment] = useState('');
  
  // 剧本相关状态
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [showPlaybookPanel, setShowPlaybookPanel] = useState(false);
  const [executingPlaybook, setExecutingPlaybook] = useState<string | number | null>(null);
  const [playbookResults, setPlaybookResults] = useState<Record<string | number, any>>({});
  
  // 剧本参数输入弹窗
    const [playbookValidation, setPlaybookValidation] = useState<{ valid: boolean; error?: string }>({ valid: true });
  const [selectedPlaybook, setSelectedPlaybook] = useState<Playbook | null>(null);
  const [playbookParams, setPlaybookParams] = useState<Record<string, string>>({});
  // 声明式入参：按所选剧本拉取（每个剧本入参不同；未声明入参的剧本无需填写直接执行）
  const [playbookInputs, setPlaybookInputs] = useState<PlaybookInputDef[] | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState('');

  // 拉取剧本运行时入参清单（服务端已按真实事件上下文算好每个入参的预填值）
  const loadPlaybookSchema = async (playbook: Playbook) => {
    if (!detailEvent) return;
    setSchemaLoading(true);
    setSchemaError('');
    setPlaybookInputs(null);
    try {
      const eventId = detailEvent.eventCode || detailEvent.id;
      const res = await playbooksApi.getParams(playbook.id as number, eventId);
      const inputs: PlaybookInputDef[] = res?.data?.inputs || [];
      setPlaybookInputs(inputs);
      // 预填：服务端算好的事件预填值；ip/src_ip 再兜底事件源 IP
      const prefill: Record<string, string> = {};
      for (const f of inputs) {
        if (f.prefill) prefill[f.key] = f.prefill;
      }
      for (const f of inputs) {
        if ((f.key === 'ip' || f.key === 'src_ip') && !prefill[f.key] && detailEvent.sourceIp) {
          prefill[f.key] = detailEvent.sourceIp;
        }
      }
      setPlaybookParams(prefill);
    } catch (e: any) {
      // 拉取失败不阻塞执行：按未声明入参处理（按画布配置直接执行）
      setSchemaError(e?.message || '入参解析失败');
      setPlaybookInputs([]);
    } finally {
      setSchemaLoading(false);
    }
  };

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

  // 提交剧本执行审批申请（「需要审批后执行」勾选时走此路径）
  const handleExecutePlaybookWithApproval = async (playbook: Playbook, params?: Record<string, string>) => {
    if (!detailEvent) {
      showToast('请先选择一个事件', 'error');
      return;
    }
    try {
      const eventId = detailEvent.eventCode || detailEvent.id;
      const res = await playbooksApi.requestApproval(playbook.id as number, {
        event_id: eventId,
        params: params || playbookParams,
        reason: (params?.reason || playbookParams.reason || '') + `（事件 ${eventId}）`,
      });
      if (res.success) {
        const newRecord: EventActionRecord = {
          id: `temp-${Date.now()}`,
          eventId: detailEvent.id,
          timestamp: new Date().toISOString(),
          user: '当前用户',
          action: 'approval_requested',
          content: `提交了剧本「${playbook.name}」执行审批申请`,
          metadata: res.data
        };
        setActionRecords(prev => [newRecord, ...prev]);
        showToast(res.message || '已提交审批申请，审批通过前剧本不会执行');
      } else {
        showToast(res.error || '提交审批申请失败', 'error');
      }
    } catch (error: any) {
      showToast(error?.message || '提交审批申请失败，请稍后重试', 'error');
    }
  };

  // 执行剧本
  const handleExecutePlaybook = async (playbook: Playbook, params?: Record<string, string>) => {
    if (!detailEvent) {
      showToast('请先选择一个事件', 'error');
      return;
    }
    setExecutingPlaybook(playbook.id);
    try {
      // 使用 eventCode 或 id
      const eventId = detailEvent.eventCode || detailEvent.id;
      console.log('执行剧本:', { eventId, playbookId: playbook.id, playbookName: playbook.name, params });
      
      // 构建请求参数，包含剧本参数
      const requestParams = {
        params: params || playbookParams,
        event: detailEvent
      };
      
      const res = await eventActionsApi.executePlaybook(eventId, playbook.id, requestParams);
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
      setPlaybookValidation({ valid: true });
    }
  };

  // 更新事件状态（并自动记录）。reason 在关闭/解决时由处置面板传入
  const handleUpdateStatus = async (eventId: string, newStatus: string, reason?: string) => {
    try {
      const res = await eventActionsApi.updateEventStatus(eventId, newStatus, reason);
      if (res.success) {
        // 刷新事件列表
        fetchEvents();
        // 刷新处置记录
        const records = await fetchEventActions(eventId);
        setActionRecords(records);
        
        // 更新当前详情（eventId 可能是数字 id 或 eventCode，两者都要匹配）
        if (detailEvent && (detailEvent.id === eventId || detailEvent.eventCode === eventId)) {
          setDetailEvent({ ...detailEvent, status: newStatus as SecurityEvent['status'] });
        }
        
        showToast(`状态已更新为: ${statusConfig[newStatus as keyof typeof statusConfig]?.label || newStatus}`);
        return true;
      }
      showToast(res.error || '更新失败', 'error');
      return false;
    } catch (error: any) {
      console.error('更新状态失败:', error);
      showToast(error?.message || '更新失败', 'error');
      return false;
    }
  };

  // ===== 处置状态机交互 =====
  // 点击下一步动作：需填写说明的目标态（已解决/已关闭）先展开处置说明输入
  const [statusAction, setStatusAction] = useState<{ target: string; needReason: boolean } | null>(null);
  const [statusReason, setStatusReason] = useState('');
  const [statusSubmitting, setStatusSubmitting] = useState(false);

  const requestStatusChange = (target: string) => {
    const meta = Object.values(NEXT_ACTION).find(a => a.target === target);
    if (meta?.needReason || target === 'closed') {
      setStatusAction({ target, needReason: target === 'closed' });
      setStatusReason('');
    } else {
      handleUpdateStatus(detailEvent.eventCode || detailEvent.id, target);
    }
  };

  const confirmStatusChange = async () => {
    if (!statusAction) return;
    if (statusAction.needReason && !statusReason.trim()) {
      showToast(statusAction.target === 'closed' ? '关闭事件必须填写处置总结' : '请填写处置说明', 'error');
      return;
    }
    setStatusSubmitting(true);
    const ok = await handleUpdateStatus(detailEvent.eventCode || detailEvent.id, statusAction.target, statusReason.trim());
    setStatusSubmitting(false);
    if (ok) { setStatusAction(null); setStatusReason(''); }
  };

  // 批量状态流转：单次批量 API，后端校验流转合法性并返回跳过明细
  const [showBatchClose, setShowBatchClose] = useState(false);
  const [batchCloseReason, setBatchCloseReason] = useState('');
  const handleBatchStatus = async (status: string, reason?: string) => {
    try {
      const res = await eventActionsApi.batchUpdateStatus(selectedEvents, status, reason);
      if (res.success) {
        const skipped = res.data?.skipped || [];
        showToast(`批量操作完成：更新 ${res.data?.updated_count ?? 0} 个` +
          (skipped.length ? `，跳过 ${skipped.length} 个（${skipped[0]?.reason || '状态流转不合法'}）` : ''), skipped.length ? 'error' : 'success');
        setSelectedEvents([]);
        setShowBatchClose(false);
        setBatchCloseReason('');
        fetchEvents();
      } else {
        showToast(res.error || '批量操作失败', 'error');
      }
    } catch (error: any) {
      showToast(error?.message || '批量操作失败', 'error');
    }
  };

  // 创建新事件
  const handleCreateEvent = async () => {
    if (!newEvent.title) return;
    try {
      const params: any = {
        title: newEvent.title,
        description: newEvent.description,
        severity: newEvent.severity,
        event_type: newEvent.eventType,
        source_ip: newEvent.sourceIp
      };
      if (newEvent.attachments && newEvent.attachments.length > 0) {
        params.attachments = newEvent.attachments;
      }
      const res = await eventActionsApi.createEvent(params);
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

  // AI 研判（结果写入 event.extra_data.ai_analysis，刷新后仍可回看）
  const handleAiAnalyze = async () => {
    if (!detailEvent) return;
    const eid = String(detailEvent.eventCode || detailEvent.id);
    setAiAnalyzing(true);
    try {
      const res: any = await eventActionsApi.aiAnalyzeEvent(eid);
      if (res?.success) {
        setDetailEvent(prev => prev ? ({
          ...prev,
          extraData: { ...((prev.extraData as any) || {}), ai_analysis: res.data },
        }) : prev);
        showToast(res?.data?.is_ai === false ? 'LLM 不可用，已给出规则兜底研判' : 'AI 研判完成');
      } else {
        showToast(res?.error || '研判失败', 'error');
      }
    } catch (e: any) {
      showToast(e?.message || '研判失败', 'error');
    } finally {
      setAiAnalyzing(false);
    }
  };

  // 打开事件详情
  const handleOpenDetail = async (event: SecurityEvent) => {
    setDetailEvent(event);
    setStatusAction(null);
    setStatusReason('');
    // 使用 eventCode 查询处置记录，如果没有则用 id
    const records = await fetchEventActions(event.id, event.eventCode);
    setActionRecords(records);
    await fetchPlaybooks();
  };

  // 获取事件列表
  const fetchEvents = async () => {
    try {
      setLoading(true);
      const res = await eventActionsApi.getEvents({ page: currentPage, page_size: pageSize });
      if (res.success && res.data) {
        const items = Array.isArray(res.data) ? res.data : res.data.items || [];
        const mappedEvents: SecurityEvent[] = items.map((item: any) => ({
          id: String(item.id),
          eventCode: item.event_code,
          title: item.title || item.name || '未命名事件',
          severity: item.severity || 'medium',
          affectedAssets: item.affected_assets || item.assets
            // 由告警生成的事件：资产清单来自统计摘要（summary.assets）
            || item.extra_data?.summary?.assets || [],
          sourceIp: item.source_ip || item.src_ip || item.ip || '',
          timestamp: item.created_at || item.timestamp || new Date().toISOString(),
          status: item.status || 'new',
          eventType: item.category || item.event_type || item.type || '其他',
          description: item.description || item.message || '',
          attachments: item.attachments || [],
          extraData: item.extra_data || item.extraData || {},
          relatedAlerts: item.related_alerts
            || item.extra_data?.related_alerts
            // 兜底：存量事件可能只存了 alert_ids（无详情），展示纯 ID 列表
            || (item.extra_data?.alert_ids || []).map((id: string) => ({ id, alert_code: id, title: '', severity: '' })),
          attachments: item.attachments || item.extra_data?.attachments || []
        }));
        setEvents(mappedEvents);
        setTotalPages(res.data.pages || 1);
        setTotalEvents(res.data.total || items.length);
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
    
    // 严重程度筛选（多选）
    if (filterValues.severity.length > 0) {
      result = result.filter(e => filterValues.severity.includes(e.severity));
    }
    
    // 状态筛选（多选）
    if (filterValues.status.length > 0) {
      result = result.filter(e => filterValues.status.includes(e.status));
    }
    
    // 事件类型筛选（多选）
    if (filterValues.eventType.length > 0) {
      result = result.filter(e => filterValues.eventType.includes(e.eventType));
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
  const handleFilterChange = (key: string, value: string) => {
    if (key === 'timeRange' || key === 'search') {
      const newFilters = { ...filters, [key]: value };
      setFilters(newFilters);
      applyFilters(events, newFilters);
    } else {
      // Multi-select toggle
      const current = filters[key as keyof typeof filters] as string[];
      const newValues = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value];
      const newFilters = { ...filters, [key]: newValues };
      setFilters(newFilters);
      applyFilters(events, newFilters);
    }
  };

  // 清除所有筛选
  const clearFilters = () => {
    const emptyFilters = { severity: [] as string[], status: [] as string[], eventType: [] as string[], timeRange: '', search: '' };
    setFilters(emptyFilters);
    setFilteredEvents(events);
  };

  // 检查是否有活跃筛选
  const hasActiveFilters = Object.values(filters).some(v => Array.isArray(v) ? v.length > 0 : v !== '');

  useEffect(() => {
    fetchEvents();
  }, [currentPage, pageSize]);

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
    <ContentContainer>
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className={`fixed right-4 top-16 z-toast flex items-center gap-2 rounded-card border px-3.5 py-2.5 text-[12.5px] shadow-panel ${
              toast.type === 'success'
                ? 'border-success/30 bg-success/10 text-success'
                : 'border-danger/30 bg-danger/10 text-danger'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle size={14} /> : <XCircle size={14} />}
            <span className="font-medium">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 页面标题 + 工具条（单行紧凑） */}
      <PageHeader
        icon={Layers}
        title="事件工作台"
        actions={
          <>
            <div className="relative w-[240px] max-w-full">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                placeholder="搜索事件标题、ID…"
                className="app-input pl-8"
              />
            </div>
            <Button
              variant={hasActiveFilters ? 'soft' : 'secondary'}
              icon={Filter}
              onClick={() => setFilterOpen(!filterOpen)}
            >
              筛选
              {hasActiveFilters && (
                <span className="rounded-pill bg-primary/20 px-1.5 text-[10px] text-primary num">
                  {Object.values(filters).filter(v => v !== '').length}
                </span>
              )}
            </Button>
            <Button variant="secondary" icon={Download}>
              导出
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setShowAddForm(true)}>
              新建事件
            </Button>
          </>
        }
      />

      {/* 活跃筛选标签 */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-text-muted">当前筛选:</span>
          {filters.severity && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-danger/20 text-danger text-xs rounded-lg">
              {severityConfig[filters.severity as keyof typeof severityConfig]?.label || filters.severity}
              <button onClick={() => handleFilterChange('severity', '')} className="hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.status && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-info/20 text-info text-xs rounded-lg">
              {statusConfig[filters.status as keyof typeof statusConfig]?.label || filters.status}
              <button onClick={() => handleFilterChange('status', '')} className="hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.eventType && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-accent/20 text-accent text-xs rounded-lg">
              {filters.eventType}
              <button onClick={() => handleFilterChange('eventType', '')} className="hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.timeRange && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-success/20 text-success text-xs rounded-lg">
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
            className="app-card p-4 overflow-hidden"
          >
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-xs text-text-muted whitespace-nowrap">严重程度:</label>
                <div className="flex gap-1 flex-wrap">
                  {[{v:'critical',l:'危急',c:'danger'},{v:'high',l:'高危',c:'warning'},{v:'medium',l:'中危',c:'medium'},{v:'low',l:'低危',c:'info'}].map(s => (
                    <button key={s.v} onClick={() => handleFilterChange('severity', s.v)}
                      className={`rounded border px-2 py-0.5 text-[11.5px] font-medium transition-colors ${
                        filters.severity.includes(s.v)
                          ? s.c === 'danger'
                            ? 'border-danger/40 bg-danger/15 text-danger'
                            : s.c === 'warning'
                              ? 'border-warning/40 bg-warning/15 text-warning'
                              : s.c === 'medium'
                                ? 'border-medium/40 bg-medium/15 text-medium'
                                : 'border-info/40 bg-info/15 text-info'
                          : 'border-border-color bg-surface-2 text-text-muted hover:border-border-strong hover:text-text-secondary'
                      }`}
                    >{s.l}</button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-text-muted whitespace-nowrap">状态:</label>
                <div className="flex gap-1 flex-wrap">
                  {[
                    {v:'new',l:'新建',cls:'border-info/40 bg-info/15 text-info'},
                    {v:'acknowledged',l:'已受理',cls:'border-info/40 bg-info/15 text-info'},
                    {v:'investigating',l:'调查中',cls:'border-warning/40 bg-warning/15 text-warning'},
                    {v:'resolved',l:'已解决',cls:'border-success/40 bg-success/15 text-success'},
                    {v:'closed',l:'已关闭',cls:'border-success/40 bg-success/15 text-success'},
                    {v:'false_positive',l:'误报',cls:'border-border-color bg-surface-3 text-text-secondary'},
                  ].map(s => (
                    <button key={s.v} onClick={() => handleFilterChange('status', s.v)}
                      className={`rounded border px-2 py-0.5 text-[11.5px] font-medium transition-colors ${
                        filters.status.includes(s.v)
                          ? s.cls
                          : 'border-border-color bg-surface-2 text-text-muted hover:border-border-strong hover:text-text-secondary'
                      }`}
                    >{s.l}</button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-text-muted whitespace-nowrap">类型:</label>
                <div className="flex gap-1 flex-wrap">
                  {eventTypes.map(t => (
                    <button key={t} onClick={() => handleFilterChange('eventType', t)}
                      className={`px-2 py-0.5 rounded text-xs font-medium border transition-all ${
                        filters.eventType.includes(t)
                          ? 'bg-primary/15 text-primary border-primary/30'
                          : 'bg-page-bg text-text-muted border-border-color hover:border-border-color'
                      }`}
                    >{t}</button>
                  ))}
                </div>
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
          className="p-3 bg-primary/10 border border-primary/20 rounded-card"
        >
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-primary">已选择 {selectedEvents.length} 个事件</span>
            <div className="flex-1" />
            <button
              onClick={() => handleBatchStatus('acknowledged')}
              disabled={loading}
              className="flex items-center gap-1 px-3 py-1.5 bg-info/20 text-info rounded-lg text-xs hover:bg-info/30 transition-colors disabled:opacity-50"
            >
              <Shield className="w-3 h-3" />批量受理
            </button>
            <button
              onClick={() => handleBatchStatus('investigating')}
              disabled={loading}
              className="flex items-center gap-1 px-3 py-1.5 bg-warning/20 text-warning rounded-lg text-xs hover:bg-warning/30 transition-colors disabled:opacity-50"
            >
              <Clock className="w-3 h-3" />批量开始调查
            </button>
            <button
              onClick={() => handleBatchStatus('resolved')}
              disabled={loading}
              className="flex items-center gap-1 px-3 py-1.5 bg-success/20 text-success rounded-lg text-xs hover:bg-success/30 transition-colors disabled:opacity-50"
            >
              <CheckCircle className="w-3 h-3" />批量标记已解决
            </button>
            <button
              onClick={() => { setShowBatchClose(v => !v); setBatchCloseReason(''); }}
              disabled={loading}
              className="flex items-center gap-1 px-3 py-1.5 bg-success/20 text-success rounded-lg text-xs hover:bg-success/30 transition-colors disabled:opacity-50"
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
              className="flex items-center gap-1 px-3 py-1.5 bg-danger/20 text-danger rounded-lg text-xs hover:bg-danger/30 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3 h-3" />批量删除
            </button>
          </div>
          {showBatchClose && (
            <div className="mt-3 flex items-center gap-2 flex-wrap pt-3 border-t border-primary/20">
              <span className="text-xs text-text-secondary">关闭前请填写处置总结（必填）：</span>
              <input
                value={batchCloseReason}
                onChange={e => setBatchCloseReason(e.target.value)}
                placeholder="如：已完成封禁与加固，确认风险解除"
                className="flex-1 min-w-[240px] px-3 py-1.5 text-xs bg-page-bg border border-border-color rounded-lg text-text-primary placeholder:text-text-muted"
              />
              <button
                onClick={() => handleBatchStatus('closed', batchCloseReason.trim())}
                disabled={loading || !batchCloseReason.trim()}
                className="px-3 py-1.5 bg-success-solid text-white rounded-lg text-xs hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                确认关闭 {selectedEvents.length} 个事件
              </button>
            </div>
          )}
        </motion.div>
      )}

      {/* 事件列表 */}
      <div className="glass-card rounded-card overflow-hidden">
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
                      <p className="text-xs text-text-muted mt-0.5">
                        {event.eventType}
                        {event.sourceIp ? <span className="font-mono"> · {event.sourceIp}</span> : ''}
                      </p>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${
                      severityConfig[event.severity]?.bg || 'bg-surface-3'
                    } ${severityConfig[event.severity]?.text || 'text-text-muted'} border ${
                      severityConfig[event.severity]?.border || 'border-border-color'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${severityConfig[event.severity]?.color || 'bg-surface-2'}`} />
                      {severityConfig[event.severity]?.label || event.severity}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium whitespace-nowrap border ${
                        statusConfig[event.status]?.bg || 'bg-surface-3'
                      } ${statusConfig[event.status]?.text || 'text-text-muted'} ${
                        (statusConfig[event.status]?.bg || 'bg-surface-3').replace('/10', '/20').replace('bg-', 'border-') || 'border-border-color'
                      }`}>
                        {statusConfig[event.status]?.label || event.status}
                      </span>
                      {/* 快捷流转：按状态机只给下一步动作 / 重开 */}
                      {event.status === 'new' && (
                        <button onClick={() => handleUpdateStatus(event.id, 'acknowledged')}
                          className="px-2 py-1 rounded-lg text-[11px] bg-info/10 text-info border border-info/20 hover:bg-info/20 transition-colors whitespace-nowrap"
                          title="受理并进入处置流程">受理</button>
                      )}
                      {event.status === 'acknowledged' && (
                        <button onClick={() => handleUpdateStatus(event.id, 'investigating')}
                          className="px-2 py-1 rounded-lg text-[11px] bg-warning/10 text-warning border border-warning/20 hover:bg-warning/20 transition-colors whitespace-nowrap"
                          title="开始调查">调查</button>
                      )}
                      {event.status === 'investigating' && (
                        <button onClick={() => handleUpdateStatus(event.id, 'resolved')}
                          className="px-2 py-1 rounded-lg text-[11px] bg-success/10 text-success border border-success/20 hover:bg-success/20 transition-colors whitespace-nowrap"
                          title="标记为已解决">解决</button>
                      )}
                      {REOPENABLE.includes(event.status) && (
                        <button onClick={() => handleUpdateStatus(event.id, 'investigating')}
                          className="px-2 py-1 rounded-lg text-[11px] bg-page-bg text-text-muted border border-border-color hover:text-text-secondary transition-colors whitespace-nowrap"
                          title="重新打开，恢复调查">重开</button>
                      )}
                    </div>
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
                        className="p-1.5 hover:bg-danger/10 rounded-lg text-text-secondary hover:text-danger transition-colors"
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

      {/* 分页 */}
      <div className="flex items-center justify-between px-1 py-3">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <span>共 {totalEvents} 条</span>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
            className="px-2 py-1 bg-page-bg border border-border-color rounded-lg text-sm text-text-primary focus:outline-none focus:border-primary"
          >
            <option value={20}>20 条/页</option>
            <option value={50}>50 条/页</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="px-3 py-1.5 text-sm bg-page-bg border border-border-color rounded-lg text-text-secondary hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            上一页
          </button>
          <span className="text-sm text-text-muted px-2">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="px-3 py-1.5 text-sm bg-page-bg border border-border-color rounded-lg text-text-secondary hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            下一页
          </button>
        </div>
      </div>

      {/* 新建事件弹窗 */}
      <AnimatePresence>
        {showAddForm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-[rgb(4_8_20_/_50%)] z-40"
              onClick={() => setShowAddForm(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
            >
              <div
                className="glass-card rounded-card p-6 w-[600px] pointer-events-auto max-h-[85vh] overflow-auto"
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
                      事件标题 <span className="text-danger">*</span>
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
                  <div>
                    <label className="block text-text-secondary text-sm mb-2">附件</label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {newEvent.attachments?.map((att, i) => (
                        <div key={i} className="flex items-center gap-2 px-2 py-1 bg-page-bg border border-border-color rounded-lg text-xs">
                          <File className="w-3.5 h-3.5 text-primary" />
                          <span className="text-text-primary truncate max-w-[120px]">{att.name}</span>
                          <span className="text-text-muted">({(att.size / 1024).toFixed(1)}KB)</span>
                          <button
                            onClick={() => setNewEvent({
                              ...newEvent,
                              attachments: newEvent.attachments?.filter((_, j) => j !== i)
                            })}
                            className="p-0.5 text-text-muted hover:text-danger"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <label className="inline-flex items-center gap-2 px-3 py-2 bg-page-bg border border-border-color rounded-lg cursor-pointer hover:bg-card-bg transition-colors text-sm text-text-secondary">
                      <File className="w-4 h-4" />
                      选择文件
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          Promise.all(files.map(f => new Promise<{name: string; size: number; type: string; data: string}>((resolve) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve({
                              name: f.name,
                              size: f.size,
                              type: f.type,
                              data: reader.result as string
                            });
                            reader.readAsDataURL(f);
                          }))).then(results => {
                            setNewEvent({
                              ...newEvent,
                              attachments: [...(newEvent.attachments || []), ...results]
                            });
                          });
                          // Reset input so re-selecting same file works
                          e.target.value = '';
                        }}
                      />
                    </label>
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
              className="fixed inset-0 bg-[rgb(4_8_20_/_50%)] z-40"
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
                      severityConfig[detailEvent.severity]?.bg || 'bg-surface-3'
                    } ${severityConfig[detailEvent.severity]?.text || 'text-text-muted'}`}>
                      {severityConfig[detailEvent.severity]?.label || detailEvent.severity}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                      statusConfig[detailEvent.status]?.bg || 'bg-surface-3'
                    } ${statusConfig[detailEvent.status]?.text || 'text-text-muted'}`}>
                      {statusConfig[detailEvent.status]?.icon && React.createElement(statusConfig[detailEvent.status].icon, { className: 'w-3 h-3' })}
                      {statusConfig[detailEvent.status]?.label || detailEvent.status}
                    </span>
                  </div>
                </div>

                {/* 事件属性 */}
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-secondary">事件编号:</span>
                    <span className="text-text-primary font-mono">{detailEvent.eventCode || detailEvent.id}</span>
                  </div>
                  {detailEvent.eventCode && detailEvent.eventCode !== detailEvent.id && (
                    <div className="flex justify-between">
                      <span className="text-text-secondary">数据库ID:</span>
                      <span className="text-text-primary font-mono text-xs text-text-muted">{detailEvent.id}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-text-secondary">事件类型:</span>
                    <span className="text-text-primary">{detailEvent.eventType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">源IP:</span>
                    <span className="text-text-primary font-mono">{detailEvent.sourceIp || '-'}</span>
                  </div>
                  {detailEvent.extraData?.summary?.dst_ips?.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-text-secondary">目标IP:</span>
                      <span className="text-text-primary font-mono text-right">
                        {detailEvent.extraData.summary.dst_ips.slice(0, 3).join('、')}
                        {detailEvent.extraData.summary.dst_ips.length > 3
                          ? ` 等 ${detailEvent.extraData.summary.dst_ips.length} 个` : ''}
                      </span>
                    </div>
                  )}
                  {detailEvent.affectedAssets?.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-text-secondary">涉及资产:</span>
                      <span className="text-text-primary text-right">
                        {detailEvent.affectedAssets.slice(0, 3).join('、')}
                        {detailEvent.affectedAssets.length > 3
                          ? ` 等 ${detailEvent.affectedAssets.length} 台` : ''}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-text-secondary">发生时间:</span>
                    <span className="text-text-primary">{new Date(detailEvent.timestamp).toLocaleString()}</span>
                  </div>
                </div>

                {/* 事件描述 */}
                <div className="p-4 bg-page-bg/50 rounded-card border border-border-color">
                  <h4 className="text-sm font-medium text-text-secondary mb-2">事件描述</h4>
                  <p className="text-sm text-text-primary whitespace-pre-wrap break-words">
                    {detailEvent.description || '暂无描述'}
                  </p>
                </div>

                {/* AI 研判（结构化：性质判定 / 风险等级 / 证据链 / 处置动作） */}
                {(() => {
                  const ai = (detailEvent.extraData as any)?.ai_analysis || null;
                  const riskStyle: Record<string, string> = {
                    critical: 'bg-danger/15 text-danger border-danger/30',
                    high: 'bg-warning/15 text-warning border-warning/30',
                    medium: 'bg-warning/15 text-warning border-warning/30',
                    low: 'bg-info/15 text-info border-info/30',
                  };
                  const verdictStyle: Record<string, string> = {
                    true_attack: 'bg-danger/15 text-danger',
                    false_positive: 'bg-success/15 text-success',
                    suspicious: 'bg-warning/15 text-warning',
                    info: 'bg-info/15 text-info',
                  };
                  return (
                    <div className="rounded-card border border-border-color overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 bg-page-bg/60 border-b border-border-color">
                        <h4 className="text-sm font-medium text-text-secondary flex items-center gap-2">
                          <Zap className="w-4 h-4 text-warning" />AI 研判
                          {ai?.analyzed_at && (
                            <span className="text-[10px] text-text-muted font-normal">
                              {new Date(ai.analyzed_at).toLocaleString('zh-CN')}
                              {ai.is_ai === false && ' · 规则兜底（未接入大模型）'}
                            </span>
                          )}
                        </h4>
                        <button
                          onClick={handleAiAnalyze}
                          disabled={aiAnalyzing}
                          className="px-2.5 py-1.5 rounded-lg bg-warning-solid hover:bg-warning-solid-hover text-white text-xs disabled:opacity-50 flex items-center gap-1 transition-colors"
                        >
                          {aiAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                          {ai ? '重新研判' : '执行研判'}
                        </button>
                      </div>
                      {!ai ? (
                        <div className="px-4 py-6 text-center text-xs text-text-muted">
                          尚未对该事件执行 AI 研判。点击「执行研判」，将结合关联告警给出性质判定、风险等级、证据链与处置建议。
                        </div>
                      ) : (
                        <div className="p-4 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-xs ${verdictStyle[ai.verdict] || 'bg-surface-3 text-text-muted'}`}>
                              {ai.verdict_label || ai.verdict}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-xs border ${riskStyle[ai.risk_level] || riskStyle.medium}`}>
                              风险 {ai.risk_level}
                            </span>
                            <span className="px-2 py-0.5 rounded text-xs bg-page-bg border border-border-color text-text-secondary">
                              置信度 {typeof ai.confidence === 'number' ? (ai.confidence * 100).toFixed(0) + '%' : '-'}
                            </span>
                            {ai.related_alert_count > 0 && (
                              <span className="px-2 py-0.5 rounded text-xs bg-page-bg border border-border-color text-text-secondary">
                                关联告警 {ai.related_alert_count} 条
                              </span>
                            )}
                          </div>

                          <div className="text-sm text-text-primary leading-relaxed">{ai.conclusion || '—'}</div>

                          {ai.attack_type && (
                            <div className="text-xs text-text-secondary">
                              <span className="text-text-muted">攻击类型 / 阶段：</span>{ai.attack_type}
                            </div>
                          )}
                          {ai.impact && (
                            <div className="text-xs text-text-secondary">
                              <span className="text-text-muted">潜在影响：</span>{ai.impact}
                            </div>
                          )}

                          {Array.isArray(ai.evidence) && ai.evidence.length > 0 && (
                            <div>
                              <div className="text-[11px] text-text-muted mb-1.5">证据链</div>
                              <div className="space-y-1.5">
                                {ai.evidence.map((ev: any, i: number) => (
                                  <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-page-bg/60 border border-border-color">
                                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary shrink-0">{ev.source}</span>
                                    <span className="text-xs text-text-secondary flex-1">{ev.detail}</span>
                                    <span className="text-[10px] text-text-muted shrink-0">
                                      {typeof ev.confidence === 'number' ? (ev.confidence * 100).toFixed(0) + '%' : ''}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {Array.isArray(ai.analysis_steps) && ai.analysis_steps.length > 0 && (
                            <div>
                              <div className="text-[11px] text-text-muted mb-1.5">分析步骤</div>
                              <ol className="space-y-1 pl-4 list-decimal">
                                {ai.analysis_steps.map((s: string, i: number) => (
                                  <li key={i} className="text-xs text-text-secondary">{s}</li>
                                ))}
                              </ol>
                            </div>
                          )}

                          {ai.suggested_action && (
                            <div className="p-2.5 rounded-lg bg-success/10 border border-success/25">
                              <div className="text-[11px] text-success mb-1">处置建议</div>
                              <div className="text-xs text-text-secondary">{ai.suggested_action}</div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

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

                {/* 附件列表 */}
                {detailEvent.attachments && detailEvent.attachments.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-text-secondary mb-2">附件（{detailEvent.attachments.length}）</h4>
                    <div className="space-y-2">
                      {detailEvent.attachments.map((att: any, i: number) => (
                        <div key={i} className="flex items-center gap-3 p-3 bg-page-bg/50 rounded-lg border border-border-color">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <File className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-text-primary truncate">{att.name}</div>
                            <div className="text-xs text-text-muted">{(att.size / 1024).toFixed(1)} KB</div>
                          </div>
                          {att.data && (
                            <a
                              href={att.data}
                              download={att.name}
                              className="px-3 py-1.5 bg-primary/10 text-primary text-xs rounded-lg hover:bg-primary/20 transition-colors"
                            >
                              下载
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 关联告警 */}
                {detailEvent.relatedAlerts && detailEvent.relatedAlerts.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-text-secondary mb-2">关联告警（{detailEvent.relatedAlerts.length}）</h4>
                    <div className="space-y-2">
                      {detailEvent.relatedAlerts.map((alert: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 p-2 bg-page-bg/50 rounded-lg border border-border-color">
                          <span className="text-xs font-mono text-text-muted">{alert.alert_code || alert.id}</span>
                          <span className="text-xs text-text-primary flex-1 truncate">{alert.title || alert.alert_code || alert.id}</span>
                          {alert.severity && (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                            alert.severity === 'critical' ? 'bg-danger/15 text-danger' :
                            alert.severity === 'high' ? 'bg-warning/15 text-warning' :
                            alert.severity === 'medium' ? 'bg-warning/15 text-warning' :
                            'bg-info/15 text-info'
                          }`}>{alert.severity}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 状态切换 + 处置记录（合并） */}
                <div className="pt-4 border-t border-border-color">
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-text-secondary flex items-center gap-2">
                      <History className="w-4 h-4" />状态 & 处置
                    </label>
                    <span className="text-xs text-text-muted">{actionRecords.length} 条记录</span>
                  </div>

                  {/* 处置流程条：新建 → 已受理 → 调查中 → 已解决 → 已关闭 */}
                  <div className="mb-4">
                    <div className="flex items-center">
                      {STATUS_FLOW.map((s, i) => {
                        const cfg = statusConfig[s];
                        const curIdx = STATUS_FLOW.indexOf(detailEvent.status);
                        const isCur = detailEvent.status === s;
                        const isDone = curIdx >= 0 && i < curIdx;
                        const Icon = cfg.icon;
                        return (
                          <React.Fragment key={s}>
                            {i > 0 && (
                              <div className={`flex-1 h-0.5 mx-1 rounded ${isDone || isCur ? 'bg-success/50' : 'bg-border-color'}`} />
                            )}
                            <div className="flex flex-col items-center gap-1 min-w-[52px]">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center border transition-all ${
                                isCur
                                  ? `${cfg.bg} ${cfg.text} border-current/40 ring-2 ring-current/20`
                                  : isDone
                                  ? 'bg-success/15 text-success border-success/30'
                                  : 'bg-page-bg text-text-muted border-border-color'
                              }`}>
                                <Icon className="w-3.5 h-3.5" />
                              </div>
                              <span className={`text-[10px] whitespace-nowrap ${isCur ? `${cfg.text} font-semibold` : isDone ? 'text-success' : 'text-text-muted'}`}>
                                {cfg.label}
                              </span>
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                    {(detailEvent.status === 'false_positive' || detailEvent.status === 'pending_approval') && (
                      <div className={`mt-2 text-center text-xs ${statusConfig[detailEvent.status].text} ${statusConfig[detailEvent.status].bg} rounded-lg py-1.5`}>
                        当前状态：{statusConfig[detailEvent.status].label}
                        {detailEvent.status === 'false_positive' && '（误报确认，可重新打开恢复调查）'}
                      </div>
                    )}
                  </div>

                  {/* 最近状态操作人（状态变化关联操作人员） */}
                  {(() => {
                    const lastStatus = actionRecords.find(r => r.action === 'status_changed');
                    if (!lastStatus) return null;
                    return (
                      <div className="mb-3 -mt-1 flex items-center gap-1.5 text-[11px] text-text-muted flex-wrap">
                        <History className="w-3 h-3 flex-shrink-0" />
                        <span>最近状态操作：</span>
                        <span className="text-text-secondary font-medium">{lastStatus.user}</span>
                        <span className="num">{new Date(lastStatus.timestamp).toLocaleString('zh-CN', { hour12: false })}</span>
                        {lastStatus.previousStatus && lastStatus.newStatus && (
                          <span className="text-text-muted">
                            （{statusConfig[lastStatus.previousStatus as keyof typeof statusConfig]?.label || lastStatus.previousStatus}
                            {' '}→{' '}
                            {statusConfig[lastStatus.newStatus as keyof typeof statusConfig]?.label || lastStatus.newStatus}）
                          </span>
                        )}
                        {lastStatus.content && !lastStatus.content.startsWith('状态从') && (
                          <span className="truncate max-w-[220px]" title={lastStatus.content}>「{lastStatus.content}」</span>
                        )}
                      </div>
                    );
                  })()}

                  {/* 处置操作：只展示当前状态的合法流转 */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {NEXT_ACTION[detailEvent.status] && (() => {
                      const act = NEXT_ACTION[detailEvent.status];
                      const ActIcon = act.icon;
                      return (
                        <button
                          onClick={() => requestStatusChange(act.target)}
                          className="py-1.5 px-3.5 bg-primary-solid text-white rounded-lg text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5"
                        >
                          <ActIcon className="w-3.5 h-3.5" />{act.label}
                          {act.target === 'closed' && <span className="text-[10px] opacity-80">（需填总结）</span>}
                        </button>
                      );
                    })()}
                    {REOPENABLE.includes(detailEvent.status) && (
                      <button
                        onClick={() => handleUpdateStatus(detailEvent.eventCode || detailEvent.id, 'investigating')}
                        className="py-1.5 px-3.5 bg-page-bg border border-border-color text-text-secondary rounded-lg text-xs font-medium hover:text-text-primary hover:border-border-color-hover transition-all flex items-center gap-1.5"
                      >
                        <Clock className="w-3.5 h-3.5" />重新打开
                      </button>
                    )}
                    {!TERMINAL_STATUSES.includes(detailEvent.status) && (
                      <button
                        onClick={() => handleUpdateStatus(detailEvent.eventCode || detailEvent.id, 'false_positive')}
                        className="py-1.5 px-3.5 bg-page-bg border border-border-color text-text-secondary rounded-lg text-xs font-medium hover:text-text-primary hover:border-border-color-hover transition-all flex items-center gap-1.5"
                      >
                        <XCircle className="w-3.5 h-3.5" />标记误报
                      </button>
                    )}
                  </div>

                  {/* 处置说明输入（标记已解决 / 关闭事件时展开） */}
                  {statusAction && (
                    <div className="mb-4 p-3 bg-page-bg border border-border-color rounded-lg">
                      <label className="block text-xs font-medium text-text-secondary mb-2">
                        {statusAction.needReason ? '处置总结' : '处置说明'}{statusAction.needReason ? '（必填）' : '（可选）'}
                        <span className="ml-1 text-text-muted">→ {statusConfig[statusAction.target]?.label}</span>
                      </label>
                      <textarea
                        value={statusReason}
                        onChange={e => setStatusReason(e.target.value)}
                        rows={2}
                        placeholder={statusAction.needReason ? '如：已完成封禁与加固，确认风险解除' : '如：漏洞已修复并复测通过'}
                        className="w-full px-3 py-2 text-xs bg-card-bg border border-border-color rounded-lg text-text-primary placeholder:text-text-muted resize-none"
                      />
                      <div className="flex items-center justify-end gap-2 mt-2">
                        <button onClick={() => setStatusAction(null)}
                          className="px-3 py-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors">取消</button>
                        <button onClick={confirmStatusChange} disabled={statusSubmitting}
                          className="px-3.5 py-1.5 bg-primary-solid text-white rounded-lg text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5">
                          {statusSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                          确认{statusConfig[statusAction.target]?.label}
                        </button>
                      </div>
                    </div>
                  )}

                {/* 剧本执行下拉框 */}
                <div className="pt-4 border-t border-border-color">
                  <div className="relative">
                    <button
                      onClick={() => setShowPlaybookPanel(!showPlaybookPanel)}
                      className="w-full py-2 bg-accent/20 text-accent rounded-lg hover:bg-accent/30 transition-colors flex items-center justify-center gap-2"
                    >
                      <BookOpen className="w-4 h-4" />
                      选择剧本执行
                      <ChevronDown className={`w-4 h-4 transition-transform ${showPlaybookPanel ? 'rotate-180' : ''}`} />
                    </button>

                    {/* 下拉框列表 */}
                    {showPlaybookPanel && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-card-bg border border-border-color rounded-lg shadow-panel overflow-hidden z-20 max-h-60 overflow-y-auto">
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
                                setSelectedPlaybook(playbook);
                                setPlaybookParams({});
                                setPlaybookValidation({ valid: true });
                                setShowPlaybookPanel(false);
                                setShowPlaybookParams(true);
                                // 按剧本真实节点拉取参数清单（每个剧本的表单不同）
                                loadPlaybookSchema(playbook);
                              }}
                              disabled={executingPlaybook === playbook.id}
                              className="w-full px-4 py-2.5 text-left hover:bg-accent/10 transition-colors disabled:opacity-50 flex items-center justify-between gap-3 border-b border-border-color/50 last:border-0"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-text-primary truncate">{playbook.name}</div>
                                {playbook.description && (
                                  <div className="text-xs text-text-muted truncate">{playbook.description}</div>
                                )}
                              </div>
                              {executingPlaybook === playbook.id ? (
                                <Loader2 className="w-4 h-4 text-accent animate-spin flex-shrink-0" />
                              ) : (
                                <Play className="w-4 h-4 text-accent flex-shrink-0" />
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
                      className="mt-3 p-3 bg-accent/10 border border-accent/20 rounded-lg"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <Loader2 className="w-4 h-4 text-accent animate-spin" />
                        <span className="text-sm text-accent">剧本执行中...</span>
                      </div>
                      {/* 进度条 */}
                      <div className="h-1.5 bg-accent/20 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-accent-solid rounded-full"
                          initial={{ width: '0%' }}
                          animate={{ width: '100%' }}
                          transition={{ duration: 3, ease: 'linear' }}
                        />
                      </div>
                      <div className="flex justify-between mt-2 text-xs text-accent/70">
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
                      className="mt-3 p-3 bg-success/10 border border-success/20 rounded-lg"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className="w-4 h-4 text-success" />
                        <span className="text-sm text-success">已执行 {Object.keys(playbookResults).length} 个剧本</span>
                      </div>
                      <div className="text-xs text-success/70 space-y-1">
                        {Object.entries(playbookResults).map(([id, result]: [string, any]) => (
                          <div key={id} className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-success rounded-full" />
                            <span>{result?.message || result?.result || '执行成功'}</span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* 剧本参数输入面板 */}
                {showPlaybookParams && selectedPlaybook && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-3 p-4 bg-accent/10 border border-accent/20 rounded-lg"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-accent" />
                        <span className="text-sm font-medium text-accent">
                          剧本参数: {selectedPlaybook.name}
                        </span>
                      </div>
                      <button
                        onClick={() => setShowPlaybookParams(false)}
                        className="text-text-muted hover:text-text-primary"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {/* 审批提示（剧本配置项：作者在画布开启「执行需审批」后自动走审批流，不由执行人勾选） */}
                    {selectedPlaybook?.approval_required && (
                      <div className="mb-3 px-3 py-2 bg-warning/10 border border-warning/30 rounded text-xs text-warning flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 flex-shrink-0" />
                        该剧本已配置「执行需审批」——提交后将进入审批流程，批准后以本次填写的入参自动执行
                      </div>
                    )}

                    {/* 运行时入参表单（声明式：只问剧本声明的入参，节点配置不问） */}
                    <div className="space-y-3">
                      {schemaLoading && (
                        <div className="flex items-center gap-2 text-xs text-text-muted py-3">
                          <Loader2 className="w-4 h-4 animate-spin" /> 正在解析剧本入参...
                        </div>
                      )}
                      {!schemaLoading && schemaError && (
                        <p className="text-xs text-danger py-2">
                          入参解析失败：{schemaError}。可直接执行，剧本将按画布配置与事件上下文运行。
                        </p>
                      )}
                      {!schemaLoading && !schemaError && playbookInputs && playbookInputs.length === 0 && (
                        <p className="text-xs text-text-muted py-2">
                          该剧本未声明运行时入参，无需填写——将按画布配置与事件上下文直接执行。
                        </p>
                      )}
                      {!schemaLoading && (playbookInputs || []).map(input => {
                        const prefillSource = input.prefill_source?.startsWith('event.') ? '事件'
                          : input.prefill_source?.startsWith('alert.') ? '关联告警' : '';
                        return (
                          <div key={input.key}>
                            <label className="block text-xs text-accent/70 mb-1">
                              {input.label || input.key}
                              {input.required && <span className="text-danger ml-0.5">*</span>}
                              {prefillSource && (
                                <span className="ml-1.5 text-[10px] text-success/80">
                                  自动带入{prefillSource}{input.prefill_source?.includes('src_ip') ? '源IP' : '数据'}
                                </span>
                              )}
                            </label>
                            {input.description && (
                              <p className="text-[10px] text-text-muted mb-1">{input.description}</p>
                            )}
                            {input.type === 'textarea' ? (
                              <textarea
                                value={playbookParams[input.key] ?? input.prefill ?? ''}
                                onChange={(e) => setPlaybookParams(prev => ({ ...prev, [input.key]: e.target.value }))}
                                placeholder={input.placeholder || '支持 {{ $json.字段 }} 引用'}
                                rows={2}
                                className="w-full px-3 py-2 bg-page-bg border border-accent/30 rounded text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent resize-none"
                              />
                            ) : (
                              <input
                                type={input.type === 'number' ? 'number' : 'text'}
                                value={playbookParams[input.key] ?? input.prefill ?? ''}
                                onChange={(e) => setPlaybookParams(prev => ({ ...prev, [input.key]: e.target.value }))}
                                placeholder={input.placeholder || '留空自动使用事件上下文'}
                                className="w-full px-3 py-2 bg-page-bg border border-accent/30 rounded text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                              />
                            )}
                          </div>
                        );
                      })}
                      {/* 执行原因（审批/审计记录用；剧本配置了审批时必填） */}
                      <div>
                        <label className="block text-xs text-accent/70 mb-1.5">
                          执行原因{selectedPlaybook?.approval_required && <span className="text-danger ml-0.5">*</span>}
                        </label>
                        <textarea
                          value={playbookParams.reason || ''}
                          onChange={(e) => setPlaybookParams(prev => ({ ...prev, reason: e.target.value }))}
                          placeholder={selectedPlaybook?.approval_required ? '审批必填：说明执行原因' : '说明执行原因（可选，记入处置记录）'}
                          rows={2}
                          className="w-full px-3 py-2 bg-page-bg border border-accent/30 rounded text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent resize-none"
                        />
                      </div>
                      <div className="flex items-center justify-between px-1">
                        {playbookValidation?.error && (
                          <span className="text-xs text-danger">{playbookValidation.error}</span>
                        )}
                        <div className="flex items-center gap-2 ml-auto">
                          <span className="text-xs text-text-muted">
                            {(() => {
                              const req = (playbookInputs || []).filter(f => f.required);
                              const done = req.filter(f => (playbookParams[f.key] ?? f.prefill ?? '').trim()).length;
                              return req.length ? `${done} / ${req.length} 个必填入参已填写` : '无必填入参';
                            })()}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          // 审批必填原因校验（剧本配置项）
                          if (selectedPlaybook?.approval_required && !(playbookParams.reason || '').trim()) {
                            setPlaybookValidation({ valid: false, error: '该剧本执行需审批，请填写执行原因' });
                            return;
                          }
                          const validation = validatePlaybookInputs(playbookInputs, playbookParams);
                          if (!validation.valid) {
                            setPlaybookValidation(validation);
                            return;
                          }
                          setPlaybookValidation(undefined);

                          // 是否走审批由剧本配置（approval_required）决定，执行人不可勾选
                          if (selectedPlaybook?.approval_required) {
                            await handleExecutePlaybookWithApproval(selectedPlaybook, playbookParams);
                          } else {
                            await handleExecutePlaybook(selectedPlaybook, playbookParams);
                          }
                        }}
                        disabled={executingPlaybook === selectedPlaybook.id || schemaLoading || !validatePlaybookInputs(playbookInputs, playbookParams).valid}
                        className="w-full mt-2 py-2.5 bg-accent-solid text-white rounded-lg hover:bg-accent-solid-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                      >
                        {executingPlaybook === selectedPlaybook.id ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> 执行中...</>
                        ) : (
                          <><Play className="w-4 h-4" /> {selectedPlaybook?.approval_required ? '提交审批' : '执行剧本'}</>
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}


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
                    <div className="flex items-center justify-between mt-2">
                      <label className="inline-flex items-center gap-1.5 px-2 py-1.5 bg-page-bg border border-border-color rounded-lg cursor-pointer hover:bg-card-bg transition-colors text-xs text-text-secondary">
                        <File className="w-3.5 h-3.5" />
                        附件
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            Promise.all(files.map(f => new Promise<any>((resolve) => {
                              const reader = new FileReader();
                              reader.onload = () => resolve({ name: f.name, size: f.size, type: f.type, data: reader.result as string });
                              reader.readAsDataURL(f);
                            }))).then(results => {
                              setActionAttachments(prev => [...prev, ...results]);
                            });
                            e.target.value = '';
                          }}
                        />
                      </label>
                      {actionAttachments.length > 0 && (
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {actionAttachments.map((att, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-page-bg border border-border-color rounded text-xs text-text-muted">
                              <File className="w-3 h-3" />
                              {att.name.length > 10 ? att.name.substring(0, 10) + '..' : att.name}
                              <button onClick={() => setActionAttachments(prev => prev.filter((_, j) => j !== i))} className="p-0.5 hover:text-danger">
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <span className="text-xs text-text-muted">
                        {actionAttachments.length > 0 ? `${actionAttachments.length} 个文件` : ''}
                      </span>
                      <button
                        onClick={handleAddComment}
                        disabled={!newComment.trim() && actionAttachments.length === 0}
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
                            actionColors[record.action]?.bg || 'bg-surface-3'
                          }`}>
                            <div className={`absolute inset-0.5 rounded-full ${
                              actionColors[record.action]?.bg.replace('/10', '') || 'bg-surface-2'
                            }`} />
                          </div>

                          {/* 记录内容 */}
                          <div className="bg-page-bg/50 rounded-lg p-3 border border-border-color">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                  actionColors[record.action]?.bg || 'bg-surface-3'
                                } ${actionColors[record.action]?.text || 'text-text-muted'}`}>
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
                              <div className="mt-2 p-2 bg-[rgb(4_8_20_/_20%)] rounded text-xs">
                                <div className="flex items-center gap-1 text-warning">
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
                                <CheckCircle className="w-3 h-3 text-success" />
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
    </ContentContainer>
  );
}
