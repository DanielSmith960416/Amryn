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

- **Multi-tenant PostgreSQL schema** — 48 tables, Row Level Security on every
  one. A user reads a row only if they are an active member of its
  organisation, its branch falls inside their scope, and they hold the
  permission gating that table. All three are decided in SQL. Forty-six
  assertions in `supabase/tests/` prove it.
- **Analytical engines** — business health scoring, opportunity scoring, trend,
  anomaly, step-change and divergence detection, and the executive briefing.
  Pure, deterministic, 120 unit tests.
- **AI layer** — one interface over OpenAI and Anthropic, with schema-validated
  structured output and one corrective retry. OpenAI is the default, on
  `gpt-4.1-mini`; set `AI_PROVIDER=anthropic` to use Claude instead, which runs
  `claude-opus-5` with adaptive thinking. Optional either way: without an API
  key the platform runs on its engines and says so plainly in the interface.
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

### Two audiences, and the guard that keeps them apart

The platform used to tell a customer trying to sign in that its anon key had
been rejected, and send them to `/diagnostics`. Every word of that was true. It
also read as somebody else's console left switched on, and there was nothing
the reader could do with it.

So each fault now produces two sentences. What a person reads says whose fault
it is and what to do about it, in ordinary words. What names the setting goes
to the server log — `AuthFault.detail`, or `ourFault()` in `src/lib/errors.ts`,
which logs and returns the customer's sentence in one call. Reach for that
rather than `error.message`, which is where all of this started.

Operator detail on screen is gated by `internalAccess()`, not merely worded
carefully: the unconfigured sign-in page shows `SetupNotice` to an
administrator or a token holder, and one sentence to everyone else.

`src/lib/copy/vocabulary.ts` lists the words that must not reach a customer and
the paths exempt from the rule; a test walks the source for them, ignoring
comments, `console.*` calls and `detail:` fields. It fails on a sentence that
names a migration, a schema, an environment variable or `/diagnostics`.

### The security log

`audit_logs` is written only by `record_security_event()` and
`record_account_event()`, which take the actor from the session. The direct
insert was withdrawn in migration 14: the old policy let any member write any
action with anybody's id on it, which made the table a place to put claims
rather than a record of what happened. Use `recordEvent()` /
`recordAccountEvent()` from `src/lib/audit.ts`; both swallow their own failures,
because a sign-in that breaks over an unsaved audit row is worse than a
sign-in nobody wrote down.

Organisation events — invitations created, withdrawn and accepted, settings
changed — are readable by administrators of that organisation holding
`view_audit_log`. Account events — sign-in, failed sign-in, sign-out, password
change, data export, acceptance of new terms — carry no `organisation_id`, so
no policy matches them and no employer can read their staff's sign-in history
out of a workspace they administer. Those are ours as responsible party.

### Legal documents and POPIA

The platform carries its own policies at `/legal/privacy`, `/legal/terms`,
`/legal/cookies` and `/legal/dpa`, readable without signing in — a privacy
policy behind a login is not notice to anyone deciding whether to sign up.

**They are drafts.** `src/lib/legal/documents.ts` holds the company details
they depend on, and the ones nobody can invent are obvious placeholders in
square brackets: the registration number, the registered address and the
Information Officer POPIA requires a responsible party to register and name.
While any of those remain, every legal page shows a notice saying so. Fill them
in, have the documents reviewed by a South African attorney, and the notice
disappears.

`LEGAL_VERSION` in the same file is what acceptance is recorded against.
Changing a document means bumping it, after which everyone's recorded consent
correctly reads as consent to a different wording, and they are asked again
under Settings → Your privacy.

Consent is captured where it is given:

| Where | What | Stored on |
| --- | --- | --- |
| Sign-up | Terms + Privacy Policy | `user_profiles.terms_*`, `privacy_*` |
| Creating an organisation | Data Processing Addendum | `organisations.dpa_*` |

Sign-up consent takes a detour through the account's own metadata, because the
profile row it belongs on may not exist for hours — the address still has to be
confirmed. `amryn.handle_new_user()` and `public.ensure_user_profile()` both
copy it across, and both use `coalesce` so a later acceptance is never rolled
back to the one captured at sign-up.

Under **Settings → Your privacy** a person can download everything held about
them immediately (`/api/privacy/export`, which runs as the caller and cannot be
pointed at anybody else), and record a request for a copy, a correction or
deletion. Those land in `data_requests`, readable only by the person who made
them — deliberately not by their organisation's administrators, since an
employer who can see that someone asked to have their information deleted is a
reason for them not to ask.

### Deploying

Vercel, root directory. `/api/health` answers `200` when nothing is failing
and `503` when something is, for an uptime monitor; `/diagnostics` answers the
same question in prose, for a person.

