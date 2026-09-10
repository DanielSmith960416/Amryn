/**
 * Deciding whether a restore actually worked — the rules alone.
 *
 * Backups have been taken nightly since #89, verified for completeness,
 * checksummed, and recorded where /diagnostics can read their age. All of
 * which establishes that a file exists and is intact. None of it establishes
 * that the file can be turned back into a working database, which is the only
 * property anybody actually wants from a backup and the one nobody had tested.
 *
 * "We have backups" was an assumption. So was "and they restore".
 *
 * ── what a restore has to prove ──────────────────────────────────────────
 *
 * Not that the command exited zero. psql restoring a dump reports success
 * having created an empty schema if the COPY blocks were truncated, and a
 * database with the right forty tables and none of the rows is the failure
 * this exists to catch — it looks healthy from every angle except the one
 * that matters.
 *
 * So the test is arithmetic: the manifest recorded what the dump contained
 * when it was written; the restored database is counted the same way; the two
 * must agree exactly. A single missing row is a failed restore, because the
 * alternative is deciding at three in the morning how many customer records
 * are acceptable to lose.
 *
 * Plain ESM rather than TypeScript, and in scripts/ rather than src/, because
 * the only caller is restore-check.mjs — the same arrangement backup.mjs has
 * with backup-manifest.mjs, and tested the same way migration-risk is.
 */


/**
 * Every table where the restore disagrees with the manifest.
 *
 * All of them, not the first — a restore that lost one table and truncated
 * another is a different problem from one that lost a single table, and
 * finding out about the second one on the next run wastes the run.
 *
 * A table in the restored database that the manifest never mentioned is not a
 * discrepancy. The manifest counts a chosen few, and complaining about the
 * other thirty-six would bury the four that matter.
 */
export function compareCounts(expected, found) {
  const out = [];

  for (const [table, claimed] of Object.entries(expected)) {
    const actual = Object.prototype.hasOwnProperty.call(found, table) ? found[table] : null;
    if (actual !== claimed) out.push({ table, expected: claimed, found: actual });
  }

  return out.sort((a, b) => a.table.localeCompare(b.table));
}

/**
 * The verdict, in a sentence somebody can act on at speed.
 *
 * An empty manifest is a failure and not a pass. "Nothing was claimed, so
 * nothing is missing" is technically true and exactly the reasoning that lets
 * a broken backup chain look green — the manifest is written by the same
 * process that took the dump, so a manifest with no counts means the counting
 * failed, which means the dump is unverified.
 */
export function restoreVerdict(expected, found) {
  const claimed = Object.entries(expected);

  if (claimed.length === 0) {
    return {
      restored: false,
      discrepancies: [],
      detail:
        'The manifest claims no row counts, so the restore proves nothing. A backup nobody counted is a backup nobody has checked.',
    };
  }

  const discrepancies = compareCounts(expected, found);

  if (discrepancies.length > 0) {
    return {
      restored: false,
      discrepancies,
      detail: `The restored database does not match the backup: ${discrepancies
        .map((d) => `${d.table} expected ${d.expected}, ${d.found === null ? 'table absent' : `found ${d.found}`}`)
        .join('; ')}.`,
    };
  }

  const rows = claimed.reduce((sum, [, n]) => sum + n, 0);

  return {
    restored: true,
    tables: claimed.length,
    rows,
    detail: `Restored and verified: ${claimed.length} table${claimed.length === 1 ? '' : 's'}, ${rows} row${rows === 1 ? '' : 's'}, every count matching the backup.`,
  };
}

/**
 * Whether the dump on disk is still the one the manifest describes.
 *
 * Checked before a restore is attempted rather than after it fails. A dump
 * that has been truncated by a full disk, or half-written by a run that died,
 * restores partially and reports success — and the row counts would catch it,
 * but a checksum catches it in a second instead of a minute and says plainly
 * that the file is wrong rather than that the database is.
 */
export function dumpIsIntact(manifest, actual) {
  if (!manifest.sha256) {
    return { intact: false, reason: 'the manifest records no checksum, so the dump cannot be trusted' };
  }

  if (manifest.sha256 !== actual.sha256) {
    return {
      intact: false,
      reason: `the dump has changed since it was written (expected ${manifest.sha256.slice(0, 12)}…, found ${actual.sha256.slice(0, 12)}…)`,
    };
  }

  if (manifest.bytes !== undefined && manifest.bytes !== actual.bytes) {
    return {
      intact: false,
      reason: `the dump is ${actual.bytes} bytes and the manifest says ${manifest.bytes}`,
    };
  }

  return { intact: true };
}
