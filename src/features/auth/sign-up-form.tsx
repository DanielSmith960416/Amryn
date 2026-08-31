'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { signUpAction } from './actions';
import { Field, FormMessage } from './fields';
import type { FormState } from './schemas';

/**
 * Sign-up: four fields, then straight into the Command Centre.
 *
 * The brief asks that onboarding stay simple and lead into the platform, so
 * there is no verification step, no organisation wizard and no plan chooser
 * between here and the workspace. Validation runs on the server through the
 * action, which means it holds whether or not the client script loaded.
 */
export function SignUpForm({ next }: { next?: string }) {
  const [state, action] = useActionState<FormState, FormData>(signUpAction, {});

  return (
    <form action={action} className="space-y-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {state.message ? <FormMessage>{state.message}</FormMessage> : null}

      <Field
        label="Your name"
        name="fullName"
        autoComplete="name"
        required
        error={state.errors?.fullName}
      />
      <Field
        label="Business name"
        name="companyName"
        autoComplete="organization"
        required
        error={state.errors?.companyName}
        hint="This names your workspace. You can change it later in Settings."
      />
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
        autoComplete="new-password"
        required
        error={state.errors?.password}
        hint="At least 12 characters. A short phrase you will remember works well."
      />

      <Submit label="Create account" pending="Creating your workspace…" />
    </form>
  );
}

export function Submit({ label, pending }: { label: string; pending: string }) {
  // useFormStatus reads the enclosing form, so this has to be its own component
  // rendered inside the form rather than a prop on it.
  const status = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      size="lg"
      className="w-full"
      disabled={status.pending}
    >
      {status.pending ? pending : label}
    </Button>
  );
}
