'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser, requireWorkspace } from '@/lib/auth/session';
import { recordAccountEvent } from '@/lib/audit';
import { checkAuthLimit } from '@/lib/auth/rate-limit';
import { authAttempt, authErrorMessage, classifyAuthError } from '@/features/auth/errors';
import {
  changePasswordSchema,
  dateOfBirthSchema,
  nameSchema,
  type ProfileState,
} from './schemas';

/**
 * Editing your own profile.
 *
 * Everything here writes to the caller's own row and nothing takes a user id
 * from the form: `user_profiles_write` is `id = auth.uid()`, so a forged id
 * would be refused anyway, but not passing one at all means there is nothing
 * to forge. The same reasoning as the rest of the product — the policy is the
 * control and the code does not rely on being the only caller.
 */

/**
 * The name, in two parts.
 *
 * Only the two parts are written. `full_name` is maintained by
 * amryn.sync_profile_name (migration 46), so sending all three would be two
 * sources of truth racing each other, and the one the trigger computes wins.
 */
export async function updateName(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await requireUser();

  const parsed = nameSchema.safeParse({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
  });
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Check the name.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('user_profiles')
    .update({ first_name: parsed.data.firstName, last_name: parsed.data.lastName })
    .eq('id', user.id);

  if (error) return { status: 'error', message: 'That name could not be saved.' };

  // The shell reads the name on every page, so the whole layout is stale.
  revalidatePath('/', 'layout');
  return { status: 'saved', message: 'Name saved.' };
}

/**
 * The date of birth, or the removal of it.
 *
 * An empty field clears the column. That is the POPIA half of this feature and
 * it is not decoration: a date given for a birthday greeting has to be as easy
 * to withdraw as it was to give, and "email someone to have it deleted" is not
 * that.
 */
export async function updateDateOfBirth(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await requireUser();

  const parsed = dateOfBirthSchema.safeParse({ dateOfBirth: formData.get('dateOfBirth') });
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Check the date.' };
  }

  const value = parsed.data.dateOfBirth === '' ? null : parsed.data.dateOfBirth;

  const supabase = await createClient();
  const { error } = await supabase
    .from('user_profiles')
    .update({ date_of_birth: value })
    .eq('id', user.id);

  if (error) return { status: 'error', message: 'That date could not be saved.' };

  revalidatePath('/', 'layout');
  return {
    status: 'saved',
    message: value ? 'Date of birth saved.' : 'Date of birth removed.',
  };
}

/**
 * Changing the password from inside the account.
 *
 * ── why the current password is asked for ─────────────────────────────────
 * updateUser() will change a password on the strength of the session alone.
 * That means an unlocked laptop, a borrowed phone or a session cookie lifted
 * from a shared machine is enough to take the account permanently — change the
 * password and the owner is locked out of their own business.
 *
 * So the current one is verified first, by signing in with it. That is the
 * only way to check a password against Supabase Auth: the hash is in
 * auth.users, which no policy here can read, and it should stay that way.
 *
 * ── what that costs, and why it is worth it ───────────────────────────────
 * The check mints a fresh session for the same user, so the caller's cookies
 * are rewritten mid-request. They stay signed in and it is the same account,
 * which is why this is acceptable; it is also why the attempt is rate limited
 * on the same bucket as signing in. Without that, this form is an oracle for
 * guessing the current password without tripping any of the sign-in limits.
 */
export async function changePassword(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const workspace = await requireWorkspace();
  const email = workspace.user.email;

  const parsed = changePasswordSchema.safeParse({
    current: formData.get('current'),
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  });
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Check the password.' };
  }

  if (!email) {
    return {
      status: 'error',
      message: 'This account has no email address, so its password cannot be changed here.',
    };
  }

  const limit = await checkAuthLimit('signIn', email);
  if (!limit.allowed) return { status: 'error', message: limit.message! };

  const supabase = await createClient();

  const wrong = await authAttempt(() =>
    supabase.auth.signInWithPassword({ email, password: parsed.data.current }),
  );
  if (wrong) {
    /*
     * Which failure it was matters here more than anywhere else on this form.
     * "That is not your current password" is the right answer to a wrong
     * password and a lie about a dropped connection — and it is a lie that
     * sends somebody off to reset a password that was never wrong. Only a
     * refusal about the credentials is reported as one; anything else keeps
     * its own words.
     */
    const fault = classifyAuthError(wrong);
    if (fault.kind !== 'credentials') {
      return { status: 'error', message: fault.message };
    }
    await recordAccountEvent('account.sign_in_failed', 'Password change refused: current password');
    return { status: 'error', message: 'That is not your current password.' };
  }

  const error = await authAttempt(() =>
    supabase.auth.updateUser({ password: parsed.data.password }),
  );
  if (error) return { status: 'error', message: authErrorMessage(error) };

  await recordAccountEvent('account.password_changed', 'Password changed from settings');

  return { status: 'saved', message: 'Password changed. It applies the next time you sign in.' };
}
