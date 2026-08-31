'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/field';
import { requestPasswordReset } from './actions';
import type { ActionState } from './schemas';
import { AuthError } from './auth-error';

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, { status: 'idle' } as ActionState);

  if (state.status === 'sent') {
    return (
      <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card-inset)] p-5">
        <p className="text-[0.875rem] font-medium text-[var(--text-primary)]">Check your inbox</p>
        <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
          {state.message}
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@company.co.za"
        />
      </div>

      {state.status === 'error' ? <AuthError message={state.message} /> : null}

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" className="w-full" disabled={pending}>
      {pending ? 'Sending…' : 'Send a reset link'}
    </Button>
  );
}
