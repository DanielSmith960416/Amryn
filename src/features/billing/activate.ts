'use server';

/**
 * Redeeming an activation link.
 *
 * Separate from actions.ts because this one runs for a customer who has just
 * followed a link, and the file it lives beside — the operator's confirmation
 * step — must never be reachable from the same place.
 *
 * All the deciding happens in the database: whether the token is known,
 * whether it has been used, whether it has expired, and whether redeeming it
 * races another click are settled by redeem_activation() under a row lock.
 * This wraps it in a sentence.
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { recordEvent } from '@/lib/audit';
import { ourFault } from '@/lib/errors';

export type ActivateState = { status: 'idle' } | { status: 'error'; message: string };

export async function activateSubscription(
  _previous: ActivateState,
  formData: FormData,
): Promise<ActivateState> {
  // Signed in, because the activation records who opened it and because the
  // page it lands on is inside the platform.
  await requireUser();

  const token = z.string().min(20).safeParse(formData.get('token'));
  if (!token.success) {
    return { status: 'error', message: 'That link is not complete. Please use the whole link from the email.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('redeem_activation', { p_token: token.data });

  if (error || !data) {
    // These four are written for the customer and say exactly what to do next,
    // so they are passed through rather than replaced with a generic apology.
    const spoken =
      /not recognised|already been used|not ready to be used|has expired/i.test(error?.message ?? '');
    return {
      status: 'error',
      message: spoken
        ? error!.message
        : ourFault(
            'billing',
            error,
            'We could not activate your subscription just now. Your payment is safely on record — please try the link again in a few minutes.',
          ),
    };
  }

  await recordEvent(data.organisation_id, 'subscription.activated', {
    entityType: 'subscription',
    entityId: data.id,
  });

  revalidatePath('/settings/billing');
  redirect('/command-centre?activated=1');
}
