import { Card } from '@/components/ui/card';
import { internalAccess } from '@/lib/auth/internal-access';
import { SetupNotice } from '@/features/setup/setup-notice';

/**
 * What an entry page says when the deployment cannot reach its database.
 *
 * Two readers, and only one of them can act. An operator needs the missing
 * variable named; a customer needs to know it is not their fault and not their
 * job. `SetupNotice` serves the first, and is shown only to somebody
 * `internalAccess()` admits — an administrator, the internal token, or a
 * developer running `next dev`. Everyone else gets the sentence below.
 *
 * It lives here, shared by /sign-in and /sign-up, because these two pages have
 * already drifted apart once. Sign-in spoke to a Supabase deployment while
 * sign-up still described a static export with no server at all, and a visitor
 * who followed "Create one" was told the product had no privacy. A single
 * component cannot say two different things about one deployment.
 *
 * `action` completes "… is temporarily unavailable", so it reads as the thing
 * the reader was trying to do rather than a generic outage.
 */
export async function NotAvailable({
  action,
  internalKey,
}: {
  action: string;
  internalKey?: string;
}) {
  if ((await internalAccess(internalKey)) !== 'denied') return <SetupNotice />;

  return (
    <Card className="p-6">
      <h2 className="text-[1.125rem] font-semibold text-[var(--text-primary)]">
        Amryn is not available right now
      </h2>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
        {action} is temporarily unavailable. This is a fault on our side, not anything you have
        done — please try again shortly.
      </p>
    </Card>
  );
}
