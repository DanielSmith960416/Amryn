'use client';

import { useId, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * The form field.
 *
 * Two accessibility details it exists to get right consistently: the error is
 * wired to the input through `aria-describedby` so a screen reader hears it
 * when focus lands, and `aria-invalid` marks the field rather than relying on
 * a red border that a colour-blind reader may not see.
 */
export function Field({
  label,
  error,
  hint,
  ...props
}: ComponentPropsWithoutRef<'input'> & {
  label: string;
  error?: string;
  hint?: ReactNode;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[0.8125rem] font-medium text-[var(--text-primary)]"
      >
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(error && errorId, hint && hintId) || undefined}
        className={cn(
          'h-10 w-full rounded-lg border bg-[var(--card)] px-3 text-[0.875rem] text-[var(--text-primary)]',
          'placeholder:text-[var(--text-tertiary)]',
          'transition-colors focus:border-[var(--brand)] focus:outline-none',
          error ? 'border-[var(--negative)]' : 'border-[var(--border-strong)]',
        )}
        {...props}
      />
      {hint && !error ? (
        <p id={hintId} className="mt-1.5 text-[0.75rem] text-[var(--text-tertiary)]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1.5 text-[0.75rem] text-[var(--negative)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A submission-level message — the one that is not about a single field. */
export function FormMessage({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-[var(--negative)] bg-[var(--negative-soft)] px-3 py-2.5 text-[0.8125rem] text-[var(--negative)]"
    >
      {children}
    </p>
  );
}
