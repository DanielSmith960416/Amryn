-- ═══════════════════════════════════════════════════════════════════════════
-- 32. Proposals: what the Assistant may write, and what it may not
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Change 6 lets the Assistant "adjust Twin parameters as proposals, fill
-- Imprint fields, and run scenarios". This is the table that makes the word
-- "proposals" mean something, and it comes before the Assistant that writes
-- into it for the same reason the fidelity gate came before the simulation:
-- afterwards there is no moment at which anybody goes back and adds the
-- restraint.
--
-- ── nothing here is applied by anything ───────────────────────────────────
--
-- A proposal changes nothing. It records that something was suggested, what it
-- would change, from what to what, and why. A person accepts it, and the
-- accepting is what writes — through the ordinary path, with the ordinary
-- permission, leaving the ordinary audit row.
--
-- That is a product decision rather than a technical one, and it is the whole
-- point: the Imprint is the record every figure in this platform derives from.
-- A model that can edit it can edit the basis of every number the platform
-- will ever show, and no amount of care in a prompt is a control. The control
-- is that the write requires a person.
--
-- ── a proposal cites, like everything else here ───────────────────────────
--
-- rationale is `not null` and non-empty. A suggestion with no stated reason is
-- one a reader can only accept on trust, and this platform's entire claim is
-- that it explains rather than asserts. Fourth or fifth time this argument has
-- produced a column rather than a convention, and it has not got weaker.
--
-- ── why status is not just a boolean ──────────────────────────────────────
--
-- 'declined' has to be distinguishable from 'still waiting', or the same
-- suggestion is made again next week and the person who already said no says
-- it again. 'superseded' exists because the underlying figure moves: a
-- proposal to change a value that has since changed by other means is not
-- something to accept or decline, it is something that stopped applying.
--
-- Additive: one enum, one table. Nothing existing is altered.
-- ═══════════════════════════════════════════════════════════════════════════

create type public.proposal_status as enum (
  'pending',     -- waiting for a person
  'accepted',    -- a person applied it
  'declined',    -- a person said no; do not raise it again
  'superseded'   -- the thing it referred to moved on
);

comment on type public.proposal_status is
  'Declined is deliberately distinct from pending: without it the same suggestion is put to somebody who has already refused it.';

create table public.proposals (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations (id) on delete cascade,

  /*
   * What it wants to change, as a table and a column and a row.
   *
   * Text rather than an enum, for the reason analysis_runs.trigger is text:
   * the set of things worth proposing will grow, and a migration per kind is a
   * tax on exactly the additions this exists for. The application decides what
   * it knows how to apply; anything else stays pending and is visible as
   * something nobody can action, which is the honest state.
   */
  target_table     text not null check (target_table <> ''),
  target_id        uuid,
  target_field     text not null check (target_field <> ''),

  /*
   * From what, to what — both as text, because a proposal spans a numeric Twin
   * multiplier and a free-text Imprint answer and must render the same either
   * way. current_value is null when the field is genuinely empty, which is the
   * commonest case for an Imprint gap and is not the same as an empty string.
   */
  current_value    text,
  proposed_value   text not null,

  -- Never optional. See the note at the top.
  rationale        text not null check (rationale <> ''),

  -- Where it came from: the conversation, so a reader can go and see what was
  -- being discussed when this was suggested.
  conversation_id  uuid references public.ai_conversations (id) on delete set null,

  status           public.proposal_status not null default 'pending',

  proposed_by      uuid references auth.users (id) on delete set null,
  decided_by       uuid references auth.users (id) on delete set null,
  decided_at       timestamptz,
  -- Why it was declined, for the person who wonders in six months.
  decision_note    text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- A decision has a time and a time has a decision. A row that says
  -- 'declined' with no moment attached cannot be ordered against anything.
  constraint decided_carries_a_time
    check ((status in ('accepted','declined','superseded')) = (decided_at is not null)),

  -- The same suggestion, once, while it is waiting. A second identical
  -- proposal is not new information, and two of them in a list is how a person
  -- learns to stop reading the list.
  constraint proposal_moves_something
    check (current_value is distinct from proposed_value)
);

comment on table public.proposals is
  'Something the platform suggests changing, waiting on a person. Nothing applies one automatically: the Imprint is what every figure derives from, and the control on a model editing it is that the write requires a human, not that the prompt asks nicely.';
comment on column public.proposals.rationale is
  'Required. A suggestion with no stated reason can only be accepted on trust, which is the opposite of what this platform claims to do.';
comment on column public.proposals.current_value is
  'Null means the field is empty — the ordinary case for an Imprint gap, and not the same as an empty string.';

create unique index proposals_one_pending_per_field
  on public.proposals (organisation_id, target_table, target_field, coalesce(target_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'pending';

create index proposals_org_idx
  on public.proposals (organisation_id, status, created_at desc);
create index proposals_conversation_idx
  on public.proposals (conversation_id) where conversation_id is not null;
create index proposals_proposed_by_idx
  on public.proposals (proposed_by) where proposed_by is not null;
create index proposals_decided_by_idx
  on public.proposals (decided_by) where decided_by is not null;

create trigger proposals_touch
  before update on public.proposals
  for each row execute function amryn.touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- Who may see one, raise one, and decide one
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Reading is membership: a proposal is a thing about the business and everyone
-- who can see the business can see what has been suggested about it.
--
-- Raising one needs only membership too, and that is deliberate. A proposal
-- changes nothing, and a colleague who spots a wrong figure should be able to
-- say so without an administrator's rights. What needs the rights is deciding.
--
-- There is no delete policy. A proposal that was declined is a record that it
-- was declined, and removing it is how the same argument gets had twice.

alter table public.proposals enable row level security;
alter table public.proposals force  row level security;

create policy proposals_read on public.proposals
  for select using (amryn.is_member(organisation_id));

create policy proposals_raise on public.proposals
  for insert with check (amryn.is_member(organisation_id));

create policy proposals_decide on public.proposals
  for update using (amryn.has_permission(organisation_id, 'manage_organisation'))
  with check (amryn.has_permission(organisation_id, 'manage_organisation'));

grant select, insert, update on public.proposals to authenticated;

create trigger proposals_refuse_lapsed
  before insert or update on public.proposals
  for each row execute function amryn.refuse_lapsed_write();

-- ═══════════════════════════════════════════════════════════════════════════
-- The switch
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.feature_flags (key, name, description) values
  ('assistant_proposals',
   'Assistant may raise proposals',
   'Whether the Assistant may suggest changes to the Imprint and the Twin. Off means it answers questions and suggests nothing. It can never apply a change either way — accepting is a person''s action.')
on conflict (key) do nothing;

notify pgrst, 'reload schema';
