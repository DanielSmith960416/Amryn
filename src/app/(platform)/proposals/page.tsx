import type { Metadata } from 'next';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { can, requireWorkspace } from '@/lib/auth/session';
import { DecidedProposal, PendingProposal } from '@/features/proposals/list';
import { decidedProposals, pendingProposals } from '@/features/proposals/record';

export const metadata: Metadata = { title: 'Waiting on you' };

/**
 * Suggested changes, waiting for a person.
 *
 * Nothing on this platform applies one of these on its own. The Imprint is the
 * record every figure derives from, so a model that could edit it could edit
 * the basis of every number the product will ever show — and the control on
 * that is not a carefully worded prompt, it is that the write needs somebody
 * to press a button on this page.
 */
export default async function ProposalsPage() {
  const workspace = await requireWorkspace();
  const org = workspace.organisation.id;
  const canDecide = can(workspace, 'manage_organisation');

  const [pending, decided] = await Promise.all([
    pendingProposals(org),
    decidedProposals(org),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Nothing happens without you"
        title="Waiting on you"
        description="Changes the platform has suggested to what it knows about your business. None of them are applied until somebody here says so."
      />

      {pending.length === 0 ? (
        <Card>
          <CardBody className="pt-5">
            <p className="text-[0.875rem] text-[var(--text-primary)]">Nothing is waiting.</p>
            <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
              Suggestions appear here when the Assistant spots something in your figures that
              disagrees with what your Imprint says — a blank field it can fill from your own
              records, or a number that has moved.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-5">
          {pending.map((proposal) => (
            <PendingProposal key={proposal.id} proposal={proposal} canDecide={canDecide} />
          ))}
        </div>
      )}

      {decided.length > 0 ? (
        <Card className="mt-5">
          <CardHeader
            title="Already decided"
            subtitle="Kept visible, so the same suggestion is not argued twice"
          />
          <CardBody>
            {decided.map((proposal) => (
              <DecidedProposal key={proposal.id} proposal={proposal} />
            ))}
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
