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
