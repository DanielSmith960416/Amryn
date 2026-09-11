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
 *   node scripts/migrate.mjs --check              ask, and exit non-zero if behind
 *   node scripts/migrate.mjs --backup <manifest>  apply, with a backup to hand
 *   node scripts/migrate.mjs --no-self-backup     refuse instead of taking one
 *
 * ── safe to run on every deploy ───────────────────────────────────────────
 * This is the worker service's pre-deploy command, so it runs unattended on
 * each release and usually finds nothing to do. Two things make that safe: it
 * exits 0 when the database is already current, and it takes an advisory lock
 * so two runs — two services deploying at once, or a deploy overlapping with
 * somebody at a terminal — queue rather than race.
 *
 * --check is the same question without the answer being acted on: 0 means
 * current, non-zero means behind. --dry-run exits 0 either way, which is what
 * you want when reading and not what you want when gating.
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
 *
 * ── and when nobody passed --backup, it takes one ─────────────────────────
 * The rule above was written for a person at a terminal and enforced on a
 * deploy, where there is no person. The result: migration 36 updated four rows
 * and blocked the deploy of both services until somebody applied it by hand.
 *
 * The obvious fix — let the pre-deploy command run scripts/backup.mjs first —
 * does not work. Railway does not mount volumes during pre-deploy, so the dump
 * would land on a filesystem discarded minutes later: a green check over
 * nothing, which is worse than the refusal.
 *
 * Letting the deploy through instead is worse still, and the reason is not
 * obvious. A worker whose database is behind claims nothing and enqueues
 * nothing (migration 34), so the nightly backup stops with everything else —
 * and the backup is the one thing needed to unblock the migration. A deadlock,
 * arrived at by being careful.
 *
 * So it takes the backup itself and puts it in object storage, which the
 * container can reach and cannot lose. --no-self-backup restores the old
 * behaviour for anyone who wants the refusal.
 */
import { readFileSync, readdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { riskyStatements } from './migration-risk.mjs';
import { MAX_AGE_HOURS, manifestProblems, readManifest } from './backup-manifest.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'supabase', 'migrations');
const dryRun = process.argv.includes('--dry-run');
const checkOnly = process.argv.includes('--check');
let backupManifestPath = (() => {
  const index = process.argv.indexOf('--backup');
  return index !== -1 ? process.argv[index + 1] : undefined;
})();
const noSelfBackup = process.argv.includes('--no-self-backup');

/**
 * Takes a dump and puts it somewhere this container cannot lose it.
 *
 * Shells out to scripts/backup.mjs rather than reimplementing any of it: that
 * script decides what a backup *is* — the completion marker, the checksum, the
 * row counts — and two answers to that question is exactly one too many. The
 * same reason backup.mjs shells out to pg_dump.
 *
 * Returns the manifest path, or null with the reason already printed.
 */
function takeOwnBackup() {
  /*
   * The local copy has to outlive this function.
   *
   * manifestProblems() deliberately checks the *file*, not just the manifest —
   * "a manifest alone restores nothing", as it says. So the dump stays on disk
   * until the gate below has verified it, and is removed on exit rather than
   * here. The durable copy is the one in object storage; this one is scaffolding.
   */
  scratch = mkdtempSync(join(tmpdir(), 'amryn-premigrate-'));

  console.log('\nNo backup to hand. Taking one before going any further …');
  const run = spawnSync(
    process.execPath,
    [join(root, 'scripts', 'backup.mjs'), '--upload', '--out', scratch],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 },
  );

  // Its own output is written for a person and says what failed; passing it
  // through beats summarising it into something vaguer.
  if (run.stdout) process.stdout.write(run.stdout);
  if (run.stderr) process.stderr.write(run.stderr);
  if (run.status !== 0) return null;

  const printed = /^Manifest: (.+)$/m.exec(run.stdout ?? '');
  if (!printed) {
    console.error('The backup finished without naming its manifest, so it cannot be checked.');
    return null;
  }

  return printed[1].trim();
}

/**
 * Where a self-taken dump sits while it is being checked.
 *
 * Removed on every exit path, including the ones that call process.exit — a
 * database dump left in a temporary directory is not a habit worth having, and
 * a `finally` would miss half the ways this script ends.
 */
let scratch = null;
process.on('exit', () => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});

/**
 * Whether the manifest given is a backup of somewhere else.
 *
 * The one problem that must not be answered by taking a fresh backup. A
 * missing or stale manifest is an absence; a manifest naming another database
 * is a mistake, and silently taking a good backup over the top of it would
 * leave whoever made that mistake still making it.
 */
function namesAnotherDatabase(problems) {
  return problems.some((problem) => problem.startsWith('it is a backup of'));
}

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

