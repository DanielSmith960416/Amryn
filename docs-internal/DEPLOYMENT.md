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

1. New project → Deploy from GitHub repo. Set **Settings → Build** to the
   Dockerfile builder with path `Dockerfile`. Do not rely on a file in the
   repository to supply that: `.railway/railway.ts` is applied by the CLI, not
   read at deploy time, and `railway.json` no longer exists.
2. Set the variables from the table below on the service.
3. **Settings → Networking → Custom Domain**: `app.amryn.ai`. Railway gives
   you a CNAME target.
4. There are two health endpoints, and Railway is pointed at the right one:

   - **`/api/health/live`** — did the server start? Always 200 while the
     process is answering. This is `healthcheckPath` on the service, and
     `deploy.healthcheckPath` in `.railway/railway.ts`.
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

   Not optional, and the reason is the note below. Nothing in the repository
   supplies this at deploy time any more — `.railway/railway.ts` is applied by
   the CLI, not read during a build — so without it set here the worker is
   built by Railpack, which knows nothing about `npm run build:worker` and
   produces an image with no `dist/worker.mjs` in it. Naming the Dockerfile
   here is what keeps both services on the same build, which
   is what stops the worker running last week's handlers against this week's
   schema.
3. **Settings → Deploy → Custom Start Command**: `node dist/worker.mjs`.
4. **Settings → Deploy → Health Check**: leave empty. There is no endpoint to
   check — the worker serves no HTTP at all, so a healthcheck could never pass
   and the deploy would be rolled back on a service that was working perfectly.
5. **Settings → Deploy → Restart Policy**: `ON_FAILURE`, 10 retries — which
   is Railway's default, so leaving it alone is the correct action. A service
   reporting no policy already has this one.

   Not `ALWAYS`, and this was learned the hard way on the first deploy. Railway
   applies `restartPolicyMaxRetries` only to `ON_FAILURE`; under `ALWAYS` the
   retry count is ignored entirely. The worker exits immediately when
   `SUPABASE_DB_URL` is missing — correctly — so `ALWAYS` turned a missing
   variable into a container restarting every 0.7 seconds indefinitely, on a
   service billed by the second, with the same line filling the log.

   A misconfiguration will never fix itself and should stop; a transient
   database outage should be survived. Ten attempts under `ON_FAILURE` does
   both, and setting the variable triggers a redeploy that starts it cleanly.

   One consequence worth knowing, because it caused a real fault: under
   `ON_FAILURE` an exit status of **0 is not a failure**, so a worker that
   ends cleanly is never restarted. That is correct for a worker asked to
   stop, and was a hazard for a worker that ended cleanly by accident — every
   timer in its polling loop is deliberately unref'd, so the process was being
   held alive only by whichever database socket the pool happened to have
   idle. A failed query destroys its client rather than returning it, so a
   worker that could not write its heartbeat had an empty pool, no handles,
   and exited reporting success. The loop now holds an explicit handle for as
   long as it should be running, so liveness is a decision rather than a side
   effect. Keep the policy as it is; the fix belongs in the worker.
6. **Settings → Networking**: no domain, no port. It serves nothing.
7. Variables: **`SUPABASE_DB_URL`**, and the five **`SMTP_*`** settings.

   `SUPABASE_DB_URL` holds a direct connection rather than a session, so none
   of the `NEXT_PUBLIC_*` settings apply and it needs neither the anon key nor
   the service role key. Take the **session pooler** string from Supabase →
   Settings → Database. Without it the worker exits immediately and says so —
   deliberately, rather than idling while the host reports it healthy and
   nothing is processed.

   `SMTP_HOST` `SMTP_FROM` `SMTP_PORT` `SMTP_USER` `SMTP_PASSWORD` are needed
   because the morning brief is composed *and delivered* by the worker, not by
   the web service. Without them `brief.compose` writes a correct brief and
   records `email_skipped`: the brief exists, nobody is told about it, and
   nothing is broken enough to notice. `SMTP_HOST` and `SMTP_FROM` are the two
   that decide whether mail is attempted at all; the rest tune the connection.

   These are set as Railway references to the web service's copies, so each
   credential is defined once. That couples the two services in both
   directions — the web service reads `SUPABASE_DB_URL` from the worker — so
   **renaming either service breaks the other's variables.** If you would
   rather they were independent, paste the literals instead; either way they
   must stay declared in `.railway/railway.ts`, because omission deletes.
