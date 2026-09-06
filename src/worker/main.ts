/**
 * The worker.
 *
 * A plain Node process that claims jobs from PostgreSQL and runs them. It is
 * the same repository and the same image as the web server, started with a
 * different command — so a handler shares the engines, the types and the
 * vocabulary with the pages that render what it produced, and cannot drift
 * from them the way a separate service would.
 *
 * ── what it does not have ─────────────────────────────────────────────────
 * No HTTP server, no session, no cookies, no request. It authenticates as the
 * database owner over a direct connection, which is why every handler is
 * responsible for its own tenancy: row level security is not standing behind
 * it here. src/lib/jobs/types.ts says so where a handler author will read it.
 *
 * ── running more than one ─────────────────────────────────────────────────
 * Safe, and the reason the claim is a single statement with `skip locked`.
 * Two workers never take the same row, and a worker that dies has its jobs
 * returned by the lease rather than by anything having to notice it is gone.
 */
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { JobQueue } from '@/lib/jobs/queue';
import { retryDelaySeconds } from '@/lib/jobs/backoff';
import { handlerFor, registeredKinds } from '@/lib/jobs/registry';
import { PermanentJobError, type Job, type JobResult } from '@/lib/jobs/types';

/**
 * One pass and stop, rather than a loop.
 *
 * Not a test affordance: it is how you check a deployment actually reaches the
 * database and can claim — `railway run node dist/worker.mjs --once` either
 * drains the queue and says what it did, or fails and says why, without
 * leaving a process behind. It is also the shape to reach for if this ever
 * needs to be driven by something external rather than run continuously.
 */
const RUN_ONCE = process.argv.includes('--once') || process.env.JOBS_ONCE === '1';

const POLL_SECONDS = positiveNumber(process.env.JOBS_POLL_SECONDS, 5);
const CONCURRENCY = Math.max(1, Math.floor(positiveNumber(process.env.JOBS_CONCURRENCY, 1)));
/** How long to wait for work in flight when asked to stop. */
const SHUTDOWN_GRACE_SECONDS = positiveNumber(process.env.JOBS_SHUTDOWN_SECONDS, 30);

