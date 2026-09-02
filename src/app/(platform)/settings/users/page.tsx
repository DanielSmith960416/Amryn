import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { ROLE_LABELS } from '@/lib/auth/permissions';
import { formatDate, humanise } from '@/lib/utils/format';
import { InviteForm } from '@/features/invitations/invite-form';
import { revokeInvitation } from '@/features/invitations/actions';

export const metadata: Metadata = { title: 'Users' };

export default async function UsersPage() {
  const workspace = await requirePermission('manage_users');
  const supabase = await createClient();

  const { data: members } = await supabase
    .from('organisation_members')
    // A left join, not an inner one. !inner drops any member whose profile row is
    // missing — so a colleague would vanish from the list entirely rather than
    // appear without a name, and the count would silently disagree with reality.
    .select('*, user_profiles(full_name, email, last_seen_at)')
    .eq('organisation_id', workspace.organisation.id)
    .order('role');

  // Open invitations only. Accepted ones are visible as members below, and
  // withdrawn ones are noise.
  const { data: invitations } = await supabase
    .from('organisation_invitations')
    .select('id, email, role, expires_at, created_at')
    .eq('organisation_id', workspace.organisation.id)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  const rows = members ?? [];
  const pending = invitations ?? [];

  return (
    <>
      <PageHeader
        eyebrow={workspace.organisation.name}
        title="Users"
        description="Role decides what someone can do. Scope decides how much of the business they can do it to. Both are enforced in the database, not just in the interface."
      />

      <Card className="mb-5">
        <CardHeader
          title="Invite a colleague"
          subtitle="They join this organisation rather than starting one of their own"
        />
        <div className="border-t border-[var(--border)] p-5">
          <InviteForm />
        </div>
      </Card>

      {pending.length > 0 ? (
        <Card className="mb-5">
          <CardHeader
            title="Waiting to be accepted"
            subtitle={`${pending.length} open invitation${pending.length === 1 ? '' : 's'}`}
          />
          <div className="overflow-x-auto border-t border-[var(--border)]">
            <table className="w-full text-left text-[0.8125rem]">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {['Email', 'Role', 'Expires', ''].map((heading) => (
                    <th
                      key={heading}
                      className="eyebrow px-5 py-2.5 !mb-0 font-normal whitespace-nowrap"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {pending.map((invitation) => (
                  <tr key={invitation.id} className="hover:bg-[var(--card-inset)]">
                    <td className="px-5 py-3 font-medium text-[var(--text-primary)]">
                      {invitation.email}
                    </td>
                    <td className="px-5 py-3 text-[var(--text-secondary)]">
                      {ROLE_LABELS[invitation.role] ?? invitation.role}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-[var(--text-secondary)]">
                      {formatDate(invitation.expires_at)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {/* The link cannot be shown again — only its hash was
                          kept — so withdrawing and re-inviting is the way to
                          replace one that went astray. */}
                      <form action={revokeInvitation}>
                        <input type="hidden" name="id" value={invitation.id} />
                        <button
                          type="submit"
                          className="text-[0.8125rem] text-[var(--negative)] underline underline-offset-2"
                        >
                          Withdraw
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Members" subtitle={`${rows.length} in this organisation`} />
        {rows.length === 0 ? (
          <EmptyState
            title="No members yet"
            description="Invite a colleague to give them access to this organisation."
          />
        ) : (
          <div className="overflow-x-auto border-t border-[var(--border)]">
            <table className="w-full text-left text-[0.8125rem]">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {['Person', 'Role', 'Scope', 'Status', 'Joined'].map((heading) => (
                    <th
                      key={heading}
                      className="eyebrow px-5 py-2.5 !mb-0 font-normal whitespace-nowrap"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {rows.map((member) => {
                  const profile = (member.user_profiles as unknown as {
                    full_name: string | null;
                    email: string;
                  } | null) ?? { full_name: null, email: 'Unknown' };
                  return (
                    <tr key={member.id} className="hover:bg-[var(--card-inset)]">
                      <td className="px-5 py-3">
                        <p className="font-medium text-[var(--text-primary)]">
                          {profile.full_name ?? profile.email}
                        </p>
                        <p className="text-[0.75rem] text-[var(--text-tertiary)]">{profile.email}</p>
                      </td>
                      <td className="px-5 py-3 text-[var(--text-secondary)]">
                        {ROLE_LABELS[member.role] ?? member.role}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={member.scope_kind === 'organisation' ? 'brand' : 'outline'}>
                          {member.scope_kind === 'organisation'
                            ? 'Whole organisation'
                            : `${member.scope_ids.length} ${member.scope_kind}${member.scope_ids.length === 1 ? '' : 's'}`}
                        </Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Badge
                          tone={
                            member.status === 'active'
                              ? 'positive'
                              : member.status === 'invited'
                                ? 'warning'
                                : 'neutral'
                          }
                        >
                          {humanise(member.status)}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap text-[var(--text-secondary)]">
                        {formatDate(member.joined_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
