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
`src/features/imprint/reconcile.ts` beside `actions.ts` is the pattern —
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

From the intake flow, all in one release:

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
`imprint_records`, `subscriptions`, `organisation_members` and
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

## 4b. The queue, and the decisions inside it

Everything the platform computed, it computed inside the request that rendered
it. That is right for a health score over twelve rows and impossible for what
comes next: an analysis measured in minutes, a simulation run five hundred
times, a brief that has to be written at six whether or not anybody opens a
page. Migration 23 is the queue those need. Four decisions in it are worth
keeping.

**The queue is in PostgreSQL, not in a broker.** A broker is a second store
that can disagree with the first. The thing a job is *about* — the
organisation, the figures, the row it will write — is in this database, and a
job acknowledged by a broker whose transaction then rolled back is a job that
will run against a state that never existed. Keeping the queue here makes
enqueueing and the change that justified it one transaction. `for update skip
locked` is the primitive a broker would be reimplementing, and it has been in
PostgreSQL since 9.5.

**Attempts are counted when a job is claimed, not when it fails.** The
intuitive version counts failures, and it has a hole exactly where it matters:
a job that reliably kills the worker process never records anything, so it is
picked up again by whichever worker starts next, for ever. Counting the start
means a crash costs an attempt, which is the only version that terminates.

**A dead worker is recovered by a lease, not by a reaper.** A worker that is
killed cannot tell anybody. Rather than a process whose job is to notice —
which is itself a process that can be dead — a claimed job carries an expiry,
and a job whose expiry has passed is claimable again on the same terms as a new
one. There is nothing to keep alive for the system to heal, and nothing to
elect.

**Flags are rows, and off is the absence of one.** `AMRYN_ENABLE_EXTERNAL_RADAR`
sat in `.env.example` and in the environment inventory for months. Nothing read
it. It survived because the test that checks for settings nothing reads
exempted it *by name*, with a comment explaining that it was read "by the
deployment rather than by the code" — a sentence that was simply not true and
that nobody had reason to check. It was the wrong shape as well as dead: one
value for the whole deployment, when what a rollout needs is switching
behaviour on for one organisation at a time.

Both are fixed. Flags are `public.feature_flags` and
`public.organisation_feature_flags`, where a flag with no row is off — there is
no way to write a default of true, which is the point — and the exemption list
in the inventory test is now empty. An exemption there is a claim to check
rather than a note to keep.

## 4c. A backup rule that is enforced rather than written down

This project is on Supabase's free plan. There are no automatic backups and no
point-in-time recovery, so "restore from the backup" currently describes
something that does not exist. The brief for the next phases requires a backup
before any migration touching existing client records, and a requirement of
that kind kept in a document is a requirement that is met until the evening it
is not.

So `scripts/migrate.mjs` refuses. It reads each pending migration and, if one
updates, deletes, drops or retypes, will not proceed without a manifest from
`scripts/backup.mjs` that is recent, intact and from the same database.

Three things about how it decides, each of which was wrong first:

- **It reads the SQL rather than trusting a marker.** A convention like
  `-- requires-backup` puts the classification in the hands of whoever writes
  the migration, and the migration where somebody forgets is exactly the one
  that needed it.
- **It strips comments and function bodies before deciding.** Defining a
  function that will one day delete something is not deleting something now.
  Without stripping, almost every migration in this repository reads as
  destructive — `prune_rate_limits()` deletes and `sweep_jobs()` deletes — and
  a check that fires on everything is a check that gets worked around.
- **There is no escape hatch, and it lifts itself instead.** A database with no
  organisations in it has no client records to lose, so the requirement does not
  apply. Making a fresh install take a backup of nothing would teach everybody
  that the step is theatre, and the next person would go looking for the flag
  that skips it.

The manifest identifies the database by a hash of its host and name, not of the
connection string. Hashing the string folds the password in, so rotating the
password would invalidate every backup ever taken and the guard would refuse a
good one with a message about the wrong database.

## 4d. Renaming a live flow without a window where it is broken

The seven-step setup is now the Amryn™ Imprint®: eight layers, a Quality
Score, and a record the customer owns rather than a process done to them. Three
decisions inside that are worth keeping.

