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

export const EXPECTED = { tables: 45, permissions: 30, minRoleGrants: 100 } as const;

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
    ssl: { rejectUnauthorized: false },
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
}

export async function applySchema(): Promise<SetupResult> {
  const before = await readSchemaStatus();

  if (before.problem) {
    return { ok: false, message: `Could not reach the database — ${before.problem}`, schema: before };
  }

  // Refusing when it is already built is the whole safety story. Without it,
  // this is a route on the public internet that runs DDL.
  if (before.state === 'ready') {
    return { ok: true, message: 'Already built. Nothing to do.', schema: before };
  }

  if (before.state === 'partial') {
    return {
      ok: false,
      message:
        `The database is half built — ${before.tables} tables, ${before.permissions} permissions. ` +
        'Applying the schema over the top would fail on the first table that already exists. ' +
        'Clear the public schema first, then run this again.',
      schema: before,
    };
  }

  let client: Client | undefined;
  const notices: string[] = [];
  try {
    client = await connect();
    client.on('notice', (n) => {
      if (n.message) notices.push(n.message);
    });

    // SETUP_SQL opens and closes its own transaction, so a failure anywhere
    // leaves the database exactly as it was.
    await client.query(SETUP_SQL);

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

export { MIGRATION_FILES };
