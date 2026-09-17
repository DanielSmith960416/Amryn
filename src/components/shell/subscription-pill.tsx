'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils/cn';

/**
 * What the subscription is doing, in the top bar, where nobody has to look.
 *
 * ── why it exists ────────────────────────────────────────────────────────
 * The only route to subscribing was Billing, pinned at the bottom of the
 * navigation rail — below every section, and on a phone behind the menu
 * button as well. A business on a trial with nine days left saw nothing on
 * any screen that said so, and the way to pay was the last row of a list they
 * had to open first.
 *
 * Amryn already knew all of this: workspace.access carries the state, whether
 * it is a trial, and the day it ends, and it is resolved before every page
 * renders. It was simply never shown.
 *
 * ── and why it is usually absent ─────────────────────────────────────────
 * Nothing renders for a subscription that is paid and not ending. A permanent
 * badge telling a paying customer they are a paying customer is noise, and
 * noise is what makes people stop reading the bar it sits in. This appears
 * when there is a decision to make and disappears when there is not.
 */
export function SubscriptionPill({
  state,
  trialing,
  endingOn,
  canManageBilling,
}: {
  /** The two states access.ts actually has. 'open' means everything works. */
  state: 'open' | 'read_only';
  trialing: boolean;
  /** ISO date, or null. Serialised rather than a Date: this crosses to the client. */
  endingOn: string | null;
  /** Billing is a permission. Somebody without it is told, not offered. */
  canManageBilling: boolean;
}) {
  const days = daysUntil(endingOn);
  const label = subscriptionLabel(state, trialing, days, endingOn);
  if (!label) return null;

  // Lapsed is no longer a nudge, and neither is the last few days of a trial.
  const urgent = state === 'read_only' || (days !== null && days <= 3);

  const className = cn(
    'shrink-0 rounded-[var(--radius-pill)] px-3 py-1 text-[0.75rem] font-medium transition-colors',
    // Hidden below `sm` only when it is merely informational. A lapsed
    // subscription is the reason the rest of the interface has stopped
    // accepting changes, and hiding that on a phone leaves somebody pressing
    // Save and being refused with no explanation anywhere on the screen.
    urgent ? 'inline-block' : 'hidden sm:inline-block',
    urgent
      ? 'bg-[var(--negative)] text-white hover:opacity-90'
      : 'bg-[var(--brand-soft)] text-[var(--brand)] hover:bg-[var(--brand-soft)]/70',
  );

  // Somebody who cannot manage billing gets the same information and no link
  // to a page that would refuse them. The state is still theirs to know — it
  // explains why a feature that worked yesterday is asking them to upgrade.
  if (!canManageBilling) {
    return <span className={cn(className, 'cursor-default')}>{label}</span>;
  }

  return (
    <Link href="/settings/billing" className={className}>
      {label}
    </Link>
  );
}

export function subscriptionLabel(
  state: 'open' | 'read_only',
  trialing: boolean,
  days: number | null,
  endingOn: string | null,
): string | null {
  if (state === 'read_only') return 'Subscription lapsed — renew';

  if (trialing) {
    // The day count is what makes somebody act, so it leads. Without one the
    // sentence still has to stand on its own.
    if (days === null) return 'On trial — subscribe';
    if (days <= 0) return 'Trial ends today — subscribe';
    if (days === 1) return 'Trial ends tomorrow — subscribe';
    return `${days} days left on trial — subscribe`;
  }

  /*
   * Paid, and still current, but with an end date set — a cancellation at the
   * period end, or a grace period being served. The wording states the date
   * and claims nothing about why, because this component cannot tell the two
   * apart and guessing wrong would tell somebody they had cancelled when they
   * had not.
   */
  if (endingOn && days !== null && days <= 30) {
    return `Subscription ends ${readable(endingOn)} — renew`;
  }

  return null;
}

function readable(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? 'soon'
    : date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
}

/**
 * Whole days from today to the given date, by calendar date rather than by
 * elapsed hours: a trial ending tomorrow morning should not read as "ends
 * today" because it happens to be less than twenty-four hours away.
 */
export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const end = new Date(iso);
  if (Number.isNaN(end.getTime())) return null;

  const today = new Date();
  const a = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const b = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((b - a) / 86_400_000);
}
