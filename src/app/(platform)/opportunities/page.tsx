import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { requirePermission } from '@/lib/auth/session';
import { groupByStage, listOpportunities } from '@/features/opportunities/queries';
import { formatMoney, humanise } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Opportunity Pipeline' };

/** The pipeline (specification §9): discovered through to won or lost. */
export default async function OpportunityPipelinePage() {
  const workspace = await requirePermission('view_opportunities');
  const opportunities = await listOpportunities({ organisationId: workspace.organisation.id });
  const currency = workspace.organisation.currency_code;
  const columns = groupByStage(opportunities);

  const live = opportunities.filter((o) => !['won', 'lost'].includes(o.stage));
  const liveValue = live.reduce((sum, o) => sum + (o.estimatedValueCents ?? 0), 0);

  return (
    <>
      <PageHeader
        eyebrow={workspace.organisation.name}
        title="Opportunity Pipeline"
        description="Every opportunity Amryn has found, from first detection to the decision that closed it."
        actions={
          <div className="text-right">
            <p className="numeric text-[1.25rem] font-semibold text-[var(--text-primary)]">
              {formatMoney(liveValue, currency)}
            </p>
            <p className="eyebrow !mb-0">{live.length} live</p>
          </div>
        }
      />

      {opportunities.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing in the pipeline yet"
            description="Opportunities arrive here from the AI OpportunityRadar® once it has market sources to scan. You can also add one manually."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {columns
            .filter((column) => column.items.length > 0)
            .map((column) => (
              <div key={column.stage}>
                <div className="mb-2.5 flex items-baseline justify-between gap-2 px-1">
                  <span className="eyebrow !mb-0">{humanise(column.stage)}</span>
                  <span className="numeric text-[0.75rem] text-[var(--text-tertiary)]">
                    {column.items.length} · {formatMoney(column.valueCents, currency)}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {column.items.map((opportunity) => (
                    <Card key={opportunity.id} interactive className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[0.875rem] leading-snug font-medium text-[var(--text-primary)]">
                          {opportunity.title}
                        </p>
                        {opportunity.score !== null ? (
                          <span className="numeric shrink-0 text-[0.9375rem] font-semibold text-[var(--brand)]">
                            {Math.round(opportunity.score)}
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-1.5 line-clamp-2 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                        {opportunity.summary}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <Badge tone="outline" className="!text-[0.5625rem]">
                          {humanise(opportunity.kind)}
                        </Badge>
                        <span className="numeric ml-auto text-[0.75rem] text-[var(--text-secondary)]">
                          {formatMoney(opportunity.estimatedValueCents, currency)}
                        </span>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </>
  );
}
