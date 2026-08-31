'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { endSession, startSession } from '@/lib/auth/session';
import { EmailTakenError, accountStore, normaliseEmail } from '@/lib/auth/store';
import { fieldErrors, signInSchema, signUpSchema, type FormState } from './schemas';

/**
 * Only relative, single-slash paths are honoured as a redirect target.
 *
 * `//evil.example` is a protocol-relative URL that browsers treat as absolute,
 * so rejecting it matters as much as rejecting `https://`.
 */
function safeNext(next: FormDataEntryValue | null): string {
  const value = typeof next === 'string' ? next : '';
  return value.startsWith('/') && !value.startsWith('//') ? value : '/command-centre';
}

export async function signUpAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get('fullName'),
    companyName: formData.get('companyName'),
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { fullName, companyName, email, password } = parsed.data;
  const id = randomUUID();

  try {
    await accountStore().create({
      id,
      email: normaliseEmail(email),
      passwordHash: await hashPassword(password),
      fullName,
      companyName,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof EmailTakenError) {
      return { errors: { email: 'An account with that email address already exists.' } };
    }
    throw error;
  }

  await startSession(id);
  redirect(safeNext(formData.get('next')));
}

export async function signInAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const account = await accountStore().findByEmail(parsed.data.email);

  // The same message whether the address is unknown or the password is wrong.
  // Distinguishing them turns the sign-in form into a way to enumerate which
  // businesses are Amryn clients.
  const valid = account
    ? await verifyPassword(parsed.data.password, account.passwordHash)
    : false;

  if (!account || !valid) {
    return { message: 'That email address and password do not match an account.' };
  }

  await startSession(account.id);
  redirect(safeNext(formData.get('next')));
}

export async function signOutAction(): Promise<void> {
  await endSession();
  redirect('/');
}
