/**
 * Whether there is room for the next backup.
 *
 * Pure, like backups.ts beside it: numbers in, a judgement out. No filesystem
 * and no clock, so the thresholds can be argued with in a test rather than
 * discovered on the night the volume fills.
 *
 * ── why this is measured in backups rather than in percent ───────────────
 *
 * "62% used" is a number people look at and do nothing about. The question
 * that actually matters is whether tonight's dump will fit, and the honest way
 * to answer it is to compare the space left against the size of the last dump
 * — which is the best available estimate of the next one.
 *
 * A percentage still earns a place, because it catches the case the ratio
 * cannot: a volume filling with something that is not backups at all. Both are
 * reported; the ratio decides the state when it is known, because a volume at
 * 80% with room for forty more dumps is fine and one at 55% with room for one
 * is not.
 *
 * ── why the worker measures it and this file does not ────────────────────
 *
 * The volume is mounted on the worker. The diagnostics page is rendered by the
 * web service, which cannot see that filesystem at all — so the figure travels
 * the same way every other fact about the worker does: measured there, written
 * to the heartbeat, read here. Railway's own disk monitors would answer this
 * too and are gated behind a plan this deployment is not on.
 */

/** Below this fraction free, the volume is close enough to full to say so. */
export const TIGHT_FRACTION = 0.15;

/** Below this, it is not close to full — it is full enough to lose a backup. */
export const CRITICAL_FRACTION = 0.05;

/**
 * How many more dumps should fit before this is worth mentioning.
 *
 * Three rather than one. A volume with room for exactly one more backup is
 * already in trouble: the next dump lands, and the one after it has nowhere to
 * go — and nobody is watching at 01:00.
 */
export const COMFORTABLE_BACKUPS = 3;

export interface VolumeReading {
  /** Where it is mounted, for a sentence somebody can act on. */
  path: string;
  totalBytes: number;
  freeBytes: number;
}

export type VolumeHealth =
  | { state: 'unknown'; detail: string }
  | { state: 'roomy'; detail: string }
  | { state: 'tight'; detail: string }
  | { state: 'full'; detail: string };

/**
 * @param reading what the worker measured, or null if it never said.
 * @param lastBackupBytes the newest dump's size, or null when none exists.
 */
export function volumeHealth(
  reading: VolumeReading | null,
  lastBackupBytes: number | null,
): VolumeHealth {
  if (!reading || reading.totalBytes <= 0) {
    // Not alarming. A worker on a build older than this one never writes it,
    // and an unmounted volume is a different check's business.
    return {
      state: 'unknown',
      detail: 'The worker has not reported how much room is left where backups are written.',
    };
  }

  const free = Math.max(0, Math.min(reading.freeBytes, reading.totalBytes));
  const fraction = free / reading.totalBytes;
  const used = `${gigabytes(reading.totalBytes - free)} of ${gigabytes(reading.totalBytes)} used`;

  // The ratio decides where it can. A volume at 80% with room for forty more
  // dumps is fine; one at 55% with room for one is not, and a percentage
  // threshold would have those two the wrong way round.
  const fits = lastBackupBytes && lastBackupBytes > 0 ? Math.floor(free / lastBackupBytes) : null;

  if (fits !== null && fits < 1) {
    return {
      state: 'full',
      detail:
        `${reading.path} has ${gigabytes(free)} free — ${used}. The last backup was ` +
        `${gigabytes(lastBackupBytes!)}, so the next one does not fit.`,
    };
  }

  if (fraction <= CRITICAL_FRACTION) {
    return {
      state: 'full',
      detail: `${reading.path} is almost full — ${gigabytes(free)} free, ${used}.`,
    };
  }

  if (fits !== null && fits < COMFORTABLE_BACKUPS) {
    return {
      state: 'tight',
      detail:
        `${reading.path} has ${gigabytes(free)} free — ${used} — which is room for about ` +
        `${fits} more ${fits === 1 ? 'backup' : 'backups'} of the size of the last one.`,
    };
  }

  if (fraction <= TIGHT_FRACTION) {
    return {
      state: 'tight',
      detail: `${reading.path} is filling up — ${gigabytes(free)} free, ${used}.`,
    };
  }

  return {
    state: 'roomy',
    detail:
      `${reading.path} has ${gigabytes(free)} free — ${used}` +
      (fits !== null ? `, room for about ${fits} more backups of the last one's size.` : '.'),
  };
}

function gigabytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
