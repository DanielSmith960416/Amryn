/**
 * External market signals, gathered by search rather than from memory.
 *
 * Opportunity Radar has always had a shape and never had a feed. This is the
 * feed: Claude runs a search server-side, reads what comes back, and reports
 * what it found. The model chooses the queries and does the reading; it does
 * not supply the facts.
 *
 * ── the failure this file exists to prevent ───────────────────────────────
 *
 * Ask a language model to "search the web" without actually giving it a search
 * tool and it will answer anyway. The answer will be fluent, plausibly
 * sourced, and carry URLs that look exactly like real ones — because a URL is
 * a string, and producing convincing strings is the thing these models are
 * best at. The result is a market signal with a citation nobody can follow,
 * sitting in the same table as the real ones, indistinguishable.
 *
 * #65 made a claim about the outside world illegal without attribution:
 * market_signals requires a source_url or a named source. That constraint is
 * satisfied by a hallucinated URL exactly as well as by a real one. So the
 * constraint is necessary and it is not sufficient, and this is the missing
 * half.
 *
 * ── the rule ──────────────────────────────────────────────────────────────
 *
 * A signal's source_url is taken from the API's own record of what it
 * retrieved — the web_search_tool_result and web_fetch_tool_result blocks,
 * which are written by Anthropic's servers after a search actually ran — and
 * never from the model's prose. A URL the model wrote that the search never
 * returned is an invention by definition, and is dropped.
 *
 * This is a cheap rule with an expensive alternative. Verifying a cited URL by
 * fetching it ourselves would prove it resolves and prove nothing about
 * whether it says what the signal claims; and it would put the worker in the
 * business of crawling arbitrary hosts. Anchoring to the retrieval record
 * proves the stronger thing: this document was actually read.
 *
 * The numbers get the same treatment, through #65's guard, with the retrieved
 * text as the context. A figure in a signal must appear in the document it
 * cites.
 */
import type { NumericMention } from './numeric-guard';
import { guardNumbers } from './numeric-guard';

/**
 * The current server-tool versions.
 *
 * Pinned as constants and named here rather than inlined at the call site,
 * because these strings carry a date and go stale silently: an older version
 * keeps working, so nothing fails, and the request quietly stops using
 * dynamic filtering. A grep for this name finds every place that has to move.
 */
export const WEB_SEARCH_TOOL = { type: 'web_search_20260209', name: 'web_search' } as const;
export const WEB_FETCH_TOOL = { type: 'web_fetch_20260209', name: 'web_fetch' } as const;

/** One claim about the world outside the business, as the model reports it. */
export interface DraftSignal {
  title: string;
  summary: string;
  detail?: string;
  sourceUrl: string;
  /** Free text: a publication or filing, where that is the honest attribution. */
  sourcedFrom?: string;
  keywords?: string[];
  entities?: string[];
}

export type RejectionReason =
  /** A URL the model wrote that no search or fetch ever returned. */
  | 'url-was-never-retrieved'
  /** A figure that appears in no retrieved document. */
  | 'figure-not-in-the-source'
  /** Neither a retrieved URL nor a named source: unattributable. */
  | 'no-attribution';

export interface Rejected {
  signal: DraftSignal;
  reason: RejectionReason;
  /** Populated for 'figure-not-in-the-source', so a log says which number. */
  invented?: NumericMention[];
}

export interface ResearchOutcome {
  kept: DraftSignal[];
  rejected: Rejected[];
  /** Every URL the API's own tool-result blocks say was retrieved. */
  retrieved: string[];
}

/**
 * A URL as an identity rather than as a string.
 *
 * The model reproduces a URL from a search result it was shown, and reproduces
 * it approximately: a trailing slash appears, `utm_` parameters are dropped,
 * the scheme upgrades to https, the host gains or loses `www.`. None of those
 * make it a different document, and rejecting a real citation over a trailing
 * slash would teach whoever maintains this to loosen the rule that matters.
 *
 * The fragment goes because it addresses a position within a document rather
 * than a document. Tracking parameters go because they are added by whoever
 * shared the link. Everything else in the query string stays: `?id=4812` is
 * frequently the whole address.
 */
