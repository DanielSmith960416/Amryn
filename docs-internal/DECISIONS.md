# The reasoning — invariants, lessons and open questions

`ARCHITECTURE.md` records how the platform is built. This file records the
things that are true *about* how it is built: the rules that must hold, the
mistakes that produced them, the decisions that were reversed, and the
questions still open.

It exists because that reasoning has so far lived in three places that do not
survive a change of hands equally well — code comments, commit messages, and
the heads of the people who wrote them. The first two are in the repository.
The third is not, and this file is the attempt to get as much of it down as
can be written.

---

## 1. Where the rest of the reasoning lives

**The commit log is the archive.** Commit messages in this repository are
unusually long on purpose: each one states the symptom, the diagnosis, what was
rejected and why, and how the fix was verified. Before changing anything that
looks arbitrary, read the commit that introduced it.

```bash
git log --format='%n=== %h %s%n%b' -- path/to/file    # why this file is like this
git log -S'someFunction' --format='%h %s'             # when a thing appeared or went
```

Several fixes in this history exist because somebody changed a line that looked
wrong in isolation and was load-bearing in context. The message is the context.

**Code comments carry the local why.** They explain reasoning rather than
mechanism — `src/lib/ai/provider.ts` on why Claude 5 rejects a `temperature`,
`src/lib/auth/rate-limit.ts` on why the limits are generous, `next.config.ts` on
why the application cannot live in a Workers runtime. Keep them when you edit
around them; they are the record of a fault somebody already paid for.

**Numbers are not documented, on purpose.** Table counts, policy counts and the
role matrix are read from the database or the migrations rather than restated in
prose, because a number written in a document drifts from the thing it
documents and then quietly misleads. Where a count does appear in prose, treat
it as approximate and go and count.

---

## 2. Invariants

These are load-bearing. Each is cheap to break by accident and expensive to
discover broken.

| Invariant | Why | What breaks if it goes |
|---|---|---|
| The engines decide what is true; the model only decides how to say it | A model that can introduce a finding is a fluent liar with a business's finances | The product's central claim. Every number becomes unverifiable |
| RLS is the enforcement point, not the application | An application bug cannot widen access if the database refuses first | One tenant reads another's financial records |
| Raw rows never reach a model | Privacy is data the model never receives, not a rule it is asked to follow | Assistant answers leak data outside the caller's permissions |
| The AI layer is optional and the platform is whole without it | A vendor outage, a lapsed key or a price change must not be an outage | A dependency on one company becomes a dependency of the product |
| Public settings are read at run time, never inlined at build | Next inlines `NEXT_PUBLIC_*` at build; an image is then correct only for the deployment it was built for | Deployments fail with messages naming settings that are plainly set |
| Every migration ends by reloading the schema cache | PostgREST otherwise serves a schema without the new tables in it | Correctly applied migrations look like migrations that never ran |
| Migrations are appended, never edited in place | The record stays honest about direction changes | The ledger and the database disagree, and neither can be trusted |
| Absence is `null`, not a computed zero | The health engine will score an absence of data and report CRITICAL | A customer who has imported nothing is told their business is failing |
| One deployment says one thing about itself | Two entry pages once described two different products | The front door tells prospective customers something false |
| Judgement lives in a pure module, not in `'use server'` | An actions file reaches for a session and a client on import, so nothing can exercise it | Untestable logic ships broken — twice, to real customers |

### On the last one

This is the most expensive lesson in the history and the easiest to repeat.
`actions.ts` files are `'use server'` and touch a session and a Supabase client
at import time, so a unit test cannot load one. Every bug that reached a live
customer in this project reached them through that gap.

The remedy is structural, not disciplinary: the *decision* moves to a plain
module beside the action, where it is pure and tested, and the action calls it.
`src/features/onboarding/reconcile.ts` beside `actions.ts` is the pattern —
`onlyNew` and `reconcileByName` are tested against the real live-deployment
case that produced them. Do this for anything that decides rather than merely
performs.

---

## 3. Failure patterns this codebase has actually produced

These recur. Recognising the shape is worth more than the individual fixes.

### A check that cries wolf gets muted, and then reports nothing at all

`verify-remote.sql` reported five red rows against a perfectly applied schema,
because its expected counts were hand-maintained and had been forgotten.
`/api/health` returned 503 on every correct install, because a privilege refusal
from a correctly secured database was counted as an outage. `/diagnostics` told
an operator to re-run migrations that were already applied.

