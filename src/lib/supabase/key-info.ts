/**
 * What a Supabase API key says about itself.
 *
 * "Invalid API key" is Supabase's answer to a key it will not accept, and it
 * is the same four words whether the key belongs to another project, has
 * expired, was truncated on the way into a hosting dashboard, or is the wrong
 * kind of key entirely. That is a poor thing to show someone who cannot read
 * the code, so this module works out *which* of those it is — before any
 * request is sent, and without asking the reader to compare two long strings
 * by eye.
 *
 * Everything examined here is public. A Supabase anon key is a JWT signed by
 * the project and handed to every browser that loads the page: its payload
 * names the project and the role, and is meant to be read. Nothing in this
 * file returns the key itself, and the caller must not either.
 */

/** Which kind of key this is, as far as it can be told from its shape. */
export type KeyKind =
  | 'legacy-anon'
  | 'legacy-service-role'
  | 'legacy-other'
  | 'publishable'
  | 'secret'
  | 'unrecognised';

export interface KeyInfo {
  kind: KeyKind;
  /** The project the key was issued for, when the key names one. */
  ref: string | null;
  /** The role it carries, when it carries one. */
  role: string | null;
  /** When it stops being accepted, when it says. */
  expiresAt: Date | null;
  expired: boolean;
  /**
   * True when this key must never appear in a browser bundle. A service-role
   * or secret key in NEXT_PUBLIC_SUPABASE_ANON_KEY is not a misconfiguration
   * to note in passing — it is published, and it bypasses every Row Level
   * Security policy in the database.
   */
  secret: boolean;
}

/** The project reference in a Supabase URL — the `abcd` of `https://abcd.supabase.co`. */
export function projectRefFromUrl(url: string): string | null {
  try {
    const { hostname } = new URL(url);
    const [ref, ...rest] = hostname.split('.');
    // Only trust the first label when the rest is actually Supabase's domain;
    // a self-hosted instance on a custom domain has no ref to read.
    if (rest.join('.').endsWith('supabase.co') || rest.join('.').endsWith('supabase.in')) {
      return ref && ref.length > 0 ? ref : null;
    }
    return null;
  } catch {
    return null;
  }
}

function decodeSegment(segment: string): unknown {
  // JWTs use base64url. atob does not, so restore the two substituted
  // characters and the padding before decoding.
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const full = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  try {
    return JSON.parse(
      typeof atob === 'function'
        ? atob(full)
        : Buffer.from(full, 'base64').toString('utf8'),
    );
  } catch {
    return null;
  }
}

/**
 * Reads a key's self-description. Never verifies the signature — that is the
 * server's job, and doing it here would need the project's secret.
 */
export function inspectKey(key: string): KeyInfo {
  const trimmed = key.trim();

  const unknown: KeyInfo = {
    kind: 'unrecognised',
    ref: null,
    role: null,
    expiresAt: null,
    expired: false,
    secret: false,
  };

  if (trimmed.length === 0) return unknown;

  // The current key format announces itself in a prefix and carries nothing
  // else readable.
  if (trimmed.startsWith('sb_secret_')) {
    return { ...unknown, kind: 'secret', secret: true };
  }
  if (trimmed.startsWith('sb_publishable_')) {
    return { ...unknown, kind: 'publishable' };
  }

  const parts = trimmed.split('.');
  if (parts.length !== 3) return unknown;

  const payload = decodeSegment(parts[1]!);
  if (payload === null || typeof payload !== 'object') return unknown;

  const claims = payload as Record<string, unknown>;
  const role = typeof claims.role === 'string' ? claims.role : null;
  const ref = typeof claims.ref === 'string' ? claims.ref : null;
  const exp = typeof claims.exp === 'number' ? new Date(claims.exp * 1000) : null;

  const kind: KeyKind =
    role === 'anon'
      ? 'legacy-anon'
      : role === 'service_role'
        ? 'legacy-service-role'
        : 'legacy-other';

  return {
    kind,
    ref,
    role,
    expiresAt: exp,
    expired: exp !== null && exp.getTime() <= Date.now(),
    secret: role === 'service_role',
  };
}

export interface KeyVerdict {
  status: 'ok' | 'warn' | 'fail';
  detail: string;
  remedy?: string;
}

/**
 * Judges an anon key against the project URL it is paired with, in words.
 *
 * The order matters: a published service-role key is reported before anything
 * else, because it is the only finding here that is a security incident rather
 * than an inconvenience.
 */
export function judgeAnonKey(key: string | undefined, url: string | undefined): KeyVerdict {
  const trimmed = key?.trim();
  if (!trimmed) {
    return {
      status: 'fail',
      detail: 'NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.',
      remedy: 'Copy the anon public key from Supabase → Settings → API, then redeploy.',
    };
  }

  const info = inspectKey(trimmed);

  if (info.secret) {
    return {
      status: 'fail',
      detail:
        info.kind === 'secret'
          ? 'This is a secret key, not the anon key. Anything with NEXT_PUBLIC_ in its name is sent to every visitor’s browser, so this key is now public.'
          : 'This is the service_role key, not the anon key. Anything with NEXT_PUBLIC_ in its name is sent to every visitor’s browser, so this key is now public — and it bypasses every Row Level Security policy in the database.',
      remedy:
        'Treat it as compromised: roll the key in Supabase → Settings → API, put the anon public key in NEXT_PUBLIC_SUPABASE_ANON_KEY instead, and redeploy.',
    };
  }

  if (info.kind === 'unrecognised') {
    return {
      status: 'fail',
      detail:
        trimmed.length < 20
          ? `Set, but only ${trimmed.length} characters — far shorter than any Supabase key.`
          : 'Set, but it is not in any shape Supabase issues. It is most likely truncated, or has a stray line break or quotation mark in it.',
      remedy:
        'Copy the anon public key again from Supabase → Settings → API, taking the whole value in one go, then redeploy.',
    };
  }

  if (info.expired) {
    return {
      status: 'fail',
      detail: `This key expired on ${info.expiresAt?.toISOString().slice(0, 10)}. Supabase answers an expired key with “Invalid API key”.`,
      remedy: 'Issue a new anon key in Supabase → Settings → API, then redeploy.',
    };
  }

  const expected = url ? projectRefFromUrl(url) : null;
  if (expected && info.ref && info.ref !== expected) {
    return {
      status: 'fail',
      detail: `This key was issued for project “${info.ref}”, but the URL points at project “${expected}”. Supabase answers a key from another project with “Invalid API key”.`,
      remedy: `Take both values from the same project. For “${expected}”, they are together on one page: Supabase → Settings → API. Then redeploy.`,
    };
  }

  if (info.kind === 'publishable') {
    return {
      status: 'ok',
      detail: 'Present, and in the current publishable-key format.',
    };
  }

  if (info.kind === 'legacy-other') {
    return {
      status: 'warn',
      detail: `Present, but it carries the role “${info.role ?? 'none'}” rather than “anon”.`,
      remedy: 'Use the key labelled anon public in Supabase → Settings → API.',
    };
  }

  return {
    status: 'ok',
    detail: expected
      ? `Present, an anon key, and issued for project “${expected}” — the same project as the URL.`
      : 'Present, and an anon key.',
  };
}
