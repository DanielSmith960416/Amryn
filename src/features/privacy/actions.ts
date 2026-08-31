'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import { checkLimit } from '@/lib/auth/rate-limit';
import { LEGAL_VERSION } from '@/lib/legal/documents';
import { ourFault } from '@/lib/errors';

export type RequestState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'sent'; message: string };

const requestSchema = z.object({
  kind: z.enum(['export', 'deletion', 'correction'], {
    error: 'Choose what you would like us to do.',
  }),
  note: z.string().trim().max(2000, 'Please keep this under 2 000 characters.').optional(),
});

type RequestKind = z.infer<typeof requestSchema>['kind'];

/** What each kind of request commits us to, in the words the person will read back. */
const ACKNOWLEDGEMENT: Record<RequestKind, string> = {
  export:
    'Your request is recorded. We will send a copy of everything we hold about you to your account address within 30 days.',
  deletion:
    'Your request is recorded. We will respond within 30 days. Where your employer holds records about you in their own workspace, we will pass the request to them and tell you we have.',
  correction:
    'Your request is recorded. We will correct what we can, and tell you within 30 days if there is anything we cannot.',
};

/**
 * Records a request to exercise a POPIA right.
 *
 * Recorded rather than acted on. Erasure in particular needs judgement — one
 * member of an organisation cannot delete that organisation's records, and a
 * request may implicate colleagues — so what this creates is an obligation
 * with a date on it, which is what section 24 actually asks for. Acting
 * immediately would be the more impressive-looking option and the wrong one.
 */
export async function submitDataRequest(
  _previous: RequestState,
  formData: FormData,
): Promise<RequestState> {
  const user = await requireUser();

  const parsed = requestSchema.safeParse({
    kind: formData.get('kind'),
    note: formData.get('note') || undefined,
  });

  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Check the form.' };
  }

  const limit = await checkLimit('dataRequest', user.id);
  if (!limit.allowed) return { status: 'error', message: limit.message! };

  const supabase = await createClient();
  const { error } = await supabase.from('data_requests').insert({
    user_id: user.id,
    kind: parsed.data.kind,
    note: parsed.data.note ?? null,
  });

  if (error) {
    return {
      status: 'error',
      message: ourFault(
        'privacy',
        error,
        'We could not record that request just now. Please write to us instead — the address is on the Privacy Policy — so that it is not lost.',
      ),
    };
  }

  revalidatePath('/settings/privacy');
  return { status: 'sent', message: ACKNOWLEDGEMENT[parsed.data.kind] };
}

/**
 * Records acceptance of the current version of the terms and privacy policy.
 *
 * Used when the documents change under someone who already has an account.
 * Their earlier acceptance stays true of the version they gave it for; this
 * writes a new one rather than editing the old.
 */
export async function acceptCurrentDocuments(): Promise<void> {
  const user = await requireUser();
  const now = new Date().toISOString();

  const supabase = await createClient();
  await supabase
    .from('user_profiles')
    .update({
      terms_accepted_at: now,
      terms_version: LEGAL_VERSION,
      privacy_accepted_at: now,
      privacy_version: LEGAL_VERSION,
    })
    .eq('id', user.id);

  revalidatePath('/', 'layout');
}
