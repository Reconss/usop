import React from 'react';
import { LucideIcon } from 'lucide-react';

/* ==========================================================================
   页面标题区 · PageHeader
   --------------------------------------------------------------------------
   所有页面顶部的统一标题结构：标题 + 页面级操作 + 工具条。
   紧凑布局：左信息、右操作，标题 22px/600。导航定位由侧边栏承担，
   不再渲染面包屑与长描述，保持头部轻量。
   ========================================================================== */

export interface PageHeaderProps {
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  /** 页面级主要操作（按钮组） */
  actions?: React.ReactNode;
  /** 标题下方的筛选/搜索工具条 */
  toolbar?: React.ReactNode;
  /** 标题右侧的补充信息（如最后更新时间、状态标记） */
  meta?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  icon: Icon,
  actions,
  toolbar,
  meta,
  className = '',
}) => (
  <div className={['flex flex-col gap-2', className].filter(Boolean).join(' ')}>
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-2.5 min-w-0">
        {Icon && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-card bg-primary/12 border border-primary/25 text-primary">
            <Icon size={16} />
          </div>
        )}
        <div className="min-w-0 flex items-baseline gap-2.5">
          <h1 className="text-page-title text-text-primary truncate-1">{title}</h1>
          {description && (
            <p className="text-label text-text-muted truncate-1">{description}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {meta}
        {actions}
      </div>
    </div>

    {toolbar && <div className="app-toolbar">{toolbar}</div>}
  </div>
);

export default PageHeader;
