/**
 * Explaining a number by walking back through where it came from.
 *
 * The brief asks the Assistant to "explain any number by walking back through
 * its provenance chain". This is that walk, as a pure function over links a
 * caller has already read — so what the explanation says can be asserted in a
 * test rather than read off a screen, and so it works with no model
 * configured. Nothing here writes prose a model produced; it states what the
 * columns say.
 *
 * ── why this is the piece worth having ────────────────────────────────────
 *
 * Every accountability column in this schema was added on the same argument:
 * a caveat that lives one join away is lost the moment the figure is quoted
 * onward. provenance, is_provisional, fidelity_id, source_table — each of them
 * is unforgeable and each of them is, on its own, a word a reader has to know
 * how to interpret.
 *
 * This is where they are read together and turned into a sentence. It is the
 * difference between a platform that could justify its numbers and one that
 * does.
 *
 * ── it never fills a gap ──────────────────────────────────────────────────
 *
 * A link the caller could not resolve comes in as null and is reported as
 * unknown, by name. That is the whole discipline: "this figure came from a
 * reading whose record has since been deleted" is a useful thing to be told,
 * and "this figure is derived from your financial records" said on no evidence
 * is exactly the invention the provenance column exists to prevent.
 */

export type Provenance = 'fact' | 'derived' | 'estimated' | 'simulated';

/** How much of the chain a caller managed to resolve. */
export interface Chain {
  /** The figure itself. */
  figure: {
    table: string;
    id: string;
    label: string;
    provenance: Provenance;
    isProvisional: boolean;
    /** Present on estimated and simulated figures; the schema requires it. */
    range: { p10: number; p50: number; p90: number } | null;
  };
  /** The reading that produced it, if it named one and the row still exists. */
  run: {
    id: string;
    trigger: string;
    qualityScore: number | null;
    isProvisional: boolean;
    expansionSuppressed: boolean;
    gaps: string[];
    finishedAt: string | null;
  } | null;
  /** The accuracy measurement licensing a simulated figure. */
  fidelity: {
    id: string;
    status: 'measured' | 'not_measurable' | 'stale';
    score: number | null;
    monthsAvailable: number;
    errorPct: number | null;
  } | null;
  /** When the figure is a brief line, the record it cited. */
  citedFrom: { table: string; id: string; resolved: boolean } | null;
}

export interface Step {
  /** A short heading — the link in the chain this step describes. */
  link: string;
  /** What that link says, in a sentence somebody can act on. */
  says: string;
  /**
   * Whether this step is a limit on the figure rather than support for it.
   * A reader skimming should be able to find the caveats without reading all
   * of it, and colouring them is only possible if they are marked.
   */
  caveat: boolean;
}

const ORIGIN: Record<Provenance, string> = {
  fact: 'This is a figure you recorded, not one the platform worked out. It is as right as what was entered.',
  derived:
    'This was calculated from figures you gave, by arithmetic rather than judgement. Run it again on the same inputs and it comes out the same.',
  estimated:
    'This is an estimate. Something in it was not known and had to be reasoned about, which is why it is quoted as a range rather than a number.',
  simulated:
    'This came out of the Digital Twin — the business run forward many times, not a measurement of what happened.',
};

/**
 * The chain as a reader should hear it, most important first.
 *
 * Order is deliberate: where it came from, then how much to believe it, then
 * what was missing. Somebody who stops reading after two steps has still been
 * told the two things that would change what they do.
 */
