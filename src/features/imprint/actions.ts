'use server';

/**
 * Saving a layer of the Imprint.
 *
 * One action per layer rather than one that switches on a layer name, because
 * each writes to different tables and validates different things — and a
 * single action with an eight-way branch is a single action that can be called
 * with the wrong branch. That was true of the seven steps this replaces and is
 * no less true now.
 *
 * ── two kinds of save, and why both are needed ────────────────────────────
 * `saveDraft` is the autosave. It writes what has been typed into the layer's
 * answers and nothing else: no side effects, no state change, no navigation.
 * Its whole job is that closing the laptop halfway through a layer loses
 * nothing. It runs on a debounce from the form and its failures are silent by
 * design — an autosave that interrupts somebody mid-sentence to report a
 * network blip is worse than one that quietly tries again.
 *
 * The per-layer actions are the commit. They validate, write to the real
 * tables, mark the layer answered, record which fields were left blank, and
 * move on. A site entered in the Location layer is a site: it appears in the
 * switcher and in the figures immediately. Nothing here is a draft, which is
 * what makes leaving halfway through harmless.
 *
 * ── gaps, not blocks ──────────────────────────────────────────────────────
 * Almost nothing is required. A person who does not know their gross margin
 * moves on and is asked again later; the field goes into `gaps`, the Quality
 * Score reflects it, and the analysis will know it was never given rather than
 * estimating one. A required field would have stopped them instead, and the
 * business would have an Imprint that says whatever they typed to get past it.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { recordEvent } from '@/lib/audit';
import { ourFault } from '@/lib/errors';
import { isLayerId, layer as layerDefinition, nextLayer, type LayerId } from './layers';
import { score, type ImprintAnswers } from './quality';
import { firstRepeatedName } from './systems';
import { onlyNew, reconcileByName } from './reconcile';
import type { Json } from '@/types/database';

/**
 * `values` carries the submitted answers back to the form.
 *
 * Without it a failed save renders empty inputs, so the reader loses
 * everything they typed and is shown an error at the same moment — which reads
 * as the page having thrown their work away, because it has.
 */
export type SaveState =
  | { status: 'idle' }
  | { status: 'error'; message: string; values?: Record<string, string> };

const fail = (message: string, values?: Record<string, string>): SaveState => ({
  status: 'error',
  message,
  ...(values ? { values } : {}),
});

/* ── the shared half ───────────────────────────────────────────────────── */

/** Whether one submitted value counts as an answer. Mirrors quality.ts. */
function answered(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Recomputes the Quality Score and stores it.
 *
 * Stored rather than derived so that a background job — which has no screen in
 * front of it and no reason to load eight rows — can gate on it with one read.
 * Screens recompute it themselves (see record.ts), so the stored figure being
 * a moment stale never shows up beside the answers it describes.
 */
async function rescore(organisationId: string): Promise<void> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from('imprint_layers')
    .select('layer, state, answers, gaps')
    .eq('organisation_id', organisationId);

  const answers = Object.fromEntries(
    (rows ?? []).map((row) => [
      row.layer,
      {
        state: row.state,
        answers: (row.answers as Record<string, unknown> | null) ?? {},
        gaps: row.gaps ?? [],
      },
    ]),
  ) as ImprintAnswers;

  await supabase
    .from('imprint_records')
    .update({ quality_score: score(answers).score, scored_at: new Date().toISOString() })
    .eq('organisation_id', organisationId);
}

/**
 * Marks a layer answered, records what was left blank, and moves the pointer.
 *
 * The gaps are computed from the layer's declared fields rather than from what
 * the form happened to submit, so a field removed from a screen stops counting
 * as a gap and a field added starts counting as one — without anybody having
 * to remember to update a second list.
 */
async function commit(
  organisationId: string,
  id: LayerId,
  answers: Record<string, Json>,
): Promise<void> {
  const supabase = await createClient();
  const gaps = layerDefinition(id)
    .fields.filter((field) => !answered(answers[field.name]))
    .map((field) => field.name);

  await supabase
    .from('imprint_layers')
    .update({
      state: 'answered',
      answered_at: new Date().toISOString(),
      answers,
      gaps,
    })
    .eq('organisation_id', organisationId)
    .eq('layer', id);

  await supabase
    .from('imprint_records')
    .update({ current_layer: nextLayer(id) ?? id })
    .eq('organisation_id', organisationId);

  // One row per layer answered. The Imprint is the record everything the
  // platform says is derived from, so "who changed what the business claims
  // about itself, and when" is a question its administrators are entitled to
  // an answer to — and the answer has to be written as it happens.
  await recordEvent(organisationId, 'imprint.layer_completed', {
    entityType: 'imprint_layer',
    entityId: id,
    summary: `${layerDefinition(id).title} answered${
      gaps.length > 0 ? `, with ${gaps.length} field${gaps.length === 1 ? '' : 's'} left blank` : ''
    }`,
  });

  await rescore(organisationId);
}

