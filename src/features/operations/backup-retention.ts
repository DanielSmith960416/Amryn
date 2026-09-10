/**
 * Which dumps to delete, and — more importantly — which never to.
 *
 * Pure: filenames and their timestamps in, the ones to remove out. No
 * filesystem, so the rule that protects the last backup can be argued with in
 * a test rather than discovered by its absence.
 *
 * ── the rule that matters ─────────────────────────────────────────────────
 *
 * Age alone is not a reason to delete a backup. A volume holding one dump from
 * six months ago holds everything that stands between the product and nothing,
 * and a tidy-up that removed it because it was old would be the single most
 * destructive thing this codebase could do — quietly, on a schedule, while
 * every other signal stayed green.
 *
 * So the floor comes first: the newest KEEP_AT_LEAST are kept whatever their
 * age, and only then is age allowed to remove anything.
 */

/** Two weeks of daily dumps, which is enough to notice and undo a bad week. */
export const KEEP_DAYS = 14;

/**
 * Never fewer than this, however old they are.
 *
 * Three rather than one: if the newest turns out to be a dump of the wrong
 * database — complete, checksummed and worthless — the two behind it are what
 * you fall back to.
 */
export const KEEP_AT_LEAST = 3;

export interface StoredDump {
  name: string;
  takenAt: string;
}

export interface RetentionPolicy {
  keepDays?: number;
  keepAtLeast?: number;
}

/**
 * The dumps that may be deleted, oldest first.
 *
 * Everything not returned is kept. A file whose timestamp cannot be read is
 * never returned: an unreadable name is a reason to leave a file alone, not a
 * reason to remove it.
 */
export function dumpsToPrune(
  files: readonly StoredDump[],
  now: Date,
  policy: RetentionPolicy = {},
): StoredDump[] {
  const keepDays = policy.keepDays ?? KEEP_DAYS;
  const keepAtLeast = policy.keepAtLeast ?? KEEP_AT_LEAST;

  const dated = files
    .map((file) => ({ file, at: Date.parse(file.takenAt) }))
    .filter((entry) => Number.isFinite(entry.at))
    .sort((a, b) => b.at - a.at);

  // The floor, applied before age is consulted at all.
  const beyondTheFloor = dated.slice(keepAtLeast);

  const cutoff = now.getTime() - keepDays * 24 * 3_600_000;

  // Oldest first. Deleting files is not atomic, so a run that fails halfway
  // should have removed the least useful ones — not taken a bite out of the
  // middle and left the oldest behind.
  return beyondTheFloor
    .filter((entry) => entry.at < cutoff)
    .sort((a, b) => a.at - b.at)
    .map((entry) => entry.file);
}

/**
 * The timestamp backup.mjs puts in a dump's name.
 *
 * `amryn-<digest>-2026-09-10T07-19-28-086Z.sql`. The colons a timestamp needs
 * are not legal in a filename on every platform, so they were written as
 * hyphens and have to be put back before the string is a time again.
 */
export function takenAtFromName(name: string): string | null {
  const match = /-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.sql$/.exec(name);
  if (!match) return null;
  const [, date, hh, mm, ss, ms] = match;
  return `${date}T${hh}:${mm}:${ss}.${ms}Z`;
}
