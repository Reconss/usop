/**
 * 共享弹窗与提示组件 — 替代浏览器原生 confirm/alert
 * - ConfirmDialog + useConfirmDialog：应用内确认弹窗（深色主题，danger 高危红样式）
 * - Toasts + useToasts：轻量页内通知（替代 alert）
 */
import { useCallback, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

// ==================== 确认弹窗 ====================

export interface ConfirmOptions {
  title?: string;
  message: string;
  danger?: boolean;
  confirmText?: string;
  cancelText?: string;
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
  resolve?: (v: boolean) => void;
}

export function useConfirmDialog(defaultTitle = '确认操作') {
  const [state, setState] = useState<ConfirmState>({ open: false, message: '' });
  const stateRef = useRef(state);
  stateRef.current = state;

  const ask = useCallback((opts: ConfirmOptions | string): Promise<boolean> => {
    const o: ConfirmOptions = typeof opts === 'string' ? { message: opts } : opts;
    return new Promise<boolean>((resolve) => {
      setState({ ...o, title: o.title || defaultTitle, open: true, resolve });
    });
  }, [defaultTitle]);

  const settle = (v: boolean) => {
    stateRef.current.resolve?.(v);
    setState((s) => ({ ...s, open: false, resolve: undefined }));
  };

  const confirmProps = {
    open: state.open,
    title: state.title,
    message: state.message,
    danger: state.danger,
    confirmText: state.confirmText,
    cancelText: state.cancelText,
    onConfirm: () => settle(true),
    onCancel: () => settle(false),
  };

  return { ask, confirmProps };
}

export function ConfirmDialog({ open, title, message, danger, confirmText, cancelText, onConfirm, onCancel }: {
  open: boolean;
  title?: string;
  message: string;
  danger?: boolean;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgb(4_8_20_/_60%)]" onClick={onCancel}>
      <div className="w-[420px] max-w-[92vw] rounded-card bg-card-bg border border-border-color p-5 shadow-panel"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <div className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${
            danger ? 'bg-danger/15' : 'bg-primary/15'}`}>
            <AlertTriangle className={`w-5 h-5 ${danger ? 'text-danger' : 'text-primary'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-text-primary">{title}</h3>
            <p className="mt-1.5 text-sm text-text-secondary whitespace-pre-line">{message}</p>
          </div>
          <button onClick={onCancel} className="p-1 rounded hover:bg-white/10 text-text-muted">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel}
            className="px-4 py-1.5 text-sm rounded-lg border border-border-color text-text-secondary hover:text-text-primary">
            {cancelText || '取消'}
          </button>
          <button onClick={onConfirm} autoFocus
            className={`px-4 py-1.5 text-sm rounded-lg text-white ${
              danger ? 'bg-danger-solid hover:bg-danger-solid-hover' : 'bg-primary hover:bg-primary-hover'}`}>
            {confirmText || (danger ? '删除' : '确认')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== 轻量 Toast（替代 alert） ====================

type ToastType = 'success' | 'error' | 'info';
interface ToastItem { id: number; type: ToastType; message: string; }

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const showToast = useCallback((type: ToastType, message: string, duration = 3500) => {
    const id = ++seq.current;
    setToasts((p) => [...p, { id, type, message }]);
    window.setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), duration);
  }, []);

  const toastsProps = { toasts, onClose: (id: number) => setToasts((p) => p.filter((t) => t.id !== id)) };
  return { showToast, toastsProps };
}

const TOAST_ICON: Record<ToastType, any> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};
const TOAST_CLS: Record<ToastType, string> = {
  success: 'text-success',
  error: 'text-danger',
  info: 'text-info',
};

export function Toasts({ toasts, onClose }: { toasts: ToastItem[]; onClose: (id: number) => void }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed top-4 right-4 z-[70] space-y-2">
      {toasts.map((t) => {
        const Icon = TOAST_ICON[t.type];
        return (
          <div key={t.id}
            className="flex items-center gap-2.5 min-w-[260px] max-w-[380px] rounded-lg bg-card-bg border border-border-color px-4 py-3 shadow-panel">
            <Icon className={`w-4 h-4 flex-shrink-0 ${TOAST_CLS[t.type]}`} />
            <span className="flex-1 text-sm text-text-primary">{t.message}</span>
            <button onClick={() => onClose(t.id)} className="p-0.5 rounded text-text-muted hover:text-text-primary">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
