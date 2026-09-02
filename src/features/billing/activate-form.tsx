'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { activateSubscription, type ActivateState } from './activate';

export function ActivateForm({ token, planName }: { token: string; planName: string }) {
  const [state, action] = useActionState(activateSubscription, { status: 'idle' } as ActivateState);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      {state.status === 'error' ? (
        <p className="text-[0.8125rem] leading-relaxed text-[var(--negative)]" role="alert">
          {state.message}
        </p>
      ) : null}

      <Submit planName={planName} />
    </form>
  );
}

function Submit({ planName }: { planName: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? 'Starting…' : `Start ${planName}`}
    </Button>
  );
}
