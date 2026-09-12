/**
 * The assurance level in an access token.
 *
 * Its own module because two places need it and one of them is middleware,
 * which cannot import anything marked `server-only`. It is also the only
 * piece of this with a decision in it, so having it somewhere a test can
 * reach is worth a file.
 *
 * ── read rather than verified, on purpose ────────────────────────────────
 *
 * This decodes a claim without checking the signature, which would be
 * indefensible if it were the control. It is not: the level decides a
 * redirect, and the database refuses a session that owes a second factor on
 * every query regardless (migration 15). A forged token buys a page that
 * renders nothing.
 *
 * What it buys is a round trip. Asking the auth server for the level on every
 * request would double the auth cost of every page for a courtesy.
 */
export function decodeAal(accessToken: string | undefined | null): string | undefined {
  if (!accessToken) return undefined;
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return undefined;
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
    return (JSON.parse(json) as { aal?: string }).aal;
  } catch {
    return undefined;
  }
}

/** A factor shape narrow enough for both callers, and for a test. */
export interface FactorLike {
  id: string;
  status: string;
  factor_type?: string;
}

/**
 * The verified second factor to challenge, or none.
 *
 * Read off the user returned by getUser() — which is revalidated against the
 * auth server — rather than off a session. That is the whole point: the
 * session's user object is decoded from a cookie, and supabase-js proxies it
 * so that touching any property logs an error-severity warning. Reading
 * factors from there is what filled the log.
 */
export function verifiedTotpFactor(
  factors: readonly FactorLike[] | null | undefined,
): FactorLike | undefined {
  return (factors ?? []).find(
    (factor) =>
      factor.status === 'verified' && (factor.factor_type ?? 'totp') === 'totp',
  );
}
