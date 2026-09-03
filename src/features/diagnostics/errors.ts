/**
 * What a failed read from PostgREST actually means.
 *
 * These are separate from checks.ts, which is `server-only` and builds a
 * Supabase client on import, so nothing can exercise its judgement in a test.
 * That mattered: the whole cost of getting one of these wrong is paid at the
 * far end, on somebody's deployment, by a page whose entire job is to say what
 * is wrong. It is worth being able to prove them.
 *
 * Every one classifies a message string, so each is a pure function of text
 * PostgREST produced. Nothing here reads configuration or opens a connection.
 */

/**
 * The database refused on grounds of privilege — and therefore was reached.
 *
 * A 42501 means a live database evaluated the request, accepted the key,
 * resolved the role, and decided that role may not read the table. None of
 * those four things can happen unless it answered.
 *
 * The reachability probe reads `permissions`, which is granted to
 * `authenticated` and `service_role` and deliberately not to `anon`. Signed
 * out, a refusal is the correct answer from a correctly secured database.
 * Counted as a failure it condemned a healthy deployment: /api/health returned
 * 503, every check below it was skipped as unreadable, and the remedy on
 * screen advised checking whether the project was paused — nothing to do with
 * grants, about a project answering in milliseconds.
 */
export function isPermissionDenied(message: string | undefined | null): boolean {
  return /permission denied|42501/i.test(message ?? '');
}

/**
 * The database refused the key rather than answering.
 *
 * Worth singling out because it invalidates every other reading: nothing
 * downstream can be attempted, so nothing downstream should be reported as a
 * finding of its own.
 */
export function isKeyRejection(message: string | undefined | null): boolean {
  return /invalid api key|no api key|jwt|not authorized|unauthorized/i.test(message ?? '');
}

/**
 * PostgREST says a table is not in its schema cache.
 *
 * Separated from every other failure because it has two causes needing
 * opposite responses, and the message names neither: the table does not exist
 * in this project, or it does and the API has not been told.
 */
export function isSchemaCacheMiss(message: string | undefined | null): boolean {
  return /schema cache/i.test(message ?? '');
}
