# Amryn™ AIGrowthIntelligence®

Two things live in this repository:

| | What it is | Where | Deployed to |
|---|---|---|---|
| **Marketing site** | Static HTML, CSS and JS. No build step. | `docs/` | Cloudflare Pages, `www.amryn.ai` |
| **Platform** | The Amryn™ software: Next.js, TypeScript, Supabase, multi-tenant. | repository root | Railway behind Cloudflare, `app.amryn.ai` |

They are deployed separately and neither depends on the other at build time.
The marketing site links to the platform once you tell it where the platform
lives — see [Linking the two](#linking-the-two).

Full deployment instructions, including DNS and the complete list of settings,
are in [`docs-internal/DEPLOYMENT.md`](docs-internal/DEPLOYMENT.md).

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

- **Multi-tenant PostgreSQL schema** — 56 tables, Row Level Security on every
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
The invariants that must not be broken, the mistakes that produced them, and the
questions still open are in
[`docs-internal/DECISIONS.md`](docs-internal/DECISIONS.md) — read that one
before changing something that looks arbitrary.

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

### Applying migrations

There are two moments, and they used to be handled by the same refusal.

**An empty database.** Open `/setup` and press *Build the database*. It applies
the whole generated file in one transaction — all of it or none, never half.

**A database that already exists.** `/setup` now applies only the migrations
that database has not recorded, each in its own transaction. This was the
missing case: adding a migration to a deployment with customers in it had no
route through the application at all, and the answer offered was *"clear the
public schema first"*, which on a production database destroys it.

From a terminal instead, with `SUPABASE_DB_URL` set or in `.env.local`:

```
npm run db:migrate:dry     # list what is outstanding, change nothing
npm run db:migrate         # apply it
```

`/diagnostics` names the outstanding files under **Pending migrations**.

#### How it knows

`amryn.schema_migrations` records each file as it is applied, in the same
transaction that applies it — so a migration cannot be half applied, and cannot
be recorded without having been applied.

A database that predates the ledger has no record of the twelve migrations it
has already had, and running them again would fail on the first `create table`.
So on first use the ledger is seeded by *looking*: each migration has a
signature in `supabase/migrations/signatures.json` — one SQL expression that is
true only once that file has been applied. Guessing is not acceptable here,
because marking a migration applied when it was not means the next run skips
it, and the fault surfaces much later as a missing column that nothing explains.

Adding a migration therefore means adding its signature. The generator refuses
to build without one, and a database test walks the migrations one at a time
asserting that every signature turns true at its own file **and no earlier** —
a signature satisfied by an earlier migration is the dangerous kind, because it
makes its own file look already applied.

Nothing applies migrations automatically on deploy, deliberately: a build step
with DDL rights on a production database runs on every preview branch too.

### Two-step sign-in

TOTP, issued and checked by Supabase. What this repository owns is the part an
application must not get wrong: making the requirement real.

The obvious implementation is a redirect — if the session has not answered the
challenge, send it to `/verify`. That is worth doing and is not the control.
Every browser session also carries a key that speaks to PostgREST directly, and
a session that skipped the challenge is perfectly valid as far as the database
is concerned, so a redirect hides the data without protecting it.

So it is enforced where the data is. Supabase records the assurance level in
the token (`aal1` = a password, `aal2` = a password and a second factor), and
migration 15 adds `amryn.mfa_satisfied()` to `is_member()` and
`has_permission()` — the two functions every one of the 148 policies already
goes through. A condition repeated 148 times is one that will be missing from
the 149th.

`user_profiles.mfa_enabled` is what that guard consults. It is not the same
thing as having a factor, and the two must move together: set only after
Supabase confirms a verified factor, cleared in the same breath as removing the
last one. A flag set with no factor to present is an account locked out of its
own data with nothing able to satisfy the guard.

**Recovery.** The failure mode of two-factor authentication is not an attacker,
it is a lost phone. Ten single-use codes, hashed on the way in for the same
reason a password is. Redeeming one is deliberately *not* a sign-in — it
removes the factor and asks the person to enrol again — so getting back in
still costs a password *and* a code. Removing a factor from a session that has
not presented it is exactly what Supabase refuses, so that one call uses the
service role key, confined to `src/features/mfa/admin.ts`. Without that key
configured the code is not spent: burning a single-use code on an attempt that
cannot succeed leaves somebody worse off than before they tried.

`supabase/tests/18` covers it, including the assertion that matters most — that
a session which has not presented the factor is refused the data by the
database, not merely redirected.

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

Railway builds `Dockerfile` and runs the image; Cloudflare sits in front for
DNS, TLS and the CDN. The full procedure is in
[`docs-internal/DEPLOYMENT.md`](docs-internal/DEPLOYMENT.md) — what follows is
only the shape of it.

Three settings are required: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. Everything
else degrades honestly — without a mail service, invitation links are shown on
screen to be passed on; without a model key, the analytical engines run and the
assistant says it is unavailable.

The two `NEXT_PUBLIC_` values are compiled into the browser bundle **when the
image is built**, not read when the server starts. Railway passes service
variables to the build, so setting them on the service is enough there; build
the image anywhere else and they must be `--build-arg`s, or the bundle carries
`undefined` and the sign-in page reports an invalid key — a message about a
key, caused by a missing URL.

`src/lib/config/environment.ts` is the authoritative list of every setting, and
a test holds it to both the source and `.env.example`, so neither can drift
from the other quietly.

Two health endpoints, answering different questions: `/api/health/live` says
the server started and is what the deploy gate watches; `/api/health` asks the
database, mail and model provider whether they are well, and is what an uptime
monitor should watch. `/diagnostics` answers the second question in prose, for
a person.

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
site_url = "https://app.amryn.ai"
additional_redirect_urls = ["https://app.amryn.ai/auth/callback"]
```

Railway gives each environment its own hostname. Allow the production domain
and, if you use one, the staging environment's — a callback URL that is not on
the list fails *after* the person has left your page, so it reads as the
identity provider's fault rather than yours.

Google and Microsoft sign-in are already wired into the sign-in page. Enable a
provider in the file, supply its credentials through the environment variables
in `.env.example`, and it works — no code change.

---

## Linking the two

The marketing site's "Sign in" and "Open the platform" links are driven by one
constant near the top of `docs/app.js`:

```js
var APP_URL = 'https://app.amryn.ai';
```

**While it is empty, those links are hidden** — a marketing site with a Sign in
button that 404s is worse than one without. Set it once the platform answers on
its domain.

`npm run check:site` exercises both states and reports what the committed value
resolves to, so you can confirm the links before pushing.

#### Deploying the platform

The whole procedure, with DNS records and a cutover checklist, is in
[`docs-internal/DEPLOYMENT.md`](docs-internal/DEPLOYMENT.md). In outline:

1. **Supabase.** Create the project, take the URL and the two keys, and apply
   `supabase/migrations/` — either `SUPABASE_DB_URL=... node scripts/migrate.mjs`
   or `/setup` on the deployed application. Both use the same ledger, so
   running one after the other is safe and neither repeats a migration that is
   already in place.

2. **Railway.** Deploy from the repository; `railway.json` points it at
   `Dockerfile` and there is nothing else to configure about the build. Set the
   settings, and add `app.amryn.ai` as a custom domain.

3. **Allow the auth redirect.** Site URL `https://app.amryn.ai`, and
   `https://app.amryn.ai/auth/callback` on the redirect list. Skipping this is
   the easiest mistake to make and the slowest to diagnose: password sign-in
   keeps working while magic links and Google or Microsoft sign-in fail after
   the user has already left your page.

4. **Cloudflare.** `app` and `www` as proxied CNAMEs, SSL **Full (strict)**,
   Rocket Loader off — it reorders script execution and breaks hydration.

5. **Point the marketing site at it.** Set `APP_URL` in `docs/app.js`, run
   `npm run check:site` to confirm, and push.

Use the custom domain from the start rather than the platform hostname: it
survives a project rename or a move to another host, and saves changing every
reference twice.

---

## The marketing site

### Structure

```
docs/                → everything GitHub Pages serves
  index.html         → positioning band, Command Centre shell, content bands
  styles.css         → design system + layout
  app.js             → workspace data, Command Centre behaviour, APP_URL
  brand/             → supplied brand artwork (see BRAND-USAGE.txt)
  .nojekyll          → a leftover from the GitHub Pages era; harmless
.github/workflows/  → check.yml (typecheck, lint, test, build), image.yml
Dockerfile          → the application image Railway builds
railway.json        → what Railway does with it
```

For orientation, the platform beside it:

```
src/app/             → routes: (auth), (platform), api
src/components/      → ui, dashboard, charts, intelligence, opportunities, shell
src/features/        → auth, organisation, intelligence, opportunities, assistant
src/lib/             → engines (pure), ai, supabase, auth, utils
src/types/           → database.ts (generated), intelligence.ts
supabase/            → migrations, seed, tests
scripts/             → type generation, migrations, marketing-site check
docs-internal/       → architecture, decisions, deployment, migration history
```

### Deploying the site

Cloudflare Pages, serving `docs/` as-is. There is no build step and nothing to
configure beyond the output directory: the site is HTML, CSS and one script.

It used to deploy to GitHub Pages from a workflow in this repository. That
workflow has been removed — it built the platform with `output: 'export'`, and
a static export has no server, so it has no sessions and therefore no
authentication anybody could rely on. See the note at the top of
`next.config.ts`.

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
