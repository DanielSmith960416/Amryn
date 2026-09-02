'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/field';
import { ROLE_LABELS } from '@/lib/auth/permissions';
import { createInvitation, type Delivery, type InviteState } from './actions';
import { INVITABLE_ROLES } from './roles';

export function InviteForm() {
  const [state, action] = useActionState(createInvitation, { status: 'idle' } as InviteState);

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div>
          <Label htmlFor="invite-email">Work email</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            autoComplete="off"
            placeholder="colleague@yourcompany.com"
            required
          />
        </div>

        <div>
          <Label htmlFor="invite-role">Role</Label>
          <select
            id="invite-role"
            name="role"
            defaultValue="viewer"
            className="h-10 w-full rounded-[var(--radius-field)] border border-[var(--border)] bg-[var(--card)] px-3 text-[0.875rem] text-[var(--text-primary)] sm:w-48"
          >
            {INVITABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {state.status === 'error' ? (
        <p className="text-[0.8125rem] text-[var(--negative)]" role="alert">
          {state.message}
        </p>
      ) : null}

      {state.status === 'created' ? (
        <InviteLink
          link={state.link}
          email={state.email}
          delivery={state.delivery}
          deliveryProblem={state.deliveryProblem}
        />
      ) : null}

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? 'Creating…' : 'Create invitation'}
    </Button>
  );
}

/**
 * The link, shown once.
 *
 * Only a hash of the token is stored, so this is the only moment it exists in
 * readable form — reloading the page will not bring it back, and that is worth
 * saying rather than letting someone discover it.
 *
 * Shown whether or not the email went. When it did, it is the fallback for a
 * message that lands in a spam folder; when it did not, it is the only way the
 * invitation reaches anyone. Hiding it on a successful send would mean an
 * invitation could be quietly lost to a filter with nothing left to resend.
 */
function InviteLink({
  link,
  email,
  delivery,
  deliveryProblem,
}: {
  link: string;
  email: string;
  delivery: Delivery;
  deliveryProblem?: string;
}) {
  const [copied, setCopied] = useState(false);
  const failed = delivery === 'failed';

  return (
    <div
      className="rounded-[var(--radius-card)] border p-4"
      style={{
        borderColor: failed ? 'var(--warning)' : 'var(--positive)',
        background: 'var(--card-inset)',
      }}
      role="status"
    >
      <p className="text-[0.875rem] font-medium text-[var(--text-primary)]">
        {delivery === 'sent' ? `Invitation emailed to ${email}` : `Invitation ready for ${email}`}
      </p>
      <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
        {delivery === 'sent'
          ? 'Keep this link in case it lands in their spam folder. It works only for that address, expires in fourteen days, and is shown here once — reloading will not bring it back.'
          : 'Send them this link. It works only for that address, expires in fourteen days, and is shown here once — reloading will not bring it back.'}
      </p>

      {failed ? (
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--warning)]">
          The invitation was created, but we could not email it
          {deliveryProblem ? `: ${deliveryProblem}` : '.'} Send them the link below yourself — it
          works exactly the same way.
        </p>
      ) : null}

      <div className="mt-3 flex items-start gap-2 rounded-[var(--radius-field)] border border-[var(--border)] bg-[var(--card)] p-2.5">
        <code className="min-w-0 flex-1 break-all font-mono text-[0.75rem] text-[var(--text-primary)]">
          {link}
        </code>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            // Clipboard access can be refused outright, so the text stays
            // selectable and the label says what happened either way.
            navigator.clipboard?.writeText(link).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}