**The old table is still there, and nothing reads it.** `alter table ... rename
to` is one statement and would have been wrong. A deploy starts new containers
alongside the old ones and retires the old ones as the new pass their health
checks, so for a minute or so both are serving. A rename breaks every request
the old containers handle in that window — not with a redirect or a stale page,
but with "relation does not exist" on the setup flow, for real customers, with
no way to retry until the rollout finishes. So migration 24 is additive: new
tables beside the old, a backfill, and `onboarding_progress` left exactly as it
was. A later migration removes it, as its own decision, with a backup.

That means the brief's "no such string anywhere" is met in the code, the routes
and the interface, and **not yet in the database**. Saying so is better than
claiming otherwise: the word survives in one unread table and its two unused
functions until that follow-up.

**The backfill is a function, not eight inline statements.** A backfill is the
part of a migration most likely to be wrong and least likely to be noticed: it
runs once, against data the author cannot see, and leaves nothing behind when
it silently matches nothing. Written inline it is also untestable by
construction — by the time any test runs, the migration has been applied and
there is no old record left to bring across. As a function it can be run again
with fixtures in front of it, which is what test 25 does, including the case
with no straightforward answer (two old steps feed the Intent layer, so half of
it is neither answered nor skipped) and the case where it is run twice after a
customer has since corrected an answer.

**The feature-flag rule does not gate this, deliberately.** Phase 1 established
that new behaviour ships behind a flag defaulted off. This is a replacement of
an existing flow rather than behaviour added beside one: gated off, there would
be no way to describe a business at all. The protection that rule provides is
instead provided by the shape of the migration — the old record is untouched,
so reverting is a deploy rollback rather than a data recovery. The rule applies
in full to the analysis, the simulation and the brief, which are additions.

## 4e. A score that decides what the product will say

The Imprint Quality Score is not a progress bar. Below 70 the analysis marks
everything provisional and refuses to discuss expansion at all, so this number
decides what the platform is willing to claim about a business.

A number with that job has to be defensible line by line, which is why
`score()` returns the reasoning as well as the figure and every screen showing
one shows it from the same call. A customer told their Imprint scores 64 can be
shown exactly which answers would move it, ranked by how much each would add.

The decision worth arguing about: **a skipped layer scores zero, exactly like
one nobody has reached.** Skipping is a legitimate answer and the review screen
says so. But the score does not measure effort or good faith — it measures how
much of the business the platform can actually see, and a layer skipped for
excellent reasons is just as invisible as one never opened. Letting a skip
score full marks would produce Imprints reading 100 that the analysis cannot
read, which is the one failure this number exists to prevent. What differs is
the sentence, not the score.

The figure is computed in TypeScript and stored on the record rather than
derived in SQL. Two implementations of a gate like this would eventually
disagree, and the one that disagreed silently would be the database's. Screens
recompute it as they render, so a stored figure a moment stale never appears
beside the answers it describes.

## 4f. A number that cannot say where it came from

Every asserted money figure now carries a provenance — reported, calculated,
estimated or simulated — and the two uncertain kinds cannot be stored without a
P10/P50/P90 range. Four decisions inside that.

**A column, not a sentence.** The tempting version writes "estimated" into the
narrative. That fails three ways: it cannot be filtered on, it cannot be
enforced, and it is the first thing lost when a figure is quoted onward into a
board pack. A column travels with the number and lets the database refuse an
estimate that does not say how uncertain it is.

**No default on the column.** A default is a way of not deciding that still
fills the field in, and the entire value of this column is that somebody
decided. Every existing write site — the seed, test 11, the demo data — had to
be updated, which is the point rather than the cost: it surfaced every place
the platform asserts a figure, and each one had to be classified by hand.

**The headline figure is the P50, by constraint.** Without that a row can carry
two numbers both claiming to be the estimate, and a screen showing one beside a
report showing the other is unexplainable to the person holding both.

**A range with no width is allowed.** A simulation may genuinely converge, and
saying "all three percentiles agree" is not the same as saying nothing. What is
forbidden is silence.

The same rule is enforced twice more, deliberately. TypeScript's `Opportunity`
requires it, so the demonstration business is held to the same standard as a
real one — that is the only way a demonstration is worth showing. And the radar
renders the tag beside the figure, because a provenance nobody sees is the
narrative-sentence failure with extra steps.

## 4g. Enforcing what the prompt only asks for

The house voice has always instructed the model never to invent a number. That
instruction is worth having and it is not a control: it is a request made to a
system optimised to sound right, and the failure mode when it is not followed is
the worst this product has — a confident figure, in the house voice, on a page a
business owner is about to act on, indistinguishable from a real one.

