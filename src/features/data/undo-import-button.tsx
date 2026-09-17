'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Undo2 } from 'lucide-react';
import { undoImport, type UndoState } from './undo-import';

/**
 * Undoing an import, from the row that records it.
 *
 * The confirmation says the number of records rather than asking a vague
 * question about an import: "remove 158 records" is a thing somebody can
 * weigh, and "undo this import?" is not.
 */
export function UndoImportButton({
  id,
  filename,
  rows,
}: {
  id: string;
  filename: string;
  rows: number;
}) {
  const [state, action] = useActionState(undoImport, { status: 'idle' } as UndoState);

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Remove the ${rows.toLocaleString('en-ZA')} ${rows === 1 ? 'record' : 'records'} ` +
              `imported from ${filename}? The file itself is kept — only the figures this import ` +
              'put into Amryn are removed, and nothing entered any other way is touched.',
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Submit />
      {state.status === 'error' ? (
        <p role="alert" className="mt-1 max-w-xs text-[0.75rem] leading-relaxed text-[var(--negative)]">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--border)] px-2.5 py-1 text-[0.8125rem] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--negative)]/40 hover:bg-[var(--negative)]/8 hover:text-[var(--negative)] disabled:opacity-50"
    >
      <Undo2 className="size-3.5" aria-hidden />
      {pending ? 'Removing…' : 'Undo'}
    </button>
  );
}
