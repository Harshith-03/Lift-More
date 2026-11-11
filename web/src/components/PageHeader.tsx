import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import clsx from 'clsx';
import { IconButton } from './ui';

/** Large-title header for tab screens. */
export function PageHeader({ title, subtitle, actions, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={clsx('flex items-end justify-between gap-3 pb-2 pt-5', className)}>
      <div className="min-w-0">
        {subtitle && <p className="text-sm font-medium text-muted">{subtitle}</p>}
        <h1 className="truncate text-[30px] font-extrabold leading-tight tracking-tight">{title}</h1>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  );
}

/** Compact sticky header for full-screen sub-pages. */
export function SubHeader({
  title,
  back = -1,
  onBack,
  actions,
  subtitle,
}: {
  title: ReactNode;
  back?: string | -1;
  /** Custom back handler (e.g. confirm unsaved changes). */
  onBack?: () => void;
  actions?: ReactNode;
  subtitle?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-30 border-b border-line/60 bg-bg/90 pt-safe backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-lg items-center gap-1 px-2">
        <IconButton label="Back" onClick={() => (onBack ? onBack() : back === -1 ? navigate(-1) : navigate(back))}>
          <ChevronLeft className="size-6" aria-hidden />
        </IconButton>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-bold leading-tight">{title}</h1>
          {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
        </div>
        {actions}
      </div>
    </header>
  );
}
