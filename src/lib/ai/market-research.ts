import Anthropic from '@anthropic-ai/sdk';
import { aiConfig } from '@/lib/env';
import { AiUnavailableError } from './errors';
import { WEB_FETCH_TOOL, WEB_SEARCH_TOOL, admitSignals } from './web-research';
import type { DraftSignal, ResearchOutcome } from './web-research';

/**
 * Asks Claude to search for what is happening around one business.
 *
 * A separate call from `complete()` because it is a different shape of
 * request: server-side tools, several turns of searching before an answer, and
 * a response whose most important part is not the prose. `complete()` returns
 * text; this returns the text *and* the record of what was retrieved, because
 * admitSignals cannot do its job without the second.
 *
 * ── why the tool call is here and the rule is next door ───────────────────
 *
 * web-research.ts holds the rule — a citation counts only if the API's own
 * retrieval record contains it — and holds no network code, so it is tested
 * against fabricated responses without a key, a gateway or a bill. This file
 * is the part that cannot be tested that way, and it is deliberately thin: it
 * makes the request and hands the whole response to the rule.
 *
 * No `server-only` import, deliberately. The worker is a plain Node process
 * and its build refuses any module that reaches for it — that guard exists so
 * the failure is a named build error rather than a crash on the first tick,
 * and this module is one of the ones it is protecting.
 */

/** What the model is told about the business, all of it from the Imprint. */
export interface ResearchBrief {
  organisationName: string;
  industry?: string;
  city?: string;
  whatTheySell?: string;
  competitors?: string;
  /** Whether they will sell to government. Decides if tenders are worth finding. */
  sectorScope?: string;
}

const SYSTEM = `You research the market around a specific small or medium business, using web search.

Rules, in order of importance:

1. Every claim you report must come from a page you actually retrieved in this
   conversation. If you did not search for it and read it, you do not know it.
2. Report the URL exactly as it appeared in your search results. Do not
   reconstruct, tidy, shorten or guess a URL.
3. Every figure must appear in the page you took it from. Do not convert
   currencies, annualise, extrapolate or round beyond what the page says.
4. If your searches find nothing about this business or its market, say so and
   return an empty list. An empty answer is correct and useful. A plausible
   answer assembled from what you already knew is neither.

Return only what a person running this business could act on in the next
quarter: tenders and contracts they could bid for, demand or price movements in
their market, competitor moves, and regulatory changes that would cost or save
them money.`;

interface DraftEnvelope {
  signals?: DraftSignal[];
}

export interface MarketResearchResult extends ResearchOutcome {
  /** Whatever the model said for itself, kept for the run's log. */
  note: string;
  searchesRun: number;
}

/**
 * Runs the search and returns only what the retrieval record supports.
 *
 * Throws AiUnavailableError when no model is configured, which the caller
 * records as a gap rather than as a failure — an analysis that cannot reach
 * the outside world is still a valid analysis of the inside.
 */
export async function researchMarket(brief: ResearchBrief): Promise<MarketResearchResult> {
  const config = aiConfig();
  if (config.provider !== 'anthropic') {
    // OpenAI is a supported provider for the rest of the layer and has no
    // equivalent server-side search here. Rather than silently returning
    // nothing, this says so and the run records it.
    throw new AiUnavailableError();
  }

  const client = new Anthropic({
    apiKey: config.apiKey ?? 'placeholder-the-gateway-holds-the-key',
    ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    ...(config.gatewayToken
      ? { defaultHeaders: { 'cf-aig-authorization': `Bearer ${config.gatewayToken}` } }
      : {}),
    // Longer than the 45s the rest of the layer allows: this makes several
    // searches and reads pages between them, and a timeout mid-search wastes
    // the searches already paid for.
    timeout: 180_000,
    maxRetries: 1,
  });

  const question = [
    `Business: ${brief.organisationName}`,
    brief.industry && `Industry: ${brief.industry}`,
    brief.city && `Location: ${brief.city}`,
    brief.whatTheySell && `Sells: ${brief.whatTheySell}`,
    brief.competitors && `Known competitors: ${brief.competitors}`,
    brief.sectorScope && `Sector they sell to: ${brief.sectorScope}`,
    '',
    'Search for what is currently happening in this market. Then reply with a',
    'single JSON object and nothing else:',
    '{"note": "one sentence on what you searched and found",',
    ' "signals": [{"title": "...", "summary": "...", "detail": "...",',
    '   "sourceUrl": "the exact URL from your search results",',
    '   "sourcedFrom": "publication name, if there is no usable URL",',
    '   "keywords": ["..."], "entities": ["..."]}]}',
    '',
    'An empty signals list is a valid and often correct answer.',
  ]
    .filter(Boolean)
    .join('\n');

  const response = await client.messages.create({
    model: config.model,
    max_tokens: config.maxOutputTokens,
    system: SYSTEM,
    messages: [{ role: 'user', content: question }],
    tools: [WEB_SEARCH_TOOL, WEB_FETCH_TOOL],
    thinking: { type: 'adaptive' },
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  const searchesRun = response.content.filter(
    (block) => typeof block.type === 'string' && block.type.startsWith('web_') && block.type.endsWith('_tool_use'),
  ).length;

  const envelope = parseEnvelope(text);

  // The whole response, not the parsed drafts: admitSignals reads the
  // tool-result blocks, which is the only part that proves a retrieval.
  const outcome = admitSignals(envelope.signals ?? [], response.content);

  return { ...outcome, note: firstSentence(text), searchesRun };
}

/**
 * Pulls the JSON object out of a reply that may have prose around it.
 *
 * A malformed answer returns no signals rather than throwing. The model
 * failing to format its reply is not a reason to fail an analysis that has
 * already computed everything else.
 */
function parseEnvelope(text: string): DraftEnvelope {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return {};
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    if (!parsed || typeof parsed !== 'object') return {};
    const signals = (parsed as DraftEnvelope).signals;
    return { signals: Array.isArray(signals) ? signals : [] };
  } catch {
    return {};
  }
}

function firstSentence(text: string): string {
  const withoutJson = text.replace(/\{[\s\S]*\}/, '').trim();
  return withoutJson.split(/(?<=\.)\s/)[0]?.slice(0, 300) ?? '';
}
