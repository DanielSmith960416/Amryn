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
import { cleanKey, inspectKey, projectRefFromUrl } from '@/lib/supabase/key-info';

/**
 * An unset variable and one set to an empty string are the same intent, and
 * hosting dashboards produce the second constantly — a row added, saved, and
 * never filled in. Treating them differently is how an empty optional value
 * came to fail validation and condemn the whole configuration, taking down
 * every route with it.
 */
function present(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

/**
 * The anon key, with packaging removed.
 *
 * A value stored with its quotation marks, or with a line break folded into
 * the middle of it, is rejected by Supabase as "Invalid API key" — the same
 * four words it uses for a key from the wrong project, and with nothing
 * visible in the dashboard to distinguish them. Neither character can occur in
 * a real key, so stripping them is unambiguous and fixes the deployment
 * instead of describing it.
 */
export function anonKey(): string | undefined {
  return present(cleanKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY).key);
}

/**
 * Where the Supabase project URL comes from.
 *
 * It does not have to be a setting at all. An anon key is a JWT the project
 * signs, and one of its public claims is the project's own reference — so a
 * correct key already knows which project it belongs to, and the URL can be
 * derived from it.
 *
 * This exists because requiring two settings that must agree is a design that
 * manufactures a failure mode: paste the pair from two different projects and
 * every request is answered "Invalid API key", which names neither setting.
 * One value cannot disagree with itself.
 *
 * So: an unset URL is derived, and a URL that contradicts the key defers to the
 * key. That second case is not a preference. A key issued for project A cannot
 * authenticate against project B under any circumstances, so the key's own
 * project is the only pairing with a chance of working — and it is announced
 * rather than done quietly.
 */
export type UrlSource = 'configured' | 'derived' | 'corrected';

export interface ResolvedUrl {
  url: string | undefined;
  source: UrlSource;
  /** What was done and why, when it was not simply taken as given. */
  note?: string;
}

/**
 * The project URL with any path removed.
 *
 * The Supabase client is given an origin and appends its own path — `/rest/v1`
 * for PostgREST, `/auth/v1` for auth. Handed the REST endpoint instead, which
 * is what the dashboard shows beside the keys and the obvious thing to copy,
 * it builds `…supabase.co/rest/v1/rest/v1/…` and every query returns 404.
 *
 * Nothing else catches this. `projectRefFromUrl` reads only the hostname, so
 * the ref still matches the key and no correction fires; the schema only asks
 * whether it parses as a URL, and it does. Diagnostics reports the project URL
 * as fine. Every check passes and every request fails — so the path is dropped
 * here, and said out loud rather than done quietly.
 */
function withoutPath(url: string): { url: string; discarded: string | null } {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, '');
    return { url: parsed.origin, discarded: path.length > 0 ? path : null };
  } catch {
    // Not a URL at all. Leave it be — the schema reports that far better than
    // a helper that quietly returns something else.
    return { url, discarded: null };
  }
}

export function resolveSupabaseUrl(): ResolvedUrl {
  const raw = present(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const trimmed = raw ? withoutPath(raw) : undefined;
  const configured = trimmed?.url;
  const key = anonKey();
  const ref = key ? inspectKey(key).ref : null;
  const fromKey = ref ? `https://${ref}.supabase.co` : undefined;

  if (!configured) {
    return fromKey
      ? {
          url: fromKey,
          source: 'derived',
          note: `Derived from the anon key, which was issued for project “${ref}”.`,
        }
      : { url: undefined, source: 'configured' };
  }

  const configuredRef = projectRefFromUrl(configured);
  if (fromKey && configuredRef && ref && configuredRef !== ref) {
    return {
      url: fromKey,
      source: 'corrected',
      note:
        `NEXT_PUBLIC_SUPABASE_URL names project “${configuredRef}”, but the anon key was ` +
        `issued for “${ref}”. A key cannot authenticate against another project, so the ` +
        `key’s project is being used. Correct the URL to match, or clear it — it is optional.`,
    };
  }

  if (trimmed?.discarded) {
    return {
      url: configured,
      source: 'corrected',
      note:
        `NEXT_PUBLIC_SUPABASE_URL carried the path “${trimmed.discarded}”, which has been ` +
        `dropped. The client appends its own — given the REST endpoint it would request ` +
        `${trimmed.discarded}${trimmed.discarded} and every query would return 404. Set it to ` +
        `the project URL alone.`,
    };
  }

  return { url: configured, source: 'configured' };
}

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url('NEXT_PUBLIC_SUPABASE_URL is not a valid URL. It must start with https://'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(20, 'NEXT_PUBLIC_SUPABASE_ANON_KEY looks too short to be a key'),
  NEXT_PUBLIC_SITE_URL: z
    .string()
    .url('NEXT_PUBLIC_SITE_URL is set but is not a valid URL. Clear it or set a full https:// address')
    .optional(),
});

