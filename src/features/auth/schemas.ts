import { z } from 'zod';

/** Shared between the form and the server action, so validation cannot drift. */
export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(8, 'Passwords must be at least 8 characters'),
});

export const signUpSchema = credentialsSchema.extend({
  fullName: z.string().trim().min(2, 'Enter your name').max(120),
});

export const magicLinkSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

export type ActionState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'sent'; message: string };
