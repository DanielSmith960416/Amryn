import 'server-only';

/**
 * Two-factor authentication, from the application's side.
 *
 * Supabase issues and verifies the TOTP factor itself, so there is no secret
 * handling here and no clock arithmetic. What this module owns is the state
 * the rest of the platform reasons about: whether this person has a second
 * factor, and whether this session has presented it.
 *
 * The database enforces the same thing independently — see migration 15. That
 * is not belt and braces, it is the actual control: a browser session carries
 * a token that speaks to the API directly, so an application-level redirect
 * hides the data without protecting it. What lives here is the part that makes
 * the product usable, not the part that makes it safe.
 */
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { decodeAal, verifiedTotpFactor } from './aal';
import { getCurrentUser } from './session';

export type MfaState =
  /** Has no second factor. Nothing is required of them. */
  | { required: false; enrolled: false }
  /** Has one, and has presented it on this session. */
  | { required: false; enrolled: true }
  /** Has one and has not presented it. Everything is closed until they do. */
  | { required: true; enrolled: true; factorId: string };

/**
 * Whether this session still owes a second factor.
 *
 * ── this filled the log, and the fix is the one the middleware already made ──
 *
 * It used to ask supabase-js for the authenticator assurance level. Called
 * without a token — which is how it was called — that method reaches for
 * getSession() internally and then reads `session.user.factors`. supabase-js
 * wraps a session's user in a proxy that logs an error-severity warning the
 * moment any property is touched, because that object was decoded from a
 * cookie and never revalidated. So every private page render produced one:
 *
 *   Using the user object as returned from supabase.auth.getSession() …
 *   could be insecure!
 *
 * Task 29 fixed exactly this in the middleware and this file was missed. The
 * warning was never about our own read — it came from inside the library, on
 * our behalf, which is why grepping for `.user` found nothing.
 *
 * Nothing was exposed: the database refuses a session that owes a factor on
 * every query (migration 15). What it cost was a log in which an error line
 * meant nothing.
 *
 * The two facts needed are taken from sources that do not trip it:
 *   · the verified factors, off the user getUser() already returned, which is
 *     revalidated against the auth server;
 *   · the current level, decoded from the access token — a signed string
 *     rather than a claim about identity, and reading it warns about nothing.
 *
 * It is also one round trip lighter: listFactors() is gone, because the factor
 * to challenge is on the user we already hold.
 *
 * Cached per request. Several layouts ask.
 */
export const mfaState = cache(async (): Promise<MfaState> => {
  const user = await getCurrentUser();
  if (!user) return { required: false, enrolled: false };

  const verified = verifiedTotpFactor(user.factors);
  if (!verified) return { required: false, enrolled: false };

  try {
    const supabase = await createClient();

    /*
     * Only the access token is read off this. The proxy that warns is on
     * `.user`, so touching `access_token` is silent — and it is the one field
     * carrying the level this has to know.
     */
    const { data } = await supabase.auth.getSession();
    const level = decodeAal(data.session?.access_token);

    if (level === 'aal2') return { required: false, enrolled: true };

    return { required: true, enrolled: true, factorId: verified.id };
  } catch (error) {
    // The auth server is unreachable. Every route already treats that as
    // signed out, and a redirect loop into a verification page that cannot
    // load is worse than the redirect to sign-in they will get anyway.
    console.error('[amryn:mfa] could not read the assurance level', error);
    return { required: false, enrolled: false };
  }
});

/** Convenience for the guards, which only ever ask this one question. */
export async function mfaChallengeOutstanding(): Promise<boolean> {
  return (await mfaState()).required;
}
