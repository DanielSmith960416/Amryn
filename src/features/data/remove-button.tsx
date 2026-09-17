'use client';

import { useActionState } from 'react';
import { Trash2 } from 'lucide-react';
import { useFormStatus } from 'react-dom';
import { removeDocument, type RemoveState } from './documents';

/**
 * Taking a file back out.
 *
 * A form rather than a fetch, so it works before JavaScript has loaded and
 * without it. The confirmation is the browser's own: a custom dialog here
 * would be a second component to keep accessible for a question with two
 * answers.
 */
export function RemoveButton({ id, filename }: { id: string; filename: string }) {
  const [state, action] = useActionState(removeDocument, { status: 'idle' } as RemoveState);

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(`Remove ${filename}? The file itself is deleted, not just this entry.`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Submit filename={filename} />
      {state.status === 'error' ? (
        <p role="alert" className="mt-1 text-[0.75rem] text-[var(--negative)]">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function Submit({ filename }: { filename: string }) {
  const { pending } = useFormStatus();
  return (
    /*
      A control, not a footnote.

      This was 12px of tertiary grey, underlined, in the corner of a row — the
      lowest-contrast text on the page, for the one action on it that destroys
      something. Somebody with two copies of the same file asked to be given a
      way to delete an upload that was already there and that they could not
      find.

      It is now the size of the text it sits beside, carries the icon that
      means this everywhere else, and states its consequence on hover rather
      than only in the confirmation that follows.
    */
    <button
      type="submit"
      disabled={pending}
      title={`Delete ${filename} — the file itself, not just this entry`}
      className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--border)] px-2.5 py-1 text-[0.8125rem] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--negative)]/40 hover:bg-[var(--negative)]/8 hover:text-[var(--negative)] disabled:opacity-50"
    >
      <Trash2 className="size-3.5" aria-hidden />
      {pending ? 'Deleting…' : 'Delete'}
    </button>
  );
}
