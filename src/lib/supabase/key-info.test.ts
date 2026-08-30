import { describe, expect, it } from 'vitest';
import { inspectKey, judgeAnonKey, projectRefFromUrl } from './key-info';

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

  it('reports a truncated key as truncated rather than as the wrong project', () => {
    const full = jwt({ ref: PROJECT, role: 'anon', exp: IN_TEN_YEARS });
    const verdict = judgeAnonKey(full.slice(0, 40), URL_FOR_PROJECT);
    expect(verdict.status).toBe('fail');
    expect(verdict.detail).toMatch(/truncated|shorter/);
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
