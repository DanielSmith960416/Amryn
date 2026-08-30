import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/page-header';
import { IntelligenceFeed } from '@/components/intelligence/feed';
import { requirePermission } from '@/lib/auth/session';
import { buildBusinessContext } from '@/features/intelligence/context';
import { buildFeed } from '@/features/intelligence/feed';

export const metadata: Metadata = { title: 'Intelligence Feed' };

export default async function IntelligenceFeedPage() {
  const workspace = await requirePermission('view_intelligence');
  const context = await buildBusinessContext(workspace);

  return (
    <>
      <PageHeader
        eyebrow={workspace.organisation.name}
        title="Intelligence Feed"
        description="Everything Amryn has noticed, inside and outside the business, on a single timeline. They are deliberately not separated — the two only mean something read together."
      />
      <div className="max-w-3xl">
        <IntelligenceFeed
          entries={buildFeed(context)}
          title="All activity"
          subtitle={context.period.label}
        />
      </div>
    </>
  );
}
