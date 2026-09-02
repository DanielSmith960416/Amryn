import type { Metadata } from 'next';
import Link from 'next/link';
import { SignUpForm } from '@/features/auth/sign-up-form';
import { NotAvailable } from '@/features/setup/not-available';
import { isSupabaseConfigured } from '@/lib/env';

export const metadata: Metadata = { title: 'Create an account' };

/**
 * The account this page opens is a real one.
 *
 * It did not used to be. This page rendered `OpenPlatformForm`, which wrote a
 * name into device storage and sent the reader to the Command Centre, above a
 * notice reading "No password, and no privacy — this site is served as static
 * files, so there is no server to check a password or keep anything private."
 *
 * All of that was true of a static export that no longer exists, and false of
 * every deployment that does: there is a server, it checks a password, and
 * PostgreSQL row level security decides what any session can read. The two
 * entry pages had drifted into describing two different products — /sign-in
 * spoke to Supabase while /sign-up denied there was a server to speak to — and
 * a visitor following "Create one" was told the platform holding their
 * financial records offered no privacy.
 *
 * So this page now renders `SignUpForm`, which was written for exactly this
 * and rendered nowhere: it calls `signUpWithPassword`, records the accepted
 * terms and privacy versions against the account, and sends the confirmation
 * email through `/auth/callback`.
 */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; key?: string }>;
}) {
  const params = await searchParams;

  // The same condition and the same card as /sign-in. A page offering to
  // create an account that cannot be created is worse than one saying so.
  if (!isSupabaseConfigured()) {
    return <NotAvailable action="Creating an account" internalKey={params.key} />;
  }

  return (
    <>
      <h2 className="text-[1.5rem] font-semibold text-[var(--text-primary)]">
        Create your account
      </h2>
      <p className="mt-1.5 text-[0.875rem] text-[var(--text-secondary)]">
        Then set up your workspace and open the Executive Command Centre.
      </p>

      <div className="mt-7">
        <SignUpForm next={params.next} />
      </div>

      <p className="mt-7 text-center text-[0.8125rem] text-[var(--text-secondary)]">
        Already have an account?{' '}
        <Link href="/sign-in" className="font-medium text-[var(--brand)] hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