export type PublicEnv = z.infer<typeof publicSchema>;

/**
 * What the server wrote into the document for this request, if anything.
 *
 * See src/components/shell/runtime-env.tsx for why this exists. In short: a
 * value inlined at build time cannot differ between two runs of the same
 * image, and a build that ran without it emits a bundle carrying `undefined`
 * whose only symptom is a sign-in page complaining about a key.
 */
function injected(): Partial<Record<keyof PublicEnv, string>> {
  if (typeof window === 'undefined') return {};
  const values = (window as { __AMRYN_ENV__?: Record<string, string> }).__AMRYN_ENV__;
  return values ?? {};
}

/**
 * Next.js inlines `process.env.NEXT_PUBLIC_*` at build time only when the
 * property is written out in full, so these cannot be read dynamically — which
 * is why the runtime values are preferred where the server supplied them.
 */
export function publicEnv(): PublicEnv {
  const runtime = injected();

  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: runtime.NEXT_PUBLIC_SUPABASE_URL || resolveSupabaseUrl().url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: runtime.NEXT_PUBLIC_SUPABASE_ANON_KEY || anonKey(),
    NEXT_PUBLIC_SITE_URL:
      present(runtime.NEXT_PUBLIC_SITE_URL) ?? present(process.env.NEXT_PUBLIC_SITE_URL),
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
  // The resolved URL, not the raw variable — otherwise this reports a missing
  // setting that publicEnv() goes on to derive, and the two disagree again.
  const url = resolveSupabaseUrl().url;
  const key = anonKey();

  if (!key) {
    return 'NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.';
  }
  if (!url) {
    return (
      'NEXT_PUBLIC_SUPABASE_URL is not set, and could not be worked out from the anon key. ' +
      'Set the URL, or use a key that names its project.'
    );
  }

  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: key,
    NEXT_PUBLIC_SITE_URL: present(process.env.NEXT_PUBLIC_SITE_URL),
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
  // Truthiness, not `??`: an empty string is a value, and `?? ` would return
  // it — which is how "Falling back to " came to be printed with nothing
  // after it.
  const configured = present(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured) return configured;

  // What the host calls its own address, in the order a deployment is likely
  // to have one. Each is set by the platform, not by us, so a preview
  // deployment gets its own URL without anybody configuring anything —
  // which is the whole reason to consult them rather than requiring
  // NEXT_PUBLIC_SITE_URL everywhere.
  const fromHost =
    present(process.env.RAILWAY_PUBLIC_DOMAIN) ??
    present(process.env.CF_PAGES_URL) ??
    present(process.env.RENDER_EXTERNAL_URL) ??
    present(process.env.FLY_APP_NAME);

  if (fromHost) {
    // Some report a bare hostname, others a full URL. Normalising here means
    // the caller never has to care which.
    return /^https?:\/\//i.test(fromHost) ? fromHost : `https://${fromHost}`;
  }

  return `http://localhost:${present(process.env.PORT) ?? '3000'}`;
}

/**
 * Where a customer sends the money.
 *
 * Configuration rather than code because the account is the company's, not the
 * software's, and because a deployment for a different entity — a reseller, a
 * second market — needs its own without a release. Nothing here is a secret: a
 * bank account number is printed on every invoice a business issues, and
 * treating it as one would only mean nobody could see where to pay.
 */
export interface BankDetails {
  accountName: string;
  bank: string;
  accountNumber: string;
  branchCode: string;
  swift?: string;
  /** Where proof of payment is emailed. */
  proofTo: string;
}

