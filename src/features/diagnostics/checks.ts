import 'server-only';

/**
 * Self-diagnosis.
 *
 * Everything the platform needs in order to work, checked one item at a time
 * and reported in words. This exists because the alternative — telling someone
 * to search their host's runtime logs for a digest — is not a reasonable thing
 * to ask of the person who owns the business. A deployment that cannot explain
 * its own state is unfinished.
 *
 * Two properties this file has to hold, both learned by getting them wrong:
 *
 *   · Every check catches its own failure. A diagnostics page that crashes is
 *     worse than none at all.
 *   · Every check is bounded in time, and they run concurrently. Sequentially,
 *     six checks each waiting out a timeout outlive a serverless function's
 *     budget, and the page is killed and returned as the same opaque error it
 *     exists to replace.
 *
 * Nothing here reveals a secret. Variables are reported present or absent,
 * never by value.
 */
import { createClient } from '@/lib/supabase/server';
import { aiConfig, resolveSupabaseUrl, siteUrl, supabaseConfigError } from '@/lib/env';
import { judgeAnonKey } from '@/lib/supabase/key-info';

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'skipped';

export interface Check {
  name: string;
  status: CheckStatus;
  detail: string;
  /** What to do about it, when there is something to do. */
  remedy?: string;
}

export interface DiagnosticsReport {
  checks: Check[];
  summary: { ok: number; warn: number; fail: number };
  generatedAt: string;
  /** Which build answered. Without this, "is my fix live yet?" is a guess. */
  build: { commit: string | null; ref: string | null; deployedAt: string | null };
}

function isUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Long enough for a healthy round trip, short enough to stay inside a function budget. */
const CHECK_TIMEOUT_MS = 4_000;

/**
 * Supabase sometimes returns an error with an empty message — a count query
 * against an unreachable host, for one. Reporting "Could not read the
 * catalogue:" followed by nothing is worse than saying so plainly.
 */
function describe(message: string | undefined | null): string {
  const text = message?.trim();
  // "which usually means the request never arrived" used to be appended here.
  // It was a guess presented as a finding, and it was wrong in the case that
  // matters most: a rejected key returns an empty message on a count query,
  // so three checks blamed the network for an authentication failure and sent
  // the reader to re-run migrations that were already applied.
  return text && text.length > 0 ? text : 'no reason given';
}

/**
 * True when an error is the database refusing the key rather than answering.
 *
 * Worth singling out because it invalidates every other reading: nothing
 * downstream can be attempted, so nothing downstream should be reported as a
 * finding of its own.
 */
function isKeyRejection(message: string | undefined | null): boolean {
  return /invalid api key|no api key|jwt|not authorized|unauthorized/i.test(message ?? '');
}

/** Runs a check, bounded in time, turning any throw into a reportable failure. */
async function attempt(name: string, run: () => Promise<Check>, onThrow?: string): Promise<Check> {
  const timeout = new Promise<Check>((resolve) => {
    setTimeout(() => {
      resolve({
        name,
        status: 'fail',
        detail: `No answer within ${CHECK_TIMEOUT_MS / 1000} seconds.`,
        remedy:
          'The database did not respond. Check the project is not paused, and that the URL points at the right project.',
      });
    }, CHECK_TIMEOUT_MS);
  });

  try {
    return await Promise.race([run(), timeout]);
  } catch (error) {
    return {
      name,
      status: 'fail',
      detail: error instanceof Error ? error.message : String(error),
      remedy: onThrow ?? 'This check threw unexpectedly, which is itself the finding.',
    };
  }
}

