import type { Metadata } from 'next';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { DemoNotice, PageHeader } from '@/components/ui/page-header';
import { date } from '@/lib/format';
import { currentWorkspace } from '@/lib/workspace';
import { NoDataYet } from '@/components/intelligence/no-data-yet';

export const metadata: Metadata = { title: 'Decision Log' };

/**
 * DECISION_LOG — "Organisational Memory", as the prototype titles it.
 *
 * Rendered as records rather than a table because the two columns that matter
 * most, Actual Outcome and Lessons Learned, are prose written months after the
 * decision. Squeezing them into a cell is how a decision log becomes a list
 * nobody fills in.
 */
export default async function DecisionLogPage() {
  const state = await currentWorkspace();
  if (state.kind === 'empty') {
    return <NoDataYet what="The record of decisions taken" organisationName={state.organisationName} />;
  }
  const w = state.workspace;

  return (
    <>
      <PageHeader
        eyebrow="Organisational memory"
        title="Decision Log"
        description="What was decided, on what evidence, by whom — and what actually happened. The record that turns a decision into something the business can learn from."
      />

      {w.isDemo ? <DemoNotice /> : null}

      <div className="space-y-4">
        {w.decisions.map((d) => (
          <Card key={d.id}>
            <CardHeader
              eyebrow={`${d.id} · ${date(d.date)} · ${d.decisionMaker}`}
              title={d.decision}
              subtitle={d.reason}
            />
            <CardBody>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {[
                  ['Data used', d.dataUsed],
                  ['Recommendation', d.recommendation],
                  ['Expected outcome', d.expectedOutcome],
                  ['Actual outcome', d.actualOutcome],
                  ['Lessons learned', d.lessonsLearned],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="eyebrow">{k}</dt>
                    <dd
                      className={
                        v === 'Pending'
                          ? 'mt-0.5 text-[0.875rem] text-[var(--text-tertiary)] italic'
                          : 'mt-0.5 text-[0.875rem] leading-relaxed text-[var(--text-primary)]'
                      }
                    >
                      {v === 'Pending' ? 'Pending — outcome not yet recorded' : v}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        ))}

        {w.decisions.length === 0 ? (
          <Card>
            <CardBody className="py-10 text-center text-[0.875rem] text-[var(--text-secondary)]">
              No decisions have been logged yet. The log earns its keep the first time someone asks
              why a decision was taken.
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