export function bankDetails(): BankDetails | null {
  const accountName = present(process.env.PAYMENT_ACCOUNT_NAME);
  const bank = present(process.env.PAYMENT_BANK);
  const accountNumber = present(process.env.PAYMENT_ACCOUNT_NUMBER);
  const branchCode = present(process.env.PAYMENT_BRANCH_CODE);
  const proofTo = present(process.env.PAYMENT_PROOF_EMAIL);

  // All or nothing. Half a set of banking details is worse than none: someone
  // would transfer money against an incomplete instruction and it would not
  // arrive.
  if (!accountName || !bank || !accountNumber || !branchCode || !proofTo) return null;

  return {
    accountName,
    bank,
    accountNumber,
    branchCode,
    swift: present(process.env.PAYMENT_SWIFT),
    proofTo,
  };
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

/**
 * Does this value look like a credential?
 *
 * Written after a live OpenAI key was pasted into AI_MODEL and printed, in
 * full, on a diagnostics page that anyone could load without signing in. The
 * page had been built on the rule that it reports whether a setting is present
 * and never what it contains — and the model name was the one value treated as
 * safe to show, because a model name is not a secret.
 *
 * The flaw in that reasoning is that a variable's name does not decide what is
 * in it. Any setting can receive a pasted key, so nothing derived from the
 * environment is displayable on the strength of what it was meant to hold.
 *
 * Deliberately broad. A model name wrongly withheld costs a line of a report;
 * a key wrongly shown costs the key.
 */
export function looksLikeSecret(value: string | undefined | null): boolean {
  const v = value?.trim() ?? '';
  if (v.length === 0) return false;

  // Prefixes issued by the providers this platform can talk to, plus the ones
  // most likely to be pasted in by mistake.
  if (/^(sk-|sk-proj-|sk-ant-|rk-|eyJ|sb_secret_|sb_publishable_|ghp_|gho_|github_pat_|xox[abprs]-|AIza)/i.test(v)) {
    return true;
  }

  // An http(s) address is self-evidently not a credential, and several are
  // long enough to trip the length rule below — a Supabase project URL is
  // forty characters. Withholding those would blind the report to the values
  // it exists to show.
  try {
    const { protocol } = new URL(v);
    if (protocol === 'http:' || protocol === 'https:') return false;
  } catch {
    // Not a URL. Fall through.
  }

  // No model any provider offers is this long. A 32-character opaque string in
  // a field expecting "gpt-4.1-mini" is a key.
  return v.length >= 32;
}

/** A value safe to print in a report: the shape of a secret, or the value itself. */
export function redact(value: string | undefined | null): string {
  const v = value?.trim() ?? '';
  if (v.length === 0) return 'empty';
  return looksLikeSecret(v) ? `hidden — ${v.length} characters` : v;
}

export interface AiConfig {
  provider: 'openai' | 'anthropic' | 'none';
  apiKey: string | null;
  model: string;
  /** AI_MODEL held something that looks like a credential, and was ignored. */
  modelIsSecret: boolean;
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
  // Anthropic is the default where a key is set and no provider is named.
  // It was OpenAI, from when that was the only key to hand; the deployment
  // now runs on a Claude account, and a default that quietly points a
  // Claude key at OpenAI's endpoint fails with an authentication error that
  // says nothing about the cause.
  const provider: AiConfig['provider'] =
    !apiKey || requested === 'none'
      ? 'none'
      : requested === 'openai'
        ? 'openai'
        : 'anthropic';

  const effort = process.env.AI_EFFORT?.trim().toLowerCase();

  // A key pasted into AI_MODEL is ignored rather than used. Sending it as a
  // model name would put the credential in a request body and a provider's
  // logs, and the request would 404 regardless — so the default model is used
  // and the mistake is reported instead.
  const requestedModel = process.env.AI_MODEL?.trim();
  const modelIsSecret = looksLikeSecret(requestedModel);
  const model =
    (modelIsSecret ? undefined : requestedModel) ||
    (provider === 'none' ? DEFAULT_MODEL.anthropic : DEFAULT_MODEL[provider]);

  return {
    provider,
    apiKey: provider === 'none' ? null : apiKey,
    modelIsSecret,
    model,
    // Adaptive thinking spends tokens from this same budget, so a small ceiling
    // truncates the answer rather than the reasoning.
    maxOutputTokens: Number.parseInt(process.env.AI_MAX_OUTPUT_TOKENS ?? '16000', 10) || 16000,
    effort:
      effort === 'low' || effort === 'medium' || effort === 'high' || effort === 'xhigh' || effort === 'max'
        ? effort
        : 'high',
  };
}
