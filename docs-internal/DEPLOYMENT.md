# Deploying Amryn

Three services, each doing one thing:

| Service | What it holds | Why not somewhere else |
|---|---|---|
| **GitHub Pages** | The marketing site — `docs/`, served at `danielsmith960416.github.io/Amryn`. Static, free, and the only marketing surface there is. | It is HTML, CSS and one script. Anything with a server would be paying for a capability the site does not use. |
| **Railway** | The application: a Node server built from `Dockerfile`, at `amryn-production.up.railway.app`. | The app opens a raw TCP socket to PostgreSQL (`pg`) and speaks SMTP (`nodemailer`). Neither exists in a Workers runtime, so the application cannot live on a CDN edge — see the note at the top of `next.config.ts`. |
| **Supabase** | PostgreSQL, authentication, storage. | Row Level Security is where every tenancy guarantee in this product is actually made. |

The split of hosts is deliberate. The marketing site must load fast for a
stranger and be indexable; the application is behind a session and must never
be indexed. One origin serving both would compromise each.

**There is one marketing site.** The application used to serve a second one at
its own `/` — the same headline, the same explanatory bands, maintained
separately and free to drift from the site people were actually linked to. It
does not any more: `/` on Railway is a redirect into the platform, and a
signed-out request to it meets the sign-in form.

Two constants join the halves, and they are the only two lines to change when
the domain moves:

| Where | Constant | Points at |
|---|---|---|
| `docs/app.js` | `APP_URL` | the application — every "Sign in" and "Open the platform" link |
| `src/lib/marketing-site.ts` | `MARKETING_SITE_URL` | the marketing site — the brand lockup on the sign-in and legal pages |

Cloudflare is not in the stack. It was, briefly, to serve both halves beneath
one domain with the platform at `/app`; `amryn.ai` still resolves to a
Namecheap parking page because the nameservers were never moved, so nothing
behind it was ever reachable. Withdrawn in #59 — the history is there if the
domain is ever pointed properly.

---

## 1. Supabase

1. Create a project. Region: choose the one nearest your customers — `eu-west`
   is currently the closest Supabase offers to South Africa.
2. From **Project Settings → API**, take:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`
3. From **Project Settings → Database**, take the connection string (session
   pooler is fine) → `SUPABASE_DB_URL`.
4. Apply the schema. Either:
   - `SUPABASE_DB_URL=... node scripts/migrate.mjs`, or
   - open `/setup` on the deployed application, which applies the same
     migrations through the same ledger.

   Both read `supabase/migrations/` and record what they applied, so running
   one after the other is safe. Neither will re-run a migration that is
   already in place.
5. **Authentication → URL Configuration**: set the site URL to
   `https://app.amryn.ai` and add `https://app.amryn.ai/auth/callback` to the
   redirect list. Without this, a password reset link lands on localhost.

## 2. Railway

1. New project → Deploy from GitHub repo. Railway reads `railway.json` and
   builds `Dockerfile`; there is nothing to configure about the build.
2. Set the variables from the table below on the service.
3. **Settings → Networking → Custom Domain**: `app.amryn.ai`. Railway gives
   you a CNAME target.
4. There are two health endpoints, and Railway is pointed at the right one:

   - **`/api/health/live`** — did the server start? Always 200 while the
     process is answering. This is `healthcheckPath` in `railway.json`.
   - **`/api/health`** — is the deployment *well*? Asks the database, the mail
     service and the model provider, and returns 503 when something is
     failing. Point your uptime monitor here.

   The distinction matters on the first deploy. There is no database
   configured yet, so readiness fails; if that gated the deploy, the platform
   would roll it back and `/setup` — the page that configures the database —
   would never be reachable. Both endpoints give one word and a status code to
   anyone, and the individual checks only to an administrator or a caller
   holding `INTERNAL_ACCESS_TOKEN`: a monitoring URL ends up in third-party
   dashboards, and a list of your internals should not go with it.

> **This used to catch everybody, and no longer does.** Next inlines
> `NEXT_PUBLIC_*` into the browser bundle at build time, so an image built
> without them carried `undefined` and reported "Invalid API key" on the
> sign-in page — a message about a key, caused by a missing URL, in a
> deployment where both settings were visible in the dashboard.
>
> The server now writes them into the document on every request and the browser
> prefers what it finds, so **setting them on the service and restarting is
> enough**, on any host, and changing one later is a restart rather than a
> rebuild. Passing them as `--build-arg` still works and is no longer required.

