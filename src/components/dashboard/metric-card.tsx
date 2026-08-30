import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Sparkline } from '@/components/charts/sparkline';
import { cn } from '@/lib/utils/cn';
import { formatDelta } from '@/lib/utils/format';
import type { Enums } from '@/types/database';

/**
 * The KPI tile of the executive row (specification §18).
 *
 * Deliberately opinionated about one thing: a delta is coloured by whether the
 * movement is *good*, not by whether it is up. Operating cost rising 12% is
 * red, and revenue falling 12% is red, and the reader never has to think about
 * which metric they are looking at to know whether to worry.
 */
export interface MetricCardProps {
  label: string;
  value: string;
  changePercent?: number | null;
  direction?: Enums['trend_direction'];
  /** Null when the metric has no natural good direction. */
  favourable?: boolean | null;
  comparison?: string;
  series?: number[];
  footnote?: string;
  className?: string;
}

export function MetricCard({
  label,
  value,
  changePercent,
  direction = 'flat',
  favourable,
  comparison,
  series,
  footnote,
  className,
}: MetricCardProps) {
  const Arrow = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : ArrowRight;

  const deltaColour =
    favourable === null || favourable === undefined
      ? 'text-[var(--text-secondary)]'
      : favourable
        ? 'text-[var(--positive)]'
        : 'text-[var(--negative)]';

  const sparkColour =
    favourable === null || favourable === undefined
      ? 'var(--brand)'
      : favourable
        ? 'var(--positive)'
        : 'var(--negative)';

  return (
    <Card className={cn('flex flex-col justify-between p-4', className)}>
      <div>
        <p className="eyebrow truncate">{label}</p>
        <p className="numeric mt-2 text-[1.75rem] leading-none font-semibold text-[var(--text-primary)]">
          {value}
        </p>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {changePercent !== null && changePercent !== undefined ? (
            <p className={cn('numeric flex items-center gap-1 text-[0.8125rem]', deltaColour)}>
              <Arrow className="size-3.5" aria-hidden />
              {formatDelta(changePercent)}
            </p>
          ) : (
            <p className="text-[0.8125rem] text-[var(--text-tertiary)]">No comparison</p>
          )}
          {comparison ? (
            <p className="mt-0.5 truncate text-[0.6875rem] text-[var(--text-tertiary)]">
              {comparison}
            </p>
          ) : null}
        </div>

        {series && series.length > 1 ? (
          <Sparkline values={series} colour={sparkColour} className="h-8 w-20 shrink-0" />
        ) : null}
      </div>

      {footnote ? (
        <p className="mt-3 border-t border-[var(--border)] pt-2 text-[0.6875rem] text-[var(--text-tertiary)]">
          {footnote}
        </p>
      ) : null}
    </Card>
  );
}
