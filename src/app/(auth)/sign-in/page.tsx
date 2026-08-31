import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth/current-user';
import { SignInForm } from '@/features/auth/sign-in-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await currentUser()) redirect('/command-centre');

  const { next } = await searchParams;

  return (
    <div>
      <h1 className="font-display text-[1.625rem] font-semibold tracking-tight text-[var(--text-primary)]">
        Sign in
      </h1>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
        Open your Executive Command Centre.
      </p>

      <div className="mt-6">
        <SignInForm next={next} />
      </div>

      <p className="mt-6 text-center text-[0.8125rem] text-[var(--text-secondary)]">
        No account yet?{' '}
        <Link
          href={next ? `/sign-up?next=${encodeURIComponent(next)}` : '/sign-up'}
          className="font-medium text-[var(--brand)] hover:underline"
        >
          Create your workspace
        </Link>
      </p>

      {/*
        The previous build shipped a password-reset flow over Supabase's mailer.
        This one has no mail service configured, and a "Forgot password?" link
        that leads nowhere is worse than none — so it says what to do instead.
      */}
      <p className="mt-4 text-center text-[0.75rem] leading-relaxed text-[var(--text-tertiary)]">
        Password reset is not yet wired up in this build. Email{' '}
        <a
          href="mailto:danielsmith960416@gmail.com?subject=Amryn%20account%20access"
          className="text-[var(--brand)] hover:underline"
        >
          danielsmith960416@gmail.com
        </a>{' '}
        and we will restore access.
      </p>
    </div>
  );
}
