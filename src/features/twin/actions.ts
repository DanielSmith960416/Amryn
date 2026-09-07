'use server';

/**
 * Writing a scenario, and asking for it to be run.
 *
 * ── two different kinds of write, deliberately on different paths ─────────
 *
 * A scenario is an ordinary row. It goes through PostgREST under the
 * customer's own session, past the insert and update policies migration 29
 * attached, and if the caller has no business writing it the database refuses
 * — not this file.
 *
 * A simulation is not. job_runs has no write policy and is not getting one, so
 * asking for a run goes through public.request_simulation, which knows the
 * only two kinds of job it may queue. Everything worth enforcing about that
 * request — the permission, the switch, whose scenario it is, whether one is
 * already in flight — is enforced there rather than here, because a rule in an
 * action is a rule that holds only for callers who came through the action.
 *
 * ── why the ceilings are here and not only in the database ────────────────
 *
 * The database says a multiplier must be positive and a horizon at most three
 * years. This adds an upper bound on the multipliers, and it is a judgement
 * rather than a constraint: past about ten times, "nothing outside the
 * business changes" stops being a simplification and becomes a fiction — the
 * same reasoning migration 29 used for the horizon. A question whose answer
 * cannot mean anything is worth refusing at the point somebody asks it.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { recordEvent } from '@/lib/audit';
import { ourFault } from '@/lib/errors';

export type ScenarioState =
  | { status: 'idle' }
  | { status: 'saved'; message: string }
  | { status: 'queued'; message: string }
  | { status: 'error'; message: string; values?: Record<string, string> };

const STUDIO = '/digital-twin/scenarios';

/** Past ten times, see the note at the top of this file. */
const MULTIPLIER = z.coerce
  .number()
  .gt(0, 'A multiplier has to be greater than zero — zero is a business that stopped.')
  .lte(10, 'Ten times is the ceiling. Past it, "nothing else changes" is a fiction rather than a simplification.');

const scenario = z.object({
  id: z.string().uuid().optional(),
  name: z
    .string()
    .trim()
    .min(1, 'Give the scenario a name — it is how you will tell two answers apart.')
    .max(80, 'Keep the name under eighty characters.'),
  description: z.string().trim().max(400).optional().or(z.literal('')),
  demandMultiplier: MULTIPLIER,
  priceMultiplier: MULTIPLIER,
  horizonDays: z.coerce
    .number()
    .int()
    .min(1, 'A horizon needs at least one day.')
    .max(1095, 'Three years is the ceiling, because past it the model is describing a different business.'),
});

const fail = (message: string, values?: Record<string, string>): ScenarioState => ({
  status: 'error',
  message,
  ...(values ? { values } : {}),
});

/* ── writing one ───────────────────────────────────────────────────────── */

/**
 * Creates or updates a scenario.
 *
 * The first scenario an organisation writes becomes its baseline — "carry on
 * as you are" — because every other scenario needs one thing to be read
 * against, and a studio whose first question has nothing to compare with
 * teaches people to read a percentile on its own.
 */
export async function saveScenario(
  _previous: ScenarioState,
  form: FormData,
): Promise<ScenarioState> {
  const workspace = await requirePermission('manage_organisation');

  const raw = {
    id: (form.get('id') as string) || undefined,
    name: (form.get('name') as string) ?? '',
    description: (form.get('description') as string) ?? '',
    demandMultiplier: (form.get('demandMultiplier') as string) ?? '1',
    priceMultiplier: (form.get('priceMultiplier') as string) ?? '1',
    horizonDays: (form.get('horizonDays') as string) ?? '90',
  };

  // Everything typed, carried back, so a rejected save does not also throw the
  // reader's work away.
  const typed: Record<string, string> = {
    name: raw.name,
    description: raw.description,
    demandMultiplier: raw.demandMultiplier,
    priceMultiplier: raw.priceMultiplier,
    horizonDays: raw.horizonDays,
  };

  const parsed = scenario.safeParse(raw);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'That scenario could not be saved.', typed);
  }

  const input = parsed.data;
  const supabase = await createClient();
  const organisationId = workspace.organisation.id;

  const { count } = await supabase
    .from('twin_scenarios')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', organisationId);

  const values = {
    organisation_id: organisationId,
    name: input.name,
    description: input.description ? input.description : null,
    demand_multiplier: input.demandMultiplier,
    price_multiplier: input.priceMultiplier,
    horizon_days: input.horizonDays,
  };

  const { error } = input.id
    ? await supabase
        .from('twin_scenarios')
        .update(values)
        .eq('id', input.id)
        .eq('organisation_id', organisationId)
    : await supabase
        .from('twin_scenarios')
        .insert({ ...values, is_baseline: (count ?? 0) === 0, created_by: workspace.user.id });

  if (error) {
    // The two the reader caused, named. Anything else is ours.
    if (error.code === '23505' && error.message.includes('scenario_name_is_unique')) {
      return fail('You already have a scenario with that name.', typed);
    }
    if (error.code === '23505' && error.message.includes('one_baseline')) {
      return fail('This organisation already has a baseline scenario.', typed);
    }
    return fail(ourFault('twin', error), typed);
  }

  await recordEvent(organisationId, 'twin.scenario_saved', {
    entityType: 'twin_scenario',
    entityId: input.id,
    summary: `Scenario "${input.name}" ${input.id ? 'updated' : 'created'}`,
  });

  revalidatePath(STUDIO);
  return { status: 'saved', message: `"${input.name}" saved.` };
}

