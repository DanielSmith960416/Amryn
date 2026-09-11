import 'server-only';

/**
 * Writing a failure down.
 *
 * ── never in the way of the thing it is recording ────────────────────────
 *
 * Two rules, both taken from lib/audit.ts, which learned them the hard way: a
 * failed write never breaks the operation it was describing, and nothing here
 * is awaited by a caller that has a customer waiting.
 *
 * ourFault() stays synchronous and returns its sentence immediately; this runs
 * behind it. A request that ends before the insert lands loses that
 * occurrence, which is the honest cost of not making thirty-nine call sites
 * async to record telemetry. The count is approximate by design; the fact that
 * something is failing is not.
 */
import { createAdminClient } from '@/lib/supabase/server';
import { fingerprint, scrub } from './fingerprint';

/**
 * Which program this is, for a row that says where to go and look.
 *
 * The worker sets AMRYN_SERVICE on itself at startup rather than a deployment
 * setting it — one fewer variable to get wrong, and it cannot drift when a
 * service is renamed. Anything that has not said otherwise is the web service,
 * which is the one a request can reach.
 *
 * Read on each call rather than at module load: the worker sets it before it
 * does anything, but a module evaluated during its import would have read the
 * value from before that line ran.
 */
function service(): 'web' | 'worker' {
  return process.env.AMRYN_SERVICE === 'worker' ? 'worker' : 'web';
}

// The same source the worker's heartbeat and /diagnostics already use. Not
// Vercel's equivalent: this project removed Vercel in #17, and a second
// fallback nothing sets is a line that only ever misleads.
const REVISION = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null;

/**
 * Records one failure, or quietly does not.
 *
 * Uses the service-role client deliberately: platform_errors carries no
 * organisation and has no policy that a session could satisfy. There is no
 * tenant scoping to apply because there is no tenant — this is the platform's
 * own plumbing, which is also why nothing here takes an organisation id.
 */
export async function recordError(scope: string, detail: unknown): Promise<void> {
  try {
    const message = scrub(describe(detail));
    if (message === '') return;

    const admin = createAdminClient();
    const { error } = await admin.rpc('record_platform_error', {
      p_fingerprint: fingerprint(scope, message),
      p_scope: scope.slice(0, 80),
      p_message: message,
      p_service: service(),
      p_revision: REVISION,
    });

    // Deliberately console-only. Reporting a failure to report a failure
    // through the same channel is how a loop starts.
    if (error) console.error(`[amryn:errors] could not record a ${scope} failure: ${error.message}`);
  } catch {
    // Including a missing service role key, which is a configuration problem
    // and not this function's to complain about on every call.
  }
}

/** Whatever arrived, as one line. Errors, Supabase's plain objects, strings. */
function describe(detail: unknown): string {
  if (detail == null) return '';
  if (typeof detail === 'string') return detail;
  if (detail instanceof Error) return detail.message;

  if (typeof detail === 'object') {
    const record = detail as Record<string, unknown>;
    const parts = [record.code, record.message, record.details, record.hint]
      .filter((part): part is string => typeof part === 'string' && part.length > 0);
    if (parts.length > 0) return parts.join(' · ');
  }

  return String(detail);
}
