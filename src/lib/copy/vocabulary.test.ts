import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
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

function sourceFiles(): string[] {
  const listed = execSync('git ls-files "src/**/*.ts" "src/**/*.tsx"', { encoding: 'utf8' });
  return listed
    .split('\n')
    .filter(Boolean)
    .filter((path) => !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'))
    .filter((path) => !EXEMPT_PATHS.some((exempt) => path.startsWith(exempt)));
}

/**
 * Everything that is not addressed to a customer, removed.
 *
 * Comments go first: an explanation of why a message avoids naming the anon
 * key necessarily names the anon key.
 *
 * Then the two places operator wording is *supposed* to live. `console.*`
 * calls are the server log, which is exactly where the setting at fault
 * belongs. `detail:` is the field an AuthFault carries for the same purpose —
 * the counterpart of `message:`, which is checked. Without this the guard
 * would push the diagnosis out of the code altogether, and a deployment that
 * says nothing anywhere is worse than one that says the wrong thing on screen.
 */
function customerFacing(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/console\.(error|warn|info|log|debug)\([\s\S]*?\n\s*\);/g, ' ')
    .replace(/console\.(error|warn|info|log|debug)\([^\n]*\);/g, ' ')
    .replace(/\bdetail:[\s\S]*?,\n/g, ' ');
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
