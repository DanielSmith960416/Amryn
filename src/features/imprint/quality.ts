/**
 * The Imprint Quality Score, 0 to 100.
 *
 * ── what it is for, and why that matters to how it is built ───────────────
 * This is not a progress bar. A later phase suppresses expansion advice
 * entirely below 70 and marks everything it says PROVISIONAL, so the score
 * decides what the platform is willing to claim about a business. A number
 * with that job has to be defensible line by line: a customer who is told
 * their Imprint scores 64 is entitled to be shown exactly which answers would
 * move it, and a number nobody can decompose is a number nobody will trust or
 * act on.
 *
 * So `score()` returns the reasoning as well as the figure, and every screen
 * that shows one shows it from the same call.
 *
 * ── the arithmetic ────────────────────────────────────────────────────────
 * Each layer carries a weight out of a hundred (declared in layers.ts, beside
 * the fields, so the two cannot drift). Within a layer, completeness is the
 * share of its fields answered, with essential fields counted twice — a
 * business that has given its revenue and not its trading hours is far better
 * understood than one that has done the reverse, and counting them equally
 * would say otherwise.
 *
 * ── the decision worth arguing about ──────────────────────────────────────
 * A skipped layer scores zero, exactly like one nobody has reached.
 *
 * That is deliberate and it is not a judgement on the customer. Skipping is a
 * legitimate answer and the review screen says so. But the score does not
 * measure effort or good faith — it measures how much of the business the
 * platform can actually see, and a layer that was skipped for excellent
 * reasons is just as invisible as one that was never opened. Letting a skip
 * score full marks would produce Imprints scoring 100 that the analysis cannot
 * read, which is the one failure this number exists to prevent.
 *
 * What differs is the sentence, not the score: `reasonsToImprove()` says
 * "you skipped this, and here is what it costs" rather than "you have not got
 * to this yet".
 */
import { LAYERS, type Layer, type LayerId, type LayerState } from './layers';

/** Essential fields count double. See the note above. */
const ESSENTIAL_WEIGHT = 2;
const ORDINARY_WEIGHT = 1;

export interface LayerAnswers {
  state: LayerState;
  /** The keys present here are what "answered" means, field by field. */
  answers: Record<string, unknown>;
  /** Fields the customer explicitly passed over. Recorded, never guessed at. */
  gaps: readonly string[];
}

export type ImprintAnswers = Readonly<Partial<Record<LayerId, LayerAnswers>>>;

export interface LayerScore {
  layer: LayerId;
  label: string;
  state: LayerState;
  weight: number;
  /** 0 to 1, before the weight is applied. */
  completeness: number;
  /** Its actual contribution to the total, out of 100. */
  contribution: number;
  /** Field names that would raise this layer's contribution, most valuable first. */
  missing: string[];
}

export interface QualityScore {
  /** 0 to 100, rounded. The figure shown and stored. */
  score: number;
  layers: LayerScore[];
  /**
   * Below this the analysis marks everything PROVISIONAL and refuses to
   * discuss expansion. Stated here because the threshold and the score have to
   * come from the same place or a screen will promise something the analysis
   * then withholds.
   */
  provisionalBelow: number;
  provisional: boolean;
}

export const PROVISIONAL_BELOW = 70;

/**
 * Whether one field has been answered.
 *
 * An empty string, an empty array and null are all "not answered". That sounds
 * obvious and is the thing most likely to be got wrong: a form submits a blank
 * text input as `''`, not as absent, so a layer touched and left empty would
 * otherwise score as fully answered.
 */
function isAnswered(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return true;
}

function scoreLayer(definition: Layer, given: LayerAnswers | undefined): LayerScore {
  const state = given?.state ?? 'unanswered';
  const answers = given?.answers ?? {};

  const total = definition.fields.reduce(
    (sum, field) => sum + (field.essential ? ESSENTIAL_WEIGHT : ORDINARY_WEIGHT),
    0,
  );

  // A skipped layer scores zero however much happens to be in its answers —
  // the customer has said the platform should not rely on it.
  const earned =
    state === 'skipped'
      ? 0
      : definition.fields.reduce(
          (sum, field) =>
            sum +
            (isAnswered(answers[field.name])
              ? field.essential
                ? ESSENTIAL_WEIGHT
                : ORDINARY_WEIGHT
              : 0),
          0,
        );

  const completeness = total === 0 ? 0 : earned / total;

  const missing =
    state === 'skipped'
      ? definition.fields.map((f) => f.name)
      : definition.fields.filter((f) => !isAnswered(answers[f.name])).map((f) => f.name);

  return {
    layer: definition.id,
    label: definition.label,
    state,
    weight: definition.weight,
    completeness,
    contribution: definition.weight * completeness,
    // Essential first: the list is read as "do these next", so its order is
    // advice whether or not it was meant to be.
    missing: missing.sort((a, b) => {
      const fieldA = definition.fields.find((f) => f.name === a);
      const fieldB = definition.fields.find((f) => f.name === b);
      return Number(fieldB?.essential ?? false) - Number(fieldA?.essential ?? false);
    }),
  };
}

export function score(given: ImprintAnswers): QualityScore {
  const layers = LAYERS.map((definition) => scoreLayer(definition, given[definition.id]));
  const total = layers.reduce((sum, l) => sum + l.contribution, 0);

  // Rounded once, at the end. Rounding each layer first loses up to half a
  // point eight times, which is enough to hold an Imprint below the threshold
  // that decides what the platform will say about it.
  const rounded = Math.round(total);

  return {
    score: rounded,
    layers,
    provisionalBelow: PROVISIONAL_BELOW,
    provisional: rounded < PROVISIONAL_BELOW,
  };
}

/**
 * What to answer next, in the order that raises the score fastest.
 *
 * Ranked by what each layer would add if it were completed, so the advice is
 * arithmetic rather than opinion — and a customer who follows it top to bottom
 * genuinely does reach a usable Imprint soonest.
 */
export function reasonsToImprove(result: QualityScore, limit = 3): LayerScore[] {
  return result.layers
    .filter((l) => l.completeness < 1)
    .sort((a, b) => b.weight * (1 - b.completeness) - a.weight * (1 - a.completeness))
    .slice(0, limit);
}

/**
 * The single sentence shown beside the figure.
 *
 * Bands rather than a number alone, because "64" means nothing on its own and
 * the same reader will otherwise decide for themselves whether it is good.
 */
export function describe(result: QualityScore): string {
  if (result.score >= 85) {
    return 'Enough to model the business closely. Findings can be stated with confidence.';
  }
  if (result.score >= PROVISIONAL_BELOW) {
    return 'Enough to read the business properly, including where it could expand.';
  }
  // Both bands below the threshold name it. Somebody at 35 is held back by
  // exactly the same rule as somebody at 65, and telling them their findings
  // are provisional without saying what number would release them leaves them
  // with a complaint rather than a next step.
  if (result.score >= 40) {
    return `Enough for a first read. Findings are marked provisional, and expansion is not assessed until this reaches ${PROVISIONAL_BELOW}.`;
  }
  return `Not yet enough to say much. Findings are provisional until this reaches ${PROVISIONAL_BELOW}, and the layers below are what would get it there.`;
}
