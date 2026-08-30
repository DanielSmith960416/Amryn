import type { Metadata } from 'next';
import { Fragment } from 'react';
import { Check, Minus } from 'lucide-react';
import { PageHeader } from '@/components/shell/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/auth/permissions';
import type { Enums } from '@/types/database';

export const metadata: Metadata = { title: 'Roles & Permissions' };

const ROLE_ORDER: Enums['org_role'][] = [
  'org_admin',
  'executive',
  'regional_manager',
  'branch_manager',
  'department_manager',
  'analyst',
  'viewer',
];

/**
 * The role matrix, read from the database rather than restated in the code.
 *
 * A matrix that is documentation drifts from the thing it documents. This one
 * queries role_permissions, so it is always what is actually enforced.
 */
export default async function RolesPage() {
  await requirePermission('manage_users');
  const supabase = await createClient();

  const [{ data: permissions }, { data: grants }] = await Promise.all([
    supabase.from('permissions').select('*').order('category').order('key'),
    supabase.from('role_permissions').select('role, permission_key'),
  ]);

  const granted = new Set((grants ?? []).map((g) => `${g.role}:${g.permission_key}`));
  const byCategory = new Map<string, NonNullable<typeof permissions>>();
  for (const permission of permissions ?? []) {
    const bucket = byCategory.get(permission.category) ?? [];
    bucket.push(permission);
    byCategory.set(permission.category, bucket);
  }

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Roles & Permissions"
        description="Read live from the database, so this is what is actually enforced rather than a description of it. Individual people can be granted or denied any of these on top of their role."
      />

      <Card>
        <CardHeader
          title="Role matrix"
          subtitle="Reach widens left to right. Scope — how much of the business a person sees — is a separate axis."
        />

        <div className="overflow-x-auto border-t border-[var(--border)]">
          <table className="w-full text-left text-[0.8125rem]">
            <thead className="sticky top-0 bg-[var(--card)]">
              <tr className="border-b border-[var(--border)]">
                <th className="eyebrow px-5 py-3 !mb-0 font-normal">Permission</th>
                {ROLE_ORDER.map((role) => (
                  <th
                    key={role}
                    className="eyebrow px-2 py-3 !mb-0 text-center font-normal"
                    title={ROLE_DESCRIPTIONS[role]}
                  >
                    <span className="block max-w-[6rem] leading-tight">
                      {ROLE_LABELS[role] ?? role}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {[...byCategory.entries()].map(([category, items]) => (
                <Fragment key={category}>
                  <tr className="bg-[var(--card-inset)]">
                    <td
                      colSpan={ROLE_ORDER.length + 1}
                      className="eyebrow px-5 py-1.5 !mb-0 font-normal"
                    >
                      {category}
                    </td>
                  </tr>
                  {items.map((permission) => (
                    <tr
                      key={permission.key}
                      className="border-b border-[var(--border)] hover:bg-[var(--card-inset)]"
                    >
                      <td className="px-5 py-2.5">
                        <p className="font-medium text-[var(--text-primary)]">
                          {permission.description}
                        </p>
                        <code className="font-mono text-[0.6875rem] text-[var(--text-tertiary)]">
                          {permission.key}
                        </code>
                      </td>
                      {ROLE_ORDER.map((role) => {
                        const has = granted.has(`${role}:${permission.key}`);
                        return (
                          <td key={role} className="px-2 py-2.5 text-center">
                            {has ? (
                              <Check
                                className="mx-auto size-4 text-[var(--positive)]"
                                aria-label="Granted"
                              />
                            ) : (
                              <Minus
                                className="mx-auto size-4 text-[var(--text-tertiary)] opacity-40"
                                aria-label="Not granted"
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
