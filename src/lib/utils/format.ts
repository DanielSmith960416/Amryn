/**
 * Presentation formatting.
 *
 * Money is stored in minor units throughout, and every currency figure on
 * screen passes through here so that "R1.24m" is written the same way in the
 * Command Centre, a report and an assistant answer.
 */

/**
 * Number formatting is pinned to one locale rather than the viewer's.
 *
 * en-ZA groups with a narrow space and decimalises with a comma, which reads
 * as "R1 240 000,00" beside a compact "R1.24m" from the same screen. One
 * convention, comma-grouped and point-decimalised, is what the brand uses and
 * what keeps the two forms consistent. Pinning it also makes output identical
 * across machines, which is what lets these be unit-tested at all.
 */
const NUMBER_LOCALE = 'en-GB';

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

export interface MoneyOptions {
  /** Abbreviate to k/m/bn. On by default — executives read magnitudes. */
  compact?: boolean;
  decimals?: number;
}

/** Formats an amount held in minor units (cents). */
export function formatMoney(
  minorUnits: number | null | undefined,
  currency = 'ZAR',
  options: MoneyOptions = {},
): string {
  if (minorUnits === null || minorUnits === undefined || !Number.isFinite(minorUnits)) return '—';

  const symbol = currencySymbol(currency);
  const value = minorUnits / 100;
  const { compact = true, decimals } = options;
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  if (!compact) {
    return `${sign}${symbol}${abs.toLocaleString(NUMBER_LOCALE, {
      minimumFractionDigits: decimals ?? 2,
      maximumFractionDigits: decimals ?? 2,
    })}`;
  }

  if (abs >= 1_000_000_000) return `${sign}${symbol}${trim(abs / 1_000_000_000, decimals ?? 2)}bn`;
  if (abs >= 1_000_000) return `${sign}${symbol}${trim(abs / 1_000_000, decimals ?? 2)}m`;
  if (abs >= 10_000) return `${sign}${symbol}${trim(abs / 1000, decimals ?? 1)}k`;
  return `${sign}${symbol}${trim(abs, decimals ?? 0)}`;
}

/** Formats a metric according to its declared unit. */
export function formatMetric(
  value: number | null | undefined,
  unit: string,
  currency = 'ZAR',
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';

  switch (unit) {
    case 'currency':
      // Metric values are stored in major units; money is stored in minor.
      return formatMoney(value * 100, currency);
    case 'percent':
      return `${trim(value, 1)}%`;
    case 'days':
      return `${trim(value, 1)} ${Math.abs(value) === 1 ? 'day' : 'days'}`;
    case 'ratio':
      return `${trim(value, 2)}×`;
    case 'score':
      return trim(value, 0);
    case 'count':
    default:
      return Math.abs(value) >= 10_000
        ? `${trim(value / 1000, 1)}k`
        : value.toLocaleString(NUMBER_LOCALE, { maximumFractionDigits: 2 });
  }
}

/** A signed percentage, for deltas. */
export function formatDelta(percent: number | null | undefined, decimals = 1): string {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) return '—';
  const sign = percent > 0 ? '+' : '';
  return `${sign}${trim(percent, decimals)}%`;
}

export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return String(Math.round(value));
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(NUMBER_LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatMonth(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(NUMBER_LOCALE, { month: 'short' });
}

/** "3 days ago", "in 2 weeks" — relative to now, in whole units. */
export function formatRelative(value: string | Date | null | undefined, now = new Date()): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';

  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3600],
    ['minute', 60],
  ];

  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      return formatter.format(Math.round(seconds / size), unit);
    }
  }
  return 'just now';
}

/** Days between now and a date, negative once it has passed. */
export function daysUntil(value: string | Date | null | undefined, now = new Date()): number | null {
  if (!value) return null;
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - now.getTime()) / 86_400_000);
}

/** Sentence case for an enum value: `high_priority` → `High priority`. */
export function humanise(value: string): string {
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function trim(value: number, decimals: number): string {
  const fixed = value.toFixed(decimals);
  const trimmed = decimals > 0 ? fixed.replace(/\.?0+$/, '') : fixed;
  const parts = trimmed.split('.');
  const whole = Number(parts[0]).toLocaleString(NUMBER_LOCALE);
  return parts[1] ? `${whole}.${parts[1]}` : whole;
}
