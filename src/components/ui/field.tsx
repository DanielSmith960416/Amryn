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
