'use server';

/**
 * Saving each step of setup.
 *
 * One action per step rather than one that switches on a step name, because
 * each writes to different tables and validates different things — and a
 * single action with a seven-way branch is a single action that can be called
 * with the wrong branch.
 *
 * All of them write to the real tables. A branch entered in step two is a
 * branch: it appears in the switcher and in the figures immediately, and the
 * progress record only remembers that the question was answered. Nothing here
 * is a draft, which is what makes leaving halfway through harmless.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { recordEvent } from '@/lib/audit';
import { ourFault } from '@/lib/errors';
import { isStepId, nextStep, type StepId } from './steps';
import { firstRepeatedName } from './systems';
import type { Json } from '@/types/database';

/**
 * `values` carries the submitted answers back to the form.
 *
 * Without it a failed save renders empty inputs, so the reader loses
 * everything they typed and is shown an error at the same moment — which
 * reads as the page having thrown their work away, because it has. It matters
 * most on the systems step, where there are eight boxes to retype.
 */
export type SaveState =
  | { status: 'idle' }
  | { status: 'error'; message: string; values?: Record<string, string> };

const fail = (message: string, values?: Record<string, string>): SaveState => ({
  status: 'error',
  message,
  ...(values ? { values } : {}),
});

/** Marks a step answered and moves the pointer on. */
async function advance(
  organisationId: string,
  step: StepId,
  patch: { answers?: Record<string, Json> } = {},
): Promise<void> {
  const supabase = await createClient();
  const { data: current } = await supabase
    .from('onboarding_progress')
    .select('completed_steps, skipped_steps, answers')
    .eq('organisation_id', organisationId)
    .maybeSingle();

  const completed = new Set(current?.completed_steps ?? []);
  completed.add(step);
  // Answering a step it had previously been decided to skip is an edit, not a
  // contradiction — and the database refuses a row that claims both.
  const skipped = (current?.skipped_steps ?? []).filter((s) => s !== step);

  const answers: Record<string, Json> = {
    ...((current?.answers as Record<string, Json> | null) ?? {}),
    ...(patch.answers ?? {}),
  };

  await supabase.from('onboarding_progress').upsert(
    {
      organisation_id: organisationId,
      current_step: nextStep(step) ?? 'review',
      completed_steps: [...completed],
      skipped_steps: skipped,
      answers,
    },
    { onConflict: 'organisation_id' },
  );
}

/* ── 1. identity ───────────────────────────────────────────────────────── */

const identitySchema = z.object({
  industry: z.string().trim().min(2, 'Say what the business does').max(120),
  describes: z.string().trim().max(500).optional(),
  headcountBand: z.enum(['1-10', '11-50', '51-200', '201-1000', '1000+']),
  fiscalYearStart: z.coerce.number().int().min(1).max(12),
  timezone: z.string().trim().min(3).max(60),
});

export async function saveIdentity(_previous: SaveState, formData: FormData): Promise<SaveState> {
  const workspace = await requirePermission('manage_organisation');
  const parsed = identitySchema.safeParse({
    industry: formData.get('industry'),
    describes: formData.get('describes') ?? undefined,
    headcountBand: formData.get('headcountBand'),
    fiscalYearStart: formData.get('fiscalYearStart'),
    timezone: formData.get('timezone'),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the details.');

  const supabase = await createClient();
  const { error } = await supabase
    .from('organisations')
    .update({
      industry: parsed.data.industry,
      fiscal_year_start: parsed.data.fiscalYearStart,
      timezone: parsed.data.timezone,
    })
    .eq('id', workspace.organisation.id);

  if (error) return fail(ourFault('onboarding', error, 'We could not save that. Please try again.'));

  await advance(workspace.organisation.id, 'identity', {
    answers: {
      identity: {
        describes: parsed.data.describes ?? '',
        headcountBand: parsed.data.headcountBand,
      },
    },
  });

  redirect('/onboarding/structure');
}

/* ── 2. structure ──────────────────────────────────────────────────────── */

const structureSchema = z.object({
  branches: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        city: z.string().trim().max(120).optional(),
        headcount: z.coerce.number().int().min(0).max(1_000_000).optional(),
      }),
    )
    .max(50),
  departments: z.array(z.string().trim().min(1).max(120)).max(50),
});

