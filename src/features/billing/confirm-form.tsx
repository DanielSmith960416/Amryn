'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { confirmPayment, type ConfirmState } from './actions';

/**
 * Confirms one payment and shows the activation link once.
 *
 * The link is not stored anywhere it can be read back — only a hash of it
 * reaches the database — so this is the single moment it exists in a form
 * anybody can copy. The wording says so plainly rather than leaving somebody
 * to discover it by navigating away.
 */
export function ConfirmPaymentForm({ id, accessKey }: { id: string; accessKey?: string }) {
  const [state, action] = useActionState(confirmPayment, { status: 'idle' } as ConfirmState);

  if (state.status === 'confirmed') {
    return (
      <div className="rounded-lg border border-[var(--positive)]/30 bg-[var(--positive)]/8 px-4 py-3">
        <p className="text-[0.8125rem] font-medium text-[var(--text-primary)]">
          {state.reference} confirmed for {state.organisation}
        </p>
        <p className="mt-1 text-[0.75rem] text-[var(--text-secondary)]">
          Send this link to whoever arranged the payment. It works once, and it is not shown
          again.
        </p>
        <code className="mt-2 block overflow-x-auto rounded bg-[var(--card-inset)] px-3 py-2 text-[0.75rem] text-[var(--text-primary)]">
          {state.link}
        </code>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="id" value={id} />
      {accessKey ? <input type="hidden" name="key" value={accessKey} /> : null}
      <Input
        name="note"
        placeholder="How it was matched — bank, date, amount"
        className="h-9 min-w-0 flex-1 text-[0.8125rem]"
      />
      <Submit />
      {state.status === 'error' ? (
        <p className="basis-full text-[0.75rem] text-[var(--negative)]" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="sm" disabled={pending}>
      {pending ? 'Confirming…' : 'Confirm payment'}
    </Button>
  );
}
