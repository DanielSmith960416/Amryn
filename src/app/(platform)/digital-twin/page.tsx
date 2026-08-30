import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/page-header';
import { HealthCard } from '@/components/dashboard/health-card';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { PerformanceChart } from '@/components/charts/performance-chart';
import { requirePermission } from '@/lib/auth/session';
import { buildBusinessContext } from '@/features/intelligence/context';
import { formatMetric, formatMonth, humanise } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'AI DigitalTwin®' };

/**
 * The AI DigitalTwin® (specification §8).
 *
 * What the business looks like from the inside: the health score, every metric
 * with its trend, and — the part that earns the name — the changes the twin
 * detected without being asked to look.
 */
export default async function DigitalTwinPage() {
  const workspace = await requirePermission('view_intelligence');
  const context = await buildBusinessContext(workspace);
  const currency = context.organisation.currencyCode;

  const deteriorating = context.metrics.filter((m) => m.favourable === false);
  const improving = context.metrics.filter((m) => m.favourable === true);

  return (
    <>
      <PageHeader
        eyebrow={context.organisation.name}
        title={
          <>
            AI DigitalTwin<span className="tm">®</span>
          </>
        }
        description="A continuously updated picture of what is happening inside the business, and what has changed since it last looked."
      />

      {context.metrics.length === 0 ? (
        <Card>
          <EmptyState
            title="The twin has nothing to model yet"
            description="Connect a data source so Amryn can begin building a picture of your business. Until it has measurements, there is no inside to see."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <HealthCard health={context.health} changePoints={context.healthTrend.changePoints} />
            </div>

            <div className="lg:col-span-8">
              <Card className="h-full">
                <CardHeader
                  title="Detected changes"
                  subtitle="Movements the twin flagged without being asked to look for them"
                />
                {context.anomalies.length === 0 ? (
                  <EmptyState
                    title="Nothing is behaving unusually"
                    description="Every metric is moving within its own recent range. That is the state you want, and Amryn will say so plainly rather than manufacture a finding."
                  />
                ) : (
                  <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
                    {context.anomalies.map((entry) => (
                      <li key={entry.metricKey} className="px-5 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[0.9375rem] font-medium text-[var(--text-primary)]">
                            {entry.metricLabel}
                          </p>
                          <Badge tone={entry.stepChange ? 'negative' : 'warning'}>
                            {entry.stepChange ? 'Step change' : 'Anomaly'}
                          </Badge>
                        </div>

                        {entry.stepChange ? (
                          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                            The level shifted {entry.stepChange.direction}{' '}
                            <span className="numeric">
                              {Math.abs(entry.stepChange.changePercent ?? 0).toFixed(1)}%
                            </span>{' '}
                            at {entry.stepChange.period} and has held there since — mean{' '}
                            <span className="numeric">{entry.stepChange.meanBefore}</span> before,{' '}
                            <span className="numeric">{entry.stepChange.meanAfter}</span> after. A
                            step usually has a single cause and a date, which makes it worth finding.
                          </p>
                        ) : null}

                        {entry.anomalies.slice(-2).map((anomaly) => (
                          <p
                            key={anomaly.period}
                            className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]"
                          >
                            {anomaly.period} read{' '}
                            <span className="numeric">{anomaly.value}</span> against an expected{' '}
                            <span className="numeric">{anomaly.expected}</span> —{' '}
                            <span className="numeric">{Math.abs(anomaly.deviations).toFixed(1)}</span>{' '}
                            standard deviations {anomaly.direction} its own recent history.
                          </p>
                        ))}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>

          {/* Every metric, grouped by whether it is going the right way. */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <MetricGroup
              title="Moving the wrong way"
              subtitle={`${deteriorating.length} of ${context.metrics.length} metrics`}
              metrics={deteriorating}
              currency={currency}
              emptyTitle="Nothing is deteriorating"
              emptyDescription="Every metric with a direction is moving the way you want it to."
            />
            <MetricGroup
              title="Moving the right way"
              subtitle={`${improving.length} of ${context.metrics.length} metrics`}
              metrics={improving}
              currency={currency}
              emptyTitle="Nothing is improving yet"
              emptyDescription="No metric has moved far enough in the right direction to report."
            />
          </div>

          <Card>
            <CardHeader title="All metrics" subtitle="Current, target and trend" />
            <div className="overflow-x-auto border-t border-[var(--border)]">
              <table className="w-full text-left text-[0.8125rem]">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    {['Metric', 'Category', 'Current', 'Target', 'Change', 'Trend'].map((h) => (
                      <th key={h} className="eyebrow px-5 py-2.5 !mb-0 font-normal whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {context.metrics.map((metric) => (
                    <tr key={metric.key} className="hover:bg-[var(--card-inset)]">
                      <td className="px-5 py-2.5 font-medium text-[var(--text-primary)]">
                        {metric.label}
                      </td>
                      <td className="px-5 py-2.5 text-[var(--text-secondary)]">
                        {metric.category ? humanise(metric.category) : '—'}
                      </td>
                      <td className="numeric px-5 py-2.5 text-[var(--text-primary)]">
                        {formatMetric(metric.current, metric.unit, currency)}
                      </td>
                      <td className="numeric px-5 py-2.5 text-[var(--text-secondary)]">
                        {formatMetric(metric.target, metric.unit, currency)}
                      </td>
                      <td
                        className={
                          'numeric px-5 py-2.5 ' +
                          (metric.favourable === null
                            ? 'text-[var(--text-secondary)]'
                            : metric.favourable
                              ? 'text-[var(--positive)]'
                              : 'text-[var(--negative)]')
                        }
                      >
                        {metric.changePercent === null
                          ? '—'
                          : `${metric.changePercent > 0 ? '+' : ''}${metric.changePercent}%`}
                      </td>
                      <td className="px-5 py-2.5">
                        <MiniTrend metric={metric} currency={currency} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

function MetricGroup({
  title,
  subtitle,
  metrics,
  currency,
  emptyTitle,
  emptyDescription,
}: {
  title: string;
  subtitle: string;
  metrics: Awaited<ReturnType<typeof buildBusinessContext>>['metrics'];
  currency: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      {metrics.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <CardBody className="pt-0">
          {metrics.slice(0, 3).map((metric) => (
            <div key={metric.key} className="mt-4 first:mt-0">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-[0.8125rem] font-medium text-[var(--text-primary)]">
                  {metric.label}
                </span>
                <span className="numeric text-[0.8125rem] text-[var(--text-secondary)]">
                  {formatMetric(metric.current, metric.unit, currency)}
                </span>
              </div>
              <PerformanceChart
                data={metric.series.map((p) => ({ period: formatMonth(p.period), value: p.value }))}
                series={[{ key: 'value', label: metric.label, unit: metric.unit }]}
                currency={currency}
                shape="line"
                height={90}
              />
            </div>
          ))}
        </CardBody>
      )}
    </Card>
  );
}

function MiniTrend({
  metric,
  currency: _currency,
}: {
  metric: Awaited<ReturnType<typeof buildBusinessContext>>['metrics'][number];
  currency: string;
}) {
  if (!metric.trend) return <span className="text-[var(--text-tertiary)]">—</span>;
  const { trend } = metric;
  return (
    <span className="text-[var(--text-secondary)]">
      {trend.direction === 'flat' ? 'Flat' : trend.direction === 'up' ? 'Rising' : 'Falling'}
      {trend.isMonotonic && trend.direction !== 'flat' ? ', every period' : ''}
    </span>
  );
}
