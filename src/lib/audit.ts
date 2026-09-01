import 'server-only';
import { createClient } from '@/lib/supabase/server';

/**
 * The security log, from the application's side.
 *
 * Two rules, both learned from what was here before.
 *
 * The first is that the row is written by a database function, never by an
 * insert. The old insert policy let any member write any action with anybody's
 * id on it, which made the table a place to put claims rather than a record of
 * what happened. `record_security_event` takes the actor from the session, so
 * there is no parameter through which to name somebody else.
 *
 * The second is that a failed write never breaks the thing it was recording. A
 * sign-in that fails because the audit row did not save is a worse outcome
 * than a sign-in nobody wrote down, and the failure is logged either way.
 */

/** Actions worth a row. Named as `subject.past_tense`, so a log reads as a narrative. */
export type SecurityEvent =
  | 'account.signed_in'
  | 'account.sign_in_failed'
  | 'account.signed_out'
  | 'account.created'
  | 'account.password_changed'
  | 'account.data_exported'
  | 'account.terms_accepted'
  | 'account.mfa_enabled'
  | 'account.mfa_disabled'
  | 'account.mfa_recovery_reissued'
  | 'account.mfa_recovery_used'
  | 'organisation.created'
  | 'organisation.settings_changed'
  | 'invitation.created'
  | 'invitation.withdrawn'
  | 'invitation.accepted'
  | 'subscription.requested'
  | 'subscription.request_withdrawn'
  | 'subscription.activated';

/**
 * Records something that happened to an organisation.
 *
 * Readable by administrators of that organisation who hold `view_audit_log`,
 * which is the point: it is their record of who did what in their workspace.
 */
export async function recordEvent(
  organisationId: string,
  action: SecurityEvent,
  detail: { entityType?: string; entityId?: string; summary?: string } = {},
): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('record_security_event', {
      p_organisation_id: organisationId,
      p_action: action,
      p_entity_type: detail.entityType ?? 'organisation',
      p_entity_id: detail.entityId ?? null,
      p_summary: detail.summary ?? null,
    });
    if (error) console.error(`[amryn:audit] ${action} was not recorded: ${error.message}`);
  } catch (error) {
    console.error(`[amryn:audit] ${action} threw`, error);
  }
}

/**
 * Records something that happened to an account rather than to a workspace.
 *
 * These carry no organisation, which is deliberate rather than incidental: a
 * record of when somebody signed in, or took a copy of their own information,
 * is ours as responsible party. No policy matches a row without an
 * organisation, so no employer reads their staff's sign-in history out of a
 * workspace they administer.
 */
export async function recordAccountEvent(
  action: SecurityEvent,
  summary?: string,
): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('record_account_event', {
      p_action: action,
      p_summary: summary ?? null,
    });
    if (error) console.error(`[amryn:audit] ${action} was not recorded: ${error.message}`);
  } catch (error) {
    console.error(`[amryn:audit] ${action} threw`, error);
  }
}
