/**
 * What a subscription includes, and whether it is paid — the rules alone.
 *
 * Two questions, deliberately kept apart, because they fail differently and
 * the customer needs a different sentence for each:
 *
 *   · An entitlement is missing → the plan does not include it. The answer is
 *     an upgrade, and the feature was never there to lose.
 *   · The subscription is not current → the plan includes it and the payment
 *     has not arrived. The answer is a payment, and nothing has been withdrawn
 *     except the ability to change records.
 *
 * Everything the application knows about either question comes through here.
 * That is the whole point of it: the alternative — a `plan === 'growth'`
 * comparison in each of forty components — cannot be changed without finding
 * all forty, cannot be tested, and is wrong the first time a customer is given
 * something their tier does not normally carry.
 *
 * ── this is not the enforcement ───────────────────────────────────────────
 * The database refuses changes to business records while a subscription is
 * lapsed, by a trigger that fires whether the caller is one of our pages or a
 * script holding the same token. What this module does is let the interface
 * say so before the refusal, instead of presenting a control that fails.
 *
 * No `server-only` marker, and no database client: this file is the rules and
 * nothing else, so a unit test and a client component can both read them.
 * Fetching lives next door in entitlements.ts, which does carry the marker.
 */
import type { Enums, Row } from '@/types/database';

export const ENTITLEMENTS = [
  'command_centre',
  'financial_intelligence',
  'performance_tracking',
  'risk_radar',
  'opportunity_pipeline',
  'market_intelligence',
  'competitor_radar',
  'ai_assistant',
  'report_weekly',
  'report_monthly',
  'custom_reports',
  'api_access',
  'sso',
  'white_label',
  'priority_support',
  'success_manager',
  'seats',
  'data_sources',
  'ai_credits',
  'audit_retention_days',
  'branches',
] as const;

export type Entitlement = (typeof ENTITLEMENTS)[number];

export function isEntitlement(value: string): value is Entitlement {
  return (ENTITLEMENTS as readonly string[]).includes(value);
}

export type Plan = Enums['subscription_plan'];

/** Raised when something is attempted that the plan does not include. */
export class EntitlementError extends Error {
  readonly entitlement: Entitlement;

  constructor(entitlement: Entitlement, name?: string) {
    super(
      name
        ? `Your plan does not include ${name}.`
        : 'Your plan does not include this.',
    );
    this.name = 'EntitlementError';
    this.entitlement = entitlement;
  }
}

export interface ResolvedEntitlement {
  key: Entitlement;
  category: string;
  name: string;
  description: string;
  kind: 'feature' | 'quota';
  included: boolean;
  /** Null means no limit. Only meaningful where `kind` is 'quota'. */
  limit: number | null;
}

/**
 * Everything one organisation is entitled to, resolved once.
 *
 * A `Map` and three small methods rather than a bare array, because every
 * caller wants one of three answers and none of them wants to write the
 * lookup: "may we", "how many", and "is there room for one more".
 */
export class Entitlements {
  private readonly byKey: ReadonlyMap<Entitlement, ResolvedEntitlement>;

  constructor(resolved: readonly ResolvedEntitlement[]) {
    this.byKey = new Map(resolved.map((r) => [r.key, r]));
  }

  /** Whether the plan includes it at all. */
  has(key: Entitlement): boolean {
    return this.byKey.get(key)?.included ?? false;
  }

  /** The ceiling, or null for no limit. Null is also returned where the plan
   *  does not include the quota at all — callers should ask `has()` first,
   *  which is why the two are separate questions rather than one number. */
  limit(key: Entitlement): number | null {
    const row = this.byKey.get(key);
    return row?.included ? row.limit : null;
  }

  /** Whether one more fits. Unlimited and not-included both answer honestly. */
  room(key: Entitlement, used: number, wanted = 1): boolean {
    if (!this.has(key)) return false;
    const ceiling = this.limit(key);
    return ceiling === null || used + wanted <= ceiling;
  }

  get(key: Entitlement): ResolvedEntitlement | null {
    return this.byKey.get(key) ?? null;
  }

  /** For rendering a plan comparison; catalogue order. */
  list(kind?: 'feature' | 'quota'): ResolvedEntitlement[] {
    const all = [...this.byKey.values()];
    return kind ? all.filter((r) => r.kind === kind) : all;
  }

  /** Throws rather than redirecting: use inside a server action. */
  assert(key: Entitlement): void {
    if (!this.has(key)) throw new EntitlementError(key, this.byKey.get(key)?.name);
  }
}

/* ── whether the subscription is paid ──────────────────────────────────── */

export type AccessState =
  /** Paid, or inside a trial or a grace period. Everything works. */
  | 'open'
  /** Not paid. Reading, exporting and billing still work; nothing can change. */
  | 'read_only';

export interface SubscriptionAccess {
  state: AccessState;
  /** A sentence for the customer. Empty where there is nothing to say. */
  reason: string;
  /** Set while the subscription is still current but will not be for long. */
  endingOn: Date | null;
  /** True while a trial is running, which changes what the banner should say. */
  trialing: boolean;
}

/**
 * The same decision amryn.subscription_current() makes in the database.
 *
 * Two implementations of one rule is a risk, and it is taken deliberately:
 * the database has to decide it to enforce it, and the interface has to decide
 * it before a page renders to explain it. What removes the risk is that they
 * are tested against each other — supabase/tests/19 asserts the database's
 * answer for each case, and entitlements.test.ts asserts this one for the
 * same cases, so the two cannot drift without a test going red.
 */
export function subscriptionAccess(
  subscription: Pick<
    Row<'subscriptions'>,
    'status' | 'trial_ends_at' | 'current_period_end' | 'grace_until'
  > | null,
  now: Date = new Date(),
): SubscriptionAccess {
  if (!subscription) {
    return {
      state: 'read_only',
      reason: 'This account has no subscription on record, so its information cannot be changed.',
      endingOn: null,
      trialing: false,
    };
  }

  const at = (value: string | null): Date | null => (value ? new Date(value) : null);
  const periodEnd = at(subscription.current_period_end);

  switch (subscription.status) {
    case 'active':
      return { state: 'open', reason: '', endingOn: periodEnd, trialing: false };

    case 'trialing': {
      const ends = at(subscription.trial_ends_at) ?? periodEnd;
      if (ends && ends > now) {
        return { state: 'open', reason: '', endingOn: ends, trialing: true };
      }
      return {
        state: 'read_only',
        reason: 'Your trial has ended. Choose a plan to carry on where you left off.',
        endingOn: ends,
        trialing: true,
      };
    }

    case 'past_due': {
      // The default matches the database's: a week from the end of the period.
      const until =
        at(subscription.grace_until) ??
        (periodEnd ? new Date(periodEnd.getTime() + 7 * 86_400_000) : null);
      if (until && until > now) {
        return {
          state: 'open',
          reason: 'We have not received this period’s payment yet.',
          endingOn: until,
          trialing: false,
        };
      }
      return {
        state: 'read_only',
        reason: 'This period’s payment has not reached us, so the account is on hold.',
        endingOn: until,
        trialing: false,
      };
    }

    case 'cancelled':
      return {
        state: 'read_only',
        reason: 'This subscription has been cancelled. Your information is still here and still yours.',
        endingOn: periodEnd,
        trialing: false,
      };

    default:
      return {
        state: 'read_only',
        reason: 'This account is not currently subscribed.',
        endingOn: periodEnd,
        trialing: false,
      };
  }
}
