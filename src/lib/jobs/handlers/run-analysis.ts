import type { JobHandler } from '../types';

/**
 * Reads one business, once, properly.
 *
 * Everything the platform showed before this ran inside the request that
 * rendered it — a health score over twelve rows, a trend over a year of
 * orders. That is right for a number a page can produce in forty
 * milliseconds. It is not the thing being sold, which is a considered reading
 * of a whole business, and a considered reading does not fit in an HTTP
 * request.
 *
 * ── what this may and may not say ─────────────────────────────────────────
 *
 * Every figure here is arithmetic on a number the business itself gave us in
 * the Imprint. Nothing is estimated from a sector average, a comparable, or
 * anything a model remembers, because there is no honest way to do that and
 * the dishonest way is indistinguishable from the honest one after the fact.
 *
 * So the analysis is narrower than it could be and every number in it can be
 * traced to an answer somebody typed. What it cannot compute, it records as a
 * gap — which is the whole reason analysis_runs.gaps exists. "We did not have
 * it" and "it did not matter" produce the same silence otherwise, and a reader
 * assumes the second.
 *
 * ── the gate is read, not recomputed ──────────────────────────────────────
 *
 * is_provisional and expansion_suppressed are read off the run row, where
 * complete_imprint froze them at the Quality Score as it stood. Recomputing
 * them here would let a score that moved overnight change the standing of
 * findings produced under the old one.
 *
 * ── row level security is not standing behind this ────────────────────────
 *
 * The worker holds a direct connection as the owner. Every statement below
 * filters on the job's organisation explicitly, and the ones that write are
 * the ones to read carefully.
 */

/** Below this, the platform marks its findings provisional. Frozen per run. */
const PROVISIONAL_BELOW = 70;

/**
 * A share of revenue in one customer above which concentration is worth
 * saying out loud.
 *
 * 25% is a judgement, not a discovery. It is the point at which losing one
 * account stops being a bad quarter and starts being a solvency question for a
 * business of the size this platform serves. Named here rather than buried in
 * a comparison so that changing it is a decision somebody makes on purpose.
 */
const CONCENTRATION_THRESHOLD = 25;

interface RunRow {
  id: string;
  organisation_id: string;
  status: string;
  is_provisional: boolean;
  expansion_suppressed: boolean;
  quality_score: number | null;
}

/**
 * One layer as the Imprint stores it: a state, the answers as an object keyed
 * by field name, and the fields the customer was asked and left blank.
 */
interface LayerRow {
  layer: string;
  state: string;
  answers: Record<string, unknown> | null;
  gaps: string[] | null;
}

/**
 * The answers from every layer, flattened to field name against what was
 * typed.
 *
 * Field names are unique across all eight layers — the form renders from one
 * declaration, so two layers cannot own the same name — which is what makes
 * flattening safe rather than lossy.
 */
export function answersFrom(rows: readonly LayerRow[]): Map<string, string> {
  const flat = new Map<string, string>();
  for (const row of rows) {
    if (row.state === 'skipped') continue;
    for (const [field, value] of Object.entries(row.answers ?? {})) {
      if (value === null || value === undefined) continue;
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      if (text.trim() !== '') flat.set(field, text);
    }
  }
  return flat;
}

