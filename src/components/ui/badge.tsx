import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils/cn';
import type { Enums } from '@/types/database';

const badge = cva(
  'inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2 py-0.5 ' +
    'font-mono text-[0.6875rem] font-medium tracking-wide whitespace-nowrap uppercase',
  {
    variants: {
      tone: {
        neutral: 'bg-[var(--card-inset)] text-[var(--text-secondary)]',
        brand: 'bg-[var(--brand-soft)] text-[var(--brand)]',
        positive: 'bg-[var(--positive-soft)] text-[var(--positive)]',
        warning: 'bg-[var(--warning-soft)] text-[var(--warning)]',
        negative: 'bg-[var(--negative-soft)] text-[var(--negative)]',
        info: 'bg-[var(--info-soft)] text-[var(--info)]',
        outline: 'border border-[var(--border-strong)] text-[var(--text-secondary)]',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends ComponentPropsWithoutRef<'span'>,
    VariantProps<typeof badge> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}

/** Severity has one colour across the whole platform. */
export const PRIORITY_TONE: Readonly<Record<Enums['priority_level'], BadgeProps['tone']>> = {
  critical: 'negative',
  high: 'warning',
  medium: 'info',
  low: 'neutral',
};

export function PriorityBadge({ priority }: { priority: Enums['priority_level'] }) {
  return <Badge tone={PRIORITY_TONE[priority]}>{priority}</Badge>;
}