8. **Settings → Deploy → Pre-Deploy Command**: `node scripts/migrate.mjs`.

   This is the ordering fix. Twice the worker deployed before its migrations
   were applied, came up healthy, claimed `twin.nightly` and failed on a table
   that did not exist — three times, until the job had spent every attempt it
   was allowed. The migration landed minutes later and the queue had already
   given up on work that would then have succeeded; the row had to be reset by
   hand.

   The command runs between the build and the start, so nothing starts against
   a schema it is ahead of. Three properties make it safe to run on every
   release:

   - It exits 0 when there is nothing to do, so a deploy that changes no
     migration is unaffected.
   - It takes an advisory lock, so two runs queue rather than race. Both
     services deploy from the same push in the same second; without the lock
     the loser fails partway through a `create table` that already exists — a
     failed deployment caused by nothing being wrong.
   - A failed migration stops the deploy before the worker starts, which is
     the outcome you want. Note this includes the backup rule: a migration
     that is not purely additive, on a database with organisations in it and
     no recent backup, will refuse — and so block the deploy — until a backup
     is taken. That is deliberate. See **Backups** below.

   The migration output appears in the deploy log.

   The worker also checks for itself and refuses to claim while the database
   is behind it, so the gap is safe even if this command is ever removed. But
   the command is what keeps the gap from opening.

9. Confirm it can actually reach the database and claim:

   ```
   railway run node dist/worker.mjs --once
   ```

   One pass, then it exits. It should name the handlers it knows and either run
   something or say there was nothing to run.

