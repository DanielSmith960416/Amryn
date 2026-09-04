import Link from 'next/link';
import { Card, CardHeader } from '@/components/ui/card';
import { PriorityBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { formatMoney } from '@/lib/utils/format';
import type { ExecutiveBriefing } from '@/types/intelligence';

/**
 * AI Priorities (specification §7).
 *
 * Ranked, not listed. The ordering is the product: an executive should be able
 * to work down this column and stop when the day runs out.
 */
export function PriorityList({
  priorities,
  currency = 'ZAR',
  className,
}: {
  priorities: ExecutiveBriefing['priorities'];
  currency?: string;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader
        title="AI priorities"
        subtitle="What to do next, in order"
        actions={
          <Link
            href="/recommendations"
            className="font-label text-[0.6875rem] tracking-wide text-[var(--brand)] uppercase hover:underline"
          >
            All
          </Link>
        }
      />

      {priorities.length === 0 ? (
        <EmptyState
          title="Nothing needs a decision"
          description="No anomaly, open risk or unworked opportunity is pressing enough to rank. That is a good state to be in."
        />
      ) : (
        <ol className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
          {priorities.map((item, i) => (
            <li key={`${item.title}-${i}`} className="px-5 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[0.875rem] leading-snug font-medium text-[var(--text-primary)]">
                  {item.title}
                </p>
                <PriorityBadge priority={item.priority} />
              </div>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                {item.rationale}
              </p>
              {item.impactCents !== null ? (
                <p className="numeric mt-1.5 text-[0.75rem] text-[var(--text-tertiary)]">
                  Potential impact {formatMoney(item.impactCents, currency)}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
