import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { formatDate, humanise } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Risk Register' };

/** The full register, closed risks included — the record, not just the inbox. */
export default async function RiskRegisterPage() {
  const workspace = await requirePermission('view_risks');
  const supabase = await createClient();

  const { data: risks } = await supabase
    .from('risks')
    .select('*')
    .eq('organisation_id', workspace.organisation.id)
    .order('severity', { ascending: true })
    .order('created_at', { ascending: false });

  return (
    <>
      <PageHeader
        eyebrow={workspace.organisation.name}
        title="Risk Register"
        description="Every risk raised, open or closed. The closed ones matter: they are the record of what was handled."
      />

      <Card>
        {(risks ?? []).length === 0 ? (
          <EmptyState
            title="The register is empty"
            description="No risk has been raised. Amryn adds one automatically when a metric deteriorates past its threshold, and anyone with the permission can raise one directly."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[0.8125rem]">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {['Risk', 'Category', 'Likelihood', 'Impact', 'Severity', 'Status', 'Review'].map(
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
                {(risks ?? []).map((risk) => (
                  <tr key={risk.id} className="hover:bg-[var(--card-inset)]">
                    <td className="max-w-sm px-5 py-3">
                      <p className="font-medium text-[var(--text-primary)]">{risk.title}</p>
                      {risk.description ? (
                        <p className="mt-0.5 line-clamp-1 text-[0.75rem] text-[var(--text-tertiary)]">
                          {risk.description}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-[var(--text-secondary)]">
                      {humanise(risk.category)}
                    </td>
                    <td className="numeric px-5 py-3 text-[var(--text-secondary)]">
                      {risk.likelihood}/5
                    </td>
                    <td className="numeric px-5 py-3 text-[var(--text-secondary)]">
                      {risk.impact}/5
                    </td>
                    <td className="px-5 py-3">
                      <Badge
                        tone={
                          risk.severity === 'critical'
                            ? 'negative'
                            : risk.severity === 'high'
                              ? 'warning'
                              : risk.severity === 'medium'
                                ? 'info'
                                : 'neutral'
                        }
                      >
                        {risk.severity}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={risk.status === 'closed' ? 'positive' : 'outline'}>
                        {humanise(risk.status)}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-[var(--text-secondary)]">
                      {risk.review_on ? formatDate(risk.review_on) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
