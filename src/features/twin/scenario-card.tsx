'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { money } from '@/lib/format';
import { removeScenario, runScenario, type ScenarioState } from './actions';
import { FidelityBadge } from './fidelity-badge';
import { ScenarioForm } from './scenario-form';
import type { Scenario } from './scenarios';

/**
 * One question, and the last answer it got.
 *
 * The interval is shown as three figures rather than one, and P50 is not
 * given more weight than the other two in the layout — a middle number set
 * larger than its neighbours is read as the answer, and the two beside it as
 * decoration, which is the opposite of what a range means.
 */
export function ScenarioCard({
  scenario,
  currency,
  canManage,
}: {
  scenario: Scenario;
  currency: string;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [run, requestRun] = useActionState(runScenario, { status: 'idle' } as ScenarioState);
  const result = scenario.latest;

  return (
    <Card>
      <CardHeader
        eyebrow={scenario.isBaseline ? 'Baseline' : undefined}
        title={scenario.name}
        subtitle={describeLevers(scenario)}
        actions={
          canManage ? (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
                {editing ? 'Close' : 'Edit'}
              </Button>
              {/* The message this produces is rendered in the body — the header
                  is shrink-to-fit, and a sentence there would push the title
                  out of its own card. */}
              <form action={requestRun}>
                <input type="hidden" name="id" value={scenario.id} />
                <Run />
              </form>
            </>
          ) : null
        }
      />

      <CardBody>
        {run.status === 'error' || run.status === 'queued' ? (
          <p
            className="mb-4 text-[0.8125rem] leading-relaxed"
            style={{ color: run.status === 'error' ? 'var(--negative)' : 'var(--text-secondary)' }}
            role={run.status === 'error' ? 'alert' : 'status'}
          >
            {run.message}
          </p>
        ) : null}

        {editing ? (
          <div className="mb-5 border-b border-[var(--border)] pb-5">
            <ScenarioForm
              existing={{
                id: scenario.id,
                name: scenario.name,
                description: scenario.description,
                demandMultiplier: scenario.demandMultiplier,
                priceMultiplier: scenario.priceMultiplier,
                horizonDays: scenario.horizonDays,
              }}
              onDone={() => setEditing(false)}
            />
            {scenario.isBaseline ? null : <RemoveScenario id={scenario.id} />}
          </div>
        ) : null}

        {scenario.description ? (
          <p className="mb-4 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
            {scenario.description}
          </p>
        ) : null}

        {scenario.pending ? (
          <p className="mb-4 rounded-[var(--radius-field)] border border-[var(--border)] bg-[var(--card-inset)] px-3 py-2 text-[0.8125rem] text-[var(--text-secondary)]">
            A run is queued. Refresh in a minute or two — nothing is lost if you leave this page.
          </p>
        ) : null}

        {result ? (
          <Result result={result} currency={currency} />
        ) : (
          <p className="text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
            {scenario.pending
              ? 'Nothing to show yet — the first run is on its way.'
              : 'This scenario has not been run. Ask for a run, or leave it for tonight’s.'}
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function Result({ result, currency }: { result: import('./scenarios').SimulationResult; currency: string }) {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FidelityBadge fidelity={result.fidelity} />
        <span className="text-[0.75rem] text-[var(--text-tertiary)]">
          {result.iterations.toLocaleString()} runs over {result.horizonDays} days
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ['Low', result.revenueCents.p10, 'A tenth of runs came in below this.'],
            ['Middle', result.revenueCents.p50, 'Half above, half below.'],
            ['High', result.revenueCents.p90, 'A tenth of runs came in above this.'],
          ] as const
        ).map(([label, cents, note]) => (
          <div
            key={label}
            className="rounded-[var(--radius-field)] border border-[var(--border)] bg-[var(--card-inset)] p-3"
          >
            <p className="eyebrow">{label}</p>
            <p className="numeric mt-1 text-[1.0625rem] font-medium text-[var(--text-primary)]">
              {money(cents / 100, currency)}
            </p>
            <p className="mt-1 text-[0.6875rem] leading-relaxed text-[var(--text-tertiary)]">{note}</p>
          </div>
        ))}
      </div>

      {result.ordersPerDayP50 === null ? null : (
        <p className="numeric mt-3 text-[0.75rem] text-[var(--text-tertiary)]">
          About {result.ordersPerDayP50.toFixed(1)} orders a day in the middle case.
        </p>
      )}

      <details className="mt-4 border-t border-[var(--border)] pt-3">
        <summary className="cursor-pointer text-[0.8125rem] font-medium text-[var(--text-primary)]">
          What this run assumed
        </summary>
        <ul className="mt-2 space-y-1.5">
          {result.assumptions.map((assumption) => (
            <li key={assumption} className="text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">
              {assumption}
            </li>
          ))}
        </ul>
        <p className="numeric mt-3 text-[0.6875rem] text-[var(--text-tertiary)]">
          Seed {result.seed} · run {new Date(result.ranAt).toLocaleString('en-ZA')}
        </p>
        <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-[var(--text-tertiary)]">
          The seed is fixed per scenario per day, so asking again today gives the same answer unless
          you move a lever. That is deliberate: it means a difference between two runs is the lever
          you changed rather than the dice.
        </p>
      </details>
    </>
  );
}

function Run() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      {pending ? 'Queueing…' : 'Run'}
    </Button>
  );
}

function RemoveScenario({ id }: { id: string }) {
  const [state, action] = useActionState(removeScenario, { status: 'idle' } as ScenarioState);

  return (
    <form action={action} className="mt-4 border-t border-[var(--border)] pt-4">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="danger" size="sm">
        Remove this scenario
      </Button>
      {state.status === 'error' ? (
        <p className="mt-2 text-[0.75rem] text-[var(--negative)]" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function describeLevers(scenario: Scenario): string {
  const parts: string[] = [];
  if (scenario.demandMultiplier !== 1) parts.push(`demand ×${trim(scenario.demandMultiplier)}`);
  if (scenario.priceMultiplier !== 1) parts.push(`price ×${trim(scenario.priceMultiplier)}`);
  if (parts.length === 0) parts.push('nothing changed');
  return `${parts.join(', ')} · ${scenario.horizonDays} days`;
}

/** 1.200 reads as precision nobody claimed; 1.2 reads as the lever it is. */
function trim(value: number): string {
  return String(Number(value.toFixed(3)));
}
