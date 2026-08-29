import { Card } from '@/components/ui/card';
import { HealthRadar } from '@/components/charts/health-radar';
import { HEALTH_CLASSIFICATION_LABELS, type HealthScoreResult } from '@/lib/engines/health-score';
import { EmptyState } from '@/components/ui/states';
import { cn } from '@/lib/utils/cn';
import { formatDelta, humanise } from '@/lib/utils/format';

/**
 * Business Health (specification §18).
 *
 * The score is a big number because it is the one thing an executive reads
 * first — but it is never shown alone. The radar and the category bars sit
 * beside it so that "82" always comes with what is holding it up.
 */
export function HealthCard({
  health,
  changePoints,
  className,
}: {
  health: HealthScoreResult | null;
  changePoints?: number | null;
  className?: string;
}) {
  if (!health || health.categories.length === 0) {
    return (
      <Card className={className}>
        <EmptyState
          title="No health score yet"
          description="Connect a data source and define at least one metric with a target. Your AI DigitalTwin® needs something to measure before it can score anything."
        />
      </Card>
    );
  }

  const tone =
    health.score >= 75
      ? 'text-[var(--positive)]'
      : health.score >= 60
        ? 'text-[var(--warning)]'
        : 'text-[var(--negative)]';

  return (
    <Card className={cn('flex h-full flex-col p-5', className)}>
      <p className="eyebrow">Business health</p>

      <div className="mt-3 flex items-baseline gap-3">
        <span className={cn('numeric text-[3.25rem] leading-none font-semibold', tone)}>
          {Math.round(health.score)}
        </span>
        <div className="min-w-0">
          <p className="text-[0.875rem] font-medium text-[var(--text-primary)]">
            {HEALTH_CLASSIFICATION_LABELS[health.classification]}
          </p>
          {changePoints !== null && changePoints !== undefined ? (
            <p
              className={cn(
                'numeric text-[0.75rem]',
                changePoints > 0
                  ? 'text-[var(--positive)]'
                  : changePoints < 0
                    ? 'text-[var(--negative)]'
                    : 'text-[var(--text-tertiary)]',
              )}
            >
              {formatDelta(changePoints, 1).replace('%', '')} points on last period
            </p>
          ) : (
            <p className="text-[0.75rem] text-[var(--text-tertiary)]">First scored period</p>
          )}
        </div>
      </div>

      <HealthRadar categories={health.categories} />

      <ul className="mt-2 space-y-2">
        {health.categories.map((category) => (
          <li key={category.category}>
            <div className="flex items-baseline justify-between gap-2 text-[0.75rem]">
              <span className="text-[var(--text-secondary)]">{humanise(category.category)}</span>
              <span className="numeric font-medium text-[var(--text-primary)]">
                {Math.round(category.score)}
              </span>
            </div>
            <div
              className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--card-inset)]"
              role="img"
              aria-label={`${humanise(category.category)} health ${Math.round(category.score)} out of 100`}
            >
              <div
                className="h-full rounded-full bg-[var(--brand)] transition-[width] duration-500 ease-out"
                style={{ width: `${Math.max(2, Math.min(100, category.score))}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      {health.missingCategories.length > 0 ? (
        <p className="mt-4 border-t border-[var(--border)] pt-3 text-[0.6875rem] leading-relaxed text-[var(--text-tertiary)]">
          Not yet scored: {health.missingCategories.map(humanise).join(', ').toLowerCase()}. The
          score is weighted across what it can see.
        </p>
      ) : null}
    </Card>
  );
}
