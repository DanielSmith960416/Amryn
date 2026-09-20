import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, BRANCH_TONE, HEALTH_TONE } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { DemoNotice, PageHeader } from '@/components/ui/page-header';
import { Stat, StatGrid } from '@/components/ui/stat';
import { HealthExplorer } from '@/components/intelligence/health-explorer';
import { RevenueChart } from '@/components/intelligence/revenue-chart';
import { CompositionDonut, type Slice } from '@/components/intelligence/composition-donut';
import { MagnitudeBars, type Bar } from '@/components/intelligence/magnitude-bars';
import { OpportunityTable, RiskTable } from '@/features/command-centre/flagship-tables';
import { ProductWordmark } from '@/components/shell/product-wordmark';
import { branchStatus } from '@/lib/intelligence/finance';
import { compactMoney, count, date, money, percent, score } from '@/lib/format';
import { currentWorkspace } from '@/lib/workspace';
import { NoDataYet } from '@/components/intelligence/no-data-yet';
import { ImprintPrompt } from '@/features/imprint/prompt';
import { AnalysisBanner } from '@/features/analysis/banner';
import { Greeting } from '@/components/shell/greeting';
import { WeatherPanel } from '@/features/weather/weather-panel';
import { requireWorkspace } from '@/lib/auth/session';
import { hourInTimezone, timeOfDay } from '@/lib/greeting/greeting';
import type { Branch, OpportunityStatus, ScoredOpportunity } from '@/lib/intelligence/types';

export const metadata: Metadata = { title: 'Executive Command Centre' };

/**
 * EXECUTIVE_COMMAND, as a page.
 *
 * The prototype's structure is kept exactly: a row of year-to-date indicators,
 * then the six intelligence cards — insight, opportunity, risk, decision,
 * action, recommendation — each stamped with its confidence and its basis.
 *
 * The prototype writes those six as fixed sentences. Here they are produced by
 * the briefing engine from the figures on this page, which is the only way the
 * "AI-SIMULATED" label stays honest as the data changes.
 *
 * ── and then it became the centre of the two flagships ────────────────────
 * For a long time DigitalTwin® and OpportunityRadar® appeared here as three
 * rows each and a link out. That is a table of contents, not a command centre:
 * the page named the two products the platform is sold on and showed neither.
 *
 * So each now has a band of its own, and each band is the same shape — a
 * picture on one side and a table on the other. The picture answers "what is
 * this made of" at a glance; the table is where somebody sorts by value, or by
 * score, and finds the row they came for. Neither replaces the module: both
 * bands still link through, and /digital-twin and /opportunity-radar are
 * unchanged and remain the fuller view.
 *
 * Everything that was on this page is still on it. The bands are additions,
 * placed above the intelligence cards because a flagship shown below six
 * paragraphs is not being led with.
 */
/**
 * The pipeline, split by the stage each opportunity is at.
 *
 * Composed by value rather than by count, because a pipeline's shape is a
 * question about money: four small evaluations and one large active deal is a
 * different business from the reverse, and counting them makes the two look
 * identical. The count is kept in the label so neither is lost.
 */
function pipelineSlices(opportunities: ScoredOpportunity[], currency: string): Slice[] {
  const stages: OpportunityStatus[] = ['Active', 'Evaluating', 'Planning'];
  return stages.map((stage) => {
    const inStage = opportunities.filter((o) => o.status === stage);
    const value = inStage.reduce((sum, o) => sum + o.estValue, 0);
    return {
      key: stage,
      label: `${stage} · ${inStage.length}`,
      value,
      display: compactMoney(value, currency),
    };
  });
}

/** Where the year's revenue came from, largest first. */
function branchBars(branches: Branch[], currency: string): Bar[] {
  return branches.map((b) => ({
    key: b.name,
    label: b.name,
    value: b.revenueYtd,
    display: compactMoney(b.revenueYtd, currency),
  }));
}

