import 'server-only';

/**
 * Who may see the operator tools.
 *
 * /diagnostics and /setup exist to explain a deployment to whoever runs it.
 * They were reachable without signing in, deliberately: most of what
 * diagnostics can tell you is *why signing in does not work*, and a page that
 * requires a session is unreachable exactly when it is needed.
 *
 * That reasoning was right for a deployment being set up and wrong for one
 * with customers on it. A page naming settings, table counts and connection
 * states is not something a customer should meet, and it is a map of the
 * system for anyone else who finds it.
 *
 * So both are closed — without losing the escape hatch, because the original
 * problem has not gone away. Two ways in:
 *
 *   · Signed in as an administrator of an organisation. The normal route.
 *   · With INTERNAL_ACCESS_TOKEN, given as ?key= or an x-internal-key header.
 *     For the case the first cannot cover: nobody can sign in, and the page
 *     that explains why is behind signing in.
 *
 * With no token configured, only the first applies. There is no default value
 * and no fallback that lets anyone in — an escape hatch with a guessable key
 * is just an open door.
 */
import { timingSafeEqual } from 'node:crypto';
import { headers } from 'next/headers';
import { getWorkspace } from '@/lib/auth/session';

/** Compared without leaking its length through timing. */
function matches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type AccessReason = 'administrator' | 'token' | 'denied';

/**
 * `key` comes from the query string, which the caller passes in — reading
 * searchParams is the page's job, not this module's.
 */
export async function internalAccess(key?: string): Promise<AccessReason> {
  const expected = process.env.INTERNAL_ACCESS_TOKEN?.trim();

  if (expected && expected.length > 0) {
    const header = (await headers()).get('x-internal-key')?.trim();
    for (const candidate of [key?.trim(), header]) {
      if (candidate && matches(candidate, expected)) return 'token';
    }
  }

  // An administrator of any organisation they belong to. Deliberately not a
  // separate platform-admin role: this platform has no such concept, and
  // inventing one here would put an unenforced idea of privilege in a place
  // nobody would think to audit.
  try {
    const workspace = await getWorkspace();
    if (workspace && (workspace.role === 'org_admin' || workspace.role === 'super_admin')) {
      return 'administrator';
    }
  } catch {
    // An unreachable database is exactly when these pages matter most, so a
    // failure to answer the question is not a reason to refuse — it just means
    // the token is the only way in.
  }

  return 'denied';
}
