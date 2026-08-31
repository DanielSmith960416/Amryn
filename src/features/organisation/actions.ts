'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ACTIVE_ORG_COOKIE, requireUser } from '@/lib/auth/session';
import { checkLimit } from '@/lib/auth/rate-limit';
import { ourFault } from '@/lib/errors';
import { recordEvent } from '@/lib/audit';
import { LEGAL_VERSION } from '@/lib/legal/documents';

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

  if (error) {
    return {
      status: 'error',
      message: ourFault(
        'organisation',
        error,
        'We could not save that change. Please try again in a few minutes.',
      ),
    };
  }

  // Through the function, not an insert. The direct write was withdrawn in
  // migration 14 — it let a member put anybody's name on any action.
  await recordEvent(workspace.organisation.id, 'organisation.settings_changed', {
    entityId: workspace.organisation.id,
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
  // The organisation is a separate consenting party from the person creating
  // it. POPIA section 21 requires a written agreement with an operator, and
  // this is where the organisation enters it — accepted by an administrator on
  // its behalf, not inherited from that person's own sign-up.
  acceptedDpa: z.literal('on', {
    error: 'Please accept the Data Processing Addendum on behalf of your organisation.',
  }),
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
  const user = await requireUser();

  const parsed = onboardingSchema.safeParse({
    name: formData.get('name'),
    industry: formData.get('industry') || undefined,
    countryCode: formData.get('countryCode'),
    currencyCode: formData.get('currencyCode'),
    acceptedDpa: formData.get('acceptedDpa'),
  });

  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Check the details.' };
  }

  const limit = await checkLimit('createOrganisation', null);
  if (!limit.allowed) return { status: 'error', message: limit.message! };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_organisation', {
    p_name: parsed.data.name,
    p_slug: slugify(parsed.data.name),
    p_industry: parsed.data.industry ?? null,
    p_country_code: parsed.data.countryCode,
    p_currency_code: parsed.data.currencyCode,
  });

  if (error || !data) {
    return { status: 'error', message: explainCreateFailure(error) };
  }

  // Written after the organisation exists rather than passed into it: the
  // creation function's parameters are part of a signature the deployed
  // application resolves by name, and widening it to carry a consent field
  // would break every deployment that had not yet applied the change.
  //
  // A failure here is deliberately not fatal. The organisation is created and
  // the person is inside it; refusing them entry because a timestamp did not
  // write would be a worse answer than a record we can repair, and the
  // acceptance itself is not lost — they gave it, and the next administrator
  // action will be asked for it again.
  const { error: consentError } = await supabase
    .from('organisations')
    .update({
      dpa_accepted_at: new Date().toISOString(),
      dpa_version: LEGAL_VERSION,
      dpa_accepted_by: user.id,
    })
    .eq('id', data);

  if (consentError) {
    ourFault('onboarding', consentError);
  }

  await recordEvent(data, 'organisation.settings_changed', {
    entityId: data,
    summary: `Data processing addendum accepted (version ${LEGAL_VERSION})`,
  });

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

/**
 * A failed organisation creation, in words.
 *
 * The onboarding form used to print the database's own error, which is how
 * someone who had just signed up was shown:
 *
 *   Could not find the function public.create_organisation(p_country_code,
 *   p_currency_code, p_industry, p_name, p_slug) in the schema cache
 *
 * There is nothing in that sentence a reader can act on, and it is not their
 * fault in any case.
 *
 * The first fix named the faulty component and sent them to /diagnostics —
 * accurate, and still the wrong reader. Someone setting up their company's
 * workspace does not want to be told which internal function is unreachable;
 * they want to know whether to try again or to call somebody. So each failure
 * now says whose problem it is in ordinary words, the one they can fix
 * themselves — a name already taken — is still named precisely, and the
 * diagnosis goes to the server log where it can be acted on.
 */
function explainCreateFailure(error: { code?: string; message: string } | null): string {
  const message = error?.message ?? '';

  // Ours, whatever the shape. Logged in full so the setup fault is visible to
  // whoever can fix it, rather than dying with the request.
  const OURS =
    'We could not finish setting up your organisation. This is a fault on our side, not ' +
    'anything you entered — please try again in a few minutes.';

  // PGRST202: PostgREST resolves calls against a cached copy of the schema, so
  // this means missing *or* merely invisible. Either way it is the operator's
  // to fix, not the person filling in the form.
  if (error?.code === 'PGRST202' || /could not find the function/i.test(message)) {
    console.error(
      '[amryn:onboarding] create_organisation is not reachable — the migrations may not be ' +
        `applied, or the schema cache is stale. Open /diagnostics. (${message})`,
    );
    return OURS;
  }

  if (message.includes('organisations_slug_key')) {
    return 'An organisation with a similar name already exists. Try a more specific name.';
  }

  if (/authentication required/i.test(message)) {
    return 'Your session expired while this form was open. Sign in again and retry.';
  }

  if (/permission denied|42501/i.test(message)) {
    console.error(
      `[amryn:onboarding] the database refused to create the organisation. Check the migrations are fully applied: /diagnostics. (${message})`,
    );
    return OURS;
  }

  if (/country code must be|currency code must be/i.test(message)) {
    // Raised by create_organisation itself, and already in plain language.
    return message;
  }

  console.error(
    `[amryn:onboarding] organisation creation failed: ${message.length > 0 ? message : 'no reason given'}`,
  );
  return OURS;
}
