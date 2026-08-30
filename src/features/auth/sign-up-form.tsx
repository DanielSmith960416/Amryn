'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/field';
import { signUpWithPassword } from './actions';
import type { ActionState } from './schemas';

export function SignUpForm() {
  const [state, action] = useActionState(signUpWithPassword, { status: 'idle' } as ActionState);

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
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" name="fullName" autoComplete="name" required />
      </div>

      <div>
        <Label htmlFor="email">Work email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>

      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <p className="mt-1.5 text-[0.75rem] text-[var(--text-tertiary)]">At least 8 characters.</p>
      </div>

      {state.status === 'error' ? (
        <p className="text-[0.8125rem] text-[var(--negative)]" role="alert">
          {state.message}
        </p>
      ) : null}

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
      {pending ? 'Creating your account…' : 'Create account'}
    </Button>
  );
}