## 2b. The worker

A second Railway service, from the same repository and the same image, started
with a different command. It is what runs work that does not fit inside an HTTP
request: the hourly prune and the nightly sweep today, and the analysis, the
simulation and the daily brief in the phases after this one.

**Without it the platform works and nothing scheduled ever happens.** Jobs
queue and wait. That is a failure with no symptom on any page, which is why
`supabase/tests/verify-remote.sql` checks the queue exists and why the checklist
below asks for one line of output rather than a green tick.

1. In the same Railway project: **New → GitHub Repo**, the same repository.
2. **Settings → Build → Dockerfile Path**: `Dockerfile`.

   Not optional, and the reason is the deprecation below. `railway.json` sets
   the builder for the web service, and a new service cannot read it — so
   without this the worker is built by Railpack, which knows nothing about
   `npm run build:worker` and produces an image with no `dist/worker.mjs` in
   it. Naming the Dockerfile forces the same image both services share, which
   is what stops the worker running last week's handlers against this week's
   schema.
3. **Settings → Deploy → Custom Start Command**: `node dist/worker.mjs`.
4. **Settings → Deploy → Health Check**: leave empty. There is no endpoint to
   check — the worker serves no HTTP at all, so a healthcheck could never pass
   and the deploy would be rolled back on a service that was working perfectly.
5. **Settings → Deploy → Restart Policy**: `ON_FAILURE`, 10 retries.

   Not `ALWAYS`, and this was learned the hard way on the first deploy. Railway
   applies `restartPolicyMaxRetries` only to `ON_FAILURE`; under `ALWAYS` the
   retry count is ignored entirely. The worker exits immediately when
   `SUPABASE_DB_URL` is missing — correctly — so `ALWAYS` turned a missing
   variable into a container restarting every 0.7 seconds indefinitely, on a
   service billed by the second, with the same line filling the log.

   A misconfiguration will never fix itself and should stop; a transient
   database outage should be survived. Ten attempts under `ON_FAILURE` does
   both, and setting the variable triggers a redeploy that starts it cleanly.
6. **Settings → Networking**: no domain, no port. It serves nothing.
7. Variables: **`SUPABASE_DB_URL`**, and nothing else. It holds a direct
   connection rather than a session, so none of the `NEXT_PUBLIC_*` settings
   apply to it, and it needs neither the anon key nor the service role key.

   Take the **session pooler** string from Supabase → Settings → Database.
   Without it the worker exits immediately and says so — deliberately, rather
   than idling while the host reports it healthy and nothing is processed.
8. Confirm it can actually reach the database and claim:

   ```
   railway run node dist/worker.mjs --once
   ```

   One pass, then it exits. It should name the handlers it knows and either run
   something or say there was nothing to run.

> **`railway.json` is deprecated, and this is dated.** Railway has replaced
> Config as Code with Infrastructure as Code (`.railway/railway.ts`). Existing
> `railway.json` files keep working **only until 2026-12-01**, and **new
> services cannot opt into them at all** — which is why the worker's settings
> above are set on the service rather than committed to a file beside
> `railway.json`.
>
> Two consequences worth acting on before that date. The web service's builder
> comes from `railway.json` today, so on 2026-12-01 it would silently fall back
> to Railpack and stop using the Dockerfile. And the two services are
> configured in two different ways, which is exactly the drift that file
> existed to prevent. Migrating both to `.railway/railway.ts` fixes both and is
> not urgent until it suddenly is.

Running more than one worker is safe. They never take the same job — the claim
is a single statement using `for update skip locked` — and a worker that is
killed has its work returned automatically when the lease it was holding
lapses. There is no leader, no lock and no reaper process to keep alive.

**Which organisations it works for.** A job with no organisation is platform
housekeeping and always runs. A job belonging to a customer runs only if that
organisation has the `background_jobs` flag switched on, which nothing is by
default:

```sql
insert into public.organisation_feature_flags (organisation_id, flag_key, enabled, enabled_at, note)
values ('<organisation-id>', 'background_jobs', true, now(), 'why this one first')
on conflict (organisation_id, flag_key) do update
  set enabled = excluded.enabled, enabled_at = now(), note = excluded.note;
```

