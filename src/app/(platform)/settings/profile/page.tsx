import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ThemeToggle } from '@/components/shell/theme-toggle';
import { NameForm } from '@/features/profile/name-form';
import { DateOfBirthForm } from '@/features/profile/date-of-birth-form';
import { PasswordForm } from '@/features/profile/password-form';
import { requireWorkspace } from '@/lib/auth/session';
import { ROLE_LABELS } from '@/lib/auth/permissions';
import { formatRelative } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Profile' };

export default async function ProfilePage() {
  const workspace = await requireWorkspace();

  return (
    <>
      <PageHeader eyebrow="Your account" title="Profile" />

      <div className="grid max-w-3xl gap-5 sm:grid-cols-2">
        {/*
          Editable where it is yours to change, read-only where it is not. The
          email address and the role are both facts about the account rather
          than preferences: one is the identity the auth server holds, the
          other is granted by an administrator, and a field that looks typeable
          and refuses to save is worse than a row of text.
        */}
        <Card className="sm:col-span-2">
          <CardHeader title="You" subtitle="The name Amryn greets you by" />
          <CardBody className="space-y-5">
            <NameForm
              firstName={workspace.profile?.first_name ?? null}
              lastName={workspace.profile?.last_name ?? null}
            />
            <div className="space-y-3 border-t border-[var(--border)] pt-4 text-[0.8125rem]">
              <Row label="Email" value={workspace.user.email ?? '—'} />
              <Row label="Job title" value={workspace.profile?.job_title ?? 'Not set'} />
              <Row
                label="Last seen"
                value={
                  workspace.profile?.last_seen_at
                    ? formatRelative(workspace.profile.last_seen_at)
                    : 'This session'
                }
              />
            </div>
          </CardBody>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader
            title="Birthday"
            subtitle="Optional, and only ever used for one thing"
          />
          <CardBody>
            <DateOfBirthForm dateOfBirth={workspace.profile?.date_of_birth ?? null} />
          </CardBody>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader
            title="Password"
            subtitle="Your current one is needed before a new one is accepted"
          />
          <CardBody>
            <PasswordForm />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Access" subtitle="What you can see in this organisation" />
          <CardBody className="space-y-3 text-[0.8125rem]">
            <Row label="Organisation" value={workspace.organisation.name} />
            <Row label="Role" value={ROLE_LABELS[workspace.role] ?? workspace.role} />
            <Row label="Scope" value={workspace.scope.label} />
            <Row label="Permissions" value={`${workspace.permissions.size} in effect`} />
          </CardBody>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader title="Appearance" subtitle="Remembered on this device only" />
          <CardBody>
            <ThemeToggle />
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="font-medium text-[var(--text-primary)]">{value}</span>
    </div>
  );
}