export async function runDiagnostics(): Promise<DiagnosticsReport> {
  const configProblem = supabaseConfigError();

  // Report per variable. A single lumped verdict blamed "Supabase
  // configuration" for a fault in NEXT_PUBLIC_SITE_URL, which sent the reader
  // to check two settings that were already correct.
  // The resolved URL, not the raw variable: an unset URL is derived from the
  // anon key, and one that contradicts the key defers to it. Reporting the raw
  // value here would describe a setting the application is not using.
  const resolved = resolveSupabaseUrl();
  const supabaseUrl = resolved.url;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  const configuration: Check[] = [
    {
      name: 'Supabase project URL',
      status: !supabaseUrl
        ? 'fail'
        : !isUrl(supabaseUrl)
          ? 'fail'
          : resolved.source === 'corrected'
            ? 'warn'
            : 'ok',
      detail: !supabaseUrl
        ? 'NEXT_PUBLIC_SUPABASE_URL is not set, and there is no anon key to work it out from.'
        : !isUrl(supabaseUrl)
          ? `Set to “${supabaseUrl}”, which is not a valid URL.`
          : resolved.source === 'configured'
            ? `Set to ${supabaseUrl}.`
            : `Using ${supabaseUrl}. ${resolved.note}`,
      remedy: !supabaseUrl
        ? 'Set the anon key — the URL is worked out from it. Then redeploy: values added after a build are not in the bundle until the next one.'
        : !isUrl(supabaseUrl)
          ? 'It must be the full address including https:// — for example https://your-project.supabase.co'
          : resolved.source === 'corrected'
            ? 'The application is working regardless. Clearing NEXT_PUBLIC_SUPABASE_URL entirely is the tidiest fix — it is optional.'
            : undefined,
    },
    {
      // Length alone said "long enough to be a real key" about a key Supabase
      // was rejecting outright. judgeAnonKey reads what the key says about
      // itself — which project issued it, which role it carries, when it
      // expires — and reports the specific fault instead.
      name: 'Supabase anon key',
      ...judgeAnonKey(anonKey, supabaseUrl),
    },
    {
      name: 'Site URL',
      status: !configuredSiteUrl ? 'warn' : isUrl(configuredSiteUrl) ? 'ok' : 'fail',
      detail: !configuredSiteUrl
        ? `Not set. Sign-in links will point at ${siteUrl()}.`
        : isUrl(configuredSiteUrl)
          ? `Set to ${configuredSiteUrl}. Sign-in links point here.`
          : `Set to “${configuredSiteUrl}”, which is not a valid URL.`,
      remedy: !configuredSiteUrl
        ? 'Optional, but setting it to the deployment’s address makes email links resolve predictably.'
        : isUrl(configuredSiteUrl)
          ? undefined
          : 'Either clear it entirely or give it a full https:// address. An empty or partial value is worse than none.',
    },
  ];

  const optional: Check = aiCheck();

  if (configProblem) {
    const skipped: Check[] = [
      'Supabase reachable',
      'Database schema',
      'Role grants',
      'Organisation setup',
      'Row Level Security',
      'Current session',
      'Your organisation',
    ].map((name) => ({
      name,
      status: 'skipped' as const,
      detail: 'Skipped — there is no configuration to connect with.',
    }));
    return summarise([...configuration, ...skipped, optional]);
  }

  const [reachable, ...rest] = await Promise.all([
    checkReachable(),
    checkSchema(),
    checkRoleGrants(),
    checkBootstrapFunction(),
    checkRowLevelSecurity(),
    checkSession(),
    checkMembership(),
  ]);

  // They run together to stay inside a serverless function's budget, but they
  // are not independent. If the key was refused, every one of the others failed
  // for that reason and for no other — reporting each as its own red finding
  // manufactures four problems out of one and points at the wrong repairs.
  const connected =
    reachable.status === 'fail' && isKeyRejection(reachable.detail)
      ? [
          reachable,
          ...rest.map((check) => ({
            name: check.name,
            status: 'skipped' as const,
            detail: 'Not checked — the database refused the key, so nothing could be read.',
          })),
        ]
      : [reachable, ...rest];

  return summarise([...configuration, ...connected, optional]);
}

/* ── individual checks ─────────────────────────────────────────────────── */

function checkReachable(): Promise<Check> {
  return attempt(
    'Supabase reachable',
    async () => {
      const supabase = await createClient();
      const { error } = await supabase.from('permissions').select('key').limit(1);
      if (error) {
        const missing = error.message.toLowerCase().includes('does not exist');
        return {
          name: 'Supabase reachable',
          status: 'fail',
          detail: `The database rejected a read — ${describe(error.message)}.`,
          remedy: missing
            ? 'The migrations have not been applied. Run everything in supabase/migrations in filename order.'
            : isKeyRejection(error.message)
              ? 'The key was refused. See the “Supabase anon key” check above — it says which fault this is. Nothing below could be checked.'
              : 'Check the project is not paused, and that the URL points at the right project.',
        };
      }
      return {
        name: 'Supabase reachable',
        status: 'ok',
        detail: 'Connected, and a read was accepted.',
      };
    },
    'The connection attempt threw. The project may be paused or unreachable, or the URL may point somewhere unexpected.',
  );
}