Switching it off does not discard anything: the jobs stay queued, and switching
it back on runs the backlog.

## 3. Cloudflare

DNS, on the `amryn.ai` zone:

| Type | Name | Content | Proxy |
|---|---|---|---|
| CNAME | `app` | the target Railway gives you | Proxied |
| CNAME | `www` | your Cloudflare Pages project | Proxied |
| CNAME | `@` | `www.amryn.ai` | Proxied |

Then:

- **SSL/TLS → Overview**: **Full (strict)**. Anything less leaves the leg
  between Cloudflare and Railway unverified, which is the leg carrying every
  session cookie.
- **Speed → Optimization**: leave Rocket Loader **off**. It reorders script
  execution and breaks React hydration.
- **Caching**: no rule needed for `app.amryn.ai`. The application sends its own
  cache headers, and `/_next/static/*` is immutable and content-hashed, so
  Cloudflare caches it correctly without being told.
- **Security → WAF**: the managed ruleset is enough to begin with. If you add
  rate limiting, exempt `/api/health*` or your own monitor will trip it.

The marketing site deploys to Cloudflare Pages from whichever repository holds
it. It is static and shares nothing with the application but the brand assets.

---

## Settings

`src/lib/config/environment.ts` is the list, and a test asserts it against both
the source and `.env.example` — so a setting added to the code and not to the
list, or to the list and not to the example, is a failing test rather than a
support call six weeks later. What follows is the same information in the
order you will need it.

### Required — nothing works without these

| Setting | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Run time (build time optional) | Public. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Run time (build time optional) | Public by design. What it can reach is decided by Row Level Security, not by possession. |
| `SUPABASE_SERVICE_ROLE_KEY` | Run time | **Secret.** Bypasses Row Level Security. Never in a browser, never in an image layer, never in a log. |

### Strongly recommended

| Setting | Where | Without it |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Run time | Links in emails point at the Railway hostname rather than `app.amryn.ai`. |
| `SUPABASE_DB_URL` | Run time | Migrations have to be pasted into a SQL editor by hand. **Secret.** |
| `INTERNAL_ACCESS_TOKEN` | Run time | Operator pages are reachable only by a signed-in administrator — which is no help on the day nobody can sign in. **Secret.** |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASSWORD` `SMTP_FROM` | Run time | Invitation and activation links are shown on screen to be passed on by hand instead of emailed. |
| `PAYMENT_ACCOUNT_NAME` `PAYMENT_BANK` `PAYMENT_ACCOUNT_NUMBER` `PAYMENT_BRANCH_CODE` `PAYMENT_PROOF_EMAIL` | Run time | The billing page reserves a reference and asks the customer to email for details. All five are needed together — half a set of banking details is worse than none. |

### Optional

`AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_MAX_OUTPUT_TOKENS`, `AI_EFFORT`,
`PAYMENT_SWIFT`, `AMRYN_BASE_PATH`, `AMRYN_ENABLE_EXTERNAL_RADAR`.

Without a model key the analytical engines still run — the assistant and the
cross-cutting recommendations are what become unavailable, and the product
says so rather than failing.

### Set by the host — do not set these yourself

`PORT`, `NODE_ENV`, `RAILWAY_PUBLIC_DOMAIN`, `RAILWAY_GIT_BRANCH`,
`RAILWAY_GIT_COMMIT_SHA`, and the Cloudflare, Render, Fly and GitHub Actions
equivalents. Setting `RAILWAY_PUBLIC_DOMAIN` by hand and getting it wrong
breaks every link in every email the product sends.

---

## Taking payment

There is no card gateway, deliberately. The flow is:

1. The customer chooses a plan on `/settings/billing` and is given a reference.
2. They transfer the money and email the proof to `PAYMENT_PROOF_EMAIL`.
3. You match the deposit at **`/activations`** and confirm it. That mints a
   one-time activation link, shown once and stored only as a hash.
4. You send them the link. Opening it starts the period.

`/activations` is closed the same way `/diagnostics` is: a signed-in
administrator, or `INTERNAL_ACCESS_TOKEN` as `?key=`.

The confirmation step is deliberately out of the customer's hands in the
database rather than only in the interface — `subscription_activations` is
readable to them and not writable, and `issue_activation()` is revoked from
every signed-in role.

---

## Cutover checklist

- [ ] Supabase project created, schema applied, `/setup` reports every check green
- [ ] Authentication URLs point at `https://app.amryn.ai`
- [ ] Railway service deployed, `/api/health/live` returns 200, and `/api/health` reaches 200 once Supabase is configured
- [ ] Worker service deployed with start command `node dist/worker.mjs`, and `railway run node dist/worker.mjs --once` claims and runs something
- [ ] `NEXT_PUBLIC_*` set on the service (check the sign-in page loads without an API-key error)
- [ ] `app.amryn.ai` resolves through Cloudflare, SSL Full (strict)
- [ ] `www.amryn.ai` serves the marketing site
- [ ] A test account can sign up, create an organisation, and finish all eight Imprint layers
- [ ] An invitation email arrives
- [ ] A subscription request produces a reference; confirming it at `/activations` produces a working link
- [ ] `INTERNAL_ACCESS_TOKEN` set, and `/diagnostics` is a 404 without it
- [ ] The Vercel GitHub integration is disconnected (see below)
- [ ] The exposed OpenAI key from the earlier deployment has been revoked
- [ ] The `[BRACKETED]` placeholders in `src/lib/legal/documents.ts` are filled in and an Information Officer is registered with the Information Regulator
- [ ] A backup has been taken and restored once into a scratch database, so the file is known to be a backup rather than assumed to be one

