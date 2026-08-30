import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { Sparkline } from '@/components/charts/sparkline';
import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { analyseTrend } from '@/lib/engines/trends';
import { formatDelta, formatMetric } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

export const metadata: Metadata = { title: 'Branch Performance' };

/**
 * Branch comparison.
 *
 * Ranked by growth rather than by size, because a large branch that has
 * stopped moving is the more interesting problem — and a ranking by revenue
 * would bury it at the top of the list.
 */
export default async function BranchPerformancePage() {
  const workspace = await requirePermission('view_performance');
  const supabase = await createClient();

  const [{ data: branches }, { data: metrics }] = await Promise.all([
    supabase
      .from('branches')
      .select('id, name, city, headcount')
      .eq('organisation_id', workspace.organisation.id)
      .is('deleted_at', null)
      .order('name'),
    supabase
      .from('business_metrics')
      .select('id, key, label, unit, higher_is_better')
      .eq('organisation_id', workspace.organisation.id)
      .eq('key', 'revenue')
      .maybeSingle()
      .then((result) => ({ data: result.data })),
  ]);

  const revenueMetric = metrics;
  const currency = workspace.organisation.currency_code;

  const { data: values } = revenueMetric
    ? await supabase
        .from('metric_values')
        .select('branch_id, period_start, value')
        .eq('organisation_id', workspace.organisation.id)
        .eq('metric_id', revenueMetric.id)
        .not('branch_id', 'is', null)
        .order('period_start', { ascending: true })
    : { data: [] };

  const seriesByBranch = new Map<string, { period: string; value: number }[]>();
  for (const row of values ?? []) {
    if (!row.branch_id) continue;
    const series = seriesByBranch.get(row.branch_id) ?? [];
    series.push({ period: row.period_start, value: Number(row.value) });
    seriesByBranch.set(row.branch_id, series);
  }

  const rows = (branches ?? [])
    .map((branch) => {
      const series = seriesByBranch.get(branch.id) ?? [];
      const trend = analyseTrend(series);
      return {
        ...branch,
        series,
        trend,
        current: series[series.length - 1]?.value ?? null,
        changePercent: trend?.changePercent ?? null,
      };
    })
    .sort((a, b) => (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity));

  const withData = rows.filter((row) => row.series.length > 1);
  const laggard = withData[withData.length - 1];
  const leader = withData[0];

  return (
    <>
      <PageHeader
        eyebrow={workspace.organisation.name}
        title="Branch Performance"
        description="Ranked by growth rather than by size. A large branch that has stopped moving is the more interesting problem."
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title="No branches defined"
            description="Add branches under Administration to compare performance across them. A single-site business has nothing to compare, and that is a fine state to be in."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {leader && laggard && leader.id !== laggard.id ? (
            <Card tone="brand">
              <CardBody className="pt-5">
                <p className="text-[0.9375rem] leading-relaxed text-[var(--text-primary)]">
                  <strong>{leader.name}</strong> has grown{' '}
                  <span className="numeric">{formatDelta(leader.changePercent)}</span> across the
                  period, while <strong>{laggard.name}</strong> has managed{' '}
                  <span className="numeric">{formatDelta(laggard.changePercent)}</span>. That gap is
                  the largest single difference in the group, and it is where an intervention would
                  be worth the most.
                </p>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Branches"
              subtitle={revenueMetric ? `Compared on ${revenueMetric.label.toLowerCase()}` : 'No comparable metric'}
            />
            <div className="overflow-x-auto border-t border-[var(--border)]">
              <table className="w-full text-left text-[0.8125rem]">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    {['Branch', 'City', 'Headcount', 'Current', 'Change', 'Trend'].map((heading) => (
                      <th
                        key={heading}
                        className="eyebrow px-5 py-2.5 !mb-0 font-normal whitespace-nowrap"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-[var(--card-inset)]">
                      <td className="px-5 py-3 font-medium text-[var(--text-primary)]">{row.name}</td>
                      <td className="px-5 py-3 text-[var(--text-secondary)]">{row.city ?? '—'}</td>
                      <td className="numeric px-5 py-3 text-[var(--text-secondary)]">
                        {row.headcount ?? '—'}
                      </td>
                      <td className="numeric px-5 py-3 text-[var(--text-primary)]">
                        {row.current === null || !revenueMetric
                          ? '—'
                          : formatMetric(row.current, revenueMetric.unit, currency)}
                      </td>
                      <td
                        className={cn(
                          'numeric px-5 py-3',
                          row.changePercent === null
                            ? 'text-[var(--text-tertiary)]'
                            : row.changePercent > 0
                              ? 'text-[var(--positive)]'
                              : 'text-[var(--negative)]',
                        )}
                      >
                        {formatDelta(row.changePercent)}
                      </td>
                      <td className="px-5 py-3">
                        {row.series.length > 1 ? (
                          <Sparkline
                            values={row.series.map((point) => point.value)}
                            colour={
                              (row.changePercent ?? 0) >= 0
                                ? 'var(--positive)'
                                : 'var(--negative)'
                            }
                            className="h-6 w-20"
                          />
                        ) : (
                          <span className="text-[var(--text-tertiary)]">No history</span>
                        )}
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
