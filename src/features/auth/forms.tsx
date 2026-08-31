'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { readProfile, storageAvailable, writeProfile } from '@/lib/profile';
import { Field, FormMessage } from './fields';

/**
 * Opening the platform, and coming back to it.
 *
 * Neither form authenticates anyone — there is no server to authenticate
 * against. See `src/lib/profile.ts` for why, and for why no password is asked
 * for: asking for one would look like security while checking nothing.
 *
 * Validation is deliberately light. The only thing that has to be true is that
 * there is a name to greet you by and a business to name the workspace after.
 */

const DEFAULT_DESTINATION = '/command-centre';

function safeNext(next: string | undefined): string {
  // Only a relative, single-slash path. `//evil.example` is protocol-relative
  // and browsers treat it as absolute, so it has to be rejected too.
  return next && next.startsWith('/') && !next.startsWith('//') ? next : DEFAULT_DESTINATION;
}

export function OpenPlatformForm({ next }: { next?: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const fullName = String(data.get('fullName') ?? '').trim();
    const companyName = String(data.get('companyName') ?? '').trim();
    const email = String(data.get('email') ?? '').trim();

    const found: Record<string, string> = {};
    if (!fullName) found.fullName = 'Enter your name.';
    if (fullName.length > 120) found.fullName = 'That name is too long.';
    if (!companyName) found.companyName = 'Enter your business name.';
    if (companyName.length > 160) found.companyName = 'That business name is too long.';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      found.email = 'Enter a valid email address, or leave it blank.';
    }

    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const stored = writeProfile({
      fullName,
      companyName,
      email,
      since: new Date().toISOString(),
    });

    if (!stored) {
      // Pushing on would land them in the platform and bounce them straight
      // back out, with no explanation. Better to say what happened.
      setMessage(
        'This browser will not let the site store anything, so it cannot remember you. ' +
          'Private browsing and blocked site data both do this. Try a normal window.',
      );
      return;
    }

    router.push(safeNext(next));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {message ? <FormMessage>{message}</FormMessage> : null}

      <Field label="Your name" name="fullName" autoComplete="name" required error={errors.fullName} />
      <Field
        label="Business name"
        name="companyName"
        autoComplete="organization"
        required
        error={errors.companyName}
        hint="This names your workspace. You can change it later in Settings."
      />
      <Field
        label="Work email"
        name="email"
        type="email"
        autoComplete="email"
        error={errors.email}
        hint="Optional. Shown in your account menu; it is never sent anywhere."
      />

      <Button type="submit" variant="primary" size="lg" className="w-full">
        Open the platform
      </Button>
    </form>
  );
}

/**
 * The return path for someone whose device already remembers them.
 *
 * If it does not, there is nothing to sign in to — so this says so and offers
 * the form that does the remembering, rather than failing at a password
 * prompt that was never going to check anything.
 */
export function ReturnForm({ next }: { next?: string }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'missing' | 'blocked'>('idle');

  function onContinue() {
    if (!storageAvailable()) {
      setState('blocked');
      return;
    }
    if (!readProfile()) {
      setState('missing');
      return;
    }
    router.push(safeNext(next));
  }

  return (
    <div className="space-y-4">
      {state === 'missing' ? (
        <FormMessage>
          This device does not have a workspace yet. Open one below — it takes a moment and needs
          no password.
        </FormMessage>
      ) : null}
      {state === 'blocked' ? (
        <FormMessage>
          This browser will not let the site store anything, so it cannot remember a workspace.
          Private browsing and blocked site data both do this.
        </FormMessage>
      ) : null}

      <Button type="button" variant="primary" size="lg" className="w-full" onClick={onContinue}>
        Continue to the platform
      </Button>
    </div>
  );
}
