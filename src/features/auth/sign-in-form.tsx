'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/field';
import { signInWithMagicLink, signInWithPassword, signInWithProvider } from './actions';
import type { ActionState } from './schemas';
import { AuthError } from './auth-error';

const idle: ActionState = { status: 'idle' };

export function SignInForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<'password' | 'magic'>('password');
  const [passwordState, passwordAction] = useActionState(signInWithPassword, idle);
  const [magicState, magicAction] = useActionState(signInWithMagicLink, idle);

  const state = mode === 'password' ? passwordState : magicState;

  return (
    <div className="space-y-5">
      <form action={mode === 'password' ? passwordAction : magicAction} className="space-y-4">
        {/* Carried through so an invitation survives signing in.
            Validated server-side; never used as given. */}
        {next ? <input type="hidden" name="next" value={next} /> : null}
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

        {mode === 'password' ? (
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
        ) : null}

        {state.status === 'error' ? (
          <AuthError message={state.message} />
        ) : null}

        {state.status === 'sent' ? (
          <p className="text-[0.8125rem] text-[var(--positive)]" role="status">
            {state.message}
          </p>
        ) : null}

        <Submit label={mode === 'password' ? 'Sign in' : 'Email me a link'} />
      </form>

      <button
        type="button"
        onClick={() => setMode(mode === 'password' ? 'magic' : 'password')}
        className="w-full text-center text-[0.8125rem] text-[var(--text-secondary)] hover:text-[var(--brand)]"
      >
        {mode === 'password' ? 'Email me a sign-in link instead' : 'Use a password instead'}
      </button>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-[var(--border)]" />
        <span className="eyebrow !mb-0">or</span>
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>

      <div className="grid gap-2">
        <form action={signInWithProvider}>
          <input type="hidden" name="provider" value="google" />
          <Button type="submit" variant="secondary" className="w-full">
            Continue with Google
          </Button>
        </form>
        <form action={signInWithProvider}>
          <input type="hidden" name="provider" value="azure" />
          <Button type="submit" variant="secondary" className="w-full">
            Continue with Microsoft
          </Button>
        </form>
      </div>
    </div>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
      {pending ? 'One moment…' : label}
    </Button>
  );
}
