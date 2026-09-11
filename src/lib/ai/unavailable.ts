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
 * What the assistant says when no model is configured.
 *
 * An honest account of what the platform does know, rather than an error — and
 * deliberately not a sentence about a missing provider key. The reader is a
 * customer who asked a question, not the person who would set one; telling
 * them about configuration answers a question nobody asked and leaves theirs
 * unanswered.
 */
export function unavailableAnswer(context: BusinessContext): string {
  /*
   * ── the list is built before it is announced ─────────────────────────
   *
   * Every line below is conditional, and this used to promise them first:
   * "Here is where things stand:" printed unconditionally, followed by
   * whichever bullets happened to apply. On a workspace with no figures yet,
   * that is none of them — so the answer opened a colon and closed it with a
   * blank space, which is how it was found, in a screenshot.
   *
   * A sentence that announces a list has to be able to see the list.
   */
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

  const engines =
    'Everything else still works — the health score, change detection, opportunity scoring and the ' +
    "executive briefing are computed by Amryn's own engines, not by a model.";

  const lines = [
    'Conversational answers are not switched on for your workspace, so I cannot discuss this in my own words.',
    '',
    stand.length > 0 ? `${engines} Here is where things stand:` : engines,
    '',
  ];

  if (stand.length > 0) {
    lines.push(...stand);
  } else {
    // Not "nothing is wrong". Nothing has been measured, which is a different
    // statement and the only honest one on a workspace with no figures in it.
    lines.push('There is nothing to report yet — no figures have been brought in for those engines to read.');
  }

  lines.push(
    '',
    'Ask an administrator of your workspace to switch conversational answers on if you would like ' +
      'them.',
  );
  return lines.join('\n');
}