> **Config as Code is gone from this repository.** `railway.json` was deleted
> and replaced by `.railway/railway.ts`, Railway's Infrastructure as Code. The
> old file stopped being read on 2026-12-01 anyway, and on that day a service
> whose builder came only from it would have fallen back to Railpack — which
> builds this repository's Next.js app perfectly well while producing an image
> with no `dist/worker.mjs`, no `scripts/` and no `supabase/migrations/` in it.
>
> Both services are described in that one file, which is what the old
> arrangement could not do: `railway.json` was per-service and only the web
> service ever used it.
>
> ### What the file is, and what it is not
>
> **No deploy reads it.** Railway evaluates `.railway/railway.ts` only through
> the CLI, on `plan` and `apply`. Committing it changes nothing; applying it
> does. Between the two, both services run on the settings stored against them,
> which is why those were set explicitly first.
>
> **Omit means delete.** A resource or variable not named in the file is one
> the next apply removes. Every variable on both services is therefore listed,
> as `preserve()` — "keep the value Railway already has" — so nothing secret is
> written into this repository and nothing is dropped. Generated
> `*.up.railway.app` domains are deliberately absent: Railway does not manage
> those through this file.
>
> ### The cutover, which needs an operator
>
> The plan and apply need a Railway **project token**, which cannot be created
> from CI or from a repository. Until one exists, the workflow at
> `.github/workflows/railway-config.yml` reports that and passes rather than
> failing every pull request that touches `.railway/`.
>
> 1. Railway → project → **Settings → Tokens** → create a project token scoped
>    to the **production** environment.
> 2. GitHub → repository → **Settings → Secrets and variables → Actions** → add
>    it as `RAILWAY_TOKEN`.
> 3. Open a pull request touching `.railway/` — the plan runs and comments the
>    diff on the pull request.
> 4. **Read the plan before merging.** It is safe when it shows only settings
>    you meant to move. It must not show service deletes, variable deletes,
>    bucket deletes, or changes to a service you did not touch. If it does,
>    close the pull request rather than merging it: merging is the approval,
>    and the apply job runs on merge.
> 5. The first plan is expected to show little or nothing, because the file was
>    written to describe what is already live rather than to change it. "Your
>    Railway configuration is already up to date" is the ideal first result.
>
> To run it by hand instead, from a machine with the CLI:
>
> ```
> railway login
> railway link                # choose this project and the production environment
> railway config plan         # read this carefully
> railway config apply
> ```
>
> `railway config pull --force` will rewrite the file from live state, which is
> the way to resolve any disagreement between the two — the live environment
> wins, not this file.
>
> ### Two things settled after the migration, each as its own reviewed plan
>
> **The worker's restart policy was never wrong.** The service reports no
> policy, which reads like a gap and is not one: Railway's default is
> `ON_FAILURE` with a maximum of 10 restarts, which is exactly what 2b.5 asks
> for. A field left at its default is simply not stored, and the read API does
> not echo it.
>
> It is deliberately **not** declared in `.railway/railway.ts`, and the reason
> generalises: **do not declare a value that equals the platform default.**
> Railway stores nothing, so the next plan compares the declared value against
> nothing and reports the same change again — forever. Measured rather than
> assumed: #85 applied `~ Update Amryn deploy.restartPolicyType` successfully
> and the next plan asked for it again.
>
> A plan that is never empty is a review gate people stop reading, which costs
> far more than the setting was worth. Declare what differs — the web
> service's `restartPolicyMaxRetries: 3` is declared precisely because 3 is
> not 10.
>
> **`SUPABASE_DB_URL` on the web service.** Set, so `/diagnostics` can read the
> worker's heartbeat and `/setup` can apply migrations, both of which need the
> direct connection rather than the Supabase client.
>
> It is a Railway *reference* to the worker's copy — `${{Amryn Worker.SUPABASE_DB_URL}}`
> — rather than a second literal, so the connection string exists once. Two
> consequences worth knowing: renaming the worker service breaks it, and the
> value shown on the web service is resolved by Railway rather than stored
> there.
>
> It is also declared as `preserve()` in `.railway/railway.ts`, and **must
> stay declared**. Omission deletes: a variable set in the dashboard but absent
> from that file is one the next apply removes.

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
- [ ] Worker service pre-deploy command is `node scripts/migrate.mjs`, and its output appears in the deploy log of a real deployment — a redeploy of an existing one does not prove it
- [ ] Both services name `Dockerfile` in their own build settings — confirm from a build log showing the Dockerfile's own stages, not from the builder field
- [ ] `RAILWAY_TOKEN` project token set as a GitHub Actions secret, and `railway config plan` reports no pending changes
- [ ] `/diagnostics` reports the background worker as *Running* rather than "cannot tell" — if it says it could not reach the database, `SUPABASE_DB_URL` on the web service is the thing to look at, not the worker
- [ ] The worker has the five `SMTP_*` settings, not just `SUPABASE_DB_URL` — otherwise the morning brief is composed and silently never sent (`daily_briefs.email_skipped` says why)
- [ ] Worker restart policy is `ON_FAILURE` (see 2b.5), and a beat is visible in `worker_heartbeats` within a minute of deploy
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

## Alerting

Everything else here is *pull*: the heartbeat is written, the drift is recorded,
`/diagnostics` reads them, and all of it waits for somebody to open a page. The
worker was once down for thirty-five minutes and the only reason anybody found
out was that somebody happened to look at the deployment dashboard.

**A dead worker cannot report that it is dead**, so the thing that notices has
to be somewhere else. Two changes, and they work together:

**1. `/api/health` now tells an anonymous caller about the worker.** The check
existed before and was gated behind the direct connection, so the only people
who could see it were the ones already looking at `/diagnostics`. A monitor —
the audience the endpoint is for — got `ok` while every schedule was stopped.
That is precisely what happened.

The gate was protecting the connection pool rather than the information, and a
thirty-second cache protects it better: any rate of polling now costs two
connections a minute. A worker that has not beaten for five minutes makes
`/api/health` return **503**.

Backups deliberately stay behind the gate. A stale backup is worth an
operator's attention and is not an outage, and a monitor that pages somebody at
three in the morning for one is muted within a week — after which it reports
nothing at all.

**2. `.github/workflows/uptime.yml` polls it every fifteen minutes.** GitHub
Actions is outside Railway and outside Supabase, so an incident cannot take out
both the platform and the thing that would have said so. A failing scheduled
workflow emails the repository owner with nothing configured, which is the
entire alerting mechanism — no secret, no pager service, no third party. It
reads only the public half of the endpoint, so nothing sensitive can reach a
workflow log.

It retries three times before believing a failure, because one failed request
is as likely to be a runner's network as an outage, and an alert that cries
wolf gets turned off.

