import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { can, requireWorkspace } from '@/lib/auth/session';
import { FidelityBadge, FidelityNote } from '@/features/twin/fidelity-badge';
import { AddScenario } from '@/features/twin/scenario-form';
import { ScenarioCard } from '@/features/twin/scenario-card';
import { studioState } from '@/features/twin/scenarios';

export const metadata: Metadata = { title: 'Scenarios' };

/**
 * The scenario studio.
 *
 * Everything Phase 5 built — the engine, the storage, the handler, the nightly
 * tick — has existed since #72 and been reachable only by writing SQL. This is
 * the door.
 *
 * ── the measurement is above the numbers, not behind a link ───────────────
 *
 * A confidence interval reads as more trustworthy than a single figure whether
 * or not the model producing it has ever been right, which is the failure this
 * whole phase was built around. So how wrong the Twin has been is the first
 * thing on the page and is repeated on every result — including when the
 * honest answer is that it cannot be measured yet, which for most businesses
 * here it will be for a long time.
 */
export default async function ScenariosPage() {
  const workspace = await requireWorkspace();
  const state = await studioState(workspace.organisation.id);
  const canManage = can(workspace, 'manage_organisation');
  const currency = workspace.organisation.currency_code ?? 'ZAR';

  return (
    <>
      <PageHeader
        eyebrow="Digital Twin"
        title="Scenarios"
        description="Questions about the same business, asked as levers rather than assertions. Each answer is a range, and the range is only worth as much as the accuracy score above it."
        actions={
          <Button asChild variant="ghost">
            <Link href="/digital-twin">Back to the model</Link>
          </Button>
        }
      />

      <Card className="mb-5">
        <CardHeader
          title="How close the model gets"
          subtitle="Measured against your own history, not against a benchmark"
          actions={<FidelityBadge fidelity={state.fidelity} />}
        />
        <CardBody>
          <FidelityNote fidelity={state.fidelity} />
        </CardBody>
      </Card>

      {state.enabled ? null : <TwinIsOff />}

      {state.scenarios.length === 0 ? (
        <FirstScenario canManage={canManage} />
      ) : (
        <div className="space-y-5">
          {state.scenarios.map((scenario) => (
            <ScenarioCard
              key={scenario.id}
              scenario={scenario}
              currency={currency}
              canManage={canManage && state.enabled}
            />
          ))}

          {canManage ? (
            <Card>
              <CardBody className="pt-5">
                <AddScenario />
              </CardBody>
            </Card>
          ) : null}
        </div>
      )}
    </>
  );
}

/**
 * The switch is off, said plainly and without a button that would not work.
 *
 * Scenarios can still be written — a business deciding what it wants to ask is
 * not waiting on us — and the nightly run picks them up the moment the Twin is
 * turned on. Hiding the whole page would mean the first thing a customer sees
 * on the day it is enabled is an empty studio.
 */
/*
  Was an amber card about enablement, one organisation at a time. What the
  reader needs is the part that changes what they do: scenarios written now
  are kept and will run. The rest was ours.
*/
function TwinIsOff() {
  return (
    <Card className="mb-5">
      <CardBody className="pt-5">
        <p className="text-[0.875rem] text-[var(--text-secondary)]">
          No results yet. Scenarios you write now are saved and will run when results are available.
        </p>
      </CardBody>
    </Card>
  );
}

function FirstScenario({ canManage }: { canManage: boolean }) {
  if (!canManage) {
    return (
      <Card>
        <CardBody className="pt-5">
          <p className="text-[0.875rem] text-[var(--text-primary)]">No scenarios yet.</p>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
            An administrator writes these. Once one exists, its answer appears here for everybody.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Start with carrying on as you are"
        subtitle="The first scenario becomes the baseline, and every other one is read against it"
      />
      <CardBody>
        <p className="mb-4 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
          Leave both levers at 1 and give it a name like &ldquo;Carry on as you are&rdquo;. A range
          on its own means very little; the same range beside the one you would have had anyway is
          the whole point.
        </p>
        <AddScenario />
      </CardBody>
    </Card>
  );
}
