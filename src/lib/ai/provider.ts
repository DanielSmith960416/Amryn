import 'server-only';

/**
 * The AI abstraction layer (specification §25).
 *
 * One interface, several providers, and a real answer when there is no
 * provider at all. Everything above this file talks to `complete()` and
 * `completeStructured()` and never to a vendor SDK, so swapping model or
 * vendor is a change here and nowhere else.
 *
 * The `none` provider is not a stub. When no key is configured the platform
 * falls back to its deterministic engines, and the interface says so rather
 * than pretending. An unconfigured Amryn is a smaller product, not a broken one.
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { aiConfig, type AiConfig } from '@/lib/env';

export interface CompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  messages: CompletionMessage[];
  /** Lower is more repeatable. Analysis defaults low on purpose. */
  temperature?: number;
  maxOutputTokens?: number;
}

export interface CompletionResult {
  text: string;
  model: string;
  tokensUsed: number | null;
  /** False when the deterministic engine answered instead of a model. */
  fromModel: boolean;
}

export class AiUnavailableError extends Error {
  constructor(message = 'No AI provider is configured') {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

/** Raised when a model returns something that is not the shape we asked for. */
export class AiResponseError extends Error {
  readonly raw: string;

  constructor(message: string, raw: string) {
    super(message);
    this.name = 'AiResponseError';
    this.raw = raw;
  }
}

export function isAiEnabled(): boolean {
  return aiConfig().provider !== 'none';
}

const REQUEST_TIMEOUT_MS = 45_000;

export async function complete(request: CompletionRequest): Promise<CompletionResult> {
  const config = aiConfig();
  if (config.provider === 'none' || !config.apiKey) {
    throw new AiUnavailableError();
  }

  return config.provider === 'anthropic'
    ? completeAnthropic(request, config)
    : completeOpenAi(request, config);
}

/**
 * Asks for JSON matching a schema and validates it before returning.
 *
 * Retries once on a shape mismatch, quoting the validation error back to the
 * model — models correct a named error far more reliably than a repeated
 * prompt. A second failure throws, and the caller falls back to the engine.
 */
export async function completeStructured<T>(
  request: CompletionRequest,
  schema: z.ZodType<T>,
): Promise<{ value: T; result: CompletionResult }> {
  const first = await complete(request);

  const parsed = parseJson(first.text, schema);
  if (parsed.ok) return { value: parsed.value, result: first };

  const retry = await complete({
    ...request,
    messages: [
      ...request.messages,
      { role: 'assistant', content: first.text },
      {
        role: 'user',
        content:
          `That response did not match the required shape: ${parsed.error}. ` +
          'Reply again with JSON only — no prose, no code fences — matching the schema exactly.',
      },
    ],
  });

  const second = parseJson(retry.text, schema);
  if (second.ok) return { value: second.value, result: retry };

  throw new AiResponseError(`Model did not return the requested shape: ${second.error}`, retry.text);
}

function parseJson<T>(
  text: string,
  schema: z.ZodType<T>,
): { ok: true; value: T } | { ok: false; error: string } {
  // Models wrap JSON in fences often enough that stripping them is cheaper
  // than another round trip.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  let raw: unknown;
  try {
    raw = JSON.parse(cleaned);
  } catch {
    return { ok: false, error: 'the response was not valid JSON' };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      error: result.error.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join('; '),
    };
  }
  return { ok: true, value: result.data };
}

/* ── providers ─────────────────────────────────────────────────────────── */

async function completeOpenAi(
  request: CompletionRequest,
  config: AiConfig,
): Promise<CompletionResult> {
  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxOutputTokens ?? config.maxOutputTokens,
    }),
  });

  const body: unknown = await response.json();
  if (!response.ok) {
    throw new Error(`OpenAI request failed (${response.status}): ${describeError(body)}`);
  }

  const parsed = openAiResponse.safeParse(body);
  if (!parsed.success) {
    throw new AiResponseError('Unexpected response shape from OpenAI', JSON.stringify(body));
  }

  return {
    text: parsed.data.choices[0]?.message.content ?? '',
    model: parsed.data.model,
    tokensUsed: parsed.data.usage?.total_tokens ?? null,
    fromModel: true,
  };
}

/**
 * Claude, through the official SDK.
 *
 * Three things this gets right that a hand-rolled fetch did not:
 *
 *   · No `temperature`. Sampling parameters were removed on the Claude 5
 *     family and return a 400 — the previous implementation sent one on every
 *     request, so this path could never have worked.
 *   · Adaptive thinking. The work here is business analysis, which is exactly
 *     what it is for; depth is controlled by effort rather than a token budget.
 *   · The system prompt is its own parameter, not a message. Anthropic takes
 *     it separately, and a system-role message is not the same thing.
 */
async function completeAnthropic(
  request: CompletionRequest,
  config: AiConfig,
): Promise<CompletionResult> {
  const client = new Anthropic({
    apiKey: config.apiKey ?? undefined,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 2,
  });

  const system = request.messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');

  const conversation = request.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const response = await client.messages.create({
    model: config.model,
    max_tokens: request.maxOutputTokens ?? config.maxOutputTokens,
    ...(system ? { system } : {}),
    messages: conversation,
    thinking: { type: 'adaptive' },
    output_config: { effort: config.effort },
  });

  // A safety decline is a real answer, not an exception. Surfacing it lets the
  // caller fall back to the engine rather than retrying into the same wall.
  if (response.stop_reason === 'refusal') {
    throw new AiResponseError(
      'The model declined this request.',
      JSON.stringify(response.stop_details ?? {}),
    );
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return {
    text,
    model: response.model,
    tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
    fromModel: true,
  };
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function describeError(body: unknown): string {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const error = (body as { error: unknown }).error;
    if (typeof error === 'object' && error !== null && 'message' in error) {
      return String((error as { message: unknown }).message);
    }
  }
  return 'no detail returned';
}

const openAiResponse = z.object({
  model: z.string(),
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })),
  usage: z.object({ total_tokens: z.number() }).optional(),
});

