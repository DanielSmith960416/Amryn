import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shell/page-header';
import { BriefingCard } from '@/components/intelligence/briefing-card';
import { PriorityList } from '@/components/intelligence/priority-list';
import { HealthCard } from '@/components/dashboard/health-card';
import { MetricCard } from '@/components/dashboard/metric-card';
import { IntelligenceFeed } from '@/components/intelligence/feed';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardSkeleton, EmptyState } from '@/components/ui/states';
import { PerformanceChart } from '@/components/charts/performance-chart';
import { requireWorkspace } from '@/lib/auth/session';
import { buildBusinessContext } from '@/features/intelligence/context';
import { generateBriefing } from '@/lib/ai/intelligence';
import { buildFeed } from '@/features/intelligence/feed';
import { formatMetric, formatMoney, formatMonth, humanise } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Command Centre' };

/**
 * The Executive Command Centre (specification §7).
 *
 * Answers five questions in reading order: what is happening, what has
 * changed, what needs attention, what opportunities exist, what to do next.
 * The briefing streams in its own Suspense boundary because it may be waiting
 * on a model, and the rest of the page has no reason to wait with it.
 */
export default async function CommandCentrePage() {
  const workspace = await requireWorkspace();
  const context = await buildBusinessContext(workspace);
  const currency = context.organisation.currencyCode;

  const liveOpportunities = context.opportunities.filter(
    (o) => !['won', 'lost', 'archived'].includes(o.stage),
  );
  const pipelineValue = liveOpportunities.reduce(
    (sum, o) => sum + (o.estimatedValueCents ?? 0),
    0,
  );
  const openRisks = context.risks.filter((r) => r.status === 'open' || r.status === 'mitigating');

  const headline = context.metrics.slice(0, 4);
  const revenue = context.metrics.find((m) => m.key === 'revenue') ?? context.metrics[0];

  const chartData = (revenue?.series ?? []).map((point) => ({
    period: formatMonth(point.period),
    value: point.value,
  }));

  return (
    <>
      <PageHeader
        eyebrow={`${context.organisation.name} · ${context.period.label}`}
        title="Command Centre"
        description="Your business on the inside, your market on the outside, and what the two together say you should do next."
        actions={
          <Button asChild variant="soft" size="sm">
            <Link href="/assistant">Ask Amryn</Link>
          </Button>
        }
      />

      {context.metrics.length === 0 ? (
        <Card>
          <EmptyState
            title="No data connected yet"
            description="Connect your first data source to let your AI DigitalTwin® begin learning about your business. Until then there is nothing honest for this page to show."
            action={
              <Button asChild variant="primary">
                <Link href="/data">Connect data</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {/* ── executive KPI row ─────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
            {headline.map((metric) => (
              <MetricCard
                key={metric.key}
                label={metric.label}
                value={formatMetric(metric.current, metric.unit, currency)}
                changePercent={metric.changePercent}
                direction={metric.direction}
                favourable={metric.favourable}
                comparison="on last period"
                series={metric.series.map((p) => p.value)}
              />
            ))}

            <MetricCard
              label="Opportunity value"
              value={formatMoney(pipelineValue, currency)}
              comparison={`${liveOpportunities.length} live on the radar`}
              favourable={null}
            />

            <MetricCard
              label="Active risks"
              value={String(openRisks.length)}
              comparison={
                openRisks.filter((r) => r.severity === 'critical').length > 0
                  ? `${openRisks.filter((r) => r.severity === 'critical').length} critical`
                  : 'none critical'
              }
              favourable={openRisks.length === 0 ? true : null}
            />
          </div>

          {/* ── briefing ──────────────────────────────────────────────── */}
          <Suspense fallback={<CardSkeleton rows={4} />}>
            <BriefingPanel workspaceId={workspace.organisation.id} />
          </Suspense>

          {/* ── the three-column grid ─────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
            <div className="xl:col-span-3">
              <HealthCard health={context.health} changePoints={context.healthTrend.changePoints} />
            </div>

            <div className="xl:col-span-6">
              <Card className="h-full">
                <CardHeader
                  title={revenue ? revenue.label : 'Business performance'}
                  subtitle="Trailing periods, from your connected sources"
                  actions={
                    <Link
                      href="/performance"
                      className="font-mono text-[0.6875rem] tracking-wide text-[var(--brand)] uppercase hover:underline"
                    >
                      Detail
                    </Link>
                  }
                />
                <CardBody>
                  {chartData.length > 1 && revenue ? (
                    <PerformanceChart
                      data={chartData}
                      series={[{ key: 'value', label: revenue.label, unit: revenue.unit }]}
                      currency={currency}
                      periods={[
                        { label: '3M', count: 3 },
                        { label: '6M', count: 6 },
                        { label: '12M', count: 12 },
                      ]}
                    />
                  ) : (
                    <EmptyState
                      title="Not enough history to chart"
                      description="Two or more periods are needed before a trend means anything."
                    />
                  )}
                </CardBody>
              </Card>
            </div>

            <div className="xl:col-span-3">
              <Suspense fallback={<CardSkeleton rows={4} />}>
                <PriorityPanel workspaceId={workspace.organisation.id} />
              </Suspense>
            </div>
          </div>

          {/* ── bottom grid ───────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <IntelligenceFeed entries={buildFeed(context)} limit={7} />

            <div className="space-y-5">
              <Card>
                <CardHeader
                  title={
                    <>
                      AI OpportunityRadar<span className="tm">®</span>
                    </>
                  }
                  subtitle={`${liveOpportunities.length} live, ${formatMoney(pipelineValue, currency)} at stake`}
                  actions={
                    <Link
                      href="/opportunity-radar"
                      className="font-mono text-[0.6875rem] tracking-wide text-[var(--brand)] uppercase hover:underline"
                    >
                      Radar
                    </Link>
                  }
                />
                {liveOpportunities.length === 0 ? (
                  <EmptyState
                    title="The radar is clear"
                    description="No external opportunity has cleared the scoring threshold. Widen your market sources to give it more to work with."
                  />
                ) : (
                  <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
                    {liveOpportunities.slice(0, 4).map((opportunity) => (
                      <li key={opportunity.id} className="flex items-start gap-3 px-5 py-3">
                        <span className="numeric mt-0.5 w-8 shrink-0 text-[0.9375rem] font-semibold text-[var(--brand)]">
                          {opportunity.score === null ? '—' : Math.round(opportunity.score)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[0.875rem] leading-snug font-medium text-[var(--text-primary)]">
                            {opportunity.title}
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.75rem] text-[var(--text-tertiary)]">
                            <Badge tone="outline" className="!text-[0.5625rem]">
                              {humanise(opportunity.kind)}
                            </Badge>
                            <span className="numeric">
                              {formatMoney(opportunity.estimatedValueCents, currency)}
                            </span>
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card>
                <CardHeader
                  title="Risk"
                  subtitle={openRisks.length === 0 ? 'Nothing open' : `${openRisks.length} open`}
                  actions={
                    <Link
                      href="/risk"
                      className="font-mono text-[0.6875rem] tracking-wide text-[var(--brand)] uppercase hover:underline"
                    >
                      Register
                    </Link>
                  }
                />
                {openRisks.length === 0 ? (
                  <EmptyState
                    title="No open risks"
                    description="Nothing on the register needs attention. Amryn will raise one the moment a metric or a market signal warrants it."
                  />
                ) : (
                  <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
                    {openRisks.slice(0, 4).map((risk) => (
                      <li key={risk.id} className="flex items-start justify-between gap-3 px-5 py-3">
                        <div className="min-w-0">
                          <p className="text-[0.875rem] leading-snug font-medium text-[var(--text-primary)]">
                            {risk.title}
                          </p>
                          <p className="mt-0.5 text-[0.75rem] text-[var(--text-tertiary)]">
                            {humanise(risk.category)} · likelihood {risk.likelihood}/5 · impact{' '}
                            {risk.impact}/5
                          </p>
                        </div>
                        <Badge
                          tone={
                            risk.severity === 'critical'
                              ? 'negative'
                              : risk.severity === 'high'
                                ? 'warning'
                                : 'info'
                          }
                        >
                          {risk.severity}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* The briefing and priorities share one generation, but sit in separate
   Suspense boundaries so neither blocks the other's slot from painting. */

async function BriefingPanel({ workspaceId: _workspaceId }: { workspaceId: string }) {
  const workspace = await requireWorkspace();
  const context = await buildBusinessContext(workspace);
  const briefing = await generateBriefing(context);
  return <BriefingCard briefing={briefing} />;
}

async function PriorityPanel({ workspaceId: _workspaceId }: { workspaceId: string }) {
  const workspace = await requireWorkspace();
  const context = await buildBusinessContext(workspace);
  const briefing = await generateBriefing(context);
  return (
    <PriorityList
      priorities={briefing.priorities}
      currency={context.organisation.currencyCode}
      className="h-full"
    />
  );
}
