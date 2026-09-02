import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { SectorScopeForm } from '@/features/organisation/sector-scope-form';
import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Organisation' };

export default async function OrganisationSettingsPage() {
  const workspace = await requirePermission('manage_organisation');
  const supabase = await createClient();

  const [{ data: regions }, { data: branches }, { data: departments }] = await Promise.all([
    supabase
      .from('regions')
      .select('id, name, code')
      .eq('organisation_id', workspace.organisation.id)
      .is('deleted_at', null)
      .order('name'),
    supabase
      .from('branches')
      .select('id, name, city, headcount, region_id')
      .eq('organisation_id', workspace.organisation.id)
      .is('deleted_at', null)
      .order('name'),
    supabase
      .from('departments')
      .select('id, name, branch_id')
      .eq('organisation_id', workspace.organisation.id)
      .is('deleted_at', null)
      .order('name'),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Organisation"
        description="The shape of the business, and what its radar is allowed to look at."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Details" />
          <CardBody className="space-y-3">
            <Detail label="Name" value={workspace.organisation.name} />
            <Detail label="Industry" value={workspace.organisation.industry ?? 'Not set'} />
            <Detail label="Country" value={workspace.organisation.country_code} />
            <Detail label="Currency" value={workspace.organisation.currency_code} />
            <Detail label="Timezone" value={workspace.organisation.timezone} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Radar sector scope"
            subtitle="Which sectors the AI OpportunityRadar® may surface for this organisation"
          />
          <CardBody>
            <p className="mb-4 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
              This is your choice, not Amryn&rsquo;s. By default the radar surfaces everything,
              including public-sector tenders, and lets relevance and strategic alignment decide
              what ranks. If your business does not pursue certain work, narrow it here and the
              radar will honour that everywhere — the pipeline, reports and the assistant alike.
            </p>
            <SectorScopeForm current={workspace.organisation.sector_scope} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Structure" subtitle="Regions, branches and departments" />
          {(branches ?? []).length === 0 ? (
            <EmptyState
              title="No structure defined"
              description="A single-site business needs none. Add regions and branches when you have more than one place to compare."
            />
          ) : (
            <CardBody className="space-y-4">
              {(regions ?? []).length > 0 ? (
                <div>
                  <p className="eyebrow">Regions</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(regions ?? []).map((region) => (
                      <Badge key={region.id} tone="brand" className="!normal-case">
                        {region.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              <div>
                <p className="eyebrow">Branches</p>
                <ul className="divide-y divide-[var(--border)]">
                  {(branches ?? []).map((branch) => (
                    <li key={branch.id} className="flex items-baseline justify-between gap-3 py-2">
                      <span className="text-[0.8125rem] font-medium text-[var(--text-primary)]">
                        {branch.name}
                      </span>
                      <span className="text-[0.75rem] text-[var(--text-tertiary)]">
                        {branch.city ?? '—'}
                        {branch.headcount ? ` · ${branch.headcount} staff` : ''}
                        {' · '}
                        {(departments ?? []).filter((d) => d.branch_id === branch.id).length}{' '}
                        departments
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardBody>
          )}
        </Card>
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="font-medium text-[var(--text-primary)]">{value}</span>
    </div>
  );
}
