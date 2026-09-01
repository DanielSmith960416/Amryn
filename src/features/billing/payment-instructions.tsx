import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatMoney } from '@/lib/utils/format';
import type { BankDetails } from '@/lib/env';
import type { Row } from '@/types/database';
import { cancelRequest } from './actions';

/**
 * What to pay, where to pay it, and what to quote.
 *
 * The reference is the whole mechanism: it is what lets a person looking at a
 * bank statement match a deposit to an organisation without asking anybody.
 * So it is shown first, largest, and repeated in the instruction — a transfer
 * that arrives without it costs a phone call and a delay.
 */
export function PaymentInstructions({
  activation,
  planName,
  bank,
}: {
  activation: Row<'subscription_activations'>;
  planName: string;
  bank: BankDetails | null;
}) {
  const confirmed = activation.state === 'payment_confirmed';

  return (
    <Card tone="brand">
      <CardHeader
        title={confirmed ? 'Payment received' : 'Waiting for your payment'}
        subtitle={`${planName}, ${activation.term_months === 12 ? 'twelve months' : 'one month'}`}
        actions={
          <Badge tone={confirmed ? 'positive' : 'warning'}>
            {confirmed ? 'Confirmed' : 'Awaiting payment'}
          </Badge>
        }
      />
      <CardBody className="space-y-4">
        {confirmed ? (
          <p className="text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
            Thank you — we have matched your transfer. An activation link is on its way to the
            person who arranged this. Opening it starts the {activation.term_months === 12 ? 'year' : 'month'}.
          </p>
        ) : (
          <>
            <div className="rounded-lg border border-[var(--brand)]/30 bg-[var(--card-inset)] px-4 py-3">
              <p className="text-[0.75rem] text-[var(--text-tertiary)]">
                Use this as the payment reference
              </p>
              <p className="numeric mt-0.5 text-[1.375rem] font-semibold tracking-wide text-[var(--text-primary)]">
                {activation.reference}
              </p>
            </div>

            <Line label="Amount" value={formatMoney(activation.amount_cents, activation.currency_code, { compact: false })} />
            {bank ? (
              <>
                <Line label="Account name" value={bank.accountName} />
                <Line label="Bank" value={bank.bank} />
                <Line label="Account number" value={bank.accountNumber} />
                <Line label="Branch code" value={bank.branchCode} />
                {bank.swift ? <Line label="SWIFT" value={bank.swift} /> : null}
                <p className="border-t border-[var(--border)] pt-3 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                  Once you have paid, email the proof to{' '}
                  <a
                    className="font-medium text-[var(--brand)] underline underline-offset-2"
                    href={`mailto:${bank.proofTo}?subject=${encodeURIComponent(`Proof of payment ${activation.reference}`)}`}
                  >
                    {bank.proofTo}
                  </a>
                  . We check these on business days and send back an activation link, usually
                  within a few hours.
                </p>
              </>
            ) : (
              // Half a set of banking details would be worse than none, so the
              // page says plainly that it cannot show them rather than
              // printing a partial instruction someone might act on.
              <p className="text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                Your reference is reserved. Email us and we will send the payment details for
                reference {activation.reference}.
              </p>
            )}

            <form action={cancelRequest} className="border-t border-[var(--border)] pt-3">
              <input type="hidden" name="id" value={activation.id} />
              <button
                type="submit"
                className="text-[0.75rem] text-[var(--text-tertiary)] underline underline-offset-2 hover:text-[var(--text-secondary)]"
              >
                Withdraw this request
              </button>
            </form>
          </>
        )}

        <p className="text-[0.75rem] text-[var(--text-tertiary)]">
          Requested {formatDate(activation.requested_at)}
        </p>
      </CardBody>
    </Card>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-[0.8125rem]">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="numeric font-medium text-[var(--text-primary)]">{value}</span>
    </div>
  );
}
