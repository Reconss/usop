import React from 'react';

/* ==========================================================================
   表单字段包装 · Field
   --------------------------------------------------------------------------
   统一 label / 必填 / 说明 / 错误。
   ========================================================================== */

export interface FieldProps {
  label?: React.ReactNode;
  required?: boolean;
  help?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** 跨列（配合 app-form-grid） */
  span?: 1 | 2 | 3;
}

export const Field: React.FC<FieldProps> = ({
  label,
  required = false,
  help,
  error,
  children,
  className = '',
  span = 1,
}) => (
  <div
    className={['min-w-0', span > 1 ? 'col-span-full' : '', className].filter(Boolean).join(' ')}
    style={span > 1 ? { gridColumn: `span ${span}` } : undefined}
  >
    {label && (
      <label className="app-label">
        {label}
        {required && <span className="req">*</span>}
      </label>
    )}
    {children}
    {error ? <div className="app-error-text">{error}</div> : help ? <div className="app-help">{help}</div> : null}
  </div>
);

export default Field;
