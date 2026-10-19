import React from 'react';
import { LucideIcon } from 'lucide-react';

/* ==========================================================================
   分段控件 · Segmented
   --------------------------------------------------------------------------
   替代各页面自发实现的「一组小按钮切换当前视图 / 时间范围」。
   ========================================================================== */

export interface SegmentedItem<T extends string | number = string> {
  value: T;
  label: React.ReactNode;
  icon?: LucideIcon;
  hint?: string;
}

export interface SegmentedProps<T extends string | number = string> {
  items: SegmentedItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}

export function Segmented<T extends string | number = string>({
  items,
  value,
  onChange,
  className = '',
  size = 'md',
}: SegmentedProps<T>) {
  return (
    <div className={['segmented', className].filter(Boolean).join(' ')} role="tablist">
      {items.map((it) => {
        const active = it.value === value;
        const Icon = it.icon;
        return (
          <button
            key={String(it.value)}
            type="button"
            role="tab"
            aria-selected={active}
            title={it.hint}
            onClick={() => onChange(it.value)}
            className={[
              'segmented-item',
              active ? 'is-active' : '',
              size === 'sm' ? 'h-6 px-2.5 text-[11px]' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {Icon && <Icon size={size === 'sm' ? 12 : 13} />}
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

export default Segmented;
