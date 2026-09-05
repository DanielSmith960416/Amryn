import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { internalAccess } from '@/lib/auth/internal-access';
import { createAdminClient } from '@/lib/supabase/server';
import { formatDate, formatMoney } from '@/lib/utils/format';
import { ConfirmPaymentForm } from '@/features/billing/confirm-form';
import { withBasePath } from '@/lib/base-path';

export const metadata: Metadata = {
  title: 'Activations',
  robots: { index: false, follow: false, nocache: true, noarchive: true, nosnippet: true },
};

// The queue changes as money arrives; a cached one would be worse than none.
export const dynamic = 'force-dynamic';

/**
 * The operator's queue: who has asked to subscribe and who has paid.
 *
 * Closed the same way /diagnostics is — an administrator, or the internal
 * access token — because it lists other companies' names, plans and amounts,
 * and because confirming a payment is the one step that must stay out of the
 * customer's hands.
 *
 * The work it supports is a person with a bank statement open beside it,
 * matching a deposit to a reference. That is why the reference is the largest
 * thing on each row.
 */
export default async function ActivationsPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;
  if ((await internalAccess(key)) === 'denied') notFound();

  // The service role, because these rows are deliberately not readable by any
  // signed-in session outside the organisation they belong to.
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from('subscription_activations')
    .select('*, organisations(name)')
    .in('state', ['awaiting_payment', 'payment_confirmed'])
    .order('requested_at', { ascending: true })
    .limit(100);

  const waiting = (rows ?? []).filter((r) => r.state === 'awaiting_payment');
  const confirmed = (rows ?? []).filter((r) => r.state === 'payment_confirmed');

  return (
    <div className="min-h-dvh bg-[var(--bg)] px-5 py-10">
      <main className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center gap-2.5">
          <Image
            src={withBasePath("/brand/amryn-icon-mark.png")}
            alt=""
            width={553}
            height={563}
            className="h-6 w-auto"
          />
          <span className="font-display text-[1.0625rem] font-extrabold tracking-tight text-[var(--text-primary)]">
            Amryn<span className="tm">™</span>
          </span>
        </div>

        <h1 className="text-[1.5rem] font-semibold text-[var(--text-primary)]">Activations</h1>
        <p className="mt-2 text-[0.9375rem] text-[var(--text-secondary)]">
          Match a deposit to a reference, confirm it, and send the link back to the customer.
          Confirming issues the link once — it is shown here and nowhere else, and it is not
          stored, so copy it before leaving the page.
        </p>

        <Section
          title="Awaiting payment"
          empty="Nobody is waiting to pay."
          count={waiting.length}
        >
          {waiting.map((row) => {
            const org = row.organisations as unknown as { name: string } | null;
            return (
              <li key={row.id} className="px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="numeric text-[1.0625rem] font-semibold tracking-wide text-[var(--text-primary)]">
                    {row.reference}
                  </p>
                  <p className="numeric text-[0.9375rem] font-medium text-[var(--text-primary)]">
                    {formatMoney(row.amount_cents, row.currency_code, { compact: false })}
                  </p>
                </div>
                <p className="mt-0.5 text-[0.8125rem] text-[var(--text-secondary)]">
                  {org?.name ?? 'Unknown organisation'} · {row.plan} ·{' '}
                  {row.term_months === 12 ? 'twelve months' : 'one month'} · asked{' '}
                  {formatDate(row.requested_at)}
                </p>
                <div className="mt-3">
                  <ConfirmPaymentForm id={row.id} accessKey={key} />
                </div>
              </li>
            );
          })}
        </Section>

        <Section
          title="Confirmed, not yet opened"
          empty="Every confirmed payment has been activated."
          count={confirmed.length}
        >
          {confirmed.map((row) => {
            const org = row.organisations as unknown as { name: string } | null;
            return (
              <li key={row.id} className="px-5 py-4">
                <p className="numeric text-[0.9375rem] font-semibold text-[var(--text-primary)]">
                  {row.reference}
                </p>
                <p className="mt-0.5 text-[0.8125rem] text-[var(--text-secondary)]">
                  {org?.name ?? 'Unknown organisation'} · {row.plan} · confirmed{' '}
                  {row.confirmed_at ? formatDate(row.confirmed_at) : '—'}
                  {row.expires_at ? ` · link good until ${formatDate(row.expires_at)}` : ''}
                </p>
                {row.payment_note ? (
                  <p className="mt-1 text-[0.75rem] text-[var(--text-tertiary)]">
                    {row.payment_note}
                  </p>
                ) : null}
              </li>
            );
          })}
        </Section>
      </main>
    </div>
  );
}

function Section({
  title,
  empty,
  count,
  children,
}: {
  title: string;
  empty: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-[0.8125rem] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
        {title} ({count})
      </h2>
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        {count === 0 ? (
          <p className="px-5 py-6 text-[0.875rem] text-[var(--text-tertiary)]">{empty}</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">{children}</ul>
        )}
      </div>
    </section>
  );
}
