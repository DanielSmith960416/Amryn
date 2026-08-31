# Amryn™ AIGrowthIntelligence®

**Business Inside + Market Outside = Intelligent Growth**

A website that acts like an app. One public marketing site, one authenticated
client platform, and one formal executive report in PDF — all three rendered
from a single Intelligence Layer.

---

## What this is

Amryn is not a multi-tenant SaaS product and is not trying to be one. It is a
website with a client area behind it. A business signs up, opens the platform,
and sees its own DigitalTwin®, Business Health Score, OpportunityRadar®, Risk
Radar, Action Centre and Advanced Inventory Control. Each week it receives a
formal executive report, generated from the same figures the screens show.

The **Intelligence Layer** is the brain. It scores, classifies, ranks and
drafts. The website is presentation and interaction over it — nothing more.

```
                       ┌──────────────────────────────────┐
                       │        Intelligence Layer        │
                       │      src/lib/intelligence/       │
                       │                                  │
                       │  finance · health · opportunity  │
                       │  risk · kpi · inventory · brief  │
                       │                                  │
                       │   pure · deterministic · tested  │
                       └────────────────┬─────────────────┘
                                        │
                              ┌─────────▼──────────┐
                              │   loadWorkspace()  │
                              │   src/lib/         │
                              │   workspace.ts     │
                              │                    │
                              │  one computation   │
                              └─────────┬──────────┘
                                        │
                 ┌──────────────────────┼──────────────────────┐
                 │                      │                      │
        ┌────────▼────────┐   ┌─────────▼────────┐   ┌─────────▼────────┐
        │ Marketing site  │   │ Client platform  │   │ Executive report │
        │ src/app/page    │   │ (platform)/*     │   │ api/reports/*    │
        └─────────────────┘   └──────────────────┘   └──────────────────┘
```

The load-bearing idea: **the screen and the report cannot disagree**, because
there is one computation and two renderings of it.

---

## Where the product logic came from

Two Excel prototypes are the source of truth for every rule, threshold, weight
and piece of recommendation wording in this codebase.

| Workbook | Sheets | Lives in |
|---|---|---|
| `Amryn_AIGrowthIntelligence_Interactive_Software_Prototype.xlsx` | HOME, EXECUTIVE_COMMAND, CEO_DASHBOARD, DIGITAL_TWIN, BUSINESS_PROFILE, FINANCIAL_INTELLIGENCE, OPPORTUNITY_RADAR / DATABASE / SCORING, COMPETITOR & MARKET INTEL, RISK_RADAR & REGISTER, ACTION_CENTRE, DECISION_LOG, KPI_CENTRE, BUSINESS_HEALTH, FORECAST, WEEKLY & MONTHLY INTELLIGENCE, SETTINGS, DATA_INPUT, DEMO_DATA | `src/lib/intelligence/{finance,health,opportunity,risk,kpi,briefing}.ts`, `src/data/demo/kalahari.ts` |
| `Amryn_AIGrowthIntelligence__Advanced_Inventory_Control.xlsx` | DASHBOARD, AUDIT LOG, DEPT SUMMARY, SETTINGS, STOCK REPORT (sections A–E) | `src/lib/intelligence/inventory.ts`, `src/data/demo/inventory.ts` |

