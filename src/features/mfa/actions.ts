'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import { checkLimit } from '@/lib/auth/rate-limit';
import { recordAccountEvent } from '@/lib/audit';
import { ourFault } from '@/lib/errors';
import { safeNextPath } from '@/features/auth/next-path';
import { generateRecoveryCodes, hashRecoveryCode } from './recovery-codes';
import { removeAllFactors, serviceRoleKey } from './admin';

/**
 * Turning two-factor authentication on, off, and getting back in without it.
 *
 * Supabase holds the factor and checks the codes. These actions own the
 * surrounding decisions: when the stored flag the database guard reads is set,
 * when recovery codes are issued, and what a person is told at each step.
 *
 * ── the flag and the factor must move together ────────────────────────────
 * public.user_profiles.mfa_enabled is what migration 15's guard consults, and
 * it is not the same thing as having a factor. If the flag is set and the
 * factor is gone, the account cannot read its own data and nothing can satisfy
 * the guard. So the flag is set only after Supabase confirms a verified
 * factor, and cleared in the same breath as removing the last one.
 */

const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the six digits from your authenticator app.');

export type EnrolState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | {
      status: 'enrolling';
      factorId: string;
      /** An SVG data URI from Supabase. No QR library needed. */
      qrCode: string;
      /** For anyone who cannot scan — an authenticator on the same device. */
      secret: string;
    }
  | { status: 'enabled'; codes: string[] };

/**
 * Starts enrolment: asks Supabase for a factor and hands back the QR code.
 *
 * Nothing is required of the user yet, and nothing is enabled. An unverified
 * factor is inert — it neither protects the account nor locks anybody out — so
 * abandoning this page halfway is harmless.
 */
export async function beginEnrolment(): Promise<EnrolState> {
  const user = await requireUser();
  const supabase = await createClient();

  // Clear out anything left by an abandoned attempt. Supabase refuses a second
  // factor with the same friendly name, and an unverified one from last week
  // is not something to present to somebody as the code to scan.
  const { data: existing } = await supabase.auth.mfa.listFactors();
  for (const factor of existing?.all ?? []) {
    if (factor.status === 'unverified') {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `Amryn · ${user.email ?? 'account'}`,
  });

  if (error || !data) {
    return {
      status: 'error',
      message: ourFault(
        'mfa',
        error,
        'We could not start setting this up. Nothing has changed on your account — please try again in a few minutes.',
      ),
    };
  }

  return {
    status: 'enrolling',
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

/**
 * Confirms enrolment with a code from the app, then issues recovery codes.
 *
 * The order matters. The factor is verified first, so a wrong code costs
 * nothing; the flag is set only once Supabase has confirmed it; and the
 * recovery codes are the last thing, because they are the only part of this
 * the person can never be shown again.
 */
export async function confirmEnrolment(
  _previous: EnrolState,
  formData: FormData,
): Promise<EnrolState> {
  const user = await requireUser();

  const factorId = z.string().uuid().safeParse(formData.get('factorId'));
  const parsed = codeSchema.safeParse(formData.get('code'));

  if (!factorId.success) {
    return { status: 'error', message: 'That setup attempt has expired. Start again.' };
  }
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]!.message };
  }

  // Guessing six digits is a 1-in-a-million shot per attempt, which is a
  // different proposition when the attempts are free.
  const limit = await checkLimit('mfaVerify', user.id);
  if (!limit.allowed) return { status: 'error', message: limit.message! };

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factorId.data,
    code: parsed.data,
  });

  if (error) {
    return {
      status: 'error',
      message:
        'That code was not accepted. Codes last about thirty seconds — wait for the next one and try again, and check your phone’s clock is set automatically.',
    };
  }

  const codes = generateRecoveryCodes();
  const { error: codeError } = await supabase.rpc('replace_recovery_codes', {
    p_hashes: codes.map(hashRecoveryCode),
  });

  if (codeError) {
    // The factor is verified and works. Refusing to enable it now would leave
    // the account in the state this whole module exists to avoid — a factor
    // Supabase will demand, with no flag and no way back.
    return {
      status: 'error',
      message: ourFault(
        'mfa',
        codeError,
        'Your authenticator is set up, but we could not create your recovery codes. Open this page again to finish — do not sign out until you have them.',
      ),
    };
  }

  // Only now. The guard in the database reads this, and setting it before the
  // factor existed would lock the account out of its own data.
  await supabase
    .from('user_profiles')
    .update({ mfa_enabled: true, mfa_enabled_at: new Date().toISOString() })
    .eq('id', user.id);

  await recordAccountEvent('account.mfa_enabled', 'Two-step sign-in turned on');

  revalidatePath('/', 'layout');
  return { status: 'enabled', codes };
}

export type SimpleState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'done'; message: string };

/**
 * Turns it off.
 *
 * Only reachable from a session that has already presented the factor — the
 * settings page is behind the same guard as everything else — so this is
 * password plus second factor, which is the right price for removing it.
 */
