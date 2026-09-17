'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/field';
import { updateDateOfBirth } from './actions';
import type { ProfileState } from './schemas';
import { Outcome } from './outcome';

const idle: ProfileState = { status: 'idle' };

/**
 * A date of birth, and a plain way to take it back.
 *
 * ── the copy is the compliance ────────────────────────────────────────────
 * POPIA asks that personal information be collected for a stated purpose and
 * no other, and that giving it be a choice. Three things here carry that, and
 * none of them is a link to a policy page:
 *
 *   · the field is labelled optional, and nothing refuses to save without it;
 *   · the purpose is written beside the field in the words it will actually be
 *     used for — a greeting on the day, and nothing else;
 *   · clearing it is the same form and the same button, not a request to
 *     somebody at Amryn.
 *
 * The same sentence is on the column comment in migration 46, which is where
 * it will still be legible long after this component has been rewritten.
 */
export function DateOfBirthForm({ dateOfBirth }: { dateOfBirth: string | null }) {
  const [state, action] = useActionState(updateDateOfBirth, idle);

  return (
    <form action={action} className="space-y-4">
      <div className="max-w-[16rem]">
        <Label htmlFor="dateOfBirth">
          Date of birth{' '}
          <span className="font-normal text-[var(--text-tertiary)]">(optional)</span>
        </Label>
        <Input
          id="dateOfBirth"
          name="dateOfBirth"
          type="date"
          defaultValue={dateOfBirth ?? ''}
          max={new Date().toISOString().slice(0, 10)}
          aria-describedby="dob-purpose"
        />
      </div>

      <p id="dob-purpose" className="text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
        Used only to wish you a happy birthday on the day. It is never used to
        segment you, to price anything, or to check your age, and it is not
        shared with anyone. Leave it empty — or clear it later — and nothing in
        Amryn behaves differently.
      </p>

      <Outcome state={state} />
      <Save saved={Boolean(dateOfBirth)} />
    </form>
  );
}

function Save({ saved }: { saved: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="sm" disabled={pending}>
      {pending ? 'Saving…' : saved ? 'Update date' : 'Save date'}
    </Button>
  );
}
