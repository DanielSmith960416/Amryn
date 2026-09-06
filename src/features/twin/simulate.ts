/**
 * The Digital Twin: a daily, agent-based model of a business, run many times.
 *
 * Pure. No database, no clock, no model call, and — importantly — no
 * `Math.random`. Everything here is a function of its arguments, including the
 * randomness, which is the only way a simulation can be argued with after the
 * fact.
 *
 * ── where the numbers come from ───────────────────────────────────────────
 *
 * Every level in this model is arithmetic on a figure the business itself
 * stated in its Imprint. Nothing is drawn from a sector average, a comparable,
 * or anything a model remembers.
 *
 * The one that matters most is order frequency, because it is the parameter a
 * simulation is most tempted to invent. It is not assumed here: it is derived.
 * A business that told us its revenue, its customer count and its typical order
 * value has already told us how often its customers buy —
 *
 *     orders per year = annual revenue ÷ typical order value
 *
 * — and if any of those three is missing, this refuses rather than picks a
 * plausible number. That refusal is the whole difference between a model and a
 * story with error bars.
 *
 * ── what *is* assumed, named out loud ─────────────────────────────────────
 *
 * The shape of the randomness. Orders arrive independently day to day, and
 * order values vary around the stated average with a spread this file chooses.
 * Those are assumptions about *variation*, not about level, and they are the
 * reason the output is a range rather than a number. They are named in
 * ASSUMPTIONS below so a reader can disagree with them specifically rather
 * than with "the simulation" in general.
 */

/** The brief's floor. Fewer iterations is a sample, not a distribution. */
export const MIN_ITERATIONS = 500;

/**
 * What the model assumes about variation, as opposed to level.
 *
 * Returned with every result so a figure can be read alongside the beliefs
 * that produced it. A simulation whose assumptions are only in its source code
 * is one nobody can argue with.
 */
export const ASSUMPTIONS = [
  'Orders arrive independently from day to day; one good day does not make the next more likely.',
  'Order values vary around the stated average by about a third, and cannot be negative.',
  'The customer base neither grows nor shrinks over the horizon.',
  'Nothing outside the business changes — no new competitor, no lost supplier, no price move.',
] as const;

export interface TwinInputs {
  annualRevenueCents: number | null;
  customerCount: number | null;
  averageOrderCents: number | null;
  /** Share of customers who buy again, as a percentage. Optional. */
  repeatRatePct: number | null;
}

export interface TwinParameters {
  customers: number;
  averageOrderCents: number;
  /** Derived, never assumed: revenue ÷ order value. */
  ordersPerYear: number;
  repeatingShare: number;
}

export type Derivation =
  | { ok: true; parameters: TwinParameters }
  | { ok: false; missing: string[] };

/**
 * Turns what the business said into what the model needs, or says what it
 * cannot do without.
 *
 * Zero is treated as missing for revenue, customers and order value — not as a
 * business with no customers. A zero in any of them makes the derivation
 * degenerate (a division by zero, or a customer base with nothing to divide
 * among), and reporting "you have no customers" to somebody who simply skipped
 * the question is worse than reporting that the question was skipped.
 */
export function deriveParameters(inputs: TwinInputs): Derivation {
  const missing: string[] = [];
  if (!inputs.annualRevenueCents) missing.push('annualRevenue');
  if (!inputs.customerCount) missing.push('customerCount');
  if (!inputs.averageOrderCents) missing.push('averageOrderValue');
  if (missing.length > 0) return { ok: false, missing };

  const revenue = inputs.annualRevenueCents!;
  const customers = inputs.customerCount!;
  const averageOrderCents = inputs.averageOrderCents!;

  // The repeat rate shapes how orders spread across the customer base rather
  // than how many there are. Absent, everybody is treated alike — which is the
  // assumption that adds least, not the one that flatters most.
  const repeatingShare =
    inputs.repeatRatePct === null || inputs.repeatRatePct < 0
      ? 0
      : Math.min(100, inputs.repeatRatePct) / 100;

  return {
    ok: true,
    parameters: {
      customers,
      averageOrderCents,
      ordersPerYear: revenue / averageOrderCents,
      repeatingShare,
    },
  };
}

/**
 * A seeded generator, so a run can be repeated exactly.
 *
 * `Math.random` would make every run unreproducible, which for a figure a
 * customer may act on is disqualifying: a result nobody can regenerate is a
 * result nobody can check, and the first argument about a simulated number
 * would end with "well, it said something else this time".
 *
 * mulberry32 — small, fast, and good enough for a business model. It is not
 * cryptographic and nothing here needs it to be.
 */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A percentile of a sorted sample, by linear interpolation.
 *
 * Interpolated rather than nearest-rank because with 500 iterations the
 * nearest-rank P90 jumps between two neighbouring samples, and two runs of the
 * same scenario would report different figures for no reason a reader could
 * see.
 */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  if (sorted.length === 1) return sorted[0]!;

  const rank = (sorted.length - 1) * Math.min(1, Math.max(0, p));
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sorted[low]!;
  return sorted[low]! + (rank - low) * (sorted[high]! - sorted[low]!);
}