export async function disableTwoFactor(): Promise<SimpleState> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (error) {
      return {
        status: 'error',
        message: ourFault('mfa', error, 'We could not turn this off. Please try again in a moment.'),
      };
    }
  }

  // Cleared after the factors are gone, never before: a flag set with no
  // factor to present is an account locked out of its own data.
  await supabase
    .from('user_profiles')
    .update({ mfa_enabled: false, mfa_enabled_at: null })
    .eq('id', user.id);

  await recordAccountEvent('account.mfa_disabled', 'Two-step sign-in turned off');

  revalidatePath('/', 'layout');
  return { status: 'done', message: 'Two-step sign-in is off. You can turn it back on any time.' };
}

/** Issues a fresh set, invalidating the old one. */
export async function regenerateRecoveryCodes(): Promise<
  { status: 'error'; message: string } | { status: 'issued'; codes: string[] }
> {
  await requireUser();
  const supabase = await createClient();

  const codes = generateRecoveryCodes();
  const { error } = await supabase.rpc('replace_recovery_codes', {
    p_hashes: codes.map(hashRecoveryCode),
  });

  if (error) {
    return {
      status: 'error',
      message: ourFault(
        'mfa',
        error,
        'We could not issue new codes. Your existing ones still work — please try again in a moment.',
      ),
    };
  }

  await recordAccountEvent('account.mfa_recovery_reissued', 'New recovery codes issued');
  return { status: 'issued', codes };
}

/* ── the challenge at sign-in ──────────────────────────────────────────── */

export type VerifyState = { status: 'idle' } | { status: 'error'; message: string };

/**
 * Completes the second step, raising the session to aal2.
 *
 * Reached after the password has already been accepted, so this is the second
 * factor and not the first. Everything the platform holds stays closed until
 * it succeeds — by the database, not by this redirect.
 */
export async function verifyChallenge(
  _previous: VerifyState,
  formData: FormData,
): Promise<VerifyState> {
  const user = await requireUser();

  const parsed = codeSchema.safeParse(formData.get('code'));
  if (!parsed.success) return { status: 'error', message: parsed.error.issues[0]!.message };

  const limit = await checkLimit('mfaVerify', user.id);
  if (!limit.allowed) return { status: 'error', message: limit.message! };

  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp?.find((candidate) => candidate.status === 'verified');

  if (!factor) {
    // Nothing to challenge. Sending them back rather than leaving them on a
    // page with no way forward — the guard will not stop them either, because
    // there is no factor for it to require.
    redirect(safeNextPath(formData.get('next')));
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: parsed.data,
  });

  if (error) {
    await recordAccountEvent('account.sign_in_failed', 'Second step not completed');
    return {
      status: 'error',
      message:
        'That code was not accepted. Codes last about thirty seconds — wait for the next one, and check your phone’s clock is set automatically.',
    };
  }

  await recordAccountEvent('account.signed_in', 'Completed the second step');

  revalidatePath('/', 'layout');
  redirect(safeNextPath(formData.get('next')));
}

/**
 * Getting back in without the phone.
 *
 * A recovery code does not sign anybody in — it removes the second factor, and
 * the person is asked to set one up again. So what gets somebody back into
 * their account is the password *and* a code, which is still two things.
 *
 * Removing the factor needs the admin API and therefore the service role key.
 * Where that is not configured the code is deliberately not spent: burning a
 * single-use code on an attempt that cannot succeed would leave the person
 * worse off than before they tried.
 */
export async function useRecoveryCode(
  _previous: VerifyState,
  formData: FormData,
): Promise<VerifyState> {
  const user = await requireUser();

  const code = z
    .string()
    .trim()
    .min(8, 'Enter one of your recovery codes.')
    .safeParse(formData.get('code'));
  if (!code.success) return { status: 'error', message: code.error.issues[0]!.message };

  const limit = await checkLimit('mfaRecovery', user.id);
  if (!limit.allowed) return { status: 'error', message: limit.message! };

  if (!serviceRoleKey()) {
    console.error(
      '[amryn:mfa] a recovery code was offered but SUPABASE_SERVICE_ROLE_KEY is not set, so the ' +
        'factor cannot be removed. The code was not spent.',
    );
    return {
      status: 'error',
      message:
        'We cannot complete recovery automatically at the moment. Please contact whoever administers Amryn for your organisation — your codes are still valid.',
    };
  }

  const supabase = await createClient();
  const { data: accepted, error } = await supabase.rpc('redeem_recovery_code', {
    p_hash: hashRecoveryCode(code.data),
  });

  if (error) {
    return {
      status: 'error',
      message: ourFault('mfa', error, 'We could not check that code. Please try again in a moment.'),
    };
  }

  if (accepted !== true) {
    return {
      status: 'error',
      message: 'That is not one of your recovery codes, or it has already been used.',
    };
  }

  // The code is spent and the flag is cleared by the function above. Removing
  // the factor is what Supabase still needs, and only the service role can do
  // it for a session that has not presented that factor.
  const removed = await removeAllFactors(user.id);
  if (!removed.ok) {
    return {
      status: 'error',
      message: ourFault(
        'mfa',
        removed.problem,
        'Your code was accepted, but we could not finish removing the old authenticator. Sign in again in a few minutes and it should let you through.',
      ),
    };
  }

  await recordAccountEvent('account.mfa_recovery_used', 'Signed in with a recovery code');

  revalidatePath('/', 'layout');
  redirect('/settings/security?recovered=1');
}
