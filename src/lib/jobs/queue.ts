/**
 * The queue, over a direct PostgreSQL connection.
 *
 * Every statement here is a call to a function in the `amryn` schema rather
 * than SQL against the table. That is not ceremony: the rules about attempts,
 * leases and what may be claimed are conditions the database has to enforce
 * atomically, and a client that assembled its own UPDATE would be a second
 * implementation of them, free to drift. The one exception is enqueueing,
 * which is a plain INSERT because the deduplication it relies on is an index.
 *
 * Connects as the database owner, which holds BYPASSRLS on Supabase. That is
 * what lets the worker touch a table with no write policy at all — asserted in
 * supabase/tests/17, because the failure mode if it ever stopped being true is
 * a queue that claims nothing, silently.
 */
import type { Pool } from 'pg';
import { dueJobs, type DueJob } from './schedule';
import type { Job } from './types';

interface JobRow {
  id: string;
  organisation_id: string | null;
  kind: string;
  payload: Record<string, unknown> | null;
  attempts: number;
  max_attempts: number;
}

function toJob(row: JobRow): Job {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    kind: row.kind,
    payload: row.payload ?? {},
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
  };
}

export class JobQueue {
  constructor(private readonly pool: Pool) {}

  /**
   * Puts the current slot of every schedule on the queue.
   *
   * Unconditional, and idempotent because of the unique index rather than
   * because of a check. Asking "has this slot been enqueued?" before inserting
   * would be a read that two workers can both answer "no" to in the same
   * millisecond; letting the index refuse the second insert cannot go wrong
   * that way.
   *
   * The partial index has to be named in the conflict target — its predicate
   * is part of its identity, and without it PostgreSQL cannot tell which index
   * is meant to arbitrate.
   */
  async enqueueDue(now: Date = new Date()): Promise<number> {
    const due = dueJobs(now);
    if (due.length === 0) return 0;

    let created = 0;
    for (const job of due) {
      created += await this.enqueueScheduled(job);
    }
    return created;
  }

  private async enqueueScheduled(job: DueJob): Promise<number> {
    const { rowCount } = await this.pool.query(
      `insert into public.job_runs (kind, payload, priority, run_at, dedupe_key)
       values ($1, $2::jsonb, $3, $4, $5)
       on conflict (dedupe_key) where dedupe_key is not null do nothing`,
      [job.kind, JSON.stringify(job.payload), job.priority, job.runAt, job.dedupeKey],
    );
    return rowCount ?? 0;
  }

  async claim(workerId: string, limit: number, leaseSeconds: number): Promise<Job[]> {
    const { rows } = await this.pool.query<JobRow>(
      'select * from amryn.claim_jobs($1, $2, make_interval(secs => $3))',
      [workerId, limit, leaseSeconds],
    );
    return rows.map(toJob);
  }

  /** False means another worker has taken the job over and this one must stop. */
  async heartbeat(id: string, workerId: string, leaseSeconds: number): Promise<boolean> {
    const { rows } = await this.pool.query<{ heartbeat_job: boolean }>(
      'select amryn.heartbeat_job($1, $2, make_interval(secs => $3))',
      [id, workerId, leaseSeconds],
    );
    return rows[0]?.heartbeat_job === true;
  }

  async complete(id: string, result: Record<string, unknown>): Promise<void> {
    await this.pool.query('select amryn.complete_job($1, $2::jsonb)', [id, JSON.stringify(result)]);
  }

  /**
   * A null delay means give up now — the caller has established that trying
   * again cannot help. Anything else is a request, not an instruction: the
   * database still refuses to requeue a job that has used its attempts.
   */
  async fail(id: string, message: string, retryInSeconds: number | null): Promise<void> {
    await this.pool.query(
      'select amryn.fail_job($1, $2, case when $3::numeric is null then null else make_interval(secs => $3::numeric) end)',
      [id, message.slice(0, 4000), retryInSeconds],
    );
  }
}