## Disconnecting Vercel

The platform was briefly deployed on Vercel and nothing in this repository
refers to it any more — no configuration, no environment reads, and it is gone
from the POPIA operator register in the privacy policy. What survives is the
connection itself, which lives in the Vercel account and in the Vercel GitHub
App rather than in the repository, so it cannot be removed by a commit.

While it stays connected, every push builds a deployment of this application
with none of its settings, at a public `*.vercel.app` address — an unconfigured
copy of a product that holds financial records, on a hostname nobody is
watching. Worth thirty seconds.

1. **vercel.com** → the `amryn` project → **Settings** → **Git** → **Disconnect**.
   Or delete the project outright, which is cleaner if nothing else uses it.
2. Optionally **GitHub** → Settings → Applications → Installed GitHub Apps →
   **Vercel** → Configure → remove `Amryn` from the repository list. Step 1 is
   enough to stop the builds; this stops the app seeing the repository at all.

Both are account-level actions. Neither can be done from the repository, and
neither can be done by anyone without access to those accounts.

If you want to stop the builds without touching either account, Vercel reads
`git.deploymentEnabled` from a `vercel.json` in the repository. That is a
workaround rather than a disconnection — it leaves a Vercel configuration file
in a project that deliberately has none — and it is not committed here because
there is no way to test it from this side. The two steps above are the answer.

## Backups

**There are none, other than the ones you take.** This project is on Supabase's
free plan: no automatic backups, no point-in-time recovery. That is worth
saying plainly rather than discovering during an incident, because "restore
from the backup" otherwise describes something that does not exist.

Most migrations here cannot lose anything — they add a table, a column, an
index, a policy. Two of the twenty-three rewrite existing rows, and those are
the ones this is about.

```
node scripts/backup.mjs                          # from a machine that keeps its files
node scripts/migrate.mjs --backup <manifest>     # apply, with that backup to hand
```

`backup.mjs` needs `pg_dump` at least as new as the server (PostgreSQL 17), and
must **not** be run inside the deployment container: that filesystem is
discarded with the container, so a dump written there exists for exactly as
long as it is useless. It verifies the dump is complete rather than merely
present, records a checksum, and prints the row counts it captured.

The rule is enforced, not documented. `migrate.mjs` reads each pending
migration and refuses to apply one that updates, deletes, drops or retypes
unless `--backup` names a manifest that is recent, intact, and from this same
database. There is deliberately no way to skip it — the requirement lifts
itself when the database has no organisations in it, because then there is
nothing to lose.

## Rolling back

Railway keeps previous deployments; redeploy one from the service's history.
Nothing in the application writes a schema change on start, so rolling the
application back does not roll the database back — and must not be relied on
to. A migration that has to be undone needs a migration that undoes it.

Roll the worker back with the web service, not separately. They are one image
on purpose: a worker running last week's handlers against this week's schema is
the failure mode that makes an incident hard to read.
