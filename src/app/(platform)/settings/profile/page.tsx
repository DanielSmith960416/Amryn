import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ThemeToggle } from '@/components/shell/theme-toggle';
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
        <Card>
          <CardHeader title="You" />
          <CardBody className="space-y-3 text-[0.8125rem]">
            <Row label="Name" value={workspace.profile?.full_name ?? 'Not set'} />
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
