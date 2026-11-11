import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import clsx from 'clsx';
import { fmtNum } from '../lib/format';

export interface NumericInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode'> {
  value: number | null;
  onValueChange: (v: number | null) => void;
  /** Allow decimals (weight, RPE). Integers otherwise (reps, seconds). */
  decimal?: boolean;
  /** Normalise on blur (clamp, round to steps). */
  normalize?: (v: number | null) => number | null;
  maxDecimals?: number;
}

function toText(v: number | null, maxDecimals: number) {
  return v == null || !Number.isFinite(v) ? '' : fmtNum(v, maxDecimals);
}

/**
 * Text input tuned for numbers on phones: numeric keypad, select-on-focus,
 * keeps partial input like "102." while typing, accepts "," as decimal separator.
 */
export function NumericInput({
  value,
  onValueChange,
  decimal = false,
  normalize,
  maxDecimals = 2,
  className,
  onFocus,
  onBlur,
  ...rest
}: NumericInputProps) {
  const [text, setText] = useState(() => toText(value, maxDecimals));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(toText(value, maxDecimals));
  }, [value, maxDecimals]);

  return (
    <input
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      enterKeyHint="done"
      value={text}
      onChange={(e) => {
        const raw = e.target.value.replace(',', '.').replace(/\s/g, '');
        const ok = decimal ? /^\d*\.?\d*$/.test(raw) : /^\d*$/.test(raw);
        if (!ok) return;
        setText(raw);
        if (raw === '' || raw === '.') onValueChange(null);
        else {
          const n = Number(raw);
          if (Number.isFinite(n)) onValueChange(n);
        }
      }}
      onFocus={(e) => {
        focused.current = true;
        const el = e.currentTarget;
        el.select();
        // iOS Safari ignores select() during the focus event
        window.setTimeout(() => {
          if (document.activeElement === el) el.select();
        }, 0);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        focused.current = false;
        const parsed = text === '' || text === '.' ? null : Number(text);
        const current = parsed != null && Number.isFinite(parsed) ? parsed : null;
        const next = normalize ? normalize(current) : current;
        if (next !== current) onValueChange(next);
        setText(toText(next, maxDecimals));
        onBlur?.(e);
      }}
      className={clsx('tabular-nums', className)}
      {...rest}
    />
  );
}
