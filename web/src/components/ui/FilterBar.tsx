import React from 'react';
import { Search, X } from 'lucide-react';

/* ==========================================================================
   筛选工具条 · FilterBar / SearchInput
   --------------------------------------------------------------------------
   列表页统一顶部工具条：左侧筛选，右侧主操作。
   ========================================================================== */

export interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  /** 宽度档位 */
  width?: 'sm' | 'md' | 'lg' | 'full';
  onClear?: () => void;
}

const SEARCH_WIDTH: Record<NonNullable<SearchInputProps['width']>, string> = {
  sm: 'w-[160px]',
  md: 'w-[220px]',
  lg: 'w-[300px]',
  full: 'w-full',
};

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  width = 'md',
  onClear,
  placeholder = '搜索…',
  className = '',
  ...rest
}) => (
  <div className={['relative', SEARCH_WIDTH[width], className].filter(Boolean).join(' ')}>
    <Search
      size={14}
      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
    />
    <input
      {...rest}
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="app-input pl-8 pr-8"
    />
    {value && (
      <button
        type="button"
        aria-label="清空搜索"
        onClick={() => (onClear ? onClear() : onChange(''))}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-muted hover:text-text-primary"
      >
        <X size={13} />
      </button>
    )}
  </div>
);

export interface FilterBarProps {
  children?: React.ReactNode;
  /** 右侧操作区 */
  actions?: React.ReactNode;
  className?: string;
}

export const FilterBar: React.FC<FilterBarProps> = ({ children, actions, className = '' }) => (
  <div className={['app-toolbar', className].filter(Boolean).join(' ')}>
    {children}
    {actions && <div className="app-toolbar-end">{actions}</div>}
  </div>
);

export default FilterBar;
