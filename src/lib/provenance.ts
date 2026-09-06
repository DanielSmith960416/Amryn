/**
 * Where a number came from, in the application's vocabulary.
 *
 * Mirrors the `public.provenance` enum from migration 25. The database is
 * where the rule is enforced — an estimate without a range cannot be stored —
 * and this is where it is explained to a reader.
 */

export const PROVENANCE = ['fact', 'derived', 'estimated', 'simulated'] as const;
export type Provenance = (typeof PROVENANCE)[number];

export function isProvenance(value: string): value is Provenance {
  return (PROVENANCE as readonly string[]).includes(value);
}

/**
 * The short label shown beside a figure.
 *
 * Plain words rather than the enum's own. "Derived" is jargon on a page; a
 * reader who sees "calculated" knows immediately whether to trust it, and that
 * is the entire job of the tag.
 */
export const PROVENANCE_LABEL: Record<Provenance, string> = {
  fact: 'Reported',
  derived: 'Calculated',
  estimated: 'Estimated',
  simulated: 'Simulated',
};

/**
 * What the tag means, for the reader who hovers or asks.
 *
 * Written to answer "can I put this in a board pack?" rather than to define a
 * term, because that is the question actually being asked.
 */
export const PROVENANCE_MEANING: Record<Provenance, string> = {
  fact: 'Taken from your own records or something you told us. Not adjusted.',
  derived: 'Arithmetic on your own figures. Run it again and it gives the same answer.',
  estimated: 'Inferred rather than measured. The range shows how uncertain it is.',
  simulated: 'Produced by a model run rather than observed. The range is the spread across runs.',
};

/**
 * Whether a figure of this kind must carry a range.
 *
 * The same rule the database enforces, stated here so a screen can be built
 * from it rather than from a second reading of the constraint.
 */
export function needsRange(provenance: Provenance): boolean {
  return provenance === 'estimated' || provenance === 'simulated';
}

/**
 * How firm a figure is, for ordering and for deciding what may be said.
 *
 * Higher is firmer. Used where a list mixes kinds and the reader should meet
 * the solid figures first.
 */
export const PROVENANCE_FIRMNESS: Record<Provenance, number> = {
  fact: 3,
  derived: 2,
  simulated: 1,
  estimated: 0,
};
