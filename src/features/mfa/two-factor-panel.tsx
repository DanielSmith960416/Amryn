'use client';

import Image from 'next/image';
import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/field';
import { AuthError } from '@/features/auth/auth-error';
import {
  beginEnrolment,
  confirmEnrolment,
  disableTwoFactor,
  regenerateRecoveryCodes,
  type EnrolState,
} from './actions';

/**
 * Turning two-step sign-in on, and everything that follows from it.
 *
 * Three states in one component because they are one flow: scan, confirm, then
 * the codes — and the codes are the only screen in the platform that cannot be
 * shown again, so it is deliberately the hardest one to leave by accident.
 */
export function TwoFactorPanel({
  enabled,
  remainingCodes,
}: {
  enabled: boolean;
  remainingCodes: number;
}) {
  const [state, setState] = useState<EnrolState>({ status: 'idle' });
  const [starting, startTransition] = useTransition();

  if (state.status === 'enabled') {
    return <RecoveryCodes codes={state.codes} heading="Two-step sign-in is on" />;
  }

  if (state.status === 'enrolling') {
    return <Confirm state={state} onCancel={() => setState({ status: 'idle' })} />;
  }

  if (enabled) return <WhenOn remainingCodes={remainingCodes} />;

  return (
    <div className="space-y-3">
      {state.status === 'error' ? <AuthError message={state.message} /> : null}
      <Button
        variant="primary"
        disabled={starting}
        onClick={() => startTransition(async () => setState(await beginEnrolment()))}
      >
        {starting ? 'Setting up…' : 'Turn on two-step sign-in'}
      </Button>
      <p className="text-[0.8125rem] text-[var(--text-tertiary)]">
        You will need an authenticator app — Google Authenticator, Microsoft Authenticator, 1Password
        and Authy all work.
      </p>
    </div>
  );
}

/** Step one: scan the code, then prove the app is producing the right numbers. */
function Confirm({
  state,
  onCancel,
}: {
  state: Extract<EnrolState, { status: 'enrolling' }>;
  onCancel: () => void;
}) {
  const [result, action] = useActionState(confirmEnrolment, state);
  const [showSecret, setShowSecret] = useState(false);

  // confirmEnrolment returns the finished state, which the parent cannot see
  // from in here — so this branch renders it.
  if (result.status === 'enabled') {
    return <RecoveryCodes codes={result.codes} heading="Two-step sign-in is on" />;
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="factorId" value={state.factorId} />

      <div className="flex flex-wrap items-start gap-5">
        {/* Supabase returns the QR as an SVG data URI, so there is no library
            to load and nothing leaves the page. */}
        <Image
          src={state.qrCode}
          alt="Scan this with your authenticator app"
          width={180}
          height={180}
          unoptimized
          className="rounded-lg border border-[var(--border)] bg-white p-2"
        />

        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
            Scan this with your authenticator app, then enter the six-digit code it shows.
          </p>
          <button
            type="button"
            onClick={() => setShowSecret((shown) => !shown)}
            className="text-[0.8125rem] text-[var(--brand)] hover:underline"
          >
            {showSecret ? 'Hide the setup key' : 'I cannot scan it'}
          </button>
          {showSecret ? (
            <code className="block rounded bg-[var(--card-inset)] px-2 py-1.5 font-mono text-[0.75rem] break-all text-[var(--text-primary)]">
              {state.secret}
            </code>
          ) : null}
        </div>
      </div>

      <div className="max-w-[14rem]">
        <Label htmlFor="code">Code from the app</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="[0-9]{6}"
          required
          className="text-center font-mono text-[1.125rem] tracking-[0.3em]"
        />
      </div>

      {result.status === 'error' ? <AuthError message={result.message} /> : null}

      <div className="flex flex-wrap gap-3">
        <Confirming />
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Confirming() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? 'Checking…' : 'Confirm'}
    </Button>
  );
}

/**
 * The one screen that cannot be shown again.
 *
 * Only hashes are stored, so there is no route by which the platform could
 * redisplay these — which is the point. It says so plainly rather than letting
 * somebody discover it when they are locked out.
 */
function RecoveryCodes({ codes, heading }: { codes: string[]; heading: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div
      className="rounded-[var(--radius-card)] border p-5"
      style={{ borderColor: 'var(--positive)', background: 'var(--card-inset)' }}
      role="status"
    >
      <p className="text-[0.9375rem] font-medium text-[var(--text-primary)]">{heading}</p>
      <p className="mt-1.5 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
        Save these recovery codes somewhere safe — a password manager, or printed and filed. Each
        works once, and they are the way back in if you lose your phone.{' '}
        <strong className="text-[var(--text-primary)]">
          We cannot show them to you again: only a scrambled form is stored.
        </strong>
      </p>

      <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        {codes.map((code) => (
          <li key={code} className="font-mono text-[0.8125rem] text-[var(--text-primary)]">
            {code}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            // Clipboard access can be refused outright, so the codes stay
            // selectable and the label says what happened either way.
            navigator.clipboard
              ?.writeText(codes.join('\n'))
              .then(() => setCopied(true))
              .catch(() => setCopied(false));
          }}
        >
          {copied ? 'Copied' : 'Copy all'}
        </Button>
        <Button type="button" variant="primary" onClick={() => window.location.reload()}>
          I have saved them
        </Button>
      </div>
    </div>
  );
}

/** Already on: new codes, or turn it off. */
function WhenOn({ remainingCodes }: { remainingCodes: number }) {
  const [codes, setCodes] = useState<string[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmingOff, setConfirmingOff] = useState(false);
  const [busy, startTransition] = useTransition();

  if (codes) return <RecoveryCodes codes={codes} heading="Your new recovery codes" />;

  return (
    <div className="space-y-4">
      {remainingCodes <= 2 ? (
        <p
          className="rounded-lg px-3 py-2 text-[0.8125rem] leading-relaxed"
          style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}
          role="status"
        >
          {remainingCodes === 0
            ? 'You have no recovery codes left. If you lose your phone now, you will need an administrator to get you back in.'
            : `Only ${remainingCodes} recovery ${remainingCodes === 1 ? 'code' : 'codes'} left. Generate a new set while you still can.`}
        </p>
      ) : null}

      {problem ? <AuthError message={problem} /> : null}

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() =>
            startTransition(async () => {
              const result = await regenerateRecoveryCodes();
              if (result.status === 'issued') setCodes(result.codes);
              else setProblem(result.message);
            })
          }
        >
          {busy ? 'Working…' : 'Generate new recovery codes'}
        </Button>

        {confirmingOff ? (
          <>
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={() =>
                startTransition(async () => {
                  const result = await disableTwoFactor();
                  if (result.status === 'error') setProblem(result.message);
                  else window.location.reload();
                })
              }
            >
              Yes, turn it off
            </Button>
            <Button type="button" variant="secondary" onClick={() => setConfirmingOff(false)}>
              Keep it on
            </Button>
          </>
        ) : (
          <Button type="button" variant="ghost" onClick={() => setConfirmingOff(true)}>
            Turn off two-step sign-in
          </Button>
        )}
      </div>

      {confirmingOff ? (
        <p className="text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
          Your password becomes the only thing protecting this workspace again. Your recovery codes
          stop working too.
        </p>
      ) : null}
    </div>
  );
}