export default async function CommandCentrePage() {
  const state = await currentWorkspace();

  // Resolved before the empty branch, not after it. getWorkspace is cached per
  // request, so this is the resolution the layout already made rather than a
  // second trip — and reading it here means the greeting survives the early
  // return below. A business with no figures yet is precisely the one whose
  // first screen should still say good morning to somebody by name.
  const workspace = await requireWorkspace();
  const firstName = workspace.profile?.first_name ?? null;
  const part = timeOfDay(hourInTimezone(workspace.organisation.timezone));

  // The trading address, if an administrator has set one. Where it is absent
  // the panel offers to ask the browser instead — it never guesses a city from
  // the country, which would be a confident wrong answer about where somebody
  // is rather than an honest blank.
  const city = workspace.organisation.city;
  // Which town of that name — Kimberley is in three countries, and plenty of
  // South African town names repeat across provinces.
  const province = workspace.organisation.province;
  const countryCode = workspace.organisation.country_code;

  if (state.kind === 'empty') {
    return (
      <>
        <Greeting firstName={firstName} initialPart={part} />
        <WeatherPanel city={city} province={province} countryCode={countryCode} />
        <NoDataYet what="The week in one view — health, opportunities, risks and what to do about them —" organisationName={state.organisationName} />
      </>
    );
  }

  const w = state.workspace;
  const currency = w.profile.currency;

  return (
    <>
      <ImprintPrompt />
      <AnalysisBanner />
      {/*
        The greeting takes the eyebrow slot rather than sitting above it. Two
        small lines stacked before a heading is one line too many, and of the
        two this is the one that belongs on somebody's own dashboard: "Detect →
        Simulate → Act" describes the product to a stranger, and nobody reading
        this screen is one. It still says so on the marketing site.
      */}
      <PageHeader
        eyebrow={<Greeting firstName={firstName} initialPart={part} />}
        title="Executive Command Centre"
        description={`${w.profile.companyName} · ${w.profile.reportingPeriod} · ${w.profile.location}`}
        actions={
          <Badge tone={HEALTH_TONE[w.health.status]}>
            Health {score(w.health.overall)} — {w.health.status}
          </Badge>
        }
      />

      {/* Under the heading, so the greeting still comes first — the same order
          the empty state above uses. */}
      <div className="mb-6 -mt-1">
        <WeatherPanel city={city} province={province} countryCode={countryCode} />
      </div>

      {w.isDemo ? (
        <DemoNotice>
          This workspace is seeded with the demonstration business from the Amryn
          <sup className="tm">™</sup> prototypes. Replace it with your own data to see the same
          intelligence run on your numbers.
        </DemoNotice>
      ) : null}

      {/* ── Year-to-date indicators (prototype: rows 4–7) ─────────────── */}
      <StatGrid className="mb-6">
        <Stat
          label="Total revenue"
          value={compactMoney(w.ytd.revenue, currency)}
          sub={`YTD · ${w.ytd.monthsReported} months reported`}
        />
        <Stat label="Gross profit" value={compactMoney(w.ytd.grossProfit, currency)} sub="YTD" />
        <Stat
          label="Net profit"
          value={compactMoney(w.ytd.netProfit, currency)}
          sub="YTD"
          tone={w.ytd.netProfit >= 0 ? 'default' : 'negative'}
        />
        <Stat
          label="Gross margin"
          value={percent(w.ytd.grossMargin)}
          sub={`Target ${percent(w.profile.grossMarginTarget, 0)}`}
          tone={w.ytd.grossMargin >= w.profile.grossMarginTarget ? 'positive' : 'warning'}
        />
        <Stat label="Total customers" value={count(w.ytd.totalCustomers)} sub={`${count(w.ytd.newCustomers)} new YTD`} />
        <Stat
          label="Net cash flow"
          value={compactMoney(w.ytd.netCash, currency)}
          sub="YTD position"
          tone={w.ytd.netCash >= 0 ? 'positive' : 'negative'}
        />
      </StatGrid>

      {/* ── DigitalTwin® ─────────────────────────────────────────────── */}
      <FlagshipHeading
        wordmark={<ProductWordmark name="digital-twin" priority />}
        blurb="The business as the model has it — what it earns, and how healthy that makes it."
        href="/digital-twin"
        cta="Open the twin"
      />

      {/*
        Three charts across, and three different shapes on purpose: a line for
        how the year has gone, bars for which branch is carrying it, a ring for
        what the health score is made of. Each shape answers the question it is
        good at — a trend needs a line, a comparison needs a shared baseline,
        and a composition needs a whole.

        Two up on a tablet and one up on a phone, because three charts at a
        third of a phone's width are three sparklines nobody can read.
      */}
      <div className="mb-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
        <Card>
          <CardHeader
            title="Revenue, gross profit and net profit"
            subtitle={`${w.ytd.monthsReported} reported months · switch the measure`}
          />
          <CardBody>
            <RevenueChart months={w.months} currency={currency} />
          </CardBody>
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title="Revenue by branch"
            subtitle={`${w.branches.length} locations · year to date`}
          />
          {/*
            flex-1 and centred: the trend chart beside this one is the tallest
            of the three, and a grid row stretches the other two to match it.
            Left alone, the bars sit at the top of a card with a hand's width
            of nothing under them, which reads as a card that failed to finish
            loading rather than one with less to say.
          */}
          <CardBody className="flex flex-1 flex-col justify-center">
            {/*
              Bars rather than the ring this replaced. The question asked of
              branch revenue is which branch is carrying the year, and that is
              a comparison — the one thing a ring cannot do, because two slices
              a few points apart read as equal. Bars share a baseline, so it is
              a length against a length.
            */}
            <MagnitudeBars
              bars={branchBars(w.branches, currency)}
              caption={`Year-to-date revenue of ${money(w.ytd.revenue, currency)} across ${w.branches.length} branches, largest first.`}
            />
          </CardBody>
        </Card>

        <Card className="flex flex-col">
          <CardHeader title="Business health" subtitle="Eight weighted components" />
          <CardBody className="flex flex-1 flex-col justify-center">
            {/*
              The same dial as the Digital Twin's, without the eight rows —
              there is no room for them here and the page links through to
              where they are. breakdown={false} moves the keyboard route
              onto the ring, which is the only route there is here.
            */}
            <HealthExplorer health={w.health} breakdown={false} />
          </CardBody>
        </Card>
      </div>

      {/* ── OpportunityRadar® ────────────────────────────────────────── */}
      <FlagshipHeading
        wordmark={<ProductWordmark name="opportunity-radar" />}
        blurb="What is in front of the business, what it is worth, and how far along it is."
        href="/opportunity-radar"
        cta="Open the radar"
      />

      <div className="mb-8 grid gap-5 lg:grid-cols-[19rem_1fr] [&>*]:min-w-0">
        <Card>
          <CardHeader
            title="Pipeline by stage"
            subtitle={`${w.pipeline.total} tracked`}
          />
          <CardBody>
            <CompositionDonut
              slices={pipelineSlices(w.opportunities, currency)}
              total={compactMoney(w.pipeline.totalEstValue, currency)}
              totalLabel="pipeline"
              caption={`The ${money(w.pipeline.totalEstValue, currency)} pipeline, split by the stage each opportunity has reached. The figures are listed beneath.`}
            />
          </CardBody>
        </Card>

        <div className="min-w-0">
          <OpportunityTable opportunities={w.opportunities} currency={currency} />
        </div>
      </div>

      {/* ── The register ──────────────────────────────────────────────── */}
      <div className="mb-8 space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-[1.0625rem] font-semibold text-[var(--text-primary)]">
            Risk register
          </h2>
          <Link
            href="/risk-radar"
            className="text-[0.8125rem] font-medium text-[var(--brand)] hover:underline"
          >
            {w.riskSummary.open} open · {w.riskSummary.worsening} worsening &rarr;
          </Link>
        </div>
        <RiskTable risks={w.risks} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        {/* ── Today's intelligence ────────────────────────────────────── */}
        <div className="min-w-0 space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-[1.0625rem] font-semibold text-[var(--text-primary)]">
              Today&rsquo;s intelligence
            </h2>
            <p className="text-[0.75rem] text-[var(--text-tertiary)]">
              Computed from the figures above
            </p>
          </div>

          {w.insights.map((insight) => (
            <Card key={insight.kind} tone="brand" className="px-5 py-4">
              <p className="eyebrow">◆ {insight.kind}</p>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-[var(--text-primary)]">
                {insight.body}
              </p>
              <p className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-label text-[0.6875rem] tracking-wide text-[var(--text-tertiary)] uppercase">
                <span className="text-[var(--brand)]">AI-simulated</span>
                <span aria-hidden>·</span>
                <span>Confidence: {insight.confidence}</span>
                {insight.meta ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>{insight.meta}</span>
                  </>
                ) : null}
                <span aria-hidden>·</span>
                <span>Source: {insight.basis}</span>
              </p>
            </Card>
          ))}
        </div>

        {/* ── Side rail ───────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader
              title="Priority actions"
              subtitle={`${w.actionSummary.completed} of ${w.actionSummary.total} logged complete`}
            />
            <CardBody>
              <ol className="space-y-3">
                {w.actions
                  .filter((a) => a.status !== 'Completed')
                  .slice(0, 4)
                  .map((a) => (
                    <li key={a.id} className="flex gap-2.5">
                      <Badge tone={a.priority === 'HIGH' ? 'negative' : 'warning'}>
                        {a.priority}
                      </Badge>
                      <div className="min-w-0">
                        <p className="text-[0.8125rem] leading-snug text-[var(--text-primary)]">
                          {a.action}
                        </p>
                        <p className="mt-0.5 text-[0.75rem] text-[var(--text-tertiary)]">
                          {a.owner} · due {date(a.dueDate)}
                        </p>
                      </div>
                    </li>
                  ))}
              </ol>
              <Link
                href="/action-centre"
                className="mt-4 block text-[0.8125rem] font-medium text-[var(--brand)] hover:underline"
              >
                Open the Action Centre →
              </Link>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Branch performance"
              subtitle={`${w.branches.length} locations`}
            />
            <CardBody>
              <ul className="space-y-2.5">
                {w.branches.map((b) => {
                  const status = branchStatus(b.healthScore);
                  return (
                    <li key={b.name} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[0.8125rem] text-[var(--text-primary)]">
                          {b.name}
                        </p>
                        <p className="numeric text-[0.75rem] text-[var(--text-tertiary)]">
                          {compactMoney(b.revenueYtd, currency)} YTD
                        </p>
                      </div>
                      <Badge tone={BRANCH_TONE[status]}>{b.healthScore}</Badge>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>

      {/*
        The three-row OpportunityRadar® and Risk Radar summaries that used to
        sit here are gone, and this note is here so nobody re-adds them by
        accident. They showed the same three opportunities and the same three
        risks that the bands above now show in full, sortable tables — keeping
        both would print the same rows twice on one screen and make the page
        look like it had lost track of itself.
        Nothing was removed from the platform: /opportunity-radar and
        /risk-radar are untouched, and both bands link to them.
      */}
    </>
  );
}

/**
 * The band heading for one flagship.
 *
 * The wordmark rather than the name set in type: these are registered marks
 * with supplied artwork, and typing "DigitalTwin®" in the page font is the
 * one thing the brand rules say not to do. ProductWordmark carries the
 * accessible name, so the heading reads correctly aloud while showing the art.
 */
function FlagshipHeading({
  wordmark,
  blurb,
  href,
  cta,
}: {
  wordmark: React.ReactNode;
  blurb: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="mt-2 mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-[var(--border)] pb-3">
      <div className="min-w-0">
        <h2 className="flex items-center">{wordmark}</h2>
        <p className="mt-1.5 text-[0.8125rem] text-[var(--text-secondary)]">{blurb}</p>
      </div>
      <Link
        href={href}
        className="shrink-0 text-[0.8125rem] font-medium text-[var(--brand)] hover:underline"
      >
        {cta} &rarr;
      </Link>
    </div>
  );
}
