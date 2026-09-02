-- ── organisation bootstrap, made reachable ────────────────────────────────
--
-- Symptom this fixes, seen on the live deployment at /onboarding:
--
--   Could not find the function public.create_organisation(p_country_code,
--   p_currency_code, p_industry, p_name, p_slug) in the schema cache
--
-- PostgREST resolves a remote call against a cache of the schema, not against
-- the schema. Three separate things produce that one message, and the reader
-- cannot tell them apart:
--
--   1. The function is genuinely absent — migration 06 was never applied.
--   2. It exists, but PostgREST last built its cache before it did. Applying
--      migrations through the SQL editor does not reload that cache, so a
--      correct database serves a stale answer indefinitely.
--   3. It exists, but the caller's arguments cannot be coerced to its
--      parameter types, so no candidate matches.
--
-- This migration settles all three, and is safe to run whether or not 06 was.
--
-- On (3): the parameters were char(2) and char(3). A blank-padded fixed-width
-- type is a poor thing to expose over an interface that sends everything as
-- JSON text, and it buys nothing here — the columns are still char(2)/char(3)
-- with their own check constraints, so the storage guarantee is unchanged.
-- The parameters become text, and the function validates them itself so a bad
-- value is a sentence rather than a silent truncation.
--
-- A type change cannot be made with `create or replace`: Postgres treats a
-- different parameter type as a different function and would leave both in
-- place. Two candidates with identical argument names is worse than none —
-- PostgREST then fails as ambiguous. So both signatures are dropped first.

drop function if exists public.create_organisation(text, text, text, char, char);
drop function if exists public.create_organisation(text, text, text, text, text);

create function public.create_organisation(
  p_name text,
  p_slug text,
  p_industry text default null,
  p_country_code text default 'ZA',
  p_currency_code text default 'ZAR'
)
returns uuid
language plpgsql
security definer
-- SECURITY DEFINER because the caller is not yet a member of the organisation
-- whose rows are being written. search_path is pinned so the elevated body
-- cannot be redirected to a caller-controlled schema.
set search_path = public, pg_temp
as $$
declare
  new_org  uuid;
  uid      uuid := auth.uid();
  country  text := upper(btrim(coalesce(p_country_code, 'ZA')));
  currency text := upper(btrim(coalesce(p_currency_code, 'ZAR')));
begin
  if uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- Validated here rather than left to the column cast. char(2) silently
  -- truncates anything longer, so 'ZAF' would have been stored as 'ZA' and
  -- nobody would have been told.
  if length(country) <> 2 then
    raise exception 'country code must be two letters, got %', country
      using errcode = '22023';
  end if;

  if length(currency) <> 3 then
    raise exception 'currency code must be three letters, got %', currency
      using errcode = '22023';
  end if;

  insert into public.organisations (name, slug, industry, country_code, currency_code)
  values (p_name, lower(p_slug), p_industry, country, currency)
  returning id into new_org;

  insert into public.organisation_members (organisation_id, user_id, role, status, scope_kind)
  values (new_org, uid, 'org_admin', 'active', 'organisation');

  insert into public.subscriptions (organisation_id, plan, status, trial_ends_at)
  values (new_org, 'starter', 'trialing', now() + interval '30 days');

  insert into public.health_score_weights (organisation_id, category, weight) values
    (new_org, 'financial',   0.25),
    (new_org, 'operational', 0.20),
    (new_org, 'sales',       0.20),
    (new_org, 'growth',      0.15),
    (new_org, 'customer',    0.10),
    (new_org, 'strategic',   0.10);

  insert into public.opportunity_score_weights (organisation_id) values (new_org);

  insert into public.audit_logs (organisation_id, actor_id, action, entity_type, entity_id, summary)
  values (new_org, uid, 'organisation.created', 'organisation', new_org::text, p_name);

  return new_org;
end;
$$;

-- anon must never reach this: it writes an organisation and an admin
-- membership, and it runs as its owner.
revoke all on function public.create_organisation(text, text, text, text, text) from public, anon;
grant execute on function public.create_organisation(text, text, text, text, text) to authenticated;

-- Cause (2). Without this the function above exists and stays invisible over
-- the API until something else happens to reload the cache.
notify pgrst, 'reload schema';
