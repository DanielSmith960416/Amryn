'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/field';
import { connectWithKey, type ConnectState } from './connect';

/**
 * Where a key is typed, and the only place it should ever be typed.
 *
 * ── the input is a password field, and that is not cosmetic ──────────────
 *
 * A secret key in a plain text input is a secret key on a screen somebody is
 * sharing, in a screenshot attached to a support ticket, and in whatever the
 * browser decides to remember. `type="password"` with autocomplete off stops
 * the last of those and makes the other two a deliberate act rather than an
 * accident.
 *
 * ── it is never sent back ────────────────────────────────────────────────
 *
 * The form resets on success and the field is uncontrolled, so nothing here
 * holds the value after submission and no state object carries it. The server
 * action returns a name and a label — never the key, and never an error
 * message with the key in it.
 */
export function KeyForm({
  connectorId,
  connectorName,
  helpUrl,
}: {
  connectorId: string;
  connectorName: string;
  helpUrl: string;
}) {
  const [state, action] = useActionState(connectWithKey, { status: 'idle' } as ConnectState);

  if (state.status === 'connected') {
    return (
      <div role="status" className="space-y-1.5">
        <p className="text-[0.9375rem] font-semibold text-[var(--positive)]">
          {state.label} is connected.
        </p>
        <p className="text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
          The key was accepted by {state.name} and stored where only Amryn&rsquo;s sync can reach
          it — not this page, and not anybody signed in. Nothing has been read from your account
          yet; the first sync is the next thing being built.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="connector" value={connectorId} />

      <div>
        <Label htmlFor="key">Your {connectorName} secret key</Label>
        <Input
          id="key"
          name="key"
          type="password"
          required
          autoComplete="off"
          spellCheck={false}
          placeholder={`Paste it from your ${connectorName} dashboard`}
        />
        <p className="mt-1.5 text-[0.75rem] leading-relaxed text-[var(--text-tertiary)]">
          Start with a test key if you have one. Amryn checks it against{' '}
          {connectorName} before saving anything, so a mistyped key costs you nothing but the
          message below.
        </p>
      </div>

      {state.status === 'error' ? (
        <p role="alert" className="text-[0.8125rem] leading-relaxed text-[var(--negative)]">
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Submit name={connectorName} />
        <a
          href={helpUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="text-[0.8125rem] text-[var(--brand)] underline-offset-2 hover:underline"
        >
          {connectorName} documentation
        </a>
      </div>
    </form>
  );
}

function Submit({ name }: { name: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? `Checking with ${name}…` : 'Connect'}
    </Button>
  );
}
