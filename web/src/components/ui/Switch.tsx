import React from 'react';

/* ==========================================================================
   开关 · Switch
   --------------------------------------------------------------------------
   全平台唯一的开关控件（启用/停用类状态）。
   不要再用 `peer-checked:` 拼装的自定义开关，尺寸与状态在各页保持一致。
   ========================================================================== */

export interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** 尺寸：sm 用于表格行内，md 用于表单 */
  size?: 'sm' | 'md';
  label?: string;
  className?: string;
}

const SIZES = {
  sm: { track: 'h-4 w-7', knob: 'h-3 w-3', shift: 'translate-x-3' },
  md: { track: 'h-5 w-9', knob: 'h-4 w-4', shift: 'translate-x-4' },
};

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  size = 'md',
  label,
  className = '',
}) => {
  const s = SIZES[size];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex shrink-0 items-center rounded-pill border transition-colors',
        s.track,
        checked
          ? 'border-primary bg-primary'
          : 'border-border-strong bg-surface-3',
        disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span
        className={[
          'pointer-events-none ml-0.5 rounded-full bg-white shadow-sm transition-transform duration-150',
          s.knob,
          checked ? s.shift : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  );
};

export default Switch;
