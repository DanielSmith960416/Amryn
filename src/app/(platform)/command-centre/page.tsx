import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, BRANCH_TONE, HEALTH_TONE, OPPORTUNITY_TONE, RISK_TONE } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { DemoNotice, PageHeader } from '@/components/ui/page-header';
import { Stat, StatGrid } from '@/components/ui/stat';
import { HealthDial } from '@/components/intelligence/health-dial';
import { branchStatus } from '@/lib/intelligence/finance';
import { compactMoney, count, date, money, percent, score } from '@/lib/format';
import { currentWorkspace } from '@/lib/workspace';
import { NoDataYet } from '@/components/intelligence/no-data-yet';
import { SetupPrompt } from '@/features/onboarding/setup-prompt';

export const metadata: Metadata = { title: 'Executive Command Centre' };

/**
 * EXECUTIVE_COMMAND, as a page.
 *
 * The prototype's structure is kept exactly: a row of year-to-date indicators,
 * then the six intelligence cards — insight, opportunity, risk, decision,
 * action, recommendation — each stamped with its confidence and its basis.
 *
 * The prototype writes those six as fixed sentences. Here they are produced by
 * the briefing engine from the figures on this page, which is the only way the
 * "AI-SIMULATED" label stays honest as the data changes.
 */
export default async function CommandCentrePage() {
  const state = await currentWorkspace();
  if (state.kind === 'empty') {
    return <NoDataYet what="The week in one view — health, opportunities, risks and what to do about them —" organisationName={state.organisationName} />;
  }
  const w = state.workspace;
  const currency = w.profile.currency;

  return (
    <>
      <SetupPrompt />
      <PageHeader
        eyebrow="Detect → Simulate → Act"
        title="Executive Command Centre"
        description={`${w.profile.companyName} · ${w.profile.reportingPeriod} · ${w.profile.location}`}
        actions={
          <Badge tone={HEALTH_TONE[w.health.status]}>
            Health {score(w.health.overall)} — {w.health.status}
          </Badge>
        }
      />

      {w.isDemo ? (
        <DemoNotice>
          This workspace is seeded with the demonstration business from the Amryn
          <sup className="tm">™</sup> prototypes. Replace it with your own data to see the same
          intelligence run on your numbers.
        </DemoNotice>
      ) : null}

      {/* ── Year-to-date indicators (prototype: rows 4–7) ─────────────── */}
      <StatGrid className="mb-6">
        <Stat
          label="Total revenue"
          value={compactMoney(w.ytd.revenue, currency)}
          sub={`YTD · ${w.ytd.monthsReported} months reported`}
        />
        <Stat label="Gross profit" value={compactMoney(w.ytd.grossProfit, currency)} sub="YTD" />
        <Stat
          label="Net profit"
          value={compactMoney(w.ytd.netProfit, currency)}
          sub="YTD"
          tone={w.ytd.netProfit >= 0 ? 'default' : 'negative'}
        />
        <Stat
          label="Gross margin"
          value={percent(w.ytd.grossMargin)}
          sub={`Target ${percent(w.profile.grossMarginTarget, 0)}`}
          tone={w.ytd.grossMargin >= w.profile.grossMarginTarget ? 'positive' : 'warning'}
        />
        <Stat label="Total customers" value={count(w.ytd.totalCustomers)} sub={`${count(w.ytd.newCustomers)} new YTD`} />
        <Stat
          label="Net cash flow"
          value={compactMoney(w.ytd.netCash, currency)}
          sub="YTD position"
          tone={w.ytd.netCash >= 0 ? 'positive' : 'negative'}
        />
      </StatGrid>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        {/* ── Today's intelligence ────────────────────────────────────── */}
        <div className="min-w-0 space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-[1.0625rem] font-semibold text-[var(--text-primary)]">
              Today&rsquo;s intelligence
            </h2>
            <p className="text-[0.75rem] text-[var(--text-tertiary)]">
              Computed from the figures above
            </p>
          </div>

          {w.insights.map((insight) => (
            <Card key={insight.kind} tone="brand" className="px-5 py-4">
              <p className="eyebrow">◆ {insight.kind}</p>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-[var(--text-primary)]">
                {insight.body}
              </p>
              <p className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[0.6875rem] tracking-wide text-[var(--text-tertiary)] uppercase">
                <span className="text-[var(--brand)]">AI-simulated</span>
                <span aria-hidden>·</span>
                <span>Confidence: {insight.confidence}</span>
                {insight.meta ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>{insight.meta}</span>
                  </>
                ) : null}
                <span aria-hidden>·</span>
                <span>Source: {insight.basis}</span>
              </p>
            </Card>
          ))}
        </div>

        {/* ── Side rail ───────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Business health" subtitle="Eight weighted components" />
            <CardBody>
              <HealthDial health={w.health} />
              <Link
                href="/digital-twin"
                className="mt-4 block text-center text-[0.8125rem] font-medium text-[var(--brand)] hover:underline"
              >
                Open DigitalTwin<sup className="tm">®</sup> →
              </Link>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Priority actions"
              subtitle={`${w.actionSummary.completed} of ${w.actionSummary.total} logged complete`}
            />
            <CardBody>
              <ol className="space-y-3">
                {w.actions
                  .filter((a) => a.status !== 'Completed')
                  .slice(0, 4)
                  .map((a) => (
                    <li key={a.id} className="flex gap-2.5">
                      <Badge tone={a.priority === 'HIGH' ? 'negative' : 'warning'}>
                        {a.priority}
                      </Badge>
                      <div className="min-w-0">
                        <p className="text-[0.8125rem] leading-snug text-[var(--text-primary)]">
                          {a.action}
                        </p>
                        <p className="mt-0.5 text-[0.75rem] text-[var(--text-tertiary)]">
                          {a.owner} · due {date(a.dueDate)}
                        </p>
                      </div>
                    </li>
                  ))}
              </ol>
              <Link
                href="/action-centre"
                className="mt-4 block text-[0.8125rem] font-medium text-[var(--brand)] hover:underline"
              >
                Open the Action Centre →
              </Link>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Branch performance"
              subtitle={`${w.branches.length} locations`}
            />
            <CardBody>
              <ul className="space-y-2.5">
                {w.branches.map((b) => {
                  const status = branchStatus(b.healthScore);
                  return (
                    <li key={b.name} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[0.8125rem] text-[var(--text-primary)]">
                          {b.name}
                        </p>
                        <p className="numeric text-[0.75rem] text-[var(--text-tertiary)]">
                          {compactMoney(b.revenueYtd, currency)} YTD
                        </p>
                      </div>
                      <Badge tone={BRANCH_TONE[status]}>{b.healthScore}</Badge>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* ── Pipeline and register summaries ─────────────────────────── */}
      <div className="mt-6 grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader
            title={
              <>
                OpportunityRadar<sup className="tm">®</sup>
              </>
            }
            subtitle={`${w.pipeline.total} tracked · ${money(w.pipeline.totalEstValue, currency)} pipeline`}
          />
          <CardBody>
            <ul className="space-y-3">
              {w.opportunities.slice(0, 3).map((o) => (
                <li key={o.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[0.8125rem] leading-snug text-[var(--text-primary)]">
                      {o.title}
                    </p>
                    <p className="numeric mt-0.5 text-[0.75rem] text-[var(--text-tertiary)]">
                      {o.id} · {money(o.estValue, currency)} · {o.status}
                    </p>
                  </div>
                  <Badge tone={OPPORTUNITY_TONE[o.classification]}>{score(o.score, 0)}</Badge>
                </li>
              ))}
            </ul>
            <Link
              href="/opportunity-radar"
              className="mt-4 block text-[0.8125rem] font-medium text-[var(--brand)] hover:underline"
            >
              Open the radar →
            </Link>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Risk Radar"
            subtitle={`${w.riskSummary.open} open · ${w.riskSummary.worsening} worsening`}
          />
          <CardBody>
            <ul className="space-y-3">
              {w.risks.slice(0, 3).map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[0.8125rem] leading-snug text-[var(--text-primary)]">
                      {r.risk}
                    </p>
                    <p className="numeric mt-0.5 text-[0.75rem] text-[var(--text-tertiary)]">
                      {r.id} · {r.owner} · {r.trend}
                    </p>
                  </div>
                  <Badge tone={RISK_TONE[r.classification]}>{r.score.toFixed(2)}</Badge>
                </li>
              ))}
            </ul>
            <Link
              href="/risk-radar"
              className="mt-4 block text-[0.8125rem] font-medium text-[var(--brand)] hover:underline"
            >
              Open the register →
            </Link>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
