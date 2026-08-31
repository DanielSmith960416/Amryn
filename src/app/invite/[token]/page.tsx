import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { isSupabaseConfigured } from '@/lib/env';
import { ROLE_LABELS } from '@/lib/auth/permissions';
import { AcceptForm } from '@/features/invitations/accept-form';

export const metadata: Metadata = { title: 'Invitation', robots: { index: false } };

// The answer depends on who is asking and on the state of one row.
export const dynamic = 'force-dynamic';

interface Preview {
  organisation_name: string | null;
  role: string | null;
  email: string | null;
  state: 'open' | 'accepted' | 'expired' | 'revoked' | 'invalid';
}

/**
 * Where an invitation link lands.
 *
 * Readable signed out, deliberately: someone following an invitation usually
 * has no account yet, and being told what they are being invited to is the
 * whole point of the page. It reveals only the organisation's name, the role,
 * and the address it was sent to — all of which the recipient already knows.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!isSupabaseConfigured()) {
    return (
      <Shell title="Not available yet">
        <p>This deployment is not connected to its database, so invitations cannot be read.</p>
      </Shell>
    );
  }

  const supabase = await createClient();
  const [{ data }, user] = await Promise.all([
    supabase.rpc('invitation_preview', { p_token: token }),
    getCurrentUser(),
  ]);

  const preview = (Array.isArray(data) ? data[0] : null) as Preview | null;
  const state = preview?.state ?? 'invalid';

  if (state !== 'open') {
    return (
      <Shell title={TITLES[state]}>
        <p>{EXPLANATIONS[state]}</p>
        <p className="mt-4">
          <Link href="/sign-in" className="underline underline-offset-2">
            Go to sign in
          </Link>
        </p>
      </Shell>
    );
  }

  const organisation = preview?.organisation_name ?? 'this organisation';
  const role = preview?.role ? (ROLE_LABELS[preview.role] ?? preview.role) : 'a member';

  // Signed out, or signed in as somebody else. The invitation is bound to the
  // address it was sent to, so saying which one avoids a refusal the reader
  // cannot explain.
  if (!user || (preview?.email && user.email?.toLowerCase() !== preview.email.toLowerCase())) {
    const next = encodeURIComponent(`/invite/${token}`);
    return (
      <Shell title={`You have been invited to ${organisation}`}>
        <p>
          As <strong>{role}</strong>, at <strong>{preview?.email}</strong>.
        </p>
        <p className="mt-3">
          {user
            ? `You are signed in as ${user.email}. This invitation only works for the address above — sign in as that address to accept it.`
            : 'Sign in with that address to accept, or create an account with it if you do not have one yet.'}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href={`/sign-in?next=${next}`}
            className="inline-flex h-10 items-center rounded-[var(--radius-field)] bg-[var(--brand)] px-4 text-[0.875rem] font-medium text-white"
          >
            {user ? 'Sign in as someone else' : 'Sign in'}
          </Link>
          {!user ? (
            <Link
              href={`/sign-up?next=${next}`}
              className="inline-flex h-10 items-center rounded-[var(--radius-field)] border border-[var(--border-strong)] px-4 text-[0.875rem] font-medium text-[var(--text-primary)]"
            >
              Create an account
            </Link>
          ) : null}
        </div>
      </Shell>
    );
  }

  return (
    <Shell title={`Join ${organisation}`}>
      <p>
        You have been invited as <strong>{role}</strong>.
      </p>
      <p className="mt-3">
        Accepting adds you to {organisation}. What you can see and change is decided by that role,
        and enforced by the database rather than by this page.
      </p>
      <div className="mt-5">
        <AcceptForm token={token} organisation={organisation} />
      </div>
    </Shell>
  );
}

const TITLES: Record<Preview['state'], string> = {
  open: 'Invitation',
  accepted: 'Already used',
  expired: 'This invitation has expired',
  revoked: 'This invitation was withdrawn',
  invalid: 'This link is not valid',
};

const EXPLANATIONS: Record<Preview['state'], string> = {
  open: '',
  accepted:
    'This invitation has already been accepted. If that was you, sign in and you will be where you need to be.',
  expired:
    'Invitations last fourteen days. Ask whoever invited you to send a new one — it takes them a moment.',
  revoked: 'Whoever invited you has since withdrawn it. Ask them if you think that was a mistake.',
  invalid:
    'This link does not match any invitation. It may have been copied incompletely — links are long, and a truncated one looks much like a whole one.',
};

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--bg)] px-5 py-12">
      <main className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-2.5">
          <Image
            src="/brand/amryn-icon-mark.png"
            alt=""
            width={553}
            height={563}
            className="h-6 w-auto dark:hidden"
          />
          <Image
            src="/brand/amryn-icon-mark-white.png"
            alt=""
            width={553}
            height={563}
            className="hidden h-6 w-auto dark:block"
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
