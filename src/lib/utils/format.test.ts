import { describe, expect, it } from 'vitest';
import {
  currencySymbol,
  daysUntil,
  formatDelta,
  formatMetric,
  formatMoney,
  formatRelative,
  formatScore,
  humanise,
} from './format';

describe('formatMoney', () => {
  it('abbreviates by magnitude', () => {
    expect(formatMoney(124_000_000)).toBe('R1.24m');
    expect(formatMoney(8_200_000_00)).toBe('R8.2m');
    expect(formatMoney(2_100_000)).toBe('R21k');
    expect(formatMoney(45_000)).toBe('R450');
  });

  it('writes the full figure when asked', () => {
    expect(formatMoney(124_000_000, 'ZAR', { compact: false })).toBe('R1,240,000.00');
  });

  it('keeps the sign on a negative', () => {
    expect(formatMoney(-124_000_000)).toBe('-R1.24m');
  });

  it('uses the right symbol per currency', () => {
    expect(formatMoney(100_000, 'USD')).toBe('$1,000');
    expect(formatMoney(100_000, 'GBP')).toBe('£1,000');
    expect(formatMoney(100_000, 'XYZ')).toContain('XYZ');
  });

  it('shows an em dash rather than NaN for missing values', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(undefined)).toBe('—');
    expect(formatMoney(Number.NaN)).toBe('—');
  });

  it('handles zero', () => {
    expect(formatMoney(0)).toBe('R0');
  });
});

describe('formatMetric', () => {
  it('formats each unit in its own idiom', () => {
    expect(formatMetric(1_240_000, 'currency')).toBe('R1.24m');
    expect(formatMetric(31.84, 'percent')).toBe('31.8%');
    expect(formatMetric(4.12, 'days')).toBe('4.1 days');
    expect(formatMetric(1, 'days')).toBe('1 day');
    expect(formatMetric(8.4, 'ratio')).toBe('8.4×');
    expect(formatMetric(82.4, 'score')).toBe('82');
    expect(formatMetric(1180, 'count')).toBe('1,180');
    expect(formatMetric(45_000, 'count')).toBe('45k');
  });

  it('is safe with no value', () => {
    expect(formatMetric(null, 'currency')).toBe('—');
    expect(formatMetric(Number.POSITIVE_INFINITY, 'percent')).toBe('—');
  });
});

describe('formatDelta', () => {
  it('always carries an explicit sign', () => {
    expect(formatDelta(12.4)).toBe('+12.4%');
    expect(formatDelta(-8)).toBe('-8%');
    expect(formatDelta(0)).toBe('0%');
  });

  it('is safe with no value', () => {
    expect(formatDelta(null)).toBe('—');
  });
});

describe('formatScore', () => {
  it('rounds to a whole number', () => {
    expect(formatScore(82.4)).toBe('82');
    expect(formatScore(82.6)).toBe('83');
    expect(formatScore(null)).toBe('—');
  });
});

describe('formatRelative', () => {
  const now = new Date('2026-08-29T12:00:00Z');

  it('reads backwards and forwards', () => {
    expect(formatRelative(new Date('2026-08-26T12:00:00Z'), now)).toBe('3 days ago');
    expect(formatRelative(new Date('2026-09-12T12:00:00Z'), now)).toBe('in 2 weeks');
  });

  it('collapses very recent moments', () => {
    expect(formatRelative(new Date('2026-08-29T11:59:45Z'), now)).toBe('just now');
  });

  it('is safe with rubbish input', () => {
    expect(formatRelative('not a date', now)).toBe('—');
    expect(formatRelative(null, now)).toBe('—');
  });
});

describe('daysUntil', () => {
  const now = new Date('2026-08-29T00:00:00Z');

  it('counts forward and backward', () => {
    expect(daysUntil('2026-09-05T00:00:00Z', now)).toBe(7);
    expect(daysUntil('2026-08-22T00:00:00Z', now)).toBe(-7);
  });

  it('returns null for nothing', () => {
    expect(daysUntil(null, now)).toBeNull();
  });
});

describe('humanise', () => {
  it('turns an enum value into a sentence', () => {
    expect(humanise('high_priority')).toBe('High priority');
    expect(humanise('market_expansion')).toBe('Market expansion');
    expect(humanise('won')).toBe('Won');
  });
});

describe('currencySymbol', () => {
  it('knows the local currency', () => {
    expect(currencySymbol('ZAR')).toBe('R');
    expect(currencySymbol('zar')).toBe('R');
  });
});
