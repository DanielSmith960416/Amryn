import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shell/page-header';
import { OpportunityCard } from '@/components/opportunities/opportunity-card';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { requirePermission } from '@/lib/auth/session';
import { listOpportunities } from '@/features/opportunities/queries';

export const metadata: Metadata = { title: 'Saved Opportunities' };

export default async function SavedOpportunitiesPage() {
  const workspace = await requirePermission('view_opportunities');
  const opportunities = await listOpportunities({
    organisationId: workspace.organisation.id,
    savedOnly: true,
  });

  return (
    <>
      <PageHeader
        eyebrow={workspace.organisation.name}
        title="Saved Opportunities"
        description="The ones someone decided were worth keeping."
      />

      {opportunities.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing saved yet"
            description="Save an opportunity from the radar to keep it here, out of the noise of everything else the scan turned up."
            action={
              <Button asChild variant="primary">
                <Link href="/opportunity-radar">Open the radar</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {opportunities.map((opportunity) => (
            <OpportunityCard
              key={opportunity.id}
              opportunity={opportunity}
              currency={workspace.organisation.currency_code}
            />
          ))}
        </div>
      )}
    </>
  );
}
