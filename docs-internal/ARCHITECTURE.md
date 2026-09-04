# Amryn™ AIGrowthIntelligence® — system architecture

The design decisions behind the platform, and the reasoning for the ones that
could reasonably have gone the other way.

Its companion is [`DECISIONS.md`](DECISIONS.md), which records what is true
*about* how the platform is built: the invariants that must hold, the failures
that produced them, the decisions since reversed, and the questions still open.
This file says what the system is; that one says what you must not break.

---

## 1. Shape of the system

```
                    ┌──────────────────────────────┐
   Browser ────────▶│  Next.js App Router          │
                    │  · Server Components (data)  │
                    │  · Client islands (charts,   │
                    │    forms, theme, sidebar)    │
                    └──────────────┬───────────────┘
                                   │ user's session cookie
                    ┌──────────────▼───────────────┐
                    │  Supabase PostgreSQL         │
                    │  · Row Level Security        │
                    │  · 56 tables, one schema     │
                    └──────────────┬───────────────┘
                                   │
        ┌──────────────────────────┴──────────────────────────┐
        │                                                      │
┌───────▼────────┐                                    ┌────────▼───────┐
│ Analytical     │  facts                             │ AI layer       │
│ engines        │───────────────────────────────────▶│ (optional)     │
│ pure, tested   │  ◀─────────────────── prose        │ OpenAI /       │
└────────────────┘                                    │ Anthropic      │
                                                      └────────────────┘
```

The load-bearing idea: **the engines decide what is true, the model decides how
to say it.** Reverse that and the product becomes a fluent liar.

---

## 2. Layers, and what each is allowed to do

Specification §25 asks for a layered AI architecture. This is it, concretely:

| Layer | Where it lives | May do | May not do |
|---|---|---|---|
| Data | `supabase/migrations` | Store rows, enforce RLS | Interpret anything |
| Normalisation | `src/features/intelligence/context.ts` | Turn rows into a bounded `BusinessContext` | Reach outside the caller's RLS scope |
| Intelligence | `src/lib/engines/*` | Score, detect, rank — deterministically | Perform I/O, call a model |
| Reasoning | `src/lib/ai/*` | Rephrase engine findings, answer questions | Introduce a finding the engine did not establish |
| Presentation | `src/app`, `src/components` | Render, filter by permission | Be the only thing enforcing access |

**Raw rows never reach a model.** The `BusinessContext` is the only structure
the AI layer sees, it is capped in size, and it is built with the caller's own
Supabase client — so it has already been narrowed by RLS before anything
reasons over it.

---

## 3. Tenancy

Three questions decide whether a user reads a row, and all three are answered
in SQL:

1. **Are they an active member of the row's organisation?** — `amryn.is_member()`
2. **Does the row's branch fall inside their scope?** — `amryn.can_see_branch()`
3. **Do they hold the permission that gates this table?** — `amryn.has_permission()`

Scope is a separate axis from role. A branch manager and an executive may hold
the same permission and still see different rows, because scope narrows *which*
rows while permission decides *which tables*.

```
organisation ──┬── region ──── branch ──── department
               └── member(role, scope_kind, scope_ids[])
```

A member scoped to a region sees every branch in it. A member scoped to
departments sees the branches those departments belong to. A row with a null
branch is an organisation-level aggregate, and is reserved for organisation-wide
scope — a branch manager should not read a group total.

**Why the helpers are `SECURITY DEFINER`:** they read `organisation_members`,
which is itself RLS-protected. A policy querying it directly would recurse.

**Why the application also checks permissions:** to hide controls and give a
real error message. It is not what keeps tenants apart. If the two layers ever
disagree, the database wins, and the worst outcome is a control that appears
and then refuses — never one that is hidden but works.

This is proved, not asserted: `supabase/tests/` carries 30 assertions that
impersonate real members and check cross-tenant reads, scope narrowing,
permission gating, write rejection, assistant privacy and anonymous access.

---

## 4. Sector scope — a decision worth recording

The first cut of this platform defaulted the OpportunityRadar® to private-sector
sources only and instructed the model never to mention tenders. That conflated
two different things:

- **Amryn's commercial posture.** Amryn trades with private-sector businesses
  and does not take on government-sector work itself. This is a fact about who
  Amryn sells to. It belongs in the company's positioning — and it now sits in
  the marketing site's footer.
- **What an Amryn customer should be shown.** Customers are private businesses,
  and a municipal supply tender is ordinary revenue to a wholesaler. Filtering
  it out withheld real money from the people paying for the product.

So `organisations.sector_scope` is a customer setting, defaulting to every
sector, enforced by `amryn.sector_in_scope()` inside RLS — which means a
report, an export and the assistant all see the same set. `tender` is its own
opportunity kind, because a defined scope with a published deadline and a
competitive submission is not "market expansion".

A tender then ranks on its merits. In the seeded demo it lands fourth of five:
large and closing fast, held back because public supply is not one of that
business's declared growth intents. Ranked down by the scoring engine, not
removed by a filter.

---

## 5. The engines

All pure, all deterministic, all unit-tested. Determinism is not fastidiousness:
a health score that wobbles makes its own trend line meaningless.

### Business Health Score (§26)

```
metric value → achievement vs target → 0-100 metric score
            → weighted mean within category → category score
            → weighted mean across categories → overall
```

