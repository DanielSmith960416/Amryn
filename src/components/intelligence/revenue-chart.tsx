import type { MonthDerived } from '@/lib/intelligence/types';
import { compactMoney } from '@/lib/format';

/**
 * The revenue trend, as the marketing site's Command Centre draws it.
 *
 * Hand-written SVG, and deliberately so: this is one series with a filled area
 * beneath it, rendered on the server as part of the page. A charting runtime
 * would make it a client component, ship a few hundred kilobytes, and buy
 * hover tooltips the page does not need — the figures are in the table below.
 *
 * Only reported months are plotted. A twelve-point line that flatlines to zero
 * in September would read as a collapse rather than as a year still in progress.
 */
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

  if (points.length < 2) {
    return (
      <p className="py-10 text-center text-[0.8125rem] text-[var(--text-secondary)]">
        At least two reported months are needed to draw a trend.
      </p>
    );
  }

  const width = 640;
  const chartHeight = 260;
  const pad = { top: 20, right: 8, bottom: 28, left: 8 };

  const values = points.map((m) => m.revenue);
  const max = Math.max(...values);
  const min = Math.min(...values);
  // The band is padded by a tenth of its own range so the line never touches
  // the frame, and a flat series still renders as a line rather than a divide.
  const span = max - min || max || 1;
  const top = max + span * 0.1;
  const bottom = Math.max(0, min - span * 0.1);

  const x = (i: number) =>
    pad.left + (i / (points.length - 1)) * (width - pad.left - pad.right);
  const y = (value: number) =>
    pad.top +
    (1 - (value - bottom) / (top - bottom || 1)) * (chartHeight - pad.top - pad.bottom);

  const line = points.map((m, i) => `${i === 0 ? 'M' : 'L'}${x(i)} ${y(m.revenue)}`).join(' ');
  const baseline = chartHeight - pad.bottom;
  const area = `${line} L${x(points.length - 1)} ${baseline} L${x(0)} ${baseline} Z`;
  const last = points.at(-1);

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${chartHeight}`}
        style={{ width: '100%', height }}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Monthly revenue from ${points[0]?.month} to ${last?.month}, ranging ${compactMoney(min, currency)} to ${compactMoney(max, currency)}.`}
      >
        <defs>
          <linearGradient id="amryn-revenue-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <g stroke="var(--chart-grid)" strokeWidth="1">
          {[0.25, 0.5, 0.75].map((f) => {
            const gy = pad.top + f * (chartHeight - pad.top - pad.bottom);
            return <line key={f} x1="0" y1={gy} x2={width} y2={gy} />;
          })}
        </g>

        <path d={area} fill="url(#amryn-revenue-fade)" />
        <path
          d={line}
          fill="none"
          stroke="var(--brand)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          // The path is scaled non-uniformly by preserveAspectRatio, which would
          // otherwise stretch the stroke with it.
          vectorEffect="non-scaling-stroke"
        />
        {last ? (
          <circle
            cx={x(points.length - 1)}
            cy={y(last.revenue)}
            r="4"
            fill="var(--brand)"
            stroke="var(--card)"
            strokeWidth="2"
          />
        ) : null}
      </svg>

      <div className="mt-1 flex justify-between text-[0.6875rem] text-[var(--text-tertiary)]">
        {points.map((m) => (
          <span key={m.month} className="font-mono">
            {m.month.slice(0, 3)}
          </span>
        ))}
      </div>
    </div>
  );
}
