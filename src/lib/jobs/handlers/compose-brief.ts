import { SECTIONS, compose, type BriefItem, type Candidate, type EmptySection } from '@/features/brief/compose';
import { renderBriefEmail } from '@/features/brief/email';
import { isEmailConfigured, sendMail } from '@/lib/email/transport';
import type { JobHandler } from '../types';

/**
 * Composes one morning's brief for one organisation.
 *
 * The ranking, the ceiling and the citation rule live in features/brief/compose.ts,
 * which has no database. This reads the rows, hands them over, and writes what
 * comes back.
 *
 * ── every candidate names a row, and the type will not let it not ─────────
 *
 * Each gather function below returns Candidates, and a Candidate without a
 * sourceTable and sourceId does not compile. The database refuses one too. Two
 * enforcements of one rule, because the requirement — "every item traceable to
 * its source record" — is the entire difference between a brief and a
 * newsletter, and a rule enforced in one place is a rule that holds until
 * somebody adds a sixth section in a hurry.
 *
 * ── the section that is deliberately empty ────────────────────────────────
 *
 * 'open_items' is proposals awaiting the reader's verification. Proposals do
 * not exist yet — they arrive with the Assistant — so this reports the section
 * as empty with a reason naming what is missing, rather than omitting it. A
 * section nobody built and a section that found nothing look identical to a
 * reader, and only one of them is worth mentioning to us.
 */