- **On target scores 80, not 100.** A business exactly on plan is healthy, not
  exceptional. The last 20 points are earned by beating target, fully at +25%.
- **Missing categories are dropped and the remaining weights renormalised.** An
  organisation that has connected only its accounting system gets an honest
  score rather than one dragged to zero by data it has not connected yet — and
  the card says which categories are not covered.
- **Lower-is-better metrics invert the ratio**, so cost at 500 against a 620
  target achieves 1.24 rather than 0.81.

### Opportunity Scoring (§27)

Six weighted factors. Two choices worth noting:

- **Value is scored against the organisation's own benchmark, logarithmically.**
  An absolute scale would make every opportunity look enormous to a corner shop
  and trivial to a national group. Ten times the value is worth more, but not
  ten times more.
- **Competition is scored inversely** — uncontested scores high — so every
  factor points the same way and the weighted sum needs no special cases.

### Change detection (§8)

`analyseTrend`, `detectAnomalies`, `detectStepChange`, `detectDivergence`.

- Significance is judged **relative to the metric's own scale**, so a series
  drifting under 1.5% a period does not fill the feed.
- Anomalies are measured against a **trailing window**, so a metric that has
  legitimately changed level stops flagging once the window catches up.
- A **step change** is distinguished from a drift, because they call for
  different conversations: drift is a trend to manage, a step has a cause and a
  date.

### Briefing (§7)

Chooses the findings deterministically and ranks them: money at risk beats
money available, and both beat good news. The model may reorder and rephrase;
it cannot add a finding.

---

## 6. The AI layer, and what happens without it

One interface (`complete`, `completeStructured`) over OpenAI and Anthropic.
Structured output is validated against a Zod schema with one corrective retry
that quotes the validation error back — models fix a named error far more
reliably than a repeated prompt.

With no API key configured:

| Feature | Without a model |
|---|---|
| Health score, trends, anomalies | Unchanged — never used a model |
| Executive briefing | The engine's own briefing, labelled "Computed" |
| Opportunity scoring | Unchanged |
| Recommendations | **Empty, and says why** |
| Assistant | Explains the state of the business and what is missing |

Recommendations return nothing rather than something, deliberately. Combining
an internal decline with an external demand shift is a judgement; a rule that
fabricated one would be worse than no recommendation at all.

---

## 7. Roles

Eight roles, thirty permissions, one matrix — read live from the database at
`/settings/roles` rather than restated in code, because a matrix that is
documentation drifts from the thing it documents.

Reach widens down this list; scope is the separate axis described in §3.

| Role | Shape of access |
|---|---|
| Super admin | Everything, including support operations |
| Organisation admin | Everything inside one organisation |
| Executive | The whole business and the decisions from it; not billing or integrations |
| Regional manager | As branch manager, plus assignment and the audit log |
| Branch manager | Financial data, opportunities, risks and imports for their branches |
| Department manager | Sales, operations, goals and alerts for their departments |
| Analyst | Read everything, import data, define metrics. No people, no billing |
| Viewer | Read the dashboards. Change nothing |

Per-person overrides layer on top, granting or revoking a single permission
without inventing a new role.

---

## 8. Technical decisions and their trade-offs

| Decision | Why | What it costs |
|---|---|---|
| Server Components by default | Data never crosses the client boundary just to be laid out | Interactivity needs explicit client islands |
| RLS as the enforcement point | An application bug cannot widen access | Policy functions run per row; queries need indexes that suit them |
| Generated database types | Hand-maintained types for 56 tables drift | Regeneration needs a live database |
| Deterministic engines under the AI | Testable, reproducible, honest when the model is absent | More code than prompting for everything |
| Sparklines as hand-written SVG | A dozen per page; a chart runtime each would be absurd | No interactivity on them |
| Pinned `en-GB` number formatting | `en-ZA` groups with spaces and decimalises with commas, which reads inconsistently beside the compact form | Not locale-adaptive |
| Migrations, never edited in place | The record stays honest about direction changes | More files |

### Known limits

- **Connectors are modelled, not implemented.** The schema, status handling and
  UI for data connections are real; the actual sync jobs for Sage, POS and
  Sheets are not written. Manual and file import is the working path.
- **Reports list and record; they do not yet render or export.** The kinds are
  defined and history is stored.
- **Radar scanning is not automated.** Signals and opportunities are modelled
  and scored, but nothing is scheduled to go and fetch them yet.
- **RLS policy performance** has not been profiled against a large tenant. The
  helper functions are `STABLE`, but the indexes will need review at scale.

---

## 9. Roadmap

| Phase | State |
|---|---|
| 1 · Foundation — tenancy, RLS, roles, design system | Done |
| 2 · Command Centre — KPIs, health, briefing, feed | Done |
| 3 · DigitalTwin® — metrics, trends, anomalies | Done |
| 4 · OpportunityRadar® — scoring, pipeline, signals | Modelled; ingestion outstanding |
| 5 · Intelligence engine — briefings, recommendations, assistant | Done |
| 6 · Strategy and risk — goals, initiatives, register, alerts | Done |
| 7 · Enterprise — connectors, report rendering, exports | Outstanding |
| 8 · Production — profiling, monitoring, security audit | Outstanding |
