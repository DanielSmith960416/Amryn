import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { requireWorkspace } from '@/lib/auth/session';
import { LegalFooter } from '@/components/legal/legal-footer';
import { Rail } from '@/features/imprint/rail';
import { QualityCard } from '@/features/imprint/quality-card';
import { ReviewPanel } from '@/features/imprint/review-panel';
import { LayerForm } from '@/features/imprint/layer-form';
import {
  CompetitorsList,
  DepartmentsList,
  ObjectivesList,
  SectorsList,
  SitesList,
  SystemsList,
} from '@/features/imprint/lists';
import {
  saveCommercial,
  saveCustomers,
  saveDigital,
  saveIdentity,
  saveIntent,
  saveLocation,
  saveOffer,
  saveOperations,
  skipLayer,
} from '@/features/imprint/actions';
import { imprintFor } from '@/features/imprint/record';
import { isLayerId, layer as findLayer, previousLayer, LAYER_IDS, type LayerId, type LayerState } from '@/features/imprint/layers';
import { withBasePath } from '@/lib/base-path';

export const metadata: Metadata = { title: 'Your Imprint' };

// Reads one organisation's Imprint; nothing here is the same for two people.
export const dynamic = 'force-dynamic';

const ACTIONS = {
  identity: saveIdentity,
  location: saveLocation,
  offer: saveOffer,
  customers: saveCustomers,
  operations: saveOperations,
  commercial: saveCommercial,
  digital: saveDigital,
  intent: saveIntent,
} as const;

/**
 * One layer of the Imprint.
 *
 * Outside the platform layout on purpose. That layout carries the whole
 * navigation, and offering twenty destinations to somebody halfway through
 * eight questions is how the eight never get answered. The way out is a single
 * link, and it is always there — this is not a cage.
 */
export default async function ImprintLayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ layer: string }>;
  searchParams: Promise<{ problem?: string }>;
}) {
  const { layer: raw } = await params;
  const { problem } = await searchParams;

  const isReview = raw === 'review';
  if (!isReview && !isLayerId(raw)) notFound();

  const workspace = await requireWorkspace();
  const imprint = await imprintFor(workspace.organisation.id);

  const states = Object.fromEntries(
    LAYER_IDS.map((id) => [id, imprint.layers[id].state]),
  ) as Record<LayerId, LayerState>;

  return (
    <div className="min-h-dvh px-5 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Image
              src={withBasePath('/brand/amryn-icon-mark.png')}
              alt=""
              width={553}
              height={563}
              className="h-7 w-auto"
              priority
            />
            <span className="font-display text-[1.125rem] font-extrabold tracking-tight text-[var(--text-primary)]">
              Amryn<span className="tm">™</span>
            </span>
          </div>

          {/* Always reachable. A setup that traps you is one people resent. */}
          <Link
            href="/command-centre"
            className="text-[0.8125rem] text-[var(--text-tertiary)] underline underline-offset-2 hover:text-[var(--text-secondary)]"
          >
            Finish later
          </Link>
        </div>

        <Rail current={isReview ? 'review' : (raw as LayerId)} states={states} />

        {isReview ? (
          <>
            <h1 className="text-[1.5rem] leading-tight font-semibold text-[var(--text-primary)]">
              Your Imprint
            </h1>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">
              What you have told us, what you have not, and what happens when you finish. Anything
              here can be changed afterwards.
            </p>
            <div className="mt-7">
              <ReviewPanel imprint={imprint} problem={problem === '1'} />
            </div>
          </>
        ) : (
          <LayerScreen id={raw as LayerId} imprint={imprint} />
        )}

        <LegalFooter className="mt-10" />
      </div>
    </div>
  );
}

async function LayerScreen({ id, imprint }: { id: LayerId; imprint: Awaited<ReturnType<typeof imprintFor>> }) {
  const definition = findLayer(id);
  const back = previousLayer(id);
  const record = imprint.layers[id];

  return (
    <>
      <h1 className="text-[1.5rem] leading-tight font-semibold text-[var(--text-primary)]">
        {definition.title}
      </h1>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">
        {definition.purpose}
      </p>

      <div className="mt-7">
        <LayerForm
          id={id}
          action={ACTIONS[id]}
          answers={record.answers}
          // The questions that are "list the ones you have". They write to real
          // tables rather than into the layer's answers, so the generic form
          // cannot render them from a field declaration.
          lists={{
            sites: <SitesList />,
            departments: <DepartmentsList />,
            systems: <SystemsList />,
            objectives: <ObjectivesList defaultDue={endOfYear()} />,
            competitors: <CompetitorsList />,
            sectorScope: <SectorsList />,
          }}
        />
      </div>

      <div className="mt-4">
        <QualityCard quality={imprint.quality} />
      </div>

      <div className="mt-6 flex items-center justify-between gap-4 border-t border-[var(--border)] pt-4">
        {back ? (
          <Link
            href={`/imprint/${back}`}
            className="text-[0.8125rem] text-[var(--text-secondary)] underline underline-offset-2"
          >
            Back
          </Link>
        ) : (
          <span />
        )}

        {definition.skippable ? (
          <form action={skipLayer}>
            <input type="hidden" name="layer" value={id} />
            <button
              type="submit"
              className="text-[0.8125rem] text-[var(--text-tertiary)] underline underline-offset-2 hover:text-[var(--text-secondary)]"
            >
              Skip this — {shortReason(definition.ifSkipped)}
            </button>
          </form>
        ) : null}
      </div>
    </>
  );
}

/** The last day of the current calendar year, as a sensible default target. */
function endOfYear(): string {
  return `${new Date().getFullYear()}-12-31`;
}

/** The first clause of the consequence, so the link says what skipping costs. */
function shortReason(consequence: string): string {
  const first = consequence.split(/[.:]/)[0] ?? '';
  return first.charAt(0).toLowerCase() + first.slice(1);
}
