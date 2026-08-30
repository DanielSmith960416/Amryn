import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils/cn';
import { formatDate, humanise } from '@/lib/utils/format';
import type { Enums } from '@/types/database';

export const metadata: Metadata = { title: 'Risk Dashboard' };

const SEVERITY_ORDER: Enums['priority_level'][] = ['critical', 'high', 'medium', 'low'];

/**
 * The risk dashboard (specification §28).
 *
 * The matrix is the point: five by five, likelihood against impact, with every
 * open risk placed on it. A register is a list; a matrix is a picture of where
 * the business is exposed.
 */
export default async function RiskDashboardPage() {
  const workspace = await requirePermission('view_risks');
  const supabase = await createClient();

  const { data: risks } = await supabase
    .from('risks')
    .select('*')
    .eq('organisation_id', workspace.organisation.id)
    .in('status', ['open', 'mitigating', 'monitoring'])
    .order('severity', { ascending: true });

  const open = risks ?? [];
  const counts = SEVERITY_ORDER.map((severity) => ({
    severity,
    count: open.filter((r) => r.severity === severity).length,
  }));

  return (
    <>
      <PageHeader
        eyebrow={workspace.organisation.name}
        title="Risk Dashboard"
        description="Where the business is exposed, how likely each exposure is, and what it would cost."
      />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {counts.map(({ severity, count }) => (
          <Card key={severity} className="p-4">
            <p className="eyebrow">{severity}</p>
            <p
              className={cn(
                'numeric mt-1 text-[1.75rem] leading-none font-semibold',
                count === 0
                  ? 'text-[var(--text-tertiary)]'
                  : severity === 'critical'
                    ? 'text-[var(--negative)]'
                    : severity === 'high'
                      ? 'text-[var(--warning)]'
                      : 'text-[var(--text-primary)]',
              )}
            >
              {count}
            </p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="xl:col-span-5">
          <Card>
            <CardHeader
              title="Likelihood against impact"
              subtitle="Every open risk, placed on the matrix"
            />
            <div className="p-5 pt-0">
              <RiskMatrix risks={open} />
            </div>
          </Card>
        </div>

        <div className="xl:col-span-7">
          <Card>
            <CardHeader title="Open risks" subtitle={`${open.length} needing attention`} />
            {open.length === 0 ? (
              <EmptyState
                title="Nothing open"
                description="No risk on the register needs attention. Amryn will raise one the moment a metric movement or market signal warrants it."
              />
            ) : (
              <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
                {open.map((risk) => (
                  <li key={risk.id} className="px-5 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[0.9375rem] leading-snug font-medium text-[var(--text-primary)]">
                        {risk.title}
                      </p>
                      <div className="flex shrink-0 items-center gap-1.5">
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
                        <Badge tone="outline">{humanise(risk.status)}</Badge>
                      </div>
                    </div>

                    {risk.description ? (
                      <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                        {risk.description}
                      </p>
                    ) : null}

                    {risk.mitigation ? (
                      <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                        <span className="eyebrow !mb-0 mr-1.5 !inline">Mitigation</span>
                        {risk.mitigation}
                      </p>
                    ) : null}

                    <p className="mt-1.5 text-[0.75rem] text-[var(--text-tertiary)]">
                      {humanise(risk.category)} · likelihood {risk.likelihood}/5 · impact{' '}
                      {risk.impact}/5
                      {risk.review_on ? ` · review ${formatDate(risk.review_on)}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

/** Five by five. Impact rises up the page, likelihood across it. */
function RiskMatrix({
  risks,
}: {
  risks: { id: string; title: string; likelihood: number; impact: number }[];
}) {
  const cell = (likelihood: number, impact: number) =>
    risks.filter((r) => r.likelihood === likelihood && r.impact === impact);

  return (
    <div>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between py-1">
          <span className="eyebrow !mb-0 !text-[0.5625rem] [writing-mode:vertical-rl] rotate-180">
            Impact
          </span>
        </div>

        <div className="grid flex-1 grid-cols-5 gap-1">
          {[5, 4, 3, 2, 1].map((impact) =>
            [1, 2, 3, 4, 5].map((likelihood) => {
              const here = cell(likelihood, impact);
              const product = likelihood * impact;
              return (
                <div
                  key={`${likelihood}-${impact}`}
                  className={cn(
                    'flex aspect-square items-center justify-center rounded-md text-[0.75rem] font-semibold',
                    product >= 20
                      ? 'bg-[var(--negative-soft)] text-[var(--negative)]'
                      : product >= 12
                        ? 'bg-[var(--warning-soft)] text-[var(--warning)]'
                        : product >= 6
                          ? 'bg-[var(--info-soft)] text-[var(--info)]'
                          : 'bg-[var(--card-inset)] text-[var(--text-tertiary)]',
                  )}
                  title={
                    here.length > 0
                      ? here.map((r) => r.title).join('\n')
                      : `Likelihood ${likelihood}, impact ${impact}`
                  }
                >
                  {here.length > 0 ? <span className="numeric">{here.length}</span> : null}
                </div>
              );
            }),
          )}
        </div>
      </div>

      <p className="eyebrow mt-2 !mb-0 text-center !text-[0.5625rem]">Likelihood →</p>
    </div>
  );
}
