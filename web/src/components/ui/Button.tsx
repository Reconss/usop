import React from 'react';
import { LucideIcon } from 'lucide-react';

/* ==========================================================================
   按钮 · Button
   --------------------------------------------------------------------------
   全平台唯一的按钮实现。变体语义固定：
     primary      主操作（提交/保存/执行），每屏建议唯一
     secondary    次操作（取消/返回/导出）
     ghost        低权重（行内图标操作、更多）
     soft         强调但非主操作（当前筛选态、轻量入口）
     danger       危险实心（删除确认）
     danger-ghost 危险行内（表格里的删除图标）
   ========================================================================== */

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'soft'
  | 'danger'
  | 'danger-ghost';

export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  block?: boolean;
}

const VARIANT_CLS: Record<ButtonVariant, string> = {
  primary: 'app-btn-primary',
  secondary: 'app-btn-secondary',
  ghost: 'app-btn-ghost',
  soft: 'app-btn-soft',
  danger: 'app-btn-danger',
  'danger-ghost': 'app-btn-danger-ghost',
};

const SIZE_CLS: Record<ButtonSize, string> = {
  sm: 'app-btn-sm',
  md: '',
  lg: 'app-btn-lg',
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      icon: Icon,
      iconRight: IconRight,
      loading = false,
      block = false,
      className = '',
      children,
      disabled,
      ...rest
    },
    ref
  ) => {
    const iconSize = size === 'sm' ? 13 : size === 'lg' ? 17 : 15;
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          'app-btn',
          VARIANT_CLS[variant],
          SIZE_CLS[size],
          block ? 'w-full' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      >
        {loading ? (
          <span className="spinner" style={{ width: iconSize, height: iconSize }} />
        ) : (
          Icon && <Icon size={iconSize} />
        )}
        {children}
        {IconRight && !loading && <IconRight size={iconSize} />}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
