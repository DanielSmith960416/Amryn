import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils/cn';
import { formatDate, formatMoney, humanise } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Billing' };

/** Plans per specification §35, in rand. */
const PLANS = [
  { key: 'starter', name: 'Starter', priceCents: 99_900, blurb: 'One site, two data sources.' },
  { key: 'growth', name: 'Growth', priceCents: 399_900, blurb: 'Multi-branch, eight sources.' },
  { key: 'professional', name: 'Professional', priceCents: 999_900, blurb: 'Full radar, unlimited sources.' },
  { key: 'enterprise', name: 'Enterprise', priceCents: null, blurb: 'Custom, with SSO and support.' },
] as const;

export default async function BillingPage() {
  const workspace = await requirePermission('manage_billing');
  const supabase = await createClient();

  const [{ data: subscription }, { data: invoices }] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('*')
      .eq('organisation_id', workspace.organisation.id)
      .maybeSingle(),
    supabase
      .from('billing_records')
      .select('*')
      .eq('organisation_id', workspace.organisation.id)
      .order('issued_on', { ascending: false })
      .limit(12),
  ]);

  const currency = workspace.organisation.currency_code;
  const creditsUsed = subscription
    ? Math.min(100, (subscription.ai_credits_used / Math.max(1, subscription.ai_credits_monthly)) * 100)
    : 0;

  return (
    <>
      <PageHeader
        eyebrow={workspace.organisation.name}
        title="Billing"
        description="Your plan, what it includes and what you have used of it."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {PLANS.map((plan) => {
              const current = subscription?.plan === plan.key;
              return (
                <Card
                  key={plan.key}
                  tone={current ? 'brand' : 'default'}
                  className={cn('p-4', current && 'ring-1 ring-[var(--brand)]')}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[0.9375rem] font-semibold text-[var(--text-primary)]">
                      {plan.name}
                    </p>
                    {current ? <Badge tone="brand">Current</Badge> : null}
                  </div>
                  <p className="numeric mt-2 text-[1.25rem] font-semibold text-[var(--text-primary)]">
                    {plan.priceCents === null
                      ? 'Custom'
                      : formatMoney(plan.priceCents, currency, { compact: false, decimals: 0 })}
                    {plan.priceCents === null ? null : (
                      <span className="font-sans text-[0.75rem] font-normal text-[var(--text-tertiary)]">
                        {' '}
                        / month
                      </span>
                    )}
                  </p>
                  <p className="mt-1.5 text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">
                    {plan.blurb}
                  </p>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader title="Invoices" subtitle="Most recent first" />
            {(invoices ?? []).length === 0 ? (
              <EmptyState
                title="No invoices yet"
                description="Invoices appear here once the first billing period closes."
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

        <div>
          {subscription ? (
            <Card>
              <CardHeader
                title="This period"
                subtitle={`${formatDate(subscription.current_period_start)} — ${formatDate(subscription.current_period_end)}`}
                actions={
                  <Badge tone={subscription.status === 'active' ? 'positive' : 'warning'}>
                    {humanise(subscription.status)}
                  </Badge>
                }
              />
              <CardBody className="space-y-4">
                <Usage label="Seats" value={`${subscription.seats}`} />
                <Usage label="Data source limit" value={`${subscription.data_source_limit}`} />

                <div>
                  <div className="mb-1.5 flex items-baseline justify-between text-[0.8125rem]">
                    <span className="text-[var(--text-secondary)]">AI usage</span>
                    <span className="numeric text-[var(--text-primary)]">
                      {subscription.ai_credits_used} / {subscription.ai_credits_monthly}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--card-inset)]">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        creditsUsed > 90 ? 'bg-[var(--negative)]' : 'bg-[var(--brand)]',
                      )}
                      style={{ width: `${Math.max(2, creditsUsed)}%` }}
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
                description="This organisation has no subscription record. That should not happen — every organisation is created with one."
              />
            </Card>
          )}
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
