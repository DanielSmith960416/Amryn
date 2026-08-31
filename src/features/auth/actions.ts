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
import { classifyAuthError, signInErrorMessage } from './errors';
import { safeNextPath } from './next-path';


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
  // Not every failure here is a wrong password. Sending someone to retype
  // correct details because the deployment's API key was rejected is worse
  // than saying so.
  if (error) return { status: 'error', message: signInErrorMessage(error.message) };

  revalidatePath('/', 'layout');
  // Validated, never used raw: an unchecked target here is an open redirect.
  redirect(safeNextPath(formData.get('next')));
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
      emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(safeNextPath(formData.get('next')))}`,
    },
  });

  // error.message verbatim is how "Invalid API key" came to be printed under
  // the password field, as though the reader had typed one.
  if (error) return { status: 'error', message: classifyAuthError(error.message).message };

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
    options: {
      emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(safeNextPath(formData.get('next')))}`,
    },
  });

  if (error) {
    const fault = classifyAuthError(error.message);
    // A configuration fault is not an enumeration risk — the request never
    // reached the point of looking an address up — so it is reported plainly.
    if (fault.kind === 'configuration' || fault.kind === 'service') {
      return { status: 'error', message: fault.message };
    }
  }

  // Same message whether or not the address exists, so the form cannot be used
  // to discover which addresses have accounts.
  return { status: 'sent', message: 'If that address has an account, a sign-in link is on its way.' };
}

/**
 * Starts an OAuth sign-in.
 *
 * A provider that has not been enabled in Supabase is the normal state of a
 * fresh project, not an exceptional one — enabling Google or Microsoft means
 * registering an application with each and pasting credentials in. Throwing
 * here meant a button on the sign-in page returned a server error until that
 * work was done, which is a poor way to learn it was outstanding.
 *
 * So a failure sends the reader back to the sign-in page, where it is
 * explained. Both redirects sit outside the try/catch: redirect() signals by
 * throwing, and catching it would swallow the navigation.
 */
export async function signInWithProvider(formData: FormData): Promise<void> {
  const raw = formData.get('provider');
  const provider = raw === 'google' || raw === 'azure' ? raw : null;
  if (!provider) redirect('/sign-in?error=unsupported_provider');

  let url: string | null = null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${siteUrl()}/auth/callback` },
    });
    if (error) {
      console.error(`[amryn:auth] ${provider} sign-in unavailable: ${error.message}`);
    } else {
      url = data.url ?? null;
    }
  } catch (error) {
    console.error(`[amryn:auth] ${provider} sign-in failed to start`, error);
  }

  if (url) redirect(url);
  redirect(`/sign-in?error=provider_unavailable&provider=${provider}`);
}
