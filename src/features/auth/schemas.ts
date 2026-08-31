import { z } from 'zod';

/** Shared between the form and the server action, so validation cannot drift. */
export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(8, 'Passwords must be at least 8 characters'),
});

/**
 * Creating an account.
 *
 * The acceptance is validated here rather than trusted to the checkbox's own
 * `required` attribute. POPIA treats consent as something that has to be
 * given, and a browser attribute is not a record that it was — the server has
 * to be the one that refuses, or the record is of nothing.
 */
export const signUpSchema = credentialsSchema.extend({
  fullName: z.string().trim().min(2, 'Enter your name').max(120),
  accepted: z.literal('on', {
    error: 'Please accept the Terms of Service and Privacy Policy to continue.',
  }),
});

export const magicLinkSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

/** Asking for a reset link. Same shape as a magic link; named for what it does. */
export const forgotPasswordSchema = magicLinkSchema;

/**
 * Choosing a new password.
 *
 * The confirmation is checked here rather than only in the browser: a mistyped
 * password that locks someone out of the account they were recovering is a
 * worse outcome than the one they came to fix.
 */
export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, 'Passwords must be at least 8 characters'),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, {
    message: 'Those two passwords are not the same',
    path: ['confirm'],
  });

export type ActionState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'sent'; message: string };
