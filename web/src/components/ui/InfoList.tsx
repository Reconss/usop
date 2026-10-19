import React from 'react';

/* ==========================================================================
   信息展示 · InfoList / TableWrap / Panel
   --------------------------------------------------------------------------
   详情页统一「标签 — 值」栅格；列表页统一表格容器。
   ========================================================================== */

export interface InfoItem {
  label: React.ReactNode;
  value: React.ReactNode;
  /** 值是否使用等宽字体（IP、路径、ID、哈希） */
  mono?: boolean;
  /** 跨整行展示 */
  span?: boolean;
}

export interface InfoListProps {
  items: InfoItem[];
  columns?: number;
  className?: string;
}

export const InfoList: React.FC<InfoListProps> = ({ items, columns, className = '' }) => (
  <div
    className={['info-grid', className].filter(Boolean).join(' ')}
    style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
  >
    {items.map((it, i) => (
      <div key={i} className={it.span ? 'col-span-full min-w-0' : 'min-w-0'}>
        <div className="info-item-label">{it.label}</div>
        <div className={`info-item-value ${it.mono ? 'font-mono text-[12px]' : ''}`}>
          {it.value === '' || it.value === null || it.value === undefined ? (
            <span className="text-text-muted">—</span>
          ) : (
            it.value
          )}
        </div>
      </div>
    ))}
  </div>
);

export interface TableWrapProps {
  children: React.ReactNode;
  /** 最大高度，超出后表头吸顶滚动 */
  maxHeight?: string | number;
  className?: string;
}

export const TableWrap: React.FC<TableWrapProps> = ({ children, maxHeight, className = '' }) => (
  <div
    className={['table-wrap scrollbar-thin', className].filter(Boolean).join(' ')}
    style={maxHeight ? { maxHeight } : undefined}
  >
    {children}
  </div>
);

export default InfoList;
