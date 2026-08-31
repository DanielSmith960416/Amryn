-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ AIGrowthIntelligence® Software
-- Migration 12 — Rate limiting
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sign-in, sign-up, organisation creation and invitations had no limit on how
-- often they could be attempted. That is a credential-stuffing surface on the
-- first two and, on the last, a way for one administrator to issue unbounded
-- invitations.
--
-- In the database rather than in memory, because the application runs as
-- serverless functions: an in-memory counter is per-instance, resets whenever
-- one is recycled, and counts nothing at all once there is more than one.
--
-- ── what is stored ────────────────────────────────────────────────────────
-- Only a hash. The thing being limited is an email address or an IP address,
-- and both are personal information under POPIA — keeping either in readable
-- form would mean a table of who tried to sign in and from where, retained for
-- no purpose the person consented to. A SHA-256 of the identifier answers
-- "has this one been seen too often" without recording whose it is.

create table public.rate_limits (
  -- The hash is the identity of the bucket; there is nothing else to key on.
  bucket      text primary key,
  attempts    integer not null default 0,
  -- When the current window began. A window is a fixed period from the first
  -- attempt, not a sliding one: simpler to reason about, and the difference
  -- does not matter at the resolution of a login form.
  window_start timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index rate_limits_window_start on public.rate_limits (window_start);

-- Locked down completely. Nothing reads or writes this except the function
-- below, which runs as its owner: the counts are not the application's
-- business, and a client that could read them could enumerate activity.
alter table public.rate_limits enable row level security;
alter table public.rate_limits force row level security;
revoke all on public.rate_limits from public, anon, authenticated;

-- ── the check ─────────────────────────────────────────────────────────────
--
-- Returns true when the attempt is allowed. Atomic: the insert-on-conflict is
-- a single statement, so two requests arriving together cannot both read a
-- count of four and both decide they are the fifth.
--
-- Callable by anon, because sign-in and sign-up are attempted before anyone is
-- authenticated. It takes an already-hashed key, so the raw address never
-- travels to the database and never appears in a query log.
create or replace function public.check_rate_limit(
  p_bucket   text,
  p_max      integer,
  p_window   interval
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_attempts integer;
begin
  if p_bucket is null or length(p_bucket) = 0 then
    -- Nothing to key on. Allowing it is the right failure: a rate limiter that
    -- refuses when it cannot identify the caller locks everyone out.
    return true;
  end if;

  insert into public.rate_limits (bucket, attempts, window_start, updated_at)
  values (p_bucket, 1, now(), now())
  on conflict (bucket) do update
    set
      -- Past the window, the count starts again rather than accumulating
      -- forever.
      attempts = case
        when public.rate_limits.window_start < now() - p_window then 1
        else public.rate_limits.attempts + 1
      end,
      window_start = case
        when public.rate_limits.window_start < now() - p_window then now()
        else public.rate_limits.window_start
      end,
      updated_at = now()
  returning attempts into current_attempts;

  return current_attempts <= p_max;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, interval) from public;
grant execute on function public.check_rate_limit(text, integer, interval) to anon, authenticated;

-- ── housekeeping ──────────────────────────────────────────────────────────
--
-- Rows outlive their usefulness the moment their window closes. Keeping them
-- would turn a counter into a log of attempts, which is the thing this table
-- was designed not to be.
create or replace function public.prune_rate_limits()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removed integer;
begin
  delete from public.rate_limits where window_start < now() - interval '1 day';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.prune_rate_limits() from public, anon, authenticated;

notify pgrst, 'reload schema';
