import { describe, expect, it } from 'vitest';
import { cleanKey, describeShape, inspectKey, judgeAnonKey, projectRefFromUrl } from './key-info';

/** Builds an unsigned JWT with the given claims — enough to read, never to use. */
function jwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}.signature-not-checked`;
}

const IN_TEN_YEARS = Math.floor(Date.now() / 1000) + 315_360_000;
const LAST_YEAR = Math.floor(Date.now() / 1000) - 31_536_000;

const PROJECT = 'tnkmrrfxzsrbfndpkonh';
const URL_FOR_PROJECT = `https://${PROJECT}.supabase.co`;

describe('projectRefFromUrl', () => {
  it('reads the ref from a Supabase host', () => {
    expect(projectRefFromUrl(URL_FOR_PROJECT)).toBe(PROJECT);
  });

  it('returns null for a custom domain, which has no ref to read', () => {
    expect(projectRefFromUrl('https://db.example.com')).toBeNull();
  });

  it('returns null rather than throwing on a value that is not a URL', () => {
    expect(projectRefFromUrl('not a url')).toBeNull();
  });
});

describe('inspectKey', () => {
  it('recognises a legacy anon key and reads its project', () => {
    const info = inspectKey(jwt({ iss: 'supabase', ref: PROJECT, role: 'anon', exp: IN_TEN_YEARS }));
    expect(info.kind).toBe('legacy-anon');
    expect(info.ref).toBe(PROJECT);
    expect(info.secret).toBe(false);
    expect(info.expired).toBe(false);
  });

  it('flags a service_role key as secret', () => {
    const info = inspectKey(jwt({ ref: PROJECT, role: 'service_role', exp: IN_TEN_YEARS }));
    expect(info.kind).toBe('legacy-service-role');
    expect(info.secret).toBe(true);
  });

  it('recognises the current key formats by prefix', () => {
    expect(inspectKey('sb_publishable_abc123').kind).toBe('publishable');
    expect(inspectKey('sb_secret_abc123').secret).toBe(true);
  });

  it('notices an expired key', () => {
    expect(inspectKey(jwt({ ref: PROJECT, role: 'anon', exp: LAST_YEAR })).expired).toBe(true);
  });

  it('does not throw on rubbish', () => {
    for (const value of ['', 'x', 'a.b.c', 'eyJ.notbase64!.sig', '....']) {
      expect(() => inspectKey(value)).not.toThrow();
    }
  });
});

describe('judgeAnonKey', () => {
  it('accepts a matching pair', () => {
    const verdict = judgeAnonKey(
      jwt({ ref: PROJECT, role: 'anon', exp: IN_TEN_YEARS }),
      URL_FOR_PROJECT,
    );
    expect(verdict.status).toBe('ok');
  });

  it('names both projects when the key belongs to a different one', () => {
    const verdict = judgeAnonKey(
      jwt({ ref: 'someotherproject', role: 'anon', exp: IN_TEN_YEARS }),
      URL_FOR_PROJECT,
    );
    expect(verdict.status).toBe('fail');
    expect(verdict.detail).toContain('someotherproject');
    expect(verdict.detail).toContain(PROJECT);
  });

  it('treats a published service-role key as the incident it is', () => {
    const verdict = judgeAnonKey(
      jwt({ ref: PROJECT, role: 'service_role', exp: IN_TEN_YEARS }),
      URL_FOR_PROJECT,
    );
    expect(verdict.status).toBe('fail');
    expect(verdict.remedy).toContain('compromised');
  });

  it('describes a cut-off key by its shape rather than guessing why', () => {
    // This used to assert the word "truncated". That was the guess the message
    // made, and a guess is what a reader cannot check. A length and a segment
    // count they can compare against their dashboard in seconds.
    const full = jwt({ ref: PROJECT, role: 'anon', exp: IN_TEN_YEARS });
    const verdict = judgeAnonKey(full.slice(0, 40), URL_FOR_PROJECT);
    expect(verdict.status).toBe('fail');
    expect(verdict.detail).toContain('40 characters');
    expect(verdict.detail).toContain('segments');
  });

  it('reports an unset key', () => {
    expect(judgeAnonKey(undefined, URL_FOR_PROJECT).status).toBe('fail');
    expect(judgeAnonKey('   ', URL_FOR_PROJECT).status).toBe('fail');
  });

  it('never repeats the key back in its verdict', () => {
    const key = jwt({ ref: 'someotherproject', role: 'anon', exp: IN_TEN_YEARS });
    const verdict = judgeAnonKey(key, URL_FOR_PROJECT);
    expect(`${verdict.detail} ${verdict.remedy ?? ''}`).not.toContain(key);
  });

  it('accepts a publishable key against a Supabase URL', () => {
    expect(judgeAnonKey('sb_publishable_abcdefghijklmnop', URL_FOR_PROJECT).status).toBe('ok');
  });
});