export interface SimulationRequest {
  days: number;
  iterations: number;
  seed: number;
  /** Multiplies the derived order rate. 1 is "carry on as you are". */
  demandMultiplier?: number;
  /** Multiplies the stated order value. */
  priceMultiplier?: number;
}

export interface SimulationOutcome {
  iterations: number;
  days: number;
  seed: number;
  revenueCents: { p10: number; p50: number; p90: number };
  ordersPerDay: { p10: number; p50: number; p90: number };
  assumptions: readonly string[];
}

/**
 * Runs the business forward, many times, and reports the spread.
 *
 * Agent-based in the sense that matters here: the unit of behaviour is a
 * customer deciding whether to order today, and the day's revenue is the sum
 * of what they did. It is not a richer agent model — no memory, no influence
 * between customers — and pretending otherwise would be the kind of
 * sophistication that makes a number harder to argue with rather than more
 * likely to be right.
 *
 * Below MIN_ITERATIONS it throws rather than quietly running fewer. A
 * percentile from eighty samples is a number with a confidence interval nobody
 * quoted.
 */
export function simulate(
  parameters: TwinParameters,
  request: SimulationRequest,
): SimulationOutcome {
  if (request.iterations < MIN_ITERATIONS) {
    throw new Error(
      `a simulation needs at least ${MIN_ITERATIONS} iterations to report a percentile; ${request.iterations} were asked for`,
    );
  }
  if (request.days <= 0) throw new Error('a simulation needs a horizon of at least one day');

  const demand = request.demandMultiplier ?? 1;
  const price = request.priceMultiplier ?? 1;

  // The rate each customer orders at, per day. Derived rate over the customer
  // base over the year.
  const ordersPerCustomerPerDay =
    (parameters.ordersPerYear * demand) / parameters.customers / 365;
  const orderValue = parameters.averageOrderCents * price;

  const random = createRandom(request.seed);
  const revenues: number[] = [];
  const dailyOrders: number[] = [];

  for (let run = 0; run < request.iterations; run += 1) {
    let revenue = 0;
    let orders = 0;

    for (let day = 0; day < request.days; day += 1) {
      // Expected orders today across the whole base, sampled as a count.
      const expected = ordersPerCustomerPerDay * parameters.customers;
      const today = samplePoisson(expected, random);
      orders += today;

      for (let i = 0; i < today; i += 1) {
        revenue += sampleOrderValue(orderValue, random);
      }
    }

    revenues.push(revenue);
    dailyOrders.push(orders / request.days);
  }

  revenues.sort((a, b) => a - b);
  dailyOrders.sort((a, b) => a - b);

  return {
    iterations: request.iterations,
    days: request.days,
    seed: request.seed,
    revenueCents: {
      p10: Math.round(percentile(revenues, 0.1)),
      p50: Math.round(percentile(revenues, 0.5)),
      p90: Math.round(percentile(revenues, 0.9)),
    },
    ordersPerDay: {
      p10: percentile(dailyOrders, 0.1),
      p50: percentile(dailyOrders, 0.5),
      p90: percentile(dailyOrders, 0.9),
    },
    assumptions: ASSUMPTIONS,
  };
}

/**
 * A count of independent arrivals in one day.
 *
 * Knuth's method below a mean of thirty, where it is exact and cheap; a normal
 * approximation above it, where Knuth's loop would run hundreds of times per
 * day per iteration and a Poisson with a large mean is indistinguishable from
 * a normal anyway. Five hundred iterations over a year is 182,500 draws, so
 * the crossover is not premature.
 */
function samplePoisson(mean: number, random: () => number): number {
  if (mean <= 0) return 0;

  if (mean < 30) {
    const limit = Math.exp(-mean);
    let count = 0;
    let product = random();
    while (product > limit) {
      count += 1;
      product *= random();
    }
    return count;
  }

  return Math.max(0, Math.round(mean + Math.sqrt(mean) * standardNormal(random)));
}

/**
 * Order value around the average, never negative.
 *
 * A third of the average as the spread, and the floor at zero matters: a
 * normal draw far enough below the mean would otherwise produce a negative
 * sale, and a handful of those across five hundred iterations quietly drags
 * the P10 below anything the business could actually experience.
 */
function sampleOrderValue(average: number, random: () => number): number {
  return Math.max(0, average + average * 0.33 * standardNormal(random));
}

/** Box-Muller, which turns two uniforms into one standard normal. */
function standardNormal(random: () => number): number {
  const u = Math.max(Number.EPSILON, random());
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
