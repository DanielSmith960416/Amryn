'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/field';
import { importWorkbook, type ImportState } from './import-workbook';
import { label } from './import-labels';

const idle: ImportState = { status: 'idle' };

/**
 * Uploading the workbook a business already keeps.
 *
 * ── the report is the feature ────────────────────────────────────────────
 * An importer that says "210 rows imported" and stops has told the reader the
 * least useful true thing about what just happened. The question a person
 * actually has is "is my business in there now, and what is missing" — so what
 * came in is broken down by what it became, and what did not is listed by
 * sheet with the reason.
 *
 * The skipped list is deliberately not collapsed behind a "details" link. Two
 * of its entries are the difference between a correct set of figures and a
 * confidently wrong one — a reader who never expands it never learns that
 * their gross profit line was left out on purpose, and may go looking for the
 * bug that is not there.
 */
export function ImportForm() {
  const [state, action] = useActionState(importWorkbook, idle);

  return (
    <form action={action} className="space-y-4">
      <div>
        <Label htmlFor="workbook">Management workbook</Label>
        <input
          id="workbook"
          name="workbook"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
          className="mt-1.5 block w-full text-[0.8125rem] text-[var(--text-secondary)] file:mr-3 file:rounded-[var(--radius-control)] file:border-0 file:bg-[var(--brand-soft)] file:px-3 file:py-1.5 file:text-[0.8125rem] file:font-medium file:text-[var(--brand)]"
        />
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
          An .xlsx workbook of monthly figures, sales, expenses, opportunities and
          risks. Amryn imports what the sheets state and tells you what it left
          out — it never fills in a figure that is not there.
        </p>
      </div>

      {state.status === 'error' ? (
        <p className="text-[0.8125rem] text-[var(--negative)]" role="alert">
          {state.message}
        </p>
      ) : null}

      {state.status === 'done' ? <Report state={state} /> : null}

      <Submit />
    </form>
  );
}

function Report({ state }: { state: Extract<ImportState, { status: 'done' }> }) {
  return (
    <div className="space-y-4 rounded-[var(--radius-tile)] border border-[var(--border)] bg-[var(--card-inset)] p-4" role="status">
      <div>
        <p className="text-[0.875rem] font-semibold text-[var(--text-primary)]">
          {state.total > 0
            ? `${state.total} records imported from ${state.filename}`
            : `Nothing was imported from ${state.filename}`}
        </p>
        {state.year ? (
          <p className="mt-1 text-[0.8125rem] text-[var(--text-secondary)]">
            Read as {state.year}, from the dates written in the workbook itself.
          </p>
        ) : null}
      </div>

      {state.imported.length > 0 ? (
        <ul className="space-y-1 text-[0.8125rem]">
          {state.imported.map((entry) => (
            <li key={entry.table} className="flex items-baseline justify-between gap-3">
              <span className="text-[var(--text-secondary)]">{label(entry.table)}</span>
              <span className="font-mono tabular-nums text-[var(--text-primary)]">
                {entry.rows}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {state.skipped.length > 0 ? (
        <div className="border-t border-[var(--border)] pt-3">
          <p className="mb-2 text-[0.8125rem] font-medium text-[var(--text-primary)]">
            Left out, and why
          </p>
          <ul className="space-y-2">
            {state.skipped.map((entry, index) => (
              <li key={`${entry.sheet}-${index}`} className="text-[0.8125rem] leading-relaxed">
                <span className="font-medium text-[var(--text-primary)]">{entry.sheet}</span>
                <span className="text-[var(--text-secondary)]"> — {entry.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="sm" disabled={pending}>
      {pending ? 'Reading the workbook…' : 'Import workbook'}
    </Button>
  );
}
