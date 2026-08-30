import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/page-header';
import { OpportunityCard } from '@/components/opportunities/opportunity-card';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { requirePermission } from '@/lib/auth/session';
import { listOpportunities } from '@/features/opportunities/queries';
import { createClient } from '@/lib/supabase/server';
import { formatMoney, formatRelative, humanise } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'AI OpportunityRadar®' };

/**
 * The AI OpportunityRadar® (specification §9).
 *
 * What the market outside looks like. The sector scope shown at the top is the
 * organisation's own setting — stated plainly, because a radar that is
 * filtering should say what it is filtering.
 */
export default async function OpportunityRadarPage() {
  const workspace = await requirePermission('view_opportunities');
  const supabase = await createClient();

  const [opportunities, signalsResult] = await Promise.all([
    listOpportunities({
      organisationId: workspace.organisation.id,
      stages: ['discovered', 'analysing', 'qualified'],
    }),
    supabase
      .from('market_signals')
      .select('*')
      .eq('organisation_id', workspace.organisation.id)
      .order('observed_at', { ascending: false })
      .limit(10),
  ]);

  const currency = workspace.organisation.currency_code;
  const totalValue = opportunities.reduce((sum, o) => sum + (o.estimatedValueCents ?? 0), 0);
  const scope = workspace.organisation.sector_scope;
  const narrowed = scope.length < 4;

  return (
    <>
      <PageHeader
        eyebrow={workspace.organisation.name}
        title={
          <>
            AI OpportunityRadar<span className="tm">®</span>
          </>
        }
        description="What the market is doing that your business should know about — before the business knows it needs to."
        actions={
          <div className="text-right">
            <p className="numeric text-[1.25rem] font-semibold text-[var(--text-primary)]">
              {formatMoney(totalValue, currency)}
            </p>
            <p className="eyebrow !mb-0">On the radar</p>
          </div>
        }
      />

      {/* The scope is the customer's choice, so it is shown rather than hidden. */}
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-[var(--radius-tile)] border border-[var(--border)] bg-[var(--card-inset)] px-4 py-2.5">
        <span className="eyebrow !mb-0">Sector scope</span>
        {scope.map((sector) => (
          <Badge key={sector} tone="brand">
            {sector}
          </Badge>
        ))}
        <span className="ml-auto text-[0.75rem] text-[var(--text-tertiary)]">
          {narrowed
            ? 'Narrowed by your organisation. Widen it in Settings to see more.'
            : 'Every sector, including tenders. Narrow it in Settings if you prefer.'}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="xl:col-span-8">
          {opportunities.length === 0 ? (
            <Card>
              <EmptyState
                title="The radar is clear"
                description="No external opportunity has been detected and scored yet. Connect market sources so Amryn has something to scan, or widen your sector scope."
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {opportunities.map((opportunity) => (
                <OpportunityCard
                  key={opportunity.id}
                  opportunity={opportunity}
                  currency={currency}
                />
              ))}
            </div>
          )}
        </div>

        <div className="xl:col-span-4">
          <Card>
            <CardHeader
              title="Market signals"
              subtitle="The raw observations opportunities are drawn from"
            />
            {(signalsResult.data ?? []).length === 0 ? (
              <EmptyState
                title="No signals yet"
                description="Market sources have not returned anything relevant. This is where the radar's raw input appears."
              />
            ) : (
              <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
                {(signalsResult.data ?? []).map((signal) => (
                  <li key={signal.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[0.875rem] leading-snug font-medium text-[var(--text-primary)]">
                        {signal.title}
                      </p>
                      <span className="numeric shrink-0 text-[0.75rem] text-[var(--brand)]">
                        {Math.round(Number(signal.relevance) * 100)}
                      </span>
                    </div>
                    <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                      {signal.summary}
                    </p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone="outline" className="!text-[0.5625rem]">
                        {humanise(signal.kind)}
                      </Badge>
                      <Badge tone="neutral" className="!text-[0.5625rem]">
                        {signal.sector}
                      </Badge>
                      <span className="text-[0.6875rem] text-[var(--text-tertiary)]">
                        {formatRelative(signal.observed_at)}
                      </span>
                    </p>
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
