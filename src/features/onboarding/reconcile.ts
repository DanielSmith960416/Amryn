/**
 * Answering a setup question twice should correct the answer, not add one.
 *
 * Every step of setup can be revisited — that is the point of being able to
 * leave halfway through — and each one wrote with a plain insert. What that
 * did depended on whether a unique constraint happened to catch it, so the
 * same mistake had two opposite symptoms and neither was the right one:
 *
 *   branches, competitors   UNIQUE (organisation_id, name) rejected the whole
 *                           save with 23505, so revising one name lost them all
 *   departments             UNIQUE (organisation_id, branch_id, name) never
 *                           fired, because branch_id is null here and Postgres
 *                           treats nulls as distinct — so it duplicated quietly
 *   goals                   no constraint at all, so it duplicated quietly
 *
 * The last one is the damaging case. A revenue target revised from R2,000,000
 * to R1,200,000 left both rows active, with the same title, and nothing in the
 * platform able to say which figure the business is judged against.
 *
 * These helpers are pure so they can be tested. The actions that use them are
 * `'use server'` and reach for a session and a database client on import,
 * which is why none of this was covered.
 */

/** Compared the way a person compares them: trimmed, ignoring case. */
export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * The submitted names that are not already recorded.
 *
 * Used where the row carries nothing but a name, so an existing one needs no
 * update — repeating it is a no-op rather than a change.
 */
export function onlyNew(submitted: readonly string[], existing: readonly string[]): string[] {
  const known = new Set(existing.map((name) => name.trim().toLowerCase()));
  const fresh: string[] = [];

  for (const name of submitted) {
    const key = name.trim().toLowerCase();
    if (key.length === 0 || known.has(key)) continue;
    // Guards against the same new name appearing twice in one submission,
    // which would otherwise insert it twice in a single statement.
    known.add(key);
    fresh.push(name.trim());
  }

  return fresh;
}

export interface Reconciled<T> {
  /** Already recorded under this name — carries the existing row's id. */
  update: Array<{ id: string; row: T }>;
  /** Not recorded yet. */
  insert: T[];
}

/**
 * Splits submitted rows into those that revise an existing record and those
 * that are new, matched by name.
 *
 * Used where the row carries more than a name — a goal has a target, a due
 * date and a unit — so answering again is an edit and must reach the row that
 * is already there.
 */
export function reconcileByName<T>(
  submitted: readonly T[],
  existing: readonly { id: string; name: string }[],
  nameOf: (row: T) => string,
): Reconciled<T> {
  const byName = new Map(existing.map((row) => [row.name.trim().toLowerCase(), row.id]));
  const result: Reconciled<T> = { update: [], insert: [] };
  const claimed = new Set<string>();

  for (const row of submitted) {
    const key = nameOf(row).trim().toLowerCase();
    const id = byName.get(key);

    // A name repeated within one submission must not update the same row
    // twice, and must not become a second row either — the first wins.
    if (claimed.has(key)) continue;
    claimed.add(key);

    if (id) result.update.push({ id, row });
    else result.insert.push(row);
  }

  return result;
}
