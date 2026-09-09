'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/field';
import { acceptProposal, declineProposal, type DecisionState } from './actions';
import type { Proposal } from './record';

/**
 * One suggestion, and the two things a person can do with it.
 *
 * Both values are shown, always — what the field says now and what is being
 * proposed instead. A suggestion that shows only its own answer is asking to
 * be agreed with rather than decided on.
 */
export function PendingProposal({
  proposal,
  canDecide,
}: {
  proposal: Proposal;
  canDecide: boolean;
}) {
  const [state, decide] = useActionState(acceptProposal, { status: 'idle' } as DecisionState);
  const [declineState, decline] = useActionState(declineProposal, { status: 'idle' } as DecisionState);
  const outcome = state.status !== 'idle' ? state : declineState;

  return (
    <Card>
      <CardHeader
        eyebrow="Suggested"
        title={proposal.targetField}
        subtitle={`in ${friendlyTable(proposal.targetTable)}`}
      />
      <CardBody>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <Value label="Now" value={proposal.currentValue} muted />
          <Value label="Suggested" value={proposal.proposedValue} />
        </div>

        <p className="text-[0.875rem] leading-relaxed text-[var(--text-primary)]">
          {proposal.rationale}
        </p>

        {outcome.status !== 'idle' ? (
          <p
            className="mt-4 text-[0.8125rem] leading-relaxed"
            style={{ color: outcome.status === 'error' ? 'var(--negative)' : 'var(--positive)' }}
            role={outcome.status === 'error' ? 'alert' : 'status'}
          >
            {outcome.message}
          </p>
        ) : null}

        {canDecide ? (
          <div className="mt-5 flex flex-wrap items-end gap-2 border-t border-[var(--border)] pt-4">
            <form action={decide}>
              <input type="hidden" name="id" value={proposal.id} />
              <Accept />
            </form>

            <form action={decline} className="flex flex-1 items-end gap-2">
              <input type="hidden" name="id" value={proposal.id} />
              <div className="min-w-0 flex-1">
                <Input
                  name="note"
                  placeholder="Why not? (worth saying — it stops this being raised again)"
                  maxLength={300}
                />
              </div>
              <Decline />
            </form>
          </div>
        ) : (
          <p className="mt-5 border-t border-[var(--border)] pt-4 text-[0.8125rem] text-[var(--text-secondary)]">
            An administrator decides this one.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function Value({ label, value, muted }: { label: string; value: string | null; muted?: boolean }) {
  return (
    <div className="rounded-[var(--radius-field)] border border-[var(--border)] bg-[var(--card-inset)] p-3">
      <p className="eyebrow">{label}</p>
      <p
        className="numeric mt-1 text-[0.9375rem] font-medium"
        style={{ color: muted ? 'var(--text-secondary)' : 'var(--text-primary)' }}
      >
        {value === null || value === '' ? 'Not answered' : value}
      </p>
    </div>
  );
}

function Accept() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? 'Applying…' : 'Apply this'}
    </Button>
  );
}

function Decline() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? 'Saving…' : 'No'}
    </Button>
  );
}

const STATUS_TONE = {
  accepted: 'positive',
  declined: 'outline',
  superseded: 'warning',
  pending: 'info',
} as const;

const STATUS_LABEL = {
  accepted: 'Applied',
  declined: 'Declined',
  superseded: 'Overtaken',
  pending: 'Waiting',
} as const;

/** What was decided, and why. Kept visible so the same argument is had once. */
export function DecidedProposal({ proposal }: { proposal: Proposal }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-[var(--border)] py-3 last:border-0">
      <Badge tone={STATUS_TONE[proposal.status]}>{STATUS_LABEL[proposal.status]}</Badge>
      <span className="text-[0.8125rem] font-medium text-[var(--text-primary)]">
        {proposal.targetField}
      </span>
      <span className="numeric text-[0.8125rem] text-[var(--text-secondary)]">
        → {proposal.proposedValue}
      </span>
      {proposal.decisionNote ? (
        <span className="basis-full text-[0.75rem] leading-relaxed text-[var(--text-tertiary)]">
          {proposal.decisionNote}
        </span>
      ) : null}
    </div>
  );
}

function friendlyTable(table: string): string {
  return table === 'imprint_layers' ? 'your Imprint' : table;
}
