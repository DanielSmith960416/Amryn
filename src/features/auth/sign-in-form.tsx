'use client';

import { useActionState } from 'react';
import { signInAction } from './actions';
import { Field, FormMessage } from './fields';
import { Submit } from './sign-up-form';
import type { FormState } from './schemas';

export function SignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState<FormState, FormData>(signInAction, {});

  return (
    <form action={action} className="space-y-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {state.message ? <FormMessage>{state.message}</FormMessage> : null}

      <Field
        label="Work email"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={state.errors?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.errors?.password}
      />

      <Submit label="Sign in" pending="Signing in…" />
    </form>
  );
}
