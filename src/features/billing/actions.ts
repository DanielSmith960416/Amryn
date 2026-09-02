'use server';

/**
 * Buying a subscription, and confirming that the money arrived.
 *
 * There is no card gateway. A customer chooses a plan, is given a reference,
 * transfers the money and emails the proof; we confirm it and send back a
 * one-time activation link. The two halves are deliberately in different
 * hands, and the split is what makes the arrangement safe:
 *
 *   · requestSubscription() is the customer's. It creates a record of what
 *     they want and what to quote on the transfer. It grants nothing.
 *   · confirmPayment() is ours. It runs with the service role, which is the
 *     only thing in the system that can mark a payment received, and mints the
 *     activation link.
 *
 * A customer who tried to skip the middle step would find the database
 * refusing them: subscription_activations is readable to them and not
 * writable, and issue_activation() is revoked from every signed-in role. The
 * check is not in this file, which is the point of putting it there.
 */
import { randomBytes, createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/session';
import { checkLimit } from '@/lib/auth/rate-limit';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/env';
import { ourFault } from '@/lib/errors';
import { recordEvent } from '@/lib/audit';
import type { Enums } from '@/types/database';

/** Same treatment as an invitation: 32 bytes, and only the hash is stored. */
function newToken(): string {
  return randomBytes(32).toString('base64url');
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const requestSchema = z.object({
  plan: z.enum(['starter', 'growth', 'professional']),
  term: z.coerce.number().int().refine((n) => n === 1 || n === 12, 'Choose monthly or yearly'),
});

export type RequestState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'requested'; reference: string; amountCents: number; currency: string };

export async function requestSubscription(
  _previous: RequestState,
  formData: FormData,
): Promise<RequestState> {
  const workspace = await requirePermission('manage_billing');

  const parsed = requestSchema.safeParse({
    plan: formData.get('plan'),
    term: formData.get('term'),
  });
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Check the details.' };
  }

  const limit = await checkLimit('subscriptionRequest', workspace.organisation.id);
  if (!limit.allowed) return { status: 'error', message: limit.message! };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('request_subscription', {
    p_plan: parsed.data.plan as Enums['subscription_plan'],
    p_term_months: parsed.data.term,
  });

  if (error || !data) {
    // The function raises with a sentence meant for the customer where it can
    // — an Enterprise plan that has to be arranged, for instance — so that one
    // is worth passing on rather than replacing.
    const spoken = /arranged with us directly|by the month or by the year|manages billing/i.test(
      error?.message ?? '',
    );
    return {
      status: 'error',
      message: spoken
        ? error!.message
        : ourFault(
            'billing',
            error,
            'We could not start that subscription. Nothing you entered was at fault — please try again in a few minutes.',
          ),
    };
  }

  await recordEvent(workspace.organisation.id, 'subscription.requested', {
    entityType: 'subscription_activation',
    summary: `${parsed.data.plan}, ${parsed.data.term === 12 ? 'yearly' : 'monthly'}`,
  });

  revalidatePath('/settings/billing');

  return {
    status: 'requested',
    reference: data.reference,
    amountCents: data.amount_cents,
    currency: data.currency_code,
  };
}

/** Withdraws a request that has not been paid. */
export async function cancelRequest(formData: FormData): Promise<void> {
  const workspace = await requirePermission('manage_billing');
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return;

  // The customer cannot write the row — that is what keeps confirmation out of
  // their hands — so the withdrawal goes through the service role, scoped to
  // their own organisation and to a state that has not been paid for.
  const admin = createAdminClient();
  await admin
    .from('subscription_activations')
    .update({ state: 'cancelled' })
    .eq('id', id.data)
    .eq('organisation_id', workspace.organisation.id)
    .eq('state', 'awaiting_payment');

  await recordEvent(workspace.organisation.id, 'subscription.request_withdrawn', {
    entityType: 'subscription_activation',
    entityId: id.data,
  });

  revalidatePath('/settings/billing');
}

/* ── the operator's half ───────────────────────────────────────────────── */

export type ConfirmState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'confirmed'; link: string; organisation: string; reference: string };

/**
 * Marks a transfer received and returns the activation link, once.
 *
 * Guarded by internalAccess() at the page, and by the service role here: the
 * database has revoked issue_activation() from every signed-in role, so a
 * customer reaching this code path directly would still be refused.
 *
 * The link is returned rather than emailed automatically because a person has
 * just looked at a bank statement and decided this payment is real — and the
 * same person should decide where the link goes.
 */
export async function confirmPayment(
  _previous: ConfirmState,
  formData: FormData,
): Promise<ConfirmState> {
  const { internalAccess } = await import('@/lib/auth/internal-access');
  const reason = await internalAccess(String(formData.get('key') ?? '') || undefined);
  if (reason === 'denied') {
    return { status: 'error', message: 'Not available.' };
  }

  const parsed = z
    .object({
      id: z.string().uuid(),
      note: z.string().trim().max(500).optional(),
    })
    .safeParse({ id: formData.get('id'), note: formData.get('note') ?? undefined });

  if (!parsed.success) {
    return { status: 'error', message: 'Check the details.' };
  }

  const admin = createAdminClient();
  const token = newToken();

  const { data, error } = await admin.rpc('issue_activation', {
    p_activation: parsed.data.id,
    p_token_hash: hash(token),
    p_note: parsed.data.note ?? null,
  });

  if (error || !data) {
    return {
      status: 'error',
      message: error?.message ?? 'That request is no longer awaiting payment.',
    };
  }

  const { data: organisation } = await admin
    .from('organisations')
    .select('name')
    .eq('id', data.organisation_id)
    .maybeSingle();

  revalidatePath('/activations');

  return {
    status: 'confirmed',
    link: `${siteUrl()}/activate/${token}`,
    organisation: organisation?.name ?? 'the organisation',
    reference: data.reference,
  };
}
