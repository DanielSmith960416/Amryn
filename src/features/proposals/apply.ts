/**
 * What accepting a proposal actually does.
 *
 * Pure: it decides whether a proposal is one this platform knows how to apply,
 * and what the resulting answers document should be. The action next door does
 * the writing.
 *
 * ── "accepted" has to mean the change happened ────────────────────────────
 *
 * The alternative was tempting and is worse: record the acceptance, leave the
 * writing to somebody, and let the list show a green tick beside a field that
 * never moved. A status that does not correspond to a change is the same class
 * of quiet untruth as a caveat one join away — it reads as settled and is not.
 *
 * So a proposal whose target this platform cannot apply is refused at the
 * point of accepting, by name, rather than accepted and quietly ignored. Today
 * that means Imprint fields are applicable and nothing else is; when the Twin
 * and scenario targets arrive they are added here and the refusal shrinks.
 */

/** Targets this platform knows how to write. */
export const APPLICABLE_TABLES = ['imprint_layers'] as const;

export type ApplicableTable = (typeof APPLICABLE_TABLES)[number];

export function isApplicable(targetTable: string): targetTable is ApplicableTable {
  return (APPLICABLE_TABLES as readonly string[]).includes(targetTable);
}

export type ApplyPlan =
  | {
      ok: true;
      /** The layer's answers with the proposed value written in. */
      answers: Record<string, unknown>;
      /** The field is answered now, so it stops counting as a gap. */
      gaps: string[];
    }
  | { ok: false; reason: string };

/**
 * Works out the new state of one Imprint layer.
 *
 * The value is written as the string it was proposed as. The Imprint stores
 * answers as text and the engines parse them at the point of use — so
 * converting here would mean two places deciding what "R2,400" means, and the
 * one that is wrong would be the one nobody looks at.
 */
export function applyToLayer(
  current: { answers: Record<string, unknown> | null; gaps: string[] | null },
  field: string,
  proposedValue: string,
): ApplyPlan {
  if (field.trim() === '') {
    return { ok: false, reason: 'the proposal does not name a field' };
  }

  const answers = { ...(current.answers ?? {}) };

  /*
   * Refuse when the value moved since the proposal was raised.
   *
   * Not a race so much as a conversation: somebody proposed changing a blank
   * field a week ago, somebody else has since filled it in, and accepting now
   * would overwrite a person's answer with a model's suggestion without either
   * of them knowing. The proposal is stale rather than wrong, and saying so
   * lets it be re-argued against what the field says today.
   */
  const existing = answers[field];
  if (existing !== undefined && existing !== null && String(existing) === proposedValue) {
    return { ok: false, reason: 'that field already holds the proposed value' };
  }

  answers[field] = proposedValue;

  return {
    ok: true,
    answers,
    gaps: (current.gaps ?? []).filter((gap) => gap !== field),
  };
}

/**
 * Whether the field still holds what the proposal said it did.
 *
 * Compared as text, because that is how the Imprint stores it and how the
 * proposal recorded it. Null and the empty string are treated alike here: a
 * field nobody has answered and a field answered with nothing are the same
 * thing to a reader, and distinguishing them would make a proposal go stale
 * for a difference nobody can see.
 */
export function stillMatches(
  current: Record<string, unknown> | null,
  field: string,
  recordedValue: string | null,
): boolean {
  const raw = (current ?? {})[field];
  const now = raw === undefined || raw === null ? '' : String(raw);
  const then = recordedValue ?? '';
  return now === then;
}
