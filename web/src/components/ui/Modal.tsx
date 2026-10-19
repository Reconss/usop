import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/* ==========================================================================
   弹窗外壳 · Modal
   --------------------------------------------------------------------------
   统一遮罩、面板、头部、内容滚动与底部操作区。
   不改变任何业务逻辑，仅提供一致的容器与外层行为。
   ========================================================================== */

export interface ModalProps {
  open: boolean;
  title?: React.ReactNode;
  description?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** 面板宽度（px 或 tailwind 宽度类） */
  width?: number | string;
  /** 点击遮罩是否关闭，默认 true */
  closeOnOverlay?: boolean;
  className?: string;
  bodyClassName?: string;
}

export const Modal: React.FC<ModalProps> = ({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  width = 640,
  closeOnOverlay = true,
  className = '',
  bodyClassName = '',
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="overlay z-overlay flex items-center justify-center p-4"
      onMouseDown={closeOnOverlay ? onClose : undefined}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={['modal-panel w-full', className].filter(Boolean).join(' ')}
        style={{ maxWidth: typeof width === 'number' ? `${width}px` : width, width: '100%' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {(title || description) && (
          <header className="modal-header">
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold text-text-primary truncate-1">{title}</h3>
              {description && (
                <p className="mt-0.5 text-caption text-text-muted">{description}</p>
              )}
            </div>
            <button
              type="button"
              aria-label="关闭"
              onClick={onClose}
              className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-3 hover:text-text-primary"
            >
              <X size={16} />
            </button>
          </header>
        )}

        <div className={['modal-body scrollbar-thin', bodyClassName].filter(Boolean).join(' ')}>
          {children}
        </div>

        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  );
};

export default Modal;
