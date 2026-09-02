import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { MetricCard } from '@/components/dashboard/metric-card';
import { EmptyState } from '@/components/ui/states';
import { PerformanceChart } from '@/components/charts/performance-chart';
import { PageHeader } from '@/components/shell/page-header';
import { formatMetric, formatMonth } from '@/lib/utils/format';
import type { BusinessContext, MetricSnapshot } from '@/types/intelligence';

/**
 * The performance view, shared by the financial, sales and operations pages.
 *
 * Those three differ only in which metrics they show. One component keeps them
 * consistent and means a change to how a trend reads happens once.
 */
export function MetricView({
  context,
  metrics,
  title,
  description,
  emptyDescription,
}: {
  context: BusinessContext;
  metrics: MetricSnapshot[];
  title: string;
  description: string;
  emptyDescription: string;
}) {
  const currency = context.organisation.currencyCode;

  return (
    <>
      <PageHeader
        eyebrow={context.organisation.name}
        title={title}
        description={description}
      />

      {metrics.length === 0 ? (
        <Card>
          <EmptyState title="Nothing measured here yet" description={emptyDescription} />
        </Card>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <MetricCard
                key={metric.key}
                label={metric.label}
                value={formatMetric(metric.current, metric.unit, currency)}
                changePercent={metric.changePercent}
                direction={metric.direction}
                favourable={metric.favourable}
                comparison="on last period"
                series={metric.series.map((p) => p.value)}
                footnote={
                  metric.target === null
                    ? undefined
                    : `Target ${formatMetric(metric.target, metric.unit, currency)}`
                }
              />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {metrics
              .filter((metric) => metric.series.length > 1)
              .map((metric) => (
                <Card key={metric.key}>
                  <CardHeader
                    title={metric.label}
                    subtitle={describe(metric, currency)}
                  />
                  <CardBody>
                    <PerformanceChart
                      data={metric.series.map((point) => ({
                        period: formatMonth(point.period),
                        value: point.value,
                      }))}
                      series={[{ key: 'value', label: metric.label, unit: metric.unit }]}
                      currency={currency}
                      shape={metric.unit === 'count' ? 'bar' : 'area'}
                      height={200}
                      periods={[
                        { label: '3M', count: 3 },
                        { label: '6M', count: 6 },
                        { label: '12M', count: 12 },
                      ]}
                    />
                  </CardBody>
                </Card>
              ))}
          </div>
        </div>
      )}
    </>
  );
}

/** A sentence about the metric, rather than a repetition of the number above it. */
function describe(metric: MetricSnapshot, currency: string): string {
  if (!metric.trend) return 'Not enough history to read a trend.';

  const { trend } = metric;
  if (trend.direction === 'flat') {
    return `Broadly flat across ${trend.periods} periods, averaging ${formatMetric(trend.mean, metric.unit, currency)}.`;
  }

  const way = trend.direction === 'up' ? 'risen' : 'fallen';
  const judgement =
    metric.favourable === null ? '' : metric.favourable ? ' — the way you want it' : ' — the wrong way';
  const consistency = trend.isMonotonic ? ', every period' : '';

  return `Has ${way} ${Math.abs(trend.changePercent ?? 0).toFixed(1)}% across ${trend.periods} periods${consistency}${judgement}.`;
}
