'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ACTIVE_ORG_COOKIE } from '@/lib/auth/session';

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // Clear the workspace preference too, so the next person to sign in on this
  // machine does not land in someone else's organisation selector.
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_ORG_COOKIE);

  revalidatePath('/', 'layout');
  redirect('/sign-in');
}

/* ── sign in and sign up ───────────────────────────────────────────────── */

import { credentialsSchema, magicLinkSchema, signUpSchema, type ActionState } from './schemas';
import { siteUrl } from '@/lib/env';

/**
 * Errors are deliberately vague about *which* half was wrong: telling an
 * attacker that an address exists but the password is wrong turns a login form
 * into an account-enumeration tool.
 */
const INVALID_CREDENTIALS = 'That email and password combination was not recognised.';

export async function signInWithPassword(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Check your details.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { status: 'error', message: INVALID_CREDENTIALS };

  revalidatePath('/', 'layout');
  redirect('/command-centre');
}

export async function signUpWithPassword(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
  });

  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Check your details.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${siteUrl()}/auth/callback`,
    },
  });

  if (error) return { status: 'error', message: error.message };

  return {
    status: 'sent',
    message: 'Check your inbox. We have sent a link to confirm your address.',
  };
}

export async function signInWithMagicLink(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = magicLinkSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Check your address.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: `${siteUrl()}/auth/callback` },
  });

  if (error) return { status: 'error', message: error.message };

  // Same message whether or not the address exists, for the same reason as above.
  return { status: 'sent', message: 'If that address has an account, a sign-in link is on its way.' };
}

export async function signInWithProvider(formData: FormData): Promise<void> {
  const provider = formData.get('provider');
  if (provider !== 'google' && provider !== 'azure') {
    throw new Error('Unsupported sign-in provider');
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${siteUrl()}/auth/callback` },
  });

  if (error || !data.url) throw new Error(error?.message ?? 'Could not start that sign-in');
  redirect(data.url);
}
