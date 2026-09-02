import type { Metadata } from 'next';
import { Badge, BRANCH_TONE, HEALTH_TONE } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { DemoNotice, PageHeader } from '@/components/ui/page-header';
import { Stat, StatGrid } from '@/components/ui/stat';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';
import { HealthBreakdown, HealthDial } from '@/components/intelligence/health-dial';
import { RevenueChart } from '@/components/intelligence/revenue-chart';
import { branchStatus } from '@/lib/intelligence/finance';
import { compactMoney, count, money, percent, score } from '@/lib/format';
import { currentWorkspace } from '@/lib/workspace';
import { NoDataYet } from '@/components/intelligence/no-data-yet';

export const metadata: Metadata = { title: 'DigitalTwin®' };

const TREND_TONE = {
  INCREASING: 'positive',
  GROWING: 'positive',
  IMPROVING: 'positive',
  POSITIVE: 'positive',
  STABLE: 'info',
  DECLINING: 'warning',
  NEGATIVE: 'negative',
} as const;

/**
 * DIGITAL_TWIN and BUSINESS_HEALTH, as one page.
 *
 * The prototype splits the business identity, the performance figures, the five
 * trend readings and the branch table across two sheets. They belong together:
 * the twin is a model of the business, and a model you have to page between is
 * not one thing.
 */
export default async function DigitalTwinPage() {
  const state = await currentWorkspace();
  if (state.kind === 'empty') {
    return <NoDataYet what="The model of your business" organisationName={state.organisationName} />;
  }
  const w = state.workspace;
  const currency = w.profile.currency;

  return (
    <>
      <PageHeader
        eyebrow="Inside view"
        title={
          <>
            Amryn<sup className="tm">™</sup>DigitalTwin<sup className="tm">®</sup>
          </>
        }
        description="A continuously updated model of the business itself — what it earns, who it keeps, and what changed."
        actions={
          <Badge tone={HEALTH_TONE[w.health.status]}>
            {score(w.health.overall)}/100 — {w.health.status}
          </Badge>
        }
      />

      {w.isDemo ? <DemoNotice /> : null}

      <StatGrid className="mb-6">
        <Stat label="YTD revenue" value={compactMoney(w.ytd.revenue, currency)} />
        <Stat label="YTD gross profit" value={compactMoney(w.ytd.grossProfit, currency)} sub={percent(w.ytd.grossMargin)} />
        <Stat label="YTD net profit" value={compactMoney(w.ytd.netProfit, currency)} sub={percent(w.ytd.netMargin)} />
        <Stat label="Total customers" value={count(w.ytd.totalCustomers)} />
        <Stat label="New customers YTD" value={count(w.ytd.newCustomers)} />
        <Stat
          label="Net cash YTD"
          value={compactMoney(w.ytd.netCash, currency)}
          tone={w.ytd.netCash >= 0 ? 'positive' : 'negative'}
        />
      </StatGrid>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader
              title="Revenue trend"
              subtitle={`${w.ytd.monthsReported} reported months of ${w.months.length}`}
            />
            <CardBody>
              <RevenueChart months={w.months} currency={currency} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Branch performance"
              subtitle="Health scores band at 75 (healthy) and 60 (stable)"
            />
            <TableWrap className="rounded-t-none border-0 border-t">
              <Table>
                <thead>
                  <tr>
                    <Th>Branch</Th>
                    <Th numeric>Revenue YTD</Th>
                    <Th numeric>Gross profit</Th>
                    <Th numeric>Net profit</Th>
                    <Th numeric>Customers</Th>
                    <Th numeric>Staff</Th>
                    <Th numeric>Avg order</Th>
                    <Th numeric>Health</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {w.branches.map((b) => {
                    const status = branchStatus(b.healthScore);
                    return (
                      <tr key={b.name}>
                        <Td className="font-medium whitespace-nowrap">{b.name}</Td>
                        <Td numeric>{money(b.revenueYtd, currency)}</Td>
                        <Td numeric>{money(b.grossProfit, currency)}</Td>
                        <Td numeric>{money(b.netProfit, currency)}</Td>
                        <Td numeric>{count(b.customers)}</Td>
                        <Td numeric>{count(b.staff)}</Td>
                        <Td numeric>{money(b.avgOrder, currency)}</Td>
                        <Td numeric>{b.healthScore}/100</Td>
                        <Td>
                          <Badge tone={BRANCH_TONE[status]}>{status}</Badge>
                        </Td>
                      </tr>
                    );
                  })}
                  {w.branches.length === 0 ? (
                    <EmptyRow colSpan={9}>No branches are configured for this workspace.</EmptyRow>
                  ) : null}
                </tbody>
              </Table>
            </TableWrap>
          </Card>

          <Card>
            <CardHeader title="Business identity" subtitle="The twin's foundation" />
            <CardBody>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {[
                  ['Company', w.profile.companyName],
                  ['Industry', w.profile.industry],
                  ['Location', w.profile.location],
                  ['Business model', w.profile.businessModel],
                  ['Branches', String(w.profile.branches)],
                  ['Employees', String(w.profile.employees)],
                  ['Founded', String(w.profile.founded)],
                  ['Currency', w.profile.currency],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="eyebrow">{k}</dt>
                    <dd className="mt-0.5 text-[0.875rem] text-[var(--text-primary)]">{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-5 border-t border-[var(--border)] pt-4">
                <p className="eyebrow mb-2">Strategic objectives</p>
                <ol className="space-y-1.5">
                  {w.profile.strategicObjectives.map((o, i) => (
                    <li key={o} className="flex gap-2 text-[0.875rem] text-[var(--text-primary)]">
                      <span className="numeric text-[var(--text-tertiary)]">{i + 1}.</span>
                      {o}
                    </li>
                  ))}
                </ol>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Business Health Score" subtitle="Eight weighted components" />
            <CardBody>
              <HealthDial health={w.health} />
              <div className="mt-6 border-t border-[var(--border)] pt-4">
                <HealthBreakdown health={w.health} />
              </div>
              <p className="mt-4 text-[0.75rem] leading-relaxed text-[var(--text-tertiary)]">
                Components marked <em className="not-italic">assumed</em> are standing assessments
                rather than measurements from connected data. Connecting their sources moves them
                from assumed to measured without changing the weights.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Trend analysis" subtitle="Latest reported month against the one before" />
            <CardBody>
              <ul className="space-y-3">
                {w.trends.map((t) => (
                  <li key={t.label}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[0.8125rem] text-[var(--text-primary)]">{t.label}</span>
                      <Badge tone={TREND_TONE[t.direction]}>{t.direction}</Badge>
                    </div>
                    <p className="numeric mt-0.5 text-[0.75rem] text-[var(--text-tertiary)]">
                      {t.detail}
                    </p>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
