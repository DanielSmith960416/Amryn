import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BASE_PATH, withBasePath } from './base-path';

describe('withBasePath', () => {
  it('prefixes a root-relative path', () => {
    expect(withBasePath('/brand/mark.png')).toBe(`${BASE_PATH}/brand/mark.png`);
  });

  it('leaves an absolute URL alone, so a caller need not check first', () => {
    expect(withBasePath('https://amryn.ai/x.png')).toBe('https://amryn.ai/x.png');
    expect(withBasePath('//cdn.example.com/x.png')).toBe('//cdn.example.com/x.png');
    expect(withBasePath('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  });

  it('leaves a relative path alone', () => {
    expect(withBasePath('brand/mark.png')).toBe('brand/mark.png');
  });
});

/**
 * The guard, and the reason this file exists.
 *
 * Next applies basePath to `next/link` and to its own `_next/` assets, and to
 * nothing else. A hand-written `src="/brand/mark.png"` compiles, renders, and
 * 404s — the page looks right in review and arrives at a customer with holes
 * in it. Moving the application to amryn.ai/app broke twelve of these at once,
 * including the two font preloads added to fix a slow first paint, which would
 * have quietly undone that work.
 *
 * So the rule is checked rather than remembered: every root-relative URL to a
 * file we ship goes through withBasePath().
 */
describe('no unprefixed asset URLs in the source', () => {
  const ASSET_DIRS = 'brand|fonts|images|assets|icons';
  const OFFENDER = new RegExp(`(?:src|href|poster)="/(?:${ASSET_DIRS})/`);

  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return walk(path);
      return /\.tsx?$/.test(entry.name) ? [path] : [];
    });
  }

  it('routes every shipped asset through withBasePath', () => {
    const offenders = walk('src')
      .filter((file) => !file.endsWith('base-path.test.ts'))
      .flatMap((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .map((line, index) => ({ file, line: index + 1, text: line.trim() }))
          .filter(({ text }) => OFFENDER.test(text)),
      );

    expect(
      offenders.map((o) => `${o.file}:${o.line}  ${o.text}`),
      'these would 404 under the base path; wrap them in withBasePath()',
    ).toEqual([]);
  });
});
