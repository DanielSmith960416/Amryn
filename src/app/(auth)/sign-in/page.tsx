import type { Metadata } from 'next';
import Link from 'next/link';
import { SignInForm } from '@/features/auth/sign-in-form';
import { isSupabaseConfigured } from '@/lib/env';
import { NotAvailable } from '@/features/setup/not-available';

export const metadata: Metadata = { title: 'Sign in' };

const PROVIDER_NAMES: Record<string, string> = { google: 'Google', azure: 'Microsoft' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; provider?: string; next?: string; key?: string }>;
}) {
  const params = await searchParams;

  if (!isSupabaseConfigured()) return <NotAvailable action="Signing in" internalKey={params.key} />;
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