export async function saveStructure(_previous: SaveState, formData: FormData): Promise<SaveState> {
  const workspace = await requirePermission('manage_organisation');

  const names = formData.getAll('branchName').map(String);
  const cities = formData.getAll('branchCity').map(String);
  const headcounts = formData.getAll('branchHeadcount').map(String);

  const parsed = structureSchema.safeParse({
    branches: names
      .map((name, i) => ({
        name: name.trim(),
        city: cities[i]?.trim() || undefined,
        headcount: headcounts[i]?.trim() || undefined,
      }))
      // Blank rows are how a repeatable form is used, not a mistake to report.
      .filter((b) => b.name.length > 0),
    departments: formData
      .getAll('department')
      .map((d) => String(d).trim())
      .filter((d) => d.length > 0),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the details.');

  const supabase = await createClient();

  if (parsed.data.branches.length > 0) {
    const { error } = await supabase.from('branches').insert(
      parsed.data.branches.map((b) => ({
        organisation_id: workspace.organisation.id,
        name: b.name,
        city: b.city ?? null,
        headcount: b.headcount ?? null,
      })),
    );
    if (error) return fail(ourFault('onboarding', error, 'We could not save those sites.'));
  }

  if (parsed.data.departments.length > 0) {
    const { error } = await supabase.from('departments').insert(
      parsed.data.departments.map((name) => ({
        organisation_id: workspace.organisation.id,
        name,
      })),
    );
    if (error) return fail(ourFault('onboarding', error, 'We could not save those departments.'));
  }

  await advance(workspace.organisation.id, 'structure');
  redirect('/onboarding/objectives');
}

/* ── 3. objectives ─────────────────────────────────────────────────────── */

const objectiveSchema = z.object({
  title: z.string().trim().min(3).max(160),
  target: z.coerce.number().finite(),
  unit: z.string().trim().min(1).max(20),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date'),
});

export async function saveObjectives(_previous: SaveState, formData: FormData): Promise<SaveState> {
  const workspace = await requirePermission('manage_organisation');

  const titles = formData.getAll('objectiveTitle').map(String);
  const targets = formData.getAll('objectiveTarget').map(String);
  const units = formData.getAll('objectiveUnit').map(String);
  const dues = formData.getAll('objectiveDue').map(String);

  const rows: z.infer<typeof objectiveSchema>[] = [];
  for (const [i, title] of titles.entries()) {
    if (!title.trim()) continue;
    const parsed = objectiveSchema.safeParse({
      title: title,
      target: targets[i],
      unit: units[i] || 'ZAR',
      dueOn: dues[i],
    });
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the objectives.');
    rows.push(parsed.data);
  }

  if (rows.length > 0) {
    const supabase = await createClient();
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from('goals').insert(
      rows.map((row) => ({
        organisation_id: workspace.organisation.id,
        title: row.title,
        target_value: row.target,
        unit: row.unit,
        status: 'active' as const,
        starts_on: today,
        due_on: row.dueOn,
        owner_id: workspace.user.id,
      })),
    );
    if (error) return fail(ourFault('onboarding', error, 'We could not save those objectives.'));
  }

  await advance(workspace.organisation.id, 'objectives');
  redirect('/onboarding/systems');
}

/* ── 4. systems ────────────────────────────────────────────────────────── */

const CATEGORIES = [
  'accounting',
  'crm',
  'pos',
  'erp',
  'spreadsheet',
  'database',
  'api',
  'manual',
] as const;

export async function saveSystems(_previous: SaveState, formData: FormData): Promise<SaveState> {
  const workspace = await requirePermission('manage_organisation');

  const categories = formData.getAll('systemCategory').map(String);
  const names = formData.getAll('systemName').map(String);

  const rows = categories
    .map((category, i) => ({ category, name: names[i]?.trim() ?? '' }))
    .filter((r) => r.name.length > 0);

  // Typed back into the form on every failure below, so nothing is lost.
  const submitted = Object.fromEntries(
    categories.map((category, i) => [category, names[i]?.trim() ?? '']),
  );

  const parsed = z
    .array(
      z.object({
        category: z.enum(CATEGORIES),
        name: z.string().trim().min(1).max(120),
      }),
    )
    .max(30)
    .safeParse(rows);
  if (!parsed.success) return fail('Check which systems you have named.', submitted);

  // data_sources is UNIQUE (organisation_id, name), and the category is not
  // part of that key — so the same name under two headings is one row, not
  // two. The insert is atomic, so a single repeat used to lose all eight
  // answers to "23505 duplicate key", shown as "We could not save those
  // systems": a message that named neither the system nor the fact that a
  // name had been repeated, on a form that had just cleared itself.
  //
  // Compared case-insensitively, which is stricter than the constraint. A
  // person naming "Excel" and "excel" means one system, and the alternative is
  // two rows that read as duplicates to everyone but Postgres.
  const repeat = firstRepeatedName(parsed.data);
  if (repeat) {
    return fail(
      `“${repeat.name}” is named twice — under ${repeat.firstCategory} and under ` +
        `${repeat.category}. Each system needs its own name, so rename one of them or ` +
        `leave the box you do not need blank.`,
      submitted,
    );
  }

  if (parsed.data.length > 0) {
    const supabase = await createClient();
    // Upsert, not insert: this step can be revisited, and coming back to add a
    // ninth system should not fail on the eight already saved.
    const { error } = await supabase.from('data_sources').upsert(
      parsed.data.map((row) => ({
        organisation_id: workspace.organisation.id,
        name: row.name,
        category: row.category,
        created_by: workspace.user.id,
      })),
      { onConflict: 'organisation_id,name' },
    );
    if (error) {
      return fail(ourFault('onboarding', error, 'We could not save those systems.'), submitted);
    }
  }

  await advance(workspace.organisation.id, 'systems');
  redirect('/onboarding/data');
}

/* ── 5. data ───────────────────────────────────────────────────────────── */

const dataSchema = z.object({
  annualRevenue: z.coerce.number().min(0).optional(),
  grossMarginTarget: z.coerce.number().min(0).max(100).optional(),
  netMarginTarget: z.coerce.number().min(0).max(100).optional(),
  customers: z.coerce.number().int().min(0).optional(),
  revenueTargetAnnual: z.coerce.number().min(0).optional(),
});

export async function saveData(_previous: SaveState, formData: FormData): Promise<SaveState> {
  const workspace = await requirePermission('manage_organisation');

  const numeric = (key: string) => {
    const raw = String(formData.get(key) ?? '').trim();
    return raw.length === 0 ? undefined : raw;
  };

  const parsed = dataSchema.safeParse({
    annualRevenue: numeric('annualRevenue'),
    grossMarginTarget: numeric('grossMarginTarget'),
    netMarginTarget: numeric('netMarginTarget'),
    customers: numeric('customers'),
    revenueTargetAnnual: numeric('revenueTargetAnnual'),
  });
  if (!parsed.success) return fail('Those figures do not look right — check for stray characters.');

  const supabase = await createClient();

  // strategy_profile rather than columns of its own: these are the customer's
  // stated starting point, not measured figures, and the day real data arrives
  // the measurements must win without anybody having to reconcile two places
  // that both claim to hold revenue.
  const { data: organisation } = await supabase
    .from('organisations')
    .select('strategy_profile')
    .eq('id', workspace.organisation.id)
    .maybeSingle();

  const profile: Record<string, Json> = {
    ...((organisation?.strategy_profile as Record<string, Json> | null) ?? {}),
    stated: { ...parsed.data, statedAt: new Date().toISOString() },
  };

  const { error } = await supabase
    .from('organisations')
    .update({ strategy_profile: profile })
    .eq('id', workspace.organisation.id);
  if (error) return fail(ourFault('onboarding', error, 'We could not save those figures.'));

  await advance(workspace.organisation.id, 'data');
  redirect('/onboarding/market');
}

/* ── 6. market ─────────────────────────────────────────────────────────── */

export async function saveMarket(_previous: SaveState, formData: FormData): Promise<SaveState> {
  const workspace = await requirePermission('manage_organisation');

  const names = formData.getAll('competitorName').map((n) => String(n).trim());
  const sites = formData.getAll('competitorSite').map((s) => String(s).trim());
  const threats = formData.getAll('competitorThreat').map(String);

  const rows = names
    .map((name, i) => ({ name, website: sites[i] || undefined, threat: threats[i] ?? 'medium' }))
    .filter((r) => r.name.length > 0);

  const parsed = z
    .array(
      z.object({
        name: z.string().trim().min(1).max(160),
        website: z.string().trim().max(200).optional(),
        threat: z.enum(['critical', 'high', 'medium', 'low']),
      }),
    )
    .max(30)
    .safeParse(rows);
  if (!parsed.success) return fail('Check the competitors you have named.');

  const sectors = formData.getAll('sector').map(String);
  const supabase = await createClient();

  if (parsed.data.length > 0) {
    const { error } = await supabase.from('competitors').insert(
      parsed.data.map((row) => ({
        organisation_id: workspace.organisation.id,
        name: row.name,
        website: row.website ?? null,
        threat_level: row.threat,
        is_tracked: true,
      })),
    );
    if (error) return fail(ourFault('onboarding', error, 'We could not save those competitors.'));
  }

  const validSectors = sectors.filter((s) =>
    ['private', 'public', 'mixed', 'unknown'].includes(s),
  ) as ('private' | 'public' | 'mixed' | 'unknown')[];

  if (validSectors.length > 0) {
    await supabase
      .from('organisations')
      .update({ sector_scope: validSectors })
      .eq('id', workspace.organisation.id);
  }

  await advance(workspace.organisation.id, 'market');
  redirect('/onboarding/review');
}

/* ── skipping, and finishing ───────────────────────────────────────────── */

export async function skipStep(formData: FormData): Promise<void> {
  const workspace = await requirePermission('manage_organisation');
  const raw = String(formData.get('step') ?? '');
  if (!isStepId(raw) || raw === 'identity' || raw === 'review') return;

  const supabase = await createClient();
  const { data: current } = await supabase
    .from('onboarding_progress')
    .select('completed_steps, skipped_steps')
    .eq('organisation_id', workspace.organisation.id)
    .maybeSingle();

  const skipped = new Set(current?.skipped_steps ?? []);
  skipped.add(raw);

  await supabase.from('onboarding_progress').upsert(
    {
      organisation_id: workspace.organisation.id,
      current_step: nextStep(raw) ?? 'review',
      // Skipping something answered earlier withdraws the answer from the
      // progress record only. What was written to the real tables stays: a
      // branch is not deleted because somebody pressed skip on the page that
      // created it.
      completed_steps: (current?.completed_steps ?? []).filter((s) => s !== raw),
      skipped_steps: [...skipped],
    },
    { onConflict: 'organisation_id' },
  );

  redirect(`/onboarding/${nextStep(raw) ?? 'review'}`);
}

export async function initialise(): Promise<void> {
  const workspace = await requirePermission('manage_organisation');

  const supabase = await createClient();
  const { error } = await supabase.rpc('complete_onboarding', {
    p_organisation: workspace.organisation.id,
  });

  if (error) {
    // Nothing partial has happened — complete_onboarding() is one statement —
    // so the honest thing is to leave the customer where they are.
    console.error('[amryn:onboarding] could not complete', error.message);
    redirect('/onboarding/review?problem=1');
  }

  await recordEvent(workspace.organisation.id, 'onboarding.completed', {
    entityType: 'organisation',
    entityId: workspace.organisation.id,
  });

  revalidatePath('/command-centre');
  redirect('/command-centre?welcome=1');
}
