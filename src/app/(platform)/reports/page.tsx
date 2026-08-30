import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { formatDate, formatRelative, humanise } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Reports' };

/** Report kinds per specification §34. */
const KINDS = [
  { key: 'executive_summary', name: 'Executive Summary', blurb: 'The briefing, as a document.' },
  { key: 'business_performance', name: 'Business Performance', blurb: 'Every metric with its trend.' },
  { key: 'financial', name: 'Financial Performance', blurb: 'Revenue, margin and cost.' },
  { key: 'opportunity', name: 'Opportunity Report', blurb: 'The pipeline and what is in it.' },
  { key: 'market_intelligence', name: 'Market Intelligence', blurb: 'Signals and competitor activity.' },
  { key: 'risk', name: 'Risk Report', blurb: 'The register and the matrix.' },
  { key: 'ai_briefing', name: 'AI Strategic Briefing', blurb: 'Inside meets outside.' },
] as const;

export default async function ReportsPage() {
  const workspace = await requirePermission('generate_reports');
  const supabase = await createClient();

  const { data: reports } = await supabase
    .from('reports')
    .select('*')
    .eq('organisation_id', workspace.organisation.id)
    .order('created_at', { ascending: false })
    .limit(25);

  return (
    <>
      <PageHeader
        eyebrow={workspace.organisation.name}
        title="Reports"
        description="A report is a snapshot with a date on it. Generate one when you need the numbers to stop moving — for a board pack, or a decision you want to be able to justify later."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader title="Generated" subtitle={`${(reports ?? []).length} on record`} />
            {(reports ?? []).length === 0 ? (
              <EmptyState
                title="Nothing generated yet"
                description="Choose a report to the right. Each one takes a date range and, where relevant, a branch or department filter."
              />
            ) : (
              <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
                {(reports ?? []).map((report) => (
                  <li key={report.id} className="flex items-start justify-between gap-4 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="text-[0.9375rem] font-medium text-[var(--text-primary)]">
                        {report.title}
                      </p>
                      <p className="mt-0.5 text-[0.75rem] text-[var(--text-tertiary)]">
                        {report.period_start && report.period_end
                          ? `${formatDate(report.period_start)} — ${formatDate(report.period_end)}`
                          : 'No period'}
                        {' · '}
                        {formatRelative(report.created_at)}
                      </p>
                    </div>
                    <Badge tone="outline">{humanise(report.kind)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader title="Available reports" />
            <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
              {KINDS.map((kind) => (
                <li key={kind.key} className="px-5 py-3">
                  <p className="text-[0.875rem] font-medium text-[var(--text-primary)]">
                    {kind.name}
                  </p>
                  <p className="mt-0.5 text-[0.75rem] text-[var(--text-tertiary)]">{kind.blurb}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
