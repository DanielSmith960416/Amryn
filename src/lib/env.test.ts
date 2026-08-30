import { afterEach, describe, expect, it } from 'vitest';
import { isSupabaseConfigured, siteUrl, supabaseConfigError } from '@/lib/env';

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

  it('names each missing variable rather than saying something is wrong', () => {
    withEnv({});
    const problem = supabaseConfigError() ?? '';
    expect(problem).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(problem).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
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
