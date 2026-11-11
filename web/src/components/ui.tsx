import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';
import { ChevronDown, LoaderCircle } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent font-semibold active:brightness-95 disabled:opacity-50',
  secondary: 'bg-surface-2 text-ink font-medium active:bg-surface-3 disabled:opacity-50',
  outline: 'border border-line text-ink font-medium active:bg-surface-2 disabled:opacity-50',
  ghost: 'text-ink font-medium active:bg-surface-2 disabled:opacity-40',
  danger: 'bg-danger-soft text-danger font-semibold active:brightness-110 disabled:opacity-50',
};
const SIZES: Record<Size, string> = {
  sm: 'min-h-11 px-3 text-sm gap-1.5 rounded-xl',
  md: 'min-h-12 px-4 text-[15px] gap-2 rounded-2xl',
  lg: 'min-h-14 px-5 text-base gap-2 rounded-2xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', block, loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        'inline-flex select-none items-center justify-center whitespace-nowrap transition-[filter,background-color,transform] active:scale-[0.98]',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  tone?: 'default' | 'accent' | 'danger' | 'muted';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, tone = 'default', className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors active:bg-surface-3 disabled:opacity-40',
        tone === 'accent' && 'text-accent-ink',
        tone === 'danger' && 'text-danger',
        tone === 'muted' && 'text-muted',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

export function Card({ className, children, as: As = 'section' }: { className?: string; children: ReactNode; as?: 'section' | 'div' | 'article' | 'li' }) {
  return <As className={clsx('rounded-[var(--radius-card)] border border-line/60 bg-surface', className)}>{children}</As>;
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx('mb-2 mt-6 flex min-h-8 items-center justify-between gap-2', className)}>
      <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">{children}</h2>
      {action}
    </div>
  );
}

export function Chip({
  selected,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={clsx(
        'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors',
        selected ? 'border-transparent bg-accent text-on-accent' : 'border-line bg-surface-2 text-ink active:bg-surface-3',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Badge({ tone = 'neutral', className, children }: { tone?: 'neutral' | 'accent' | 'warn' | 'danger' | 'info'; className?: string; children: ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        tone === 'neutral' && 'bg-surface-2 text-muted',
        tone === 'accent' && 'bg-accent-soft text-accent-ink',
        tone === 'warn' && 'bg-warn-soft text-warn',
        tone === 'danger' && 'bg-danger-soft text-danger',
        tone === 'info' && 'bg-info-soft text-info',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode }>;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={clsx('flex rounded-2xl bg-surface-2 p-1', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={clsx(
              'min-h-11 flex-1 rounded-xl px-3 text-sm font-semibold transition-colors',
              active ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton rounded-xl', className)} aria-hidden />;
}

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return <LoaderCircle className={clsx('size-6 animate-spin text-muted', className)} aria-label={label} role="status" />;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('flex flex-col items-center px-6 py-10 text-center', className)}>
      {icon && <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-muted">{icon}</div>}
      <p className="text-base font-semibold">{title}</p>
      {body && <p className="mt-1 max-w-xs text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ───────────── Form fields ─────────────

const inputBase =
  'w-full min-h-12 rounded-2xl border border-line bg-surface-2 px-4 text-[16px] text-ink placeholder:text-faint outline-none transition-colors focus:border-accent-ink aria-[invalid=true]:border-danger';

interface FieldShellProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  hideLabel?: boolean;
}

function FieldShell({ id, label, hint, error, className, hideLabel, children }: FieldShellProps & { id: string; children: ReactNode }) {
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className={clsx('text-sm font-medium text-muted', hideLabel && 'sr-only')}>
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-err`} className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const TextField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldShellProps>(
  function TextField({ label, hint, error, className, hideLabel, id, ...rest }, ref) {
    const auto = useId();
    const fid = id ?? auto;
    return (
      <FieldShell id={fid} label={label} hint={hint} error={error} className={className} hideLabel={hideLabel}>
        <input
          ref={ref}
          id={fid}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${fid}-err` : hint ? `${fid}-hint` : undefined}
          className={inputBase}
          {...rest}
        />
      </FieldShell>
    );
  },
);

export function TextAreaField({ label, hint, error, className, hideLabel, id, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & FieldShellProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell id={fid} label={label} hint={hint} error={error} className={className} hideLabel={hideLabel}>
      <textarea id={fid} aria-invalid={!!error || undefined} className={clsx(inputBase, 'min-h-24 py-3 leading-snug')} {...rest} />
    </FieldShell>
  );
}

export function SelectField({
  label,
  hint,
  error,
  className,
  hideLabel,
  id,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & FieldShellProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell id={fid} label={label} hint={hint} error={error} className={className} hideLabel={hideLabel}>
      <div className="relative">
        <select id={fid} className={clsx(inputBase, 'appearance-none pr-10')} {...rest}>
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3.5 size-5 -translate-y-1/2 text-faint" aria-hidden />
      </div>
    </FieldShell>
  );
}

/** − value + stepper for small integers (sets, days per week). */
export function Stepper({
  value,
  onChange,
  min,
  max,
  label,
  format = String,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  label: string;
  format?: (v: number) => string;
  className?: string;
}) {
  return (
    <div className={clsx('flex items-center gap-1 rounded-2xl bg-surface-2 p-1', className)} role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex size-11 items-center justify-center rounded-xl text-xl font-semibold active:bg-surface-3 disabled:opacity-30"
      >
        −
      </button>
      <output className="min-w-10 flex-1 text-center text-base font-semibold" aria-live="polite">
        {format(value)}
      </output>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="flex size-11 items-center justify-center rounded-xl text-xl font-semibold active:bg-surface-3 disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}

export function ListButton({
  icon,
  label,
  description,
  trailing,
  tone = 'default',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  label: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  tone?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      className={clsx(
        'flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors active:bg-surface-2 disabled:opacity-40',
        tone === 'danger' && 'text-danger',
        className,
      )}
      {...rest}
    >
      {icon && <span className={clsx('flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2', tone === 'danger' ? 'text-danger' : 'text-muted')}>{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{label}</span>
        {description && <span className="block truncate text-sm text-muted">{description}</span>}
      </span>
      {trailing}
    </button>
  );
}
