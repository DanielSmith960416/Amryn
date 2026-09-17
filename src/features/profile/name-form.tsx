'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/field';
import { updateName } from './actions';
import type { ProfileState } from './schemas';
import { Outcome } from './outcome';

const idle: ProfileState = { status: 'idle' };

/**
 * The name Amryn greets you by.
 *
 * Two fields where there used to be a read-only row. The surname is marked
 * optional in the label rather than only in the validation, because a form
 * that accepts something and does not say so still reads as a demand.
 */
export function NameForm({
  firstName,
  lastName,
}: {
  firstName: string | null;
  lastName: string | null;
}) {
  const [state, action] = useActionState(updateName, idle);

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            name="firstName"
            defaultValue={firstName ?? ''}
            autoComplete="given-name"
            maxLength={80}
            required
          />
        </div>
        <div>
          <Label htmlFor="lastName">
            Last name{' '}
            <span className="font-normal text-[var(--text-tertiary)]">(optional)</span>
          </Label>
          <Input
            id="lastName"
            name="lastName"
            defaultValue={lastName ?? ''}
            autoComplete="family-name"
            maxLength={80}
          />
        </div>
      </div>

      <Outcome state={state} />
      <Save label="Save name" />
    </form>
  );
}

function Save({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="sm" disabled={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  );
}
