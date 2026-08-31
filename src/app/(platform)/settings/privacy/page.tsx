import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shell/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { requireWorkspace } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils/format';
import { LEGAL_VERSION, RESPONSIBLE_PARTY } from '@/lib/legal/documents';
import { DataRequestForm } from '@/features/privacy/request-form';
import { acceptCurrentDocuments } from '@/features/privacy/actions';
import type { Enums } from '@/types/database';

export const metadata: Metadata = { title: 'Your privacy' };

const STATUS_LABEL: Record<Enums['data_request_status'], string> = {
  received: 'Received',
  in_progress: 'Being handled',
  completed: 'Completed',
  refused: 'Declined',
};

const STATUS_TONE: Record<Enums['data_request_status'], 'neutral' | 'info' | 'positive' | 'warning'> =
  {
    received: 'info',
    in_progress: 'info',
    completed: 'positive',
    refused: 'warning',
  };

const KIND_LABEL: Record<Enums['data_request_kind'], string> = {
  export: 'Copy of your information',
  deletion: 'Deletion',
  correction: 'Correction',
};

/**
 * Where a person exercises the rights POPIA gives them.
 *
 * Three things on one page, in the order somebody actually wants them: the
 * copy they can have this second, the record of what they agreed to and when,
 * and the form for the requests that need a human. Rights described in a
 * policy and unreachable from the product are rights on paper.
 */
export default async function PrivacySettingsPage() {
  const workspace = await requireWorkspace();
  const supabase = await createClient();

  const { data: requests } = await supabase
    .from('data_requests')
    .select('id, kind, status, requested_at, responded_at')
    .order('requested_at', { ascending: false })
    .limit(10);

  const profile = workspace.profile;
  const acceptedCurrent =
    profile?.terms_version === LEGAL_VERSION && profile?.privacy_version === LEGAL_VERSION;

  return (
    <>
      <PageHeader
        eyebrow="Your account"
        title="Your privacy"
        description="What we hold about you, what you agreed to, and how to change either."
      />

      <div className="grid max-w-4xl gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Take a copy now"
            subtitle="Everything we hold about you as an individual"
          />
          <CardBody className="space-y-4">
            <p className="text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
              Your details, what you accepted and when, the organisations you belong to and any
              requests you have made — as a file you can keep. It does not include your
              organisation&rsquo;s business records, which belong to the organisation rather than to
              you; an administrator can export those.
            </p>
            <Button asChild variant="secondary">
              <a href="/api/privacy/export" download>
                Download my information
              </a>
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="What you have agreed to" />
          <CardBody className="space-y-3 text-[0.8125rem]">
            <Row
              label="Terms of Service"
              href="/legal/terms"
              value={
                profile?.terms_accepted_at
                  ? `Accepted ${formatDate(profile.terms_accepted_at)}`
                  : 'Not recorded'
              }
              version={profile?.terms_version}
            />
            <Row
              label="Privacy Policy"
              href="/legal/privacy"
              value={
                profile?.privacy_accepted_at
                  ? `Accepted ${formatDate(profile.privacy_accepted_at)}`
                  : 'Not recorded'
              }
              version={profile?.privacy_version}
            />
            <Row
              label="Data Processing Addendum"
              href="/legal/dpa"
              value={
                workspace.organisation.dpa_accepted_at
                  ? `Accepted for ${workspace.organisation.name} on ${formatDate(
                      workspace.organisation.dpa_accepted_at,
                    )}`
                  : 'Not recorded for this organisation'
              }
              version={workspace.organisation.dpa_version}
            />

            {acceptedCurrent ? null : (
              <form action={acceptCurrentDocuments} className="pt-2">
                <p className="mb-2.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                  These documents have changed since you last accepted them. Your earlier acceptance
                  stands for the version you agreed to; accepting here records a new one.
                </p>
                <Button type="submit" variant="secondary" size="sm">
                  Accept the current version
                </Button>
              </form>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Ask us to do something"
            subtitle="A copy, a correction, or deletion. We answer within 30 days."
          />
          <CardBody>
            <div className="max-w-xl">
              <DataRequestForm />
            </div>
          </CardBody>
        </Card>

        {requests && requests.length > 0 ? (
          <Card className="lg:col-span-2">
            <CardHeader title="Your requests" />
            <CardBody className="space-y-2.5">
              {requests.map((request) => (
                <div
                  key={request.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2.5 last:border-0 last:pb-0"
                >
                  <span className="text-[0.875rem] font-medium text-[var(--text-primary)]">
                    {KIND_LABEL[request.kind]}
                  </span>
                  <span className="flex items-center gap-3 text-[0.8125rem] text-[var(--text-secondary)]">
                    <span>Asked {formatDate(request.requested_at)}</span>
                    <Badge tone={STATUS_TONE[request.status]}>{STATUS_LABEL[request.status]}</Badge>
                  </span>
                </div>
              ))}
            </CardBody>
          </Card>
        ) : null}
      </div>

      <p className="mt-6 max-w-4xl text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
        You can also write to {RESPONSIBLE_PARTY.informationOfficerEmail}, or complain to the
        Information Regulator — the{' '}
        <Link href="/legal/privacy" className="text-[var(--brand)] hover:underline">
          Privacy Policy
        </Link>{' '}
        says how.
      </p>
    </>
  );
}

function Row({
  label,
  href,
  value,
  version,
}: {
  label: string;
  href: string;
  value: string;
  version?: string | null;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <Link href={href} className="text-[var(--brand)] hover:underline">
        {label}
      </Link>
      <span className="text-right">
        <span className="block font-medium text-[var(--text-primary)]">{value}</span>
        {version ? (
          <span className="text-[0.75rem] text-[var(--text-tertiary)]">Version {version}</span>
        ) : null}
      </span>
    </div>
  );
}
