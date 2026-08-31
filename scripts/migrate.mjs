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
 *   node scripts/migrate.mjs           apply what is pending
 *   node scripts/migrate.mjs --dry-run list it and stop
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'supabase', 'migrations');
const dryRun = process.argv.includes('--dry-run');

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
