import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { Sheet } from './Sheet';
import { Button } from './ui';

// ───────────── Toasts ─────────────

type Tone = 'info' | 'success' | 'error';
interface Toast {
  id: number;
  message: ReactNode;
  tone: Tone;
}

interface ToastApi {
  show: (message: ReactNode, opts?: { tone?: Tone; durationMs?: number }) => void;
  success: (message: ReactNode) => void;
  error: (message: ReactNode) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast outside ToastProvider');
  return ctx;
}

// ───────────── Confirm ─────────────

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}
type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm outside FeedbackProvider');
  return ctx;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback<ToastApi['show']>(
    (message, opts = {}) => {
      const id = nextId.current++;
      const tone = opts.tone ?? 'info';
      setToasts((t) => [...t.slice(-2), { id, message, tone }]);
      window.setTimeout(() => dismiss(id), opts.durationMs ?? (tone === 'error' ? 6000 : 3500));
    },
    [dismiss],
  );

  const toastApi = useMemo<ToastApi>(
    () => ({ show, success: (m) => show(m, { tone: 'success' }), error: (m) => show(m, { tone: 'error' }) }),
    [show],
  );

  // confirm dialog state
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback<ConfirmFn>(
    (opts) => new Promise<boolean>((resolve) => setPending({ ...opts, resolve })),
    [],
  );
  const settle = (v: boolean) => {
    pending?.resolve(v);
    setPending(null);
  };

  return (
    <ToastContext.Provider value={toastApi}>
      <ConfirmContext.Provider value={confirm}>
        {children}
        <Sheet
          open={!!pending}
          onClose={() => settle(false)}
          title={pending?.title ?? ''}
          description={pending?.message}
          footer={
            <div className="flex gap-3">
              <Button variant="secondary" size="lg" block onClick={() => settle(false)} data-autofocus>
                {pending?.cancelLabel ?? 'Cancel'}
              </Button>
              <Button variant={pending?.tone === 'danger' ? 'danger' : 'primary'} size="lg" block onClick={() => settle(true)}>
                {pending?.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
          }
        />
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className={clsx(
                'pointer-events-auto flex w-full max-w-md animate-toast-in items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-medium shadow-2xl shadow-black/40',
                t.tone === 'error' && 'border-danger/40 bg-[color-mix(in_srgb,var(--color-danger)_14%,var(--color-surface))]',
                t.tone === 'success' && 'border-accent-ink/40 bg-[color-mix(in_srgb,var(--color-accent)_12%,var(--color-surface))]',
                t.tone === 'info' && 'border-line bg-surface-2',
              )}
            >
              {t.tone === 'error' ? (
                <TriangleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
              ) : t.tone === 'success' ? (
                <CircleCheck className="mt-0.5 size-5 shrink-0 text-accent-ink" aria-hidden />
              ) : (
                <Info className="mt-0.5 size-5 shrink-0 text-info" aria-hidden />
              )}
              <div className="min-w-0 flex-1 pt-0.5">{t.message}</div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="-m-2 flex size-9 shrink-0 items-center justify-center rounded-full text-muted"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}