/** A figure the business stated, as a number, or null if it never stated one. */
function stated(answers: Map<string, string>, field: string): number | null {
  const raw = answers.get(field);
  if (raw === undefined || raw === null || raw.trim() === '') return null;
  // Tolerant of how people type money: "1 200 000", "1,200,000", "R1200000".
  const cleaned = raw.replace(/[Rr\s,]/g, '');
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

interface Finding {
  headline: string;
  narrative: string;
  category: 'financial' | 'operational' | 'sales' | 'growth' | 'customer' | 'strategic';
  direction: 'up' | 'down' | 'flat';
  provenance: 'fact' | 'derived' | 'estimated' | 'simulated';
  impactCents: number | null;
  /** Set only alongside impactCents, and only for estimated or simulated. */
  interval: { p10: number; p50: number; p90: number } | null;
  /** Findings about growing into something new. Dropped when the gate is on. */
  isExpansion: boolean;
  evidence: string[];
}

/**
 * What the Imprint alone supports saying.
 *
 * Exported so it can be tested without a database, a queue or a model. This is
 * the part where being wrong matters most and where a test is cheapest.
 */
export function findingsFrom(answers: Map<string, string>): { findings: Finding[]; gaps: string[] } {
  const findings: Finding[] = [];
  const gaps: string[] = [];

  const revenue = stated(answers, 'annualRevenue');
  const share = stated(answers, 'biggestCustomerShare');
  const grossMargin = stated(answers, 'grossMarginTarget');
  const fixedCosts = stated(answers, 'monthlyFixedCosts');
  const target = stated(answers, 'revenueTargetAnnual');

  // ── concentration ───────────────────────────────────────────────────────
  if (share === null) {
    gaps.push('biggestCustomerShare');
  } else if (share >= CONCENTRATION_THRESHOLD) {
    // Exact arithmetic on two stated figures. Derived rather than estimated,
    // and therefore carries no interval: there is nothing uncertain about
    // multiplying one number the business gave us by another.
    const atRisk = revenue === null ? null : Math.round(revenue * (share / 100) * 100);
    if (revenue === null) gaps.push('annualRevenue');

    findings.push({
      headline: `${share}% of revenue rests on one customer`,
      narrative:
        atRisk === null
          ? `You told us your largest customer is ${share}% of revenue. What that is worth in rand needs last year's revenue, which the Imprint does not have yet.`
          : `Your largest customer is ${share}% of revenue. On last year's figures that is the amount above, and it leaves with them.`,
      category: 'customer',
      direction: 'flat',
      provenance: atRisk === null ? 'fact' : 'derived',
      impactCents: atRisk,
      interval: null,
      isExpansion: false,
      evidence: revenue === null ? ['imprint:biggestCustomerShare'] : ['imprint:biggestCustomerShare', 'imprint:annualRevenue'],
    });
  }

  // ── the gap between gross margin and what fixed costs consume ───────────
  if (grossMargin === null) gaps.push('grossMarginTarget');
  if (fixedCosts === null) gaps.push('monthlyFixedCosts');

  if (revenue !== null && grossMargin !== null && fixedCosts !== null) {
    const grossProfit = revenue * (grossMargin / 100);
    const annualFixed = fixedCosts * 12;
    const remaining = Math.round((grossProfit - annualFixed) * 100);

    findings.push({
      headline: remaining >= 0 ? 'Fixed costs are covered by gross profit' : 'Fixed costs exceed gross profit',
      narrative:
        remaining >= 0
          ? 'Gross profit at your stated margin covers a year of fixed costs, and the figure above is what is left before everything else.'
          : 'A year of fixed costs is more than gross profit at your stated margin. The figure above is the shortfall, and it has to come from somewhere.',
      category: 'financial',
      direction: remaining >= 0 ? 'up' : 'down',
      provenance: 'derived',
      impactCents: remaining,
      interval: null,
      isExpansion: false,
      evidence: ['imprint:annualRevenue', 'imprint:grossMarginTarget', 'imprint:monthlyFixedCosts'],
    });
  }

  // ── the growth the target implies ───────────────────────────────────────
  if (target === null) {
    gaps.push('revenueTargetAnnual');
  } else if (revenue !== null && revenue > 0) {
    const growth = Math.round(((target - revenue) / revenue) * 1000) / 10;
    findings.push({
      headline: `Your target implies ${growth}% growth`,
      narrative: `Last year against the target you have set is the difference above. Whether that is ambitious or comfortable depends on what changes, which is what the rest of this is for.`,
      category: 'growth',
      direction: growth > 0 ? 'up' : growth < 0 ? 'down' : 'flat',
      provenance: 'derived',
      impactCents: Math.round((target - revenue) * 100),
      interval: null,
      // Growing revenue is not expansion. Expansion is new sites, new
      // segments, new territory — the things the platform declines to discuss
      // when it cannot see the business clearly enough.
      isExpansion: false,
      evidence: ['imprint:annualRevenue', 'imprint:revenueTargetAnnual'],
    });
  }

  return { findings, gaps };
}

export const runAnalysis: JobHandler = {
  kind: 'analysis.run',
  description: 'Reads a business from its Imprint and writes what the answers support.',
  // The brief allows five to twenty minutes. The lease is shorter than that on
  // purpose: it is renewed by heartbeat, so a live run keeps it indefinitely
  // while a dead worker gives the job back in five minutes rather than twenty.
  leaseSeconds: 300,

  async run({ job, query, keepAlive, log }) {
    const runId = job.payload.analysis_run_id;
    if (typeof runId !== 'string') {
      throw new Error('analysis.run was queued without an analysis_run_id in its payload');
    }
    if (!job.organisationId) {
      throw new Error('analysis.run is tenant work and was queued without an organisation');
    }

    // Both filters, deliberately. The id alone would be enough if the payload
    // could be trusted, and the payload is written by a database function
    // today and by something else eventually.
    const runs = await query<RunRow>(
      `select id, organisation_id, status, is_provisional, expansion_suppressed, quality_score
         from public.analysis_runs
        where id = $1 and organisation_id = $2`,
      [runId, job.organisationId],
    );

    const run = runs[0];
    if (!run) throw new Error(`no analysis run ${runId} for this organisation`);

    // A retry after the work finished must not write everything twice.
    if (run.status === 'succeeded' || run.status === 'superseded') {
      log(`run ${runId} is already ${run.status}; nothing to do`);
      return { skipped: run.status };
    }

    await query(
      `update public.analysis_runs
          set status = 'running', started_at = coalesce(started_at, now())
        where id = $1`,
      [runId],
    );

    const startedAt = Date.now();

    try {
      const rows = await query<LayerRow>(
        `select layer::text as layer, state::text as state, answers, gaps
           from public.imprint_layers
          where organisation_id = $1`,
        [job.organisationId],
      );

      if (!(await keepAlive())) {
        log('lease lapsed while reading the Imprint; another worker has it');
        return { abandoned: true };
      }

      const answers = answersFrom(rows);
      const { findings, gaps: unanswered } = findingsFrom(answers);

      // What the customer was asked and left blank, as the Imprint recorded it,
      // plus what this analysis wanted and did not find. The two overlap and
      // are not the same: a field can be blank without any finding needing it.
      const declared = rows.flatMap((row) => row.gaps ?? []);
      const gaps = [...new Set([...declared, ...unanswered])].sort();

      // The gate, as it was frozen — not as the score reads now.
      const admitted = run.expansion_suppressed ? findings.filter((f) => !f.isExpansion) : findings;
      const suppressed = findings.length - admitted.length;

      let written = 0;
      for (const finding of admitted) {
        await query(
          `insert into public.business_insights
             (organisation_id, headline, narrative, category, direction,
              impact_cents, provenance,
              impact_p10_cents, impact_p50_cents, impact_p90_cents,
              evidence, generated_by, analysis_run_id, is_provisional)
           values ($1,$2,$3,$4::public.health_category,$5::public.trend_direction,
                   $6,$7::public.provenance,$8,$9,$10,
                   $11::jsonb,'engine',$12,$13)`,
          [
            job.organisationId,
            finding.headline,
            finding.narrative,
            finding.category,
            finding.direction,
            finding.impactCents,
            finding.provenance,
            finding.interval?.p10 ?? null,
            finding.interval?.p50 ?? null,
            finding.interval?.p90 ?? null,
            JSON.stringify(finding.evidence),
            runId,
            run.is_provisional,
          ],
        );
        written += 1;
      }

      await query(
        `update public.analysis_runs
            set status = 'succeeded',
                finished_at = now(),
                duration_ms = $2,
                insight_count = $3,
                gaps = $4::jsonb
          where id = $1`,
        [runId, Date.now() - startedAt, written, JSON.stringify(gaps)],
      );

      log(
        `wrote ${written} insight${written === 1 ? '' : 's'}` +
          `${suppressed ? `, suppressed ${suppressed} about expansion` : ''}` +
          `${gaps.length ? `, ${gaps.length} gap${gaps.length === 1 ? '' : 's'}` : ''}` +
          `${run.is_provisional ? ', all provisional' : ''}`,
      );

      return {
        insights: written,
        suppressed,
        gaps,
        provisional: run.is_provisional,
        qualityScore: run.quality_score,
      };
    } catch (error) {
      // The run says why it failed, because a failed run with a null error is
      // one nobody can act on — and the constraint refuses it anyway.
      const message = error instanceof Error ? error.message : String(error);
      await query(
        `update public.analysis_runs
            set status = 'failed', finished_at = now(), duration_ms = $2, error = $3
          where id = $1`,
        [runId, Date.now() - startedAt, message.slice(0, 2000)],
      );
      throw error;
    }
  },
};

export { PROVISIONAL_BELOW, CONCENTRATION_THRESHOLD };
