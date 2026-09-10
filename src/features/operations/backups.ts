/**
 * How old the last backup is, and whether it captured anything.
 *
 * Pure: a record and the moment you are asking, in; a judgement out. No
 * database and no clock of its own, so the thresholds can be argued with in a
 * test rather than discovered during a recovery.
 *
 * ── why age is the whole question ─────────────────────────────────────────
 *
 * A backup procedure that exists and is never run looks exactly like one that
 * is run nightly, right up until somebody needs it. The procedure here has
 * existed since migration 25 and is deliberately manual — the deployment
 * container's filesystem is discarded, so the dump is taken from a machine
 * that keeps its files. Manual and unwatched is how "we have backups" becomes
 * a thing people believe rather than a thing that is true.
 *
 * So the platform reports the age of the newest record it was told about, and
 * says "never" loudly when there is none.
 */

/** What the procedure is meant to be: one a day. */
export const EXPECTED_EVERY_HOURS = 24;

/**
 * A day plus slack.
 *
 * Not 24: a backup taken at 02:00 and read at 02:30 the next day is a day and
 * a half old by the clock and perfectly healthy in practice. A threshold that
 * fires on a punctual routine is one people learn to dismiss.
 */
export const STALE_AFTER_HOURS = 26;

/** Past this it is not a late backup, it is an absent one. */
export const CRITICAL_AFTER_HOURS = 24 * 7;

export interface BackupRecord {
  takenAt: string;
  databaseLabel: string;
  bytes: number;
  /** Row counts read out of the dump itself. */
  rows: Record<string, number>;
  storedAt: string;
}

export type BackupHealth =
  | { state: 'fresh'; hoursAgo: number; detail: string }
  | { state: 'stale'; hoursAgo: number; detail: string }
  | { state: 'critical'; hoursAgo: number; detail: string }
  | { state: 'never'; detail: string };

/**
 * The table whose emptiness means the dump is not of this product.
 *
 * Every other count can legitimately be zero on a young deployment. An
 * organisation is created before anything else can exist, so a live system
 * with none of them has not been captured — whatever the file's size says.
 */
const BEDROCK_TABLE = 'organisations';

/**
 * Whether the dump captured a working system.
 *
 * backup.mjs already refuses a truncated file by checking for pg_dump's
 * completion marker. This is the other half of the same argument: a file can
 * be complete, correctly checksummed, the right size, and still be a backup
 * of nothing. Reported rather than inferred from the byte count, because a
 * schema-only dump of a large schema is not small.
 */
export function capturedNothing(backup: BackupRecord): boolean {
  return (backup.rows[BEDROCK_TABLE] ?? 0) === 0;
}

export function backupHealth(newest: BackupRecord | null, now: Date): BackupHealth {
  if (!newest) {
    return {
      state: 'never',
      detail:
        'No backup has ever been recorded. This project has no automatic backups and no ' +
        'point-in-time recovery, so at this moment there is nothing to restore from.',
    };
  }

  const hoursAgo = Math.max(0, (now.getTime() - Date.parse(newest.takenAt)) / 3_600_000);
  const rounded = Math.round(hoursAgo);
  const when = describe(rounded);

  if (hoursAgo <= STALE_AFTER_HOURS) {
    return {
      state: 'fresh',
      hoursAgo: rounded,
      detail: `Last backup ${when} ago — ${megabytes(newest.bytes)}, of ${newest.databaseLabel}.`,
    };
  }

  if (hoursAgo <= CRITICAL_AFTER_HOURS) {
    return {
      state: 'stale',
      hoursAgo: rounded,
      detail:
        `The last backup was ${when} ago, which is longer than the daily routine it is ` +
        'meant to follow.',
    };
  }

  return {
    state: 'critical',
    hoursAgo: rounded,
    detail:
      `The last backup was ${when} ago. Everything written since then exists in exactly ` +
      'one place.',
  };
}

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function describe(hours: number): string {
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}
