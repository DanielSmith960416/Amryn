import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  isSupabaseConfigured,
  publicEnv,
  resolveSupabaseUrl,
  siteUrl,
  supabaseConfigError,
} from '@/lib/env';

/**
 * An empty environment variable is what a hosting dashboard produces when a
 * row is added and never filled in. It is the same intent as unset, and
 * treating it as a value cost a live deployment every one of its routes: the
 * empty optional NEXT_PUBLIC_SITE_URL failed validation, which condemned the
 * whole configuration, which threw on every page.
 */
const KEYS = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SITE_URL', 'VERCEL_URL'] as const;
const original = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const key of KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

function withEnv(env: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(env)) process.env[key] = value;
}

const VALID_URL = 'https://tnkmrrfxzsrbfndpkonh.supabase.co';
const VALID_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.signature';

describe('supabaseConfigError', () => {
  it('accepts a correct configuration', () => {
    withEnv({ NEXT_PUBLIC_SUPABASE_URL: VALID_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: VALID_KEY });
    expect(supabaseConfigError()).toBeNull();
    expect(isSupabaseConfigured()).toBe(true);
  });

  it('does not condemn a good configuration over an empty optional value', () => {
    withEnv({
      NEXT_PUBLIC_SUPABASE_URL: VALID_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: VALID_KEY,
      NEXT_PUBLIC_SITE_URL: '',
    });
    expect(supabaseConfigError()).toBeNull();
    expect(isSupabaseConfigured()).toBe(true);
  });

  it('treats whitespace as unset too', () => {
    withEnv({
      NEXT_PUBLIC_SUPABASE_URL: VALID_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: VALID_KEY,
      NEXT_PUBLIC_SITE_URL: '   ',
    });
    expect(isSupabaseConfigured()).toBe(true);
  });

  it('names the variable when the project URL has no scheme', () => {
    withEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'tnkmrrfxzsrbfndpkonh.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: VALID_KEY,
    });
    expect(supabaseConfigError()).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(supabaseConfigError()).toContain('https://');
  });

  it('asks for the one setting that is actually required', () => {
    // This assertion used to require both variables be named. That is no
    // longer the contract: the project URL is derived from the anon key, so
    // naming it here would send the reader to configure something optional.
    withEnv({});
    const problem = supabaseConfigError() ?? '';
    expect(problem).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  });

  it('does not claim the anon key is missing when the URL is the fault', () => {
    withEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'tnkmrrfxzsrbfndpkonh.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: VALID_KEY,
    });
    expect(supabaseConfigError()).not.toContain('ANON_KEY is not set');
  });

  it('still rejects a site URL that is set to something invalid', () => {
    withEnv({
      NEXT_PUBLIC_SUPABASE_URL: VALID_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: VALID_KEY,
      NEXT_PUBLIC_SITE_URL: 'amryn.vercel.app',
    });
    expect(supabaseConfigError()).toContain('NEXT_PUBLIC_SITE_URL');
  });
});

describe('siteUrl', () => {
  it('never returns an empty string when the variable is empty', () => {
    withEnv({ NEXT_PUBLIC_SITE_URL: '' });
    expect(siteUrl()).not.toBe('');
    expect(siteUrl()).toBe('http://localhost:3000');
  });

  it('uses the configured value when it is real', () => {
    withEnv({ NEXT_PUBLIC_SITE_URL: 'https://amryn.vercel.app' });
    expect(siteUrl()).toBe('https://amryn.vercel.app');
  });

  it('falls back to the host’s own address when nothing is set', () => {
    withEnv({ VERCEL_URL: 'amryn.vercel.app' });
    expect(siteUrl()).toBe('https://amryn.vercel.app');
  });
});

/* ── resolving the project URL from the key ────────────────────────────── */

describe('resolveSupabaseUrl', () => {
  const KEY_REF = 'tnkmrrfxzsrbfndpkonh';

  function anonKeyFor(ref: string): string {
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
      ref,
      role: 'anon',
      exp: Math.floor(Date.now() / 1000) + 315_360_000,
    })}.sig`;
  }

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it('derives the URL from the key when the URL is not set', () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKeyFor(KEY_REF);
    const resolved = resolveSupabaseUrl();
    expect(resolved.url).toBe(`https://${KEY_REF}.supabase.co`);
    expect(resolved.source).toBe('derived');
  });

  it('leaves a URL that agrees with the key alone', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${KEY_REF}.supabase.co`;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKeyFor(KEY_REF);
    expect(resolveSupabaseUrl().source).toBe('configured');
  });

  it('defers to the key when the two name different projects', () => {
    // The pairing that produced "Invalid API key" on the deployment. A key
    // issued for one project cannot authenticate against another, so the
    // key's project is the only pairing with a chance of working.
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://someotherproject.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKeyFor(KEY_REF);
    const resolved = resolveSupabaseUrl();
    expect(resolved.url).toBe(`https://${KEY_REF}.supabase.co`);
    expect(resolved.source).toBe('corrected');
    expect(resolved.note).toContain('someotherproject');
    expect(resolved.note).toContain(KEY_REF);
  });

  it('does not touch a custom domain, which has no project ref to compare', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.example.com';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKeyFor(KEY_REF);
    const resolved = resolveSupabaseUrl();
    expect(resolved.url).toBe('https://db.example.com');
    expect(resolved.source).toBe('configured');
  });

  it('treats an empty URL as unset and derives instead', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = '   ';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKeyFor(KEY_REF);
    expect(resolveSupabaseUrl().source).toBe('derived');
  });

  it('reports nothing to go on when neither is usable', () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_nothing_readable';
    expect(resolveSupabaseUrl().url).toBeUndefined();
  });

  it('lets the app configure itself from the anon key alone', () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKeyFor(KEY_REF);
    expect(isSupabaseConfigured()).toBe(true);
    expect(publicEnv().NEXT_PUBLIC_SUPABASE_URL).toBe(`https://${KEY_REF}.supabase.co`);
  });
});
