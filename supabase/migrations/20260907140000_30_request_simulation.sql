-- ═══════════════════════════════════════════════════════════════════════════
-- 30. Asking for a run
-- ═══════════════════════════════════════════════════════════════════════════
--
-- #72 gave the Twin an engine, storage, a handler and a nightly tick. What it
-- did not give anybody was a way to ask. The only path into the queue was
-- 02:30 UTC, so a person who changed a lever waited until the following
-- morning to see what it did — which is not a studio, it is a subscription to
-- yesterday's answer.
--
-- ── why a function rather than a policy ───────────────────────────────────
--
-- job_runs has no write policy and should not get one. A queue a browser can
-- insert into directly is a queue anybody can fill with work of any kind, at
-- any priority, for any tenant they can name — the row-level check would have
-- to re-implement every rule about what a job may be, in a policy, where it
-- cannot be read beside the rules it enforces.
--
-- So the same shape complete_imprint uses: one definer function that knows
-- exactly which two jobs it is allowed to queue, and grants nothing else. It
-- is the second and last thing in this schema that may put work in the queue
-- on a person's behalf.
--
-- ── measure first, and only wait when there is something to wait for ──────
--
-- A simulation cannot be recorded without naming a fidelity measurement, so
-- this queues the measurement the same way the nightly tick does — same key,
-- so the two share one measurement per organisation per day rather than
-- racing.
--
-- If that measurement was already taken today the simulation starts now. If
-- this call is what queued it, the simulation waits ninety seconds. The delay
-- is slack rather than synchronisation: the measurement is one grouped query
-- and a pure function, and if it somehow has not finished the simulation
-- refuses with a named reason and nothing is lost. What it must never do is
-- assume a measurement probably exists.
--
-- ── once at a time, not once ever ─────────────────────────────────────────
--
-- The nightly tick uses dedupe_key: one run per scenario per night, ever.
-- That is right for a schedule and wrong for a person, who edits a multiplier
-- and asks again. This uses singleton_key instead — one run of a scenario in
-- flight at a time, and the next may be asked for the moment it lands.
--
-- Worth knowing while reading a re-run: the seed is fixed per scenario per
-- day, so asking twice on one day gives the same answer unless a lever
-- changed. That is deliberate. It means a difference between two runs is the
-- lever you moved rather than the dice, which is the only way a comparison
-- means anything.
--
-- Additive: one function. Nothing existing is altered.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.request_simulation(
  p_organisation uuid,
  p_scenario     uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_scenario_name text;
  v_measurement   uuid;
  v_simulation    uuid;
  v_night         text := to_char(now() at time zone 'utc', 'YYYY-MM-DD');
  v_delay         interval;
begin
  -- The same permission that lets somebody write a scenario. Reading a result
  -- needs only membership; spending a worker's time needs more.
  if not amryn.has_permission(p_organisation, 'manage_organisation') then
    raise exception 'only an administrator can run a scenario' using errcode = '42501';
  end if;

  -- The flag is checked here as well as at claim time. claim_jobs would refuse
  -- the work anyway, but a person pressing a button deserves to be told the
  -- Twin is off rather than to watch a job sit queued for ever.
  if not amryn.feature_enabled(p_organisation, 'digital_twin_simulation') then
    raise exception 'the Twin is not switched on for this organisation'
      using errcode = 'P0002';
  end if;

  select name into v_scenario_name
    from public.twin_scenarios
   where id = p_scenario and organisation_id = p_organisation;

  if v_scenario_name is null then
    raise exception 'that scenario does not belong to this organisation'
      using errcode = 'P0002';
  end if;

  /*
   * The measurement, on the nightly tick's key so the two cannot both take it.
   * `do nothing` returning no row means it was already queued or already run
   * today, which is the good case rather than a failure.
   */
  insert into public.job_runs (organisation_id, kind, payload, dedupe_key, priority, requested_by)
  values (p_organisation, 'twin.measure_fidelity', '{}'::jsonb,
          'twin-fidelity:' || p_organisation::text || ':' || v_night, 40, auth.uid())
  on conflict (dedupe_key) where dedupe_key is not null do nothing
  returning id into v_measurement;

  -- Only wait if this call is what started the measurement.
  v_delay := case when v_measurement is null then interval '0' else interval '90 seconds' end;

  insert into public.job_runs
    (organisation_id, kind, payload, singleton_key, priority, run_at, requested_by)
  values
    (p_organisation, 'twin.simulate',
     jsonb_build_object('scenario_id', p_scenario),
     'twin-simulate:' || p_scenario::text,
     50, now() + v_delay, auth.uid())
  on conflict (singleton_key)
    where singleton_key is not null and status in ('queued', 'running')
    do nothing
  returning id into v_simulation;

  if v_simulation is null then
    -- Already queued or running. Not an error: somebody pressed twice, or the
    -- nightly tick got there first, and either way the answer is on its way.
    return jsonb_build_object(
      'status', 'already_running',
      'scenario', v_scenario_name,
      'measurement_queued', v_measurement is not null,
      'starts_in_seconds', 0);
  end if;

  return jsonb_build_object(
    'status', 'queued',
    'scenario', v_scenario_name,
    'simulation_job', v_simulation,
    'measurement_queued', v_measurement is not null,
    'starts_in_seconds', extract(epoch from v_delay)::int);
end $$;

comment on function public.request_simulation is
  'Queues one scenario for the Twin, on a person''s behalf. The second and last thing that may write to job_runs from a session, and it can queue exactly two kinds of job.';

revoke all on function public.request_simulation(uuid, uuid) from public, anon;
grant execute on function public.request_simulation(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