`src/lib/ai/numeric-guard.ts` checks every number in model output against the
numbers in the context it was handed. It can be this strict only because of an
older decision: the engines compute what is true and the model decides how to
say it, so every figure the model has any business writing was already in its
prompt. Against a model asked to do arithmetic this guard would be unworkable;
against one asked to write prose about arithmetic already done it costs nothing
legitimate.

**Rounding is not invention.** "R4.2m" for 4,235,000 is better writing than the
exact figure and is what a person would say aloud. A guard that rejected it
would be switched off within a week, so the tolerance comes from the precision
the output itself chose to use — two significant figures accept anything that
rounds to them, an exact figure accepts almost nothing.

**Three call sites, three different responses**, and the difference is the
judgement worth recording:

- *The briefing* discards the rewrite and returns the engine's own text. It
  costs nothing: the engine briefing was complete before the model was called.
- *Recommendations* drop the individual recommendation rather than the batch.
  One fabricated figure should not cost the three sound recommendations beside
  it, and a guard that expensive would be argued out of existence.
- *The assistant* keeps the answer and appends what it could not trace. Here a
  reader may legitimately ask for a ratio, and the honest answer divides two
  given figures to produce one that was not given. The guard cannot tell that
  from invention. Suppressing would make the assistant refuse arithmetic, which
  is most of what it is for; silence would make it dangerous. So the answer
  stands and names the figures the platform could not check — a ratio the
  reader recognises is fine, a market size nobody supplied is not.

## 4h. One front door, and a redirect where the second one was

The application served a marketing homepage at `/`: the same headline as the
static site in `docs/`, the same three explanatory bands, the same closing call
to action, in a different framework. Two marketing sites for one product.

Nothing was broken by it, which is why it survived. The cost is the kind that
only shows up later. Every change to the pitch had to be made twice, in two
markup languages, and the second one was the copy nobody was linked to — so it
was the one that went stale. A stranger who found the Railway host read an
older description of the product than the one being advertised, with no way to
tell which was current. And the static site's demonstration, which is the most
persuasive thing either surface has, existed on only one of them.

So `/` on the application is a redirect into the Command Centre, and the
marketing site is the site in `docs/`.

Three consequences worth recording, because each was a decision rather than a
consequence that fell out:

**`/` left the middleware's exemptions.** It was exempt from the signed-out
redirect for as long as it was a public page — a stranger had to be able to
read the pitch without an account. That reason is gone, so the exemption went
with it, and a signed-out request to `/` now meets the sign-in form directly
rather than being bounced through a redirect stub it has no session to follow.
Verified against a built standalone server: `/` and `/command-centre` both 307
to `/sign-in`, `/sign-in`, `/sign-up` and the four legal documents still serve
200, and `/api/health/live` — which is what Railway's healthcheck actually hits
— is untouched.

**The brand lockup on the sign-in and legal pages now leaves the
application.** It pointed at `/`, which was the marketing homepage and is now a
redirect back into the platform: a reader who clicked it while signed out would
have been sent to the sign-in page they were already looking at. It points at
the marketing site instead, as a plain anchor rather than `next/link`, because
that is a different origin.

**Two constants, facing each other.** `docs/app.js` has held a single `APP_URL`
naming the application since the site was first linked to it. `MARKETING_SITE_URL`
in `src/lib/marketing-site.ts` is the same arrangement facing the other way.
When the domain moves those are the two lines to change, and a grep for either
name finds every link that has to move with it.

---

## 4i. The model is not configured, and that is a decision

No `AI_*` variable is set on either Railway service. `aiConfig()` therefore
returns `provider: 'none'`, and every feature that would call a model falls
back to the deterministic engine: the assistant, the briefing's rewrite, the
narration on recommendations, and the market research added in #69.

This was found while wiring the radar, and it is worth writing down because it
had been true for months without anybody noticing. The reason nobody noticed is
the fallback working as designed — the engines compute what is true and the
model only decides how to say it, so a platform with no model is a platform
that words things plainly rather than one that is broken. That is the right
architecture and it is also how a missing credential stays invisible.

── what was decided ─────────────────────────────────────────────────────

To leave it off. The analysis is arithmetic over answers the customer gave; it
needs no model and runs unchanged. `external_radar` stays off, which the run
records as a gap rather than presenting an empty radar as a quiet market.

