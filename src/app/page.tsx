import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';

/**
 * The platform root has no page of its own. The marketing site lives in /docs
 * and is served separately by GitHub Pages; this application starts at the
 * Command Centre, or at the door.
 */
export default async function RootPage() {
  const user = await getCurrentUser();
  redirect(user ? '/command-centre' : '/sign-in');
}
