/**
 * Reading what an assistant message carries besides its words.
 *
 * `ai_messages` has held three jsonb columns since migration 03 — citations,
 * visualisations and suggested_actions — and nothing has ever written to them
 * or read them. They default to `[]`, so every message on every deployment
 * carries three empty arrays.
 *
 * That makes the rule for this file unusually clear. There is no historical
 * data to be bug-compatible with and no schema to infer from what is stored,
 * so the readers below define the shape the write path will have to produce,
 * and they are strict about it: an entry that does not match is dropped, never
 * guessed at and never rendered raw. A reader who sees `{"t":"x"}` on screen
 * learns nothing and loses confidence in everything around it; a reader who
 * sees one citation instead of two at least sees only true things.
 *
 * Pure, and in its own module, so it can be tested without a database and
 * without `server-only` — which the page that uses it does carry.
 */

/** A record the answer drew on, pointing at a row the reader can go and read. */
export interface Citation {
  table: string;
  id: string;
  label: string | null;
}

/** Somewhere to go next. A label and a path inside this application. */
export interface SuggestedAction {
  label: string;
  href: string;
}

/**
 * A chart the answer wants shown.
 *
 * Deliberately thin: a kind and a title. Nothing renders a chart from this
 * yet, and inventing a full series format that no writer has to satisfy would
 * be designing a contract against nobody.
 */
export interface Visualisation {
  kind: string;
  title: string | null;
}

/**
 * The tables /explain can actually resolve.
 *
 * `brief_items` plus the three in TRACEABLE (features/assistant/trace.ts).
 * Anything else sent to that route is a 404, so a citation naming an
 * unfamiliar table is shown as text rather than as a link to nowhere.
 *
 * The other half of this pair lives in trace.ts, which is server-only and
 * cannot be imported here. threads.test.ts reads that file and fails if the
 * two ever disagree, which is cheaper than a shared module that exists only to
 * hold four strings.
 */
const EXPLAINABLE = new Set([
  'brief_items',
  'business_insights',
  'ai_recommendations',
  'opportunities',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A non-empty string, or nothing. Whitespace is not a label. */
function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Accepts the column's value however it arrives.
 *
 * supabase-js hands back parsed jsonb, but the same column read through a
 * driver that does not parse gives a string. Both are handled here rather than
 * at three call sites, and anything that is not an array becomes none.
 */
function entries(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Citations that name both a table and a row. Anything else is dropped. */
export function readCitations(value: unknown): Citation[] {
  const found: Citation[] = [];
  for (const entry of entries(value)) {
    if (!isRecord(entry)) continue;
    const table = text(entry.table);
    const id = text(entry.id);
    if (!table || !id) continue;
    found.push({ table, id, label: text(entry.label) });
  }
  return found;
}

/**
 * Where a citation points, or null if it points somewhere /explain cannot go.
 *
 * Only a path within this application is ever produced: a citation is data
 * written by a model, and a model that could put an arbitrary href on a chip
 * could put an external one there.
 */
export function citationHref(citation: Citation): string | null {
  if (!EXPLAINABLE.has(citation.table)) return null;
  return `/explain/${citation.table}/${encodeURIComponent(citation.id)}`;
}

/** What to call a citation when it carries no label of its own. */
export function citationLabel(citation: Citation): string {
  if (citation.label) return citation.label;
  // The table name, made readable, rather than the raw identifier: "the
  // opportunity behind this" is more use to a reader than a UUID.
  return citation.table.replace(/_/g, ' ');
}

/**
 * Suggested actions, which must name somewhere inside this application.
 *
 * The href is checked here rather than trusted: this is the one field on a
 * message that becomes something clickable, and the text in it was written by
 * a model. A path starting with a single `/` cannot leave the origin;
 * `//host` and `https://host` both can, and both are refused.
 */
export function readSuggestedActions(value: unknown): SuggestedAction[] {
  const found: SuggestedAction[] = [];
  for (const entry of entries(value)) {
    if (!isRecord(entry)) continue;
    const label = text(entry.label);
    const href = text(entry.href);
    if (!label || !href) continue;
    if (!href.startsWith('/') || href.startsWith('//') || href.startsWith('/\\')) continue;
    found.push({ label, href });
  }
  return found;
}

/** Visualisations that at least say what kind of thing they are. */
export function readVisualisations(value: unknown): Visualisation[] {
  const found: Visualisation[] = [];
  for (const entry of entries(value)) {
    if (!isRecord(entry)) continue;
    const kind = text(entry.kind);
    if (!kind) continue;
    found.push({ kind, title: text(entry.title) });
  }
  return found;
}

/** The default the database itself uses, so the two cannot drift. */
export const UNTITLED = 'New conversation';

/**
 * What to show in the list for a thread.
 *
 * `title` is `not null default 'New conversation'`, so this is not about a
 * missing value — it is about a title made of spaces, or one long enough to
 * push the list about, both of which a rename box can produce.
 */
export function threadTitle(raw: string | null | undefined): string {
  const trimmed = text(raw);
  if (!trimmed) return UNTITLED;
  return trimmed.length > 80 ? `${trimmed.slice(0, 79).trimEnd()}…` : trimmed;
}