── what turning it on would take ────────────────────────────────────────

Either a key, or a gateway holding one:

    AI_PROVIDER=anthropic
    AI_API_KEY=…                       (the key sits on Railway)

    — or —

    AI_PROVIDER=anthropic
    AI_BASE_URL=…                      (a Cloudflare AI Gateway endpoint)
    AI_GATEWAY_TOKEN=…                 (no Anthropic key on Railway at all)

Both halves of the gateway form are required, and env.ts enforces it: a token
with no endpoint is sent to Anthropic, which does not know what it is; an
endpoint with no token is refused by the gateway. Half-configured counts as
not configured, deliberately, because the failure otherwise arrives as an
authentication error that says nothing about its cause.

── the thing to be clear about ──────────────────────────────────────────

Neither form removes the credential from existence; the gateway moves it to
Cloudflare. The Anthropic API authenticates with a key issued from the
Anthropic Console, which is a different thing from a Claude.ai subscription,
and there is no supported way to authenticate a server's API calls with the
latter. A note in an earlier session read "use my Claude account, the api key
has been revoked", and that is not a configuration this can be given.

── what is therefore unproven ───────────────────────────────────────────

The citation rule in web-research.ts is tested against fabricated API
responses and has never seen a live one. That is a deliberate split — the rule
lives in a module with no network code so it can be tested without a key, a
gateway or a bill — but a passing test suite is not the same as a search that
ran. Whoever turns the radar on should watch the first run's admitted and
rejected counts before turning it on for a second organisation.

---

## 4j. A second door into the queue, and why there is not a third

`job_runs` has no write policy, and adding one was the obvious way to let
somebody press "Run". It was rejected. A queue a browser can insert into
directly is a queue anybody can fill with work of any kind, at any priority,
for any tenant they can name — and the row-level check would have to
re-implement every rule about what a job may be, expressed in a policy, where
it cannot be read beside the rules it enforces.

So `public.request_simulation` is the second and last thing in this schema that
may put work in the queue on a person's behalf. Like `complete_imprint` it is
`security definer`, it knows exactly which two kinds of job it is allowed to
queue, and it grants nothing else. The permission, the feature switch, whose
scenario it is, and whether one is already running are all checked there rather
than in the server action, because a rule in an action holds only for callers
who came through the action.

Three details worth keeping:

- **It queues the fidelity measurement on the nightly tick's own key.** The two
  therefore share one measurement per organisation per day instead of racing.
  If this call is what started the measurement, the simulation waits ninety
  seconds; if today's was already taken, it starts now. The wait is slack, not
  synchronisation — a simulation that arrives too early refuses by name and
  nothing is lost.
- **`singleton_key`, not `dedupe_key`.** The nightly tick wants one run per
  scenario per night, ever. A person editing a multiplier and asking again is
  not a duplicate, so the manual path allows one run in flight at a time and
  the next the moment it lands.
- **The seed is still fixed per scenario per day.** Asking twice on one day
  gives the same answer unless a lever moved, which is deliberate: it makes the
  difference between two runs the lever rather than the dice. The studio says
  so on the result, because otherwise it reads as a stuck page.

The multiplier ceiling of ten is in the server action rather than the database,
and it is a judgement rather than a constraint — past about ten times, "nothing
outside the business changes" is a fiction rather than a simplification, which
is the same reasoning migration 29 used for the three-year horizon. It is
written where somebody can argue with it.

---

## 4k. A brief that cites, and two things running it taught us

The requirement was "every item traceable to its source record". That is the
whole difference between a brief and a newsletter, so it is two `not null`
columns — `source_table` and `source_id` — rather than a convention. An item
that cannot name the row it came from cannot be written. The citation is also
printed on the page and in the email rather than hidden behind a hover: a
source you have to reach for is a source nobody checks, and an unread citation
is the same as none.

"Maximum five, ranked by impact" is `rank between 1 and 5` plus a uniqueness
constraint per brief. Together they make six items impossible rather than
discouraged. A brief that quietly grew to eleven on a bad week is one nobody
finishes reading.

### Why this is not a second brief beside the existing one

The brief said to extend a reporting feature rather than build one next to it.
The executive summary on the Command Centre stays exactly as it is: it is
computed live from the workspace as it stands at the moment somebody opens the
page. This is a different object — dated, stored, cited, and delivered. Merging
them would mean losing whichever property the survivor did not keep, and the
live summary's value is that it is never stale while the brief's is that it is
never rewritten.

