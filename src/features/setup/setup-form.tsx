'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { buildDatabase, type SetupState } from './actions';

export function SetupForm({
  canRun,
  label = 'Build the database',
  internalKey,
}: {
  canRun: boolean;
  /** What the button offers to do, which differs on an empty database. */
  label?: string;
  /** Passed through so the action can re-check access it cannot infer. */
  internalKey?: string;
}) {
  const [state, setState] = useState<SetupState>({ status: 'idle' });
  const [pending, startTransition] = useTransition();

  if (state.status === 'refused') {
    return (
      <p className="text-[0.875rem] text-[var(--negative)]" role="alert">
        {state.message}
      </p>
    );
  }

  if (state.status === 'done') {
    return (
      <div
        className="rounded-[var(--radius-card)] border p-5"
        style={{
          borderColor: state.ok ? 'var(--positive)' : 'var(--negative)',
          background: 'var(--card-inset)',
        }}
        role="status"
      >
        <p className="text-[0.9375rem] font-medium text-[var(--text-primary)]">
          {state.ok ? 'Done' : 'Nothing was applied'}
        </p>
        <p className="mt-1.5 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
          {state.message}
        </p>

        {/* Per migration, when this was an incremental run: which files went
            in, and which one stopped it. A single sentence cannot say that. */}
        {state.applied && state.applied.length > 0 ? (
          <ul className="mt-3 space-y-1 border-t border-[var(--border)] pt-3">
            {state.applied.map((migration) => (
              <li key={migration.file} className="font-mono text-[0.75rem]">
                <span style={{ color: migration.ok ? 'var(--positive)' : 'var(--negative)' }}>
                  {migration.ok ? '✓' : '✗'}
                </span>{' '}
                <span className="text-[var(--text-secondary)]">{migration.file}</span>
                {migration.problem ? (
                  <span className="text-[var(--negative)]"> — {migration.problem}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {state.outstanding && state.outstanding.length > 0 ? (
          <p className="mt-3 text-[0.8125rem] text-[var(--text-secondary)]">
            Still to apply: {state.outstanding.join(', ')}
          </p>
        ) : null}

        {/* Postgres raises a notice per migration, which is the script saying
            what it did. Worth showing: it is the difference between trusting
            the outcome and reading it. */}
        {state.notices && state.notices.length > 0 ? (
          <ul className="mt-3 space-y-1 border-t border-[var(--border)] pt-3">
            {state.notices.map((notice, i) => (
              <li key={i} className="font-mono text-[0.75rem] text-[var(--text-tertiary)]">
                {notice}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild>
            <a href="/diagnostics">Check everything</a>
          </Button>
          {!state.ok ? (
            <Button variant="secondary" onClick={() => setState({ status: 'idle' })}>
              Try again
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <Button
      disabled={!canRun || pending}
      onClick={() => startTransition(async () => setState(await buildDatabase(internalKey)))}
    >
      {pending ? 'Working…' : label}
    </Button>
  );
}
