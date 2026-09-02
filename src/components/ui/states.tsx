import { cn } from '@/lib/utils/cn';
import type { ReactNode } from 'react';
import { Card } from './card';

/**
 * Loading, empty and error states (specification §32 and §33).
 *
 * Every card in the platform supports all three. They live here so that the
 * platform says the same kind of thing in the same voice everywhere — and so
 * that "we are working" is specific about what is being worked on, rather than
 * a spinner that could mean anything.
 */

/** Skeleton block. Never announces itself to a screen reader. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative overflow-hidden rounded-md bg-[var(--card-inset)]',
        'animate-sweep',
        className,
      )}
    />
  );
}

export function CardSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <Card className={cn('p-5', className)} aria-busy="true">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-40" />
      <div className="mt-5 space-y-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className={cn('h-3', i % 2 === 0 ? 'w-full' : 'w-4/5')} />
        ))}
      </div>
    </Card>
  );
}

/**
 * The AI-specific loading state. The specification is explicit that a spinner
 * is not enough: the reader should know which of several slow things is
 * happening.
 */
export function AnalysingState({
  message = 'Amryn AI is analysing business performance',
  className,
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div
      className={cn('flex items-center gap-3 px-5 py-8 text-[var(--text-secondary)]', className)}
      role="status"
    >
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center">
        <span className="absolute inset-0 rounded-full border border-[var(--border-strong)]" />
        <span className="animate-radar absolute inset-0 rounded-full border-t-2 border-t-[var(--brand)]" />
        <span className="animate-soft-pulse h-1.5 w-1.5 rounded-full bg-[var(--brand)]" />
      </span>
      <span className="text-[0.875rem]">
        {message}
        <span className="animate-soft-pulse">…</span>
      </span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {icon ? (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
          {icon}
        </div>
      ) : null}
      <h4 className="text-[0.9375rem] font-semibold text-[var(--text-primary)]">{title}</h4>
      <p className="mt-2 max-w-sm text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'That did not load',
  description,
  action,
  className,
}: {
  title?: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('px-5 py-8 text-center', className)} role="alert">
      <h4 className="text-[0.9375rem] font-semibold text-[var(--negative)]">{title}</h4>
      <p className="mx-auto mt-2 max-w-sm text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
