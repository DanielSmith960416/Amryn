/**
 * What the assistant says when no model is configured.
 *
 * Its own file, and for the reason this codebase has met five times now:
 * intelligence.ts carries `server-only`, which is a marker for the React
 * bundler and makes a module unreadable to a unit test. This is a pure
 * function that builds a paragraph, it shipped with a visible fault in it, and
 * a fault in a paragraph is exactly the kind a test catches cheaply.
 */
import type { BusinessContext } from '@/types/intelligence';

/**
 * The assistant's reply, drawn from what has already been computed.
 *
 * ── it used to explain itself, and that was the fault ────────────────────
 *
 * This answer once opened by saying conversational answers were not switched
 * on for the workspace, went on to name the engines that compute the figures,
 * and closed by asking the reader to find an administrator. Three sentences
 * about how Amryn is put together, to somebody who had asked about their
 * business.
 *
 * None of it was the reader's problem. Whether a capability is configured is
 * ours to know and ours to fix; a customer who asked which risks need
 * attention is owed the figures or a plain sentence saying there are none.
 *
 * So: the figures, with nothing around them. Where there are none, one line
 * saying so in the words a business would use. Nothing is hidden from
 * whoever runs the platform — the configuration is still reported in the
 * logs and on the diagnostics page, which is where it belongs.
 */
export function unavailableAnswer(context: BusinessContext): string {
  const stand: string[] = [];

  if (context.health) {
    stand.push(`· Business health is ${Math.round(context.health.score)} of 100 (${context.health.classification}).`);
  }
  if (context.anomalies.length > 0) {
    stand.push(`· ${context.anomalies.length} metric${context.anomalies.length === 1 ? '' : 's'} showed a change worth investigating.`);
  }
  const openRisks = context.risks.filter((r) => r.status === 'open').length;
  if (openRisks > 0) stand.push(`· ${openRisks} open risk${openRisks === 1 ? '' : 's'} on the register.`);

  const live = context.opportunities.filter((o) => !['won', 'lost', 'archived'].includes(o.stage));
  if (live.length > 0) stand.push(`· ${live.length} live opportunit${live.length === 1 ? 'y' : 'ies'} on the radar.`);

  /*
   * One line, and it says what is true: nothing has been measured. Not "all
   * is well" — a business with no figures in it is not a business with no
   * problems, and the two read identically on a screen.
   */
  if (stand.length === 0) {
    return 'Nothing has been recorded for this business yet.';
  }

  return ['Here is where things stand:', '', ...stand].join('\n');
}
