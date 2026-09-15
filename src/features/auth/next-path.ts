/**
 * Where to send someone after they sign in.
 *
 * ── the open redirect, which is why this exists ───────────────────────────
 * An unchecked redirect target turns a sign-in form into an open redirect: a
 * link to your own trusted domain that lands on somebody else's, which is
 * exactly the shape a credible phishing page needs.
 *
 * So only a path on this site is ever accepted — one leading slash, and not
 * two, since `//evil.example` is a protocol-relative URL that browsers treat
 * as another origin while it reads like a local path.
 *
 * ── and the loop, which is why it checks the shape too ────────────────────
 * Checking the origin is not enough. It let through anything that merely
 * began with a slash, including a target that no route could ever match, and
 * that turned a single bad redirect into a permanent one:
 *
 *   1. A browser landed once on "/command-centre, /command-centre" — two
 *      Location headers on one response, joined the way HTTP joins repeated
 *      headers, with a comma and a space.
 *   2. That URL 404s. Asking for it without a session made the middleware
 *      write it into ?next=, because the middleware forwards whatever path
 *      was asked for.
 *   3. The sign-in form carried it in its hidden field, this function waved
 *      it through — one leading slash, not two — and redirect() sent the
 *      reader straight back to the 404.
 *
 * Every sign-in from that browser re-entered the loop, so fixing the redirect
 * that started it did not release anybody already caught in it. A target is
 * now required to look like a path this application could serve: no spaces,
 * no commas, no control characters, nothing that only a malformed URL
 * contains. A target that fails lands on the Command Centre, which is where
 * somebody signing in wanted to be anyway.
 */
export const DEFAULT_AFTER_SIGN_IN = '/command-centre';

/**
 * The characters a real route here is made of, plus the ones a query string
 * and a fragment legitimately need. Deliberately narrower than RFC 3986: a
 * comma and a space are both legal in a URL path and neither appears in any
 * route this application has, so refusing them costs nothing and closes the
 * loop above.
 */
const PLAUSIBLE_PATH = /^\/[A-Za-z0-9\-._~%/]*(?:\?[A-Za-z0-9\-._~%/&=+]*)?(?:#[A-Za-z0-9\-._~%/]*)?$/;

export function safeNextPath(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_AFTER_SIGN_IN;
  const trimmed = value.trim();
  if (!/^\/(?!\/)/.test(trimmed)) return DEFAULT_AFTER_SIGN_IN;
  // A backslash is treated as a slash by some browsers when resolving, so
  // `/\evil.example` can escape the origin too.
  if (trimmed.startsWith('/\\')) return DEFAULT_AFTER_SIGN_IN;
  // Percent-encoding can hide any of the above from the checks around it:
  // %2F%2Fevil.example decodes to //evil.example once the browser resolves it.
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    // A malformed escape is not a path anybody meant to type.
    return DEFAULT_AFTER_SIGN_IN;
  }
  if (!/^\/(?!\/)/.test(decoded) || decoded.startsWith('/\\')) return DEFAULT_AFTER_SIGN_IN;
  if (!PLAUSIBLE_PATH.test(trimmed)) return DEFAULT_AFTER_SIGN_IN;
  return trimmed;
}
