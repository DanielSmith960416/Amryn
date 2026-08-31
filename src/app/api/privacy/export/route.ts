import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { LEGAL_VERSION } from '@/lib/legal/documents';

/**
 * A copy of the personal information held about the person asking.
 *
 * POPIA section 23 gives a data subject the right to be told what is held
 * about them. The formal route is a request with a 30-day clock on it, and
 * that route exists — but for the part we can answer instantly and completely,
 * making somebody wait a month would be a procedure rather than a right.
 *
 * ── what this is and is not ───────────────────────────────────────────────
 * This is the record of *them*: their profile, what they consented to and
 * when, which organisations they belong to and on what terms, and the requests
 * they have made. It is deliberately not their organisation's business data,
 * which is the organisation's to export and may be full of other people's
 * information — a member downloading the customer book under the heading of a
 * personal data request would be a breach dressed as compliance.
 *
 * Every query below runs as the caller, so the database's own row-level rules
 * decide what comes back. There is no elevated key here and nothing that takes
 * a user id from the request: this endpoint cannot be pointed at anybody else.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to export your information.' }, { status: 401 });
  }

  const supabase = await createClient();

  const [profile, memberships, requests] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase
      .from('organisation_members')
      .select('role, status, scope_kind, scope_ids, joined_at, organisations(name, slug)')
      .eq('user_id', user.id),
    supabase
      .from('data_requests')
      .select('kind, status, note, requested_at, responded_at')
      .eq('user_id', user.id),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    about:
      'Everything Amryn holds about you as an individual. Business data belonging to your organisation is not included; ask an administrator to export that.',
    account: {
      email: user.email,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at,
      emailConfirmedAt: user.email_confirmed_at ?? null,
    },
    profile: profile.data ?? null,
    consent: {
      termsAcceptedAt: profile.data?.terms_accepted_at ?? null,
      termsVersion: profile.data?.terms_version ?? null,
      privacyAcceptedAt: profile.data?.privacy_accepted_at ?? null,
      privacyVersion: profile.data?.privacy_version ?? null,
      currentVersion: LEGAL_VERSION,
    },
    organisations: memberships.data ?? [],
    requests: requests.data ?? [],
  };

  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="amryn-your-information-${stamp}.json"`,
      // A personal record must never be held by a shared cache on the way back.
      'cache-control': 'no-store, private',
    },
  });
}
