import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  citationHref,
  citationLabel,
  readCitations,
  readSuggestedActions,
  readVisualisations,
  threadTitle,
  UNTITLED,
} from './threads';

describe('readCitations', () => {
  it('keeps a citation that names both a table and a row', () => {
    expect(readCitations([{ table: 'opportunities', id: 'abc', label: 'Tender closing' }])).toEqual([
      { table: 'opportunities', id: 'abc', label: 'Tender closing' },
    ]);
  });

  it('drops one missing its row, rather than rendering half of it', () => {
    expect(readCitations([{ table: 'opportunities', label: 'Something' }])).toEqual([]);
  });

  it('reads the column whether it arrives parsed or as a string', () => {
    const json = '[{"table":"opportunities","id":"abc"}]';
    expect(readCitations(json)).toEqual([{ table: 'opportunities', id: 'abc', label: null }]);
  });

  it('treats anything that is not a list as none', () => {
    expect(readCitations(null)).toEqual([]);
    expect(readCitations({ table: 'opportunities', id: 'abc' })).toEqual([]);
    expect(readCitations('not json at all')).toEqual([]);
  });

  it('does not take whitespace for a label', () => {
    expect(readCitations([{ table: 'opportunities', id: 'abc', label: '   ' }])[0]?.label).toBeNull();
  });
});

describe('citationHref', () => {
  it('points at the page that can explain the figure', () => {
    expect(citationHref({ table: 'ai_recommendations', id: 'r1', label: null })).toBe(
      '/explain/ai_recommendations/r1',
    );
  });

  it('refuses a table /explain would 404 on', () => {
    expect(citationHref({ table: 'user_profiles', id: 'u1', label: null })).toBeNull();
  });

  it('encodes an id rather than pasting it into the path', () => {
    expect(citationHref({ table: 'opportunities', id: 'a/b?c', label: null })).toBe(
      '/explain/opportunities/a%2Fb%3Fc',
    );
  });
});

describe('citationLabel', () => {
  it('prefers the label the citation carries', () => {
    expect(citationLabel({ table: 'opportunities', id: 'x', label: 'Q3 tender' })).toBe('Q3 tender');
  });

  it('falls back to the table, readably, rather than to an identifier', () => {
    expect(citationLabel({ table: 'ai_recommendations', id: 'x', label: null })).toBe(
      'ai recommendations',
    );
  });
});

describe('readSuggestedActions', () => {
  it('keeps an action pointing inside the application', () => {
    expect(readSuggestedActions([{ label: 'Open the radar', href: '/opportunity-radar' }])).toEqual([
      { label: 'Open the radar', href: '/opportunity-radar' },
    ]);
  });

  it.each(['https://elsewhere.example/steal', '//elsewhere.example', '/\\elsewhere.example', 'javascript:alert(1)'])(
    'refuses %s, because this field is written by a model',
    (href) => {
      expect(readSuggestedActions([{ label: 'Click me', href }])).toEqual([]);
    },
  );

  it('drops an action with no label to click', () => {
    expect(readSuggestedActions([{ href: '/brief' }])).toEqual([]);
  });
});

describe('readVisualisations', () => {
  it('keeps one that says what it is', () => {
    expect(readVisualisations([{ kind: 'line', title: 'Revenue' }])).toEqual([
      { kind: 'line', title: 'Revenue' },
    ]);
  });

  it('drops one that does not', () => {
    expect(readVisualisations([{ title: 'Revenue' }])).toEqual([]);
  });
});

describe('threadTitle', () => {
  it('uses the title as given', () => {
    expect(threadTitle('Margin by branch')).toBe('Margin by branch');
  });

  it('falls back to the database default for a title of spaces', () => {
    expect(threadTitle('   ')).toBe(UNTITLED);
    expect(threadTitle(null)).toBe(UNTITLED);
  });

  it('shortens one long enough to push the list about', () => {
    const long = 'a'.repeat(200);
    const shown = threadTitle(long);
    expect(shown).toHaveLength(80);
    expect(shown.endsWith('…')).toBe(true);
  });
});

/*
 * The other half of EXPLAINABLE lives in trace.ts, which is server-only and so
 * cannot be imported into a test. Reading the file is not elegant, but the
 * failure it catches is: a table added to /explain and not to the citation
 * chips renders a citation as plain text for ever, and nothing else would ever
 * say so.
 */
describe('the explainable tables', () => {
  it('match the ones trace.ts can actually resolve', () => {
    const source = readFileSync(join(__dirname, 'trace.ts'), 'utf8');
    const block = source.match(/const TRACEABLE = \{([\s\S]*?)\} as const;/)?.[1] ?? '';
    const traceable = [...block.matchAll(/^\s{2}(\w+):/gm)].map((match) => match[1]);

    expect(traceable.length).toBeGreaterThan(0);

    // brief_items is handled by its own function in trace.ts rather than by
    // that table, so it is expected here and absent there.
    for (const table of traceable) {
      expect(citationHref({ table: table!, id: 'x', label: null })).not.toBeNull();
    }
    expect(citationHref({ table: 'brief_items', id: 'x', label: null })).not.toBeNull();
  });
});
