import 'server-only';
import { latestRunFor } from '@/features/analysis/record';
import { briefFor } from '@/features/brief/record';
import { imprintFor } from '@/features/imprint/record';
import { pendingProposals } from '@/features/proposals/record';
import { latestFidelity, studioState } from '@/features/twin/scenarios';
import { explain, friendly } from './explain';
import {
  ASSISTANT_TOOLS,
  EXPLAIN_FIGURE,
  READ_BRIEF,
  READ_IMPRINT,
  READ_LATEST_ANALYSIS,
  READ_OPEN_PROPOSALS,
  READ_TWIN_STATE,
} from './tool-definitions';
import { isTraceable, traceBriefItem, traceFigure } from './trace';

/**
 * Running a tool the Assistant asked for.
 *
 * The definitions — the contract the model reads — are next door in
 * tool-definitions.ts, without `server-only`, so a test can assert them. This
 * is the half that reads a customer's business.
 *
 * Every executor reads through the customer's own session, so row-level
 * security applies to the tools exactly as it does to the pages. The tenant is
 * passed in from that session; see the note in tool-definitions.ts for why no
 * tool accepts one as an argument.
 */

export { ASSISTANT_TOOLS, toolNames } from './tool-definitions';

/** What a tool is given besides the model's own arguments. */
export interface ToolContext {
  /** From the session. Never from the model. */
  organisationId: string;
}

export interface ToolResult {
  /** What goes back to the model as the tool_result content. */
  content: string;
  /** True when the tool could not answer. The model is told plainly. */
  isError?: boolean;
}

type Executor = (input: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;

const EXECUTORS: Record<string, Executor> = {
  [READ_IMPRINT.name]: async (_input, ctx) => {
    const imprint = await imprintFor(ctx.organisationId);

    /*
     * Shaped rather than handed over whole.
     *
     * The record carries a resume pointer and a stored-versus-recomputed score
     * comparison, which exist for the screens and mean nothing to a question
     * about the business. What the model needs is what was answered, what was
     * not, and how complete that makes the picture — and `unanswered` is the
     * half that stops it reading a blank as a zero.
     */
    const layers = Object.values(imprint.layers).map((layer) => ({
      layer: layer.layer,
      state: layer.state,
      answers: layer.answers,
      unanswered: layer.gaps,
    }));

    const answered = layers.filter((l) => l.state === 'answered').length;
    if (answered === 0) {
      return { content: 'This business has not answered any part of its Imprint yet.' };
    }

    return {
      content: JSON.stringify({
        qualityScore: imprint.quality.score,
        layersAnswered: `${answered} of ${layers.length}`,
        completedAt: imprint.completedAt,
        layers,
      }),
    };
  },

  [READ_LATEST_ANALYSIS.name]: async (_input, ctx) => {
    const run = await latestRunFor(ctx.organisationId);
    if (!run) return { content: 'No reading of this business has been run yet.' };
    return { content: JSON.stringify(run) };
  },

  [READ_TWIN_STATE.name]: async (_input, ctx) => {
    const [state, fidelity] = await Promise.all([
      studioState(ctx.organisationId),
      latestFidelity(ctx.organisationId),
    ]);
    return { content: JSON.stringify({ ...state, fidelity }) };
  },

  [READ_BRIEF.name]: async (input, ctx) => {
    const date = typeof input.date === 'string' ? input.date : undefined;
    const brief = await briefFor(ctx.organisationId, date);
    if (!brief) {
      return {
        content: date
          ? `No brief was composed for ${date}.`
          : 'No brief has been composed for this business yet.',
      };
    }
    return { content: JSON.stringify(brief) };
  },

  [READ_OPEN_PROPOSALS.name]: async (_input, ctx) => {
    const proposals = await pendingProposals(ctx.organisationId);
    return {
      content:
        proposals.length === 0 ? 'Nothing is waiting on a decision.' : JSON.stringify(proposals),
    };
  },

  [EXPLAIN_FIGURE.name]: async (input, ctx) => {
    const table = String(input.table ?? '');
    const id = String(input.id ?? '');

    const chain =
      table === 'brief_items'
        ? await traceBriefItem(ctx.organisationId, id)
        : isTraceable(table)
          ? await traceFigure(ctx.organisationId, table, id)
          : null;

    if (!chain) {
      return {
        /*
         * Told plainly rather than left to inference. A model handed "not
         * found" and no instruction will often answer anyway — describing
         * where the figure might have come from, which is a fabricated
         * provenance chain and the exact thing this tool exists to make
         * unnecessary.
         */
        content:
          `No figure with id ${id} in ${friendly(table)} is visible to this business. ` +
          'Say that you could not find it rather than describing where it might have come from.',
        isError: true,
      };
    }

    return {
      content: JSON.stringify({
        figure: chain.figure.label,
        from: friendly(chain.figure.table),
        steps: explain(chain),
      }),
    };
  },
};

/**
 * Runs one tool the model asked for.
 *
 * Never throws. A tool that raised would abort the whole turn, and the useful
 * behaviour is to hand the model an error it can tell the reader about — which
 * is what `is_error` on a tool_result is for.
 *
 * The input arrives already parsed. Nothing here does string matching on it:
 * escaping inside tool arguments varies between models, and a match that works
 * today is a bug waiting for the next one.
 */
export async function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const executor = EXECUTORS[name];
  if (!executor) {
    return { content: `There is no tool called ${name}.`, isError: true };
  }

  try {
    return await executor(input, ctx);
  } catch (error) {
    console.error(`[amryn:assistant] ${name} failed`, error);
    return {
      content:
        `The ${name} tool could not be read just now. Tell the reader you could not ` +
        'check, rather than answering from memory.',
      isError: true,
    };
  }
}

/*
 * Every definition has an executor, checked when this module loads.
 *
 * A tool offered to the model with nothing behind it is not a crash — the
 * model calls it, gets "there is no tool called that", and burns a turn
 * apologising. That is the kind of fault which survives review because
 * everything still works, so it fails here instead, at import, naming the
 * tool.
 */
{
  const offered = ASSISTANT_TOOLS.map((t) => t.name);
  const orphans = offered.filter((name) => !EXECUTORS[name]);
  const unreachable = Object.keys(EXECUTORS).filter((name) => !offered.includes(name));

  if (orphans.length > 0 || unreachable.length > 0) {
    throw new Error(
      'The Assistant tool registry does not line up. ' +
        (orphans.length > 0 ? `Offered with no executor: ${orphans.join(', ')}. ` : '') +
        (unreachable.length > 0 ? `Executor never offered: ${unreachable.join(', ')}.` : ''),
    );
  }
}
