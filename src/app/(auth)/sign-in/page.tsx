import type { Metadata } from 'next';
import { SignInForm } from '@/features/auth/sign-in-form';
import { isSupabaseConfigured } from '@/lib/env';
import { NotAvailable } from '@/features/setup/not-available';

export const metadata: Metadata = { title: 'Sign in' };

/**
 * Where somebody who already has an account comes in.
 *
 * The eyebrow keeps the mark's own capitalisation. It is tracked and small,
 * which is the eyebrow treatment everywhere else here, but it is not
 * uppercased: the brand pack sets the solid capitalisation of
 * AIGrowthIntelligence® as part of the mark, so transforming it is not a
 * styling choice available to this page.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; provider?: string; next?: string; key?: string }>;
}) {
  const params = await searchParams;

  if (!isSupabaseConfigured()) return <NotAvailable action="Signing in" internalKey={params.key} />;

  return (
    <>
      {/* Sized to sit on one line at the card's width: the string is long, and
          an eyebrow that wraps stops reading as a rule above a heading and
          starts reading as a sentence somebody forgot to finish. */}
      <p className="font-mono text-[0.625rem] tracking-[0.06em] text-[var(--brand)]">
        Amryn<span className="tm">™</span> AIGrowthIntelligence<span className="tm">®</span> ·
        Secure access
      </p>

      <h1 className="font-display mt-2 text-[1.625rem] leading-tight font-bold tracking-tight text-[var(--text-primary)]">
        Sign in to your Command Centre
      </h1>

      {/* Headline, thin accent bar, supporting line — the same three-part
          opening the marketing site uses, so the two read as one product. */}
      <div className="mt-3 h-[3px] w-12 rounded-full bg-[var(--brand)]" aria-hidden />

      <p className="mt-3 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
        Your business inside, the market outside, and what to do next.
      </p>

      {/*
        Reachable from a bookmarked or shared URL rather than from a button on
        this page — the provider buttons are gone, the action behind them is
        not, and a stale link landing here with no explanation is worse than a
        branch that is rarely taken.
      */}
      {params.error === 'provider_unavailable' ? (
        <div
          className="mt-5 rounded-[var(--radius-tile)] border border-[var(--border)] bg-[var(--warning-soft)] px-4 py-3"
          role="alert"
        >
          {/*
            Two sentences about what is and is not switched on became one about
            what to do next. Which providers a deployment carries is ours to
            know; the reader's problem is getting in.
          */}
          <p className="text-[0.875rem] font-medium text-[var(--text-primary)]">
            Use your email address and password
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

      <div className="mt-6">
        <SignInForm next={params.next} />
      </div>

      {/*
        Amryn is sold, not signed up for: an account exists because somebody was
        invited into a workspace. /sign-up still works and invitations still
        land there — what is gone is the invitation to arrive from here without
        one, which only ever produced accounts belonging to no organisation.
      */}
      <p className="mt-6 border-t border-[var(--border)] pt-5 text-center text-[0.8125rem] text-[var(--text-secondary)]">
        No account yet?{' '}
        <a
          href="mailto:danielsmith960416@gmail.com?subject=Amryn%20access"
          className="font-medium text-[var(--brand)] hover:underline"
        >
          Talk to us
        </a>
      </p>
    </>
  );
}
