import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { cn } from '@/lib/utils/cn';
import { formatRelative } from '@/lib/utils/format';

/**
 * The Intelligence Feed (specification §18).
 *
 * One timeline, deliberately mixing what happened inside the business with what
 * happened outside it. Keeping them apart would be tidier and would lose the
 * whole point — the two only mean something read together.
 */
export type FeedOrigin = 'business' | 'market' | 'competitor' | 'opportunity' | 'ai';

export interface FeedEntry {
  id: string;
  origin: FeedOrigin;
  title: string;
  detail: string | null;
  at: string;
  severity?: 'critical' | 'high' | 'medium' | 'low';
}

const ORIGIN: Record<FeedOrigin, { label: string; className: string }> = {
  business: { label: 'Inside', className: 'bg-[var(--brand)]' },
  market: { label: 'Market', className: 'bg-[var(--chart-3)]' },
  competitor: { label: 'Competitor', className: 'bg-[var(--warning)]' },
  opportunity: { label: 'Opportunity', className: 'bg-[var(--accent)]' },
  ai: { label: 'Amryn AI', className: 'bg-[var(--chart-4)]' },
};

export function IntelligenceFeed({
  entries,
  title = 'Intelligence feed',
  subtitle = 'Inside and outside, on one timeline',
  limit,
  className,
}: {
  entries: FeedEntry[];
  title?: string;
  subtitle?: string;
  limit?: number;
  className?: string;
}) {
  const shown = limit ? entries.slice(0, limit) : entries;

  return (
    <Card className={className}>
      <CardHeader title={title} subtitle={subtitle} />

      {shown.length === 0 ? (
        <EmptyState
          title="The feed is quiet"
          description="Nothing has happened inside or outside the business that clears the reporting threshold. Connect more sources to widen what Amryn can see."
        />
      ) : (
        <ol className="border-t border-[var(--border)]">
          {shown.map((entry) => {
            const origin = ORIGIN[entry.origin];
            return (
              <li key={entry.id} className="relative flex gap-3 px-5 py-3.5">
                {/* Timeline spine, drawn per row so it never outruns the list. */}
                <span
                  aria-hidden
                  className="absolute top-0 bottom-0 left-[1.6875rem] w-px bg-[var(--border)] last:bottom-1/2"
                />
                <span
                  aria-hidden
                  className={cn(
                    'relative z-10 mt-1.5 size-2 shrink-0 rounded-full ring-3 ring-[var(--card)]',
                    origin.className,
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <p className="text-[0.875rem] leading-snug font-medium text-[var(--text-primary)]">
                      {entry.title}
                    </p>
                    <span className="numeric text-[0.6875rem] text-[var(--text-tertiary)]">
                      {formatRelative(entry.at)}
                    </span>
                  </div>
                  {entry.detail ? (
                    <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                      {entry.detail}
                    </p>
                  ) : null}
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <Badge tone="outline" className="!text-[0.5625rem]">
                      {origin.label}
                    </Badge>
                    {entry.severity && entry.severity !== 'low' ? (
                      <Badge
                        tone={entry.severity === 'critical' ? 'negative' : entry.severity === 'high' ? 'warning' : 'info'}
                        className="!text-[0.5625rem]"
                      >
                        {entry.severity}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
