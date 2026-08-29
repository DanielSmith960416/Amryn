import { cn } from '@/lib/utils/cn';

/**
 * A sparkline drawn as plain SVG rather than through the charting library.
 *
 * These appear a dozen at a time on the Command Centre. A charting component
 * per tile costs a client bundle and a hydration pass for something that is,
 * in the end, one path — so this stays a server component.
 */
export function Sparkline({
  values,
  colour = 'var(--brand)',
  className,
  strokeWidth = 1.5,
}: {
  values: readonly number[];
  colour?: string;
  className?: string;
  strokeWidth?: number;
}) {
  if (values.length < 2) return null;

  const width = 100;
  const height = 32;
  const pad = strokeWidth;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const points = values.map((value, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });

  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  const last = points[points.length - 1];
  const gradientId = `spark-${Math.abs(hash(values.join(',')))}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('overflow-visible', className)}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colour} stopOpacity="0.18" />
          <stop offset="100%" stopColor={colour} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={colour}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {last ? <circle cx={last[0]} cy={last[1]} r={1.8} fill={colour} vectorEffect="non-scaling-stroke" /> : null}
    </svg>
  );
}

/** Stable id per series, so two sparklines never share a gradient. */
function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) {
    h = (h << 5) - h + value.charCodeAt(i);
    h |= 0;
  }
  return h;
}
