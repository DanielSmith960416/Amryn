#!/usr/bin/env node
/**
 * Applies pending migrations from a terminal.
 *
 * The same ledger the application uses, so the two cannot disagree about what
 * has been applied — a script with its own idea of the state is how a database
 * ends up with a migration run twice.
 *
 * Reads SUPABASE_DB_URL from the environment or from .env.local. Nothing is
 * ever printed that could contain it.
 *
 *   node scripts/migrate.mjs                      apply what is pending
 *   node scripts/migrate.mjs --dry-run            list it and stop
 *   node scripts/migrate.mjs --backup <manifest>  apply, with a backup to hand
 *
 * ── the backup rule, enforced rather than written down ────────────────────
 * A migration that only adds — a table, a column, an index, a policy — cannot
 * lose anything already there, and applying one to a live database needs no
 * ceremony. A migration that updates, deletes, drops or retypes can, and this
 * project is on Supabase's free plan: no automatic backups, no point-in-time
 * recovery, nothing to restore from.
 *
 * So this refuses to apply a migration that is not purely additive unless
 * --backup names a manifest from scripts/backup.mjs that is recent, intact,
 * and from this same database. The classification is made by reading the SQL
 * rather than by trusting a marker somebody has to remember to add.
 *
 * The requirement lifts itself on a database with no organisations in it:
 * there are no client records to lose, and making a fresh install take a
 * backup of nothing would teach everybody to reach for the escape hatch. There
 * is deliberately no escape hatch.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { riskyStatements } from './migration-risk.mjs';
import { MAX_AGE_HOURS, manifestProblems, readManifest } from './backup-manifest.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'supabase', 'migrations');
const dryRun = process.argv.includes('--dry-run');
const backupManifestPath = (() => {
  const index = process.argv.indexOf('--backup');
  return index !== -1 ? process.argv[index + 1] : undefined;
})();

/** .env.local is where a developer keeps this locally; deployments use the environment. */
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

/** Errors from the driver routinely quote the string that failed, password included. */
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

const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

/**
 * The same signatures the application uses, read from the same file. Two
 * copies of "has this migration been applied" that can disagree is worse than
 * either copy alone.
 */
const signatures = JSON.parse(readFileSync(join(dir, 'signatures.json'), 'utf8'));

const client = new pg.Client({
  connectionString: url,
  ssl: /[?&]sslmode=disable(&|$)/.test(url) ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 15_000,
  statement_timeout: 300_000,
});

try {
  await client.connect();
} catch (error) {
  console.error(`Could not connect — ${safe(error, url)}`);
  console.error(
    'If this timed out: use the session pooler string, not the direct one. The direct host ' +
      'resolves to IPv6 only, which most networks cannot route.',
  );
  process.exit(1);
}

try {
  await client.query(`
    create schema if not exists amryn;
    create table if not exists amryn.schema_migrations (
      file       text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const { rows } = await client.query('select file from amryn.schema_migrations');
  const applied = new Set(rows.map((row) => row.file));
  let pending = files.filter((file) => !applied.has(file));

  // A database that predates the ledger has an empty one, and every migration
  // reads as pending — which is how a live schema gets a migration run over
  // the top of itself. So on the first run the ledger is seeded from what is
  // actually there, by looking for the object each migration introduces.
  //
  // Guessing is not acceptable: marking a migration applied when it was not
  // means the next run skips it, and the fault surfaces much later as a
  // missing column. Every entry below is a question put to the database.
  if (applied.size === 0) {
    const seeded = [];
    for (const file of files) {
      let present = false;
      try {
        const { rows: check } = await client.query(`select (${signatures[file]}) as ok`);
        present = check[0]?.ok === true;
      } catch {
        // A signature that cannot be evaluated names something that does not
        // exist, which is itself the answer.
        present = false;
      }
      if (present) {
        await client.query('insert into amryn.schema_migrations (file) values ($1)', [file]);
        seeded.push(file);
      }
    }

    if (seeded.length > 0) {
      console.log(`Found ${seeded.length} migration${seeded.length === 1 ? '' : 's'} already applied.`);
      for (const file of seeded) applied.add(file);
      pending = files.filter((file) => !applied.has(file));
    }
  }

  if (pending.length === 0) {
    console.log(`Up to date — all ${files.length} migrations applied.`);
    process.exit(0);
  }

  console.log(`${pending.length} to apply:`);
  for (const file of pending) console.log(`  ${file}`);

  // ── the backup rule ─────────────────────────────────────────────────────
  //
  // Read from the SQL rather than from a marker: the migration where somebody
  // forgets to add the marker is precisely the one that needed it.
  const risky = pending
    .map((file) => ({ file, risks: riskyStatements(readFileSync(join(dir, file), 'utf8')) }))
    .filter((entry) => entry.risks.length > 0);

  if (risky.length > 0) {
    console.log('\nNot purely additive:');
    for (const { file, risks } of risky) console.log(`  ${file} — ${risks.join(', ')}`);

    // Nothing to lose is a real answer, not an excuse. A fresh install made to
    // back up an empty database would teach everybody that this step is
    // theatre, and the next person would look for a way past it.
    let clientRecords = 0;
    try {
      const { rows: counted } = await client.query('select count(*)::int as n from public.organisations');
      clientRecords = counted[0]?.n ?? 0;
    } catch {
      // No such table: the schema is not there at all, so neither is any data.
      clientRecords = 0;
    }

    if (clientRecords === 0) {
      console.log('\nNo organisations in this database, so there are no client records to lose.');
    } else {
      const problems = manifestProblems(backupManifestPath, url);
      if (problems.length > 0) {
        console.error(
          `\nRefusing to apply: ${clientRecords} organisation${clientRecords === 1 ? '' : 's'} ` +
            'in this database, and no backup to hand.',
        );
        for (const problem of problems) console.error(`  · ${problem}`);
        console.error(
          '\nThis project is on Supabase\'s free plan: there are no automatic backups and no\n' +
            'point-in-time recovery. If one of the statements above goes wrong there is nothing\n' +
            'to restore from.\n\n' +
            'Take one, from a machine that keeps its files:\n' +
            '  node scripts/backup.mjs\n' +
            'then apply with the manifest it prints:\n' +
            '  node scripts/migrate.mjs --backup <manifest>\n' +
            `A backup counts for ${MAX_AGE_HOURS} hours.`,
        );
        process.exit(1);
      }

      const manifest = readManifest(backupManifestPath);
      console.log(
        `\nBacked up ${new Date(manifest.takenAt).toISOString()} — ` +
          `${(manifest.bytes / 1024 / 1024).toFixed(1)} MB, ` +
          `${manifest.rows?.organisations ?? '?'} ` +
          `organisation${manifest.rows?.organisations === 1 ? '' : 's'}, checksum verified.`,
      );
    }
  }

  if (dryRun) {
    console.log('\n--dry-run: nothing was applied.');
    process.exit(0);
  }

  for (const file of pending) {
    process.stdout.write(`  applying ${file} … `);
    try {
      await client.query('begin');
      await client.query(readFileSync(join(dir, file), 'utf8'));
      await client.query('insert into amryn.schema_migrations (file) values ($1)', [file]);
      await client.query('commit');
      console.log('ok');
    } catch (error) {
      await client.query('rollback').catch(() => {});
      console.log('failed');
      console.error(`\n${file} was not applied, and nothing from it was: ${safe(error, url)}`);
      console.error('The migrations before it stand. Fix this one and run again.');
      process.exit(1);
    }
  }

  console.log('\nDone.');
} finally {
  await client.end().catch(() => {});
}
