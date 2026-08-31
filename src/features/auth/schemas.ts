import { z } from 'zod';

/**
 * What the sign-up form asks for, and why each field is here.
 *
 * The brief asks that onboarding stay simple and lead straight into the
 * platform. So: four fields, no email verification step, no organisation
 * wizard. The company name is the only one that is not strictly authentication
 * — it is asked because the platform is a workspace for a business, and a
 * workspace with no name is furniture.
 */

const email = z
  .string()
  .trim()
  .min(1, 'Enter your email address.')
  .max(254, 'That email address is too long.')
  .email('Enter a valid email address.');

/**
 * Length is the requirement, and the only one.
 *
 * Composition rules (a digit, a symbol, a capital) push people towards
 * `Password1!` and towards reuse. Twelve characters of anything is a better
 * password than eight characters of theatre.
 */
const password = z
  .string()
  .min(12, 'Use at least 12 characters. A short phrase works well.')
  .max(200, 'That password is too long.');

export const signUpSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, 'Enter your name.')
    .max(120, 'That name is too long.'),
  companyName: z
    .string()
    .trim()
    .min(1, 'Enter your business name.')
    .max(160, 'That business name is too long.'),
  email,
  password,
});

export const signInSchema = z.object({
  email,
  // Deliberately not the sign-up rule: a password created under older rules
  // must still be able to sign in.
  password: z.string().min(1, 'Enter your password.'),
});

export type SignUpValues = z.infer<typeof signUpSchema>;
export type SignInValues = z.infer<typeof signInSchema>;

export interface FormState {
  /** Field name → first error message. */
  errors?: Record<string, string>;
  /** A message about the submission as a whole. */
  message?: string;
}

/** Flattens a Zod failure into the shape the forms render. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !(key in out)) out[key] = issue.message;
  }
  return out;
}
