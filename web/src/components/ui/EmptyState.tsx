import React from 'react';
import { Inbox, LucideIcon } from 'lucide-react';

/* ==========================================================================
   空状态 · EmptyState
   --------------------------------------------------------------------------
   所有列表/表格/图表「无数据」时的统一表现。
   ========================================================================== */

export interface EmptyStateProps {
  icon?: LucideIcon;
  title?: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** 紧凑模式：用于卡片内嵌小区域 */
  compact?: boolean;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Inbox,
  title = '暂无数据',
  description,
  action,
  compact = false,
  className = '',
}) => (
  <div className={['empty-state', compact ? 'py-6' : '', className].filter(Boolean).join(' ')}>
    <Icon size={compact ? 22 : 30} className="text-text-muted opacity-60" />
    <div className="empty-state-title">{title}</div>
    {description && <div className="empty-state-desc">{description}</div>}
    {action && <div className="mt-2">{action}</div>}
  </div>
);

export default EmptyState;
