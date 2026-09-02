import Link from 'next/link';
import { formatDate } from '@/lib/utils/format';
import type { SubscriptionAccess } from '@/lib/billing/access';

/**
 * The one line that explains why a page has stopped accepting changes.
 *
 * Shown above every screen in the platform rather than beside each control
 * that would fail, because the cause is the same everywhere and repeating it
 * per button would read as an accusation about that button.
 *
 * Nothing here enforces anything. The database refuses the write whichever
 * page it came from; this is so that the refusal is not the first a customer
 * hears of it.
 */
export function AccountNotice({
  access,
  canManageBilling,
}: {
  access: SubscriptionAccess;
  canManageBilling: boolean;
}) {
  const onHold = access.state !== 'open';
  // A warning while still inside a trial or a grace period is worth showing
  // once it is close enough to matter. Earlier than that it is nagging.
  const soon =
    access.state === 'open' &&
    access.endingOn !== null &&
    access.reason !== '' &&
    access.endingOn.getTime() - Date.now() < 14 * 86_400_000;

  if (!onHold && !soon) return null;

  return (
    <div
      role="status"
      className={
        onHold
          ? 'mb-5 rounded-xl border border-[var(--negative)]/30 bg-[var(--negative)]/8 px-4 py-3'
          : 'mb-5 rounded-xl border border-[var(--warning)]/30 bg-[var(--warning)]/8 px-4 py-3'
      }
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[0.875rem] font-medium text-[var(--text-primary)]">
          {onHold ? 'This account is on hold' : 'Your subscription needs attention'}
        </p>
        {canManageBilling ? (
          <Link
            href="/settings/billing"
            className="text-[0.8125rem] font-medium text-[var(--brand)] underline underline-offset-2"
          >
            {onHold ? 'Settle it' : 'Review billing'}
          </Link>
        ) : null}
      </div>

      <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
        {access.reason}{' '}
        {onHold
          ? 'Everything you have is still here and still readable — reports, exports and your own records are unaffected. New entries and changes resume the moment it is settled.'
          : access.endingOn
            ? `This runs until ${formatDate(access.endingOn.toISOString())}.`
            : null}
      </p>

      {!canManageBilling ? (
        <p className="mt-1 text-[0.75rem] text-[var(--text-tertiary)]">
          Whoever looks after billing for {'your organisation'} can resolve this.
        </p>
      ) : null}
    </div>
  );
}
