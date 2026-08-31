import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

/**
 * Bringing a database that is behind up to date.
 *
 * This is the case the setup route could not handle and the live deployment
 * was in: 47 tables, every migration up to 12 applied, two more waiting, and
 * no route through the application to apply them — the state was neither
 * absent nor ready, and the answer offered was "clear the public schema
 * first", which on a database with customers in it destroys it.
 *
 * So the scenario is built for real rather than mocked: a fresh database taken
 * to migration 12 exactly as the deployment was, then handed to applySchema().
 * A mocked pg client would have agreed with whatever this file expected.
 *
 * Needs a local PostgreSQL, the same one supabase/tests/run.sh uses. Skipped
 * when there is none, so `npm run check` still passes on a machine without it.
 */
vi.mock('server-only', () => ({}));

const CONN = { host: process.env.PGHOST ?? '/var/tmp', port: Number(process.env.PGPORT ?? 55432), user: process.env.PGUSER ?? 'postgres' };
const DB = 'amryn_ledger_test';
const DIR = 'supabase/migrations';

const ALL = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
/** Everything the deployment had: up to and including migration 12. */
const THROUGH_12 = ALL.filter((f) => !/_1[34]_/.test(f));
const AFTER_12 = ALL.filter((f) => /_1[34]_/.test(f));

async function reachable(): Promise<boolean> {
  const client = new Client({ ...CONN, database: 'postgres' });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

const available = await reachable();

/**
 * Every signature must become true at its own migration and not before.
 *
 * This is the assertion that matters most, and the one a reviewer would not
 * think to make. A signature satisfied by an *earlier* migration makes its own
 * file read as already applied on a database that has never had it — so it is
 * skipped, silently, and the fault surfaces much later as a missing column
 * that nothing explains. Checking only that a signature is eventually true
 * would pass in exactly that case.
 *
 * So the database is built one migration at a time, and after each one every
 * signature is evaluated: the ones up to here true, the ones after still false.
 */
describe.skipIf(!available)('migration signatures', () => {
  const DB_SIG = 'amryn_signature_test';

  beforeAll(async () => {
    const admin = new Client({ ...CONN, database: 'postgres' });
    await admin.connect();
    await admin.query(`drop database if exists ${DB_SIG}`);
    await admin.query(`create database ${DB_SIG}`);
    await admin.end();
  }, 30_000);

  afterAll(async () => {
    const admin = new Client({ ...CONN, database: 'postgres' });
    await admin.connect();
    await admin.query(`drop database if exists ${DB_SIG}`);
    await admin.end();
  });

  it('each one turns true at its own migration, and no earlier', async () => {
    const { SIGNATURES } = await import('./setup-sql');
    expect(Object.keys(SIGNATURES).sort()).toEqual(ALL);

    const client = new Client({ ...CONN, database: DB_SIG });
    await client.connect();
    try {
      await client.query(readFileSync('supabase/tests/00_supabase_shim.sql', 'utf8'));

      for (const [index, file] of ALL.entries()) {
        await client.query(readFileSync(join(DIR, file), 'utf8'));

        for (const [other, position] of ALL.map((f, i) => [f, i] as const)) {
          const holds = await evaluate(client, SIGNATURES[other]!);
          const shouldHold = position <= index;
          expect(
            holds,
            `after ${file}: signature for ${other} was ${holds}, expected ${shouldHold}`,
          ).toBe(shouldHold);
        }
      }
    } finally {
      await client.end();
    }
  }, 120_000);
});

/** A signature that cannot be evaluated names something absent, which is false. */
async function evaluate(client: Client, signature: string): Promise<boolean> {
  try {
    const { rows } = await client.query<{ ok: boolean }>(`select (${signature}) as ok`);
    return rows[0]?.ok === true;
  } catch {
    // The failed statement aborts the transaction block if one is open; there
    // is none here, so the next query is unaffected.
    return false;
  }
}

describe.skipIf(!available)('applySchema on a database that is behind', () => {
  beforeAll(async () => {
    const admin = new Client({ ...CONN, database: 'postgres' });
    await admin.connect();
    await admin.query(`drop database if exists ${DB}`);
    await admin.query(`create database ${DB}`);
    await admin.end();

    const client = new Client({ ...CONN, database: DB });
    await client.connect();
    await client.query(readFileSync('supabase/tests/00_supabase_shim.sql', 'utf8'));
    for (const file of THROUGH_12) {
      await client.query(readFileSync(join(DIR, file), 'utf8'));
    }
    await client.end();

    process.env.SUPABASE_DB_URL = `postgres://${CONN.user}@localhost/${DB}?host=${CONN.host}&port=${CONN.port}&sslmode=disable`;
  }, 60_000);

  afterAll(async () => {
    const admin = new Client({ ...CONN, database: 'postgres' });
    await admin.connect();
    await admin.query(`drop database if exists ${DB}`);
    await admin.end();
  });

  it('sees exactly the migrations that are missing, without a ledger to read', async () => {
    // No ledger exists yet on a database that predates it, and reporting must
    // not create one — so this answer comes from looking at the schema.
    const { readPending } = await import('./setup');
    const pending = await readPending();
    expect(pending.problem).toBeUndefined();
    expect(pending.files).toEqual(AFTER_12);
  });

  it('applies them, and says what it did', async () => {
    const { applySchema } = await import('./setup');
    const result = await applySchema();

    expect(result.applied?.map((a) => a.file)).toEqual(AFTER_12);
    expect(result.applied?.every((a) => a.ok)).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('Applied 2 migrations');
    // It found the twelve that were already there rather than trying them.
    expect(result.message).toContain('12 already in place');
  }, 60_000);

  it('reaches the state the application expects', async () => {
    const { readSchemaStatus, EXPECTED } = await import('./setup');
    const status = await readSchemaStatus();
    expect(status.state).toBe('ready');
    expect(status.tables).toBe(EXPECTED.tables);
  });

  it('has nothing left to do, and is safe to run again', async () => {
    const { applySchema, readPending } = await import('./setup');
    expect((await readPending()).files).toEqual([]);

    const again = await applySchema();
    expect(again.ok).toBe(true);
    expect(again.message).toContain('Already up to date');
  }, 30_000);

  it('leaves organisation creation working, which is what broke', async () => {
    // The reason any of this matters. create_organisation() is reachable and
    // its whole body — six tables including the audit row migration 14
    // touched — still runs to completion.
    const client = new Client({ ...CONN, database: DB });
    await client.connect();
    try {
      await client.query("insert into auth.users (id, email) values ('d1111111-1111-4111-8111-111111111111', 'ledger@test.local') on conflict do nothing");
      await client.query("select set_config('request.jwt.claim.sub', 'd1111111-1111-4111-8111-111111111111', false)");
      const { rows } = await client.query<{ id: string }>(
        "select public.create_organisation('Ledger Test Co', 'ledger-test-co', null, 'ZA', 'ZAR') as id",
      );
      expect(rows[0]?.id).toMatch(/^[0-9a-f-]{36}$/);

      const audit = await client.query<{ n: string }>(
        "select count(*) n from public.audit_logs where action = 'organisation.created'",
      );
      expect(Number(audit.rows[0]?.n)).toBe(1);
    } finally {
      await client.end();
    }
  }, 30_000);
});
