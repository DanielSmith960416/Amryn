import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { STEPS, type StepId } from './steps';
import { InitialiseForm } from './initialise-form';
import { cn } from '@/lib/utils/cn';

/**
 * What was actually saved, counted from the tables rather than from the
 * progress record.
 *
 * Deliberately not "you told us five things". A review that reports its own
 * bookkeeping proves nothing — if a branch failed to save, the progress record
 * would still say the step was answered and the customer would learn otherwise
 * a week later. Counting the rows is the only version of this page that can
 * catch that.
 */
export async function ReviewPanel({
  organisationId,
  completed,
  skipped,
  alreadyDone,
}: {
  organisationId: string;
  completed: readonly string[];
  skipped: readonly string[];
  alreadyDone: boolean;
}) {
  const supabase = await createClient();
  const scoped = (table: 'branches' | 'departments' | 'goals' | 'data_sources' | 'competitors') =>
    supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('organisation_id', organisationId);

  const [organisation, branches, departments, goals, sources, competitors] = await Promise.all([
    supabase
      .from('organisations')
      .select('industry, strategy_profile')
      .eq('id', organisationId)
      .maybeSingle(),
    scoped('branches'),
    scoped('departments'),
    scoped('goals'),
    scoped('data_sources'),
    scoped('competitors'),
  ]);

  const stated = (organisation.data?.strategy_profile as { stated?: Record<string, unknown> } | null)
    ?.stated;

  const summary: Record<Exclude<StepId, 'review'>, string> = {
    identity: organisation.data?.industry
      ? organisation.data.industry
      : 'Not described yet',
    structure: describe(branches.count, 'site', 'sites', departments.count, 'department', 'departments'),
    objectives: countOf(goals.count, 'objective', 'objectives'),
    systems: countOf(sources.count, 'system', 'systems'),
    data: stated ? 'Starting figures recorded' : 'No starting figures',
    market: countOf(competitors.count, 'competitor', 'competitors'),
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="What we have" subtitle="Counted from what was saved, not from what was ticked" />
        <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
          {STEPS.filter((s) => s.id !== 'review').map((s) => {
            const wasSkipped = skipped.includes(s.id);
            const wasDone = completed.includes(s.id);
            return (
              <li key={s.id} className="flex items-baseline justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-[0.875rem] font-medium text-[var(--text-primary)]">
                    {s.title}
                  </p>
                  <p
                    className={cn(
                      'mt-0.5 text-[0.8125rem] leading-relaxed',
                      wasSkipped ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-secondary)]',
                    )}
                  >
                    {wasSkipped
                      ? s.ifSkipped
                      : summary[s.id as Exclude<StepId, 'review'>]}
                  </p>
                </div>
                <Link
                  href={`/onboarding/${s.id}`}
                  className="shrink-0 text-[0.75rem] font-medium text-[var(--brand)] underline underline-offset-2"
                >
                  {wasDone || wasSkipped ? 'Change' : 'Answer'}
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card tone="brand">
        <CardHeader
          title={alreadyDone ? 'Already initialised' : 'Initialise the DigitalTwin®'}
          subtitle={
            alreadyDone
              ? 'You can change any answer above; the twin follows.'
              : 'This builds the first model of your business from what you have told us.'
          }
        />
        <CardBody className="space-y-4">
          <p className="text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
            Nothing here is final. Every answer can be changed from settings afterwards, and the
            model is rebuilt each time real figures arrive from your systems — what you have given
            us is the starting point, not the last word.
          </p>
          <InitialiseForm alreadyDone={alreadyDone} />
        </CardBody>
      </Card>
    </div>
  );
}

function countOf(count: number | null, one: string, many: string): string {
  const n = count ?? 0;
  if (n === 0) return `No ${many} yet`;
  return `${n} ${n === 1 ? one : many}`;
}

function describe(
  a: number | null,
  aOne: string,
  aMany: string,
  b: number | null,
  bOne: string,
  bMany: string,
): string {
  const parts: string[] = [];
  if ((a ?? 0) > 0) parts.push(`${a} ${a === 1 ? aOne : aMany}`);
  if ((b ?? 0) > 0) parts.push(`${b} ${b === 1 ? bOne : bMany}`);
  return parts.length > 0 ? parts.join(', ') : 'Treated as one site';
}
