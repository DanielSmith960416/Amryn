import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { requireWorkspace } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils/format';
import { TwoFactorPanel } from '@/features/mfa/two-factor-panel';

export const metadata: Metadata = { title: 'Security' };

/**
 * Where a person turns two-step sign-in on and off.
 *
 * Reachable only from a session that has already presented any factor it owes
 * — requireWorkspace() sees to that — so turning it off costs a password and a
 * second factor, which is the right price for removing one.
 */
export default async function SecuritySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ recovered?: string }>;
}) {
  const workspace = await requireWorkspace();
  const { recovered } = await searchParams;
  const supabase = await createClient();

  const enabled = workspace.profile?.mfa_enabled ?? false;

  // How many recovery codes are left. The codes themselves cannot be shown —
  // only hashes are stored — which is the point of storing hashes.
  const { data: codes } = await supabase
    .from('mfa_recovery_codes')
    .select('used_at')
    .is('used_at', null);

  return (
    <>
      <PageHeader
        eyebrow="Your account"
        title="Security"
        description="How you prove it is you."
      />

      <div className="grid max-w-3xl gap-5">
        {recovered ? (
          <div
            className="rounded-[var(--radius-card)] border p-4"
            style={{ borderColor: 'var(--warning)', background: 'var(--warning-soft)' }}
            role="status"
          >
            <p className="text-[0.875rem] font-medium" style={{ color: 'var(--warning)' }}>
              You are in, and two-step sign-in is off
            </p>
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
              That is what using a recovery code does — it removes the old authenticator so you are
              not locked out by a phone you no longer have. Set it up again below, on the device you
              have now.
            </p>
          </div>
        ) : null}

        <Card>
          <CardHeader
            title="Two-step sign-in"
            subtitle="A code from your phone, as well as your password"
            actions={
              enabled ? <Badge tone="positive">On</Badge> : <Badge tone="warning">Off</Badge>
            }
          />
          <CardBody className="space-y-4">
            {enabled ? (
              <p className="text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
                Turned on{' '}
                {workspace.profile?.mfa_enabled_at
                  ? `on ${formatDate(workspace.profile.mfa_enabled_at)}`
                  : ''}
                . You have <strong>{codes?.length ?? 0}</strong> unused recovery{' '}
                {codes?.length === 1 ? 'code' : 'codes'}.
              </p>
            ) : (
              <p className="text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
                Your password is currently the only thing standing between someone who has it and
                everything this workspace holds. Turning this on means a stolen password is no
                longer enough on its own.
              </p>
            )}

            <TwoFactorPanel enabled={enabled} remainingCodes={codes?.length ?? 0} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Your password" />
          <CardBody>
            <p className="text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
              We never store your password, only a one-way scramble of it that cannot be turned
              back. To change it, sign out and use{' '}
              <span className="text-[var(--text-primary)]">Forgotten your password</span> — that
              sends a link to your address, which is how we know it is you asking.
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
