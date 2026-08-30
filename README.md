# Amryn™ AIGrowthIntelligence®

Two things live in this repository:

| | What it is | Where |
|---|---|---|
| **Marketing site** | Static HTML, CSS and JS. No build step. Deployed to GitHub Pages. | `docs/` |
| **Platform** | The Amryn™ software: Next.js, TypeScript, Supabase, multi-tenant. | repository root |

They are deployed separately and neither depends on the other at build time.
The marketing site links to the platform once you tell it where the platform
lives — see [Linking the two](#linking-the-two).

---

## The platform

### Running it

```bash
npm install
cp .env.example .env.local     # fill in your Supabase project URL and anon key
npm run dev
```

Apply the migrations in `supabase/migrations/` to your Supabase project in
filename order, then optionally `supabase/seed/seed.sql` for a worked demo
organisation with twelve months of trading history.

Without Supabase credentials the app still starts and the sign-in page explains
what is missing rather than failing with a stack trace.

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run check` | Typecheck, lint and unit tests |
| `npm run test` | Unit tests only |
| `npm run db:test` | Apply every migration to a local PostgreSQL and run the RLS suite |
| `npm run db:types` | Regenerate `src/types/database.ts` from a live schema |
| `npm run check:site` | Smoke-check the marketing site in a real browser |

`db:test` needs a PostgreSQL 16 reachable at `PGHOST`/`PGPORT` (defaults
`/var/tmp` and `55432`). It creates the `auth` schema and roles that Supabase
would provide, so the migrations can be exercised against plain PostgreSQL.

### What is built

- **Multi-tenant PostgreSQL schema** — 46 tables, Row Level Security on every
  one. A user reads a row only if they are an active member of its
  organisation, its branch falls inside their scope, and they hold the
  permission gating that table. All three are decided in SQL. Thirty
  assertions in `supabase/tests/` prove it.
- **Analytical engines** — business health scoring, opportunity scoring, trend,
  anomaly, step-change and divergence detection, and the executive briefing.
  Pure, deterministic, 120 unit tests.
- **AI layer** — one interface over OpenAI and Anthropic, with schema-validated
  structured output. Optional: without an API key the platform runs on its
  engines and says so plainly in the interface.
- **Thirty-three routes** — Command Centre, DigitalTwin®, OpportunityRadar®,
  performance, opportunities, strategy, risk, data, reports and administration.

The design decisions, and the reasoning behind the ones that could have gone
the other way, are in [`docs-internal/ARCHITECTURE.md`](docs-internal/ARCHITECTURE.md).

### Sector scope, and Amryn's own posture

Two different things, kept apart deliberately:

- **Amryn trades with private-sector businesses** and does not take on
  government-sector work itself. That is a fact about Amryn's own clients, and
  it is stated in the marketing site's footer.
- **The software surfaces tenders to the businesses that use it.** A municipal
  supply tender is ordinary revenue to a wholesaler. Each customer sets their
  own `sector_scope` under Settings → Organisation; it defaults to every sector
  and is enforced inside RLS, so the pipeline, reports and the assistant all
  honour the same choice.

### Deploying

Vercel, root directory. Set `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_SITE_URL`; add `AI_API_KEY`
when you want conversational answers and cross-cutting recommendations.

---

## Linking the two

The marketing site's "Sign in" and "Open the platform" links are driven by one
constant near the top of `docs/app.js`:

```js
var APP_URL = 'https://your-project.vercel.app';
```

**It is currently empty, so those links are hidden.** The platform has not been
deployed yet; `https://amryn.vercel.app` was tried and returns 404. Deploy
first, then set this to whatever Vercel gives you — a marketing site with a
Sign in button that 404s is worse than one without.

`npm run check:site` exercises both states and reports what the committed value
resolves to, so you can confirm the links before pushing.

#### Deploying the platform to Vercel

1. Import this repository at [vercel.com/new](https://vercel.com/new). Leave the
   root directory as the repository root — the platform lives there.
2. Add the environment variables from `.env.example`:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
   `NEXT_PUBLIC_SITE_URL` (set that last one to the deployment's own URL).
   Add `AI_API_KEY` when you want conversational answers.
3. Apply `supabase/migrations/` to your Supabase project in filename order.
4. Take the deployment URL Vercel assigns and set `APP_URL` above.
5. `npm run check:site` to confirm, then push.

---

## The marketing site

### Structure

```
docs/                → everything GitHub Pages serves
  index.html         → positioning band, Command Centre shell, content bands
  styles.css         → design system + layout
  app.js             → workspace data, Command Centre behaviour, APP_URL
  brand/             → supplied brand artwork (see BRAND-USAGE.txt)
  .nojekyll          → tells Pages to serve the folder as-is
.github/workflows/deploy.yml
```

For orientation, the platform beside it:

```
src/app/             → routes: (auth), (platform), api
src/components/      → ui, dashboard, charts, intelligence, opportunities, shell
src/features/        → auth, organisation, intelligence, opportunities, assistant
src/lib/             → engines (pure), ai, supabase, auth, utils
src/types/           → database.ts (generated), intelligence.ts
supabase/            → migrations, seed, tests
scripts/             → type generation, marketing-site check
docs-internal/       → architecture notes
```

### Deploying the site

Pages is already enabled with **Source: GitHub Actions**. Every push to `main`
redeploys; the site lands at `https://danielsmith960416.github.io/Amryn/`.

### The Command Centre demo

`app.js` renders every view from the `WORKSPACES` object — nothing in the
dashboard is hard-coded in the HTML. Switching workspace or period recomputes
the whole view.

Three workspaces ship, at deliberately different scales, because Amryn is sized
to a decision rather than to a company:

| Key | Business | Scale |
|---|---|---|
| `highveld` | Highveld Supply Co. | Single site · 14 staff |
| `meridian` | Meridian Retail Group | Multi-branch · 9 sites · 210 staff |
| `kalahari` | Kalahari Freight & Logistics | National · 4 depots · 480 staff |

Each carries its own `revenue` series, health `score` and `bars`, `metrics`,
`feed`, `risks`, `ops` (radar signals) and `acts` (action register). To add a
workspace, add a key with the same shape — the selector populates itself.

Views: **Command Centre** (summary), **DigitalTwin®**, **OpportunityRadar®**,
**Actions**, **Intelligence Loop**. The rail switches them; `data-goto` buttons
inside tiles jump between them.

Interactive behaviour worth knowing about:

- **Period** re-slices the revenue series and redraws the chart and its note.
- **Filter** on the radar narrows signals; blips are regenerated to match, and
  blip ↔ card highlighting is wired both ways.
- **Action register** ticks persist per workspace in `localStorage`, and drive
  the progress bar, the rail badge and the Command Centre summary.
- Radar blip position is derived from each signal's `urgency` (distance from
  centre) and `size` (revenue at stake), with a stable per-id angle.

### Brand

Artwork in `docs/brand/` is used exactly as supplied. `BRAND-USAGE.txt` is the
pack's own rule sheet; the short version:

- Never re-colour, stretch, rotate or outline a mark.
- Lockups never below 90px wide; the icon mark never below 24px.
- Use the `-ondark` variants on backgrounds darker than 50% luminance.
- Brand names are never uppercased — the solid capitalisation
  (`AIGrowthIntelligence®`, `DigitalTwin®`, `OpportunityRadar®`) is part of
  the mark.

Palette: `#004AAD` brand blue, `#081B33` dark navy, `#3E7BD6` lifted blue
(on navy only — brand blue is near-invisible there).

**Known conflict:** the brand pack sets the products solid and without an "AI"
prefix (`Amryn™DigitalTwin®`), and ships product-mark artwork that way. The
Master Business-Building Blueprint writes them as `Amryn™ AI Digital Twin®`.
The site follows the pack, since that is the trademark form and the artwork
that exists. If the blueprint wins instead, the two product-mark PNGs need
reissuing and the panel headings go back to live text.

### Editing the demo data

All of it lives at the top of `app.js`:

- **Revenue** — the `revenue` array per workspace, monthly, in thousands of Rand.
  Twelve entries; `MONTHS` labels them.
- **Health score** — `score` and `scoreDelta`; the ring and the counter both read it.
- **Radar signals** — `ops[]`. `kind` is `opportunity` or `threat`, `urgency`
  is 0–1 (0 = centre), `size` is the blip radius in SVG units.
- **Actions** — `acts[]` as `[title, rationale, owner, effort, outcome]`.

### Positioning

Copy follows section 11 of the Master Business-Building Blueprint: *See Your
Business. See Your Market. Know What To Do Next.* — with the philosophy line
*Business Inside + Market Outside = Intelligent Growth* carried through the
page and the footer.
