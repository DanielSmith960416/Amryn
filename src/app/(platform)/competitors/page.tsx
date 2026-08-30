import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge, PriorityBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { formatDate, humanise } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Competitor Intelligence' };

export default async function CompetitorsPage() {
  const workspace = await requirePermission('view_competitors');
  const supabase = await createClient();

  const [{ data: competitors }, { data: events }] = await Promise.all([
    supabase
      .from('competitors')
      .select('*')
      .eq('organisation_id', workspace.organisation.id)
      .eq('is_tracked', true)
      .order('threat_level', { ascending: true }),
    supabase
      .from('competitor_events')
      .select('*, competitors!inner(name)')
      .eq('organisation_id', workspace.organisation.id)
      .order('observed_on', { ascending: false })
      .limit(30),
  ]);

  return (
    <>
      <PageHeader
        eyebrow={workspace.organisation.name}
        title="Competitor Intelligence"
        description="Who you are up against, and what they have done lately."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div>
          <Card>
            <CardHeader title="Tracked" subtitle={`${(competitors ?? []).length} competitors`} />
            {(competitors ?? []).length === 0 ? (
              <EmptyState
                title="None tracked yet"
                description="Add a competitor and Amryn will watch for launches, pricing moves, expansion and hiring."
              />
            ) : (
              <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
                {(competitors ?? []).map((competitor) => (
                  <li key={competitor.id} className="px-5 py-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[0.9375rem] font-medium text-[var(--text-primary)]">
                        {competitor.name}
                      </p>
                      <PriorityBadge priority={competitor.threat_level} />
                    </div>
                    {competitor.markets.length > 0 ? (
                      <p className="mt-1 text-[0.75rem] text-[var(--text-tertiary)]">
                        {competitor.markets.join(', ')}
                      </p>
                    ) : null}
                    {competitor.description ? (
                      <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                        {competitor.description}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader title="Activity" subtitle="What they have been doing" />
            {(events ?? []).length === 0 ? (
              <EmptyState
                title="Nothing observed"
                description="No competitor activity has been detected. This fills as market sources report launches, pricing changes and expansion."
              />
            ) : (
              <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
                {(events ?? []).map((event) => (
                  <li key={event.id} className="px-5 py-3.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-[0.9375rem] leading-snug font-medium text-[var(--text-primary)]">
                        {event.title}
                      </p>
                      <span className="numeric text-[0.6875rem] text-[var(--text-tertiary)]">
                        {formatDate(event.observed_on)}
                      </span>
                    </div>
                    {event.detail ? (
                      <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                        {event.detail}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge tone="brand">
                        {(event.competitors as unknown as { name: string } | null)?.name ?? 'Unknown'}
                      </Badge>
                      <Badge tone="outline">{humanise(event.kind)}</Badge>
                      <PriorityBadge priority={event.impact} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