Each was worse than having no check. An alert that fires on healthy systems is
turned off within a week, and after that the real failure passes unremarked.

**The rule:** before adding a check, work out what it says on a *correct*
system, and prefer a check that cannot rot — "did every migration record itself
in the ledger" over "are there exactly 143 policies".

**The corollary:** `degraded` is deliberately a 200. A missing model key or an
unset site URL is worth knowing and is not worth waking somebody at 3am.

### A guard rail written from memory rots into blocking the thing it guards

`setup.sql` closes by asserting what the schema should contain — a receipt, so
a half-applied database cannot pass silently. The counts were written by hand
into `scripts/build-setup-sql.mjs`, and two migrations later they said 49 tables
and 30 permissions against a schema that had grown to 56 and 31.

Because the whole file is one transaction, the assertion did not warn. It
raised, rolled everything back, and left an empty database — so the paste-into-
the-SQL-editor path and `/setup` both failed on a *correct* set of migrations,
reporting a schema problem that did not exist.

Three things made it invisible for two releases. The generator's own header
promised the file "cannot drift from the migrations it is made of", which was
true of everything except the part written by hand. `verify-remote.sql` carried
the same four counts, was refreshed, and stayed right — so the numbers were
maintained in one place and forgotten in the other. And CI applied the
migrations one file at a time and never once ran `setup.sql`, so the two paths
into a database were meant to be equivalent with nothing checking that they
were.

The counts are now derived from the migrations the generator already reads, and
CI runs `setup.sql` against a fresh database and fails if the generated files
are stale.

**The rule:** if a check states a fact about the code, derive the fact from the
code. A number typed into a file next to the thing it describes is a comment
that can fail the build.

### An error that names the wrong cause sends the reader to a correct setting

"Invalid API key" caused by a missing URL. "No email service configured" after
one was configured. "Could not read the permission catalogue, no reason given"
when the catalogue was present and simply not granted to `anon`.

A confident wrong diagnosis costs more than no diagnosis, because it directs
the reader's time at something that is already right.

**The rule:** when a failure has more than one possible cause, either
distinguish them or say plainly that you cannot. An unreadable count is
reported as *unanswered*, not as a finding.

### A permission refusal is proof the system works

`42501` from PostgREST means the database was reached, the key was accepted, the
role was resolved, and that role may not read the table. That is a correctly
secured database answering correctly. Classifying it as failure condemned a
healthy deployment (`src/lib/errors.ts` now carries the three classifiers, with
a test asserting they never both match, because each drives a different remedy).

### A whitelist can make a missing feature look present

`/forgot-password` and `/reset-password` were in the middleware's public path
list and neither page existed. The exemption made the absence invisible.

**The rule:** a route list, a permission matrix and a feature flag are all
claims about what exists. Check them against what does.

### Constraints are documentation that cannot be ignored

A stocktake line that has been actioned must carry a date, because a disposal
without one is not evidence. An audit claiming to be complete must carry a
completion time, or a report can be generated from a half-finished session and
dated as though it were final.

The first constraint caught its own test fixture on the first run. That is the
constraint doing its job before a customer met it.

### Uniqueness has three different failure modes and two of them are silent

From the onboarding steps, all in one release:

| Table | Constraint | What a repeated answer did |
|---|---|---|
| `branches`, `competitors` | `UNIQUE (organisation_id, name)` | Rejected the whole save with `23505` — revising one site lost every site |
| `departments` | `UNIQUE (organisation_id, branch_id, name)` | Never fired: `branch_id` is null here and Postgres treats nulls as distinct |
| `goals` | none | Two active rows under one title, and nothing able to say which figure the business is judged against |

**The rule:** a form that can be revisited is an upsert, not an insert. Where
there is no usable conflict target, read first and reconcile. And an atomic
insert of eight answers means one repeat rejects all eight — which is what a
customer met three times before skipping the step.

### An error that also empties the form reads as the work being thrown away

`SaveState` carries submitted values back so the form retypes them. This is not
a nicety; it is the difference between an error a person retries and an error
that makes them abandon the step.

---

## 4. Security decisions and the reasoning behind each

Recorded because each looks like it could be simplified, and each cannot.

- **The helpers are `SECURITY DEFINER`** because they read
  `organisation_members`, which is itself RLS-protected. A policy querying it
  directly recurses.
