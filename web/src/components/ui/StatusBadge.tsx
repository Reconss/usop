import React from 'react';

/* ==========================================================================
   状态徽标 · StatusBadge
   --------------------------------------------------------------------------
   严重级别 / 处置状态 / 通用语义 三合一的展示组件。
   同一含义在所有页面必须是同一种颜色，禁止各页自定义。
   ========================================================================== */

export type BadgeTone =
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'primary'
  | 'accent'
  | 'neutral';

const TONE_CLS: Record<BadgeTone, string> = {
  critical: 'badge-critical',
  high: 'badge-high',
  medium: 'badge-medium',
  low: 'badge-low',
  success: 'badge-success',
  warning:
    'bg-warning/14 text-warning border-warning/25',
  danger: 'bg-danger/14 text-danger border-danger/25',
  info: 'bg-info/14 text-info border-info/25',
  primary: 'bg-primary/14 text-primary border-primary/25',
  accent: 'bg-accent/14 text-accent border-accent/25',
  neutral: 'badge-neutral',
};

export interface StatusBadgeProps {
  tone?: BadgeTone;
  children: React.ReactNode;
  /** 左侧状态点 */
  dot?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  tone = 'neutral',
  children,
  dot = false,
  icon,
  className = '',
}) => (
  <span className={['badge', TONE_CLS[tone], className].filter(Boolean).join(' ')}>
    {dot && <i className={`status-dot ${tone === 'neutral' ? 'muted' : tone}`} />}
    {icon}
    {children}
  </span>
);

/* ── 严重级别映射（告警 / 事件 / 漏洞共用）────────────── */

/** 英文枚举 → 中文标签，避免同一条链路上中英混排 */
const SEVERITY_LABEL: Record<string, string> = {
  critical: '危急',
  high: '高危',
  medium: '中危',
  low: '低危',
  info: '信息',
};

const SEVERITY_TONE: Record<string, BadgeTone> = {
  critical: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
  危急: 'critical',
  严重: 'critical',
  高危: 'high',
  中危: 'medium',
  低危: 'low',
  信息: 'low',
};

export const SeverityBadge: React.FC<{ severity?: string; className?: string }> = ({
  severity,
  className = '',
}) => {
  const key = String(severity || '').toLowerCase();
  const label = SEVERITY_LABEL[key] || severity || '未知';
  return (
    <StatusBadge tone={SEVERITY_TONE[key] || SEVERITY_TONE[String(severity)] || 'neutral'} dot className={className}>
      {label}
    </StatusBadge>
  );
};

/* ── 处置状态映射 ─────────────────────────────────────── */

const STATUS_TONE: Record<string, BadgeTone> = {
  new: 'info',
  open: 'info',
  pending: 'warning',
  investigating: 'warning',
  processing: 'primary',
  in_progress: 'primary',
  resolved: 'success',
  closed: 'success',
  handled: 'success',
  completed: 'success',
  enabled: 'success',
  active: 'success',
  running: 'success',
  healthy: 'success',
  online: 'success',
  disabled: 'neutral',
  inactive: 'neutral',
  paused: 'neutral',
  stopped: 'neutral',
  offline: 'neutral',
  draft: 'neutral',
  ignored: 'neutral',
  false_positive: 'neutral',
  pending_approval: 'warning',
  failed: 'danger',
  error: 'danger',
  invalid: 'danger',
  blocked: 'danger',
  expired: 'danger',
};

/** 英文状态枚举 → 中文标签（StateBadge 未显式传 label 时使用） */
const STATE_LABEL: Record<string, string> = {
  new: '新建',
  open: '待处置',
  pending: '待处理',
  pending_approval: '待审批',
  investigating: '调查中',
  processing: '处理中',
  in_progress: '进行中',
  running: '运行中',
  completed: '已完成',
  success: '成功',
  resolved: '已解决',
  closed: '已关闭',
  handled: '已处理',
  enabled: '已启用',
  disabled: '已停用',
  active: '启用中',
  inactive: '未启用',
  paused: '已暂停',
  stopped: '已停止',
  draft: '草稿',
  ignored: '已忽略',
  false_positive: '误报',
  healthy: '正常',
  online: '在线',
  offline: '离线',
  failed: '失败',
  error: '异常',
  invalid: '无效',
  blocked: '已阻断',
  expired: '已过期',
  all: '全部',
};

export const StateBadge: React.FC<{
  state?: string;
  label?: string;
  dot?: boolean;
  className?: string;
}> = ({ state, label, dot = true, className = '' }) => {
  const key = String(state || '').toLowerCase();
  return (
    <StatusBadge tone={STATUS_TONE[key] || 'neutral'} dot={dot} className={className}>
      {label || STATE_LABEL[key] || state || '未知'}
    </StatusBadge>
  );
};

export default StatusBadge;
