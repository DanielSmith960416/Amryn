import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { formatRelative, humanise } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Market Intelligence' };

/** Raw market signals and the sources they came from. */
export default async function MarketIntelligencePage() {
  const workspace = await requirePermission('view_market_intelligence');
  const supabase = await createClient();

  const [{ data: signals }, { data: sources }] = await Promise.all([
    supabase
      .from('market_signals')
      .select('*')
      .eq('organisation_id', workspace.organisation.id)
      .order('observed_at', { ascending: false })
      .limit(50),
    supabase
      .from('market_sources')
      .select('*')
      .or(`organisation_id.eq.${workspace.organisation.id},is_global.eq.true`)
      .order('name'),
  ]);

  return (
    <>
      <PageHeader
        eyebrow={workspace.organisation.name}
        title="Market Intelligence"
        description="What the outside world is doing, and where Amryn is watching from."
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card>
            <CardHeader title="Signals" subtitle={`${(signals ?? []).length} observed`} />
            {(signals ?? []).length === 0 ? (
              <EmptyState
                title="No signals yet"
                description="Amryn has not observed anything relevant in the market. Add market sources so the radar has somewhere to look."
              />
            ) : (
              <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
                {(signals ?? []).map((signal) => (
                  <li key={signal.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[0.9375rem] leading-snug font-medium text-[var(--text-primary)]">
                        {signal.title}
                      </p>
                      <div className="shrink-0 text-right">
                        <p className="numeric text-[0.875rem] font-semibold text-[var(--brand)]">
                          {Math.round(Number(signal.relevance) * 100)}
                        </p>
                        <p className="eyebrow !mb-0 !text-[0.5625rem]">Relevance</p>
                      </div>
                    </div>

                    <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                      {signal.summary}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge tone="brand">{humanise(signal.kind)}</Badge>
                      <Badge tone="outline">{signal.sector} sector</Badge>
                      {signal.keywords.slice(0, 3).map((keyword) => (
                        <Badge key={keyword} tone="neutral" className="!normal-case">
                          {keyword}
                        </Badge>
                      ))}
                      <span className="ml-auto text-[0.6875rem] text-[var(--text-tertiary)]">
                        {formatRelative(signal.observed_at)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader title="Sources" subtitle="Where the radar is watching" />
            {(sources ?? []).length === 0 ? (
              <EmptyState
                title="No sources configured"
                description="Add a market source so the OpportunityRadar® has somewhere to scan."
              />
            ) : (
              <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
                {(sources ?? []).map((source) => (
                  <li key={source.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[0.875rem] font-medium text-[var(--text-primary)]">
                        {source.name}
                      </p>
                      <span className="numeric shrink-0 text-[0.75rem] text-[var(--text-tertiary)]">
                        {Math.round(Number(source.reliability) * 100)}%
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone="outline" className="!text-[0.5625rem]">
                        {humanise(source.kind)}
                      </Badge>
                      {source.is_global ? (
                        <Badge tone="neutral" className="!text-[0.5625rem]">
                          Shared
                        </Badge>
                      ) : null}
                      <span className="text-[0.6875rem] text-[var(--text-tertiary)]">
                        {source.last_scanned_at
                          ? `Scanned ${formatRelative(source.last_scanned_at)}`
                          : 'Not yet scanned'}
                      </span>
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
