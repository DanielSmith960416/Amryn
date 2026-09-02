import 'server-only';

/**
 * The price list, read from the database rather than restated in the code.
 *
 * It used to be a constant array on the billing page — four names, four
 * prices, four sentences — while the numbers that actually governed anything
 * sat in the subscriptions table. The page and the platform could therefore
 * disagree about what a customer had bought, and for a while they did.
 */
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { ENTITLEMENTS, isEntitlement, type Entitlement, type Plan } from './entitlements';
import type { Row } from '@/types/database';

export interface PlanOffer {
  plan: Plan;
  name: string;
  tagline: string;
  /** Null where the price is negotiated rather than published. */
  priceCentsMonthly: number | null;
  priceCentsAnnual: number | null;
  currency: string;
  trialDays: number;
  contactSales: boolean;
  /** Feature keys this tier includes, in catalogue order. */
  includes: Entitlement[];
  /** Quota ceilings; null for no limit. */
  limits: Partial<Record<Entitlement, number | null>>;
}

const ORDER = new Map(ENTITLEMENTS.map((key, index) => [key as string, index]));

/** Every published tier, cheapest first. */
export const loadPlans = cache(async (): Promise<PlanOffer[]> => {
  const supabase = await createClient();

  const [{ data: plans, error: planError }, { data: matrix }] = await Promise.all([
    supabase.from('subscription_plans').select('*').eq('is_public', true).order('sort_order'),
    supabase.from('plan_entitlements').select('*'),
  ]);

  if (planError || !plans) {
    if (planError) console.error('[amryn:billing] could not read the plans', planError.message);
    return [];
  }

  return plans.map((plan: Row<'subscription_plans'>) => {
    const rows = (matrix ?? []).filter((m) => m.plan === plan.plan);

    const includes = rows
      .filter((m) => m.included && isEntitlement(m.entitlement_key))
      .map((m) => m.entitlement_key as Entitlement)
      .sort((a, b) => (ORDER.get(a) ?? 0) - (ORDER.get(b) ?? 0));

    const limits: Partial<Record<Entitlement, number | null>> = {};
    for (const m of rows) {
      if (isEntitlement(m.entitlement_key)) limits[m.entitlement_key] = m.limit_value;
    }

    return {
      plan: plan.plan,
      name: plan.name,
      tagline: plan.tagline,
      priceCentsMonthly: plan.price_cents_monthly,
      priceCentsAnnual: plan.price_cents_annual,
      currency: plan.currency_code,
      trialDays: plan.trial_days,
      contactSales: plan.contact_sales,
      includes,
      limits,
    };
  });
});

/** What twelve months costs, and what that saves against paying monthly. */
export function annualSaving(offer: PlanOffer): number | null {
  if (offer.priceCentsAnnual === null || offer.priceCentsMonthly === null) return null;
  const saving = offer.priceCentsMonthly * 12 - offer.priceCentsAnnual;
  return saving > 0 ? saving : null;
}

/** "Unlimited" is a real answer and has to be said, not left blank. */
export function describeLimit(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'Unlimited';
  return new Intl.NumberFormat('en-ZA').format(value);
}
