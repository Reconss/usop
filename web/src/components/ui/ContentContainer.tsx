import React from 'react';

/* ==========================================================================
   内容容器 · ContentContainer
   --------------------------------------------------------------------------
   页面根容器。统一页面内边距、最大宽度与纵向节奏。
   页面内**不要再写** p-6 / max-w-6xl mx-auto，交给它。
   ========================================================================== */

export interface ContentContainerProps {
  children: React.ReactNode;
  /** 表单类页面可用 form 宽度收敛（880px） */
  width?: 'default' | 'form' | 'full';
  className?: string;
}

const WIDTH_CLS: Record<NonNullable<ContentContainerProps['width']>, string> = {
  default: '',
  form: 'max-w-[880px]',
  full: 'max-w-none',
};

export const ContentContainer: React.FC<ContentContainerProps> = ({
  children,
  width = 'default',
  className = '',
}) => (
  <div className={['app-page', WIDTH_CLS[width], className].filter(Boolean).join(' ')}>
    {children}
  </div>
);

export default ContentContainer;
