import 'server-only';
import type { Client } from 'pg';
import { MIGRATIONS, SIGNATURES } from './setup-sql';

/**
 * Which migrations a database has already seen.
 *
 * SETUP_SQL builds a database from nothing and refuses to touch one that
 * already exists, which was the right guarantee while there was only ever one
 * moment of setup. It stopped being enough the first time a schema change had
 * to reach a database with customers in it: the state is neither absent nor
 * ready, and the honest answer to "apply the new migration" was to paste it
 * into a SQL editor and remember which ones you had done.
 *
 * A ledger removes the remembering. Each file is applied in its own
 * transaction and recorded in the same one, so a run either applies a whole
 * migration and records it or does neither.
 *
 * ── the awkward part: databases that predate the ledger ───────────────────
 * A live database has already had migrations applied and has no record of it.
 * Running them again would fail on the first `create table`.
 *
 * Guessing is not acceptable here — marking a migration applied when it was
 * not means the next run skips it, and the fault surfaces much later as a
 * missing column. So each migration carries a *signature*: one object it
 * introduces, which can be looked for. On first use the ledger is seeded from
 * what is actually in the database rather than from an assumption about how
 * far somebody got.
 */

/**
 * The signatures live in supabase/migrations/signatures.json, next to the
 * files they describe, and are inlined into the generated module at build
 * time — a serverless bundle contains only what was imported.
 *
 * Shared rather than kept here because scripts/migrate.mjs needs exactly the
 * same answers, and two copies of "has this migration been applied" that can
 * disagree is worse than either copy alone.
 */


export interface Pending {
  file: string;
  sql: string;
}

/**
 * Whether the object a migration introduces is present.
 *
 * A signature that cannot even be evaluated — because a table it names does
 * not exist — is itself the answer: the migration is not applied. So the throw
 * is caught and read as false rather than propagated.
 *
 * A migration with no signature is treated as not applied, which is the safe
 * direction: it will be attempted, and a file that has genuinely already run
 * fails loudly rather than being silently skipped.
 */
export async function signatureHolds(client: Client, file: string): Promise<boolean> {
  const signature = SIGNATURES[file];
  if (!signature) return false;

  try {
    const { rows } = await client.query<{ ok: boolean }>(`select (${signature}) as ok`);
    return rows[0]?.ok === true;
  } catch {
    return false;
  }
}

/**
 * Creates the ledger if it is missing, and seeds it from the schema.
 *
 * The seed runs only when the table is created, so it can never re-decide
 * anything about a database that is already keeping its own record.
 */
export async function ensureLedger(client: Client): Promise<{ seeded: string[] }> {
  const existed = await client.query<{ present: boolean }>(
    "select to_regclass('amryn.schema_migrations') is not null as present",
  );

  await client.query(`
    create schema if not exists amryn;
    create table if not exists amryn.schema_migrations (
      file       text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  if (existed.rows[0]?.present) return { seeded: [] };

  // First time. Work out what is already here, one signature at a time.
  const seeded: string[] = [];
  for (const { file } of MIGRATIONS) {
    if (await signatureHolds(client, file)) {
      await client.query('insert into amryn.schema_migrations (file) values ($1)', [file]);
      seeded.push(file);
    }
  }

  return { seeded };
}

/** The migrations this database has not recorded, in order. */
export async function pendingMigrations(client: Client): Promise<Pending[]> {
  const { rows } = await client.query<{ file: string }>(
    'select file from amryn.schema_migrations',
  );
  const applied = new Set(rows.map((row) => row.file));
  return MIGRATIONS.filter((migration) => !applied.has(migration.file));
}

export interface AppliedMigration {
  file: string;
  ok: boolean;
  /** Why it stopped, when it did. Never contains the connection string. */
  problem?: string;
  notices: string[];
}

/**
 * Applies the pending migrations, in order, stopping at the first failure.
 *
 * Each file gets its own transaction, together with the row recording it. A
 * migration cannot therefore be half applied, and cannot be recorded without
 * having been applied — the two failure modes that make a schema impossible to
 * reason about later.
 *
 * Stopping rather than continuing is deliberate. Migrations are ordered
 * because they depend on each other, and running the rest after one has failed
 * produces a second, more confusing error about the first one's absence.
 */
export async function applyPending(
  client: Client,
  pending: Pending[],
  safeMessage: (error: unknown) => string,
): Promise<AppliedMigration[]> {
  const results: AppliedMigration[] = [];

  for (const migration of pending) {
    const notices: string[] = [];
    const collect = (n: { message?: string }) => {
      if (n.message) notices.push(n.message);
    };
    client.on('notice', collect);

    try {
      await client.query('begin');
      await client.query(migration.sql);
      await client.query('insert into amryn.schema_migrations (file) values ($1)', [
        migration.file,
      ]);
      await client.query('commit');
      results.push({ file: migration.file, ok: true, notices });
    } catch (error) {
      await client.query('rollback').catch(() => {});
      results.push({ file: migration.file, ok: false, problem: safeMessage(error), notices });
      break;
    } finally {
      client.off('notice', collect);
    }
  }

  return results;
}
