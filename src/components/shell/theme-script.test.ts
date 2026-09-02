import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ThemeScript } from './theme-script';
import { THEMES, THEME_STORAGE_KEY } from './theme';

const here = import.meta.dirname;

/** The `__html` the component hands to React. */
function rendered(): string {
  const element = ThemeScript() as unknown as {
    props: { dangerouslySetInnerHTML: { __html: string } };
  };
  return element.props.dangerouslySetInnerHTML.__html;
}

describe('ThemeScript', () => {
  it('reads the real storage key', () => {
    expect(rendered()).toContain(JSON.stringify(THEME_STORAGE_KEY));
  });

  // The bug this file exists for. The key lived in theme-toggle.tsx, which is
  // a client module; a server component importing a plain constant across that
  // boundary gets `undefined`, because Next replaces the module with a client
  // reference. So the script rendered localStorage.getItem(undefined), looked
  // up a key called "undefined", found nothing, and did nothing — leaving the
  // white flash it exists to prevent, while looking entirely fine.
  it('never interpolates undefined into the script', () => {
    expect(rendered()).not.toContain('undefined');
  });

  it('accepts every theme the toggle can store, and nothing else', () => {
    const script = rendered();
    for (const theme of THEMES) {
      expect(script, theme).toContain(`t === ${JSON.stringify(theme)}`);
    }
    expect(script.match(/t === /g)).toHaveLength(THEMES.length);
  });

  it('survives a localStorage that throws, rather than leaving the page unstyled', () => {
    expect(rendered()).toMatch(/try\s*\{/);
    expect(rendered()).toMatch(/catch/);
  });
});

/**
 * The invariant, checked at the source rather than through the value.
 *
 * A unit test cannot reproduce the failure: under vitest there is no client
 * boundary, so importing the constant from a `'use client'` module works
 * perfectly and the assertions above would pass against the broken code. What
 * can be checked is the thing that was actually wrong — a server component
 * reaching into a client module for something that is not a component.
 */
describe('the client boundary', () => {
  const source = readFileSync(join(here, 'theme-script.tsx'), 'utf8');

  it('has no "use client" of its own — it renders on the server', () => {
    expect(source).not.toMatch(/^\s*['"]use client['"]/m);
  });

  it('imports nothing from a client module', () => {
    const imports = [...source.matchAll(/from\s+'(\.\.?\/[^']+)'/g)].map((m) => m[1]!);
    expect(imports.length).toBeGreaterThan(0);

    for (const specifier of imports) {
      // The extension is omitted in source; try both.
      const candidates = ['.ts', '.tsx'].map((ext) => join(here, `${specifier}${ext}`));
      const path = candidates.find((candidate) => {
        try {
          readFileSync(candidate);
          return true;
        } catch {
          return false;
        }
      });
      expect(path, `could not resolve ${specifier}`).toBeDefined();

      const imported = readFileSync(path!, 'utf8');
      expect(
        /^\s*['"]use client['"]/m.test(imported),
        `theme-script.tsx imports ${specifier}, which is a client module — ` +
          'a server component gets undefined for its non-component exports',
      ).toBe(false);
    }
  });
});
