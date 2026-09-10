/**
 * One reading, reused for a while, fetched once however many ask at once.
 *
 * Built for /api/health, which is polled by anything that can reach it and
 * whose worker check opens a direct database connection. A connection per
 * anonymous request would exhaust the pooler and cause the outage the endpoint
 * exists to report — so that check used to be switched off for anonymous
 * callers entirely, which is why "/api/health said ok" all through the evening
 * the worker was dead.
 *
 * No `server-only` here so the behaviour can be tested. The thing it guards is
 * a database connection, and a cache whose expiry and single-flight nobody has
 * exercised is a cache you find out about under load.
 */

export interface TtlCache<T> {
  read(): Promise<T>;
  /** Test seam, and the way to force a fresh reading after a known change. */
  forget(): void;
}

/**
 * @param load  Fetches a fresh value. Its rejections are not cached — see below.
 * @param ttlMs How long a value is reused.
 * @param now   Injectable clock, so expiry is tested rather than waited for.
 */
export function createTtlCache<T>(
  load: () => Promise<T>,
  ttlMs: number,
  now: () => number = Date.now,
): TtlCache<T> {
  let entry: { at: number; value: T } | null = null;
  let inFlight: Promise<T> | null = null;

  return {
    async read(): Promise<T> {
      if (entry && now() - entry.at < ttlMs) return entry.value;

      /*
       * The single flight matters as much as the expiry.
       *
       * Without it a burst arriving on a cold cache each starts its own load
       * before the first has finished — the precise stampede the cache exists
       * to prevent, at the precise moment the thing behind it is least able to
       * absorb one.
       */
      if (inFlight) return inFlight;

      inFlight = load()
        .then((value) => {
          entry = { at: now(), value };
          return value;
        })
        .finally(() => {
          /*
           * Cleared on failure as well as success, so a rejection does not
           * wedge the cache into returning the same rejected promise for ever.
           * The rejection itself is deliberately not stored: a caller that
           * wants failures remembered should resolve with one, as
           * readWorkerHeartbeat does, rather than throw.
           */
          inFlight = null;
        });

      return inFlight;
    },

    forget(): void {
      entry = null;
      inFlight = null;
    },
  };
}
