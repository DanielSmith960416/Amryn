#!/usr/bin/env node
/**
 * Takes a verified backup before a migration that touches existing records.
 *
 * ── why this exists rather than a setting in a dashboard ──────────────────
 * This project is on Supabase's free plan, which has no automatic backups and
 * no point-in-time recovery. That is worth stating plainly: as things stand a
 * migration that rewrites a column is unrecoverable, and "we'll restore from
 * the backup" describes something that does not exist. This is the backup.
 *
 * ── where the file goes ───────────────────────────────────────────────────
 * Onto the machine that runs this, and it must not be the deployment
 * container: that filesystem is discarded when the container is, so a dump
 * written there is a dump that exists for as long as it is useless. Run it
 * from a terminal that keeps its files.
 *
 *   node scripts/backup.mjs
 *   node scripts/backup.mjs --out ~/amryn-backups
 *
 * Writes two files: the dump, and a manifest beside it. The manifest is what
 * scripts/migrate.mjs checks before it will apply a migration that is not
 * purely additive — see --backup there.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// Shared with the migration runner, so the fingerprint the backup records is
// exactly the one the guard checks.
import { databaseFingerprint } from './backup-manifest.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

/** The same resolution the migration runner uses, so they cannot target different databases. */
function connectionString() {
  if (process.env.SUPABASE_DB_URL?.trim()) return process.env.SUPABASE_DB_URL.trim();

  const envFile = join(root, '.env.local');
  if (!existsSync(envFile)) return undefined;
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const match = /^\s*SUPABASE_DB_URL\s*=\s*(.*)$/.exec(line);
    if (match) return match[1].trim().replace(/^["']|["']$/g, '') || undefined;
  }
  return undefined;
}

function safe(error, url) {
  const raw = error instanceof Error ? error.message : String(error);
  return (url ? raw.split(url).join('the configured connection string') : raw).replace(
    /postgres(ql)?:\/\/[^\s]+/gi,
    'the configured connection string',
  );
}

const url = connectionString();
if (!url) {
  console.error(
    'SUPABASE_DB_URL is not set, and .env.local does not contain it.\n' +
      'Take the SESSION POOLER string from Supabase → Settings → Database.',
  );
  process.exit(1);
}

// pg_dump refuses a server newer than itself, and it is right to: a dump taken
// by an older one can silently omit things it does not know about. Better to
// stop here with the two versions named than to produce a file that restores
// into a different schema than the one that was backed up.
let dumpVersion;
try {
  dumpVersion = execFileSync('pg_dump', ['--version'], { encoding: 'utf8' }).trim();
} catch {
  console.error(
    'pg_dump is not on this machine.\n\n' +
      'Install the PostgreSQL client tools and run this again — the version must be at\n' +
      'least the server\'s major version:\n' +
      '  macOS    brew install libpq && brew link --force libpq\n' +
      '  Debian   sudo apt-get install postgresql-client-17\n\n' +
      'Do not run this inside the deployment container: its filesystem is discarded, so\n' +
      'the dump would not survive long enough to be a backup.',
  );
  process.exit(1);
}

const outDir = resolve(argument('--out', join(root, 'backups')));
mkdirSync(outDir, { recursive: true });

const fingerprint = databaseFingerprint(url);
const takenAt = new Date();
const stamp = takenAt.toISOString().replace(/[:.]/g, '-');
const dumpPath = join(outDir, `amryn-${fingerprint.digest}-${stamp}.sql`);
const manifestPath = `${dumpPath}.manifest.json`;

if (existsSync(dumpPath)) {
  console.error(`${dumpPath} already exists. Refusing to overwrite a backup.`);
  process.exit(1);
}

console.log(`Backing up ${fingerprint.label} with ${dumpVersion}`);
console.log(`  → ${dumpPath}`);

// --no-owner and --no-privileges because a restore into a Supabase project
// happens as a role that does not exist in this one, and ownership statements
// naming a missing role stop the restore dead.
const dump = spawnSync(
  'pg_dump',
  [url, '--format=plain', '--no-owner', '--no-privileges', '--file', dumpPath],
  { encoding: 'utf8', maxBuffer: 1024 * 1024 * 256 },
);

if (dump.status !== 0) {
  console.error(`pg_dump failed — ${safe(dump.stderr || `exit ${dump.status}`, url)}`);
  if (/server version|version mismatch/i.test(dump.stderr ?? '')) {
    console.error(
      '\nThe server is newer than pg_dump. Install a client at least as new and try again;\n' +
        'an older dump can omit what it does not know about, which is worse than none.',
    );
  }
  process.exit(1);
}

/**
 * A file of the right shape is not a backup. pg_dump writes its completion
 * marker last, so its presence is what distinguishes a finished dump from one
 * that was cut off — by a dropped connection, a full disk, or a terminal that
 * was closed.
 */
const contents = readFileSync(dumpPath, 'utf8');
if (!contents.includes('PostgreSQL database dump complete')) {
  console.error(
    `${dumpPath} does not end with pg_dump's completion marker, so it is truncated.\n` +
      'Delete it and run this again. A truncated dump restores as a partial database.',
  );
  process.exit(1);
}

const bytes = statSync(dumpPath).size;
const sha256 = createHash('sha256').update(contents).digest('hex');

// Counted from the dump rather than from the database, so the figures describe
// what was actually captured. Zero organisations in a backup of a live system
// is the number worth noticing before applying anything.
const countCopies = (table) => {
  const match = new RegExp(`^COPY public\\.${table} .*$`, 'm').exec(contents);
  if (!match) return 0;
  const start = contents.indexOf('\n', match.index) + 1;
  const end = contents.indexOf('\n\\.', start);
  const body = contents.slice(start, end === -1 ? start : end);
  return body.trim() === '' ? 0 : body.split('\n').length;
};

const rows = Object.fromEntries(
  ['organisations', 'organisation_members', 'financial_records', 'user_profiles'].map((t) => [
    t,
    countCopies(t),
  ]),
);

writeFileSync(
  manifestPath,
  `${JSON.stringify(
    {
      takenAt: takenAt.toISOString(),
      database: fingerprint.digest,
      databaseLabel: fingerprint.label,
      dump: dumpPath,
      bytes,
      sha256,
      pgDump: dumpVersion,
      rows,
    },
    null,
    2,
  )}\n`,
);

const mb = (bytes / 1024 / 1024).toFixed(1);
console.log(`\nDone. ${mb} MB, complete, sha256 ${sha256.slice(0, 16)}…`);
console.log('Rows captured:');
for (const [table, count] of Object.entries(rows)) console.log(`  ${table}: ${count}`);
console.log(`\nManifest: ${manifestPath}`);
console.log('Apply the migration with:');
console.log(`  node scripts/migrate.mjs --backup ${manifestPath}`);
