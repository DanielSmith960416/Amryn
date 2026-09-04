# Migration notes — retiring the Supabase build

> **Status: REVERSED. This document is history, not instruction.**
>
> The rebuild described below removed the platform in favour of a static site
> served from GitHub Pages. That decision has since been reversed: the brief
> that followed asked for the full multi-tenant product on Cloudflare, Railway
> and Supabase, and the application has been restored and built on. Everything
> this document says was "retired" is back and is load-bearing.
>
> It is kept because the reasoning is worth having on record — and because a
> `check.yml` step written to enforce it was still failing the build long after
> the decision changed, which is what a stale guard rail does. For how the
> product is actually deployed, see
> [`DEPLOYMENT.md`](DEPLOYMENT.md); for what that reversal taught, see
> [`DECISIONS.md`](DECISIONS.md) §5.

This document records what that rebuild removed, what it kept, and what had to
happen outside the repository.

---

## 1. The decision

The previous build was a multi-tenant SaaS platform: 45 tables under Row Level
Security, 8 roles, 30 permissions, 12 SQL migrations, an invitation system over
SMTP, an optional OpenAI/Anthropic reasoning layer, and a self-service database
bootstrap.

It worked, and it was more product than the business needs on day one. The
brief for this rebuild is explicit: *a website that acts like an app*, not a
full SaaS application, and no multi-tenant backend on day one.

So the Supabase project and the Vercel deployment behind it are **abandoned, not
migrated**. No data was carried across, because none of it was real client data
— the previous deployment carried seeded demonstration rows only.

---

## 2. What was deleted

| Removed | What it was |
|---|---|
| `supabase/` (entire directory) | 12 SQL migrations, RLS policies, 5 pgTAP test files, seed data, `config.toml`, `setup.sql` |
| `src/lib/supabase/` | Browser client, server client, middleware client, publishable-key inspection |
| `src/lib/db/` | Self-service database bootstrap, generated setup SQL, migration runner |
| `src/lib/auth/{permissions,internal-access,rate-limit,session}.ts` | 30-permission matrix, 8-role hierarchy, support-operator gating, rate limiting |
| `src/lib/email/` | SMTP transport and invitation mail |
| `src/lib/ai/` | OpenAI/Anthropic provider abstraction, prompts, structured-output retry |
| `src/lib/engines/` | The previous scoring engines (superseded by `src/lib/intelligence/`) |
| `src/features/{setup,invitations,diagnostics,organisation,assistant}/` | Database setup wizard, invitation flow, diagnostics, org onboarding, AI assistant |
| `src/features/{intelligence,opportunities,performance}/` | Supabase-backed query layers |
| `src/middleware.ts` | Session-refresh middleware |
| `src/types/database.ts` | 45-table generated types |
| `src/app/{setup,diagnostics,invite,auth/callback,onboarding}/` | Routes belonging to the removed features |
| `src/app/api/health/route.ts` | Health check that probed the database |
| `src/lib/env.ts` | Supabase-aware environment validation |
| `src/components/charts/` | Recharts wrappers |
| `scripts/{build-setup-sql,generate-db-types}.mjs` | Migration bundling, type generation |

**Dependencies removed:** `@supabase/supabase-js`, `@supabase/ssr`, `supabase`
(CLI), `pg`, `@types/pg`, `nodemailer`, `@types/nodemailer`, `mailparser`,
`smtp-server`, `@anthropic-ai/sdk`, `recharts`, `framer-motion`, `date-fns`, and
nine `@radix-ui/*` packages.

The runtime dependency list went from 30 to 12. There is no database driver, no
ORM, no auth SDK and no charting runtime in the deployed bundle.

### Verifying it

```bash
grep -ri "supabase\|nodemailer\|@anthropic-ai\|recharts" src/ package.json
```

Returns nothing but this file's neighbours in `docs-internal/`. The build,
typecheck, lint and 81 tests all pass with no database, no server and no environment.

---

## 3. What was kept

Not everything from the previous build was wrong. Carried forward:

- **The design system.** `src/app/globals.css` is unchanged — three themes,
  every colour a token, brand blue and the lifted-blue-on-navy rule intact.
