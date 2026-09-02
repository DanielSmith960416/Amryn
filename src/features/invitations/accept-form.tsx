'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { acceptInvitation, type AcceptState } from './accept';

export function AcceptForm({ token, organisation }: { token: string; organisation: string }) {
  const [state, action] = useActionState(acceptInvitation, { status: 'idle' } as AcceptState);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      {state.status === 'error' ? (
        <p className="text-[0.8125rem] leading-relaxed text-[var(--negative)]" role="alert">
          {state.message}
        </p>
      ) : null}

      <Submit organisation={organisation} />
    </form>
  );
}

function Submit({ organisation }: { organisation: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? 'Joining…' : `Join ${organisation}`}
    </Button>
  );
}
