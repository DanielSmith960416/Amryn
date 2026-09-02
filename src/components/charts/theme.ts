/**
 * Chart palette and axis defaults.
 *
 * Charts read their colours from the same CSS variables as everything else, so
 * a theme switch repaints them without a re-render. Recharts needs concrete
 * strings, and `var(--chart-1)` is a valid one — the browser resolves it.
 */
export const CHART_COLOURS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const;

export const CHART_GRID = 'var(--chart-grid)';
export const CHART_AXIS_TEXT = 'var(--text-tertiary)';

export const axisProps = {
  stroke: 'transparent',
  tick: { fill: CHART_AXIS_TEXT, fontSize: 11, fontFamily: 'var(--font-mono)' },
  tickLine: false,
  axisLine: false,
} as const;

export const gridProps = {
  stroke: CHART_GRID,
  strokeDasharray: '0',
  vertical: false,
} as const;

export function colourFor(index: number): string {
  return CHART_COLOURS[index % CHART_COLOURS.length] ?? CHART_COLOURS[0];
}
