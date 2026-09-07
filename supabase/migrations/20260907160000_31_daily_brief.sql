-- ═══════════════════════════════════════════════════════════════════════════
-- 31. The Daily Intelligence Brief
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Five sections, at most five items, every one of them pointing at the row it
-- came from.
--
-- ── the gate is a foreign-key-shaped thing, not a habit ───────────────────
--
-- "Every item traceable to its source record" is the requirement, and the only
-- version of that which survives contact with a busy morning is one the
-- database enforces. So source_table and source_id are both `not null`. An
-- item that cannot name the row it came from cannot be written at all.
--
-- This is the fourth time this schema has taken that shape and the reasoning
-- has not changed: provenance made "where did this come from" unforgeable,
-- is_provisional made "how much do we believe it" unforgeable, fidelity_id
-- made "has this model ever been right" unforgeable. Each could have been a
-- sentence in a narrative. Each is a column.
--
-- source_table is text rather than an enum, for the reason analysis_runs.trigger
-- is: the set of things a brief may cite will grow with the product, and a
-- migration per source is a tax on exactly the additions this is for.
--
-- ── at most five, and the cap is structural ───────────────────────────────
--
-- rank between 1 and 5, unique per brief. Two constraints that together make
-- six items impossible rather than discouraged — a brief that quietly grew to
-- eleven items on a bad week is a brief nobody finishes reading, and "maximum
-- five, ranked by impact" enforced only in the generator is a comment.
--
-- ── the licence rule reaches here too ─────────────────────────────────────
--
-- #70 required a figure with provenance 'simulated' to name the fidelity
-- measurement standing behind it, because a confidence interval reads as more
-- trustworthy than a single number whether or not the model has ever been
-- right. A brief is read by more people than any screen in the product and is
-- forwarded by email, so the rule applies here more than anywhere: a simulated
-- figure in a brief must carry its licence on the row, not one join away
-- through the source it cites.
--
-- Additive: one enum, two tables, one flag. Nothing existing is altered.
-- ═══════════════════════════════════════════════════════════════════════════

create type public.brief_section as enum (
  'yesterday',    -- real performance against what the Twin predicted
  'today',        -- the single action that matters most
  'radar',        -- external signal seen since the last brief
  'open_items',   -- proposals awaiting the reader's verification
  'trajectory'    -- progress against what the Intent layer said they wanted
);

comment on type public.brief_section is
  'The five things a morning brief answers. Ordered as a reader works through them: what happened, what to do, what changed outside, what is waiting on me, and am I getting there.';

-- ═══════════════════════════════════════════════════════════════════════════

create table public.daily_briefs (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations (id) on delete cascade,

  -- The morning this brief is for, not the moment it was composed. A job that
  -- runs late still produces Tuesday's brief.
  brief_date       date not null,

  job_id           uuid references public.job_runs (id) on delete set null,

  item_count       integer not null default 0 check (item_count between 0 and 5),

  /*
   * What was looked at and found nothing, as opposed to not looked at.
   *
   * A brief with three items might have had two empty sections or two sections
   * nobody ran. Those are different, and a reader will assume the first — so
   * the sections that produced nothing are named, with why.
   */
  empty_sections   jsonb not null default '[]'::jsonb,

  -- Delivery. Both null means it has not been attempted; one or the other, not
  -- both, once it has.
  emailed_at       timestamptz,
  email_skipped    text,

  generated_at     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint one_brief_per_morning unique (organisation_id, brief_date),
  constraint delivery_is_one_thing_or_the_other
    check (emailed_at is null or email_skipped is null)
);

comment on table public.daily_briefs is
  'One morning''s brief for one organisation. Dated by the morning it is for rather than the moment it was composed, so a job that runs late still produces the right day''s brief.';
comment on column public.daily_briefs.empty_sections is
  'Sections that ran and found nothing, with the reason. Without it a short brief and an unfinished one look identical.';

create index daily_briefs_org_idx
  on public.daily_briefs (organisation_id, brief_date desc);
