import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { EXEMPT_PATHS, OPERATOR_VOCABULARY } from './vocabulary';

/**
 * The guard on customer-facing wording.
 *
 * Reads the source rather than the rendered pages, because rendering every
 * state a message can appear in needs a database, an email server and a broken
 * one of each. The text is in the files; that is where to look.
 *
 * What counts as customer-facing text: a quoted string that is a sentence
 * (long enough, and containing a space), and the words between JSX tags.
 * Identifiers, imports and property names are none of those, so `const
 * supabase = await createClient()` does not trip it while
 * `'Open /diagnostics'` does.
 *
 * Comments are stripped first. An explanation of why a message avoids naming
 * the anon key necessarily names the anon key.
 */

/**
 * Every source file, including ones not yet committed.
 *
 * `git ls-files` alone lists only what is tracked, which meant a brand-new
 * file was invisible to this guard until after it had been committed — and a
 * new file is exactly when the check is worth having. It let
 * src/features/mfa/admin.ts through on the run that mattered.
 *
 * --cached --others --exclude-standard is tracked files plus untracked ones
 * that .gitignore does not cover, which is the set a contributor is about to
 * commit.
 */
function sourceFiles(): string[] {
  const listed = execSync(
    'git ls-files --cached --others --exclude-standard "src/**/*.ts" "src/**/*.tsx"',
    { encoding: 'utf8' },
  );
  return listed
    .split('\n')
    .filter(Boolean)
    .filter((path) => !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'))
    .filter((path) => !EXEMPT_PATHS.some((exempt) => path.startsWith(exempt)))
    // A path can be listed twice — tracked and modified, say — and scanning it
    // twice would report the same offender twice.
    .filter((path, index, all) => all.indexOf(path) === index);
}

/**
 * Everything that is not addressed to a customer, removed.
 *
 * Comments go first: an explanation of why a message avoids naming the anon
 * key necessarily names the anon key.
 *
 * Then the places operator wording is *supposed* to live. `console.*` calls
 * are the server log, which is exactly where the setting at fault belongs.
 * `detail:` and `problem:` are the fields that carry the operator's half of a
 * failure — the counterparts of `message:`, which is checked — and both are
 * consumed by ourFault(), which logs them and returns the customer's sentence.
 * Without this the guard would push the diagnosis out of the code altogether,
 * and a deployment that says nothing anywhere is worse than one that says the
 * wrong thing on screen.
 */
function customerFacing(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/console\.(error|warn|info|log|debug)\([\s\S]*?\n\s*\);/g, ' ')
    .replace(/console\.(error|warn|info|log|debug)\([^\n]*\);/g, ' ')
    .replace(/\b(detail|problem):[\s\S]*?,\n/g, ' ');
}

/**
 * The sentences a reader could see: quoted prose, and JSX text nodes.
 *
 * The length floor is what keeps identifiers out. A string short enough to be
 * a key, a class name or a column is not a sentence anybody reads.
 */
function readableText(source: string): string[] {
  const code = customerFacing(source);
  const found: string[] = [];

  for (const match of code.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
    const text = match[2] ?? '';
    if (text.length >= 20 && /\s/.test(text)) found.push(text);
  }

  // JSX text: what sits between a closing > and the next opening <, with any
  // {expression} removed. Only kept when it reads as words.
  for (const match of code.matchAll(/>([^<>{}]{20,})</g)) {
    const text = (match[1] ?? '').trim();
    if (/\s/.test(text) && /[a-z]/.test(text)) found.push(text);
  }

  return found;
}

/**
 * The guard has to see a file that has never been committed.
 *
 * This is not hypothetical: it is the bug this test was written after. The
 * listing used `git ls-files`, which is tracked files only, so a new file was
 * exempt until its second run — and src/features/mfa/admin.ts went in with a
 * string naming an environment variable, past a check that was looking the
 * other way.
 */
describe('the file listing', () => {
  // Not under src/lib/copy/, which is exempt — the decoy has to sit somewhere
  // the guard actually watches or it proves nothing.
  const decoy = 'src/features/__untracked-probe.ts';

  beforeAll(() => {
    writeFileSync(decoy, "export const NOTE = 'Open /diagnostics and check the anon key.';\n");
  });

  afterAll(() => {
    rmSync(decoy, { force: true });
  });

  it('includes a file that has never been committed', () => {
    expect(sourceFiles()).toContain(decoy);
  });

  it('and would fail on it, which is the whole point', () => {
    const offenders = readableText(readFileSync(decoy, 'utf8'));
    expect(offenders.some((text) => /diagnostics/i.test(text))).toBe(true);
  });
});

describe('customer-facing copy', () => {
  const files = sourceFiles();

  it('finds source to check, so a broken glob cannot pass silently', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it.each(OPERATOR_VOCABULARY)('never says "%s"', (word) => {
    const pattern = new RegExp(`(^|[^A-Za-z_])${word.replace(/[_]/g, '_')}`, 'i');
    const offenders: string[] = [];

    for (const path of files) {
      for (const text of readableText(readFileSync(path, 'utf8'))) {
        if (pattern.test(text)) offenders.push(`${path}: ${text.slice(0, 120)}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
