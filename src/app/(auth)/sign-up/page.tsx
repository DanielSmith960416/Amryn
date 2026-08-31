import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth/current-user';
import { describeStore } from '@/lib/auth/store';
import { sessionSecretConfigured } from '@/lib/auth/session';
import { SignUpForm } from '@/features/auth/sign-up-form';

export const metadata: Metadata = { title: 'Create your workspace' };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await currentUser()) redirect('/command-centre');

  const { next } = await searchParams;
  const store = describeStore();
  const canSignIn = sessionSecretConfigured();

  return (
    <div>
      <h1 className="font-display text-[1.625rem] font-semibold tracking-tight text-[var(--text-primary)]">
        Open the platform
      </h1>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
        Create your workspace and go straight to the Executive Command Centre. It opens on a
        demonstration business so there is something to look at from the first screen.
      </p>

      {/*
        Without a session secret this deployment cannot start a session at all,
        so the form would take a password and return a 500. Say so first, and
        hide the form rather than inviting someone to fill it in.
      */}
      {!canSignIn ? (
        <p className="mt-5 rounded-lg border border-[var(--negative)] bg-[var(--negative-soft)] px-3 py-2.5 text-[0.8125rem] leading-relaxed text-[var(--negative)]">
          <strong className="font-semibold">This deployment cannot sign anyone in yet.</strong>{' '}
          Its <code className="font-mono">AMRYN_SESSION_SECRET</code> is not set, so no session can
          be created. Set it in the deployment&rsquo;s environment and redeploy — the README has the
          one command that generates one.
        </p>
      ) : null}

      {/*
        An account that quietly evaporates on the next deploy is worse than one
        that was never offered, so where no durable store is configured the
        page says so before anyone fills the form in.
      */}
      {canSignIn && !store.durable ? (
        <p className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--warning-soft)] px-3 py-2.5 text-[0.8125rem] leading-relaxed text-[var(--warning)]">
          <strong className="font-semibold">This deployment is not storing accounts yet.</strong>{' '}
          Sign-ups are held in memory and will be lost when the server restarts. See the README for
          the one environment variable that fixes it.
        </p>
      ) : null}

      {canSignIn ? (
        <div className="mt-6">
          <SignUpForm next={next} />
        </div>
      ) : null}

      <p className="mt-6 text-center text-[0.8125rem] text-[var(--text-secondary)]">
        Already have an account?{' '}
        <Link
          href={next ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in'}
          className="font-medium text-[var(--brand)] hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
