import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { requirePermission } from '@/lib/auth/session';
import { buildBusinessContext } from '@/features/intelligence/context';
import { cn } from '@/lib/utils/cn';
import { formatDate, formatMetric, humanise } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Goals' };

/** Goals, with progress measured from baseline rather than from zero. */
export default async function GoalsPage() {
  const workspace = await requirePermission('view_goals');
  const context = await buildBusinessContext(workspace);
  const currency = context.organisation.currencyCode;

  const atRisk = context.goals.filter((goal) => goal.status === 'at_risk');

  return (
    <>
      <PageHeader
        eyebrow={context.organisation.name}
        title="Goals"
        description="Progress is measured from where you started, not from zero — a goal that began at 80% of target should not read as 80% achieved."
      />

      {context.goals.length === 0 ? (
        <Card>
          <EmptyState
            title="No goals set"
            description="Set a goal against a metric and Amryn will track progress towards it, and raise it in the briefing when it starts slipping."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {atRisk.length > 0 ? (
            <Card tone="warning">
              <div className="px-5 py-4">
                <p className="text-[0.9375rem] leading-relaxed text-[var(--text-primary)]">
                  <strong>
                    {atRisk.length} {atRisk.length === 1 ? 'goal is' : 'goals are'} at risk.
                  </strong>{' '}
                  {atRisk
                    .map((goal) => `${goal.title} (${goal.daysRemaining} days left)`)
                    .join(', ')}
                  .
                </p>
              </div>
            </Card>
          ) : null}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {context.goals.map((goal) => (
              <Card key={goal.id}>
                <CardHeader
                  title={goal.title}
                  subtitle={`Due ${formatDate(goal.dueOn)} · ${goal.daysRemaining} days remaining`}
                  actions={
                    <Badge
                      tone={
                        goal.status === 'at_risk'
                          ? 'warning'
                          : goal.status === 'achieved'
                            ? 'positive'
                            : goal.status === 'missed'
                              ? 'negative'
                              : 'outline'
                      }
                    >
                      {humanise(goal.status)}
                    </Badge>
                  }
                />
                <div className="px-5 pb-5">
                  <div className="mb-2 flex items-baseline justify-between gap-2 text-[0.8125rem]">
                    <span className="text-[var(--text-secondary)]">
                      {formatMetric(goal.current, goal.unit, currency)} of{' '}
                      {formatMetric(goal.target, goal.unit, currency)}
                    </span>
                    <span className="numeric font-medium text-[var(--text-primary)]">
                      {Math.round(goal.progress * 100)}%
                    </span>
                  </div>

                  <div
                    className="h-2 overflow-hidden rounded-full bg-[var(--card-inset)]"
                    role="img"
                    aria-label={`${Math.round(goal.progress * 100)} per cent of the way to target`}
                  >
                    <div
                      className={cn(
                        'h-full rounded-full transition-[width] duration-500 ease-out',
                        goal.status === 'at_risk'
                          ? 'bg-[var(--warning)]'
                          : goal.status === 'achieved'
                            ? 'bg-[var(--positive)]'
                            : 'bg-[var(--brand)]',
                      )}
                      style={{ width: `${Math.max(2, goal.progress * 100)}%` }}
                    />
                  </div>

                  {goal.baseline !== null ? (
                    <p className="mt-2 text-[0.75rem] text-[var(--text-tertiary)]">
                      Started at {formatMetric(goal.baseline, goal.unit, currency)}
                    </p>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
