import { Card } from '@/components/ui/card';
import { supabaseConfigError } from '@/lib/env';

/**
 * The operator's half of an unconfigured deployment.
 *
 * It lives here rather than beside the sign-in page for a reason that is not
 * only tidiness: everything under src/features/setup is exempt from the
 * customer-copy guard, because naming the missing variable is the whole job.
 * Keeping it in the sign-in page meant the guard could not tell an operator
 * instruction from a customer message sitting two lines apart, and the only
 * way to satisfy it there would have been to delete the instruction.
 *
 * Rendered only when internalAccess() admits the caller. Everyone else gets a
 * sentence saying the service is unavailable.
 */
export function SetupNotice() {
  // Naming the specific fault turns a support conversation into a one-line fix.
  const problem = supabaseConfigError();

  return (
    <Card className="p-6">
      <h2 className="text-[1.125rem] font-semibold text-[var(--text-primary)]">
        Not configured yet
      </h2>

      <p className="mt-2 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
        This deployment cannot reach its database, so there is nothing to sign in to. Everyone else
        sees a short message saying the service is unavailable.
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

      <p className="mt-4 text-[0.8125rem] text-[var(--text-secondary)]">
        <a href="/diagnostics" className="font-medium text-[var(--brand)] hover:underline">
          Open diagnostics
        </a>{' '}
        to see every setting checked in one place.
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
