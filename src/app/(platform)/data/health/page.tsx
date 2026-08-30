import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils/cn';
import { formatRelative } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Data Health' };

/**
 * Data quality (specification §22).
 *
 * Every conclusion Amryn draws rests on this page. Completeness, freshness and
 * errors are shown per source so that a reader can tell how much weight the
 * rest of the platform's findings deserve.
 */
export default async function DataHealthPage() {
  const workspace = await requirePermission('view_data_sources');
  const supabase = await createClient();

  const { data: checks } = await supabase
    .from('data_health_checks')
    .select('*, data_sources!inner(name, category)')
    .eq('organisation_id', workspace.organisation.id)
    .order('checked_at', { ascending: false });

  // One row per source: the most recent check.
  const latest = new Map<string, NonNullable<typeof checks>[number]>();
  for (const check of checks ?? []) {
    if (!latest.has(check.data_source_id)) latest.set(check.data_source_id, check);
  }
  const rows = [...latest.values()];

  const averageCompleteness =
    rows.length === 0
      ? null
      : rows.reduce((sum, row) => sum + Number(row.completeness_score), 0) / rows.length;

  return (
    <>
      <PageHeader
        eyebrow={workspace.organisation.name}
        title="Data Health"
        description="Everything Amryn concludes rests on this. Where a source is incomplete or stale, the findings drawn from it deserve less weight — and this page is where you find that out."
        actions={
          averageCompleteness === null ? null : (
            <div className="text-right">
              <p
                className={cn(
                  'numeric text-[1.5rem] leading-none font-semibold',
                  averageCompleteness >= 90
                    ? 'text-[var(--positive)]'
                    : averageCompleteness >= 70
                      ? 'text-[var(--warning)]'
                      : 'text-[var(--negative)]',
                )}
              >
                {Math.round(averageCompleteness)}%
              </p>
              <p className="eyebrow !mb-0">Average completeness</p>
            </div>
          )
        }
      />

      <Card>
        <CardHeader title="By source" subtitle={`${rows.length} assessed`} />
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing assessed yet"
            description="Data health is measured after the first sync of each source. Connect a source and this fills itself."
          />
        ) : (
          <div className="overflow-x-auto border-t border-[var(--border)]">
            <table className="w-full text-left text-[0.8125rem]">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {['Source', 'Completeness', 'Freshness', 'Errors', 'Missing fields', 'Checked'].map(
                    (heading) => (
                      <th
                        key={heading}
                        className="eyebrow px-5 py-2.5 !mb-0 font-normal whitespace-nowrap"
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {rows.map((row) => {
                  const source = (row.data_sources as unknown as { name: string } | null) ?? { name: 'Unnamed source' };
                  const completeness = Number(row.completeness_score);
                  const hours = row.freshness_hours === null ? null : Number(row.freshness_hours);
                  return (
                    <tr key={row.id} className="hover:bg-[var(--card-inset)]">
                      <td className="px-5 py-3 font-medium text-[var(--text-primary)]">
                        {source.name}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--card-inset)]">
                            <div
                              className={cn(
                                'h-full rounded-full',
                                completeness >= 90
                                  ? 'bg-[var(--positive)]'
                                  : completeness >= 70
                                    ? 'bg-[var(--warning)]'
                                    : 'bg-[var(--negative)]',
                              )}
                              style={{ width: `${completeness}%` }}
                            />
                          </div>
                          <span className="numeric text-[var(--text-primary)]">
                            {completeness.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td
                        className={cn(
                          'numeric px-5 py-3',
                          hours !== null && hours > 72
                            ? 'text-[var(--warning)]'
                            : 'text-[var(--text-secondary)]',
                        )}
                      >
                        {hours === null ? '—' : `${Math.round(hours)}h`}
                      </td>
                      <td
                        className={cn(
                          'numeric px-5 py-3',
                          row.error_count > 0
                            ? 'text-[var(--negative)]'
                            : 'text-[var(--text-secondary)]',
                        )}
                      >
                        {row.error_count}
                      </td>
                      <td className="px-5 py-3">
                        {row.missing_fields.length === 0 ? (
                          <span className="text-[var(--text-tertiary)]">None</span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {row.missing_fields.map((field) => (
                              <Badge key={field} tone="warning" className="!normal-case">
                                {field}
                              </Badge>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap text-[var(--text-secondary)]">
                        {formatRelative(row.checked_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
