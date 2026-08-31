# Migration notes — retiring the Supabase build

**Status: complete.** Nothing in the running application depends on Supabase,
Vercel Postgres, or any hosted database. This document records what was removed,
what was kept, and what has to happen outside the repository.

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
typecheck, lint and 84 tests all pass with no database reachable.

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

## 5. Accounts now

`AccountStore` (`src/lib/auth/store.ts`) has two implementations:

- **In-memory** — the default. Zero configuration, lost on restart. The sign-up
  page and Settings both say so plainly.
- **Upstash Redis over REST** — set `UPSTASH_REDIS_REST_URL` and
  `UPSTASH_REDIS_REST_TOKEN`. REST rather than a Redis client because serverless
  runtimes cannot hold a TCP connection open, and because it adds no dependency.

Neither is Supabase, and neither requires a schema, a migration or a
provisioning step. Swapping in Clerk or Auth.js later means one new file
implementing that interface plus a replacement session module.

---

## 6. Actions outside this repository

These cannot be done from the codebase and are the account owner's to complete.

### The Vercel deployment

There is nothing to hand over. The Vercel project `amryn` already exists, is
already connected to this repository, and built a working preview of this branch
— so it is the *same* project that served the previous build, and merging to
`main` redeploys it with the new code at the same URL. The hostname never
changes hands, and there is no window where the marketing site's links are
broken.

`docs/app.js` therefore needs no change either: its `APP_URL` already names that
hostname, and its links are wired to `/sign-in` and `/sign-up`, both real routes
in this build.

What does have to happen is configuration, and one of it is not optional:

1. [ ] **Set `AMRYN_SESSION_SECRET`** on the Vercel project
       (`openssl rand -base64 32`). Without it the application cannot create a
       session at all. The sign-up page detects this and says so instead of
       taking a password into a form that would fail, but nobody can sign in
       until it is set.
2. [ ] **Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`** if you
       want sign-ups to survive a redeploy. Without them accounts are held in
       memory, and the sign-up page and Settings both say so.
3. [ ] **Set `AMRYN_MARKETING_URL`** to
       `https://danielsmith960416.github.io/Amryn` so this deployment defers to
       the static site rather than competing with it in search results.
4. [ ] **Remove the retired variables** listed below from the project — the
       Supabase pair, the service role key, `DATABASE_URL`, the `SMTP_*` set and
       any model API keys. Nothing reads them now.

Set them before merging, or immediately after: a production deployment without
`AMRYN_SESSION_SECRET` serves the marketing site and the demo views fine, but
turns anyone away at sign-up.

### The rest

- [ ] **Delete the old Supabase project.** Nothing reads from it. Deleting it
      stops the free-tier pause emails and removes a database holding seeded
      rows and any test accounts created during the previous build.
- [ ] **Rotate anything that was ever committed or shared** — the Supabase
      anon/publishable key, the service role key, any SMTP credentials, and any
      OpenAI or Anthropic key from the previous `.env`. They are unused now, but
      a key that still works is still a key.
- [ ] **Remove the old environment variables** from any deployment that had
      them: `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`,
      `SMTP_*`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`.

### Environment variables the new build reads

| Variable | Required | Purpose |
|---|---|---|
| `AMRYN_SESSION_SECRET` | **In production, yes** | Signs the session cookie. `openssl rand -base64 32` |
| `UPSTASH_REDIS_REST_URL` | No | Durable account storage |
| `UPSTASH_REDIS_REST_TOKEN` | No | Durable account storage |
| `AMRYN_MARKETING_URL` | No | Set it when the static site is the public face |

That is the complete list. There is nothing else to configure.

Set `AMRYN_MARKETING_URL=https://danielsmith960416.github.io/Amryn` on the new
project. It makes this deployment defer to the static site rather than compete
with it: the application's own homepage stays reachable, but it is not indexed
and it declares the static site as its canonical URL. Without it, two copies of
the same marketing copy are indexed at two URLs and search results choose
between them arbitrarily.

---

## 7. The GitHub Pages site

`docs/` is **untouched**. It still deploys to
`danielsmith960416.github.io/Amryn` through
`.github/workflows/deploy.yml`, and the new Next.js homepage continues its
message rather than replacing it.

This is deliberate. That site is the live public face; deleting it to make a
point about a rebuild would take the public presence offline for however long
the new deployment takes to go live and its DNS to settle. Once the new
deployment is on its own domain, `docs/` and its workflow can be retired in a
separate, reversible change — or kept as a static fallback.

---

## 8. Confirming nothing depends on the old stack

```bash
npm ci
npm run check     # typecheck + lint + 84 tests
npm run build
```

All four succeed with no `.env` file, no database reachable, and no network
access to Supabase. The application starts, serves the marketing site, accepts a
sign-up, and renders every platform view and both executive reports from the
demonstration workspace.
