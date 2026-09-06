import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..', '..', '..');

/**
 * Nothing may read the user off a session.
 *
 * `supabase.auth.getSession()` returns what was decoded from the cookie. It
 * was never revalidated against the auth server, so supabase-js emits an
 * error-severity warning the moment anything touches `.user` on it — and it is
 * right to: that object says who the caller claims to be, not who they are.
 *
 * The middleware did exactly that to read a user's second-factor list, on
 * every non-public request. Five identical error lines in forty seconds of
 * ordinary traffic, in a log where an error should mean something. Nothing was
 * actually exposed — the database refuses the session regardless — but a
 * warning that fires constantly is a warning nobody reads, including the time
 * it matters.
 *
 * `getUser()` is the revalidated source and carries the same fields. So this
 * asserts the shape rather than the intent: the substring cannot appear at
 * all, which is a rule that survives somebody reintroducing it for a reason
 * that sounds good at the time.
 *
 * The access token is deliberately not covered. It is a signed string rather
 * than a claim about identity, and reading it warns about nothing.
 */
function sourceLinesMatching(pattern: string): string[] {
  try {
    return execFileSync(
      'git',
      ['grep', '-n', '-F', pattern, '--', 'src', ':(exclude)src/lib/supabase/session-usage.test.ts'],
      { cwd: root, encoding: 'utf8' },
    )
      .split('\n')
      .filter((line) => line.trim().length > 0);
  } catch {
    // git grep exits non-zero when it finds nothing, which is the passing case.
    return [];
  }
}

describe('the session object', () => {
  for (const pattern of ['.session.user', '.session?.user']) {
    it(`is never read for its user via ${pattern}`, () => {
      const offenders = sourceLinesMatching(pattern);
      expect(
        offenders,
        `read the user from getUser() instead — it is revalidated, carries the same fields, ` +
          `and does not make supabase-js log an error on every request:\n${offenders.join('\n')}`,
      ).toEqual([]);
    });
  }

  it('catches the shape it is meant to catch', () => {
    // The guard above passes trivially if the search is broken, so this proves
    // the search itself works by looking for something that is certainly there.
    expect(sourceLinesMatching('supabase.auth.getUser()').length).toBeGreaterThan(0);
  });
});
