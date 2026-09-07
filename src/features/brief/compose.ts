/**
 * Composing a morning brief.
 *
 * Pure. No database, no clock beyond the date it is handed, no model call. The
 * handler next door reads the rows and writes the result; everything worth
 * arguing about — what counts as worth saying, how five sections become five
 * items, what happens when a section finds nothing — is here where it can be
 * tested without a schema.
 *
 * ── the citation rule ─────────────────────────────────────────────────────
 *
 * Every candidate carries the table and row id it came from, and the type
 * makes that non-optional. The database requires it too, so this is belt and
 * braces — but the braces matter: a candidate assembled without a source fails
 * to compile here rather than failing to insert at two in the morning.
 *
 * ── five sections, five items, and why that is a squeeze ──────────────────
 *
 * The brief has five sections and a ceiling of five items. On a busy morning
 * they compete, and something has to lose. Ranking is by impact — a rand
 * figure where one can honestly be given, and a fixed floor where one cannot.
 *
 * A signal on the radar has no rand value. Scoring it zero would mean an
 * external change never appears while any internal figure exists, which is the
 * wrong reading of a brief whose whole point is that the world outside moved.
 * So sections carry a weight, and an item with no monetary impact is ranked by
 * its section's weight alone. That is a judgement, it is written down here
 * rather than buried in a comparator, and somebody will want to change it.
 */

export const MAX_ITEMS = 5;

export type Section = 'yesterday' | 'today' | 'radar' | 'open_items' | 'trajectory';

export type Provenance = 'fact' | 'derived' | 'estimated' | 'simulated';

/**
 * Where an item sits when it has no rand figure of its own.
 *
 * Deliberately not zero. The order is the order a person reads a morning:
 * what happened, what to do about it, what changed outside, what is waiting on
 * me, and am I still on course.
 */
const SECTION_WEIGHT: Record<Section, number> = {
  yesterday: 5,
  today: 4,
  radar: 3,
  open_items: 2,
  trajectory: 1,
};

export interface Candidate {
  section: Section;
  headline: string;
  detail: string;
  /** Null where no honest figure exists. Never a placeholder. */
  impactCents: number | null;
  provenance: Provenance;
  /** The gate: the row this came from. Both required by the type. */
  sourceTable: string;
  sourceId: string;
  /** Required when provenance is 'simulated'; the database refuses it otherwise. */
  fidelityId?: string | null;
}

export interface BriefItem extends Candidate {
  rank: number;
}

export interface EmptySection {
  section: Section;
  reason: string;
}

export interface Brief {
  items: BriefItem[];
  /** Sections that ran and found nothing, with why. Never silently omitted. */
  empty: EmptySection[];
}

/**
 * Ranks candidates and keeps the top five.
 *
 * Sorting is by monetary impact first, then by the section's weight, then by
 * headline — the last only so that two identical-scoring items come out in the
 * same order every morning. A brief that reshuffles itself between two runs
 * over nothing is a brief nobody trusts.
 *
 * A candidate that claims 'simulated' without naming a fidelity measurement is
 * dropped rather than written, because the database would refuse the insert
 * and lose the whole brief with it. It is reported as an empty section so the
 * omission is visible rather than silent.
 */
export function compose(candidates: readonly Candidate[], sectionsRun: readonly Section[]): Brief {
  const dropped: EmptySection[] = [];
  const admissible: Candidate[] = [];

  for (const candidate of candidates) {
    if (candidate.provenance === 'simulated' && !candidate.fidelityId) {
      dropped.push({
        section: candidate.section,
        reason:
          'A simulated figure was available but carried no accuracy measurement, so it was left out rather than shown unlicensed.',
      });
      continue;
    }
    if (!candidate.sourceTable || !candidate.sourceId) {
      dropped.push({
        section: candidate.section,
        reason: 'An item could not name the record it came from, so it was left out.',
      });
      continue;
    }
    admissible.push(candidate);
  }

  const ranked = [...admissible].sort(compareImpact).slice(0, MAX_ITEMS);

  const present = new Set(ranked.map((item) => item.section));
  const empty: EmptySection[] = [...dropped];

  for (const section of sectionsRun) {
    if (present.has(section)) continue;
    if (empty.some((e) => e.section === section)) continue;
    empty.push({
      section,
      reason: crowdedOut(admissible, section)
        ? 'Had something to say, but four more important items filled the brief.'
        : 'Nothing to report.',
    });
  }

  return {
    items: ranked.map((candidate, index) => ({ ...candidate, rank: index + 1 })),
    empty,
  };
}

/** Whether a section produced a candidate that did not make the cut. */
function crowdedOut(admissible: readonly Candidate[], section: Section): boolean {
  return admissible.some((candidate) => candidate.section === section);
}

function compareImpact(a: Candidate, b: Candidate): number {
  // Absolute, because a R400,000 shortfall is exactly as worth reading as a
  // R400,000 gain, and signing the comparison would bury every bad morning.
  const byImpact = Math.abs(b.impactCents ?? 0) - Math.abs(a.impactCents ?? 0);
  if (byImpact !== 0) return byImpact;

  const byWeight = SECTION_WEIGHT[b.section] - SECTION_WEIGHT[a.section];
  if (byWeight !== 0) return byWeight;

  return a.headline.localeCompare(b.headline);
}

/** The five, in the order a brief presents them. */
export const SECTIONS: readonly Section[] = [
  'yesterday',
  'today',
  'radar',
  'open_items',
  'trajectory',
];

export const SECTION_LABEL: Record<Section, string> = {
  yesterday: 'Yesterday',
  today: 'Today',
  radar: 'Radar',
  open_items: 'Waiting on you',
  trajectory: 'Trajectory',
};
