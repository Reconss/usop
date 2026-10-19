import React from 'react';
import { Loader2 } from 'lucide-react';

/* ==========================================================================
   加载 · LoadingState
   --------------------------------------------------------------------------
   统一加载表现，避免各页面各写一套 spinner。
   ========================================================================== */

export interface LoadingStateProps {
  label?: string;
  /** 骨架屏行数（表格场景更平滑） */
  skeletonRows?: number;
  className?: string;
  inline?: boolean;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  label = '加载中…',
  skeletonRows = 0,
  className = '',
  inline = false,
}) => {
  if (skeletonRows > 0) {
    return (
      <div className={['space-y-2', className].filter(Boolean).join(' ')}>
        {Array.from({ length: skeletonRows }).map((_, i) => (
          <div key={i} className="skeleton h-9 w-full" style={{ opacity: 1 - i * 0.08 }} />
        ))}
      </div>
    );
  }

  if (inline) {
    return (
      <span className={['inline-flex items-center gap-2 text-label text-text-muted', className].join(' ')}>
        <Loader2 size={14} className="animate-spin" />
        {label}
      </span>
    );
  }

  return (
    <div
      className={['flex flex-col items-center justify-center gap-3 py-12', className]
        .filter(Boolean)
        .join(' ')}
    >
      <Loader2 size={22} className="text-primary animate-spin" />
      <span className="text-label text-text-muted">{label}</span>
    </div>
  );
};

export default LoadingState;
