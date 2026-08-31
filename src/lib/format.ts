/**
 * Presentation formatting.
 *
 * Every figure on a screen or in a PDF passes through here, so that a revenue
 * number reads identically in the Command Centre, the DigitalTwin® and the
 * weekly report. The Intelligence Layer works in major units throughout —
 * rands, not cents — because that is the unit both workbooks are written in
 * and a conversion nobody asked for is a bug waiting to happen.
 */

/**
 * The locale is pinned rather than taken from the viewer.
 *
 * `en-ZA` groups thousands with a space and decimalises with a comma, which
 * reads as "R1 240 000,00" beside a compact "R1.24m" from the same screen.
 * Pinning also makes output identical on every machine, which is what allows
 * these to be unit-tested at all.
 */
const LOCALE = 'en-GB';

const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  ZAR: 'R',
  USD: '$',
  EUR: '€',
  GBP: '£',
  NAD: 'N$',
  BWP: 'P',
};

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code.toUpperCase()] ?? `${code.toUpperCase()} `;
}

const DASH = '—';

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Full precision: "R885,000". For tables, where figures are compared. */
export function money(value: number | null | undefined, currency = 'ZAR'): string {
  if (!isNumber(value)) return DASH;
  const sign = value < 0 ? '-' : '';
  return `${sign}${currencySymbol(currency)}${Math.round(Math.abs(value)).toLocaleString(LOCALE)}`;
}

/** Abbreviated: "R7.06m". For tiles, where the magnitude is the point. */
export function compactMoney(value: number | null | undefined, currency = 'ZAR'): string {
  if (!isNumber(value)) return DASH;
  const symbol = currencySymbol(currency);
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  if (abs >= 1_000_000_000) return `${sign}${symbol}${trim(abs / 1_000_000_000, 2)}bn`;
  if (abs >= 1_000_000) return `${sign}${symbol}${trim(abs / 1_000_000, 2)}m`;
  if (abs >= 10_000) return `${sign}${symbol}${trim(abs / 1000, 1)}k`;
  return `${sign}${symbol}${Math.round(abs).toLocaleString(LOCALE)}`;
}

/** A ratio as a percentage: 0.381 → "38.1%". */
export function percent(value: number | null | undefined, decimals = 1): string {
  if (!isNumber(value)) return DASH;
  return `${trim(value * 100, decimals)}%`;
}

/** A signed ratio, for variances: -0.078 → "-7.8%". */
export function signedPercent(value: number | null | undefined, decimals = 1): string {
  if (!isNumber(value)) return DASH;
  return `${value > 0 ? '+' : ''}${trim(value * 100, decimals)}%`;
}

export function count(value: number | null | undefined): string {
  if (!isNumber(value)) return DASH;
  return Math.round(value).toLocaleString(LOCALE);
}

export function score(value: number | null | undefined, decimals = 1): string {
  if (!isNumber(value)) return DASH;
  return trim(value, decimals);
}

/** "2026-09-15" → "15 Sep 2026", the format both workbooks print. */
export function date(value: string | Date | null | undefined): string {
  if (!value) return DASH;
  const d = typeof value === 'string' ? new Date(`${value}T00:00:00Z`) : value;
  if (Number.isNaN(d.getTime())) return DASH;
  return d.toLocaleDateString(LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Days remaining, phrased so the sign cannot be misread.
 *
 * "-38" beside an expiry date is ambiguous at a glance; "38 days ago" is not,
 * and on a compliance record that distinction is the whole point.
 */
export function daysLabel(days: number | null | undefined): string {
  if (!isNumber(days)) return DASH;
  if (days < 0) {
    const overdue = Math.abs(days);
    return `${overdue} day${overdue === 1 ? '' : 's'} ago`;
  }
  if (days === 0) return 'Today';
  return `${days} day${days === 1 ? '' : 's'}`;
}

/** Formats a KPI by its declared unit, so one table can mix them. */
export function byFormat(
  value: number | null | undefined,
  format: 'currency' | 'percent' | 'number' | 'score',
  currency = 'ZAR',
): string {
  switch (format) {
    case 'currency':
      return compactMoney(value, currency);
    case 'percent':
      return percent(value);
    case 'score':
      return score(value);
    case 'number':
    default:
      return count(value);
  }
}

/** Fixes to `decimals`, drops trailing zeroes, groups the whole part. */
function trim(value: number, decimals: number): string {
  const fixed = value.toFixed(decimals);
  const trimmed = decimals > 0 ? fixed.replace(/\.?0+$/, '') : fixed;
  const [whole, fraction] = trimmed.split('.');
  const grouped = Number(whole).toLocaleString(LOCALE);
  return fraction ? `${grouped}.${fraction}` : grouped;
}
