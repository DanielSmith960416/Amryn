'use server';

/**
 * Accepting an invitation.
 *
 * All of the deciding happens in accept_invitation(): whether the link is
 * live, whether it was sent to this address, and what role the membership
 * gets. Nothing here is trusted with any of that — this only carries the token
 * across and turns the database's refusal into a sentence.
 */
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ACTIVE_ORG_COOKIE } from '@/lib/auth/session';

export type AcceptState = { status: 'idle' } | { status: 'error'; message: string };

export async function acceptInvitation(
  _previous: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  const token = String(formData.get('token') ?? '');
  if (!token) return { status: 'error', message: 'This link is missing its invitation code.' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('accept_invitation', { p_token: token });

  if (error) {
    // The function raises with wording meant to be read, so it is passed
    // through — but only for the codes it defines. Anything else gets a
    // general message rather than the database's own.
    const known = /invitation|email address|authentication required/i.test(error.message);
    return {
      status: 'error',
      message: known
        ? capitalise(error.message)
        : 'This invitation could not be accepted. Ask whoever invited you to send a new link.',
    };
  }

  // Land in the organisation just joined rather than whichever one the
  // switcher last remembered.
  if (typeof data === 'string') {
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_ORG_COOKIE, data, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  revalidatePath('/', 'layout');
  redirect('/command-centre');
}

function capitalise(message: string): string {
  const trimmed = message.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
