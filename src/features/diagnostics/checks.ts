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
import { aiConfig, siteUrl, supabaseConfigError } from '@/lib/env';

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
  return text && text.length > 0 ? text : 'no reason given, which usually means the request never arrived';
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

  const configuration: Check[] = [
    {
      name: 'Supabase configuration',
      status: configProblem ? 'fail' : 'ok',
      detail: configProblem ?? 'Project URL and anon key are present and well-formed.',
      remedy: configProblem
        ? 'Set these in your host’s environment settings, then redeploy. Values added after a build are not in the bundle until the next one.'
        : undefined,
    },
    {
      name: 'Site URL',
      status: process.env.NEXT_PUBLIC_SITE_URL ? 'ok' : 'warn',
      detail: process.env.NEXT_PUBLIC_SITE_URL
        ? `Set to ${process.env.NEXT_PUBLIC_SITE_URL}. Sign-in links point here.`
        : `Not set. Falling back to ${siteUrl()}, which is where sign-in links will point.`,
      remedy: process.env.NEXT_PUBLIC_SITE_URL
        ? undefined
        : 'Set NEXT_PUBLIC_SITE_URL to the deployment’s address so email links resolve predictably.',
    },
  ];

  const optional: Check = aiCheck();

  if (configProblem) {
    const skipped: Check[] = [
      'Supabase reachable',
      'Database schema',
      'Role grants',
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

  const connected = await Promise.all([
    checkReachable(),
    checkSchema(),
    checkRoleGrants(),
    checkRowLevelSecurity(),
    checkSession(),
    checkMembership(),
  ]);

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
            : 'Check the anon key belongs to this project, and that the project is not paused.',
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

function checkRowLevelSecurity(): Promise<Check> {
  return attempt('Row Level Security', async () => {
    const supabase = await createClient();
    // Signed out, this must return nothing. A row here would mean tenant
    // isolation is not being enforced, which matters more than any outage.
    const { data, error } = await supabase.from('organisations').select('id').limit(1);
    if (error) {
      return {
        name: 'Row Level Security',
        status: 'ok',
        detail: 'The database refused an unauthenticated read, which is correct.',
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
  return {
    name: 'AI provider',
    status: ai.provider === 'none' ? 'warn' : 'ok',
    detail:
      ai.provider === 'none'
        ? 'None configured. The platform runs on its own analytical engines; only the assistant and cross-cutting recommendations are unavailable.'
        : `${ai.provider} configured, model ${ai.model}.`,
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
  };
}
