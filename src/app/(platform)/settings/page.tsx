import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TableWrap, Td, Th } from '@/components/ui/table';
import { currentUser } from '@/lib/auth/current-user';
import { describeStore } from '@/lib/auth/store';
import { COMPLIANCE_PROFILES } from '@/lib/intelligence/inventory';
import { HEALTH_WEIGHTS, MANUAL_ASSESSMENTS } from '@/lib/intelligence/health';
import { OPPORTUNITY_WEIGHTS } from '@/lib/intelligence/opportunity';
import { percent } from '@/lib/format';
import { loadWorkspace } from '@/lib/workspace';

export const metadata: Metadata = { title: 'Settings' };

/**
 * SETTINGS — the business profile, the compliance profile, and the constants
 * every engine reads.
 *
 * The weights are shown rather than hidden. A client whose Business Health
 * Score is 70.4 is entitled to see that Financial Health carries 20% of it and
 * Strategic Health 5%, and that three of the eight components are standing
 * assessments rather than measurements. A composite score whose composition is
 * a secret is a score nobody can act on.
 */
export default async function SettingsPage() {
  const user = await currentUser();
  const w = loadWorkspace();
  const store = describeStore();

  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Your account, the workspace profile, and the constants the Intelligence Layer reads."
      />

      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader title="Your account" />
          <CardBody>
            <dl className="space-y-3">
              {[
                ['Name', user?.fullName ?? '—'],
                ['Email', user?.email ?? '—'],
                ['Business', user?.companyName ?? '—'],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="eyebrow">{k}</dt>
                  <dd className="mt-0.5 text-[0.875rem] text-[var(--text-primary)]">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 border-t border-[var(--border)] pt-4">
              <p className="eyebrow mb-1.5">Account storage</p>
              <Badge tone={store.durable ? 'positive' : 'warning'}>
                {store.durable ? 'Durable' : 'In memory only'}
              </Badge>
              <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                {store.note}
              </p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Workspace profile"
            subtitle="Currently the demonstration business"
          />
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              {[
                ['Company', w.profile.companyName],
                ['Industry', w.profile.industry],
                ['Location', w.profile.location],
                ['Currency', w.profile.currency],
                ['Reporting period', w.profile.reportingPeriod],
                ['Fiscal year start', w.profile.fiscalYearStart],
                ['Revenue target', w.profile.revenueTargetAnnual.toLocaleString('en-GB')],
                ['Gross margin target', percent(w.profile.grossMarginTarget, 0)],
                ['Net profit target', percent(w.profile.netProfitTarget, 0)],
                ['Customer growth target', percent(w.profile.customerGrowthTarget, 0)],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="eyebrow">{k}</dt>
                  <dd className="mt-0.5 text-[0.8125rem] text-[var(--text-primary)]">{v}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader
          title="Business Health Score composition"
          subtitle="Eight components, weighted. Three are standing assessments rather than measurements."
        />
        <TableWrap className="rounded-t-none border-0 border-t">
          <Table>
            <thead>
              <tr>
                <Th>Component</Th>
                <Th numeric>Weight</Th>
                <Th numeric>Current raw score</Th>
                <Th>Basis</Th>
                <Th>Source</Th>
              </tr>
            </thead>
            <tbody>
              {w.health.components.map((c) => (
                <tr key={c.component}>
                  <Td className="font-medium whitespace-nowrap">{c.component}</Td>
                  <Td numeric>{percent(c.weight, 0)}</Td>
                  <Td numeric>{c.rawScore.toFixed(1)}</Td>
                  <Td>{c.description}</Td>
                  <Td>
                    <Badge tone={c.derived ? 'positive' : 'warning'}>
                      {c.derived ? 'Measured' : 'Assumed'}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
        <CardBody className="text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
          Weights total {percent(Object.values(HEALTH_WEIGHTS).reduce((a, b) => a + b, 0), 0)}. The
          assumed components currently stand at Operational {MANUAL_ASSESSMENTS.operational},
          People {MANUAL_ASSESSMENTS.people} and Strategic {MANUAL_ASSESSMENTS.strategic} out of
          100. Connecting real inputs for those three moves{' '}
          {percent(
            w.health.components.filter((c) => !c.derived).reduce((t, c) => t + c.weight, 0),
            0,
          )}{' '}
          of the score from assumed to measured.
        </CardBody>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader
            title="Opportunity scoring weights"
            subtitle="Six factors, from the prototype's scoring model"
          />
          <TableWrap className="rounded-t-none border-0 border-t">
            <Table>
              <tbody>
                {[
                  ['Estimated value', OPPORTUNITY_WEIGHTS.value],
                  ['Probability', OPPORTUNITY_WEIGHTS.probability],
                  ['Strategic fit', OPPORTUNITY_WEIGHTS.strategicFit],
                  ['Urgency', OPPORTUNITY_WEIGHTS.urgency],
                  ['Ease of execution', OPPORTUNITY_WEIGHTS.effort],
                  ['Probability (confidence weighting)', OPPORTUNITY_WEIGHTS.probabilitySecondary],
                ].map(([k, v]) => (
                  <tr key={String(k)}>
                    <Td>{k}</Td>
                    <Td numeric className="w-24">
                      {percent(v as number, 0)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          <CardBody className="text-[0.75rem] leading-relaxed text-[var(--text-tertiary)]">
            Probability appears twice in the source model, giving it 30% in total — the heaviest
            factor. That behaviour is preserved rather than corrected, because changing it would
            silently re-rank every opportunity a client has already reviewed.
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Compliance profiles"
            subtitle="Advanced Inventory Control is sector-neutral; the profile supplies the sector"
          />
          <CardBody>
            <ul className="space-y-4">
              {COMPLIANCE_PROFILES.map((p) => (
                <li key={p.id}>
                  <div className="flex items-center gap-2">
                    <p className="text-[0.875rem] font-medium text-[var(--text-primary)]">
                      {p.label}
                    </p>
                    {p.id === w.inventory.profile.id ? (
                      <Badge tone="brand">In use</Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">
                    {p.regulator ? `${p.regulator} · ` : ''}
                    {p.responsibleRoleLabel} signs off · {p.departments.length} departments
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-[var(--border)] pt-3 text-[0.75rem] leading-relaxed text-[var(--text-tertiary)]">
              The expiry status rules — expired, critical at 30 days, warning at 90 — are universal
              and do not vary by profile. What varies is the regulator named, who signs the audit
              off, the retention wording, the disposal language and the department list.
            </p>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader
          title="Connecting your own data"
          subtitle="What replacing the demonstration workspace involves"
        />
        <CardBody className="space-y-3 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
          <p>
            This workspace is seeded from the Amryn<sup className="tm">™</sup> prototypes. Every
            view above, and both executive reports, read one structure — the workspace — which is
            assembled in a single place in the codebase.
          </p>
          <p>
            Replacing demo figures with a client&rsquo;s real data is therefore a change to that one
            function. No page, component or scoring engine is touched, and the numbers on every
            screen change together because they all descend from the same computation. The README
            sets out the steps.
          </p>
        </CardBody>
      </Card>
    </>
  );
}
