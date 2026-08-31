import 'server-only';
import { redirect } from 'next/navigation';
import { accountStore, type Account } from './store';
import { readSession } from './session';

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  companyName: string;
}

function present(account: Account): CurrentUser {
  // The password hash is dropped here rather than anywhere further up, so no
  // page can render one by accident.
  return {
    id: account.id,
    email: account.email,
    fullName: account.fullName,
    companyName: account.companyName,
  };
}

export async function currentUser(): Promise<CurrentUser | null> {
  const session = await readSession();
  if (!session) return null;

  const account = await accountStore().findById(session.sub);
  // A valid signature over an account that no longer exists — the in-memory
  // store restarted, most often. Treat it as signed out.
  return account ? present(account) : null;
}

/**
 * For pages inside the client area. Sends the reader to sign in, carrying
 * where they were headed so they land there rather than on a dashboard they
 * did not ask for.
 */
export async function requireUser(returnTo?: string): Promise<CurrentUser> {
  const user = await currentUser();
  if (user) return user;

  const next = returnTo ? `?next=${encodeURIComponent(returnTo)}` : '';
  redirect(`/sign-in${next}`);
}
