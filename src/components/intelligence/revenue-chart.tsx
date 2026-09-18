'use client';

import { useCallback, useId, useRef, useState } from 'react';
import type { MonthDerived } from '@/lib/intelligence/types';
import { compactMoney, money, percent } from '@/lib/format';

/**
 * The trend, as the marketing site's Command Centre draws it.
 *
 * Hand-written SVG, and deliberately so: this is one series, filled beneath
 * where the scale earns it. A charting runtime would ship a few hundred
 * kilobytes to draw a line this page already has the numbers for.
 *
 * Only reported months are plotted. A twelve-point line that flatlines to zero
 * in September would read as a collapse rather than as a year still in progress.
 *
 * ── what it used to withhold ─────────────────────────────────────────────
 * The comment here used to say hover tooltips were not needed because "the
 * figures are in the table below". They are not. The table below this chart on
 * the Digital Twin is the branch table, and on Financial it is a different
 * breakdown again — neither states what any single month earned. So the chart
 * was a shape with its numbers locked inside it: a reader could see revenue
 * rising and could not find out by how much, or from what.
 *
 * ── and what it does now ─────────────────────────────────────────────────
 * A crosshair finds the month nearest the pointer, and the readout states all
 * three measures for it — not only the one being drawn — with the change from
 * the month before. Readers aim at a month, never at a two-pixel line.
 *
 * The three measures are the ones the twin already computes per month. Nothing
 * here derives a figure: switching the line switches which of them is drawn,
 * and the readout shows all three either way.
 */

export type MeasureKey = 'revenue' | 'grossProfit' | 'netProfit';

export const MEASURES: { key: MeasureKey; label: string; of: (m: MonthDerived) => number }[] = [
  { key: 'revenue', label: 'Revenue', of: (m) => m.revenue },
  { key: 'grossProfit', label: 'Gross profit', of: (m) => m.grossProfit },
  { key: 'netProfit', label: 'Net profit', of: (m) => m.netProfit },
];

export interface Band {
  top: number;
  bottom: number;
  /** Where zero sits in the band, or null when the band does not contain it. */
  zero: number | null;
  /**
   * Whether the foot of the plot is the value nought.
   *
   * It is what decides whether the area under the line may be filled. A fill
   * measures from wherever it stops, so a fill stopping at 680,900 tells the
   * reader that 869,000 is several times 742,000 — the trend line says the
   * truth and the shaded region under it says something else, louder.
   */
  baselineIsZero: boolean;
}

/**
 * The vertical band a series is drawn in.
 *
 * Separated out because it is the part that can be quietly wrong. Revenue is
 * never negative and gross profit rarely is, but net profit in a bad month is
 * — and the original clamped the floor to zero, which would have drawn a loss
 * sitting flat on the baseline as though the business had merely broken even.
 *
 * `zero` is where the axis belongs when the band spans it. A chart showing a
 * loss without marking zero is a chart that hides which side of it you are on.
 */
export function bandFor(values: number[]): Band {
  const max = Math.max(...values);
  const min = Math.min(...values);
  // Padded by a tenth of its own range so the line never touches the frame,
  // and a flat series still renders as a line rather than a divide.
  const span = max - min || Math.abs(max) || 1;
  const top = max + span * 0.1;
  // Only clamped at zero when the series never goes below it: a floor of zero
  // under a negative series would put the loss off the bottom of the picture.
  const bottom = min < 0 ? min - span * 0.1 : Math.max(0, min - span * 0.1);
  const zero = bottom < 0 && top > 0 ? 0 : null;
  // Either the band rests on nought, or it crosses it and the fill is cut at
  // the zero line. Both give the shaded region a floor that means something.
  return { top, bottom, zero, baselineIsZero: bottom === 0 || zero !== null };
}

const WIDTH = 640;
const CHART_HEIGHT = 260;
const PAD = { top: 20, right: 8, bottom: 28, left: 8 };

