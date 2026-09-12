import 'server-only';

/**
 * The reasoning layer.
 *
 * Every function here follows the same rule: the deterministic engine decides
 * *what is true*, and the model, if configured, decides only *how to say it*.
 * When the model is absent, slow, or returns something malformed, the engine's
 * own output is returned instead — so a briefing is never missing, and never
 * silently degraded without saying so.
 */
import { z } from 'zod';
import { buildBriefing } from '@/lib/engines/briefing';
import {
  AiUnavailableError,
  complete,
  completeStructured,
  isAiEnabled,
  type CompletionMessage,
} from './provider';
import { assistantPrompt, briefingPrompt, recommendationPrompt } from './prompts';
import { describeInvented, guardNumbers } from './numeric-guard';
import type { BusinessContext, ExecutiveBriefing } from '@/types/intelligence';
import { unavailableAnswer } from './unavailable';

/* ── executive briefing ────────────────────────────────────────────────── */

const briefingShape = z.object({
  headline: z.string().min(10).max(240),
  narrative: z.string().min(20).max(1200),
});

/**
 * The Command Centre briefing.
 *
 * The engine runs first and always. If a model is configured it is given the
 * engine's findings and asked to rewrite the top of the card — it never sees a
 * blank page, and it cannot introduce a finding, because the findings array is
 * returned unchanged either way.
 */
export async function generateBriefing(context: BusinessContext): Promise<ExecutiveBriefing> {
  const engineBriefing = buildBriefing(context);

  if (!isAiEnabled() || engineBriefing.findings.length === 0) {
    return engineBriefing;
  }

  try {
    const findings = engineBriefing.findings.map((f) => `${f.headline}. ${f.detail}`);
    const prompt = briefingPrompt(context, findings);
    const { value } = await completeStructured(
      { messages: [{ role: 'user', content: prompt }], temperature: 0.3 },
      briefingShape,
    );

    // Checked against the prompt rather than trusted because it was asked
    // nicely. The house voice instructs the model never to invent a figure;
    // this is what happens when it does anyway, and the failure it prevents —
    // a confident number on a page somebody is about to act on — is the worst
    // one this product has.
    //
    // Falling back costs nothing. The engine's own briefing is complete and
    // was computed before the model was called at all.
    const claimed = guardNumbers(`${value.headline} ${value.narrative}`, prompt);
    if (!claimed.ok) {
      console.error(
        `[amryn:ai] the briefing rewrite was discarded — it contained figures that were ` +
          `not in its context: ${describeInvented(claimed)}`,
      );
      return engineBriefing;
    }

    return {
      ...engineBriefing,
      headline: value.headline,
      narrative: value.narrative,
      generatedBy: 'llm',
    };
  } catch (error) {
    // A failed rewrite costs nothing: the engine's own briefing is complete.
    logAiFailure('briefing', error);
    return engineBriefing;
  }
}

/* ── recommendations ───────────────────────────────────────────────────── */

const recommendationShape = z.object({
  recommendations: z
    .array(
      z.object({
        title: z.string().min(5).max(160),
        summary: z.string().min(10),
        why_it_matters: z.string().min(10),
        recommended_action: z.string().min(5),
        evidence: z
          .array(
            z.object({
              source: z.string(),
              reference: z.string(),
              note: z.string().optional(),
            }),
          )
          .default([]),
        impact_note: z.string().nullable().default(null),
        confidence: z.number().min(0).max(1).default(0.5),
        priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
      }),
    )
    .max(4),
});

