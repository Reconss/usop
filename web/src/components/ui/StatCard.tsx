import React from 'react';
import { LucideIcon } from 'lucide-react';

/* ==========================================================================
   统计卡片 · StatCard
   --------------------------------------------------------------------------
   数据分析类页面的指标单元。语义色 tone 统一：
     primary 强调 / success 正常 / warning 需关注 / danger 异常
     info 参考信息 / accent 次级强调 / neutral 中性
   ========================================================================== */

export type StatTone =
  | 'neutral'
  | 'primary'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

const TONE_ICON: Record<StatTone, string> = {
  neutral: 'bg-surface-3 text-text-secondary border-border-color',
  primary: 'bg-primary/12 text-primary border-primary/25',
  accent: 'bg-accent/12 text-accent border-accent/25',
  success: 'bg-success/12 text-success border-success/25',
  warning: 'bg-warning/12 text-warning border-warning/25',
  danger: 'bg-danger/12 text-danger border-danger/25',
  info: 'bg-info/12 text-info border-info/25',
};

const TONE_VALUE: Record<StatTone, string> = {
  neutral: 'text-text-primary',
  primary: 'text-text-primary',
  accent: 'text-text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-text-primary',
};

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  unit?: string;
  icon?: LucideIcon;
  tone?: StatTone;
  /** 数值下方的辅助说明 */
  hint?: React.ReactNode;
  /** 环比/同比趋势（正数上升，负数下降） */
  trend?: number;
  trendLabel?: string;
  onClick?: () => void;
  loading?: boolean;
  /** 顶部强调条，用于「最重要指标」的视觉优先级 */
  emphasize?: boolean;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  unit,
  icon: Icon,
  tone = 'neutral',
  hint,
  trend,
  trendLabel = '较上期',
  onClick,
  loading = false,
  emphasize = false,
  className = '',
}) => {
  const hasTrend = typeof trend === 'number' && Number.isFinite(trend);
  // 趋势色：告警/风险类指标上升是坏事（danger），这里只按方向着色，语义由调用方决定
  const trendUp = hasTrend && (trend as number) > 0;
  const TrendIcon = hasTrend ? (trendUp ? '↑' : (trend as number) < 0 ? '↓' : '') : '';

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') onClick();
            }
          : undefined
      }
      className={[
        'app-card app-card-hover relative p-4 overflow-hidden',
        onClick ? 'cursor-pointer' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {emphasize && (
        <span className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-primary to-accent" />
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-label text-text-muted truncate-1">{label}</span>
        {Icon && (
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${TONE_ICON[tone]}`}
          >
            <Icon size={14} />
          </span>
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-1">
        {loading ? (
          <span className="skeleton inline-block h-7 w-16 align-middle" />
        ) : (
          <>
            <span className={`text-metric num ${TONE_VALUE[tone]}`}>{value}</span>
            {unit && <span className="text-label text-text-muted">{unit}</span>}
          </>
        )}
      </div>

      {(hint || hasTrend) && (
        <div className="mt-1.5 flex items-center gap-2 text-caption text-text-muted min-w-0">
          {hasTrend && (
            <span
              className={`num ${
                trendUp ? 'text-danger' : 'text-success'
              }`}
            >
              {TrendIcon} {Math.abs(trend as number)}%
            </span>
          )}
          {hasTrend && <span className="text-text-muted">{trendLabel}</span>}
          {hint && <span className="truncate-1">{hint}</span>}
        </div>
      )}
    </div>
  );
};

export default StatCard;
