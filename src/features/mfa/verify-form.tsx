'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/field';
import { AuthError } from '@/features/auth/auth-error';
import { useRecoveryCode, verifyChallenge, type VerifyState } from './actions';

/**
 * Asking for the second factor.
 *
 * Two ways through, and the second one matters more than its prominence
 * suggests: somebody reaching this page without their phone is locked out of
 * their business, and a recovery route they cannot find is one they do not
 * have. It is one click away, not hidden behind a support address.
 */
export function VerifyForm({ next }: { next: string }) {
  const [usingRecovery, setUsingRecovery] = useState(false);

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-12">
      <h1 className="text-[1.5rem] font-semibold text-[var(--text-primary)]">
        {usingRecovery ? 'Use a recovery code' : 'One more step'}
      </h1>
      <p className="mt-1.5 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
        {usingRecovery
          ? 'Enter one of the codes you saved when you set this up. Each one works once, and using it will turn two-step sign-in off so you can set it up again.'
          : 'Open your authenticator app and enter the six-digit code for Amryn.'}
      </p>

      <div className="mt-7">
        {usingRecovery ? <RecoveryFields /> : <CodeFields next={next} />}
      </div>

      <button
        type="button"
        onClick={() => setUsingRecovery((using) => !using)}
        className="mt-6 text-center text-[0.8125rem] text-[var(--brand)] hover:underline"
      >
        {usingRecovery ? 'Enter a code from my app instead' : 'I do not have my phone'}
      </button>
    </div>
  );
}

function CodeFields({ next }: { next: string }) {
  const [state, action] = useActionState(verifyChallenge, { status: 'idle' } as VerifyState);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <Label htmlFor="code">Six-digit code</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="[0-9]{6}"
          // The first thing on the page, because it is the only thing being
          // asked for and the code expires while you look for the field.
          autoFocus
          required
          className="text-center font-mono text-[1.25rem] tracking-[0.3em]"
        />
      </div>

      {state.status === 'error' ? <AuthError message={state.message} /> : null}

      <Submit idle="Continue" busy="Checking…" />
    </form>
  );
}

function RecoveryFields() {
  const [state, action] = useActionState(useRecoveryCode, { status: 'idle' } as VerifyState);

  return (
    <form action={action} className="space-y-4">
      <div>
        <Label htmlFor="recovery">Recovery code</Label>
        <Input
          id="recovery"
          name="code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="ACDE-F467-HJKM-NPQR"
          required
          className="text-center font-mono tracking-wider"
        />
        <p className="mt-1.5 text-[0.75rem] text-[var(--text-tertiary)]">
          Capitals, hyphens and spaces do not matter.
        </p>
      </div>

      {state.status === 'error' ? <AuthError message={state.message} /> : null}

      <Submit idle="Use this code" busy="Checking…" />
    </form>
  );
}

function Submit({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
      {pending ? busy : idle}
    </Button>
  );
}
