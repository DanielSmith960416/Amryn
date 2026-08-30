import type { Metadata } from 'next';
import Link from 'next/link';
import { SignInForm } from '@/features/auth/sign-in-form';
import { isSupabaseConfigured } from '@/lib/env';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Sign in' };

export default function SignInPage() {
  if (!isSupabaseConfigured()) return <NotConfigured />;

  return (
    <>
      <h2 className="text-[1.5rem] font-semibold text-[var(--text-primary)]">Sign in</h2>
      <p className="mt-1.5 text-[0.875rem] text-[var(--text-secondary)]">
        Welcome back to your Command Centre.
      </p>

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
  return (
    <Card className="p-6">
      <h2 className="text-[1.125rem] font-semibold text-[var(--text-primary)]">
        Not configured yet
      </h2>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
        This deployment has no Supabase credentials, so there is nothing to sign in to. Copy{' '}
        <code className="rounded bg-[var(--card-inset)] px-1 py-0.5 font-mono text-[0.75rem]">
          .env.example
        </code>{' '}
        to{' '}
        <code className="rounded bg-[var(--card-inset)] px-1 py-0.5 font-mono text-[0.75rem]">
          .env.local
        </code>
        , fill in the project URL and anon key, and apply the migrations in{' '}
        <code className="rounded bg-[var(--card-inset)] px-1 py-0.5 font-mono text-[0.75rem]">
          supabase/migrations
        </code>
        .
      </p>
      <p className="mt-3 text-[0.8125rem] text-[var(--text-tertiary)]">
        The setup steps are in the repository README.
      </p>
    </Card>
  );
}
