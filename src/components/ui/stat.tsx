import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { Card } from './card';

/**
 * The KPI tile — the prototype's row of headline figures, as a component.
 *
 * The value is set in the mono face with tabular figures so a row of tiles
 * aligns on the decimal rather than jittering as the numbers change. That is
 * the difference between a dashboard that reads as an instrument and one that
 * reads as a web page.
 */
export function Stat({
  label,
  value,
  sub,
  tone = 'default',
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'default' | 'positive' | 'warning' | 'negative' | 'brand';
  className?: string;
}) {
  const valueTone = {
    default: 'text-[var(--text-primary)]',
    positive: 'text-[var(--positive)]',
    warning: 'text-[var(--warning)]',
    negative: 'text-[var(--negative)]',
    brand: 'text-[var(--brand)]',
  }[tone];

  return (
    <Card
      className={cn('rounded-[var(--radius-tile)] px-4 py-4', className)}
      tone={tone === 'default' ? 'default' : tone}
    >
      <p className="eyebrow truncate">{label}</p>
      <p className={cn('figure mt-2 text-[1.625rem]', valueTone)}>{value}</p>
      {sub ? (
        <p className="mt-1.5 text-[0.75rem] leading-snug text-[var(--text-secondary)]">{sub}</p>
      ) : null}
    </Card>
  );
}

/** A responsive row of tiles. Density is the point; it stays readable at 320px. */
export function StatGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6',
        className,
      )}
    >
      {children}
    </div>
  );
}