export function RevenueChart({
  months,
  currency,
  height = 240,
}: {
  months: MonthDerived[];
  currency: string;
  height?: number;
}) {
  const points = months.filter((m) => m.revenue !== 0);
  const gradientId = useId();
  const svgRef = useRef<SVGSVGElement>(null);

  const [measureKey, setMeasureKey] = useState<MeasureKey>('revenue');
  const [active, setActive] = useState<number | null>(null);

  /*
   * The pointer's nearest month, from the pointer's position across the
   * element rather than from SVG coordinates. The viewBox is stretched by
   * preserveAspectRatio="none", so a point in user space is not a point on
   * screen — but the months are evenly spaced either way, so the fraction
   * across is all this needs.
   */
  const track = useCallback(
    (clientX: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || points.length === 0) return;
      const fraction = (clientX - rect.left) / rect.width;
      const index = Math.round(fraction * (points.length - 1));
      setActive(Math.min(points.length - 1, Math.max(0, index)));
    },
    [points.length],
  );

  if (points.length < 2) {
    return (
      <p className="py-10 text-center text-[0.8125rem] text-[var(--text-secondary)]">
        At least two reported months are needed to draw a trend.
      </p>
    );
  }

  const measure = MEASURES.find((m) => m.key === measureKey) ?? MEASURES[0]!;
  const values = points.map(measure.of);
  const band = bandFor(values);

  const x = (i: number) => PAD.left + (i / (points.length - 1)) * (WIDTH - PAD.left - PAD.right);
  const y = (value: number) =>
    PAD.top +
    (1 - (value - band.bottom) / (band.top - band.bottom || 1)) *
      (CHART_HEIGHT - PAD.top - PAD.bottom);

  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)} ${y(v)}`).join(' ');
  const floor = band.zero === null ? CHART_HEIGHT - PAD.bottom : y(0);
  const area = `${line} L${x(points.length - 1)} ${floor} L${x(0)} ${floor} Z`;

  const shown = active === null ? points.length - 1 : active;
  const month = points[shown]!;
  const before = shown > 0 ? points[shown - 1] : null;

  return (
    <div>
      {/*
        The measure switch, above the chart rather than inside it.

        Three lines at once would need two scales — revenue and net profit are
        an order of magnitude apart — and a second y-axis is the one thing a
        chart must never have. One at a time, with all three in the readout.
      */}
      <div className="mb-3 flex flex-wrap items-center gap-1">
        {MEASURES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMeasureKey(m.key)}
            aria-pressed={m.key === measureKey}
            className={
              'rounded-[var(--radius-control)] px-2.5 py-1 text-[0.75rem] font-medium transition-colors ' +
              (m.key === measureKey
                ? 'bg-[var(--brand-soft)] text-[var(--brand)]'
                : 'text-[var(--text-tertiary)] hover:bg-[var(--card-inset)] hover:text-[var(--text-secondary)]')
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${CHART_HEIGHT}`}
        style={{ width: '100%', height }}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${measure.label} by month from ${points[0]?.month} to ${points.at(-1)?.month}, ranging ${compactMoney(Math.min(...values), currency)} to ${compactMoney(Math.max(...values), currency)}.`}
        onPointerMove={(event) => track(event.clientX)}
        onPointerLeave={() => setActive(null)}
        className="touch-pan-y"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <g stroke="var(--chart-grid)" strokeWidth="1">
          {[0.25, 0.5, 0.75].map((f) => {
            const gy = PAD.top + f * (CHART_HEIGHT - PAD.top - PAD.bottom);
            return <line key={f} x1="0" y1={gy} x2={WIDTH} y2={gy} />;
          })}
        </g>

        {/* Zero, drawn only when the band crosses it — which is to say only
            when something is negative and the reader needs to see which side
            of the line it is on. */}
        {band.zero !== null ? (
          <line
            x1="0"
            y1={y(0)}
            x2={WIDTH}
            y2={y(0)}
            stroke="var(--text-tertiary)"
            strokeWidth="1"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {/*
          The fill, only where its floor is nought.

          A line whose axis starts just under its own minimum is the ordinary
          way to draw a trend, and it is what this chart has always done — the
          alternative flattens the month-to-month movement the card exists to
          show. But an area fill is read as quantity, and one measured from a
          floor that is not zero overstates every point above it. Revenue
          swinging 20% looked like several times the area.

          So the line keeps its scale and the fill gives way. Where the series
          does rest on nought, or crosses it, the fill is honest and stays.
        */}
        {band.baselineIsZero ? <path d={area} fill={`url(#${gradientId})`} /> : null}
        <path
          d={line}
          fill="none"
          stroke="var(--brand)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          // The path is scaled non-uniformly by preserveAspectRatio, which
          // would otherwise stretch the stroke with it.
          vectorEffect="non-scaling-stroke"
        />

        {/* The crosshair. A hairline rather than a band, because it marks a
            month the reader is already pointing at rather than selecting one. */}
        {active !== null ? (
          <line
            x1={x(active)}
            y1={PAD.top}
            x2={x(active)}
            y2={CHART_HEIGHT - PAD.bottom}
            stroke="var(--brand)"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.5"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        <circle
          cx={x(shown)}
          cy={y(values[shown]!)}
          r={active === null ? 4 : 5.5}
          fill="var(--brand)"
          stroke="var(--card)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="mt-1 flex justify-between text-[0.6875rem] text-[var(--text-tertiary)]">
        {points.map((m, i) => (
          <span
            key={m.month}
            className={
              'font-label ' + (i === shown && active !== null ? 'text-[var(--brand)]' : '')
            }
          >
            {m.month.slice(0, 3)}
          </span>
        ))}
      </div>

      {/*
        The readout. Fixed height so the chart does not jump as the pointer
        moves across it, and present before anyone points at anything — idle it
        is the latest reported month, which is the figure a reader arriving at
        this card wants first.
      */}
      <div className="mt-3 min-h-[4.25rem] border-t border-[var(--border)] pt-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[0.8125rem] font-medium text-[var(--text-primary)]">
            {month.month}
          </span>
          {active === null ? (
            <span className="text-[0.75rem] text-[var(--text-tertiary)]">latest reported</span>
          ) : null}
          {before ? (
            <span
              className={
                'numeric text-[0.75rem] ' +
                (measure.of(month) >= measure.of(before)
                  ? 'text-[var(--positive)]'
                  : 'text-[var(--negative)]')
              }
            >
              {measure.of(month) >= measure.of(before) ? '▲' : '▼'}{' '}
              {money(Math.abs(measure.of(month) - measure.of(before)), currency)} on{' '}
              {before.month.slice(0, 3)}
            </span>
          ) : null}
        </div>

        {/*
          All three, whichever is drawn. Switching the line to read a number
          would make the control a prerequisite for the data rather than a
          choice about the picture.
        */}
        <dl className="mt-1.5 grid grid-cols-3 gap-x-3">
          {MEASURES.map((m) => (
            <div key={m.key}>
              <dt className="text-[0.6875rem] text-[var(--text-tertiary)]">{m.label}</dt>
              <dd
                className={
                  'numeric text-[0.875rem] ' +
                  (m.key === measure.key
                    ? 'font-semibold text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)]')
                }
              >
                {money(m.of(month), currency)}
                {m.key === 'grossProfit' ? (
                  <span className="ml-1 text-[0.6875rem] text-[var(--text-tertiary)]">
                    {percent(month.grossMargin)}
                  </span>
                ) : null}
                {m.key === 'netProfit' ? (
                  <span className="ml-1 text-[0.6875rem] text-[var(--text-tertiary)]">
                    {percent(month.netMargin)}
                  </span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
