import { describe, expect, it, vi } from 'vitest';
import { createTtlCache } from './ttl';

/** A clock the test moves, so expiry is asserted rather than waited for. */
function clock(start = 1_000) {
  let at = start;
  return { now: () => at, advance: (ms: number) => (at += ms) };
}

describe('createTtlCache', () => {
  it('loads once and reuses the answer inside the window', async () => {
    const load = vi.fn().mockResolvedValue('beat');
    const c = clock();
    const cache = createTtlCache(load, 30_000, c.now);

    expect(await cache.read()).toBe('beat');
    expect(await cache.read()).toBe('beat');
    c.advance(29_999);
    expect(await cache.read()).toBe('beat');

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('loads again once the window has passed', async () => {
    const load = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');
    const c = clock();
    const cache = createTtlCache(load, 30_000, c.now);

    expect(await cache.read()).toBe('first');
    c.advance(30_001);
    expect(await cache.read()).toBe('second');
    expect(load).toHaveBeenCalledTimes(2);
  });

  /*
   * The property this exists for. A burst arriving on a cold cache must not
   * each open their own connection — that is the stampede the cache is here to
   * prevent, at the moment the database is least able to absorb one.
   */
  it('makes one call when twenty arrive together on a cold cache', async () => {
    let release!: (value: string) => void;
    const load = vi.fn(() => new Promise<string>((resolve) => (release = resolve)));
    const cache = createTtlCache(load, 30_000, clock().now);

    const waiting = Promise.all(Array.from({ length: 20 }, () => cache.read()));
    release('beat');

    expect(await waiting).toEqual(Array(20).fill('beat'));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not wedge on a rejection — the next read tries again', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce('beat');
    const cache = createTtlCache(load, 30_000, clock().now);

    await expect(cache.read()).rejects.toThrow('connection refused');
    expect(await cache.read()).toBe('beat');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('rejects every caller of a failed single flight, not just the first', async () => {
    const load = vi.fn().mockRejectedValue(new Error('down'));
    const cache = createTtlCache(load, 30_000, clock().now);

    const results = await Promise.allSettled([cache.read(), cache.read(), cache.read()]);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('forgets on request, so a known change is not waited out', async () => {
    const load = vi.fn().mockResolvedValueOnce('before').mockResolvedValueOnce('after');
    const cache = createTtlCache(load, 30_000, clock().now);

    expect(await cache.read()).toBe('before');
    cache.forget();
    expect(await cache.read()).toBe('after');
  });

  /* A resolved failure is an answer, and is cached like any other. */
  it('caches a value that represents a failure, rather than retrying it every time', async () => {
    const load = vi.fn().mockResolvedValue({ beat: null, problem: 'connection refused' });
    const cache = createTtlCache(load, 30_000, clock().now);

    await cache.read();
    await cache.read();
    await cache.read();
    expect(load).toHaveBeenCalledTimes(1);
  });
});
