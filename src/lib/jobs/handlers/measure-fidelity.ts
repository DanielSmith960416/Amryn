import { MONTHS_REQUIRED, measureFidelity } from '@/features/twin/fidelity';
import type { MonthPoint } from '@/features/twin/fidelity';
import type { JobHandler } from '../types';

/**
 * Checks how wrong this business's Twin has been, and records the answer.
 *
 * The verdict itself is computed in features/twin/fidelity.ts, which has no
 * database and no clock of its own. This file is the part that cannot be
 * tested that way: it reads the rows, hands them over, and writes what comes
 * back. Everything worth arguing about lives next door.
 *
 * ── the answer is usually "not yet", and that is the point ────────────────
 *
 * Most businesses on this platform will not have six unbroken months of
 * complete history for a long time, so `not_measurable` is the ordinary
 * outcome rather than the error case. It is written down like any other
 * result, with a reason a person can act on, because a Twin that has never
 * been checked and a Twin nobody has got round to checking look identical
 * from the outside — and the database's licensing rule means the first of
 * those silently blocks every simulated figure in the product.
 */
export const measureTwinFidelity: JobHandler = {
  kind: 'twin.measure_fidelity',
  description: 'Scores the Twin against months held out of its fitting, or records why it cannot.',
  leaseSeconds: 120,

  async run({ job, query, log }) {
    if (!job.organisationId) {
      throw new Error('twin.measure_fidelity is tenant work and was queued without an organisation');
    }

    /*
     * Income by calendar month, in the organisation's own rows.
     *
     * Income rather than net: the Twin's first job is to model what the
     * business takes, and mixing expenses in would score the model on two
     * behaviours at once without saying which one it got wrong.
     *
     * Grouped in SQL rather than in Node because the alternative is pulling
     * every financial record across the wire to add them up, and this table is
     * the one that grows fastest.
     */
    const rows = await query<{ month: string; value_cents: string }>(
      `select to_char(date_trunc('month', occurred_on), 'YYYY-MM') as month,
              sum(amount_cents)::text                              as value_cents
         from public.financial_records
        where organisation_id = $1 and direction = 'income'
        group by 1
        order by 1`,
      [job.organisationId],
    );

    // bigint arrives as a string from pg, deliberately — it does not always fit
    // a double. These are monthly totals in cents, which do, and Number() is
    // where that assumption is made rather than left implicit.
    const points: MonthPoint[] = rows.map((row) => ({
      month: row.month,
      valueCents: Number(row.value_cents),
    }));

    const verdict = measureFidelity(points, new Date());

    const inserted = await query<{ id: string }>(
      `insert into public.twin_fidelity
         (organisation_id, status, months_available, months_required,
          score, metric, method, error_pct, sample_size, reason)
       values ($1, $2::public.fidelity_status, $3, $4, $5, $6, $7, $8, $9, $10)
       returning id`,
      [
        job.organisationId,
        verdict.status,
        verdict.monthsAvailable,
        verdict.monthsRequired,
        verdict.score,
        verdict.metric,
        verdict.method,
        verdict.errorPct,
        verdict.sampleSize,
        verdict.reason,
      ],
    );

    log(
      verdict.status === 'measured'
        ? `fidelity ${verdict.score}/100 (sMAPE ${verdict.errorPct}% on ${verdict.sampleSize} held-out months, ${verdict.monthsAvailable} available)`
        : `not measurable: ${verdict.monthsAvailable}/${MONTHS_REQUIRED} months — ${verdict.reason}`,
    );

    return {
      fidelityId: inserted[0]?.id ?? null,
      status: verdict.status,
      score: verdict.score,
      monthsAvailable: verdict.monthsAvailable,
      errorPct: verdict.errorPct,
    };
  },
};
