/**
 * The price list's rules and wording — no database, no server marker.
 *
 * Split from plans.ts for exactly the reason access.ts is split from
 * entitlements.ts, one directory over: the fetching carries `server-only`,
 * which is a marker for the React bundler and makes the file unreadable to a
 * unit test. The shape of an offer and the sentences said about it are not
 * server concerns, so they live here where they can be tested and where a
 * client component may read them.
 */
import type { Entitlement, Plan } from './access';
import { formatMoney } from '@/lib/utils/format';

export interface PlanOffer {
  plan: Plan;
  name: string;
  tagline: string;
  /** Null where the price is negotiated rather than published. */
  priceCentsMonthly: number | null;
  /**
   * Upper bound of a negotiated range, null where the monthly price is the
   * price. Enterprise is quoted per contract and one number could only ever
   * be its floor, which made the published figure the one nobody pays.
   */
  priceCentsMonthlyMax: number | null;
  priceCentsAnnual: number | null;
  /** One-off setup, as a range. Null where implementation is not charged. */
  implementationFeeCentsMin: number | null;
  implementationFeeCentsMax: number | null;
  currency: string;
  trialDays: number;
  contactSales: boolean;
  /** Feature keys this tier includes, in catalogue order. */
  includes: Entitlement[];
  /** Quota ceilings; null for no limit. */
  limits: Partial<Record<Entitlement, number | null>>;
}

/** What twelve months costs, and what that saves against paying monthly. */
export function annualSaving(offer: PlanOffer): number | null {
  if (offer.priceCentsAnnual === null || offer.priceCentsMonthly === null) return null;
  const saving = offer.priceCentsMonthly * 12 - offer.priceCentsAnnual;
  return saving > 0 ? saving : null;
}

/**
 * The monthly price in words, whether it is one number or a negotiated band.
 *
 * Kept here rather than in the page because the marketing site, the billing
 * page and any future quote all have to say the same thing, and a range
 * formatted three times is a range that will eventually read three ways.
 */
export function describePrice(offer: PlanOffer): string {
  if (offer.priceCentsMonthly === null) return 'On application';

  // formatMoney, not a second Intl formatter: every currency figure on screen
  // goes through it so that one convention holds across the Command Centre, a
  // report and this page. Whole rand — nobody quotes a subscription in cents.
  const rand = (cents: number) => formatMoney(cents, offer.currency, { compact: false, decimals: 0 });

  if (offer.priceCentsMonthlyMax !== null && offer.priceCentsMonthlyMax > offer.priceCentsMonthly) {
    // The plus is not decoration: the ceiling is where the standard band ends,
    // not where the largest contract does.
    return `${rand(offer.priceCentsMonthly)} – ${rand(offer.priceCentsMonthlyMax)}+`;
  }

  return rand(offer.priceCentsMonthly);
}

/**
 * What setting it up costs, or null where nothing is charged.
 *
 * A range rather than a figure because the work genuinely varies with how
 * much of the customer's estate has to be connected — a single number would
 * be a fiction, and the first quote that departed from it would prove it.
 */
export function describeImplementationFee(offer: PlanOffer): string | null {
  const { implementationFeeCentsMin: min, implementationFeeCentsMax: max } = offer;
  if (min === null && max === null) return null;

  const rand = (cents: number) => formatMoney(cents, offer.currency, { compact: false, decimals: 0 });

  if (min === null) return `Up to ${rand(max!)}`;
  if (max === null || max === min) return rand(min);
  return `${rand(min)} – ${rand(max)}${offer.contactSales ? '+' : ''}`;
}

/** "Unlimited" is a real answer and has to be said, not left blank. */
export function describeLimit(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'Unlimited';
  return new Intl.NumberFormat('en-ZA').format(value);
}
