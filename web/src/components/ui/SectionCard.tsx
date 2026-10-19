import React from 'react';
import { LucideIcon } from 'lucide-react';

/* ==========================================================================
   分区卡片 · SectionCard
   --------------------------------------------------------------------------
   全平台唯一卡片容器。标题/说明/操作在 header，内容在 body，操作在 footer。
   不要再在页面里手写 `bg-card-bg border border-border-color rounded-card p-4`。
   ========================================================================== */

export interface SectionCardProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  /** 卡片右上角操作 */
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** 内容是否留白（图表容器常需要）
   *  默认 true；如需自行控制内边距设为 false —— 默认用 `padding` 属性更安全 */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** 无边框模式：内容区自带表格/列表时更利落 */
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
  elevated?: boolean;
  hoverable?: boolean;
}

const PAD_CLS: Record<NonNullable<SectionCardProps['padding']>, string> = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6',
};

export const SectionCard: React.FC<SectionCardProps> = ({
  title,
  description,
  icon: Icon,
  actions,
  footer,
  children,
  padding = 'md',
  flush = false,
  className = '',
  bodyClassName = '',
  elevated = false,
  hoverable = false,
}) => {
  const hasHeader = Boolean(title || description || actions);
  return (
    <section
      className={[
        'app-card',
        hoverable ? 'app-card-hover' : '',
        elevated ? 'shadow-card' : '',
        'overflow-hidden',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {hasHeader && (
        <header className="app-card-header items-center">
          <div className="min-w-0">
            {(title || Icon) && (
              <h2 className="app-card-title">
                {Icon && <Icon size={15} className="text-primary shrink-0" />}
                <span className="truncate-1">{title}</span>
              </h2>
            )}
            {description && <p className="app-card-desc">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0 flex-wrap">{actions}</div>}
        </header>
      )}

      <div
        className={[flush ? '' : PAD_CLS[padding], bodyClassName]
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </div>

      {footer && <footer className="app-card-footer">{footer}</footer>}
    </section>
  );
};

export default SectionCard;