- **`accept_invitation()` is `SECURITY DEFINER`** for the same class of reason:
  the caller is by definition not yet a member of the organisation being written
  to. Its only parameter is the token — role and scope come from the invitation,
  never from the person accepting, so possession of a link cannot be turned into
  a role nobody granted.
- **Only the hash of an invitation token is stored.** The database never holds
  anything that grants access, so a leaked backup lets nobody in. The raw value
  exists once, in the response.
- **The rate limiter stores only hashes** — an email or an IP is personal
  information under POPIA, and keeping either in readable form builds a log of
  who tried to sign in and from where, retained for a purpose nobody agreed to.
- **The rate limiter fails open** (`src/lib/auth/rate-limit.ts:124`). One that
  refuses when it cannot reach the database turns a blip into an outage of the
  sign-in page.
- **Two buckets per attempt**, address and account, because one attacker working
  through many accounts and many attackers working on one account are different
  attacks.
- **The internal-access token is compared in constant time**
  (`src/lib/auth/internal-access.ts:49`), and a prefix, a superset and a wrong
  value are all refused. An escape hatch with a guessable key is an open door.
- **The administrator check is allowed to fail without denying access.** An
  unreachable database is precisely when `/diagnostics` matters, so a failure to
  answer "is this an administrator" leaves the token as the way in.
- **Password reset answers identically** whether or not the address has an
  account. A form that says "no such user" is a way to find out who banks here.
- **SMTP errors are rewritten before display.** Servers quote the credentials
  they rejected, and nodemailer includes the command it sent — which for
  `AUTH LOGIN` is the password, base64-encoded and therefore not hidden.
- **A lapsed subscription stops writes by a database trigger**, so it holds for
  a script with a valid token and not only for our pages. Reads, exports and
  billing stay open: a customer who cannot see the invoice cannot pay it, and
  POPIA s23 does not expire with a card.

---

## 4a. An advisor warning we measured and did not act on

Supabase's performance advisor reports `multiple_permissive_policies` on eleven
tables: a `_read` policy and a `_manage` policy that are both permissive for
`SELECT`, so PostgreSQL evaluates both and takes the union. The remedy it
implies is to narrow `_manage` from `FOR ALL` to the write commands, leaving
`_read` alone to answer reads.

That would be wrong on seven of the eleven, and pointless on the other four.

**Seven are not redundant — the `_manage` arm grants access `_read` withholds.**
`branches`, `departments` and `regions` all read with `... AND deleted_at IS
NULL`, while `_manage` has no such condition. An administrator can therefore
see a soft-deleted branch today, and would stop being able to. Measured rather
than reasoned about:

```
admin sees the soft-deleted branch today: true
the read policy alone would allow it:     false
```

`market_sources`, `opportunity_assignments`, `stock_items` and `stock_audits`
differ another way: the two policies name *different permissions*
(`manage_radar` vs `view_market_intelligence`, `manage_inventory` vs
`view_operations_data`). Anyone holding the write permission without the read
one loses access — and whether that combination exists is a question about the
role matrix and per-member overrides, not about these two policies.

**Four are genuinely redundant, and not worth changing.** On
`onboarding_progress`, `subscriptions`, `organisation_members` and
`member_permission_overrides` the read policy is `is_member(organisation_id)`,
and `has_permission()` requires an active membership row — so it is a strict
subset and the union is just `is_member`. But those tables hold one row per
organisation, or a handful. The saving is one function call per row on tables
with single-digit row counts per tenant, against the risk of hand-editing four
tenancy policies.

**So the warning stays.** It is describing the mechanism accurately and the
remedy is not safe here. If somebody reads the advisor later and reaches for
the obvious fix, this is why not — and the test that would catch the damage is
`10_rls_isolation_test.sql`, not the advisor.

The sibling finding in the same scan, `unindexed_foreign_keys`, was acted on in
full: see migration 22 and test 23.

## 5. Decisions that were reversed

Worth having on record, because a reversed decision tends to be re-proposed.

**The static rebuild.** The platform was once replaced by a static GitHub Pages
export — no server, no database, no authentication. `MIGRATION.md` documents it
in full and is marked REVERSED. The reasoning that killed it: a static export
has no server, so no server actions, no cookies during a request, and no
authentication anybody can rely on, in a product that holds one company's
financial records and must not show them to another.

Two things it left behind that cost real time afterwards:

- A `check.yml` step written to enforce the static build kept failing long after
  the decision changed. **A guard rail outlives the decision it guards.** When
  you reverse something, go and find its enforcement.
