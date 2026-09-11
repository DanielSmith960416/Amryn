/**
 * Turning one failure into a row somebody will actually read.
 *
 * Pure: text in, text out. No database and no clock, so what counts as "the
 * same error twice" can be argued with in a test rather than discovered from a
 * table with forty thousand rows in it.
 *
 * ── two jobs, and the second one is the important one ────────────────────
 *
 * Grouping, so a loop that fails a thousand times is one line saying it failed
 * a thousand times. And scrubbing, because an error message is the single most
 * reliable place a secret ends up: drivers quote the connection string that
 * failed, HTTP clients quote the URL including its token, and a stack trace
 * quotes whatever was in scope. A table of errors readable by an operator is a
 * table that must not carry any of that.
 */

/** Scope, then the shape of the message. Same shape means same problem. */
export function fingerprint(scope: string, message: string): string {
  return `${scope.trim().toLowerCase()}:${shape(message)}`.slice(0, 200);
}

/**
 * What the message would look like with the particulars taken out.
 *
 * "could not reach 10.0.0.4" and "could not reach 10.0.0.9" are one problem.
 * So are the same failure against two different row ids. Without this, an
 * error carrying an identifier makes a new row every time and the count — the
 * one number that says whether this is a blip or a flood — never rises above
 * one.
 */
function shape(message: string): string {
  return message
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<id>')
    .replace(/\b\d+(\.\d+){3}\b/g, '<address>')
    .replace(/\b[0-9a-f]{16,}\b/g, '<hash>')
    .replace(/\d+/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

/**
 * The message with anything that should not be written down taken out.
 *
 * Deliberately broad, and in that order. A useful word wrongly removed costs a
 * little clarity in a diagnostic; a credential wrongly kept costs the
 * credential — the same trade looksLikeSecret() in lib/env makes, and made for
 * the same reason: a live key once reached a page because a variable's name
 * was trusted to say what was in it.
 */
export function scrub(message: string): string {
  return message
    // Connection strings first: they contain a password and everything after
    // it would otherwise be quoted verbatim.
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"']*/gi, (url) => redactUrl(url))
    // Bearer tokens, api keys and the like, however they are introduced.
    .replace(/\b(bearer|token|key|secret|password|apikey|api[_-]?key)\b\s*[:=]?\s*\S+/gi, '$1 <removed>')
    // Anything long enough and random enough to be a credential on its own.
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '<removed>')
    // An address is somebody's personal information, and an error table is not
    // where a customer's email belongs.
    .replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g, '<email>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1000);
}

/**
 * A URL with its credentials and query removed, keeping the host.
 *
 * Which host was unreachable is the whole diagnostic value; the token in the
 * path or the password in the userinfo is the whole risk. Keeping one and
 * dropping the other is the point.
 */
function redactUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}${url.pathname === '/' ? '' : '/<path>'}`;
  } catch {
    return '<url>';
  }
}
