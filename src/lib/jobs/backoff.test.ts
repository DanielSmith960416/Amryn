import { describe, expect, it } from 'vitest';
import { retryDelaySeconds } from './backoff';

/** The midpoint of the jitter window, so the arithmetic is what is asserted. */
const middling = () => 0.5;
/** The floor and ceiling of the window, for the bounds. */
const lowest = () => 0;
const highest = () => 1;

describe('retryDelaySeconds', () => {
  it('waits the base delay after the first failure, not double it', () => {
    // attempts counts runs already made, so a first failure arrives as 1.
    expect(retryDelaySeconds(1, highest)).toBe(30);
  });

  it('doubles with each further attempt', () => {
    expect(retryDelaySeconds(2, highest)).toBe(60);
    expect(retryDelaySeconds(3, highest)).toBe(120);
    expect(retryDelaySeconds(4, highest)).toBe(240);
  });

  it('stops at fifteen minutes, so a failure is still seen the same day', () => {
    expect(retryDelaySeconds(10, highest)).toBe(900);
    expect(retryDelaySeconds(50, highest)).toBe(900);
  });

  it('does not overflow into infinity on an absurd attempt count', () => {
    // 2 ** 1024 is Infinity, and Infinity seconds is not a delay. The bound on
    // the exponent is what stops this being a NaN in a query.
    const delay = retryDelaySeconds(5000, middling);
    expect(Number.isFinite(delay)).toBe(true);
    expect(delay).toBeLessThanOrEqual(900);
  });

  it('spreads the last quarter of the window, so failures do not return in lockstep', () => {
    expect(retryDelaySeconds(1, lowest)).toBe(23); // 30 - 25%, rounded
    expect(retryDelaySeconds(1, middling)).toBe(26);
    expect(retryDelaySeconds(1, highest)).toBe(30);
  });

  it('never returns a negative or fractional delay', () => {
    for (const attempts of [0, -3, 1.5, 7]) {
      const delay = retryDelaySeconds(attempts, lowest);
      expect(delay).toBeGreaterThan(0);
      expect(Number.isInteger(delay)).toBe(true);
    }
  });
});