/*
 * One migration run at a time, across every process that might start one.
 *
 * The ledger is read and then written, and the gap between is a whole file
 * being applied. Two runs that both read "34 is pending" both try to apply it;
 * the loser fails partway through a `create table` that already exists, rolls
 * back, and exits non-zero — which, as a pre-deploy command, is a failed
 * deployment caused by nothing being wrong.
 *
 * That is not hypothetical here: both services deploy from the same push at
 * the same second, /setup applies migrations over its own connection, and a
 * person can be at a terminal during either.
 *
 * A session-level advisory lock, so it is released when this connection ends —
 * including when the process is killed, which a transaction-scoped lock would
 * also do but a table of our own would not.
 *
 * The number is arbitrary and permanent. It means nothing beyond "the Amryn
 * migration runner"; anything else taking it would have to have chosen the
 * same integer on purpose.
 */
const LEDGER_LOCK = 615243901;

async function takeTheLedgerLock() {
  const { rows } = await client.query('select pg_try_advisory_lock($1) as got', [LEDGER_LOCK]);
  if (rows[0]?.got === true) return;

  console.log('Another migration run holds the lock — waiting for it to finish.');

  // Bounded, because this runs inside a deployment. Waiting forever on a lock
  // held by a process that has hung is a deploy that never completes and never
  // says why.
  await client.query("set lock_timeout = '120s'");
  try {
    await client.query('select pg_advisory_lock($1)', [LEDGER_LOCK]);
  } catch (error) {
    console.error(
      '\nGave up after two minutes waiting for another migration run to finish.\n' +
        'Nothing was applied. If no other run is in progress, a previous one may have left a\n' +
        'connection open — check for idle sessions on this database, then run again.',
    );
    console.error(safe(error, url));
    process.exit(1);
  } finally {
    await client.query("set lock_timeout = '0'").catch(() => {});
  }

  console.log('Lock acquired.');
}

try {
  await takeTheLedgerLock();

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

  // Asked rather than told. Non-zero, so a deploy step or a shell `if` can act
  // on the answer — which is the whole difference from --dry-run, and the
  // reason both exist.
  if (checkOnly) {
    console.log('\n--check: nothing was applied.');
    process.exit(1);
  }

  // ── the backup rule ─────────────────────────────────────────────────────
  //
  // Read from the SQL rather than from a marker: the migration where somebody
  // forgets to add the marker is precisely the one that needed it.
  const classified = pending.map((file) => ({
    file,
    risks: riskyStatements(readFileSync(join(dir, file), 'utf8')),
  }));
  const risky = classified.filter((entry) => entry.risks.length > 0);

  /*
   * Everything additive up to the first risky one is applied before the gate.
   *
   * Two things this fixes, both found by following the deploy through:
   *
   *   · An additive migration queued behind a risky one used to be refused
   *     along with it. Nothing about adding a table needs a backup, and
   *     holding it hostage to one is how a deploy blocks on work it did not
   *     need to do.
   *   · The self-backup needs the bucket that migration 41 creates. Ship 41
   *     and a risky migration in the same deploy and the backup is attempted
   *     before the bucket exists. Applying the additive ones first makes that
   *     ordering correct by construction rather than by luck.
   *
   * Safe by the same definition the gate rests on: a migration that only adds
   * cannot lose what is already there.
   */
  const firstRisky = classified.findIndex((entry) => entry.risks.length > 0);
  const beforeGate = firstRisky === -1 ? pending : pending.slice(0, firstRisky);
  const afterGate = firstRisky === -1 ? [] : pending.slice(firstRisky);

  if (risky.length > 0 && beforeGate.length > 0 && !dryRun && !checkOnly) {
    console.log(`\nApplying ${beforeGate.length} purely additive migration${beforeGate.length === 1 ? '' : 's'} first:`);
    if (!(await apply(beforeGate))) process.exit(1);
  }

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
      let problems = manifestProblems(backupManifestPath, url);

      /*
       * Nobody passed one, so take one.
       *
       * Only when the manifest is missing or stale — never to paper over one
       * that names a different database. That is not an absent backup, it is
       * the wrong backup, and quietly replacing it would hide a mistake worth
       * seeing.
       */
      if (problems.length > 0 && !noSelfBackup && !namesAnotherDatabase(problems)) {
        const taken = takeOwnBackup();
        if (taken) {
          backupManifestPath = taken;
          problems = manifestProblems(backupManifestPath, url);
        }
      }

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
            `A backup counts for ${MAX_AGE_HOURS} hours.\n\n` +
            'This would normally have taken its own backup and carried on. It could not,\n' +
            'and the reason is above — usually the project URL and service role key not\n' +
            'being set on this service, or migration 41 (which creates the bucket) not\n' +
            'having been applied yet.',
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

  // Whatever the gate did not already apply. When nothing was risky that is
  // the whole list; otherwise the additive prefix is already in.
  const remaining = risky.length > 0 ? afterGate : pending;
  if (!(await apply(remaining))) process.exit(1);

  console.log('\nDone.');

  /**
   * Applies a run of migrations, one transaction each.
   *
   * One transaction per file rather than one for the batch: a failure then
   * leaves every migration before it applied and recorded, which is the state
   * the ledger describes and the state a second run can carry on from. A batch
   * transaction would roll back work that was fine and make the ledger and the
   * schema disagree about what happened.
   */
  async function apply(files) {
    for (const file of files) {
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
        return false;
      }
    }
    return true;
  }
} finally {
  await client.end().catch(() => {});
}