/**
 * Removes a scenario, and refuses to remove the baseline.
 *
 * The database allows it; this does not. Deleting the thing every other
 * scenario is read against leaves a studio full of percentiles with nothing to
 * compare them to, and the nightly tick with nothing to run — which looks from
 * outside like the Twin having quietly stopped.
 */
export async function removeScenario(
  _previous: ScenarioState,
  form: FormData,
): Promise<ScenarioState> {
  const workspace = await requirePermission('manage_organisation');
  const id = form.get('id');
  if (typeof id !== 'string' || id === '') return fail('That scenario could not be found.');

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('twin_scenarios')
    .select('name, is_baseline')
    .eq('id', id)
    .eq('organisation_id', workspace.organisation.id)
    .maybeSingle();

  if (!existing) return fail('That scenario could not be found.');
  if (existing.is_baseline) {
    return fail(
      'The baseline stays. Every other scenario is read against it, and the nightly run needs it — rename it instead if it no longer describes carrying on as you are.',
    );
  }

  const { error } = await supabase
    .from('twin_scenarios')
    .delete()
    .eq('id', id)
    .eq('organisation_id', workspace.organisation.id);

  if (error) return fail(ourFault('twin', error));

  await recordEvent(workspace.organisation.id, 'twin.scenario_removed', {
    entityType: 'twin_scenario',
    entityId: id,
    summary: `Scenario "${existing.name}" removed`,
  });

  revalidatePath(STUDIO);
  return { status: 'saved', message: `"${existing.name}" removed.` };
}

/* ── asking for a run ──────────────────────────────────────────────────── */

/**
 * Queues one scenario.
 *
 * Every rule about whether this is allowed lives in the function it calls. The
 * error codes come back as the sentences the function raised, which is what
 * makes "the Twin is not switched on" reach the person who pressed the button
 * rather than a log nobody reads.
 */
export async function runScenario(
  _previous: ScenarioState,
  form: FormData,
): Promise<ScenarioState> {
  const workspace = await requirePermission('manage_organisation');
  const id = form.get('id');
  if (typeof id !== 'string' || id === '') return fail('That scenario could not be found.');

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('request_simulation', {
    p_organisation: workspace.organisation.id,
    p_scenario: id,
  });

  if (error) {
    // 42501 and P0002 are raised deliberately, with sentences meant to be
    // read. Anything else is ours and is logged rather than shown.
    const deliberate = error.code === '42501' || error.code === 'P0002';
    return fail(deliberate ? capitalise(error.message) : ourFault('twin', error));
  }

  const outcome = (data ?? {}) as {
    status?: string;
    scenario?: string;
    starts_in_seconds?: number;
  };

  if (outcome.status === 'already_running') {
    return {
      status: 'queued',
      message: `"${outcome.scenario}" is already queued. The answer is on its way — this page will show it once it lands.`,
    };
  }

  await recordEvent(workspace.organisation.id, 'twin.simulation_requested', {
    entityType: 'twin_scenario',
    entityId: id,
    summary: `Simulation requested for "${outcome.scenario}"`,
  });

  revalidatePath(STUDIO);

  const wait = outcome.starts_in_seconds ?? 0;
  return {
    status: 'queued',
    message:
      wait > 0
        ? `"${outcome.scenario}" is queued. It waits about ${wait} seconds first, while the Twin measures how wrong it has been — a run cannot be recorded without that.`
        : `"${outcome.scenario}" is queued and starts now.`,
  };
}

function capitalise(sentence: string): string {
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
