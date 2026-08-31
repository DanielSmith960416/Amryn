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
 * Read from Supabase's own assurance levels rather than from our stored flag:
 * `nextLevel` is what the auth server believes this account requires, which is
 * the authority on whether a challenge is outstanding. The stored flag exists
 * for the database guard, which cannot ask the auth server.
 *
 * Cached per request. Several layouts ask, and it is a round trip each time.
 */
export const mfaState = cache(async (): Promise<MfaState> => {
  const user = await getCurrentUser();
  if (!user) return { required: false, enrolled: false };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    if (error || !data) return { required: false, enrolled: false };
    if (data.nextLevel !== 'aal2') return { required: false, enrolled: false };
    if (data.currentLevel === 'aal2') return { required: false, enrolled: true };

    // Outstanding. Find the factor to challenge.
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verified = factors?.totp?.find((factor) => factor.status === 'verified');

    // nextLevel says aal2 with no verified factor to present, which should not
    // happen. Treating it as "nothing required" is the only safe direction:
    // the alternative sends someone to a page that cannot be completed, with
    // no way out of it.
    if (!verified) return { required: false, enrolled: false };

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
