'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/field';
import { setNewPassword } from './actions';
import type { ActionState } from './schemas';
import { AuthError } from './auth-error';

export function ResetPasswordForm() {
  const [state, action] = useActionState(setNewPassword, { status: 'idle' } as ActionState);

  return (
    <form action={action} className="space-y-4">
      <div>
        <Label htmlFor="password">New password</Label>
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

      <div>
        <Label htmlFor="confirm">Repeat it</Label>
        {/* Asked for because a typo here locks someone out of the account they
            came to recover — a worse outcome than the one they arrived with. */}
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
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
      {pending ? 'Saving…' : 'Set the new password'}
    </Button>
  );
}
