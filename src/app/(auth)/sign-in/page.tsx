import type { Metadata } from 'next';
import Link from 'next/link';
import { SignInForm } from '@/features/auth/sign-in-form';
import { isSupabaseConfigured } from '@/lib/env';
import { internalAccess } from '@/lib/auth/internal-access';
import { SetupNotice } from '@/features/setup/setup-notice';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Sign in' };

const PROVIDER_NAMES: Record<string, string> = { google: 'Google', azure: 'Microsoft' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; provider?: string; next?: string; key?: string }>;
}) {
  const params = await searchParams;

  if (!isSupabaseConfigured()) return <NotAvailable internalKey={params.key} />;
  const providerName = params.provider ? PROVIDER_NAMES[params.provider] : undefined;

  return (
    <>
      <h2 className="text-[1.5rem] font-semibold text-[var(--text-primary)]">Sign in</h2>
      <p className="mt-1.5 text-[0.875rem] text-[var(--text-secondary)]">
        Welcome back to your Command Centre.
      </p>

      {params.error === 'provider_unavailable' ? (
        <div
          className="mt-5 rounded-[var(--radius-tile)] border border-[var(--border)] bg-[var(--warning-soft)] px-4 py-3"
          role="alert"
        >
          <p className="text-[0.875rem] font-medium text-[var(--text-primary)]">
            {providerName ?? 'That provider'} sign-in is not enabled yet
          </p>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
            Signing in with {providerName ?? 'that provider'} is not switched on for Amryn yet. Use
            your email address and password instead.
          </p>
        </div>
      ) : null}

      {params.error === 'exchange_failed' ? (
        <div
          className="mt-5 rounded-[var(--radius-tile)] border border-[var(--border)] bg-[var(--negative-soft)] px-4 py-3"
          role="alert"
        >
          <p className="text-[0.875rem] font-medium text-[var(--text-primary)]">
            That sign-in link did not work
          </p>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
            Sign-in links expire, and each one works only once. Ask for a fresh one and it should
            let you straight in.
          </p>
        </div>
      ) : null}

      <div className="mt-7">
        <SignInForm next={params.next} />
      </div>

      <p className="mt-7 text-center text-[0.8125rem] text-[var(--text-secondary)]">
        No account yet?{' '}
        <Link href="/sign-up" className="font-medium text-[var(--brand)] hover:underline">
          Create one
        </Link>
      </p>
    </>
  );
}

/**
 * What the sign-in page says when the deployment cannot reach its database.
 *
 * Two readers, and the wrong one used to be served. This page listed the
 * missing variables, told you to redeploy and pointed at the setup checks —
 * genuinely the fastest way to fix it, and read by a customer as a product
 * that ships with its own error console.
 *
 * So the customer gets a sentence saying it is temporary and not theirs to
 * fix, and the setup detail lives in `SetupNotice`, shown only to somebody who
 * can act on it: an administrator, or a caller holding the internal token. The
 * token matters here more than anywhere else — this is the page that says
 * nobody can sign in, so a check that requires signing in would never pass on
 * it.
 */
async function NotAvailable({ internalKey }: { internalKey?: string }) {
  if ((await internalAccess(internalKey)) !== 'denied') return <SetupNotice />;

  return (
    <Card className="p-6">
      <h2 className="text-[1.125rem] font-semibold text-[var(--text-primary)]">
        Amryn is not available right now
      </h2>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
        Signing in is temporarily unavailable. This is a fault on our side, not anything you have
        done — please try again shortly.
      </p>
    </Card>
  );
}
