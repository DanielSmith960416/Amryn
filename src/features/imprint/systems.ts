/**
 * The rule that the systems step kept breaking.
 *
 * `data_sources` is UNIQUE (organisation_id, name) and the category is not
 * part of that key, so the same name under two headings is one row rather than
 * two. The insert is atomic, so a single repeat lost all eight answers to a
 * "23505 duplicate key" that reached the reader as "We could not save those
 * systems" — naming neither the system nor the repetition, on a form that had
 * just cleared itself.
 *
 * It lives here, apart from actions.ts, because that file is `'use server'`
 * and reaches for a session and a database client on import: nothing can
 * exercise its judgement in a test. This can be exercised, and is.
 */

/** A system as the form submits it, before anything is written. */
export interface NamedSystem {
  category: string;
  name: string;
}

/**
 * The first name given twice, or null when every name is distinct.
 *
 * Compared case-insensitively, which is stricter than the constraint. Somebody
 * writing "Excel" and "excel" means one system; allowing both would satisfy
 * Postgres and produce two rows that read as duplicates to every human who
 * sees them afterwards.
 *
 * Returns the repeat and where it was first seen, so the message can name both
 * headings rather than making the reader hunt through eight boxes.
 */
export function firstRepeatedName(
  systems: readonly NamedSystem[],
): { name: string; category: string; firstCategory: string } | null {
  const seen = new Map<string, string>();

  for (const system of systems) {
    const key = system.name.trim().toLowerCase();
    if (key.length === 0) continue;

    const firstCategory = seen.get(key);
    if (firstCategory !== undefined) {
      return { name: system.name.trim(), category: system.category, firstCategory };
    }
    seen.set(key, system.category);
  }

  return null;
}