Set the repository variable `HEALTH_URL` when the domain changes; it falls back
to the Railway address.

> **Two limitations, written down so nobody meets them during an incident.**
> GitHub's scheduled runs are best-effort and are delayed under load, sometimes
> by many minutes — this narrows a thirty-five minute silence to roughly
> twenty, and is not a pager. And GitHub disables scheduled workflows in a
> repository with no activity for sixty days.

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

### It runs nightly now

`backup.nightly` takes the dump at **01:00 UTC**, on the worker, onto a Railway
volume mounted at `/backups`. Before the Twin's run at 02:30 and the brief's at
03:30, on purpose: a backup taken before the night's writes captures a settled
day, and if the night's routine is what went wrong, a backup taken after it has
already recorded the damage.

The job shells out to `scripts/backup.mjs` — the same file you run by hand —
rather than dumping for itself, so there is one dump path and the migration
gate trusts what the schedule produces.

The volume is named **`amryn-backups`**, not `backups`. The first apply of
`.railway/railway.ts` reported success and created a `backups` volume that
never attached to anything and does not appear in the environment — visible
only as a name collision when another volume tried to take the name. The
working volume was created directly and the file names that one, so no future
plan is ever in a position to propose detaching or deleting the volume holding
the backups.

**Two consequences of using a volume, both deliberate:**

- **The worker runs as root.** Railway mounts volumes as root, and an image
  running as a non-root uid cannot write to one; `RAILWAY_RUN_UID=0` is
  Railway's documented remedy and there is no alternative. It is set on the
  worker only. The Dockerfile runs as `nextjs` because a compromised *render*
  should not be a compromised container — and the worker renders nothing,
  serves no HTTP, and accepts no requests. The web service keeps its non-root
  user.
- **Deploying the worker now has a moment of downtime.** Railway will not run
  two deployments mounted to the same volume, healthcheck or not. A single
  replica already had this; it is now unavoidable rather than incidental.

Retention keeps **14 days**, and never fewer than **3 dumps whatever their
age**. That floor is the important half: a volume holding one ancient dump
holds everything standing between the product and nothing, and deleting it for
being old would be the most destructive thing here — quietly, on a schedule,
with every other signal green.

### How you know whether any of this has happened

All of the above protects *migrations*. None of it answers the question
somebody asks after a disaster: **is there a backup, and how old is it?**

`backup.mjs` now records each completed dump in `public.backups`, and
`/diagnostics` reads the newest one:

| What it says | What it means |
|---|---|
| *Last backup 4 hours ago — 12.3 MB* | Fine. |
| *The last backup was 3 days ago* | A warning. The routine is meant to be daily. |
| *The last backup was 9 days ago* | A failure. Everything since exists in one place. |
| *No backup has ever been recorded* | A failure, and the honest state of a new deployment. |
| *…contains no organisations at all* | A failure, and the one to read twice — see below. |

A row is written only after the dump completes and verifies, so a row means a
complete dump of that database existed at that moment. What it cannot promise
is that the **file** still does: the dumps live on whichever machine took them,
which the platform cannot see. `stored_at` records where you said you put it.

**The empty-backup case is the one worth understanding.** A dump of the wrong
database, or of an empty one, is complete, correctly checksummed, the right
size, and restores exactly as cleanly as a good backup — leaving you with
nothing. The row counts are the only signal that distinguishes them, which is
why they are recorded and why a backup containing no organisations is reported
as a failure rather than a curiosity.

Those counts were wrong until now: an empty table was counted by reading past
its terminator into the next table's rows, so an empty `organisations` reported
39. Anyone who had checked would have been reassured by a fabricated number.
Fixed, with the empty case pinned by a test.

Backups are ignored by git — see `.gitignore`. A dump is every row of every
table in one plain-text file, in the working tree of a repository where
`git add -A` is routine.

## Rolling back

Railway keeps previous deployments; redeploy one from the service's history.
Nothing in the application writes a schema change on start, so rolling the
application back does not roll the database back — and must not be relied on
to. A migration that has to be undone needs a migration that undoes it.

Roll the worker back with the web service, not separately. They are one image
on purpose: a worker running last week's handlers against this week's schema is
the failure mode that makes an incident hard to read.
