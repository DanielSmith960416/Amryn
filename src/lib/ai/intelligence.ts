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
import type { BusinessContext, ExecutiveBriefing } from '@/types/intelligence';

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
    const { value } = await completeStructured(
      {
        messages: [{ role: 'user', content: briefingPrompt(context, findings) }],
        temperature: 0.3,
      },
      briefingShape,
    );

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
    const { value } = await completeStructured(
      {
        messages: [{ role: 'user', content: recommendationPrompt(context) }],
        temperature: 0.4,
        maxOutputTokens: 2400,
      },
      recommendationShape,
    );

    return {
      available: true,
      recommendations: value.recommendations.map((r) => ({
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
    return {
      content: result.text.trim(),
      model: result.model,
      tokensUsed: result.tokensUsed,
      fromModel: true,
    };
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      return { content: unavailableAnswer(context), model: null, tokensUsed: null, fromModel: false };
    }
    logAiFailure('assistant', error);
    return {
      content:
        'I could not reach the reasoning service just then. Everything else on the platform is ' +
        'unaffected — the Command Centre, the Digital Twin and the radar all run on the ' +
        'analytical engine rather than on a model. Try the question again in a moment.',
      model: null,
      tokensUsed: null,
      fromModel: false,
    };
  }
}

/**
 * What the assistant says when no model is configured: an honest account of
 * what the platform does know, rather than an error.
 */
function unavailableAnswer(context: BusinessContext): string {
  const lines = [
    'The conversational assistant needs an AI provider, and none is configured on this deployment.',
    '',
    'Everything else still works — the health score, change detection, opportunity scoring and the ' +
      'executive briefing are computed by Amryn\'s own engines, not by a model. Here is where things stand:',
    '',
  ];

  if (context.health) {
    lines.push(`· Business health is ${Math.round(context.health.score)} of 100 (${context.health.classification}).`);
  }
  if (context.anomalies.length > 0) {
    lines.push(`· ${context.anomalies.length} metric${context.anomalies.length === 1 ? '' : 's'} showed a change worth investigating.`);
  }
  const openRisks = context.risks.filter((r) => r.status === 'open').length;
  if (openRisks > 0) lines.push(`· ${openRisks} open risk${openRisks === 1 ? '' : 's'} on the register.`);

  const live = context.opportunities.filter((o) => !['won', 'lost', 'archived'].includes(o.stage));
  if (live.length > 0) lines.push(`· ${live.length} live opportunit${live.length === 1 ? 'y' : 'ies'} on the radar.`);

  lines.push('', 'Set AI_API_KEY in the environment to enable conversational answers.');
  return lines.join('\n');
}

function logAiFailure(operation: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[amryn:ai] ${operation} fell back to the engine: ${message}`);
}
