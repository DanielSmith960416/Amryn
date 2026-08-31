import 'server-only';

/**
 * The failures that are ours, said once.
 *
 * Every form in the application had its own version of what to do with an
 * error the reader did not cause, and the versions disagreed: some printed the
 * database's own sentence under a field, some named a setting, one sent a
 * customer to an operator page. The pattern is always the same — tell the
 * person it is not theirs to fix and that it is temporary, and put the actual
 * description where somebody can act on it.
 *
 * Doing that in one place is the point. A raw error reaching a customer is
 * never a decision anybody made; it is what happens when the easy thing to
 * write is `error.message`.
 */

/**
 * Logs the real fault and returns what to show instead.
 *
 * @param scope  where it happened, for the log prefix — 'invitations', 'onboarding'.
 * @param detail the underlying error, in whatever form it arrived.
 * @param shown  the sentence the reader gets. The default suits most forms.
 */
export function ourFault(
  scope: string,
  detail: unknown,
  shown = 'Something went wrong on our side. Nothing you entered was at fault — please try again in a few minutes.',
): string {
  console.error(`[amryn:${scope}] ${describe(detail)}`);
  return shown;
}

/** Whatever arrived, as one line. Errors, Supabase's plain objects, strings. */
function describe(detail: unknown): string {
  if (detail == null) return 'failed with no reason given';
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
