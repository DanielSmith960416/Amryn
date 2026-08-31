'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { buildDatabase, type SetupState } from './actions';

export function SetupForm({ canRun }: { canRun: boolean }) {
  const [state, setState] = useState<SetupState>({ status: 'idle' });
  const [pending, startTransition] = useTransition();

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
      onClick={() => startTransition(async () => setState(await buildDatabase()))}
    >
      {pending ? 'Building the database…' : 'Build the database'}
    </Button>
  );
}
