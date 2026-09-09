/**
 * What the Assistant may look at, as definitions.
 *
 * Deliberately free of `server-only` and of every executor, so the contract
 * handed to the model can be asserted in a test. The executors live in
 * tools.ts, which reads a customer's database and cannot be imported outside a
 * request.
 *
 * The split is the same one made for the AI error types and for the mail
 * transport, and for the same reason: a rule worth enforcing has to be
 * reachable by something that enforces it.
 *
 * ── the rule that matters more than any other here ────────────────────────
 *
 * No tool takes an organisation as an input. Not one. The tenant comes from
 * the session that invoked the Assistant and is passed to the executor beside
 * the model's arguments, never inside them.
 *
 * This is not defence in depth, it is the actual defence. A tool that accepted
 * `{ organisation_id }` would be a tool the model can be talked into pointing
 * somewhere else — by a document it was asked to summarise, by a market signal
 * scraped off a website, by a customer's own message. Row-level security would
 * still refuse most of it, but the platform would be relying on the database
 * to catch what the design should never have permitted. A test asserts it.
 *
 * ── read-only, and that is a boundary rather than a phase ─────────────────
 *
 * None of these write. The Assistant's only route to changing anything is a
 * proposal a person accepts, and that lives in features/proposals. A write
 * tool added here later would quietly undo the decision migration 32 was built
 * to enforce, so it should not be added here at all — and a test asserts that
 * too, by name.
 */
import type Anthropic from '@anthropic-ai/sdk';

/**
 * `strict: true` with `additionalProperties: false` and an explicit `required`
 * guarantees the arguments validate against the schema before they reach an
 * executor. Worth having on every tool here: these read a customer's business,
 * and an executor should never be the thing that discovers a malformed
 * argument.
 */
function tool(
  name: string,
  description: string,
  properties: Record<string, unknown> = {},
  required: string[] = [],
): Anthropic.Tool {
  return {
    name,
    description,
    strict: true,
    input_schema: {
      type: 'object',
      properties,
      required,
      additionalProperties: false,
    } as Anthropic.Tool.InputSchema,
  };
}

export const READ_IMPRINT = tool(
  'read_imprint',
  'Read what this business has told the platform about itself: the eight ' +
    'Imprint layers, which questions were answered, which were left blank, and the ' +
    'Quality Score. Use this before answering anything about the business itself. ' +
    'Fields listed as unanswered were never given — they are not zero, and must not be ' +
    'treated as zero.',
);

export const READ_LATEST_ANALYSIS = tool(
  'read_latest_analysis',
  'Read the most recent full reading of this business: when it ran, the Quality ' +
    'Score it was gated on, how many findings it produced, and what it wanted but was ' +
    'not given. A reading marked provisional came from an Imprint too incomplete for ' +
    'the platform to stand behind its findings; say so rather than quoting it flatly.',
);

export const READ_TWIN_STATE = tool(
  'read_twin_state',
  'Read the Digital Twin: its scenarios, the most recent simulation for each, and ' +
    'how accurate the Twin has been shown to be. The accuracy measurement is the only ' +
    'thing that makes a simulated range worth quoting. If it says the Twin cannot be ' +
    'measured yet, say that alongside any figure you take from it.',
);

export const READ_BRIEF = tool(
  'read_brief',
  'Read a morning brief: the five things the platform thought worth attention that ' +
    'day, each with the record it came from. Omit the date for the most recent one.',
  { date: { type: 'string', description: 'A date as YYYY-MM-DD. Omit for the latest brief.' } },
  [],
);

export const READ_OPEN_PROPOSALS = tool(
  'read_open_proposals',
  'Read the suggested changes waiting on a person. Nothing on this platform applies ' +
    'one automatically — accepting is a human action — so never tell somebody a change ' +
    'has been made because a proposal exists.',
);

export const EXPLAIN_FIGURE = tool(
  'explain_figure',
  'Walk back through where a figure came from: whether it was recorded, calculated, ' +
    'estimated or simulated, what reading produced it, what that reading was missing, ' +
    'and how accurate the Twin was if it is a simulated number. Use this whenever ' +
    'somebody asks how a number was arrived at, or whether it can be trusted. Prefer ' +
    'it over reasoning about the figure yourself — it reads the record.',
  {
    table: {
      type: 'string',
      description:
        'Which table the figure is in: business_insights, ai_recommendations, ' +
        'opportunities, or brief_items.',
    },
    id: { type: 'string', description: 'The row id of the figure.' },
  },
  ['table', 'id'],
);

/** The definitions, for the `tools` array of a Messages request. */
export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  READ_IMPRINT,
  READ_LATEST_ANALYSIS,
  READ_TWIN_STATE,
  READ_BRIEF,
  READ_OPEN_PROPOSALS,
  EXPLAIN_FIGURE,
];

export function toolNames(): string[] {
  return ASSISTANT_TOOLS.map((t) => t.name).sort();
}
