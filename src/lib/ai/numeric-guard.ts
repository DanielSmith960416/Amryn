/**
 * Refuses model output containing a number nobody gave it.
 *
 * ── why asking is not enough ──────────────────────────────────────────────
 * The house prompt already says "never invent a number, a date, a name or a
 * source". That instruction is worth having and it is not a control: it is a
 * request made to a system that is optimised to sound right, and the failure
 * mode when it is not followed is the most damaging one this product has —
 * a confident figure, in the house voice, on a page a business owner is about
 * to act on. Nothing downstream can tell it from a real one.
 *
 * So the rule is enforced here instead. Every number in the output is checked
 * against the numbers in the context the model was handed. One that is not
 * there was invented, and the caller throws the output away.
 *
 * ── why this can be strict without being useless ──────────────────────────
 * It works because of an existing decision rather than in spite of it: the
 * engines compute what is true and the model only decides how to say it, so
 * every figure the model has any business writing was already in its context.
 * Changes, percentages and totals are computed by the engines and rendered
 * into the prompt. A guard this strict would be unworkable against a model
 * asked to do arithmetic; against one asked to write prose about arithmetic
 * already done, it costs nothing legitimate.
 *
 * ── the one thing it must not do ──────────────────────────────────────────
 * Rounding is not invention. "R4.2m" for 4,235,000 is better writing than the
 * exact figure and is what a person would say out loud. A guard that rejected
 * it would be turned off within a week, so it accepts any number the context
 * rounds to at the precision the output chose to use.
 */

/** A number as it appeared, with enough context to judge it. */
export interface NumericMention {
  /** Exactly as written, e.g. "R4.2m" or "27%". */
  text: string;
  /** Its value, scale suffix applied. */
  value: number;
  /** Where in the output, for an error a person can act on. */
  index: number;
}

export interface GuardResult {
  ok: boolean;
  /** Numbers in the output that no number in the context accounts for. */
  invented: NumericMention[];
}

/**
 * Multipliers written as a suffix. British usage: "bn" not "b", though both
 * appear in the wild and both are read the same way.
 */
const SCALES: Record<string, number> = {
  k: 1_000,
  m: 1_000_000,
  bn: 1_000_000_000,
  b: 1_000_000_000,
};

/**
 * Numbers that are almost never claims.
 *
 * Small integers carry ordinary prose — "the three sites", "two quarters",
 * "the first of them" — and a business with three branches has "3" in its
 * context anyway, so the strict rule catches the wrong version regardless.
 * What this exempts is the residue: counting words that happen to be digits.
 * Kept deliberately tiny, because "12% growth" is exactly the shape of claim
 * this exists to catch and 12 is a small integer.
 */
const NEVER_A_CLAIM = new Set([0, 1, 2]);

/**
 * Every number in a piece of text, with its scale applied.
 *
 * Deliberately greedy about what counts as a number: currency prefixes,
 * thousands separators, decimals, percentages and scale suffixes. A guard that
 * only recognised bare integers would pass "R4 200 000" without looking at it.
 */
export function numbersIn(text: string): NumericMention[] {
  const pattern =
    /(?<![\w.])(?:R\s?)?(\d{1,3}(?:[ ,]\d{3})+|\d+(?:\.\d+)?)\s*(bn|[kmb])?(%)?/gi;

  const found: NumericMention[] = [];
  for (const match of text.matchAll(pattern)) {
    const [whole, digits, suffix] = match;
    const bare = Number(digits!.replace(/[ ,]/g, ''));
    if (!Number.isFinite(bare)) continue;

    const scale = suffix ? (SCALES[suffix.toLowerCase()] ?? 1) : 1;
    found.push({
      text: whole.trim(),
      value: bare * scale,
      index: match.index ?? 0,
    });
  }
  return found;
}

/**
 * Whether `claimed` is `actual`, allowing for the rounding the writer used.
 *
 * The tolerance comes from how the number was written rather than from a fixed
 * percentage. "4.2m" is two significant figures and should accept anything
 * that rounds to it; "4,235,112" is exact and should accept almost nothing.
 * A flat 1% would do the opposite of what is wanted at both ends.
 */
function roundsTo(actual: number, claimed: number, written: string): boolean {
  if (actual === claimed) return true;

  // How many digits after the decimal point the writer committed to, and
  // whether they used a scale suffix — "4.2m" is precise to 0.1m, so the
  // tolerance is half of that.
  const decimals = /\.(\d+)/.exec(written)?.[1]?.length ?? 0;
  const suffix = /(bn|[kmb])\s*%?$/i.exec(written.trim())?.[1]?.toLowerCase();
  const scale = suffix ? (SCALES[suffix] ?? 1) : 1;

  const step = scale * 10 ** -decimals;
  // Half a step in either direction is exactly "rounds to this".
  return Math.abs(actual - claimed) <= step / 2;
}

/**
 * Checks model output against the context it was given.
 *
 * Returns what was invented rather than a boolean, so a caller can log
 * precisely which figure was made up — which is the difference between a fault
 * somebody fixes and one they learn to ignore.
 */
export function guardNumbers(output: string, context: string): GuardResult {
  const supplied = numbersIn(context).map((mention) => mention.value);

  const invented = numbersIn(output).filter((mention) => {
    if (NEVER_A_CLAIM.has(mention.value)) return false;

    // A year is a date rather than a quantity, and the model is entitled to
    // write the current one. Anything outside living memory is a claim again.
    const year = new Date().getUTCFullYear();
    if (Number.isInteger(mention.value) && mention.value >= 1900 && mention.value <= year + 1) {
      return false;
    }

    return !supplied.some((actual) => roundsTo(actual, mention.value, mention.text));
  });

  return { ok: invented.length === 0, invented };
}

/**
 * The line written to the log when output is rejected.
 *
 * Names the figures rather than saying a check failed, because the next
 * question is always "which one?" and an operator should not have to
 * reconstruct the prompt to find out.
 */
export function describeInvented(result: GuardResult): string {
  return result.invented.map((mention) => mention.text).join(', ');
}