- **Brand assets.** `public/brand/` and `docs/brand/`.
- **The marketing site's voice.** Positioning, the "Business Inside + Market
  Outside = Intelligent Growth" line, the who-it-is-for framing, the contact
  details and the full legal footer, now rendered as a Next.js page.
- **The legal and disclosure language.** Trademark attribution, the illustrative-
  data disclosure, and the sector-scope statement — that Amryn trades with
  private-sector businesses, while the OpportunityRadar® still surfaces tenders
  to the businesses that use it. This was a recorded decision in the previous
  build's architecture notes and it survives intact.
- **UI primitives.** `Card`, `Button`, the page header, the trademark
  superscript handling.
- **The engineering posture.** Pure, tested engines under the presentation
  layer; deterministic scoring; being explicit about what is measured and what
  is assumed.

---

## 4. What replaced what

| Previous | Now |
|---|---|
| Supabase Auth | `src/lib/auth/` — scrypt passwords, HMAC-signed session cookie |
| `organisation_members` + RLS | No tenancy model. One workspace per signed-in reader |
| 8 roles × 30 permissions | No role hierarchy. Every signed-in reader sees the workspace |
| 45 tables | Typed data structures in `src/data/demo/`, behind `loadWorkspace()` |
| SMTP invitations | Not rebuilt. Sign-up is self-service |
| OpenAI/Anthropic layer | Not rebuilt. Briefings are computed deterministically and labelled AI-SIMULATED, as the source prototypes do |
| Recharts | Hand-written SVG, rendered on the server |
| `src/lib/engines/` | `src/lib/intelligence/`, rewritten against the Excel prototypes |
| Session-refresh middleware | One `requireUser()` in the `(platform)` layout |

---

## 5. There are no accounts

The build that replaced Supabase Auth had its own: scrypt passwords, a signed
session cookie, and a pluggable account store. That went too, because the
deployment went with it.

This is a **static export on GitHub Pages**. There is no server, so there is
nothing to check a password against and no secret to sign a session with. The
client area is gated in the browser on a value in `localStorage` — a door, not
a lock. Anyone who requests one of those URLs directly receives the HTML.

That is stated in `src/lib/profile.ts` at length, and shown to the reader on
both entry pages and in Settings, because a form that looks like a sign-in will
be read as security unless it says otherwise. No password is asked for: asking
would look like security while checking nothing.

It is an honest trade while the workspace holds demonstration figures only. It
stops being one the moment a real client's data is in it, and the README's
"When you need real accounts" section sets out what returning to a server
costs.

---

## 6. Actions outside this repository

Almost nothing, which was the point of the change.

- [ ] **Enable GitHub Pages** for this repository if it is not already on:
      Settings → Pages → Source: **GitHub Actions**. The workflow does the rest.
- [ ] **Delete the old Vercel project.** Nothing deploys there now. The site is
      served entirely from Pages.
- [ ] **Delete the old Supabase project.** Nothing reads from it.
- [ ] **Rotate anything that was ever committed or shared** — the Supabase
      anon and service-role keys, any SMTP credentials, any model API key. They
      are unused now, but a key that still works is still a key.

There are **no environment variables to set**. `AMRYN_BASE_PATH` exists only
for serving the site from somewhere other than `/Amryn`, and has a default.

## 7. The hand-written `docs/` site was retired

`docs/` held a build-free static marketing site, and it was what GitHub Pages
served. It is now deleted, along with the Playwright check that exercised it.

The reason is that Pages serves one directory per repository, and that
directory is now `out/` — the built site, whose homepage carries the same
positioning, the same headline, the same philosophy line, the same contact
details and the same legal footer. Keeping both would have meant two copies of
the same marketing copy, only one of which could be published.

One thing did not survive: `docs/app.js` drove an interactive Command Centre
demo on the public page, with three sample workspaces. There is no equivalent
on the new homepage, because there no longer needs to be — the real platform is
one click away, needs no password, and is richer than the mock ever was.

The old site remains in git history if any of it is wanted back.

---

## 8. Confirming nothing depends on the old stack

```bash
npm ci
npm run check     # typecheck + lint + 81 tests
npm run build
```

All four succeed with no `.env` file, no database reachable, and no network
access to Supabase. The application starts, serves the marketing site, accepts a
sign-up, and renders every platform view and both executive reports from the
demonstration workspace.
