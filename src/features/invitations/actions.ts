'use server';

/**
 * Creating and withdrawing invitations.
 *
 * The link is the credential, so the token is generated here with a
 * cryptographic RNG, hashed, and only the hash is stored. The raw value is
 * returned once, to the administrator who will send it on, and then nobody —
 * not the database, not a backup, not a log — holds anything that grants
 * access.
 *
 * The email is sent when a mail service is configured, and the link is shown
 * either way. A deployment without SMTP behaves exactly as it did before, and
 * a send that fails says so and hands back the link — an invitation that
 * silently fails to arrive is worse than one the sender passes on themselves.
 */
import { randomBytes, createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/session';
import { checkLimit } from '@/lib/auth/rate-limit';
import { createClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/env';
import { ROLE_LABELS } from '@/lib/auth/permissions';
import { isEmailConfigured, sendMail } from '@/lib/email/smtp';
import { invitationEmail } from '@/lib/email/invitation';
import { INVITABLE_ROLES, INVITATION_DAYS } from './roles';

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('That does not look like an email address'),
  role: z.enum(INVITABLE_ROLES),
});

/** What happened to the email, which is separate from whether the invitation exists. */
export type Delivery = 'sent' | 'failed' | 'not-configured';

export type InviteState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | {
      status: 'created';
      link: string;
      email: string;
      delivery: Delivery;
      /** Why the email did not go, in words safe to show. */
      deliveryProblem?: string;
    };

/** 32 bytes of randomness, url-safe, so the token survives being pasted anywhere. */
function newToken(): string {
  return randomBytes(32).toString('base64url');
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createInvitation(
  _previous: InviteState,
  formData: FormData,
): Promise<InviteState> {
  // Throws unless the caller manages members in the organisation they are
  // acting in. RLS enforces the same thing again on the insert below; this is
  // the half that produces a sensible message.
  const workspace = await requirePermission('manage_users');

  const parsed = inviteSchema.safeParse({
    email: formData.get('email'),
    role: formData.get('role'),
  });
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Check the details.' };
  }

  const limit = await checkLimit('invite', workspace.organisation.id);
  if (!limit.allowed) return { status: 'error', message: limit.message! };

  const supabase = await createClient();
  const token = newToken();

  const { error } = await supabase.from('organisation_invitations').insert({
    organisation_id: workspace.organisation.id,
    email: parsed.data.email,
    role: parsed.data.role,
    token_hash: hash(token),
    invited_by: workspace.user.id,
  });

  if (error) {
    // The partial unique index. Worth naming, because the fix is to withdraw
    // the open one rather than to try a different address.
    if (error.message.includes('organisation_invitations_open_email')) {
      return {
        status: 'error',
        message: `${parsed.data.email} already has an open invitation. Withdraw it first if you want to change the role.`,
      };
    }
    return { status: 'error', message: `Could not create the invitation: ${error.message}` };
  }

  const link = `${siteUrl()}/invite/${token}`;
  revalidatePath('/settings/users');

  // The invitation exists from here on. Sending the email is an attempt to
  // save the sender a step, not a part of creating it — so a mail failure
  // reports itself and hands back the link, rather than undoing work that
  // succeeded or claiming a delivery that did not happen.
  if (!isEmailConfigured()) {
    return { status: 'created', email: parsed.data.email, link, delivery: 'not-configured' };
  }

  const sent = await sendMail(
    invitationEmail({
      to: parsed.data.email,
      organisation: workspace.organisation.name,
      roleLabel: ROLE_LABELS[parsed.data.role] ?? parsed.data.role,
      inviterName: workspace.profile?.full_name ?? workspace.user.email ?? 'A colleague',
      inviterEmail: workspace.user.email ?? '',
      link,
      expiresInDays: INVITATION_DAYS,
    }),
  );

  return {
    status: 'created',
    email: parsed.data.email,
    link,
    delivery: sent.ok ? 'sent' : 'failed',
    deliveryProblem: sent.problem,
  };
}

export async function revokeInvitation(formData: FormData): Promise<void> {
  const workspace = await requirePermission('manage_users');
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return;

  const supabase = await createClient();
  // Scoped to the organisation as well as the id: RLS would refuse another
  // organisation's row anyway, but a query that could only ever have matched
  // one tenant is easier to be sure about.
  await supabase
    .from('organisation_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id.data)
    .eq('organisation_id', workspace.organisation.id)
    .is('accepted_at', null);

  revalidatePath('/settings/users');
}