### Two things only running it against a real database revealed

Both handlers were correct in every unit test and wrong against Postgres.

The first: the driver returns `timestamptz` as a `Date`, not a string. The
handler called `.slice(0, 10)` on `ran_at` to get the day, which type-checked
because the row interface said `string` — a claim about the database that
nothing verified. It would have thrown on the first brief ever composed. The
fix is `ran_at::text` in the query, which is what the other date columns in
that file already did.

The second was not a crash. The trajectory item's impact was the shortfall to
target, and it ranked first every morning: a whole year's gap is a bigger
number than any single day's variance can be, so "you are 62% of the way to
your annual goal" led the brief on the day a competitor opened four kilometres
away. Two incomparable things had been put on one scale. A shortfall is a
standing position and everything else in the brief is a change, so trajectory
now carries no monetary impact and ranks on its section weight — which puts
"am I still on course" at the bottom of a Tuesday, where it belongs.

Neither was findable without executing the handlers. The harness that found
them is the same approach used on the Twin in #72, and the score is now four
bugs it has caught that a passing suite did not.

### Mail, and a module split

`src/lib/email/smtp.ts` became a re-export of `transport.ts`, which is the same
code without `import 'server-only'`. The worker has to email a brief, and that
marker — which exists for the React bundler, not as a runtime protection —
makes the worker build refuse the file by design. Same split as the AI error
types in #70, for the same reason. Every existing caller still imports the
guarded module and is guarded exactly as before, and the CI bundle scan still
fails the build if an SMTP value reaches client output.

Recipients are resolved through the permission catalogue rather than by naming
roles, and the resolution is spelled out in SQL rather than calling
`amryn.has_permission()`: that function answers for the *current session's*
user through `auth.uid()`, and the worker has no session, so it would answer
for nobody.

SMTP is configured on the web service and not on the worker, so the brief
records `email_skipped` and is in-app only until the same five variables are
set on the worker service. That is a fact on the row rather than a silence,
because "emailed" and "we never tried" are different things.

---

## 4l. A model may suggest; only a person may write

Change 6 lets the Assistant "adjust Twin parameters as proposals, fill Imprint
fields, and run scenarios". The table that makes the word *proposals* mean
something was built before the Assistant that writes into it, for the same
reason the fidelity gate came before the simulation: afterwards there is no
moment at which anybody goes back and adds the restraint.

The decision, put to the user and taken deliberately, is **proposals only,
never applied**. The reasoning is not squeamishness about models. The Imprint
is the record every figure in this platform derives from, so anything that can
edit it can edit the basis of every number the product will ever show — and no
amount of care in a prompt is a control. The control is that the write requires
a person with `manage_organisation` to press a button.

Enforced rather than intended: migration 32 attaches no trigger and no rewrite
rule that applies a proposal, and a test asserts exactly that by reading
`pg_trigger` and `pg_rewrite`. If it ever stops being true, that assertion is
what says so.

### Raising is not deciding

Raising a proposal needs only membership. It changes nothing, and a colleague
who spots a wrong figure should be able to say so without an administrator's
rights. Deciding needs `manage_organisation`. There is no delete policy: a
declined proposal is the record that somebody declined it, and removing it is
how the same argument gets had twice.

### "Accepted" has to mean the change happened

The easy version records the acceptance and leaves the writing to somebody,
which puts a green tick beside a field that never moved — the same class of
quiet untruth as a caveat one join away. So accepting writes, and a proposal
whose target the platform cannot write is refused *at the point of accepting*,
by name, rather than accepted and quietly ignored. Today that means Imprint
fields are applicable and nothing else is.

The write happens before the status changes. A proposal marked accepted whose
write then failed is the untruth this exists to prevent; a write that lands
while the status does not leaves the proposal visibly pending, which is
recoverable.

### A stale proposal is refused, not forced

If somebody answered the field after the suggestion was raised, accepting would
overwrite a person's answer with a model's suggestion and neither of them would
know. That is marked `superseded` with a reason, so the suggestion can be
re-argued against what the field says today rather than silently winning.

### And the brief's empty section is no longer empty

`open_items` reported itself empty with a reason from #74 onward because
proposals had no table. It now draws on them — the oldest cited, all of them
counted. What it still never does is invent something to put there: a brief
that manufactures an open item to avoid a gap has started lying about the quiet
weeks.

---

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
