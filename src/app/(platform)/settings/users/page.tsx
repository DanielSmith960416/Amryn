import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { ROLE_LABELS } from '@/lib/auth/permissions';
import { formatDate, humanise } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Users' };

export default async function UsersPage() {
  const workspace = await requirePermission('manage_users');
  const supabase = await createClient();

  const { data: members } = await supabase
    .from('organisation_members')
    .select('*, user_profiles!inner(full_name, email, last_seen_at)')
    .eq('organisation_id', workspace.organisation.id)
    .order('role');

  const rows = members ?? [];

  return (
    <>
      <PageHeader
        eyebrow={workspace.organisation.name}
        title="Users"
        description="Role decides what someone can do. Scope decides how much of the business they can do it to. Both are enforced in the database, not just in the interface."
      />

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
                  const profile = member.user_profiles as unknown as {
                    full_name: string | null;
                    email: string;
                  };
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
