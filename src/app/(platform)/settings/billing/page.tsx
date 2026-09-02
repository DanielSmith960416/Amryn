import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { bankDetails } from '@/lib/env';
import { annualSaving, describeLimit, loadPlans } from '@/lib/billing/plans';
import { isEntitlement } from '@/lib/billing/entitlements';
import { cn } from '@/lib/utils/cn';
import { formatDate, formatMoney, humanise } from '@/lib/utils/format';
import { PlanPicker, type PickerPlan } from '@/features/billing/plan-picker';
import { PaymentInstructions } from '@/features/billing/payment-instructions';

export const metadata: Metadata = { title: 'Billing' };

/**
 * What the organisation is on, what it could be on, and what it has used.
 *
 * Everything on this page is read from the catalogue in the database. The
 * previous version carried its own list of four plans and four prices beside
 * a subscription record holding different numbers, so the page and the
 * platform could disagree about what had been bought — and did.
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ upgrade?: string }>;
}) {
  const workspace = await requirePermission('manage_billing');
  const { upgrade } = await searchParams;
  const supabase = await createClient();

  const [plans, { data: invoices }, { data: activation }] = await Promise.all([
    loadPlans(),
    supabase
      .from('billing_records')
      .select('*')
      .eq('organisation_id', workspace.organisation.id)
      .order('issued_on', { ascending: false })
      .limit(12),
    supabase
      .from('subscription_activations')
      .select('*')
      .eq('organisation_id', workspace.organisation.id)
      .in('state', ['awaiting_payment', 'payment_confirmed'])
      .maybeSingle(),
  ]);

  const subscription = workspace.subscription;
  const entitlements = workspace.entitlements;

  // Named from the catalogue rather than from the enum, so "Growth" is spelled
  // one way across the product.
  const currentPlanName =
    plans.find((p) => p.plan === subscription?.plan)?.name ??
    (subscription ? humanise(subscription.plan) : null);

  // What the customer was trying to reach when they were sent here.
  const wanted = upgrade && isEntitlement(upgrade) ? entitlements.get(upgrade) : null;

  const creditLimit = entitlements.limit('ai_credits');
  const creditsUsed = subscription?.ai_credits_used ?? 0;
  const creditPercent =
    creditLimit && creditLimit > 0 ? Math.min(100, (creditsUsed / creditLimit) * 100) : 0;

  const pickerPlans: PickerPlan[] = plans.map((plan) => ({
    plan: plan.plan,
    name: plan.name,
    tagline: plan.tagline,
    priceCentsMonthly: plan.priceCentsMonthly,
    priceCentsAnnual: plan.priceCentsAnnual,
    currency: plan.currency,
    contactSales: plan.contactSales,
    savingCents: annualSaving(plan),
    includes: [
      `${describeLimit(plan.limits.seats)} people`,
      `${describeLimit(plan.limits.data_sources)} data sources`,
      `${describeLimit(plan.limits.ai_credits)} AI requests a month`,
      ...plan.includes
        .filter((key) => entitlements.get(key)?.kind === 'feature')
        .map((key) => entitlements.get(key)?.name ?? key)
        // The first three lines already carry the quotas; the rest are the
        // features that actually distinguish the tiers, and a card that lists
        // sixteen of them distinguishes nothing.
        .filter((name) => !['Executive Command Centre', 'Financial intelligence', 'Performance tracking', 'Weekly briefing'].includes(name))
        .slice(0, 5),
    ],
  }));

  return (
    <>
      <PageHeader
        eyebrow={workspace.organisation.name}
        title="Billing"
        description="Your plan, what it includes and what you have used of it."
      />

      {wanted ? (
        <div className="mb-5 rounded-xl border border-[var(--brand)]/30 bg-[var(--brand)]/8 px-4 py-3">
          <p className="text-[0.875rem] font-medium text-[var(--text-primary)]">
            {wanted.name} is not part of {currentPlanName ?? 'your plan'}
          </p>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
            {wanted.description} Choosing a plan below that includes it takes effect as soon as
            the payment is confirmed.
          </p>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader
              title="Plans"
              subtitle="Prices in rand, excluding VAT. Yearly is charged once, for twelve months."
            />
            <CardBody>
              <PlanPicker
                plans={pickerPlans}
                currentPlan={subscription?.plan ?? null}
                disabled={workspace.access.state !== 'open'}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Invoices" subtitle="Most recent first" />
            {(invoices ?? []).length === 0 ? (
              <EmptyState
                title="No invoices yet"
                description="Invoices appear here once the first period closes."
              />
            ) : (
              <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
                {(invoices ?? []).map((invoice) => (
                  <li key={invoice.id} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-[0.875rem] font-medium text-[var(--text-primary)]">
                        {invoice.description}
                      </p>
                      <p className="text-[0.75rem] text-[var(--text-tertiary)]">
                        {formatDate(invoice.issued_on)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="numeric text-[0.875rem] text-[var(--text-primary)]">
                        {formatMoney(invoice.amount_cents, invoice.currency_code, {
                          compact: false,
                        })}
                      </span>
                      <Badge tone={invoice.status === 'paid' ? 'positive' : 'warning'}>
                        {humanise(invoice.status)}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          {activation ? (
            <PaymentInstructions
              activation={activation}
              planName={plans.find((p) => p.plan === activation.plan)?.name ?? humanise(activation.plan)}
              bank={bankDetails()}
            />
          ) : null}

          {subscription ? (
            <Card>
              <CardHeader
                title={currentPlanName ?? 'This period'}
                subtitle={`${formatDate(subscription.current_period_start)} — ${formatDate(subscription.current_period_end)}`}
                actions={
                  <Badge tone={workspace.access.state === 'open' ? 'positive' : 'warning'}>
                    {humanise(subscription.status)}
                  </Badge>
                }
              />
              <CardBody className="space-y-4">
                <Usage label="People" value={describeLimit(entitlements.limit('seats'))} />
                <Usage
                  label="Data sources"
                  value={describeLimit(entitlements.limit('data_sources'))}
                />

                <div>
                  <div className="mb-1.5 flex items-baseline justify-between text-[0.8125rem]">
                    <span className="text-[var(--text-secondary)]">AI usage</span>
                    <span className="numeric text-[var(--text-primary)]">
                      {creditsUsed} / {describeLimit(creditLimit)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--card-inset)]">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        creditPercent > 90 ? 'bg-[var(--negative)]' : 'bg-[var(--brand)]',
                      )}
                      style={{ width: `${Math.max(2, creditPercent)}%` }}
                    />
                  </div>
                </div>

                {subscription.trial_ends_at ? (
                  <p className="border-t border-[var(--border)] pt-3 text-[0.75rem] text-[var(--text-tertiary)]">
                    Trial ends {formatDate(subscription.trial_ends_at)}
                  </p>
                ) : null}
              </CardBody>
            </Card>
          ) : (
            <Card>
              <EmptyState
                title="No subscription"
                description="This organisation has no subscription on record. Choose a plan and we will set one up."
              />
            </Card>
          )}

          <Card>
            <CardHeader title="What your plan includes" />
            <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
              {entitlements
                .list('feature')
                .map((item) => (
                  <li key={item.key} className="flex items-baseline justify-between gap-3 px-5 py-2.5">
                    <span
                      className={cn(
                        'text-[0.8125rem]',
                        item.included
                          ? 'text-[var(--text-primary)]'
                          : 'text-[var(--text-tertiary)] line-through',
                      )}
                    >
                      {item.name}
                    </span>
                    {item.included ? (
                      <span aria-label="Included" className="text-[0.8125rem] text-[var(--positive)]">
                        ✓
                      </span>
                    ) : (
                      <span className="text-[0.6875rem] text-[var(--text-tertiary)]">Not included</span>
                    )}
                  </li>
                ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

function Usage({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between text-[0.8125rem]">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="numeric font-medium text-[var(--text-primary)]">{value}</span>
    </div>
  );
}