Every engine names the cell or formula it came from in a comment. Where the
codebase departs from a workbook, it says so and says why — see
**[Deliberate departures](#deliberate-departures)**.

---

## Getting it running

```bash
npm install
npm run dev            # http://localhost:3000
```

That is the whole setup. No database to provision, no external service to sign
up for, no keys required. The platform opens on a demonstration workspace so
there is something to look at from the first screen.

Before deploying anywhere real, set one variable:

```bash
# Required in production. Signs the session cookie.
AMRYN_SESSION_SECRET="$(openssl rand -base64 32)"
```

In development a secret is generated per process if none is set. In production
its absence is a hard error — a secret that changed on every deploy would sign
every client out on every deploy.

### Checks

```bash
npm run check          # typecheck + lint + tests
npm test               # 81 unit tests over the Intelligence Layer and auth
npm run check:site     # smoke-checks the static marketing site in a browser
npm run build          # production build
```

---

## The Intelligence Layer

`src/lib/intelligence/` is pure. No file in it performs I/O, reads a request or
calls a model. Every function takes data and returns data, which is what makes
a score testable, reproducible and explainable.

| Module | What it decides |
|---|---|
| `finance.ts` | Derived columns, year-to-date roll-up, trend readings, branch status bands, forecast |
| `health.ts` | Business Health Score — 8 weighted components, status bands |
| `opportunity.ts` | OpportunityRadar® six-factor scoring, classification, pipeline summary |
| `risk.ts` | Probability × impact, classification bands, register summary |
| `kpi.ts` | Variance against target, on/near/below bands, Action Centre summary |
| `inventory.ts` | Expiry status rules, dormancy classification, compliance summary, department matrix, owner recommendations, compliance profiles |
| `briefing.ts` | Executive insights, weekly brief, monthly report |

### The rules, in one place

**Expiry status** (universal, never varies by sector):

| Status | Rule | Obligation |
|---|---|---|
| `EXPIRED` | Past the expiry date | Remove from shelf immediately; log and notify |
| `CRITICAL` | ≤ 30 days remaining | Return to supplier or markdown |
| `WARNING` | 31–90 days remaining | Plan action; monitor each audit cycle |
| `CLEAR` | > 90 days remaining | No action; continue regular checks |

Compliance rate is CLEAR ÷ total. Urgent is EXPIRED + CRITICAL.

**Dormancy** — `DORMANT` (clear, left on shelf, no turnover) · `SLOW-MOVING`
(warning, left on shelf) · `AT-RISK` (critical, still on shelf) · `WRITE-OFF`
(expired).

**Business Health Score** — Financial 20% · Sales 15% · Customer 15% ·
Operational 15% · Marketing 10% · People 10% · Cash Flow 10% · Strategic 5%.
Banded `EXCELLENT` 90+ · `HEALTHY` 75+ · `STABLE` 60+ · `WEAK` 40+ · `CRITICAL`
below 40.

**Opportunity score** — value 25% · probability 15% · strategic fit 20% ·
urgency 15% · ease of execution 10% · probability again 15%. Classified `HIGH`
above 60, `MEDIUM` above 40, otherwise `MONITOR`.

**Risk score** — probability × impact on 0–1. `CRITICAL` above 0.60, `HIGH`
above 0.40, `MEDIUM` above 0.20, otherwise `LOW`.

---

## Advanced Inventory Control is not pharmacy-specific

The source workbook is written for a pharmacy throughout — "Pharmacist on
Duty", SAHPRA retention periods, a dispensary department. The module here is
sector-neutral. Every one of those decisions lives in a `ComplianceProfile`:

```ts
interface ComplianceProfile {
  label: string;
  unitNoun: string;              // "product", "line", "item"
  responsibleRoleLabel: string;  // "Pharmacist on Duty", "Quality Manager"
  auditorRoleLabel: string;
  regulator?: string;            // omitted where the sector has none
  retentionNote: string;
  disposalNote: string;
  departments: readonly string[];
  shifts: readonly string[];
}
```

Three ship: `pharmacy-sahpra` (reproduces the workbook exactly),
`food-retail`, and `general`. Adding a fourth is a new object in
`src/lib/intelligence/inventory.ts` — no engine, page or component changes.
The expiry rules themselves never vary: expiry dating is expiry dating,
whatever is on the shelf.

SAHPRA, insurance and disposal language is retained in full under the pharmacy
profile, including the retention period and the insurance/financial notes in
the stock report's section E.

---

## Auth and accounts

Self-contained, deliberately small:

- **Passwords** — Node's `scrypt`, memory-hard, cost parameters stored inside
  the hash so they can be raised later without invalidating existing passwords.
- **Sessions** — an HMAC-signed, HTTP-only cookie carrying the account id and
  an expiry. No session table, no store round-trip per request.
- **Accounts** — behind an `AccountStore` interface with two implementations.

| Store | When it is used | Durable |
|---|---|---|
| In-memory | No `UPSTASH_*` variables set | **No** — lost on restart |
| Upstash Redis (REST) | `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Yes |

The sign-up page and Settings both say plainly which one is running. An account
that quietly evaporates on the next deploy is worse than one that was never
offered.

```bash
UPSTASH_REDIS_REST_URL="https://…"
UPSTASH_REDIS_REST_TOKEN="…"
```

**Swapping in Clerk or Auth.js** is a new file implementing `AccountStore`
plus a replacement for `src/lib/auth/session.ts`. Nothing above those two
modules knows how authentication works.

### What is not built yet

- **Password reset.** No mail service is configured, so the sign-in page says
  so and gives a contact address rather than offering a link that leads
  nowhere.
- **Roles and permissions.** Every signed-in reader sees the whole workspace.
  When roles are needed, `src/components/shell/navigation.ts` has the seam.

---

## The weekly executive report

`/api/reports/weekly` and `/api/reports/monthly` render a print-ready A4
document from the same workspace the screens read. Open it and use Print →
Save as PDF.

**Why not a generated PDF file.** Producing one server-side means either a
headless Chromium in the deployment — hundreds of megabytes and a cold start
measured in seconds — or a PDF drawing library, which means re-implementing
layout, fonts, page breaks and table wrapping by hand for a document that would
then look nothing like the platform. The browser already has a typesetter. The
page is styled for A4 with real page breaks and print margins, it is
self-contained (inline styles, no external fonts, no scripts), and the output is
indistinguishable from a generated file. If a scheduled emailed report is ever
needed, this same HTML is what a renderer would be pointed at.

---

## Replacing demo data with a client's real data

Every view and both reports read one structure, assembled in one function:
`loadWorkspace()` in `src/lib/workspace.ts`.

That is the only place to change.

1. **Replace the inputs.** `src/data/demo/kalahari.ts` and
   `src/data/demo/inventory.ts` export plain arrays and objects typed against
   `src/lib/intelligence/types.ts`. Swap them for a fetch, a CSV import, an
   accounting API — anything that returns the same shapes.
2. **Make `loadWorkspace` async** if the source needs awaiting. Every page is
   already a server component; they become `await loadWorkspace()`.
3. **Set `isDemo: false`.** Every demonstration banner across the platform and
   the footer of the PDF disappears together.
4. **Pick the compliance profile** for the client's sector in
   `buildInventory`.
5. **Supply real operational, people and strategic inputs** if you have them —
   `calculateHealthScore` takes them as its third argument, and those three
   components stop being labelled *assumed*.

No page, component or engine is touched by any of that. The numbers on every
screen change together because they all descend from the same computation.

---

## Deliberate departures

Where this codebase does not do exactly what a workbook does, and why.

| Workbook behaviour | What this does | Why |
|---|---|---|
| KPI status uses higher-is-better for every metric, so *Risks Open* against a target of 0 reads **ON TARGET** with three open | `lowerIsBetter` inverts the comparison for those metrics | A register full of open risks must not render as healthy |
| Marketing Health divides new customers by a literal `8` | Divides by months actually reported | A January-only workspace scored near zero on marketing purely because eleven months were empty |
| Opportunity score is unbounded — R2m of value alone contributes 500 points | Reported score capped at 100; the raw figure stays available | The "/100" on the card has to be true |
| Probability is weighted twice, giving it 0.30 in total | **Preserved exactly**, and surfaced in the score breakdown | Changing it would silently re-rank every opportunity a client has already reviewed |
| Demo expiry dates are fixed, so the sample decays to all-EXPIRED as the file ages | Dates are offsets from the viewing date | The demo keeps demonstrating all four status bands; the rules are exercised, not bypassed |
| Department summary shows all departments including empty ones at 0% | Empty departments kept, compliance shown as **—**, risk shown as *No stock held* | On a compliance record, "we hold nothing here" and "we did not look here" must not render identically — and holding nothing is not failing |
| Section E prints every recommendation regardless of counts | Recommendations that no longer apply are dropped; insurance and financial notes always print | Telling an owner to escalate expired stock they do not have teaches them to skim the report |
| Briefing paragraphs are literal text | Reconstructed from the figures, in the same voice | A hard-coded sentence stops being true the moment the data changes — which is what makes the AI-SIMULATED label honest |

---

## Project structure

```
src/
  app/
    page.tsx                  public marketing homepage
    (auth)/                   sign-up, sign-in
    (platform)/               the client area — one auth guard in its layout
      command-centre/         EXECUTIVE_COMMAND
      digital-twin/           DIGITAL_TWIN + BUSINESS_HEALTH
      opportunity-radar/      OPPORTUNITY_RADAR + DATABASE + SCORING
      risk-radar/             RISK_RADAR + RISK_REGISTER
      action-centre/          ACTION_CENTRE
      inventory/              Advanced Inventory Control
        audit-log/            AUDIT LOG
        stock-report/         STOCK REPORT sections A–E
      financial/              FINANCIAL_INTELLIGENCE
      kpi-centre/             KPI_CENTRE
      forecast/               FORECAST
      market/                 MARKET + COMPETITOR_INTELLIGENCE
      decision-log/           DECISION_LOG
      reports/                WEEKLY + MONTHLY_INTELLIGENCE
      settings/               SETTINGS
    api/reports/[period]/     the print-ready executive report
  lib/
    intelligence/             the brain — pure, tested
    auth/                     password, session, account store
    reports/                  report rendering
    workspace.ts              the seam
    format.ts                 presentation formatting
  data/demo/                  demonstration data from the workbooks
  components/                 design system, shell, charts, tables
docs/                         the GitHub Pages marketing site (unchanged)
```

---

## Stack

Next.js 15 (App Router) · React 19 · TypeScript (strict, with
`noUncheckedIndexedAccess`) · Tailwind CSS 4 · Zod · Vitest.

Fourteen runtime dependencies. No database driver, no ORM, no charting runtime,
no auth SDK. Charts are hand-written SVG rendered on the server; the client
bundle is ~103 kB shared.

### Deploying

The two pieces are deployed separately and point at each other.

**The application** goes to Vercel. Import the repository and set
`AMRYN_SESSION_SECRET`, the two `UPSTASH_*` variables for durable accounts, and
`AMRYN_MARKETING_URL` if the static site is your public face. Nothing else is
needed — there is no database to provision.

**The static marketing site** is `docs/`, deployed to GitHub Pages by
`.github/workflows/deploy.yml` on every push to `main`. Its one piece of
configuration is `APP_URL` at the top of `docs/app.js`: set it to the
application's URL and the "Sign in" and "Open the platform" links reveal
themselves, pointed at `/sign-in` and `/sign-up`. Leave it empty and they stay
hidden — a marketing site with a sign-in button that 404s is worse than one
without.

`npm run check:site` exercises both states in a real browser, so neither breaks
silently. The current deployment reuses the hostname the previous build had, so
`APP_URL` already points where it should;
[`docs-internal/MIGRATION.md`](docs-internal/MIGRATION.md) has the handover
sequence, including the one window where the links are down.

---

## Design

Three themes — light, medium, dark — plus following the operating system,
applied before first paint so a reader who chose dark never sees a flash of
white. Every colour is a token in `src/app/globals.css`; no component
hard-codes a hex value.

Brand colours are fixed by the asset pack: `#004AAD` brand blue, `#081B33`
dark navy, `#3E7BD6` lifted blue on navy (brand blue disappears there).
Archivo for display, IBM Plex Sans for text, IBM Plex Mono for figures — set
with tabular numerals so a column of numbers aligns on the decimal rather than
jittering as it changes.

Desktop-first and information-dense, because it is built for decision-makers,
but it reads correctly down to 320px. Wide tables scroll inside their own
container so the page body never scrolls sideways and no column is lost — a
compliance record with hidden columns is a summary of a compliance record, which
is a different and much less useful document.

---

## Trademarks and disclosure

Amryn™ AIGrowthIntelligence®, Amryn™DigitalTwin® and Amryn™OpportunityRadar®
are trademarks of Amryn. © 2026 Amryn. All rights reserved.

All figures in the demonstration workspace are illustrative, not real client
data. Every page that renders them says so — repeated per page rather than
declared once, because a reader who deep-links into the Risk Radar must not have
to remember a banner they never saw.

Amryn trades with private-sector businesses and does not take on
government-sector work itself. This is a statement about Amryn's own clients,
not a limit on the software: the OpportunityRadar® surfaces tenders and
public-sector opportunities to the businesses that use it, and each of them sets
its own sector scope.

Forecast figures are projections on year-to-date averages. They are not
guaranteed results and carry that warning wherever they appear.

---

## Contact

danielsmith960416@gmail.com · 067 004 8810 · South Africa

See [`docs-internal/MIGRATION.md`](docs-internal/MIGRATION.md) for what was
retired from the previous build and confirmation that nothing depends on it.