function checkSchema(): Promise<Check> {
  return attempt('Database schema', async () => {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from('permissions')
      .select('key', { count: 'exact', head: true });
    if (error) {
      return {
        name: 'Database schema',
        status: 'fail',
        detail: `Could not read the permission catalogue — ${describe(error.message)}.`,
        remedy: 'Apply the files in supabase/migrations in filename order.',
      };
    }
    const found = count ?? 0;
    return {
      name: 'Database schema',
      status: found === 30 ? 'ok' : 'warn',
      detail:
        found === 30
          ? 'All 30 permissions are present, so the migrations applied.'
          : `Found ${found} permissions, expected 30.`,
      remedy:
        found === 30
          ? undefined
          : 'A migration was skipped or applied out of order. Run supabase/tests/verify-remote.sql for the full picture.',
    };
  });
}

function checkRoleGrants(): Promise<Check> {
  return attempt('Role grants', async () => {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from('role_permissions')
      .select('role', { count: 'exact', head: true });
    if (error) {
      return {
        name: 'Role grants',
        status: 'fail',
        detail: `Could not read role grants — ${describe(error.message)}.`,
        remedy: 'Apply migration 06, which seeds the role matrix.',
      };
    }
    const found = count ?? 0;
    return {
      name: 'Role grants',
      status: found > 100 ? 'ok' : 'warn',
      detail: `${found} role grants. Without these, a signed-in user would see nothing.`,
      remedy: found > 100 ? undefined : 'Apply migration 06, which seeds the role matrix.',
    };
  });
}

/**
 * Can the app still create an organisation?
 *
 * Tables were checked and functions were not, so a missing or unreachable
 * create_organisation() surfaced at the worst possible moment — on the
 * onboarding form, to someone who had just signed up, as a paragraph of
 * PostgREST internals.
 *
 * The probe is a real call, because only a real call goes through the same
 * cache that was stale. It creates nothing, in any of the three states a
 * caller can be in:
 *
 *   · Signed out, the grant excludes anon, so the database refuses on
 *     permission before the body runs.
 *   · Signed in, an empty name fails the organisations check constraint on the
 *     first insert, and an error inside a function rolls the whole call back.
 *   · Absent, PostgREST answers PGRST202 without reaching the database.
 *
 * Only the third is a finding. The other two prove the function is there,
 * which is the whole question.
 */
function checkBootstrapFunction(): Promise<Check> {
  return attempt('Organisation setup', async () => {
    const supabase = await createClient();
    const { error } = await supabase.rpc('create_organisation', {
      p_name: '',
      p_slug: '',
      p_industry: null,
      p_country_code: 'ZA',
      p_currency_code: 'ZAR',
    });

    const missing =
      error?.code === 'PGRST202' || /could not find the function/i.test(error?.message ?? '');

    if (missing) {
      return {
        name: 'Organisation setup',
        status: 'fail',
        detail:
          'The create_organisation function cannot be reached, so nobody can finish signing up.',
        // The SQL itself, not a file path. A remedy that sends someone to find
        // a file in a repository on their phone is a remedy they will not
        // apply. Supabase answers from a cached copy of the schema, and
        // applying migrations by hand never refreshes it, so the one-line
        // reload is both the likeliest fix and the cheapest thing to try.
        remedy:
          'In Supabase → SQL Editor, run:  notify pgrst, \'reload schema\';  — Supabase answers from a cached copy of your schema, and applying migrations by hand does not refresh it, so a function that exists can stay invisible. If this check is still red afterwards, the function really is missing: run supabase/migrations/20260830190000_08_organisation_bootstrap_rpc.sql, which creates it and reloads the cache.',
      };
    }

    return {
      name: 'Organisation setup',
      status: 'ok',
      detail: 'The create_organisation function is present and reachable.',
    };
  });
}

function checkRowLevelSecurity(): Promise<Check> {
  return attempt('Row Level Security', async () => {
    const supabase = await createClient();
    // Signed out, this must return nothing. A row here would mean tenant
    // isolation is not being enforced, which matters more than any outage.
    const { data, error } = await supabase.from('organisations').select('id').limit(1);

    if (error) {
      // Every error used to be read as proof that the database had refused the
      // read, and reported green. It is not proof of anything: a refused key,
      // a paused project and a table that does not exist all produce an error,
      // and all of them left this check announcing that tenant isolation was
      // working when it had tested nothing at all.
      //
      // A security check must never infer safety from a failure it does not
      // understand, so only an explicit permission denial counts as evidence.
      const denied = /permission denied|row-level security|not authorized/i.test(error.message);
      const missing = /does not exist/i.test(error.message);

      if (denied) {
        return {
          name: 'Row Level Security',
          status: 'ok',
          detail: 'The database explicitly denied an unauthenticated read, which is correct.',
        };
      }

      return {
        name: 'Row Level Security',
        status: 'fail',
        detail: missing
          ? 'Could not be checked: the organisations table does not exist.'
          : `Could not be checked — ${describe(error.message)}.`,
        remedy: missing
          ? 'Apply the files in supabase/migrations in filename order, then reload this page.'
          : 'Isolation is unverified until this read succeeds. Fix the failures above, then reload this page.',
      };
    }

    const leaked = (data ?? []).length > 0;
    return {
      name: 'Row Level Security',
      status: leaked ? 'fail' : 'ok',
      detail: leaked
        ? 'An unauthenticated read returned a row. Tenant isolation is not being enforced.'
        : 'An unauthenticated read returned nothing, which is correct.',
      remedy: leaked
        ? 'Apply migrations 04 and 05, which enable Row Level Security and its policies.'
        : undefined,
    };
  });
}