/** Where the form goes after a layer is committed. */
function onward(id: LayerId): never {
  redirect(`/imprint/${nextLayer(id) ?? 'review'}`);
}

/**
 * The autosave.
 *
 * Deliberately forgiving: it takes whatever is in the form, keeps it, and
 * changes nothing else. It does not validate, because half-typed input is what
 * it exists to preserve; it does not mark the layer answered, because the
 * person has not said they are finished; and it reports nothing on failure,
 * because the alternative is an error message appearing under somebody's
 * cursor while they are still typing.
 */
export async function saveDraft(rawLayer: string, entries: Record<string, string>): Promise<void> {
  if (!isLayerId(rawLayer)) return;

  try {
    const workspace = await requirePermission('manage_organisation');
    const supabase = await createClient();

    const { data: current } = await supabase
      .from('imprint_layers')
      .select('state, answers')
      .eq('organisation_id', workspace.organisation.id)
      .eq('layer', rawLayer)
      .maybeSingle();

    // Merged, not replaced: a draft carries only the fields on the screen, and
    // a layer answered earlier must not lose what it already holds because
    // somebody reopened it and typed in one box.
    const merged: Record<string, Json> = {
      ...((current?.answers as Record<string, Json> | null) ?? {}),
      ...entries,
    };

    await supabase
      .from('imprint_layers')
      .update({ answers: merged })
      .eq('organisation_id', workspace.organisation.id)
      .eq('layer', rawLayer);
  } catch {
    // Silent on purpose. See the note above.
  }
}

/* ── 1. Identity ───────────────────────────────────────────────────────── */

const identitySchema = z.object({
  industry: z.string().trim().min(2, 'Say what the business does').max(120),
  describes: z.string().trim().max(500).optional(),
  headcountBand: z.enum(['1-10', '11-50', '51-200', '201-1000', '1000+']).optional(),
  yearFounded: z.coerce.number().int().min(1800).max(2100).optional(),
  fiscalYearStart: z.coerce.number().int().min(1).max(12).optional(),
  timezone: z.string().trim().min(3).max(60).optional(),
});

/** Empty string means "left blank", which is a gap rather than a value. */
const blank = (formData: FormData, key: string): string | undefined => {
  const raw = String(formData.get(key) ?? '').trim();
  return raw.length === 0 ? undefined : raw;
};