Set `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
`NEXT_PUBLIC_SITE_URL`; add `AI_API_KEY` when you want conversational answers
and cross-cutting recommendations.

`NEXT_PUBLIC_SUPABASE_URL` is optional — it is derived from the anon key, which
names its own project in a public claim. Set it only for a custom domain.

### Supabase configuration

`supabase/config.toml` holds the settings that would otherwise live only in a
dashboard — most usefully the auth redirect allow-list, which is exactly the
kind of thing that gets forgotten and then costs an afternoon.

It does two jobs:

```bash
supabase start          # local stack, seeded with the demo org
supabase link           # the project ref is already in config.toml
supabase config push    # applies [auth] to the remote project
```

**Before pushing, know what it does.** `config push` applies *everything* in the
file, not just what you changed. If you have set something in the dashboard that
the file does not represent, pushing resets it. The CLI prints a diff and asks
first — read it. If you would rather configure the remote project by hand, do
that; the file still earns its place for local development.

Two values must change before any push, and are marked in the file:

```toml
site_url = "https://your-project.vercel.app"
additional_redirect_urls = ["https://your-project.vercel.app/auth/callback"]
```

Vercel gives preview deployments a new hostname per commit, so allow the pattern
`https://your-project-*.vercel.app/auth/callback` rather than adding them
individually.

Google and Microsoft sign-in are already wired into the sign-in page. Enable a
provider in the file, supply its credentials through the environment variables
in `.env.example`, and it works — no code change.

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

Vercel's Git integration handles this: connect the repository once, and every
push to `main` deploys automatically, with a preview deployment per pull
request. No secrets are stored in GitHub and there is no workflow to maintain.

1. **Import the repository** at [vercel.com/new](https://vercel.com/new). Leave
   the root directory as the repository root — the platform lives there, and
   Next.js is detected automatically. `docs/` is ignored by Vercel and keeps
   deploying to GitHub Pages independently.

   The first build **succeeds with no environment variables set**, so you get a
   deployment URL before configuring anything. The app runs, and the sign-in
   page explains what is still missing rather than erroring.

2. **Add the environment variables** under Project → Settings → Environment
   Variables, from `.env.example`: `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
   `NEXT_PUBLIC_SITE_URL` set to the deployment's own URL. Redeploy to pick
   them up.

   `NEXT_PUBLIC_SUPABASE_URL` is not in that list on purpose. It is worked out
   from the anon key, so there is no second value to get wrong — requiring two
   settings that must agree is what produced a live deployment answering
   "Invalid API key" while both settings looked plausible.

   Keep the `NEXT_PUBLIC_` prefix on the ones you do set. They are meant to reach the
   browser — the anon key grants nothing on its own, since Row Level Security
   decides every row it can read. `SUPABASE_SERVICE_ROLE_KEY` is the one that
   must never be public, and it is deliberately unprefixed.

   For the intelligence layer, add `AI_API_KEY` with an OpenAI key. No prefix —
   it is a server-side secret and must not reach the browser.

3. **Apply the migrations.** Run everything in `supabase/migrations/` against
   your Supabase project in filename order. Optionally `supabase/seed/seed.sql`
   for a worked demo organisation.

   With the CLI, from a machine that can reach Supabase:

   ```bash
   npx supabase login                 # opens a browser
   npx supabase link                  # project ref is already in config.toml
   npx supabase db push               # applies migrations/ in order
   ```

   Or paste each file into the SQL editor in filename order — seven files, and
   they are ordinary SQL with no CLI-specific syntax.

   **Then check it landed.** Run `supabase/tests/verify-remote.sql` in the SQL
   editor. A migration skipped or applied out of order does not fail loudly; it
   fails later as a confusing runtime error somewhere unrelated. The query
   returns ten rows, all of which should read `OK`.

4. **Allow the auth redirect.** Set the Site URL to the deployment and add
   `https://<deployment>/auth/callback` to the redirect allow-list — either in
   the [dashboard](https://supabase.com/dashboard/project/tnkmrrfxzsrbfndpkonh/auth/url-configuration)
   under **Authentication → URL Configuration**, or from
   `supabase/config.toml` (see [Supabase configuration](#supabase-configuration)
   below).

   Skipping this is the easiest mistake to make and the slowest to diagnose:
   password sign-in keeps working, while magic links and Google or Microsoft
   sign-in fail *after* the user has already left your page, so it looks like
   the provider's fault.

5. **Point the marketing site at it.** Set `APP_URL` in `docs/app.js` to the
   deployment URL, run `npm run check:site` to confirm, and push. That reveals
   the Sign in and Open the platform links.

If you plan to put a custom domain on the deployment, do that before step 5 and
use the custom domain — it survives a project rename or a move off Vercel, and
saves changing this twice.

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