export function canonicalUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  url.protocol = 'https:';
  url.hash = '';
  url.hostname = url.hostname.replace(/^www\./i, '').toLowerCase();

  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$|mc_(c|e)id$|ref$|source$)/i.test(key)) url.searchParams.delete(key);
  }

  // A bare "/" is not a different address from no path at all.
  if (url.pathname === '/') url.pathname = '';

  return url.toString().replace(/\/$/, '');
}

/**
 * Every URL the API says it actually retrieved.
 *
 * Reads the response content blocks rather than the model's text. Two block
 * types carry the record — the search results, and any page fetched from them
 * — and both are written server-side after the retrieval happened.
 *
 * Deliberately tolerant of shape: this walks whatever nested structure it is
 * given looking for tool-result blocks and their urls, because the exact
 * nesting of these blocks is the API's business and has changed before. A
 * parser that knew the shape precisely would fail closed on the next revision,
 * and failing closed here means rejecting every real citation.
 */
export function retrievedUrls(content: unknown): string[] {
  const found = new Set<string>();

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!node || typeof node !== 'object') return;

    const record = node as Record<string, unknown>;
    const type = typeof record.type === 'string' ? record.type : '';

    // Only inside a tool *result*. A `web_search_tool_use` block carries the
    // query the model asked for, which is the model's own words again.
    if (type.endsWith('_tool_result') && type.startsWith('web_')) {
      collectUrls(record, found);
      return;
    }

    for (const value of Object.values(record)) walk(value);
  };

  walk(content);
  return [...found];
}

function collectUrls(node: unknown, into: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectUrls(item, into);
    return;
  }
  if (!node || typeof node !== 'object') return;

  const record = node as Record<string, unknown>;
  if (typeof record.url === 'string') {
    const canonical = canonicalUrl(record.url);
    if (canonical) into.add(canonical);
  }
  for (const value of Object.values(record)) collectUrls(value, into);
}

/**
 * The text of everything retrieved, as one document.
 *
 * This is what the numeric guard checks a signal's figures against. Joined
 * rather than checked per-source because a signal legitimately draws on two
 * results — a figure from one, a date from another — and attributing each
 * number to its own document would reject that honest case.
 */
export function retrievedText(content: unknown): string {
  const parts: string[] = [];

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!node || typeof node !== 'object') return;

    const record = node as Record<string, unknown>;
    const type = typeof record.type === 'string' ? record.type : '';

    if (type.endsWith('_tool_result') && type.startsWith('web_')) {
      gatherStrings(record, parts);
      return;
    }
    for (const value of Object.values(record)) walk(value);
  };

  walk(content);
  return parts.join('\n');
}

function gatherStrings(node: unknown, into: string[]): void {
  if (typeof node === 'string') {
    into.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) gatherStrings(item, into);
    return;
  }
  if (!node || typeof node !== 'object') return;
  for (const value of Object.values(node)) gatherStrings(value, into);
}

/**
 * Keeps the signals the retrieval record supports, and says why it dropped the
 * rest.
 *
 * Rejections are returned rather than logged and forgotten. A run that
 * discarded four of six signals is telling you something — usually that the
 * search found nothing about this business and the model filled the silence —
 * and that is worth surfacing as a gap rather than as an empty radar.
 */
export function admitSignals(drafts: readonly DraftSignal[], content: unknown): ResearchOutcome {
  const retrieved = retrievedUrls(content);
  const allowed = new Set(retrieved);
  const sourceText = retrievedText(content);

  const kept: DraftSignal[] = [];
  const rejected: Rejected[] = [];

  for (const signal of drafts) {
    const canonical = canonicalUrl(signal.sourceUrl ?? '');

    if (!canonical) {
      // No usable URL. A named source is still real attribution — a trade
      // publication or a filing — but only if the model gave one.
      if (signal.sourcedFrom?.trim()) kept.push(signal);
      else rejected.push({ signal, reason: 'no-attribution' });
      continue;
    }

    if (!allowed.has(canonical)) {
      rejected.push({ signal, reason: 'url-was-never-retrieved' });
      continue;
    }

    const claim = [signal.title, signal.summary, signal.detail ?? ''].join(' ');
    const numbers = guardNumbers(claim, sourceText);
    if (!numbers.ok) {
      rejected.push({ signal, reason: 'figure-not-in-the-source', invented: numbers.invented });
      continue;
    }

    kept.push(signal);
  }

  return { kept, rejected, retrieved };
}