function positiveNumber(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Identifies this process in the lease and in every log line.
 *
 * Host and pid alone are not unique — a container that restarts on the same
 * host can reuse a pid, and two workers claiming under the same name would
 * each be able to extend the other's lease, which is the one thing the lease
 * exists to prevent.
 */
const WORKER_ID = `${hostname()}/${process.pid}/${randomUUID().slice(0, 8)}`;

function log(message: string): void {
  console.log(`[worker ${WORKER_ID}] ${message}`);
}

/** Never let a driver error quote the connection string back into the logs. */
function safeMessage(error: unknown, url: string): string {
  const raw = error instanceof Error ? error.message : String(error);
  return (url ? raw.split(url).join('the configured connection string') : raw).replace(
    /postgres(ql)?:\/\/[^\s]+/gi,
    'the configured connection string',
  );
}

/**
 * A function rather than a bare guard, so the rest of the file has a `string`
 * and not a `string | undefined` that every use has to re-check.
 */
function requireConnectionString(): string {
  const value = process.env.SUPABASE_DB_URL?.trim();
  if (value) return value;

  // Exit rather than idle. A worker that starts, finds no database and then
  // sits there logging politely is a worker the host reports as healthy while
  // nothing is being processed at all.
  console.error(
    'SUPABASE_DB_URL is not set. The worker needs the same connection string the ' +
      'migration runner uses — the session pooler string from Supabase → Settings → Database.',
  );
  process.exit(1);
}

const connectionString = requireConnectionString();

const pool = new pg.Pool({
  connectionString,
  ssl: /[?&]sslmode=disable(&|$)/.test(connectionString) ? false : { rejectUnauthorized: false },
  // Small on purpose. The worker's parallelism is CONCURRENCY, plus the
  // heartbeats and the claim; a large pool here would only make a queue of
  // long jobs hold connections a web dyno needs.
  max: CONCURRENCY + 2,
  connectionTimeoutMillis: 15_000,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (error) => {
  // An idle client dropped by the pooler. The pool replaces it; this exists so
  // the event has a listener, because an unhandled 'error' on a Pool takes the
  // process down.
  log(`pool: ${safeMessage(error, connectionString)}`);
});

const queue = new JobQueue(pool);

let stopping = false;
const inFlight = new Set<Promise<void>>();

async function runJob(job: Job): Promise<void> {
  const handler = handlerFor(job.kind);
  const prefix = `${job.kind} ${job.id.slice(0, 8)}`;

  if (!handler) {
    // Permanent by definition: no amount of retrying teaches this deployment a
    // handler it does not have. Loud, because the alternative is a job that
    // looks queued and healthy while nothing can ever run it.
    const message = `no handler registered for "${job.kind}". Known kinds: ${registeredKinds().join(', ')}`;
    log(`${prefix}: ${message}`);
    await queue.fail(job.id, message, null);
    return;
  }

  const controller = new AbortController();
  const started = Date.now();

  // A third of the lease. Long enough that a heartbeat is cheap, short enough
  // that two consecutive failures still leave time to renew before another
  // worker is entitled to the job.
  const heartbeat = setInterval(
    () => {
      void queue
        .heartbeat(job.id, WORKER_ID, handler.leaseSeconds)
        .then((held) => {
          if (!held && !controller.signal.aborted) {
            log(`${prefix}: lease lost to another worker — abandoning`);
            controller.abort(new Error('lease lost'));
          }
        })
        .catch((error) => log(`${prefix}: heartbeat failed — ${safeMessage(error, connectionString)}`));
    },
    Math.max(1000, (handler.leaseSeconds / 3) * 1000),
  );
  // Do not hold the event loop open on the heartbeat alone.
  heartbeat.unref();

  try {
    const result: JobResult = await handler.run({
      job,
      query: async <T,>(sql: string, values?: readonly unknown[]) => {
        const { rows } = await pool.query<T extends object ? T : never>(sql, values ? [...values] : undefined);
        return rows as T[];
      },
      keepAlive: () => queue.heartbeat(job.id, WORKER_ID, handler.leaseSeconds),
      signal: controller.signal,
      log: (message: string) => log(`${prefix}: ${message}`),
    });

    // The lease may have lapsed while the handler ran. complete_job refuses a
    // job that is not running, so the worker that took over keeps its own
    // outcome and this one's is discarded rather than overwriting it.
    await queue.complete(job.id, result);
    log(`${prefix}: done in ${Date.now() - started}ms`);
  } catch (error) {
    const message = safeMessage(error, connectionString);
    const permanent = error instanceof PermanentJobError;
    const delay = permanent ? null : retryDelaySeconds(job.attempts);

    log(
      permanent
        ? `${prefix}: failed permanently — ${message}`
        : `${prefix}: failed (attempt ${job.attempts} of ${job.maxAttempts}) — ${message}`,
    );

    try {
      await queue.fail(job.id, message, delay);
    } catch (failure) {
      // Losing the ability to record the failure is not the same as the job
      // succeeding: the lease will lapse and it will be tried again.
      log(`${prefix}: could not record the failure — ${safeMessage(failure, connectionString)}`);
    }
  } finally {
    clearInterval(heartbeat);
  }
}

async function tick(): Promise<void> {
  await queue.enqueueDue();

  const capacity = CONCURRENCY - inFlight.size;
  if (capacity <= 0) return;

  // The lease asked for at claim time is the longest any handler might need.
  // Each job's own heartbeat narrows it to that handler's figure immediately
  // afterwards; claiming at the maximum only means a crash in the first
  // seconds is recovered a little later.
  const claimed = await queue.claim(WORKER_ID, capacity, 300);

  for (const job of claimed) {
    const promise = runJob(job).finally(() => inFlight.delete(promise));
    inFlight.add(promise);
  }
}

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, seconds * 1000);
    timer.unref();
  });
}

async function main(): Promise<void> {
  log(
    RUN_ONCE
      ? `starting — one pass, ${CONCURRENCY} at a time`
      : `starting — ${CONCURRENCY} at a time, polling every ${POLL_SECONDS}s`,
  );
  log(`handlers: ${registeredKinds().join(', ')}`);

  if (RUN_ONCE) {
    // Not wrapped: a single pass that cannot reach the database should exit
    // non-zero, because something is waiting to hear whether it worked.
    await tick();
    stopping = true;
  }

  while (!stopping) {
    try {
      await tick();
    } catch (error) {
      // A failure to reach the database must not end the process: the host
      // would restart it into the same outage, and a crash loop is harder to
      // read than a worker saying the same thing once every few seconds.
      log(`tick failed — ${safeMessage(error, connectionString)}`);
    }
    await sleep(POLL_SECONDS);
  }

  if (inFlight.size > 0) {
    if (RUN_ONCE) {
      // A single pass is finished when the work it claimed is finished. There
      // is nothing to be gained by abandoning it to the lease.
      log(`finishing ${inFlight.size} job(s)`);
      await Promise.allSettled([...inFlight]);
    } else {
      log(`stopping — waiting up to ${SHUTDOWN_GRACE_SECONDS}s for ${inFlight.size} job(s)`);
      await Promise.race([Promise.allSettled([...inFlight]), sleep(SHUTDOWN_GRACE_SECONDS)]);
    }
  }

  // Anything still running when the grace expires keeps its lease, which
  // lapses shortly after this process is gone. Its job returns to the queue
  // and is tried again — which is why every handler has to tolerate being run
  // twice, and why that is stated in types.ts rather than assumed.
  await pool.end().catch(() => {});
  log('stopped');
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (stopping) {
      log(`${signal} again — exiting now`);
      process.exit(1);
    }
    log(`${signal} — finishing what is in flight`);
    stopping = true;
  });
}

main().catch((error) => {
  console.error(`[worker ${WORKER_ID}] fatal: ${safeMessage(error, connectionString)}`);
  process.exit(1);
});
