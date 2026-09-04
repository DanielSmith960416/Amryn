import type { Enums } from '@/types/database';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils/cn';
import type { ExpiryStatus } from '@/lib/intelligence/inventory';
import type {
  ActionPriority,
  HealthStatus,
  KpiStatus,
  OpportunityClassification,
  RiskClassification,
} from '@/lib/intelligence/types';

const badge = cva(
  'inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2 py-0.5 ' +
    'font-label text-[0.6875rem] font-medium tracking-wide whitespace-nowrap uppercase',
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

export type Tone = NonNullable<VariantProps<typeof badge>['tone']>;

export interface BadgeProps
  extends ComponentPropsWithoutRef<'span'>,
    VariantProps<typeof badge> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}

/**
 * Severity has exactly one colour across the whole platform.
 *
 * These maps are the reason: an EXPIRED stock line, a CRITICAL risk and a
 * BELOW TARGET KPI all read as the same red, so a reader learns the palette
 * once. Colour is never the only signal — every badge also carries its word.
 */

export const EXPIRY_TONE: Readonly<Record<ExpiryStatus, Tone>> = {
  EXPIRED: 'negative',
  CRITICAL: 'warning',
  WARNING: 'info',
  CLEAR: 'positive',
};

export const RISK_TONE: Readonly<Record<RiskClassification, Tone>> = {
  CRITICAL: 'negative',
  HIGH: 'warning',
  MEDIUM: 'info',
  LOW: 'neutral',
};

export const OPPORTUNITY_TONE: Readonly<Record<OpportunityClassification, Tone>> = {
  HIGH: 'positive',
  MEDIUM: 'info',
  MONITOR: 'neutral',
};

export const HEALTH_TONE: Readonly<Record<HealthStatus, Tone>> = {
  EXCELLENT: 'positive',
  HEALTHY: 'positive',
  STABLE: 'info',
  WEAK: 'warning',
  CRITICAL: 'negative',
};

export const KPI_TONE: Readonly<Record<KpiStatus, Tone>> = {
  'ON TARGET': 'positive',
  'NEAR TARGET': 'warning',
  'BELOW TARGET': 'negative',
};

export const PRIORITY_TONE: Readonly<Record<ActionPriority, Tone>> = {
  HIGH: 'negative',
  MEDIUM: 'warning',
  LOW: 'neutral',
};

export const BRANCH_TONE: Readonly<Record<'HEALTHY' | 'STABLE' | 'ATTENTION', Tone>> = {
  HEALTHY: 'positive',
  STABLE: 'info',
  ATTENTION: 'warning',
};

/**
 * Severity as the database records it.
 *
 * Distinct from PRIORITY_TONE above, and deliberately so. That one maps
 * `ActionPriority` — HIGH/MEDIUM/LOW — which the v2 screens use for data they
 * hold in the browser. This one maps `priority_level`, the PostgreSQL enum,
 * which has a fourth value: critical. They will converge when those screens
 * read from the database, and until then conflating them would silently drop
 * every critical row into the "high" bucket.
 */
export const DB_PRIORITY_TONE: Readonly<Record<Enums['priority_level'], Tone>> = {
  critical: 'negative',
  high: 'warning',
  medium: 'info',
  low: 'neutral',
};

export function PriorityBadge({ priority }: { priority: Enums['priority_level'] }) {
  return <Badge tone={DB_PRIORITY_TONE[priority]}>{priority}</Badge>;
}
