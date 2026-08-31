/**
 * Where to send someone after they sign in.
 *
 * An unchecked redirect target turns a sign-in form into an open redirect: a
 * link to your own trusted domain that lands on somebody else's, which is
 * exactly the shape a credible phishing page needs.
 *
 * So only a path on this site is ever accepted — one leading slash, and not
 * two, since `//evil.example` is a protocol-relative URL that browsers treat
 * as another origin while it reads like a local path.
 */
export const DEFAULT_AFTER_SIGN_IN = '/command-centre';

export function safeNextPath(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_AFTER_SIGN_IN;
  const trimmed = value.trim();
  if (!/^\/(?!\/)/.test(trimmed)) return DEFAULT_AFTER_SIGN_IN;
  // A backslash is treated as a slash by some browsers when resolving, so
  // `/\evil.example` can escape the origin too.
  if (trimmed.startsWith('/\\')) return DEFAULT_AFTER_SIGN_IN;
  return trimmed;
}