describe('cleanKey', () => {
  const REAL = jwt({ ref: PROJECT, role: 'anon', exp: IN_TEN_YEARS });

  it('strips quotation marks a dashboard stored with the value', () => {
    // The false negative that prompted this: a quoted key still splits into
    // three parts and decodes, so the old check pronounced it healthy while
    // Supabase answered every request "Invalid API key".
    for (const wrapped of [`"${REAL}"`, `'${REAL}'`, `\`${REAL}\``]) {
      const cleaned = cleanKey(wrapped);
      expect(cleaned.key).toBe(REAL);
      expect(cleaned.repairs.join(' ')).toContain('quotation marks');
    }
  });

  it('strips a line break folded into the middle by a copy on a phone', () => {
    const broken = `${REAL.slice(0, 40)}\n${REAL.slice(40)}`;
    expect(cleanKey(broken).key).toBe(REAL);
    expect(cleanKey(broken).repairs.join(' ')).toContain('line breaks');
  });

  it('strips a whole NAME=value line pasted into the value box', () => {
    expect(cleanKey(`NEXT_PUBLIC_SUPABASE_ANON_KEY=${REAL}`).key).toBe(REAL);
  });

  it('handles quotes and whitespace together', () => {
    const cleaned = cleanKey(`  "${REAL.slice(0, 30)} ${REAL.slice(30)}"  `);
    expect(cleaned.key).toBe(REAL);
    expect(cleaned.repairs).toHaveLength(2);
  });

  it('reports no repairs for a clean key, and leaves it untouched', () => {
    expect(cleanKey(REAL)).toEqual({ key: REAL, repairs: [] });
  });

  it('does not mangle a current-format key', () => {
    expect(cleanKey('sb_publishable_abc123').key).toBe('sb_publishable_abc123');
  });

  it('survives undefined and empty input', () => {
    expect(cleanKey(undefined).key).toBe('');
    expect(cleanKey('   ').key).toBe('');
  });
});

describe('a repaired key still reaches a verdict', () => {
  it('accepts a quoted key but says it was repaired', () => {
    const verdict = judgeAnonKey(`"${jwt({ ref: PROJECT, role: 'anon', exp: IN_TEN_YEARS })}"`, URL_FOR_PROJECT);
    expect(verdict.status).toBe('warn');
    expect(verdict.detail).toContain('repairing');
  });

  it('still catches a published service-role key through its quotes', () => {
    const verdict = judgeAnonKey(`"${jwt({ ref: PROJECT, role: 'service_role', exp: IN_TEN_YEARS })}"`, URL_FOR_PROJECT);
    expect(verdict.status).toBe('fail');
    expect(verdict.remedy).toContain('compromised');
  });
});

describe('describeShape', () => {
  it('reports facts about the value, never the value', () => {
    const key = jwt({ ref: PROJECT, role: 'anon', exp: IN_TEN_YEARS });
    const shape = describeShape(key);
    expect(shape).toContain(`${key.length} characters`);
    expect(shape).toContain('3 dot-separated segments');
    expect(shape).not.toContain(key.slice(0, 20));
  });

  it('names a truncated key by its segment count rather than guessing', () => {
    const verdict = judgeAnonKey('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', URL_FOR_PROJECT);
    expect(verdict.detail).toContain('1 segment');
    expect(verdict.detail).toContain('starts like a legacy key');
  });
});
