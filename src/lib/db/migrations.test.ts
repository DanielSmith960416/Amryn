import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static checks on the migrations, for faults a passing database suite cannot
 * see.
 *
 * The suite builds a local PostgreSQL where one role owns everything, so a
 * statement that needs privileges nobody has on a hosted Supabase project runs
 * happily here and fails there. That gap cost a live deployment its entire
 * schema twice: `create trigger ... on auth.users` needs ownership of a table
 * owned by supabase_auth_admin, and because the SQL editor runs each script in
 * a transaction, that one statement rolled back the migration around it.
 *
 * Guarding it once is not enough — it was guarded in a later migration while
 * the original stayed unguarded and kept failing first. These assert the
 * property directly.
 */
const DIR = join(process.cwd(), 'supabase', 'migrations');
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

/** Statements at the start of a line are top-level; a guarded one sits inside a DO block, indented. */
function topLevelStatements(sql: string, pattern: RegExp): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .filter((line) => pattern.test(line));
}

describe('migrations', () => {
  it('has migrations to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s never creates a trigger on an auth table unguarded', (file) => {
    const sql = readFileSync(join(DIR, file), 'utf8');

    // A top-level `create trigger` is one starting at column zero. Anything
    // inside a DO block — the only way to survive being refused — is indented.
    const unguarded = topLevelStatements(sql, /^create trigger/i);

    for (const statement of unguarded) {
      const after = sql.slice(sql.indexOf(statement), sql.indexOf(statement) + 400);
      expect(
        /\son\s+auth\./i.test(after),
        `${file}: "${statement.trim()}" targets an auth table without an exception handler. ` +
          'On a hosted Supabase project auth.users is owned by supabase_auth_admin, so this ' +
          'raises insufficient_privilege and rolls back the whole migration. Wrap it in a ' +
          'DO block that catches it.',
      ).toBe(false);
    }
  });

  it.each(files)('%s does not silently swallow every error', (file) => {
    const sql = readFileSync(join(DIR, file), 'utf8');
    // `when others then null` would hide real failures. A handler must name
    // what it tolerates.
    expect(/when\s+others\s+then\s*\n?\s*null\s*;/i.test(sql)).toBe(false);
  });

  it('is applied in filename order by the generated setup file', () => {
    const setup = readFileSync(join(process.cwd(), 'supabase', 'setup.sql'), 'utf8');
    const positions = files.map((f) => setup.indexOf(f));

    for (const [i, position] of positions.entries()) {
      expect(position, `${files[i]} is missing from setup.sql — regenerate it`).toBeGreaterThan(-1);
    }
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('wraps the generated setup file in one transaction, so a failure changes nothing', () => {
    const setup = readFileSync(join(process.cwd(), 'supabase', 'setup.sql'), 'utf8');
    expect(setup).toMatch(/^begin;$/m);
    expect(setup).toMatch(/^commit;$/m);
    // The cache reload has to sit outside, since PostgREST is a separate process.
    expect(setup.indexOf("notify pgrst, 'reload schema';\n", setup.indexOf('\ncommit;'))).toBeGreaterThan(-1);
  });
});
