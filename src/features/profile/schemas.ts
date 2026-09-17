import { z } from 'zod';

/**
 * What the profile forms accept, shared between the browser and the server
 * action so the two cannot drift apart.
 */

/**
 * A name.
 *
 * The family name is optional and that is deliberate rather than lazy: plenty
 * of people have one name, the sign-up form has always asked for a single
 * "full name", and migration 46 backfilled "Alzan" as a first name with
 * nothing after it. A required surname would make that profile unsaveable
 * until its owner invented one.
 */
export const nameSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter your name').max(80, 'That name is too long'),
  lastName: z
    .string()
    .trim()
    .max(80, 'That name is too long')
    .optional()
    .transform((value) => (value ? value : null)),
});

/**
 * A date of birth, or the absence of one.
 *
 * An empty string is a value here, not a validation failure: it is how
 * somebody withdraws a date they gave earlier, which POPIA requires to be as
 * easy as giving it. The action turns it into null.
 *
 * The bounds are sanity rather than policy. A date in the future is a typo; so
 * is 1823. Neither is a judgement about who may use the product, and there is
 * no minimum age check here — Amryn is sold to businesses, and an age gate
 * would be collecting the date for a second purpose the column comment does
 * not admit to.
 */
export const dateOfBirthSchema = z.object({
  dateOfBirth: z
    .string()
    .trim()
    .refine((value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value), 'Enter a valid date')
    .refine((value) => {
      if (value === '') return true;
      const date = new Date(`${value}T00:00:00Z`);
      if (Number.isNaN(date.getTime())) return false;
      const year = date.getUTCFullYear();
      return year >= 1900 && date.getTime() <= Date.now();
    }, 'Enter a date in the past'),
});

/**
 * Changing a password from inside the account.
 *
 * The current one is asked for again, which is the difference between this and
 * the reset flow: a reset proves possession of the mailbox, and this proves
 * possession of the password. Without it, a session left open on a borrowed
 * laptop is enough to lock its owner out of their own account.
 */
export const changePasswordSchema = z
  .object({
    current: z.string().min(1, 'Enter your current password'),
    password: z.string().min(8, 'Passwords must be at least 8 characters'),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, {
    message: 'Those two passwords are not the same',
    path: ['confirm'],
  })
  .refine((value) => value.password !== value.current, {
    message: 'That is the password you already have',
    path: ['password'],
  });

export type ProfileState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'saved'; message: string };

/**
 * How much of a password is actually there.
 *
 * Length first, because it is the only property that reliably costs an
 * attacker anything, then variety, then a deduction for the two shapes that
 * look varied and are not: a run of the same character, and a run along the
 * keyboard or the alphabet.
 *
 * This is guidance, not a gate — the gate is eight characters, the same rule
 * the reset flow has always used and the same one Supabase enforces on its
 * side. A meter that refuses "correct horse battery staple" for having no
 * digit teaches people to add a 1 to the end of a short password, which is the
 * opposite of what it is for.
 */
export type PasswordStrength = 'weak' | 'fair' | 'strong';

export function passwordStrength(password: string): PasswordStrength {
  if (password.length < 8) return 'weak';

  let score = 0;
  if (password.length >= 10) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((c) => c.test(password)).length;
  if (classes >= 2) score += 1;
  if (classes >= 3) score += 1;

  if (/(.)\1{2,}/.test(password)) score -= 1;
  if (hasRun(password, 4)) score -= 1;

  if (score >= 3) return 'strong';
  if (score >= 2) return 'fair';
  return 'weak';
}

/** A run of consecutive codepoints — abcd, 1234, and their reverses. */
function hasRun(value: string, length: number): boolean {
  let ascending = 1;
  let descending = 1;
  for (let i = 1; i < value.length; i += 1) {
    const step = value.charCodeAt(i) - value.charCodeAt(i - 1);
    ascending = step === 1 ? ascending + 1 : 1;
    descending = step === -1 ? descending + 1 : 1;
    if (ascending >= length || descending >= length) return true;
  }
  return false;
}