export interface GeneratedRecommendation {
  title: string;
  summary: string;
  whyItMatters: string;
  recommendedAction: string;
  evidence: { source: string; reference: string; note?: string }[];
  impactNote: string | null;
  confidence: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Cross-cutting recommendations (§10).
 *
 * Unlike the briefing there is no deterministic equivalent worth returning:
 * combining an internal decline with an external demand shift is a judgement,
 * and a rule that fabricated one would be worse than no recommendation. So
 * without a model this returns nothing, and the interface explains why.
 */
export async function generateRecommendations(
  context: BusinessContext,
): Promise<{ recommendations: GeneratedRecommendation[]; available: boolean }> {
  if (!isAiEnabled()) return { recommendations: [], available: false };

  // Nothing to cross-reference: do not spend a call to be told so.
  if (context.metrics.length === 0 || (context.signals.length === 0 && context.opportunities.length === 0)) {
    return { recommendations: [], available: true };
  }

  try {
    const prompt = recommendationPrompt(context);
    const { value } = await completeStructured(
      {
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        maxOutputTokens: 2400,
      },
      recommendationShape,
    );

    // Per recommendation rather than for the batch. One fabricated figure
    // should cost the recommendation that carries it and not the three sound
    // ones beside it — and a caller that dropped everything would make the
    // guard expensive enough to be argued out of.
    const kept = value.recommendations.filter((r) => {
      const claimed = guardNumbers(
        [r.title, r.summary, r.why_it_matters, r.recommended_action, r.impact_note ?? ''].join(' '),
        prompt,
      );
      if (!claimed.ok) {
        console.error(
          `[amryn:ai] a recommendation was discarded — "${r.title}" contained figures that ` +
            `were not in its context: ${describeInvented(claimed)}`,
        );
      }
      return claimed.ok;
    });

    return {
      available: true,
      recommendations: kept.map((r) => ({
        title: r.title,
        summary: r.summary,
        whyItMatters: r.why_it_matters,
        recommendedAction: r.recommended_action,
        evidence: r.evidence,
        impactNote: r.impact_note,
        confidence: r.confidence,
        priority: r.priority,
      })),
    };
  } catch (error) {
    logAiFailure('recommendations', error);
    return { recommendations: [], available: true };
  }
}

/* ── assistant ─────────────────────────────────────────────────────────── */

export interface AssistantTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantAnswer {
  content: string;
  model: string | null;
  tokensUsed: number | null;
  fromModel: boolean;
}

/**
 * Answers a question about the business.
 *
 * The context passed in has already been narrowed by Row Level Security to what
 * this user may read, which is what satisfies the specification's requirement
 * that the assistant never expose data outside a user's permissions: it is not
 * a rule the model is asked to follow, it is data the model never receives.
 */
export async function askAssistant(
  context: BusinessContext,
  question: string,
  history: AssistantTurn[] = [],
): Promise<AssistantAnswer> {
  if (!isAiEnabled()) {
    return {
      content: unavailableAnswer(context),
      model: null,
      tokensUsed: null,
      fromModel: false,
    };
  }

  const messages: CompletionMessage[] = [
    { role: 'system', content: assistantPrompt(context) },
    // A long thread costs tokens and adds little; recent turns carry the intent.
    ...history.slice(-8).map((turn) => ({ role: turn.role, content: turn.content }) as const),
    { role: 'user', content: question },
  ];

  try {
    const result = await complete({ messages, temperature: 0.3 });

    /*
     * The assistant is guarded differently from the briefing, and the
     * difference is a judgement worth stating.
     *
     * There, the engines compute everything and the model only rewrites, so a
     * figure it did not receive was invented and the whole rewrite is thrown
     * away at no cost. Here somebody may reasonably ask "what is my revenue
     * per employee?", and the honest answer divides two figures that were
     * given to produce one that was not. The guard cannot tell that from
     * invention, and discarding the answer would make the assistant refuse
     * arithmetic — which is most of what it is for.
     *
     * Suppressing is wrong and staying silent is worse. So the answer stands
     * and says which of its figures the platform could not trace back to the
     * reader's own data. A person can act on that: a ratio they recognise is
     * fine, a market size nobody supplied is not.
     */
    const answer = result.text.trim();
    const claimed = guardNumbers(answer, assistantPrompt(context));

    return {
      content: claimed.ok
        ? answer
        : `${answer}\n\n---\n\nNot from your data: ${describeInvented(claimed)}. ` +
          'Everything else here comes from your own figures. Check anything above ' +
          'before acting on it — it may be arithmetic on your own numbers, and it may not be.',
      model: result.model,
      tokensUsed: result.tokensUsed,
      fromModel: true,
    };
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      return { content: unavailableAnswer(context), model: null, tokensUsed: null, fromModel: false };
    }
    /*
     * The same answer as when nothing is configured, and deliberately so.
     *
     * This branch used to apologise for not reaching "the reasoning service"
     * and then explain which parts of the platform run on "the analytical
     * engine rather than on a model" — three clauses about how Amryn is built,
     * to somebody who had asked about their business. It was written before
     * the rule that customer-facing copy never names models, engines or
     * configuration, and it is a different file from the ones that rule was
     * applied to, so it survived. Found in a screenshot, again.
     *
     * What a reader needs is the same in both cases: the figures, or one line
     * saying there are none. Whether the cause was a missing key or a gateway
     * that refused is ours to know, and the log above is where it is recorded.
     */
    logAiFailure('assistant', error);
    return { content: unavailableAnswer(context), model: null, tokensUsed: null, fromModel: false };
  }
}

function logAiFailure(operation: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[amryn:ai] ${operation} fell back to the engine: ${message}`);
}
