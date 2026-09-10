#!/usr/bin/env node
/**
 * Restores a backup into a scratch database and checks that it came back.
 *
 * The one link in the backup chain nothing tested. Since #89 a dump is taken
 * nightly, verified for its completion marker, checksummed, counted and
 * recorded where /diagnostics reads its age — all of which proves a file
 * exists and is intact, and none of which proves it can become a database
 * again. That was an assumption, and the failure mode of an assumption is
 * that it is discovered to be false at the worst possible moment.
 *
 *   node scripts/restore-check.mjs --manifest /backups/amryn-....json
 *   node scripts/restore-check.mjs --dump /backups/amryn-....sql   (no manifest)
 *
 * ── it restores somewhere else, always ───────────────────────────────────
 *
 * A scratch database created for the run and dropped after it, named with a
 * timestamp so two runs cannot collide. It will not restore into a database
 * that already has Amryn's tables in it, and there is no flag to make it: a
 * restore check that could be pointed at production is a loaded gun in a
 * drawer marked "tools", and the one time somebody reaches for it in a hurry
 * is the one time it matters.
 *
 * ── what counts as restored ──────────────────────────────────────────────
 *
 * Not that psql exited zero. psql restoring a truncated dump creates the
 * schema, skips the rows it never received, and reports success — a database
 * with all forty tables and none of the data, which looks healthy from every
 * angle except the arithmetic. So the manifest's row counts are compared
 * against the restored database's, and they must agree exactly.
 *
 * Connection comes from PGHOST / PGPORT / PGUSER, like supabase/tests/run.sh,
 * and it shells out to psql so there is no driver dependency.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { compareCounts, dumpIsIntact, restoreVerdict } from './restore-rules.mjs';

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const host = process.env.PGHOST ?? '/var/tmp';
const port = process.env.PGPORT ?? '55432';
const user = process.env.PGUSER ?? 'postgres';

/** The tables backup.mjs counts. Restated here so a change to either is visible. */
const COUNTED = ['organisations', 'organisation_members', 'financial_records', 'user_profiles'];

function psql(database, args) {
  return execFileSync(
    'psql',
    ['-h', host, '-p', port, '-U', user, '-d', database, '-v', 'ON_ERROR_STOP=1', '-q', ...args],
    { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 },
  );
}

function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

// ── what we are restoring ──────────────────────────────────────────────────

const manifestPath = argument('--manifest', null);
let dumpPath = argument('--dump', null);
let claimed = null;

if (manifestPath) {
  if (!existsSync(manifestPath)) fail(`No manifest at ${manifestPath}.`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  dumpPath = manifest.dump;
  claimed = manifest.rows ?? {};

  if (!dumpPath || !existsSync(dumpPath)) {
    fail(`The manifest names ${dumpPath ?? 'no dump'}, which is not there. A manifest alone restores nothing.`);
  }

  // Checked before the restore, not after it fails. A truncated dump restores
  // partially and reports success; a checksum says in one second that the file
  // is wrong rather than that the database is.
  const contents = readFileSync(dumpPath);
  const intact = dumpIsIntact(manifest, {
    sha256: createHash('sha256').update(contents).digest('hex'),
    bytes: statSync(dumpPath).size,
  });

  if (!intact.intact) fail(`Refusing to restore: ${intact.reason}.`);
  console.log(`Dump verified against its manifest — ${statSync(dumpPath).size} bytes, checksum matches.`);
} else if (!dumpPath) {
  fail('Give it --manifest <path> or --dump <path>.');
} else if (!existsSync(dumpPath)) {
  fail(`No dump at ${dumpPath}.`);
}

// ── somewhere else, always ─────────────────────────────────────────────────

const scratch = `amryn_restore_check_${Date.now()}`;

console.log(`Restoring into ${scratch} …`);
psql('postgres', ['-c', `create database ${scratch};`]);

let exitCode = 0;
try {
  /*
   * The dump alone, into an empty database. Nothing is prepared for it first.
   *
   * The first version of this ran supabase/tests/00_supabase_shim.sql
   * beforehand, on the assumption that a dump of a Supabase database would
   * need the auth schema and its roles to exist. It does not: pg_dump captured
   * them, so the shim and the dump both tried to create schema "auth" and the
   * restore died on the collision.
   *
   * Which is worth more than the fix. A dump that needs a machine prepared in
   * a particular way before it will load is a dump that restores on our
   * laptops and not on a rented server at two in the morning. This one is
   * self-contained, and that is now a tested property rather than a hope.
   */
  psql(scratch, ['-f', dumpPath]);

  const counted = {};
  for (const table of COUNTED) {
    const exists = psql(scratch, [
      '-tAc',
      `select to_regclass('public.${table}') is not null;`,
    ]).trim();

    if (exists !== 't') continue;
    counted[table] = Number(psql(scratch, ['-tAc', `select count(*) from public.${table};`]).trim());
  }

  // With no manifest there is nothing to compare against, so the check is
  // weaker and says so: it proves the dump loads, not that it is complete.
  if (claimed === null) {
    console.log('\nNo manifest given, so this proves the dump loads and not that it is complete.');
    for (const [table, n] of Object.entries(counted)) console.log(`  ${table}: ${n}`);
    console.log('\nRestored. Run with --manifest to check the counts as well.');
  } else {
    const verdict = restoreVerdict(claimed, counted);

    if (verdict.restored) {
      console.log(`\n${verdict.detail}`);
      for (const [table, n] of Object.entries(claimed)) console.log(`  ${table}: ${n}`);
    } else {
      console.error(`\n${verdict.detail}`);
      for (const d of compareCounts(claimed, counted)) {
        console.error(`  ${d.table}: backup ${d.expected}, restored ${d.found ?? 'table absent'}`);
      }
      exitCode = 1;
    }
  }
} catch (error) {
  console.error(`\nThe restore itself failed: ${error.message}`);
  exitCode = 1;
} finally {
  // Dropped whatever happened. A scratch database left behind after a failure
  // is the one that collides with the next run and makes the second failure
  // look different from the first.
  try {
    psql('postgres', ['-c', `drop database if exists ${scratch};`]);
  } catch (error) {
    console.error(`Could not drop ${scratch}: ${error.message}`);
  }
}

process.exit(exitCode);
