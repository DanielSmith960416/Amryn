import { cn } from '@/lib/utils/cn';
import type { ComponentPropsWithoutRef } from 'react';

export function Label({ className, ...props }: ComponentPropsWithoutRef<'label'>) {
  return (
    <label
      className={cn('mb-1.5 block text-[0.8125rem] font-medium text-[var(--text-primary)]', className)}
      {...props}
    />
  );
}

export function Input({ className, ...props }: ComponentPropsWithoutRef<'input'>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--card)] px-3',
        'text-[0.875rem] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]',
        'transition-colors focus:border-[var(--brand)] focus:outline-none',
        'disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentPropsWithoutRef<'textarea'>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-lg border border-[var(--border-strong)] bg-[var(--card)] px-3 py-2',
        'text-[0.875rem] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]',
        'transition-colors focus:border-[var(--brand)] focus:outline-none',
        className,
      )}
      {...props}
    />
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 text-[0.75rem] text-[var(--negative)]" role="alert">
      {message}
    </p>
  );
}

/**
 * A checkbox with its label beside it.
 *
 * The whole label is the hit target, and the accent colour is the brand's, so
 * a ticked box reads as ticked in every theme. Children rather than a string,
 * because the one place this matters most — accepting terms — needs links
 * inside the label, and a label you cannot read the terms from is a tick box
 * for something else.
 */
export function Checkbox({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<'input'> & { children: React.ReactNode }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2.5', className)}>
      <input
        type="checkbox"
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--border-strong)]',
          'accent-[var(--brand)] focus:outline-none focus-visible:ring-2',
          'focus-visible:ring-[var(--brand)] focus-visible:ring-offset-1',
        )}
        {...props}
      />
      <span className="text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
        {children}
      </span>
    </label>
  );
}