export const composeBrief: JobHandler = {
  kind: 'brief.compose',
  description: "Composes one organisation's morning brief and records what each item came from.",
  leaseSeconds: 180,

  async run({ job, query, log }) {
    if (!job.organisationId) {
      throw new Error('brief.compose is tenant work and was queued without an organisation');
    }

    const org = job.organisationId;
    // The morning this brief is for. Payload wins so a re-run can rebuild a
    // named day rather than always producing today's.
    const briefDate =
      typeof job.payload.brief_date === 'string'
        ? job.payload.brief_date
        : new Date().toISOString().slice(0, 10);

    const previous = await query<{ brief_date: string }>(
      `select brief_date::text from public.daily_briefs
        where organisation_id = $1 and brief_date < $2
        order by brief_date desc limit 1`,
      [org, briefDate],
    );
    // "Since the last brief", or since yesterday if this is the first one.
    // Never "since forever": a first brief listing every signal ever seen is
    // one nobody reads, and the second would then look empty by comparison.
    const since = previous[0]?.brief_date ?? dayBefore(briefDate);

    const candidates: Candidate[] = [
      ...(await yesterday(query, org, briefDate)),
      ...(await today(query, org)),
      ...(await radar(query, org, since)),
      ...(await trajectory(query, org)),
    ];

    // Everything except open_items, which nothing looked at — see the note above.
    const ran = SECTIONS.filter((section) => section !== 'open_items');
    const brief = compose(candidates, ran);

    const empty: EmptySection[] = [
      ...brief.empty,
      {
        section: 'open_items',
        reason:
          'Nothing is waiting on you. Proposals arrive with the Assistant; until then this section has nothing to draw on.',
      },
    ];

    const inserted = await query<{ id: string }>(
      `insert into public.daily_briefs
         (organisation_id, brief_date, job_id, item_count, empty_sections)
       values ($1, $2, $3, $4, $5::jsonb)
       on conflict (organisation_id, brief_date) do update
         set job_id = excluded.job_id,
             item_count = excluded.item_count,
             empty_sections = excluded.empty_sections,
             generated_at = now()
       returning id`,
      [org, briefDate, job.id, brief.items.length, JSON.stringify(empty)],
    );

    const briefId = inserted[0]!.id;

    // A re-run replaces the day's items rather than appending to them. The
    // rank uniqueness would refuse the second set anyway; deleting first makes
    // a rebuild work instead of failing halfway.
    await query('delete from public.brief_items where brief_id = $1', [briefId]);

    for (const item of brief.items) {
      await query(
        `insert into public.brief_items
           (brief_id, organisation_id, section, rank, headline, detail,
            impact_cents, provenance, source_table, source_id, fidelity_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          briefId,
          org,
          item.section,
          item.rank,
          item.headline,
          item.detail,
          item.impactCents,
          item.provenance,
          item.sourceTable,
          item.sourceId,
          item.fidelityId ?? null,
        ],
      );
    }

    const delivery = await deliver(query, org, briefId, briefDate, brief.items, empty);

    log(
      `${briefDate}: ${brief.items.length} item${brief.items.length === 1 ? '' : 's'}` +
        (empty.length > 0 ? `, ${empty.length} section${empty.length === 1 ? '' : 's'} with nothing to say` : '') +
        ` — ${delivery}`,
    );

    return {
      briefId,
      briefDate,
      items: brief.items.length,
      empty: empty.map((e) => e.section),
      delivery,
    };
  },
};

/* ── delivery ──────────────────────────────────────────────────────────── */

/**
 * Emails the brief, or records why it did not.
 *
 * Never throws. A brief that was composed is composed whether or not the
 * message describing it arrives, and losing the record to a mail failure would
 * be the tail wagging the dog — the same argument sendMail() already makes for
 * invitations.
 *
 * The outcome is written to the row either way, because "emailed" and "we
 * never tried" are different facts and a null in both columns means neither
 * has happened yet.
 */
async function deliver(
  query: Query,
  org: string,
  briefId: string,
  briefDate: string,
  items: readonly BriefItem[],
  empty: readonly EmptySection[],
): Promise<string> {
  if (!isEmailConfigured()) {
    await query(
      'update public.daily_briefs set email_skipped = $2 where id = $1',
      [briefId, 'No mail is configured for the worker, so the brief is in-app only.'],
    );
    return 'not emailed (no mail configured)';
  }

  const rows = await query<{ name: string; email: string }>(
    /*
     * Everyone who could open the brief in the product, and nobody else.
     *
     * Resolved through the permission catalogue rather than by naming roles,
     * so a permission granted to a new role reaches the mailing list without
     * anybody remembering this query exists. Per-member overrides count too: a
     * viewer specifically granted the permission gets the brief, and an analyst
     * specifically denied it does not.
     *
     * Spelled out rather than calling amryn.has_permission(), which resolves
     * the *current session's* user through auth.uid(). The worker has no
     * session, so it would answer for nobody. This mirrors resolvePermissions()
     * in lib/auth/session.ts; if the two ever disagree the database is right,
     * and the worst outcome is somebody getting a brief they can also open.
     */
    `select o.name, u.email
       from public.organisation_members m
       join public.organisations o on o.id = m.organisation_id
       join auth.users u on u.id = m.user_id
      where m.organisation_id = $1
        and m.status = 'active'
        and u.email is not null
        and coalesce(
              (select ov.granted
                 from public.member_permission_overrides ov
                where ov.member_id = m.id
                  and ov.permission_key = 'view_intelligence'),
              exists (select 1
                        from public.role_permissions rp
                       where rp.role = m.role
                         and rp.permission_key = 'view_intelligence'))`,
    [org],
  );

  if (rows.length === 0) {
    await query(
      'update public.daily_briefs set email_skipped = $2 where id = $1',
      [briefId, 'Nobody in this organisation both has an email address and may read the brief.'],
    );
    return 'not emailed (no recipients)';
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
  const message = renderBriefEmail({
    organisationName: rows[0]!.name,
    briefDate,
    items,
    empty,
    url: site ? `${site}/brief` : undefined,
  });

  let sent = 0;
  const problems: string[] = [];
  for (const recipient of rows) {
    const result = await sendMail({ to: recipient.email, ...message });
    if (result.ok) sent += 1;
    else if (result.problem) problems.push(result.problem);
  }

  if (sent > 0) {
    await query('update public.daily_briefs set emailed_at = now() where id = $1', [briefId]);
    return `emailed to ${sent} of ${rows.length}`;
  }

  await query(
    'update public.daily_briefs set email_skipped = $2 where id = $1',
    [briefId, problems[0] ?? 'The mail server refused every recipient.'],
  );
  return 'not emailed (the mail server refused)';
}

/* ── the sections ──────────────────────────────────────────────────────── */

type Query = <T = Record<string, unknown>>(sql: string, values?: readonly unknown[]) => Promise<T[]>;

/**
 * Yesterday: what the business actually did, against what the Twin said it would.
 *
 * The cited row is the prediction, because that is the row with an id. The
 * actual is an aggregate over many financial records and has none — so it is
 * reported beside the prediction rather than cited, and the item is marked
 * 'simulated' because the comparison only exists because a simulation did.
 *
 * The fidelity measurement comes along for the ride: twin_simulations cannot
 * exist without one, so the licence is always available here.
 */
async function yesterday(query: Query, org: string, briefDate: string): Promise<Candidate[]> {
  const rows = await query<{
    id: string;
    fidelity_id: string;
    horizon_days: number;
    revenue_p10_cents: string;
    revenue_p50_cents: string;
    revenue_p90_cents: string;
    ran_at: string;
  }>(
    // ran_at::text, because the driver hands back a Date for timestamptz and
    // everything downstream here treats it as the day it happened. The other
    // date columns in this file are cast for the same reason.
    `select id, fidelity_id, horizon_days,
            revenue_p10_cents, revenue_p50_cents, revenue_p90_cents,
            ran_at::text as ran_at
       from public.twin_simulations
      where organisation_id = $1
      order by ran_at desc limit 1`,
    [org],
  );

  const run = rows[0];
  if (!run) return [];

  const actual = await query<{ cents: string | null }>(
    `select coalesce(sum(amount_cents), 0)::text as cents
       from public.financial_records
      where organisation_id = $1
        and direction = 'income'
        and occurred_on >= $2::date - 1
        and occurred_on <  $2::date`,
    [org, briefDate],
  );

  const takings = Number(actual[0]?.cents ?? 0);

  // The run covers a horizon; a day of it is the run divided by its days. Crude
  // and stated as such — the alternative is comparing a day against a quarter
  // and calling the difference a variance.
  const expectedPerDay = Number(run.revenue_p50_cents) / Math.max(1, run.horizon_days);
  const variance = takings - expectedPerDay;

  const low = Number(run.revenue_p10_cents) / Math.max(1, run.horizon_days);
  const high = Number(run.revenue_p90_cents) / Math.max(1, run.horizon_days);
  const insideRange = takings >= low && takings <= high;

  return [
    {
      section: 'yesterday',
      headline: insideRange
        ? `Yesterday came in where the Twin expected — ${rands(takings)}`
        : `Yesterday was ${rands(Math.abs(variance))} ${variance < 0 ? 'below' : 'above'} what the Twin expected`,
      detail:
        `Takings of ${rands(takings)} against a middle expectation of ${rands(expectedPerDay)} a day ` +
        `(${rands(low)} to ${rands(high)}), from the simulation run on ${run.ran_at.slice(0, 10)} ` +
        `over ${run.horizon_days} days. ` +
        (insideRange
          ? 'Inside the range the model gave, so nothing here needs explaining.'
          : 'Outside the range the model gave, which is worth a reason.'),
      impactCents: Math.round(variance),
      provenance: 'simulated',
      sourceTable: 'twin_simulations',
      sourceId: run.id,
      fidelityId: run.fidelity_id,
    },
  ];
}

/**
 * Today: the one action that matters most, with the reason and the effect.
 *
 * One, not three. The brief's requirement is "the single action that matters
 * most" and a list of five actions is a list nobody starts.
 */
async function today(query: Query, org: string): Promise<Candidate[]> {
  const rows = await query<{
    id: string;
    title: string;
    why_it_matters: string;
    recommended_action: string;
    impact_cents: string | null;
    impact_note: string | null;
    is_provisional: boolean;
  }>(
    `select id, title, why_it_matters, recommended_action,
            impact_cents, impact_note, is_provisional
       from public.ai_recommendations
      where organisation_id = $1
        and status = 'new'
      order by impact_cents desc nulls last, created_at desc
      limit 1`,
    [org],
  );

  const top = rows[0];
  if (!top) return [];

  return [
    {
      section: 'today',
      headline: top.title,
      detail:
        `${top.why_it_matters} What to do: ${top.recommended_action}` +
        (top.impact_note ? ` Expected effect: ${top.impact_note}` : '') +
        (top.is_provisional
          ? ' This came from a reading of an incomplete Imprint, so treat it as provisional.'
          : ''),
      impactCents: top.impact_cents === null ? null : Number(top.impact_cents),
      // A recommendation's impact is an estimate, and #65 requires that to be
      // said rather than implied by a confident sentence.
      provenance: top.impact_cents === null ? 'derived' : 'estimated',
      sourceTable: 'ai_recommendations',
      sourceId: top.id,
    },
  ];
}

/** Radar: what changed outside since the last brief. Observed, so 'fact'. */
async function radar(query: Query, org: string, since: string): Promise<Candidate[]> {
  const rows = await query<{
    id: string;
    title: string;
    summary: string;
    kind: string;
    relevance: string;
    source_url: string | null;
  }>(
    `select id, title, summary, kind::text as kind, relevance, source_url
       from public.market_signals
      where organisation_id = $1
        and observed_at >= $2::date
      order by relevance desc, observed_at desc
      limit 1`,
    [org, since],
  );

  const signal = rows[0];
  if (!signal) return [];

  return [
    {
      section: 'radar',
      headline: signal.title,
      detail:
        `${signal.summary} Seen since your last brief, scored ${(Number(signal.relevance) * 100).toFixed(0)}% relevant to you.` +
        (signal.source_url ? ` Source: ${signal.source_url}` : ''),
      // A signal is a thing that happened outside, not a figure about this
      // business — there is no honest rand value to give it.
      impactCents: null,
      provenance: 'fact',
      sourceTable: 'market_signals',
      sourceId: signal.id,
    },
  ];
}

/**
 * Trajectory: whether they are getting where they said they wanted to go.
 *
 * Goals rather than the Intent layer's objectives, because a goal is a row with
 * an id and a target, and an objective in the Imprint is a sentence. An
 * objective nobody turned into a goal cannot be reported on, and saying so is
 * more useful than reporting on nothing.
 */
async function trajectory(query: Query, org: string): Promise<Candidate[]> {
  const rows = await query<{
    id: string;
    title: string;
    target_value: string;
    current_value: string | null;
    unit: string;
    due_on: string;
  }>(
    `select id, title, target_value, current_value, unit, due_on::text as due_on
       from public.goals
      where organisation_id = $1
        and status = 'active'
        and current_value is not null
        and target_value <> 0
      order by (current_value / nullif(target_value, 0)) asc
      limit 1`,
    [org],
  );

  const goal = rows[0];
  if (!goal) return [];

  // The query already excludes a null current_value; this is the same rule in
  // the language that can hold the compiler to it. A goal nobody has measured
  // has no trajectory to report, and reading its null as zero would announce
  // that they had achieved none of it.
  const current = goal.current_value;
  if (current === null) return [];

  const share = Number(current) / Number(goal.target_value);

  return [
    {
      section: 'trajectory',
      headline: `${goal.title} is ${(share * 100).toFixed(0)}% of the way there`,
      detail:
        `${format(current, goal.unit)} against a target of ${format(goal.target_value, goal.unit)} ` +
        `by ${goal.due_on}. This is the goal furthest from its target.`,
      /*
       * No rand figure, deliberately, and this one was got wrong first.
       *
       * The obvious impact is the shortfall to target, and it ranked this item
       * first every single morning — a whole year's gap is a bigger number
       * than any one day's variance will ever be, so "you are 62% of the way
       * to your annual goal" led the brief on a day a competitor opened four
       * kilometres away.
       *
       * The mistake was putting two incomparable things on one scale. A
       * shortfall is a standing position; everything else in the brief is a
       * change. So trajectory carries no monetary impact and ranks on its
       * section weight, which puts "am I still on course" at the bottom of a
       * Tuesday, where it belongs.
       */
      impactCents: null,
      provenance: 'derived',
      sourceTable: 'goals',
      sourceId: goal.id,
    },
  ];
}

/* ── formatting ────────────────────────────────────────────────────────── */

function rands(cents: number): string {
  return `R${Math.round(cents / 100).toLocaleString('en-GB')}`;
}

function format(value: string, unit: string): string {
  const n = Number(value);
  if (unit === 'currency') return `R${Math.round(n).toLocaleString('en-GB')}`;
  if (unit === 'percent') return `${n.toFixed(1)}%`;
  return n.toLocaleString('en-GB');
}

function dayBefore(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
