'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Label, Textarea } from '@/components/ui/field';
import { submitDataRequest, type RequestState } from './actions';

const KINDS = [
  {
    value: 'export',
    title: 'Send me a copy',
    description: 'Everything we hold about you, sent to your account address.',
  },
  {
    value: 'correction',
    title: 'Correct something',
    description: 'Something we hold about you is wrong, out of date or misleading.',
  },
  {
    value: 'deletion',
    title: 'Delete my information',
    description: 'Remove what we hold, where there is no lawful reason to keep it.',
  },
] as const;

/**
 * Asking us to do something with your information.
 *
 * One choice, one optional sentence, one button. The rights POPIA gives are
 * not difficult to describe, and a form that makes exercising them feel like
 * an application is a way of discouraging it.
 */
export function DataRequestForm() {
  const [state, action] = useActionState(submitDataRequest, { status: 'idle' } as RequestState);
  const [kind, setKind] = useState<string>('export');

  if (state.status === 'sent') {
    return (
      <div
        className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card-inset)] p-5"
        role="status"
      >
        <p className="text-[0.875rem] font-medium text-[var(--text-primary)]">Request received</p>
        <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
          {state.message}
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-[0.8125rem] font-medium text-[var(--text-primary)]">
          What would you like us to do?
        </legend>
        <div className="space-y-2">
          {KINDS.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                kind === option.value
                  ? 'border-[var(--brand)] bg-[var(--card-inset)]'
                  : 'border-[var(--border)] hover:border-[var(--border-strong)]'
              }`}
            >
              <input
                type="radio"
                name="kind"
                value={option.value}
                checked={kind === option.value}
                onChange={(event) => setKind(event.target.value)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
              />
              <span>
                <span className="block text-[0.875rem] font-medium text-[var(--text-primary)]">
                  {option.title}
                </span>
                <span className="mt-0.5 block text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <Label htmlFor="note">
          Anything we should know?{' '}
          <span className="font-normal text-[var(--text-tertiary)]">Optional</span>
        </Label>
        <Textarea
          id="note"
          name="note"
          rows={3}
          maxLength={2000}
          placeholder={
            kind === 'correction'
              ? 'What is wrong, and what should it say instead?'
              : 'Anything that would help us answer you properly.'
          }
        />
      </div>

      {state.status === 'error' ? (
        <p className="text-[0.8125rem] text-[var(--negative)]" role="alert">
          {state.message}
        </p>
      ) : null}

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? 'Sending…' : 'Send request'}
    </Button>
  );
}
