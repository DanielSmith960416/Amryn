/**
 * Whether the database has caught up with the build that is talking to it.
 *
 * Pure: two lists in, the difference out. No database and no opinion about what
 * to do next — the worker decides that, and /diagnostics reports it.
 *
 * ── the failure this exists for ───────────────────────────────────────────
 *
 * Twice now the worker has deployed before its migrations were applied. Both
 * times it came up healthy, claimed a job, and failed on a table that did not
 * exist yet — twin.nightly three times over, until it had spent every attempt
 * it was allowed. The migration landed a few minutes later, by which point the
 * queue had permanently failed work that would then have succeeded, and the
 * row had to be reset by hand.
 *
 * The handler was right and the schema was right. They were right at different
 * times, and nothing in the system was watching for that.
 *
 * ── why compare filenames rather than ask the database how it looks ───────
 *
 * A build knows exactly which migration files it was made from; the ledger
 * knows exactly which ones have run. The difference between those two lists is
 * the whole answer, and it needs no judgement about which missing column
 * matters to which handler — a judgement that would have to be revisited on
 * every migration and would be wrong the first time somebody forgot.
 */

/**
 * The migrations this build carries that the database has not recorded.
 *
 * Order is the shipped order, because migrations depend on each other and the
 * first one missing is the one to read about.
 */
export function migrationsBehind(shipped: readonly string[], applied: readonly string[]): string[] {
  const seen = new Set(applied);
  return shipped.filter((file) => !seen.has(file));
}

/**
 * The readable half of a migration filename.
 *
 * `20260909220000_34_schema_drift.sql` → `34_schema_drift`. The timestamp
 * exists to make the files sort; it is not what anybody calls the migration,
 * and four of them in one log line is unreadable.
 *
 * A filename that does not follow the convention is returned as it is. Losing
 * the name of the file somebody has to go and look at, in order to tidy up its
 * formatting, would be a poor trade.
 */
export function migrationName(file: string): string {
  const withoutExtension = file.replace(/\.sql$/, '');
  const match = /^\d{8,}_(.+)$/.exec(withoutExtension);
  return match?.[1] ?? withoutExtension;
}

/**
 * What to tell somebody who has to fix it.
 *
 * Names the files rather than counting them: "the database is 3 migrations
 * behind" sends a person looking for which three, and they are right here. Past
 * a handful the list stops being useful and the count starts being the point,
 * so it truncates — and the count stays exact even when the list does not.
 */
export function describeDrift(behind: readonly string[]): string {
  if (behind.length === 0) return 'The database has every migration this build carries.';

  const named = behind.slice(0, 4).map(migrationName);
  const rest = behind.length - named.length;
  const list = rest > 0 ? `${named.join(', ')} and ${rest} more` : named.join(', ');

  return (
    `The database is missing ${behind.length} migration${behind.length === 1 ? '' : 's'} ` +
    `this build was made from: ${list}.`
  );
}
