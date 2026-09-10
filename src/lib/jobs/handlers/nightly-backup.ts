import { execFile } from 'node:child_process';
import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { dumpsToPrune, takenAtFromName } from '@/features/operations/backup-retention';
import { PermanentJobError, type JobHandler } from '../types';

const run = promisify(execFile);

/**
 * Where the Railway volume is mounted on the worker.
 *
 * Declared in .railway/railway.ts as the mount path of the `backups` volume,
 * and the two have to agree. Overridable so the job can be exercised against a
 * scratch directory without a volume, which is how it was tested.
 */
export const BACKUP_DIR = process.env.BACKUP_DIR ?? '/backups';

/**
 * Takes the nightly dump, on the worker, onto a volume that outlives it.
 *
 * ── why this shells out instead of dumping ────────────────────────────────
 *
 * scripts/backup.mjs already does the whole job and has done since migration
 * 25: it refuses a pg_dump older than the server, writes the dump, checks for
 * pg_dump's completion marker rather than trusting the file's existence,
 * checksums it, counts the rows it captured, writes a manifest, and records
 * the row /diagnostics reads.
 *
 * Reimplementing any of that here would produce a second, less careful dump
 * path that drifts from the one the migration gate trusts. So this runs that
 * script — the same file an operator runs by hand — and does the two things it
 * cannot do from a terminal: run on a schedule, and tidy up afterwards.
 *
 * ── why it can run in the container now, when the script says not to ──────
 *
 * backup.mjs says never to run it in the deployment container, because that
 * filesystem is discarded and a dump written there exists for exactly as long
 * as it is useless. That is still true of the container. It is not true of the
 * volume mounted inside it, which is the whole point of this job, and is why
 * the directory is checked before the dump is taken rather than after.
 */
export const nightlyBackup: JobHandler = {
  kind: 'backup.nightly',
  description: 'Dumps the database to the backups volume and prunes old dumps.',

  // Generous: the dump is the slow part and grows with the data. The lease is
  // renewed while it runs, so this is only the window a killed worker leaves
  // the job stuck for.
  leaseSeconds: 1800,

  async run({ log }) {
    /*
     * Checked first, and treated as permanent.
     *
     * An unwritable directory means the volume is not mounted, or is mounted
     * where this job cannot write it — neither of which a retry in ninety
     * seconds will fix. Retrying would turn one clear failure into three
     * identical ones and bury the reason.
     */
    try {
      const directory = await stat(BACKUP_DIR);
      if (!directory.isDirectory()) throw new Error('not a directory');
    } catch {
      throw new PermanentJobError(
        `${BACKUP_DIR} is not a writable directory. The backups volume is mounted there — ` +
          'check it is attached to this service, and that RAILWAY_RUN_UID is set so a ' +
          'non-root image can write to it.',
      );
    }

    const started = Date.now();
    const { stdout } = await run('node', ['scripts/backup.mjs', '--out', BACKUP_DIR], {
      // The dump is written to a file; stdout is only the script's report.
      maxBuffer: 8 * 1024 * 1024,
      env: process.env,
    });

    // Its own summary, forwarded rather than re-derived, so the log says what
    // the script actually found.
    for (const line of stdout.trim().split('\n')) log(line);

    const pruned = await prune(log);
    return { seconds: Math.round((Date.now() - started) / 1000), pruned };
  },
};

/**
 * Deletes dumps the retention policy has released, and their manifests.
 *
 * Failures here are reported and not thrown. A volume that fills up is a
 * problem; a backup that was taken and then failed the job because a *previous*
 * file could not be deleted is a worse one — the queue would retry, take
 * another dump, and fail again.
 */
async function prune(log: (message: string) => void): Promise<number> {
  let removed = 0;
  try {
    const names = await readdir(BACKUP_DIR);
    const dumps = names
      .map((name) => ({ name, takenAt: takenAtFromName(name) }))
      .filter((entry): entry is { name: string; takenAt: string } => entry.takenAt !== null);

    for (const dump of dumpsToPrune(dumps, new Date())) {
      await unlink(join(BACKUP_DIR, dump.name)).catch(() => {});
      // The manifest names the dump it describes, so it goes with it.
      await unlink(join(BACKUP_DIR, `${dump.name}.manifest.json`)).catch(() => {});
      removed += 1;
    }

    if (removed > 0) log(`pruned ${removed} dump${removed === 1 ? '' : 's'} past the window`);
  } catch (error) {
    log(`could not prune old dumps — ${error instanceof Error ? error.message : String(error)}`);
  }
  return removed;
}
