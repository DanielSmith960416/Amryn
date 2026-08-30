/**
 * Environment access, validated once at the edge of the process.
 *
 * Two rules this file exists to enforce:
 *   1. A missing variable fails loudly here, not as `undefined` three layers in.
 *   2. Server-only secrets are read through functions that are never reachable
 *      from a client component, so a stray import is a build error rather than
 *      a leaked service-role key.
 */
import { z } from 'zod';

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL must be a URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is missing'),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
});

export type PublicEnv = z.infer<typeof publicSchema>;

/**
 * Next.js inlines `process.env.NEXT_PUBLIC_*` at build time only when the
 * property is written out in full, so these cannot be read dynamically.
 */
export function publicEnv(): PublicEnv {
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });

  if (!parsed.success) {
    throw new Error(
      `Supabase is not configured. Copy .env.example to .env.local and fill it in.\n${parsed.error.issues
        .map((i) => `  · ${i.message}`)
        .join('\n')}`,
    );
  }
  return parsed.data;
}

/**
 * Why Supabase cannot be reached, in words a reader can act on — or null when
 * it can.
 *
 * This runs the same validation as `publicEnv()` rather than merely checking
 * the variables are non-empty. Two checks that disagree are worse than one:
 * a URL missing its scheme used to pass the weaker check and then throw inside
 * `publicEnv()`, turning a typo into a server-side exception.
 */
export function supabaseConfigError(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const missing: string[] = [];
  if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!key) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (missing.length > 0) {
    return `${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not set.`;
  }

  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: key,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });
  if (!parsed.success) {
    return parsed.error.issues.map((i) => i.message).join(' ');
  }
  return null;
}

/** True when the app has enough valid configuration to talk to Supabase. */
export function isSupabaseConfigured(): boolean {
  return supabaseConfigError() === null;
}

export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  );
}

/** Server-only. Throws if called where it could reach a browser bundle. */
export function serviceRoleKey(): string {
  if (typeof window !== 'undefined') {
    throw new Error('serviceRoleKey() must never be called in the browser');
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for this operation');
  }
  return key;
}

export interface AiConfig {
  provider: 'openai' | 'anthropic' | 'none';
  apiKey: string | null;
  model: string;
  maxOutputTokens: number;
  /** How hard the model should work. Claude only; ignored elsewhere. */
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}

/**
 * The default model per provider.
 *
 * These are not interchangeable strings: a model name sent to the wrong
 * provider is a 404, and a single shared default silently breaks whichever
 * provider it does not belong to.
 */
const DEFAULT_MODEL: Record<'openai' | 'anthropic', string> = {
  openai: 'gpt-4.1-mini',
  anthropic: 'claude-opus-5',
};

/**
 * The AI layer is optional by design. With no key configured the platform runs
 * its deterministic engines instead of a model, and says so in the interface.
 */
export function aiConfig(): AiConfig {
  const apiKey = process.env.AI_API_KEY?.trim() || null;
  const requested = process.env.AI_PROVIDER?.trim().toLowerCase();
  const provider: AiConfig['provider'] =
    !apiKey || requested === 'none'
      ? 'none'
      : requested === 'anthropic'
        ? 'anthropic'
        : 'openai';

  const effort = process.env.AI_EFFORT?.trim().toLowerCase();

  return {
    provider,
    apiKey: provider === 'none' ? null : apiKey,
    model:
      process.env.AI_MODEL?.trim() ||
      (provider === 'none' ? DEFAULT_MODEL.openai : DEFAULT_MODEL[provider]),
    // Adaptive thinking spends tokens from this same budget, so a small ceiling
    // truncates the answer rather than the reasoning.
    maxOutputTokens: Number.parseInt(process.env.AI_MAX_OUTPUT_TOKENS ?? '16000', 10) || 16000,
    effort:
      effort === 'low' || effort === 'medium' || effort === 'high' || effort === 'xhigh' || effort === 'max'
        ? effort
        : 'high',
  };
}
