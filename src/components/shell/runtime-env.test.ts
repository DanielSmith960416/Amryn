import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The runtime settings, and the failure they exist to remove.
 *
 * A build that ran without NEXT_PUBLIC_SUPABASE_URL emits a browser bundle
 * carrying `undefined`, and the only symptom is a sign-in page reporting an
 * invalid API key — a message about a key, caused by a missing URL, in a
 * deployment where both settings are visible in the dashboard. These assert
 * that a value supplied at request time is preferred, so setting the variable
 * and restarting is enough.
 */
const URL_VALUE = 'https://example.supabase.co';
const KEY_VALUE = 'a'.repeat(40);

async function freshEnv() {
  vi.resetModules();
  return import('@/lib/env');
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe('publicEnv with runtime settings', () => {
  it('prefers what the server injected over what the build inlined', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stale.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'b'.repeat(40);

    (globalThis as { window?: unknown }).window = {
      __AMRYN_ENV__: {
        NEXT_PUBLIC_SUPABASE_URL: URL_VALUE,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: KEY_VALUE,
        NEXT_PUBLIC_SITE_URL: 'https://amryn.up.railway.app',
      },
    };

    const { publicEnv } = await freshEnv();
    const env = publicEnv();
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe(URL_VALUE);
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe(KEY_VALUE);
    expect(env.NEXT_PUBLIC_SITE_URL).toBe('https://amryn.up.railway.app');
  });

  // The whole point: an image built with nothing set still works, because the
  // browser is told at request time.
  it('works when the build had nothing and only the runtime does', async () => {
    (globalThis as { window?: unknown }).window = {
      __AMRYN_ENV__: {
        NEXT_PUBLIC_SUPABASE_URL: URL_VALUE,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: KEY_VALUE,
      },
    };

    const { publicEnv } = await freshEnv();
    expect(publicEnv().NEXT_PUBLIC_SUPABASE_URL).toBe(URL_VALUE);
  });

  // And a deployment that does bake them in is left exactly as it was.
  it('falls back to the build values when nothing was injected', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_VALUE;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = KEY_VALUE;
    (globalThis as { window?: unknown }).window = {};

    const { publicEnv } = await freshEnv();
    expect(publicEnv().NEXT_PUBLIC_SUPABASE_URL).toBe(URL_VALUE);
  });

  it('ignores a blank injected value rather than treating it as a setting', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_VALUE;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = KEY_VALUE;
    (globalThis as { window?: unknown }).window = {
      __AMRYN_ENV__: { NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: '' },
    };

    const { publicEnv } = await freshEnv();
    expect(publicEnv().NEXT_PUBLIC_SUPABASE_URL).toBe(URL_VALUE);
  });

  it('is inert on the server, where process.env is read live anyway', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_VALUE;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = KEY_VALUE;

    const { publicEnv } = await freshEnv();
    expect(publicEnv().NEXT_PUBLIC_SUPABASE_URL).toBe(URL_VALUE);
  });
});
