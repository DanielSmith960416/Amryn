import 'server-only';

/**
 * Rate limiting for the endpoints worth attacking.
 *
 * Sign-in and sign-up are credential-stuffing surfaces; organisation creation
 * and invitations are ways to fill somebody else's database. None of them had
 * a limit.
 *
 * ── what is not stored ────────────────────────────────────────────────────
 * The identifier — an email address, an IP address — is hashed before it
 * leaves this process. Both are personal information under POPIA, and keeping
 * either in readable form would build a log of who tried to sign in and from
 * where, retained for a purpose nobody agreed to. A hash answers "has this one
 * been seen too often" without recording whose it is, and it means the raw
 * value never appears in a query log either.
 */
import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export interface Limit {
  /** How many attempts the window allows. */
  max: number;
  /** A PostgreSQL interval, e.g. '15 minutes'. */
  window: string;
}

/**
 * Deliberately generous. These exist to stop automated abuse, not to punish
 * somebody who mistypes a password four times — and a limit tight enough to
 * catch the second will generate support tickets long before it catches the
 * first.
 */
export const LIMITS = {
  signIn: { max: 10, window: '15 minutes' },
  signUp: { max: 5, window: '1 hour' },
  passwordReset: { max: 5, window: '1 hour' },
  createOrganisation: { max: 5, window: '1 hour' },
  invite: { max: 30, window: '1 hour' },
  // Generous enough that nobody exercising a right is impeded by it — a limit
  // that stopped someone asking what is held about them would be the wrong
  // kind of protection — but low enough that the queue cannot be flooded.
  dataRequest: { max: 10, window: '24 hours' },
  // Six digits is a one-in-a-million guess, which is a different proposition
  // when the guesses are free. Ten an hour leaves room for a phone whose clock
  // has drifted and closes the door on anything automated.
  mfaVerify: { max: 10, window: '1 hour' },
  // Deliberately tighter. A recovery code is the way past the second factor,
  // and unlike a six-digit code there is no expiry racing the attacker.
  mfaRecovery: { max: 5, window: '1 hour' },
  // Asking to buy something should not be rationed tightly — a customer who
  // changes their mind twice about a plan is a customer, not an attack — but
  // each request supersedes the last and writes an audit entry, so it is not
  // free either.
  subscriptionRequest: { max: 20, window: '1 hour' },
  // A stocktake is a deliberate act that happens weekly at most, and each one
  // writes hundreds of rows. Generous enough for a bad first attempt and a
  // retry, tight enough that the import endpoint is not a way to fill a table.
  stockImport: { max: 10, window: '1 hour' },
} as const satisfies Record<string, Limit>;

function hash(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

/**
 * The caller's address, as far as it can be known.
 *
 * Behind a proxy the socket address is the proxy's, so the forwarded header is
 * what identifies the client — and its first entry is the one the edge saw,
 * the rest being appended by intermediaries and trivially forged. Absent
 * entirely, there is nothing to key on and the limiter says so rather than
 * inventing a value that would put every anonymous caller in one bucket.
 */
async function clientAddress(): Promise<string | null> {
  const store = await headers();
  const forwarded = store.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return store.get('x-real-ip')?.trim() || null;
}

export interface LimitResult {
  allowed: boolean;
  /** What to tell the caller, when they are over. */
  message?: string;
}

const OVER_LIMIT =
  'Too many attempts from this device. Please wait a few minutes and try again.';

/**
 * Checks one bucket.
 *
 * Fails open. A rate limiter that refuses when it cannot reach the database
 * turns a database blip into an outage of the sign-in page — a far larger
 * problem than the one it exists to prevent.
 */
export async function checkLimit(
  scope: keyof typeof LIMITS,
  identifier: string | null,
): Promise<LimitResult> {
  const id = identifier ?? (await clientAddress());
  if (!id) return { allowed: true };

  const limit = LIMITS[scope];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_bucket: `${scope}:${hash(id)}`,
      p_max: limit.max,
      p_window: limit.window,
    });

    if (error) {
      console.error('[amryn:rate-limit] check failed', error.message);
      return { allowed: true };
    }
    return data === false ? { allowed: false, message: OVER_LIMIT } : { allowed: true };
  } catch (error) {
    console.error('[amryn:rate-limit] check threw', error);
    return { allowed: true };
  }
}

/**
 * Checks the address and, where there is one, the account being targeted.
 *
 * Two buckets because they catch different things: one attacker working
 * through many addresses trips the first, and many attackers working on one
 * account trip the second. Either being over is enough to refuse.
 */
export async function checkAuthLimit(
  scope: keyof typeof LIMITS,
  email?: string,
): Promise<LimitResult> {
  const byAddress = await checkLimit(scope, null);
  if (!byAddress.allowed) return byAddress;
  if (!email) return { allowed: true };
  return checkLimit(scope, `email:${email}`);
}
