import type { Metadata } from 'next';
import Link from 'next/link';
import { SignInForm } from '@/features/auth/sign-in-form';
import { isSupabaseConfigured, supabaseConfigError } from '@/lib/env';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Sign in' };

const PROVIDER_NAMES: Record<string, string> = { google: 'Google', azure: 'Microsoft' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; provider?: string }>;
}) {
  if (!isSupabaseConfigured()) return <NotConfigured />;

  const params = await searchParams;
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
            It has to be switched on in Supabase first, with credentials from{' '}
            {providerName ?? 'the provider'}. Use email and password in the meantime — that works
            without any extra setup.
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
            It may have expired, been used already, or point at a URL this project has not
            allow-listed. Ask for a fresh one.
          </p>
        </div>
      ) : null}

      <div className="mt-7">
        <SignInForm />
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
 * A deployment without Supabase credentials is a normal state during setup.
 * Saying exactly what is missing beats a stack trace or a form that silently
 * fails on submit.
 */
function NotConfigured() {
  // Naming the specific fault turns a support conversation into a one-line fix.
  const problem = supabaseConfigError();

  return (
    <Card className="p-6">
      <h2 className="text-[1.125rem] font-semibold text-[var(--text-primary)]">
        Not configured yet
      </h2>

      <p className="mt-2 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
        This deployment cannot reach Supabase, so there is nothing to sign in to.
      </p>

      {problem ? (
        <p
          className="mt-3 rounded-lg bg-[var(--card-inset)] px-3 py-2 font-mono text-[0.75rem] leading-relaxed text-[var(--text-primary)]"
          role="status"
        >
          {problem}
        </p>
      ) : null}

      <p className="mt-3 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
        On a hosted deployment, set the variables in your host&rsquo;s environment settings and
        redeploy — values added after a build are not in the bundle until the next one. Locally,
        copy{' '}
        <code className="rounded bg-[var(--card-inset)] px-1 py-0.5 font-mono text-[0.75rem]">
          .env.example
        </code>{' '}
        to{' '}
        <code className="rounded bg-[var(--card-inset)] px-1 py-0.5 font-mono text-[0.75rem]">
          .env.local
        </code>
        .
      </p>

      <p className="mt-3 text-[0.8125rem] text-[var(--text-tertiary)]">
        Then apply{' '}
        <code className="rounded bg-[var(--card-inset)] px-1 py-0.5 font-mono text-[0.75rem]">
          supabase/migrations
        </code>{' '}
        in filename order. Full steps are in the README.
      </p>
    </Card>
  );
}