export function explain(chain: Chain): Step[] {
  const steps: Step[] = [];
  const { figure, run, fidelity, citedFrom } = chain;

  steps.push({
    link: 'Where it came from',
    says: ORIGIN[figure.provenance],
    caveat: figure.provenance === 'estimated' || figure.provenance === 'simulated',
  });

  if (figure.range) {
    steps.push({
      link: 'The range',
      says:
        `Nine times in ten it lands above ${money(figure.range.p10)} and below ` +
        `${money(figure.range.p90)}, with ${money(figure.range.p50)} in the middle. ` +
        'The middle is not a prediction; it is the middle.',
      caveat: false,
    });
  }

  /*
   * The Twin's licence, said before anything about the reading.
   *
   * A simulated figure with no measurement behind it cannot exist — the
   * database refuses it — so an unresolved fidelity link here means the
   * measurement was deleted, which is worth saying loudly rather than
   * skipping.
   */
  if (figure.provenance === 'simulated') {
    if (!fidelity) {
      steps.push({
        link: 'How close the Twin gets',
        says:
          'The accuracy measurement this figure was licensed by is no longer on record. ' +
          'Treat the figure as unsupported until the Twin is measured again.',
        caveat: true,
      });
    } else if (fidelity.status === 'measured') {
      steps.push({
        link: 'How close the Twin gets',
        says:
          `Measured against ${fidelity.monthsAvailable} months of your own history: ` +
          `${fidelity.score}/100` +
          (fidelity.errorPct === null ? '' : `, out by ${fidelity.errorPct.toFixed(1)}% on average`) +
          '. That is how wrong this model has been, not how confident it is.',
        caveat: fidelity.score !== null && fidelity.score < 70,
      });
    } else {
      steps.push({
        link: 'How close the Twin gets',
        says:
          'Nobody can say yet. There is not enough unbroken history to score the model ' +
          `against — ${fidelity.monthsAvailable} complete months so far. The range above is ` +
          'the model talking to itself.',
        caveat: true,
      });
    }
  }

  if (figure.isProvisional) {
    steps.push({
      link: 'Why it is marked provisional',
      says:
        'It came from a reading of an Imprint that was not complete enough for the platform ' +
        'to stand behind what it found. The mark is fixed to this figure rather than worked ' +
        'out fresh, so it stays true even if the Imprint is finished tomorrow.',
      caveat: true,
    });
  }

  if (run) {
    steps.push({
      link: 'The reading that produced it',
      says:
        `Started by ${run.trigger}` +
        (run.finishedAt ? ` and finished ${run.finishedAt.slice(0, 10)}` : ', not yet finished') +
        (run.qualityScore === null
          ? '. The Imprint had never been scored at the time, which counts against it rather than for it.'
          : `. The Imprint scored ${run.qualityScore} out of 100 at the time.`),
      caveat: run.qualityScore === null,
    });

    if (run.gaps.length > 0) {
      steps.push({
        link: 'What it did not have',
        says:
          `The reading wanted ${run.gaps.length} thing${run.gaps.length === 1 ? '' : 's'} it was ` +
          `not given: ${run.gaps.join(', ')}. Nothing was assumed in their place — that is why ` +
          'they are listed rather than filled in.',
        caveat: true,
      });
    }

    if (run.expansionSuppressed) {
      steps.push({
        link: 'What it would not say',
        says:
          'This reading refused to discuss expansion. Below the quality threshold the platform ' +
          'will talk about growing what you have and not about moving into something new.',
        caveat: true,
      });
    }
  } else if (figure.provenance !== 'fact') {
    steps.push({
      link: 'The reading that produced it',
      says:
        'No reading is on record for this figure. It was produced before readings were kept, ' +
        'or the record has since been removed.',
      caveat: true,
    });
  }

  if (citedFrom) {
    steps.push({
      link: 'The record it cites',
      says: citedFrom.resolved
        ? `Traced to ${friendly(citedFrom.table)}, which is where the figure actually lives.`
        : `It cites ${friendly(citedFrom.table)}, but that record is no longer there. ` +
          'The line stands as written and cannot be checked against its source.',
      caveat: !citedFrom.resolved,
    });
  }

  return steps;
}

/** Whether anything in the chain should stop somebody acting on the figure. */
export function hasCaveats(steps: readonly Step[]): boolean {
  return steps.some((step) => step.caveat);
}

function money(cents: number): string {
  return `R${Math.round(cents / 100).toLocaleString('en-GB')}`;
}

const FRIENDLY: Record<string, string> = {
  business_insights: 'a finding about your business',
  ai_recommendations: 'a recommendation',
  opportunities: 'an opportunity on the radar',
  twin_simulations: 'a run of the Digital Twin',
  market_signals: 'a signal seen outside your business',
  goals: 'a goal you set',
  proposals: 'a suggestion waiting on you',
  imprint_layers: 'your Imprint',
  financial_records: 'your financial records',
};

export function friendly(table: string): string {
  return FRIENDLY[table] ?? table;
}
