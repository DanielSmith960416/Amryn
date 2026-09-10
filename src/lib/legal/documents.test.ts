import { describe, expect, it } from 'vitest';
import { DATA_RESIDENCY, PROCESSORS, RESPONSIBLE_PARTY, hasUnfilledDetails } from './documents';

/**
 * A privacy policy is the one document where a plausible-sounding invention is
 * worse than a blank. These pin the two ways this file could quietly become
 * untrue: a location that says nothing, and a placeholder that stops being
 * visible as one.
 */

describe('the processor table', () => {
  it('names a real place for every processor', () => {
    // Every location here read "depends on the region chosen" until somebody
    // looked at the deployment. That is honest for an undeployed product and
    // useless to a customer asking where their invoices are kept — so a
    // hedge is only allowed where it says who will settle it.
    for (const processor of PROCESSORS) {
      const hedged = /^depends\b/i.test(processor.location);
      expect(hedged, `${processor.name} still says "${processor.location}"`).toBe(false);
      expect(processor.location.trim().length).toBeGreaterThan(0);
    }
  });

  it('marks what has not been checked instead of guessing at it', () => {
    // Resend's own processing region has not been confirmed against their
    // documentation. Saying so is correct; inventing "Ireland" because the
    // rest of the estate is there would be the exact failure this guards.
    const resend = PROCESSORS.find((p) => p.name === 'Resend');
    expect(resend?.location).toMatch(/to be confirmed/i);
  });

  it('includes the credential holder, which is the one nobody thinks of', () => {
    // Nango holds the tokens for a customer's accounting and payment systems.
    // A processor list that omits it describes a smaller product than the one
    // being sold.
    const nango = PROCESSORS.find((p) => p.name === 'Nango');
    expect(nango).toBeDefined();
    expect(nango?.location).toMatch(/European Union/);
  });
});

describe('the residency statement', () => {
  it('names the countries rather than a region code', () => {
    expect(DATA_RESIDENCY.countries).toContain('Ireland');
    expect(DATA_RESIDENCY.summary).toContain('Ireland');
    // eu-west-1 and ams mean nothing to somebody deciding whether to upload
    // their payroll.
    expect(DATA_RESIDENCY.summary).not.toMatch(/eu-west-1|\bams\b/);
  });

  it('says it is a cross-border transfer rather than implying it is not', () => {
    expect(DATA_RESIDENCY.summary).toMatch(/cross-border/i);
    expect(DATA_RESIDENCY.summary).toMatch(/POPIA/);
  });

  it('agrees with the processor table it sits beside', () => {
    // Two statements of where the data lives is one more than can stay true.
    for (const country of DATA_RESIDENCY.countries) {
      const bare = country.replace(/^the /, '');
      const named = PROCESSORS.some((p) => p.location.includes(bare));
      expect(named, `${country} is claimed but no processor is there`).toBe(true);
    }
  });

  it('has a short form that fits on a signup screen', () => {
    expect(DATA_RESIDENCY.short.length).toBeLessThan(120);
  });
});

describe('hasUnfilledDetails', () => {
  it('is true while the company details are placeholders', () => {
    // Currently true, and the pages say so. When these are filled in, this
    // expectation flips — which is the reminder to check the pages still read
    // correctly without the warning.
    expect(hasUnfilledDetails()).toBe(true);
  });

  it('spots a bracket wherever it appears', () => {
    const placeholders = Object.entries(RESPONSIBLE_PARTY).filter(([, v]) => v.includes('['));
    expect(placeholders.length).toBeGreaterThan(0);
  });
});
