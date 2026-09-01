import { Badge, HEALTH_TONE } from '@/components/ui/badge';
import type { HealthScore } from '@/lib/intelligence/types';
import { percent, score as fmtScore } from '@/lib/format';

/**
 * The Business Health Score dial, carried over from the marketing site's
 * Command Centre so the two read as one product.
 *
 * Hand-written SVG rather than a chart runtime: it is one arc, and pulling in a
 * charting library to draw a circle would ship kilobytes to draw a circle.
 */
export function HealthDial({ health, size = 148 }: { health: HealthScore; size?: number }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.min(100, Math.max(0, health.overall)) / 100) * circumference;

  const stroke = {
    EXCELLENT: 'var(--positive)',
    HEALTHY: 'var(--positive)',
    STABLE: 'var(--info)',
    WEAK: 'var(--warning)',
    CRITICAL: 'var(--negative)',
  }[health.status];

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          viewBox="0 0 120 120"
          className="size-full -rotate-90"
          role="img"
          aria-label={`Business Health Score ${fmtScore(health.overall)} out of 100 — ${health.status}`}
        >
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="var(--card-inset)"
            strokeWidth="9"
          />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="numeric text-[2rem] leading-none font-semibold text-[var(--text-primary)]">
            {fmtScore(health.overall)}
          </span>
          <span className="numeric text-[0.75rem] text-[var(--text-tertiary)]">/100</span>
        </div>
      </div>
      <Badge tone={HEALTH_TONE[health.status]} className="mt-3">
        {health.status}
      </Badge>
    </div>
  );
}

/**
 * The component breakdown beneath the dial.
 *
 * Each bar carries its weight and, where the figure is a standing assumption
 * rather than a measurement, says so. A composite score whose inputs are hidden
 * is a number an executive has to take on trust; this one can be argued with.
 */
export function HealthBreakdown({ health }: { health: HealthScore }) {
  return (
    <ul className="space-y-2.5">
      {health.components.map((c) => (
        <li key={c.component}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[0.8125rem] text-[var(--text-primary)]">
              {c.component.replace(' Health', '')}
              {!c.derived ? (
                <span
                  className="ml-1.5 text-[0.6875rem] text-[var(--text-tertiary)]"
                  title="A standing assessment, not a measurement from connected data."
                >
                  assumed
                </span>
              ) : null}
            </span>
            <span className="numeric shrink-0 text-[0.8125rem] text-[var(--text-secondary)]">
              {fmtScore(c.rawScore, 0)}
              <span className="text-[var(--text-tertiary)]"> × {percent(c.weight, 0)}</span>
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--card-inset)]">
            <div
              className="h-full rounded-[var(--radius-pill)]"
              style={{
                width: `${Math.min(100, Math.max(0, c.rawScore))}%`,
                background: c.derived ? 'var(--brand)' : 'var(--border-strong)',
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
