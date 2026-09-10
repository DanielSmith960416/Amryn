'use client';

import { useActionState } from 'react';
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
      <Submit />
      {state.status === 'error' ? (
        <p role="alert" className="mt-1 text-[0.75rem] text-[var(--negative)]">
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
      className="text-[0.75rem] text-[var(--text-tertiary)] underline underline-offset-2 hover:text-[var(--negative)] disabled:opacity-50"
    >
      {pending ? 'Removing…' : 'Remove'}
    </button>
  );
}
