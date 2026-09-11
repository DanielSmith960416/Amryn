import { describe, expect, it } from 'vitest';
import { BUCKET, storageSettings, uploadDump } from './backup-storage.mjs';

function withEnv(values, run) {
  const saved = { ...process.env };
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return run();
  } finally {
    process.env = saved;
  }
}

describe('storage settings', () => {
  it('needs both, and reports nothing rather than half of one', () => {
    // Half-configured is the state that produces a confident upload to
    // nowhere. It reads as absent, so the caller refuses instead.
    const both = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
    expect(withEnv(both, storageSettings)).toEqual({ url: 'https://x.supabase.co', key: 'k' });
    expect(withEnv({ ...both, SUPABASE_SERVICE_ROLE_KEY: '' }, storageSettings)).toBeNull();
    expect(withEnv({ ...both, SUPABASE_URL: '  ' }, storageSettings)).toBeNull();
  });

  it('falls back to the browser-facing address, which names the same project', () => {
    expect(
      withEnv(
        {
          SUPABASE_URL: undefined,
          NEXT_PUBLIC_SUPABASE_URL: 'https://y.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'k',
        },
        storageSettings,
      ),
    ).toEqual({ url: 'https://y.supabase.co', key: 'k' });
  });

  it('trims a trailing slash, so the path is not doubled', () => {
    expect(
      withEnv(
        { SUPABASE_URL: 'https://x.supabase.co///', SUPABASE_SERVICE_ROLE_KEY: 'k' },
        storageSettings,
      ).url,
    ).toBe('https://x.supabase.co');
  });
});

describe('uploading a dump', () => {
  const settings = { url: 'https://x.supabase.co', key: 'secret' };

  it('posts the bytes to the bucket, authenticated, without overwriting', async () => {
    let seen;
    const original = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      seen = { url, init };
      return { ok: true, status: 200 };
    };

    try {
      const where = await uploadDump('-- dump', 'amryn-abc-2026.sql', settings);
      expect(where).toBe(`${BUCKET}/amryn-abc-2026.sql`);
      expect(seen.url).toContain(`/storage/v1/object/${BUCKET}/`);
      expect(seen.init.headers.Authorization).toBe('Bearer secret');
      // Never replace an existing object. Two dumps at one instant is a
      // collision worth failing on, not a file worth overwriting.
      expect(seen.init.headers['x-upsert']).toBe('false');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('names the missing bucket rather than reporting a bare 404', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, status: 404, text: async () => '' });

    try {
      await expect(uploadDump('-- dump', 'x.sql', settings)).rejects.toThrow(/migration 41/);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('passes on what storage said when it refused for another reason', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, status: 403, text: async () => 'row-level security' });

    try {
      await expect(uploadDump('-- dump', 'x.sql', settings)).rejects.toThrow(/403.*row-level/s);
    } finally {
      globalThis.fetch = original;
    }
  });
});