export async function saveIdentity(_previous: SaveState, formData: FormData): Promise<SaveState> {
  const workspace = await requirePermission('manage_organisation');
  const parsed = identitySchema.safeParse({
    industry: formData.get('industry'),
    describes: blank(formData, 'describes'),
    headcountBand: blank(formData, 'headcountBand'),
    yearFounded: blank(formData, 'yearFounded'),
    fiscalYearStart: blank(formData, 'fiscalYearStart'),
    timezone: blank(formData, 'timezone'),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the details.');

  const supabase = await createClient();
  const { error } = await supabase
    .from('organisations')
    .update({
      industry: parsed.data.industry,
      ...(parsed.data.fiscalYearStart ? { fiscal_year_start: parsed.data.fiscalYearStart } : {}),
      ...(parsed.data.timezone ? { timezone: parsed.data.timezone } : {}),
    })
    .eq('id', workspace.organisation.id);

  if (error) return fail(ourFault('imprint', error, 'We could not save that. Please try again.'));

  await commit(workspace.organisation.id, 'identity', { ...parsed.data } as Record<string, Json>);
  onward('identity');
}

/* ── 2. Location ───────────────────────────────────────────────────────── */

const locationSchema = z.object({
  sites: z
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

export async function saveLocation(_previous: SaveState, formData: FormData): Promise<SaveState> {
  const workspace = await requirePermission('manage_organisation');

  const names = formData.getAll('siteName').map(String);
  const cities = formData.getAll('siteCity').map(String);
  const headcounts = formData.getAll('siteHeadcount').map(String);

  const parsed = locationSchema.safeParse({
    sites: names
      .map((name, i) => ({
        name: name.trim(),
        city: cities[i]?.trim() || undefined,
        headcount: headcounts[i]?.trim() || undefined,
      }))
      // Blank rows are how a repeatable form is used, not a mistake to report.
      .filter((s) => s.name.length > 0),
    departments: formData
      .getAll('department')
      .map((d) => String(d).trim())
      .filter((d) => d.length > 0),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the details.');

  const supabase = await createClient();

  if (parsed.data.sites.length > 0) {
    // Upsert: branches is UNIQUE (organisation_id, name), so revisiting this
    // layer to correct one site's headcount used to reject every site with a
    // 23505 nobody could act on.
    const { error } = await supabase.from('branches').upsert(
      parsed.data.sites.map((s) => ({
        organisation_id: workspace.organisation.id,
        name: s.name,
        city: s.city ?? null,
        headcount: s.headcount ?? null,
      })),
      { onConflict: 'organisation_id,name' },
    );
    if (error) return fail(ourFault('imprint', error, 'We could not save those sites.'));
  }

  if (parsed.data.departments.length > 0) {
    // Not an upsert. departments is UNIQUE (organisation_id, branch_id, name)
    // and branch_id is null here; Postgres treats nulls as distinct, so that
    // constraint never fires and there is no conflict target to upsert on. The
    // duplicate has to be found before the write instead.
    const { data: already } = await supabase
      .from('departments')
      .select('name')
      .eq('organisation_id', workspace.organisation.id);

    const fresh = onlyNew(parsed.data.departments, (already ?? []).map((d) => d.name));
    if (fresh.length > 0) {
      const { error } = await supabase
        .from('departments')
        .insert(fresh.map((name) => ({ organisation_id: workspace.organisation.id, name })));
      if (error) return fail(ourFault('imprint', error, 'We could not save those departments.'));
    }
  }

  await commit(workspace.organisation.id, 'location', {
    sites: parsed.data.sites.map((s) => s.name),
    departments: parsed.data.departments,
    premisesType: blank(formData, 'premisesType') ?? null,
    tradingHours: blank(formData, 'tradingHours') ?? null,
    primaryCity: blank(formData, 'primaryCity') ?? null,
  } as Record<string, Json>);
  onward('location');
}

/* ── 3. Offer, 4. Customers, 7. Digital ────────────────────────────────── */
/*
 * Three layers with no table of their own yet.
 *
 * What they hold has never been asked for before, so there is nowhere for it
 * to go but the layer's answers — and putting it there is not a stopgap. These
 * are statements a business makes about itself rather than measurements, and
 * the day a measurement of the same thing arrives it must win without anybody
 * reconciling two places that both claim to hold it. That is the same reason
 * the Commercial figures go to `strategy_profile.stated` rather than to
 * columns of their own.
 */

/** Reads every declared field of a layer straight from the form. */
function declaredFields(id: LayerId, formData: FormData): Record<string, Json> {
  return Object.fromEntries(
    layerDefinition(id).fields.map((field) => [field.name, blank(formData, field.name) ?? null]),
  ) as Record<string, Json>;
}

export async function saveOffer(_previous: SaveState, formData: FormData): Promise<SaveState> {
  const workspace = await requirePermission('manage_organisation');
  await commit(workspace.organisation.id, 'offer', declaredFields('offer', formData));
  onward('offer');
}

export async function saveCustomers(_previous: SaveState, formData: FormData): Promise<SaveState> {
  const workspace = await requirePermission('manage_organisation');
  await commit(workspace.organisation.id, 'customers', declaredFields('customers', formData));
  onward('customers');
}

export async function saveDigital(_previous: SaveState, formData: FormData): Promise<SaveState> {
  const workspace = await requirePermission('manage_organisation');
  await commit(workspace.organisation.id, 'digital', declaredFields('digital', formData));
  onward('digital');
}

/* ── 5. Operations ─────────────────────────────────────────────────────── */

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

export async function saveOperations(_previous: SaveState, formData: FormData): Promise<SaveState> {
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
    .array(z.object({ category: z.enum(CATEGORIES), name: z.string().trim().min(1).max(120) }))
    .max(30)
    .safeParse(rows);
  if (!parsed.success) return fail('Check which systems you have named.', submitted);

  // data_sources is UNIQUE (organisation_id, name), and the category is not
  // part of that key — so the same name under two headings is one row, not
  // two. The insert is atomic, so a single repeat used to lose all eight
  // answers to a "23505 duplicate key" that named neither the system nor the
  // repetition, on a form that had just cleared itself.
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
    // Upsert, not insert: this layer can be revisited, and coming back to add
    // a ninth system should not fail on the eight already saved.
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
      return fail(ourFault('imprint', error, 'We could not save those systems.'), submitted);
    }
  }

  await commit(workspace.organisation.id, 'operations', {
    systems: parsed.data.map((row) => row.name),
    stockManaged: blank(formData, 'stockManaged') ?? null,
    supplierCount: blank(formData, 'supplierCount') ?? null,
    leadTimeDays: blank(formData, 'leadTimeDays') ?? null,
    busiestPeriod: blank(formData, 'busiestPeriod') ?? null,
  } as Record<string, Json>);
  onward('operations');
}

/* ── 6. Commercial ─────────────────────────────────────────────────────── */

const commercialSchema = z.object({
  annualRevenue: z.coerce.number().min(0).optional(),
  grossMarginTarget: z.coerce.number().min(0).max(100).optional(),
  netMarginTarget: z.coerce.number().min(0).max(100).optional(),
  monthlyFixedCosts: z.coerce.number().min(0).optional(),
  revenueTargetAnnual: z.coerce.number().min(0).optional(),
  paymentTerms: z.string().trim().max(60).optional(),
});

export async function saveCommercial(_previous: SaveState, formData: FormData): Promise<SaveState> {
  const workspace = await requirePermission('manage_organisation');

  const parsed = commercialSchema.safeParse({
    annualRevenue: blank(formData, 'annualRevenue'),
    grossMarginTarget: blank(formData, 'grossMarginTarget'),
    netMarginTarget: blank(formData, 'netMarginTarget'),
    monthlyFixedCosts: blank(formData, 'monthlyFixedCosts'),
    revenueTargetAnnual: blank(formData, 'revenueTargetAnnual'),
    paymentTerms: blank(formData, 'paymentTerms'),
  });
  if (!parsed.success) {
    return fail('Those figures do not look right — check for stray characters.');
  }

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
    stated: { ...parsed.data, statedAt: new Date().toISOString() } as Json,
  };

  const { error } = await supabase
    .from('organisations')
    .update({ strategy_profile: profile })
    .eq('id', workspace.organisation.id);
  if (error) return fail(ourFault('imprint', error, 'We could not save those figures.'));

  await commit(workspace.organisation.id, 'commercial', { ...parsed.data } as Record<string, Json>);
  onward('commercial');
}

/* ── 8. Intent ─────────────────────────────────────────────────────────── */

const objectiveSchema = z.object({
  title: z.string().trim().min(3).max(160),
  target: z.coerce.number().finite(),
  unit: z.string().trim().min(1).max(20),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date'),
});

export async function saveIntent(_previous: SaveState, formData: FormData): Promise<SaveState> {
  const workspace = await requirePermission('manage_organisation');
  const supabase = await createClient();

  /* objectives */
  const titles = formData.getAll('objectiveTitle').map(String);
  const targets = formData.getAll('objectiveTarget').map(String);
  const units = formData.getAll('objectiveUnit').map(String);
  const dues = formData.getAll('objectiveDue').map(String);

  const objectives: z.infer<typeof objectiveSchema>[] = [];
  for (const [i, title] of titles.entries()) {
    if (!title.trim()) continue;
    const parsed = objectiveSchema.safeParse({
      title,
      target: targets[i],
      unit: units[i] || 'ZAR',
      dueOn: dues[i],
    });
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check what you are aiming for.');
    objectives.push(parsed.data);
  }

  if (objectives.length > 0) {
    const today = new Date().toISOString().slice(0, 10);

    // goals carries no unique key, so an insert here duplicated silently. A
    // revenue target revised from R2,000,000 to R1,200,000 left both rows
    // active under one title, and nothing could say which figure the business
    // was being judged against. Answering again is an edit, so it has to reach
    // the row that is already there.
    const { data: current } = await supabase
      .from('goals')
      .select('id, title')
      .eq('organisation_id', workspace.organisation.id)
      .eq('status', 'active');

    const { update, insert } = reconcileByName(
      objectives,
      (current ?? []).map((g) => ({ id: g.id, name: g.title })),
      (row) => row.title,
    );

    for (const { id, row } of update) {
      const { error } = await supabase
        .from('goals')
        .update({ target_value: row.target, unit: row.unit, due_on: row.dueOn })
        .eq('id', id);
      if (error) return fail(ourFault('imprint', error, 'We could not save those objectives.'));
    }

    if (insert.length > 0) {
      const { error } = await supabase.from('goals').insert(
        insert.map((row) => ({
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
      if (error) return fail(ourFault('imprint', error, 'We could not save those objectives.'));
    }
  }

  /* competitors */
  const names = formData.getAll('competitorName').map((n) => String(n).trim());
  const sites = formData.getAll('competitorSite').map((s) => String(s).trim());
  const threats = formData.getAll('competitorThreat').map(String);

  const competitors = z
    .array(
      z.object({
        name: z.string().trim().min(1).max(160),
        website: z.string().trim().max(200).optional(),
        threat: z.enum(['critical', 'high', 'medium', 'low']),
      }),
    )
    .max(30)
    .safeParse(
      names
        .map((name, i) => ({ name, website: sites[i] || undefined, threat: threats[i] ?? 'medium' }))
        .filter((r) => r.name.length > 0),
    );
  if (!competitors.success) return fail('Check the competitors you have named.');

  if (competitors.data.length > 0) {
    // Upsert for the same reason as sites: competitors is
    // UNIQUE (organisation_id, name), so revising a threat level used to be
    // rejected rather than applied.
    const { error } = await supabase.from('competitors').upsert(
      competitors.data.map((row) => ({
        organisation_id: workspace.organisation.id,
        name: row.name,
        website: row.website ?? null,
        threat_level: row.threat,
        is_tracked: true,
      })),
      { onConflict: 'organisation_id,name' },
    );
    if (error) return fail(ourFault('imprint', error, 'We could not save those competitors.'));
  }

  /* sector scope */
  const validSectors = formData
    .getAll('sector')
    .map(String)
    .filter((s) => ['private', 'public', 'mixed', 'unknown'].includes(s)) as (
    | 'private'
    | 'public'
    | 'mixed'
    | 'unknown'
  )[];

  if (validSectors.length > 0) {
    await supabase
      .from('organisations')
      .update({ sector_scope: validSectors })
      .eq('id', workspace.organisation.id);
  }

  await commit(workspace.organisation.id, 'intent', {
    objectives: objectives.map((o) => o.title),
    competitors: competitors.data.map((c) => c.name),
    sectorScope: validSectors,
    growthHorizonMonths: blank(formData, 'growthHorizonMonths') ?? null,
    expansionAppetite: blank(formData, 'expansionAppetite') ?? null,
    biggestConstraint: blank(formData, 'biggestConstraint') ?? null,
  } as Record<string, Json>);
  onward('intent');
}

/* ── skipping, and finishing ───────────────────────────────────────────── */

export async function skipLayer(formData: FormData): Promise<void> {
  const workspace = await requirePermission('manage_organisation');
  const raw = String(formData.get('layer') ?? '');
  if (!isLayerId(raw) || !layerDefinition(raw).skippable) return;

  const supabase = await createClient();

  // Skipping something answered earlier withdraws it from the Imprint only.
  // What was written to the real tables stays: a site is not deleted because
  // somebody pressed skip on the layer that created it.
  await supabase
    .from('imprint_layers')
    .update({ state: 'skipped', answered_at: null })
    .eq('organisation_id', workspace.organisation.id)
    .eq('layer', raw);

  await supabase
    .from('imprint_records')
    .update({ current_layer: nextLayer(raw) ?? raw })
    .eq('organisation_id', workspace.organisation.id);

  await rescore(workspace.organisation.id);
  redirect(`/imprint/${nextLayer(raw) ?? 'review'}`);
}

export async function initialise(): Promise<void> {
  const workspace = await requirePermission('manage_organisation');

  const supabase = await createClient();
  const { error } = await supabase.rpc('complete_imprint', {
    p_organisation: workspace.organisation.id,
  });

  if (error) {
    // Nothing partial has happened — complete_imprint() is one statement — so
    // the honest thing is to leave the customer where they are.
    console.error('[amryn:imprint] could not complete', error.message);
    redirect('/imprint/review?problem=1');
  }

  await recordEvent(workspace.organisation.id, 'imprint.completed', {
    entityType: 'organisation',
    entityId: workspace.organisation.id,
  });

  revalidatePath('/command-centre');
  redirect('/command-centre?welcome=1');
}