function checkSession(): Promise<Check> {
  return attempt(
    'Current session',
    async () => {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        return {
          name: 'Current session',
          status: 'ok',
          detail: 'Nobody is signed in on this browser. Expected before you sign in.',
        };
      }
      return {
        name: 'Current session',
        status: 'ok',
        detail: `Signed in as ${data.user.email ?? data.user.id}.`,
      };
    },
    'Resolving the session threw, which would break every page that needs one.',
  );
}

function checkMembership(): Promise<Check> {
  return attempt('Your organisation', async () => {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      return {
        name: 'Your organisation',
        status: 'skipped',
        detail: 'Sign in first, then this shows which organisations you belong to.',
      };
    }

    const { data, error } = await supabase
      .from('organisation_members')
      .select('organisation_id, role, status')
      .eq('user_id', userData.user.id);

    if (error) {
      return {
        name: 'Your organisation',
        status: 'fail',
        detail: `Could not read your membership — ${describe(error.message)}.`,
        remedy: 'Apply migrations 01 and 04.',
      };
    }

    const active = (data ?? []).filter((m) => m.status === 'active');
    return {
      name: 'Your organisation',
      status: active.length > 0 ? 'ok' : 'warn',
      detail:
        active.length > 0
          ? `Active member of ${active.length} organisation${active.length === 1 ? '' : 's'}.`
          : 'Signed in, but belonging to no organisation yet.',
      remedy: active.length > 0 ? undefined : 'Go to /onboarding to create one.',
    };
  });
}

function aiCheck(): Check {
  const ai = aiConfig();

  // A model name belonging to the other provider is a 404 at request time,
  // long after anyone would connect it to the setting that caused it.
  const looksMismatched =
    (ai.provider === 'anthropic' && /^(gpt|o[0-9])/i.test(ai.model)) ||
    (ai.provider === 'openai' && /^claude/i.test(ai.model));

  if (looksMismatched) {
    return {
      name: 'AI provider',
      status: 'fail',
      detail: `AI_PROVIDER is ${ai.provider} but AI_MODEL is ${ai.model}, which belongs to the other provider.`,
      remedy: 'Clear AI_MODEL to take the provider’s default, or set one that provider recognises.',
    };
  }

  return {
    name: 'AI provider',
    status: ai.provider === 'none' ? 'warn' : 'ok',
    detail:
      ai.provider === 'none'
        ? 'None configured. The platform runs on its own analytical engines; only the assistant and cross-cutting recommendations are unavailable.'
        : `${ai.provider}, model ${ai.model}, effort ${ai.effort}. The assistant and cross-cutting recommendations are available.`,
    remedy:
      ai.provider === 'none'
        ? 'Optional. Set AI_API_KEY to enable conversational answers.'
        : undefined,
  };
}

function summarise(checks: Check[]): DiagnosticsReport {
  return {
    checks,
    summary: {
      ok: checks.filter((c) => c.status === 'ok').length,
      warn: checks.filter((c) => c.status === 'warn').length,
      fail: checks.filter((c) => c.status === 'fail').length,
    },
    generatedAt: new Date().toISOString(),
    build: buildInfo(),
  };
}

/**
 * Which commit this build came from.
 *
 * A fix that is merged but not deployed looks exactly like a fix that did not
 * work, and telling them apart otherwise means comparing wording between
 * screenshots. Vercel sets these; other hosts may not, in which case the page
 * says so rather than implying it knows.
 */
function buildInfo(): DiagnosticsReport['build'] {
  const commit =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GITHUB_SHA ??
    process.env.SOURCE_COMMIT ??
    null;

  return {
    commit: commit ? commit.slice(0, 7) : null,
    ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    deployedAt: process.env.VERCEL_DEPLOYMENT_ID ? null : null,
  };
}
