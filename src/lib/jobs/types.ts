/**
 * What a job is, and what a handler is given.
 *
 * Deliberately free of Next, Supabase and `server-only`. This module is
 * bundled into the worker, which is a plain Node process with no request, no
 * cookies and no session — anything that reaches for those would compile and
 * then fail at three in the morning with nobody watching.
 */

/** One row of public.job_runs, as a handler sees it. */
export interface Job {
  id: string;
  /** Null for platform housekeeping; set for a tenant's own work. */
  organisationId: string | null;
  kind: string;
  payload: Record<string, unknown>;
  /** Including this one. First run is 1, not 0. */
  attempts: number;
  maxAttempts: number;
}

/** Whatever the handler wants recorded against the run. Kept as jsonb. */
export type JobResult = Record<string, unknown>;

export interface JobContext {
  job: Job;

  /**
   * A query on the worker's own connection, as the database owner.
   *
   * The worker does not go through PostgREST and carries no session, so row
   * level security is not what protects a tenant here — the handler is. A
   * handler that touches organisation data must filter by `job.organisationId`
   * itself, and the ones that do are the ones to read carefully.
   */
  query<T = Record<string, unknown>>(sql: string, values?: readonly unknown[]): Promise<T[]>;

  /**
   * Extends the lease, and reports whether this worker still holds the job.
   *
   * False means the lease lapsed and another worker has taken over. A long
   * handler should check it periodically and stop: two workers finishing the
   * same job is how one of them writes a result derived from a state the other
   * has already changed.
   */
  keepAlive(): Promise<boolean>;

  /** Aborted when the process is shutting down. */
  signal: AbortSignal;

  /** Prefixed with the job id, so interleaved runs stay readable. */
  log(message: string): void;
}

export interface JobHandler {
  kind: string;
  /** One line, for the operator reading a queue they did not build. */
  description: string;
  /**
   * How long a single run may go without a heartbeat before another worker is
   * entitled to take the job. Not a timeout on the work: the worker renews the
   * lease while it runs. It is the window in which a killed worker's job stays
   * stuck.
   */
  leaseSeconds: number;
  run(context: JobContext): Promise<JobResult>;
}

/**
 * Thrown by a handler that has established retrying cannot help — a payload
 * that will never parse, a row that no longer exists.
 *
 * The distinction matters because the default is to retry: a transient failure
 * is by far the more common one, and treating everything as permanent would
 * lose work to a momentary network fault. This is how a handler says the
 * opposite, and the queue gives up on the first attempt rather than the third.
 */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentJobError';
  }
}
