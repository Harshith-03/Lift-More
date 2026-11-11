import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { X } from 'lucide-react';

/** Open sheets, top-most last: only the top one reacts to Escape / traps focus. */
const stack: string[] = [];
let scrollLocks = 0;

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Visually hide the title (still announced). */
  hideTitle?: boolean;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** 'auto' hugs content; 'tall' fills most of the screen (pickers). */
  size?: 'auto' | 'tall';
  className?: string;
}

/** Bottom sheet / dialog that slides up from the bottom. */
export function Sheet(props: SheetProps) {
  if (!props.open || typeof document === 'undefined') return null;
  return createPortal(<SheetPanel {...props} />, document.body);
}

function SheetPanel({ onClose, title, hideTitle, description, children, footer, size = 'auto', className }: SheetProps) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    stack.push(id);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    if (scrollLocks++ === 0) document.documentElement.style.overflow = 'hidden';

    const el = panel.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el;
    first?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
      } else if (e.key === 'Tab' && el) {
        const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
        if (items.length === 0) return;
        const firstEl = items[0]!;
        const lastEl = items[items.length - 1]!;
        if (e.shiftKey && (document.activeElement === firstEl || document.activeElement === el)) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      if (--scrollLocks === 0) document.documentElement.style.overflow = '';
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [id]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 animate-fade-in bg-black/65" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-desc` : undefined}
        tabIndex={-1}
        className={clsx(
          'relative flex w-full max-w-lg animate-sheet-in flex-col rounded-t-[28px] border-t border-line bg-surface outline-none',
          size === 'tall' ? 'h-[92dvh]' : 'max-h-[92dvh]',
          className,
        )}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-surface-3" aria-hidden />
        <header className={clsx('flex shrink-0 items-start gap-2 pl-5 pr-2 pt-2', hideTitle ? 'pb-0' : 'pb-2')}>
          <div className="min-w-0 flex-1 pt-2">
            <h2 id={`${id}-title`} className={clsx('text-lg font-bold leading-tight', hideTitle && 'sr-only')}>
              {title}
            </h2>
            {description && (
              <p id={`${id}-desc`} className="mt-1 text-sm text-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted active:bg-surface-2"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>
        {children != null && (
          <div className={clsx('min-h-0 flex-1 overflow-y-auto overscroll-contain px-5', footer ? 'pb-3' : 'pb-[max(1.25rem,env(safe-area-inset-bottom))]')}>
            {children}
          </div>
        )}
        {footer && (
          <div className="shrink-0 border-t border-line px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>
        )}
      </div>
    </div>
  );
}
