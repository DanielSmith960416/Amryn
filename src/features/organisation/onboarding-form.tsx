'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Checkbox, Input, Label } from '@/components/ui/field';
import { createOrganisation, type OnboardingState } from './actions';
import { AuthError } from '@/features/auth/auth-error';

export function OnboardingForm() {
  const [state, action] = useActionState(createOrganisation, {
    status: 'idle',
  } as OnboardingState);

  return (
    <form action={action} className="space-y-4">
      <div>
        <Label htmlFor="name">Organisation name</Label>
        <Input id="name" name="name" required minLength={2} placeholder="Highveld Supply Co." />
      </div>

      <div>
        <Label htmlFor="industry">Industry</Label>
        <Input id="industry" name="industry" placeholder="Wholesale distribution" />
        <p className="mt-1.5 text-[0.75rem] text-[var(--text-tertiary)]">
          Used to judge which market signals are relevant to you.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="countryCode">Country</Label>
          <Input
            id="countryCode"
            name="countryCode"
            defaultValue="ZA"
            maxLength={2}
            className="uppercase"
          />
        </div>
        <div>
          <Label htmlFor="currencyCode">Currency</Label>
          <Input
            id="currencyCode"
            name="currencyCode"
            defaultValue="ZAR"
            maxLength={3}
            className="uppercase"
          />
        </div>
      </div>

      {/* The organisation is agreeing, not the person — so this is asked
          separately from the terms they accepted when they signed up, and the
          label says on whose behalf it is being given. */}
      <Checkbox name="acceptedDpa" required className="pt-1">
        I am authorised to act for this organisation, and I accept the{' '}
        <Link
          href="/legal/dpa"
          target="_blank"
          className="font-medium text-[var(--brand)] hover:underline"
        >
          Data Processing Addendum
        </Link>{' '}
        on its behalf.
      </Checkbox>

      {state.status === 'error' ? (
        <AuthError message={state.message} />
      ) : null}

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
      {pending ? 'Creating your workspace…' : 'Create organisation'}
    </Button>
  );
}
