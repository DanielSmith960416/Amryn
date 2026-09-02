import 'server-only';

/**
 * Applying the schema from inside the application.
 *
 * Everything else the platform needs can be typed into a hosting dashboard.
 * The schema could not: it had to be pasted into a SQL editor, in the right
 * order, by someone who could not tell a successful run from a half-finished
 * one. That went wrong repeatedly, and each failure looked like a different
 * problem — missing tables, a rejected key, a function absent from a cache.
 *
 * PostgREST cannot help here: it speaks rows, not DDL. So this opens an
 * ordinary PostgreSQL connection and runs the same generated file, and the
 * platform builds its own database.
 *
 * Three properties this has to hold:
 *
 *   · The SQL is the repository's own, imported at build time. Nothing a
 *     caller sends is ever concatenated into a statement, so there is no
 *     injection surface — the request chooses whether to run, never what.
 *   · It refuses once the schema is present. A setup route that stays live is
 *     a way to drop a production database.
 *   · The connection string is never returned, logged, or put in an error.
 */
import { Client } from 'pg';
import { SETUP_SQL, MIGRATION_FILES } from './setup-sql';
import {
  applyPending,
  ensureLedger,
  pendingMigrations,
  signatureHolds,
  type AppliedMigration,
} from './ledger';

/** How complete the database is, decided by looking rather than by remembering. */
export type SchemaState = 'absent' | 'partial' | 'ready';

export interface SchemaStatus {
  state: SchemaState;
  tables: number;
  permissions: number;
  roleGrants: number;
  /** Why a connection could not be made, when one could not. */
  problem?: string;
}

export const EXPECTED = { tables: 49, permissions: 30, minRoleGrants: 100 } as const;

/**
 * Server-only. The connection string carries the database password, so it must
 * never be prefixed NEXT_PUBLIC_ and never reach a browser bundle.
 */
export function databaseUrl(): string | undefined {
  if (typeof window !== 'undefined') {
    throw new Error('databaseUrl() must never be called in the browser');
  }
  const value = process.env.SUPABASE_DB_URL?.trim();
  return value && value.length > 0 ? value : undefined;
}

/**
 * Supabase quotes two connection strings. The direct one reaches the database
 * over IPv6 only, which most serverless platforms cannot route, so a pooler
 * URL is the one that works from a deployment. Worth saying plainly, because
 * the failure is a timeout that names nothing.
 */
export function looksLikePooler(url: string): boolean {
  return /pooler\.supabase\.com/i.test(url);
}

async function connect(): Promise<Client> {
  const url = databaseUrl();
  if (!url) throw new Error('SUPABASE_DB_URL is not set.');

  const client = new Client({
    connectionString: url,
    // Supabase terminates TLS with a certificate this container has no root
    // for. The connection is still encrypted; only the chain is unverified,
    // and the alternative is not connecting at all.
    //
    // Off only when the connection string says so in as many words. A local
    // PostgreSQL over a unix socket offers no TLS at all and refuses the
    // handshake, so the standard `sslmode=disable` has to mean something —
    // but it is the operator's own explicit statement about their own
    // database, never a fallback this code reaches for when TLS fails.
    ssl: /[?&]sslmode=disable(&|$)/.test(url) ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
    statement_timeout: 120_000,
  });
  await client.connect();
  return client;
}

/**
 * Errors from a connection attempt routinely quote the string that failed,
 * password included. Nothing from the driver is passed through untouched.
 */
export function safeMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const url = databaseUrl();
  let message = url ? raw.split(url).join('the configured connection string') : raw;
  // Belt and braces: strip anything shaped like credentials in a URL.
  message = message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'the configured connection string');
  return message;
}

export async function readSchemaStatus(): Promise<SchemaStatus> {
  let client: Client | undefined;
  try {
    client = await connect();
    const { rows } = await client.query<{ tables: string; perms: string; grants: string }>(`
      select
        (select count(*) from pg_tables where schemaname = 'public')          as tables,
        (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = 'permissions')            as has_permissions
    `);
    const tables = Number(rows[0]?.tables ?? 0);
    const hasPermissions = Number((rows[0] as unknown as { has_permissions: string }).has_permissions ?? 0) > 0;

    let permissions = 0;
    let roleGrants = 0;
    if (hasPermissions) {
      const counts = await client.query<{ permissions: string; grants: string }>(
        'select (select count(*) from public.permissions) as permissions,' +
          ' (select count(*) from public.role_permissions) as grants',
      );
      permissions = Number(counts.rows[0]?.permissions ?? 0);
      roleGrants = Number(counts.rows[0]?.grants ?? 0);
    }

    const ready =
      tables === EXPECTED.tables &&
      permissions === EXPECTED.permissions &&
      roleGrants >= EXPECTED.minRoleGrants;

    return {
      state: ready ? 'ready' : tables === 0 ? 'absent' : 'partial',
      tables,
      permissions,
      roleGrants,
    };
  } catch (error) {
    return { state: 'absent', tables: 0, permissions: 0, roleGrants: 0, problem: safeMessage(error) };
  } finally {
    await client?.end().catch(() => {});
  }
}

