import { useMemo } from 'react';
import { useTheme } from '../../lib/hooks';

export interface ChartColors {
  series1: string;
  series2: string;
  grid: string;
  axis: string;
  ink: string;
  surface: string;
}

const FALLBACK: Record<'dark' | 'light', ChartColors> = {
  dark: { series1: '#3987e5', series2: '#d95926', grid: '#262b22', axis: '#6b7464', ink: '#f1f4ed', surface: '#141712' },
  light: { series1: '#2a78d6', series2: '#eb6834', grid: '#e4e8df', axis: '#848c7d', ink: '#11140f', surface: '#ffffff' },
};

/** Resolved chart colours for the active theme (SVG attributes can't use CSS variables reliably). */
export function useChartColors(): ChartColors {
  const [theme] = useTheme();
  return useMemo(() => {
    const fb = FALLBACK[theme];
    if (typeof window === 'undefined') return fb;
    const cs = getComputedStyle(document.documentElement);
    const v = (name: string, f: string) => cs.getPropertyValue(name).trim() || f;
    return {
      series1: v('--color-series-1', fb.series1),
      series2: v('--color-series-2', fb.series2),
      grid: v('--color-grid', fb.grid),
      axis: v('--color-faint', fb.axis),
      ink: v('--color-ink', fb.ink),
      surface: v('--color-surface', fb.surface),
    };
  }, [theme]);
}