create index daily_briefs_job_idx
  on public.daily_briefs (job_id) where job_id is not null;

create trigger daily_briefs_touch
  before update on public.daily_briefs
  for each row execute function amryn.touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════

create table public.brief_items (
  id               uuid primary key default gen_random_uuid(),
  brief_id         uuid not null references public.daily_briefs (id) on delete cascade,
  organisation_id  uuid not null references public.organisations (id) on delete cascade,

  section          public.brief_section not null,

  -- 1 is the most important thing on the page. See the note at the top for why
  -- the ceiling is a constraint rather than a convention.
  rank             smallint not null check (rank between 1 and 5),

  headline         text not null check (headline <> ''),
  detail           text not null check (detail <> ''),

  -- What it is worth, where that can honestly be said. Null is a real answer:
  -- a signal on the radar has no rand figure and inventing one would be the
  -- exact failure the provenance column exists to prevent.
  impact_cents     bigint,

  provenance       public.provenance not null,

  /*
   * The gate. Both not null, so an item that cannot name the row it came from
   * cannot exist.
   *
   * For an item comparing an aggregate against a prediction, the cited row is
   * the prediction — a real row with an id — and the aggregate beside it is
   * marked 'derived'. That is the honest reading: the aggregate has no single
   * record to point at, and pretending otherwise would be a citation that
   * resolves to nothing.
   */
  source_table     text not null check (source_table <> ''),
  source_id        uuid not null,

  -- #70's rule, on the table a brief is read from and forwarded out of.
  fidelity_id      uuid references public.twin_fidelity (id) on delete restrict,

  created_at       timestamptz not null default now(),

  constraint one_item_per_rank unique (brief_id, rank),
  constraint simulated_figure_is_licensed
    check (provenance <> 'simulated' or fidelity_id is not null)
);

comment on table public.brief_items is
  'One line in a morning brief. source_table and source_id are both required: an item that cannot name the record it came from is an assertion, and a brief of assertions is a newsletter.';
comment on column public.brief_items.rank is
  '1 is the most important thing on the page. Unique per brief and capped at five, so a brief nobody finishes reading is not a state that can exist.';
comment on column public.brief_items.impact_cents is
  'Null is a real answer. A radar signal has no rand figure, and inventing one is the failure provenance exists to prevent.';

create index brief_items_brief_idx
  on public.brief_items (brief_id, rank);
create index brief_items_org_idx
  on public.brief_items (organisation_id, created_at desc);
create index brief_items_fidelity_idx
  on public.brief_items (fidelity_id) where fidelity_id is not null;
-- Reading back the other way: "what has this recommendation appeared in?"
create index brief_items_source_idx
  on public.brief_items (source_table, source_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- Who may see one
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Readable by the organisation, writable by nobody through PostgREST. The
-- worker composes briefs over a direct connection; a browser has no business
-- editing what a brief said it found.

alter table public.daily_briefs enable row level security;
alter table public.daily_briefs force  row level security;
alter table public.brief_items  enable row level security;
alter table public.brief_items  force  row level security;

create policy daily_briefs_read on public.daily_briefs
  for select using (amryn.is_member(organisation_id));

create policy brief_items_read on public.brief_items
  for select using (amryn.is_member(organisation_id));

grant select on public.daily_briefs to authenticated;
grant select on public.brief_items  to authenticated;

create trigger daily_briefs_refuse_lapsed
  before insert or update on public.daily_briefs
  for each row execute function amryn.refuse_lapsed_write();
create trigger brief_items_refuse_lapsed
  before insert or update on public.brief_items
  for each row execute function amryn.refuse_lapsed_write();

-- ═══════════════════════════════════════════════════════════════════════════
-- The switch
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.feature_flags (key, name, description) values
  ('daily_brief',
   'Daily Intelligence Brief',
   'Whether a brief is composed each morning for this organisation and, where mail is configured, emailed. Off means no brief is composed, so nothing accumulates for an organisation nobody is reading it for.')
on conflict (key) do nothing;

notify pgrst, 'reload schema';
