'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/field';
import { changePassword } from './actions';
import { passwordStrength, type ProfileState } from './schemas';
import { Outcome } from './outcome';

const idle: ProfileState = { status: 'idle' };

/**
 * Changing the password without leaving the account.
 *
 * The current one is asked for first. That is not ceremony: without it, a
 * session left open on a borrowed machine is enough to change the password and
 * lock the owner out of their own business. The server verifies it rather than
 * trusting this form — see changePassword() — and this field exists so the
 * requirement is visible rather than surprising.
 *
 * The meter is advice. Eight characters is the rule, here and in the reset
 * flow and on Supabase's side, and the meter never blocks a submission: a
 * gauge that refuses a long passphrase for having no digit teaches people to
 * put a 1 on the end of a short password.
 */
export function PasswordForm() {
  const [state, action] = useActionState(changePassword, idle);
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);

  const strength = password ? passwordStrength(password) : null;

  return (
    <form action={action} className="max-w-md space-y-4">
      <div>
        <Label htmlFor="current">Current password</Label>
        <Input id="current" name="current" type="password" autoComplete="current-password" required />
      </div>

      <div>
        <Label htmlFor="password">New password</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={visible ? 'text' : 'password'}
            autoComplete="new-password"
            minLength={8}
            required
            className="pr-10"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby="password-strength"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setVisible((shown) => !shown)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
        <Strength strength={strength} />
      </div>

      <div>
        <Label htmlFor="confirm">New password again</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>

      <Outcome state={state} />
      <Save />
    </form>
  );
}

/**
 * Three segments rather than a percentage, because a password is not 61% safe
 * and a number invites somebody to tune it. The words carry the meaning and
 * the colour agrees with them, so this reads the same to anybody who cannot
 * tell the two greens apart.
 */
function Strength({ strength }: { strength: ReturnType<typeof passwordStrength> | null }) {
  const filled = strength === 'strong' ? 3 : strength === 'fair' ? 2 : strength === 'weak' ? 1 : 0;
  const colour =
    strength === 'strong'
      ? 'var(--positive)'
      : strength === 'fair'
        ? 'var(--brand)'
        : 'var(--negative)';

  return (
    <div id="password-strength" className="mt-2 flex items-center gap-2" aria-live="polite">
      <div className="flex flex-1 gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1 flex-1 rounded-full transition-colors"
            style={{ background: i < filled ? colour : 'var(--border)' }}
          />
        ))}
      </div>
      <span className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
        {strength ?? ''}
      </span>
    </div>
  );
}

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="sm" disabled={pending}>
      {pending ? 'Changing…' : 'Change password'}
    </Button>
  );
}
