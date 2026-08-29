'use client';

import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { axisProps, colourFor, gridProps } from './theme';
import { ChartTooltip } from './tooltip';
import { cn } from '@/lib/utils/cn';
import { formatMetric } from '@/lib/utils/format';

export interface SeriesDefinition {
  key: string;
  label: string;
  unit: string;
}

export interface PerformancePoint {
  period: string;
  [seriesKey: string]: string | number;
}

export type ChartShape = 'area' | 'line' | 'bar';

/**
 * The Command Centre's performance chart.
 *
 * Period filtering happens here rather than on the server: the full series is
 * already in the payload, and re-slicing it locally makes the control feel
 * instant instead of costing a round trip per click.
 */
export function PerformanceChart({
  data,
  series,
  currency = 'ZAR',
  shape = 'area',
  periods,
  height = 260,
  className,
}: {
  data: PerformancePoint[];
  series: SeriesDefinition[];
  currency?: string;
  shape?: ChartShape;
  /** Selectable window lengths, in periods. Omit for no control. */
  periods?: { label: string; count: number }[];
  height?: number;
  className?: string;
}) {
  const [windowSize, setWindowSize] = useState<number | null>(null);

  const visible = useMemo(
    () => (windowSize === null ? data : data.slice(-windowSize)),
    [data, windowSize],
  );

  const unit = series[0]?.unit ?? 'count';
  const format = (value: number) => formatMetric(value, unit, currency);

  const Chart = shape === 'line' ? LineChart : shape === 'bar' ? BarChart : AreaChart;

  return (
    <div className={className}>
      {periods && periods.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-1" role="group" aria-label="Chart period">
          {periods.map((p) => {
            const active = windowSize === p.count;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => setWindowSize(active ? null : p.count)}
                aria-pressed={active}
                className={cn(
                  'rounded-[var(--radius-pill)] px-2.5 py-1 font-mono text-[0.6875rem] tracking-wide uppercase transition-colors',
                  active
                    ? 'bg-[var(--brand)] text-[var(--on-brand)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--card-inset)]',
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <Chart data={visible} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
            <defs>
              {series.map((s, i) => (
                <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colourFor(i)} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={colourFor(i)} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>

            <CartesianGrid {...gridProps} />
            <XAxis dataKey="period" {...axisProps} minTickGap={24} />
            <YAxis {...axisProps} width={54} tickFormatter={format} />
            <Tooltip
              cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }}
              content={<ChartTooltip formatter={(v) => format(v)} />}
            />

            {series.map((s, i) =>
              shape === 'bar' ? (
                <Bar key={s.key} dataKey={s.key} name={s.label} fill={colourFor(i)} radius={[3, 3, 0, 0]} />
              ) : shape === 'line' ? (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={colourFor(i)}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3.5 }}
                />
              ) : (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={colourFor(i)}
                  strokeWidth={2}
                  fill={`url(#fill-${s.key})`}
                  activeDot={{ r: 3.5 }}
                />
              ),
            )}
          </Chart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
