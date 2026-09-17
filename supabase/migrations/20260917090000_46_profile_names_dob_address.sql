-- ═══════════════════════════════════════════════════════════════════════════
-- 46 — a name in two parts, a birthday, and where the business is
--
-- Three additions, all optional, none destructive. No table is created, no
-- column is dropped, no policy is rewritten.
--
--   user_profiles.first_name, .last_name   so somebody can be greeted
--   user_profiles.date_of_birth            so a birthday can be noticed
--   organisations.address_line1 …          where the business actually is
--
-- ── why full_name stays, and is not replaced by a generated column ────────
-- The obvious shape is `full_name generated always as (first || ' ' || last)`.
-- It cannot be done here without losing data: full_name already exists and
-- already holds every name in the product, and Postgres cannot convert a
-- populated ordinary column into a generated one — it has to be dropped and
-- re-added. Dropping a column holding client data is exactly what this
-- project's migration rule forbids.
--
-- So full_name remains an ordinary column and a trigger keeps it in step. That
-- also solves a second problem a generated column would have created:
-- amryn.handle_new_user (migration 10) writes full_name straight from the
-- sign-up metadata and knows nothing about the two new columns. A generated
-- column would have made that insert fail. The trigger instead splits what it
-- wrote, so a new account arrives with all three columns populated and nothing
-- upstream has to change.
--
-- ── on the date of birth ──────────────────────────────────────────────────
-- Nullable, with no default, and nothing in the product requires it. It is
-- collected for one stated purpose — a birthday greeting — and POPIA makes
-- that promise binding: it is not used to segment, to price, or to verify
-- anybody's age. The column comment says so, because the schema is where
-- somebody looks when the interface copy has long since been rewritten.
--
-- ── on the address ────────────────────────────────────────────────────────
-- On the organisation, not the person: this is where the business trades, and
-- every member of that business shares it. South African shape — a suburb
-- line, a city, a province and a four-digit postal code.
--
-- country_code is deliberately NOT added: organisations has carried one since
-- migration 01, defaulting to ZA. A second country column would have been two
-- answers to one question.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. the name, in two parts ─────────────────────────────────────────────
alter table public.user_profiles
  add column if not exists first_name text,
  add column if not exists last_name  text;

comment on column public.user_profiles.first_name is
  'Given name. What the product greets somebody by. Kept in step with full_name by amryn.sync_profile_name.';
comment on column public.user_profiles.last_name is
  'Family name. Optional: one name is a whole name in plenty of places.';

-- ── 2. the birthday ───────────────────────────────────────────────────────
alter table public.user_profiles
  add column if not exists date_of_birth date;

comment on column public.user_profiles.date_of_birth is
  'Optional, and collected for one purpose only: a birthday greeting on the day. Never used to segment, price, or verify age. Nothing in the product requires it and it can be cleared at any time (POPIA).';

-- ── 3. where the business is ──────────────────────────────────────────────
alter table public.organisations
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists city          text,
  add column if not exists province      text,
  add column if not exists postal_code   text;

comment on column public.organisations.address_line1 is 'Street address.';
comment on column public.organisations.address_line2 is 'Suburb, or a second line where there is one.';
comment on column public.organisations.province is
  'South African province, held as text rather than an enum: an organisation outside South Africa has a state or a county, and country_code already says which country this is.';

-- ── 4. keeping the three name columns telling one story ───────────────────
--
-- Whichever side is written, the other follows:
--
--   first/last given  → full_name is rebuilt from them (they are the truth)
--   only full_name    → split on the first space, best effort
--
-- Best effort is the honest description. "Anna-Marie van der Merwe" splits
-- into "Anna-Marie" and "van der Merwe", which is right; plenty of names in
-- the world do not work that way, which is why both halves stay editable by
-- hand afterwards and nothing here overwrites a value somebody has set.
create or replace function amryn.sync_profile_name()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  whole text;
begin
  if (new.first_name is not null or new.last_name is not null)
     and (tg_op = 'INSERT'
          or new.first_name is distinct from old.first_name
          or new.last_name  is distinct from old.last_name) then
    new.full_name := nullif(
      btrim(concat_ws(' ',
        nullif(btrim(new.first_name), ''),
        nullif(btrim(new.last_name), ''))),
      '');

  -- Deliberately not "and full_name changed": the backfill at the end of this
  -- migration rewrites full_name to itself, which is not a change, and the
  -- rows it exists for are exactly the ones with neither part set. Testing the
  -- parts rather than the change also makes it idempotent — once first_name is
  -- populated this branch never fires again.
  elsif new.full_name is not null
     and new.first_name is null
     and new.last_name is null then
    whole := btrim(new.full_name);
    if position(' ' in whole) > 0 then
      new.first_name := split_part(whole, ' ', 1);
      new.last_name  := nullif(btrim(substr(whole, position(' ' in whole) + 1)), '');
    else
      new.first_name := nullif(whole, '');
    end if;
  end if;

  return new;
end;
$$;

comment on function amryn.sync_profile_name() is
  'Keeps first_name, last_name and full_name agreeing with each other, whichever one was written.';

drop trigger if exists user_profiles_sync_name on public.user_profiles;
create trigger user_profiles_sync_name
  before insert or update on public.user_profiles
  for each row execute function amryn.sync_profile_name();

-- ── 5. the backfill ───────────────────────────────────────────────────────
--
-- Only rows that have a full name and neither part of one, so this cannot
-- overwrite anything and is safe to run again. The trigger above does the
-- splitting, so the rule lives in exactly one place.
update public.user_profiles
   set full_name = full_name
 where full_name is not null
   and first_name is null
   and last_name is null;
