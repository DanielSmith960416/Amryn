import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shell/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/shell/theme-toggle';
import { requireWorkspace, can } from '@/lib/auth/session';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/auth/permissions';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const workspace = await requireWorkspace();

  const sections = [
    {
      href: '/settings/organisation',
      title: 'Organisation',
      description: 'Name, industry, currency, regions, branches and radar sector scope.',
      permission: 'manage_organisation' as const,
    },
    {
      href: '/settings/users',
      title: 'Users',
      description: 'Who has access, what role they hold and how much of the business they see.',
      permission: 'manage_users' as const,
    },
    {
      href: '/settings/roles',
      title: 'Roles & Permissions',
      description: 'What each role can do, and the per-person exceptions layered on top.',
      permission: 'manage_users' as const,
    },
    {
      href: '/settings/billing',
      title: 'Billing',
      description: 'Plan, seats, limits and invoices.',
      permission: 'manage_billing' as const,
    },
  ].filter((section) => can(workspace, section.permission));

  return (
    <>
      <PageHeader
        eyebrow={workspace.organisation.name}
        title="Settings"
        description="Everything about how this workspace behaves."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            {sections.map((section) => (
              <Link key={section.href} href={section.href}>
                <Card interactive className="h-full p-5">
                  <p className="text-[0.9375rem] font-semibold text-[var(--text-primary)]">
                    {section.title}
                  </p>
                  <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                    {section.description}
                  </p>
                </Card>
              </Link>
            ))}

            <Link href="/settings/profile">
              <Card interactive className="h-full p-5">
                <p className="text-[0.9375rem] font-semibold text-[var(--text-primary)]">
                  Your profile
                </p>
                <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                  Your name, and how Amryn addresses you.
                </p>
              </Card>
            </Link>

            <Link href="/settings/security">
              <Card interactive className="h-full p-5">
                <p className="text-[0.9375rem] font-semibold text-[var(--text-primary)]">
                  Security
                </p>
                <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                  Two-step sign-in, and how you prove it is you.
                </p>
              </Card>
            </Link>

            <Link href="/settings/privacy">
              <Card interactive className="h-full p-5">
                <p className="text-[0.9375rem] font-semibold text-[var(--text-primary)]">
                  Your privacy
                </p>
                <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                  Take a copy of what we hold about you, or ask us to correct or delete it.
                </p>
              </Card>
            </Link>
          </div>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <p className="eyebrow">Your access</p>
            <p className="mt-1 text-[0.9375rem] font-medium text-[var(--text-primary)]">
              {ROLE_LABELS[workspace.role] ?? workspace.role}
            </p>
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
              {ROLE_DESCRIPTIONS[workspace.role] ?? ''}
            </p>
            <p className="mt-3 border-t border-[var(--border)] pt-3 text-[0.8125rem] text-[var(--text-secondary)]">
              Scope: <strong className="text-[var(--text-primary)]">{workspace.scope.label}</strong>
            </p>
            <p className="mt-2 text-[0.75rem] text-[var(--text-tertiary)]">
              {workspace.permissions.size} permissions in effect
            </p>
          </Card>

          <Card className="p-5">
            <p className="eyebrow">Appearance</p>
            <p className="mb-3 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
              Three themes. Your choice is remembered on this device.
            </p>
            <ThemeToggle />
          </Card>

          <Card className="p-5">
            <p className="eyebrow">Organisation</p>
            <p className="mt-1 text-[0.9375rem] font-medium text-[var(--text-primary)]">
              {workspace.organisation.name}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone="outline">{workspace.organisation.currency_code}</Badge>
              <Badge tone="outline">{workspace.organisation.country_code}</Badge>
              {workspace.organisation.industry ? (
                <Badge tone="neutral" className="!normal-case">
                  {workspace.organisation.industry}
                </Badge>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