export interface SetupResult {
  ok: boolean;
  message: string;
  /**
   * Named `schema` rather than `status`: this is spread into a discriminated
   * union whose tag is already called status, and the collision is a type
   * error rather than a shadowing bug — which is the better of the two.
   */
  schema?: SchemaStatus;
  /** Notices Postgres raised, which is where the file reports what it did. */
  notices?: string[];
  /** Per-migration outcomes, when this was an incremental run. */
  applied?: AppliedMigration[];
  /** Files still to apply after this run, if it stopped early. */
  outstanding?: string[];
}

/**
 * Brings the database up to date, whatever state it is in.
 *
 * Two paths, because building from nothing and changing something that exists
 * are different problems and were being solved by the same refusal.
 *
 *   · Empty → the generated file, in one transaction. Either the whole schema
 *     appears or nothing does.
 *   · Already has a schema → only the migrations it has not recorded, each in
 *     its own transaction.
 *
 * The second path is what was missing. Adding a migration to a deployment with
 * customers in it had no route through the application at all: the state was
 * neither absent nor ready, and this function answered "clear the public
 * schema first" — advice that, followed on a production database, destroys it.
 */
export async function applySchema(): Promise<SetupResult> {
  const before = await readSchemaStatus();

  if (before.problem) {
    return { ok: false, message: `Could not reach the database — ${before.problem}`, schema: before };
  }

  let client: Client | undefined;
  const notices: string[] = [];
  try {
    client = await connect();
    client.on('notice', (n) => {
      if (n.message) notices.push(n.message);
    });

    // ── nothing there: build it in one transaction ───────────────────────
    if (before.state === 'absent') {
      // SETUP_SQL opens and closes its own transaction, so a failure anywhere
      // leaves the database exactly as it was.
      await client.query(SETUP_SQL);

      // Then record what was applied, so the next change is incremental. The
      // ledger seeds itself by looking at the schema, which has just become
      // complete, so every migration is recorded as applied.
      await ensureLedger(client);

      const after = await readSchemaStatus();
      return {
        ok: after.state === 'ready',
        message:
          after.state === 'ready'
            ? `Built: ${after.tables} tables, ${after.permissions} permissions, ${after.roleGrants} role grants.`
            : `The script ran but the result is not what it should be — ${after.tables} tables, ${after.permissions} permissions.`,
        schema: after,
        notices,
      };
    }

    // ── something there: apply only what it has not seen ─────────────────
    //
    // The ledger seeds itself on first use by looking for an object each
    // migration introduces, rather than assuming how far a previous run got.
    const { seeded } = await ensureLedger(client);
    const pending = await pendingMigrations(client);

    if (pending.length === 0) {
      const message =
        before.state === 'ready'
          ? 'Already up to date. Nothing to apply.'
          : `Every migration has been applied, but the result is not what it should be — ` +
            `${before.tables} tables, ${before.permissions} permissions. ` +
            `Run supabase/tests/verify-remote.sql for the full picture.`;
      return { ok: before.state === 'ready', message, schema: before, notices };
    }

    const applied = await applyPending(client, pending, safeMessage);
    const failed = applied.find((result) => !result.ok);
    const outstanding = pending
      .slice(applied.length)
      .map((migration) => migration.file)
      .concat(failed ? [failed.file] : []);

    const after = await readSchemaStatus();
    const succeeded = applied.filter((result) => result.ok).length;

    if (failed) {
      return {
        ok: false,
        message:
          `Applied ${succeeded} of ${pending.length}, then stopped at ${failed.file}: ` +
          `${failed.problem} Nothing from that file was applied, and the ones before it stand.`,
        schema: after,
        notices,
        applied,
        outstanding,
      };
    }

    return {
      ok: after.state === 'ready',
      message:
        `Applied ${succeeded} migration${succeeded === 1 ? '' : 's'}` +
        (seeded.length > 0 ? `, having found ${seeded.length} already in place` : '') +
        `. Now ${after.tables} tables, ${after.permissions} permissions, ${after.roleGrants} role grants.`,
      schema: after,
      notices,
      applied,
    };
  } catch (error) {
    return {
      ok: false,
      message: `Nothing was applied. ${safeMessage(error)}`,
      schema: before,
      notices,
    };
  } finally {
    await client?.end().catch(() => {});
  }
}

/**
 * What the database still needs, without changing anything.
 *
 * Used by /diagnostics, which reports and never writes.
 */
export async function readPending(): Promise<{ files: string[]; problem?: string }> {
  let client: Client | undefined;
  try {
    client = await connect();
    const { rows } = await client.query<{ present: boolean }>(
      "select to_regclass('amryn.schema_migrations') is not null as present",
    );

    // No ledger yet, and reporting must not create one. Fall back to the same
    // signatures the ledger would seed itself from.
    if (!rows[0]?.present) {
      const files: string[] = [];
      for (const file of MIGRATION_FILES) {
        const applied = await signatureHolds(client, file);
        if (!applied) files.push(file);
      }
      return { files };
    }

    const applied = await client.query<{ file: string }>(
      'select file from amryn.schema_migrations',
    );
    const seen = new Set(applied.rows.map((row) => row.file));
    return { files: MIGRATION_FILES.filter((file) => !seen.has(file)) };
  } catch (error) {
    return { files: [], problem: safeMessage(error) };
  } finally {
    await client?.end().catch(() => {});
  }
}

export { MIGRATION_FILES };
export type { AppliedMigration };
