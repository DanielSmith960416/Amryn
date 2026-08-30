'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ACTIVE_ORG_COOKIE, requireUser } from '@/lib/auth/session';

/**
 * Switches the organisation the user is acting in.
 *
 * The cookie is only a preference. Membership is verified here before it is
 * written, and Row Level Security verifies it again on every query — so a
 * forged cookie changes nothing about what can be read.
 */
export async function switchOrganisation(organisationId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('organisation_id')
    .eq('user_id', user.id)
    .eq('organisation_id', organisationId)
    .eq('status', 'active')
    .maybeSingle();

  if (!membership) {
    throw new Error('You are not an active member of that organisation.');
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, organisationId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath('/', 'layout');
  redirect('/command-centre');
}

/* ── sector scope ──────────────────────────────────────────────────────── */

import { z } from 'zod';
import { assertPermission, requireWorkspace } from '@/lib/auth/session';
import type { Enums } from '@/types/database';

const sectorSchema = z.array(z.enum(['private', 'public', 'mixed', 'unknown'])).min(1);

export type SectorScopeState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'saved' };

/**
 * Sets which sectors this organisation's radar may surface.
 *
 * At least one sector must remain selected: an empty scope would be a radar
 * that silently shows nothing, which is worse than one that shows too much.
 * The database enforces the same rule, so this cannot be worked around.
 */
export async function updateSectorScope(
  _previous: SectorScopeState,
  formData: FormData,
): Promise<SectorScopeState> {
  const workspace = await requireWorkspace();

  try {
    assertPermission(workspace, 'manage_organisation');
  } catch {
    return { status: 'error', message: 'You do not have permission to change this.' };
  }

  const parsed = sectorSchema.safeParse(formData.getAll('sectors').map(String));
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Choose at least one sector. A radar scoped to nothing would show nothing.',
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('organisations')
    .update({ sector_scope: parsed.data as Enums['market_sector'][] })
    .eq('id', workspace.organisation.id);

  if (error) return { status: 'error', message: error.message };

  await supabase.from('audit_logs').insert({
    organisation_id: workspace.organisation.id,
    actor_id: workspace.user.id,
    action: 'organisation.sector_scope_changed',
    entity_type: 'organisation',
    entity_id: workspace.organisation.id,
    summary: `Radar sector scope set to ${parsed.data.join(', ')}`,
  });

  revalidatePath('/', 'layout');
  return { status: 'saved' };
}

/* ── onboarding ────────────────────────────────────────────────────────── */

const onboardingSchema = z.object({
  name: z.string().trim().min(2, 'Enter an organisation name').max(160),
  industry: z.string().trim().max(120).optional(),
  countryCode: z.string().trim().length(2, 'Use a two-letter country code').toUpperCase(),
  currencyCode: z.string().trim().length(3, 'Use a three-letter currency code').toUpperCase(),
});

export type OnboardingState = { status: 'idle' } | { status: 'error'; message: string };

/**
 * Creates an organisation and makes the caller its administrator.
 *
 * The work is done by the create_organisation() database function so that the
 * organisation, the membership, the subscription and the default weightings
 * are created together or not at all — a half-created workspace is worse than
 * a failed one.
 */
export async function createOrganisation(
  _previous: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  await requireUser();

  const parsed = onboardingSchema.safeParse({
    name: formData.get('name'),
    industry: formData.get('industry') || undefined,
    countryCode: formData.get('countryCode'),
    currencyCode: formData.get('currencyCode'),
  });

  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Check the details.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_organisation', {
    p_name: parsed.data.name,
    p_slug: slugify(parsed.data.name),
    p_industry: parsed.data.industry ?? null,
    p_country_code: parsed.data.countryCode,
    p_currency_code: parsed.data.currencyCode,
  });

  if (error || !data) {
    // A slug collision is the one failure worth explaining specifically.
    const message = error?.message.includes('organisations_slug_key')
      ? 'An organisation with a similar name already exists. Try a more specific name.'
      : (error?.message ?? 'Could not create that organisation.');
    return { status: 'error', message };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, data, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath('/', 'layout');
  redirect('/command-centre');
}

/** A URL-safe slug, with a short suffix so two "Acme Trading"s can coexist. */
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  const stem = base.length >= 2 ? base : 'org';
  return `${stem}-${Math.random().toString(36).slice(2, 6)}`;
}