- Copy describing "no password, and no privacy — this site is served as static
  files" survived on `/sign-up` into a deployment where every clause was false.
  It would have gone live telling prospective customers that a product holding
  their financial records offers no privacy.

**`/diagnostics` and `/setup` were deliberately public.** That was right for a
deployment being set up and wrong for one with customers on it. The original
problem did not go away — a page needing a session is unreachable exactly when
it is needed — so the fix kept the escape hatch rather than removing it.

**Sector scope.** The radar once defaulted to private-sector sources and
instructed the model never to mention tenders. That conflated Amryn's own
commercial posture with what an Amryn customer should be shown. A municipal
supply tender is ordinary revenue to a wholesaler, and filtering it out withheld
real money from the people paying for the product. See `ARCHITECTURE.md` §4.

---

## 6. What lives outside this repository

None of this can be fixed by a commit, and all of it can bite.

| Thing | Where it lives | Why it matters |
|---|---|---|
| Supabase auth redirect allow-list | Supabase dashboard | Without it a password reset link lands on localhost |
| Supabase's own mail templates and sender | `supabase/config.toml`, pushed with the CLI | Confirmation, recovery and change-of-address mail is generated and sent by Supabase; nothing in this repository reaches it, which is why the Email delivery check names what it does *not* cover |
| DNS, TLS, CDN, firewall | Cloudflare, `amryn.ai` zone | The hostname split between marketing and app is a deliberate decision, not an accident of hosting |
| Railway service variables | Railway | Settings are read at run time, so this is a restart rather than a rebuild |
| The Vercel connection | The Vercel account and the Vercel GitHub App | While connected, every push builds an unconfigured copy of a product that holds financial records, at a public address nobody is watching. See `DEPLOYMENT.md` § *Disconnecting Vercel* |
| Any key ever committed or shared | The provider's console | A key that still works is still a key, whether or not anything uses it |

The Vercel case is the general lesson: **a decision that cannot be expressed as
a file change has to be written down, or it is not recorded at all.** A
workaround that *could* have been committed — a `vercel.json` disabling
deployments — was deliberately not taken, because it leaves a configuration file
in a project that has none and could not be tested from here.

---

## 7. Open questions

Not bugs to be fixed silently. Each needs a decision from somebody who can make
one about the business.

- **A duplicate goal on the live deployment.** One objective was recorded twice,
  twenty-eight minutes apart, before the reconciliation fix landed: the title
  says R20M while the targets say 2,000,000 and 1,200,000. Which is right needs
  a person, so the row was deliberately left alone.
- **Connectors are modelled, not implemented.** Schema, status handling and UI
  are real; the sync jobs for Sage, POS and Sheets are not written. Manual and
  file import is the working path — and every screen that says "connected"
  should be read against that.
- **Radar ingestion is not automated.** Signals and opportunities are modelled
  and scored; nothing is scheduled to fetch them.
- **Reports list and record; they do not render or export.**
- **RLS policy performance has not been profiled against a large tenant.** The
  helper functions are `STABLE`, but the indexes will need review at scale, and
  the policies run per row.
- **`settings/account-card.tsx` carries residue** of the static-export copy,
  behind authentication rather than on the front door.
- **There is no payment gateway, by choice.** Reference, transfer, proof by
  email, operator confirmation at `/activations`. If that changes, the
  confirmation step is currently held in the database rather than in the code,
  and that is where it should stay.

---

## 8. Proving the platform stands on its own

The claim that no vendor is load-bearing is worth re-checking rather than
trusting, because it is the kind of property that erodes one import at a time.

```bash
npm ci
npm run check          # typecheck, lint, unit tests
npm run db:test        # every migration against a local PostgreSQL, then RLS
npm run build
```

All of it passes with `AI_PROVIDER="none"`, no model key, and no network access
to any model provider. With the key removed the health score, trends, anomalies,
opportunity scoring and the executive briefing are unchanged, because none of
them ever called a model; the assistant answers with the state of the business
instead of prose, and recommendations return empty and say so.

Nothing in `.github/workflows/` refers to a model provider. `@anthropic-ai/sdk`
is a pinned npm dependency behind `src/lib/ai/provider.ts`, and every caller
above that file talks to `complete()` and `completeStructured()` rather than to
a vendor SDK — so changing model or vendor is a change in one file.

If a future change makes a model required for something, that is a decision
about the product and belongs in this file, not a detail of an implementation.
