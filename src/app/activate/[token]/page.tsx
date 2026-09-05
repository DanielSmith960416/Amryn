import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { isSupabaseConfigured } from '@/lib/env';
import { ActivateForm } from '@/features/billing/activate-form';
import { withBasePath } from '@/lib/base-path';

export const metadata: Metadata = { title: 'Activate your subscription', robots: { index: false } };

// One row's state decides the whole page.
export const dynamic = 'force-dynamic';

type State = 'ready' | 'already_used' | 'expired' | 'unavailable' | 'unknown';

interface Preview {
  organisation_name: string | null;
  plan_name: string | null;
  term_months: number | null;
  state: State;
}

/**
 * Where an activation link lands.
 *
 * The link is sent by hand, to the person who arranged the payment, after
 * somebody has looked at a bank statement and matched the reference. So the
 * page can be brief: it confirms which company and which plan, and starts the
 * period when the button is pressed rather than when the link was created —
 * a link sent on a Friday and opened on a Monday should not cost a weekend.
 */
export default async function ActivatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!isSupabaseConfigured()) {
    return (
      <Shell title="Not available right now">
        <p>
          We cannot open your activation link at the moment. This is a fault on our side, not
          anything you have done — the link stays valid, so please try again shortly.
        </p>
      </Shell>
    );
  }

  const supabase = await createClient();
  const [{ data }, user] = await Promise.all([
    supabase.rpc('activation_preview', { p_token: token }),
    getCurrentUser(),
  ]);

  const preview = (Array.isArray(data) ? data[0] : null) as Preview | null;
  const state: State = preview?.state ?? 'unknown';

  if (state !== 'ready') {
    return (
      <Shell title={TITLES[state]}>
        <p>{EXPLANATIONS[state]}</p>
        <p className="mt-4">
          <Link href="/settings/billing" className="underline underline-offset-2">
            Go to billing
          </Link>
        </p>
      </Shell>
    );
  }

  const organisation = preview?.organisation_name ?? 'your organisation';
  const planName = preview?.plan_name ?? 'your plan';
  const term = preview?.term_months === 12 ? 'twelve months' : 'one month';

  if (!user) {
    const next = encodeURIComponent(`/activate/${token}`);
    return (
      <Shell title={`${planName} is ready for ${organisation}`}>
        <p>
          Sign in and the {term} start straight away. The link stays good until you do.
        </p>
        <div className="mt-5">
          <Link
            href={`/sign-in?next=${next}`}
            className="inline-flex h-10 items-center rounded-[var(--radius-field)] bg-[var(--brand)] px-4 text-[0.875rem] font-medium text-white"
          >
            Sign in
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title={`Start ${planName} for ${organisation}`}>
      <p>
        Thank you — your payment has been matched. Pressing the button below starts {term} of{' '}
        {planName} from this moment, and everything the plan includes becomes available at once.
      </p>
      <div className="mt-5">
        <ActivateForm token={token} planName={planName} />
      </div>
    </Shell>
  );
}

const TITLES: Record<State, string> = {
  ready: 'Activate your subscription',
  already_used: 'Already activated',
  expired: 'This link has expired',
  unavailable: 'This link is not ready yet',
  unknown: 'This link is not valid',
};

const EXPLANATIONS: Record<State, string> = {
  ready: '',
  already_used:
    'This subscription is already running. Billing shows the plan, the period and what it includes.',
  expired:
    'Activation links last a fortnight. Your payment is still on record — ask us for a new link and we will send one straight back.',
  unavailable:
    'We have not matched a payment against this yet. If you have already paid, send us the proof and the reference and we will sort it out.',
  unknown:
    'This link does not match anything we have. It may have been copied incompletely — links are long, and a truncated one looks much like a whole one.',
};

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--bg)] px-5 py-12">
      <main className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-2.5">
          <Image
            src={withBasePath("/brand/amryn-icon-mark.png")}
            alt=""
            width={553}
            height={563}
            className="h-6 w-auto"
          />
          <span className="font-display text-[1.0625rem] font-extrabold tracking-tight text-[var(--text-primary)]">
            Amryn<span className="tm">™</span>
          </span>
        </div>

        <h1 className="text-[1.5rem] font-semibold leading-tight text-[var(--text-primary)]">
          {title}
        </h1>
        <div className="mt-3 text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">
          {children}
        </div>
      </main>
    </div>
  );
}
