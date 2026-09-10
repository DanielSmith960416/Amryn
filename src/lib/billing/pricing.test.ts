import { describe, expect, it } from 'vitest';
import {
  annualSaving,
  describeImplementationFee,
  describeLimit,
  describePrice,
  type PlanOffer,
} from './pricing';

/**
 * The price list is the one part of the product a customer reads before they
 * trust anything else in it, so a range that formats wrongly is not a cosmetic
 * bug. These pin the four shapes a tier can take: a published price, a
 * negotiated band, a tier priced on application, and a fee that is a single
 * figure rather than a range.
 */

function offer(over: Partial<PlanOffer> = {}): PlanOffer {
  return {
    plan: 'growth',
    name: 'Growth',
    tagline: '',
    priceCentsMonthly: 499900,
    priceCentsMonthlyMax: null,
    priceCentsAnnual: 5498900,
    implementationFeeCentsMin: 750000,
    implementationFeeCentsMax: 2000000,
    currency: 'ZAR',
    trialDays: 30,
    contactSales: false,
    includes: [],
    limits: {},
    ...over,
  };
}

describe('describePrice', () => {
  it('gives one figure where the price is published', () => {
    expect(describePrice(offer())).toBe('R4,999');
  });

  it('gives a band with a plus where the price is negotiated', () => {
    // Enterprise: the ceiling is where the standard band ends, not where the
    // largest contract does, which is what the plus is carrying.
    const enterprise = offer({
      plan: 'enterprise',
      priceCentsMonthly: 2500000,
      priceCentsMonthlyMax: 7500000,
      contactSales: true,
    });
    expect(describePrice(enterprise)).toBe('R25,000 – R75,000+');
  });

  it('says so plainly where there is no price at all', () => {
    expect(describePrice(offer({ priceCentsMonthly: null }))).toBe('On application');
  });

  it('does not invent a band when the ceiling equals the floor', () => {
    const flat = offer({ priceCentsMonthly: 499900, priceCentsMonthlyMax: 499900 });
    expect(describePrice(flat)).toBe('R4,999');
  });
});

describe('describeImplementationFee', () => {
  it('gives the range', () => {
    expect(describeImplementationFee(offer())).toBe('R7,500 – R20,000');
  });

  it('adds a plus only where the tier is negotiated', () => {
    const enterprise = offer({
      contactSales: true,
      implementationFeeCentsMin: 5000000,
      implementationFeeCentsMax: 25000000,
    });
    expect(describeImplementationFee(enterprise)).toBe('R50,000 – R250,000+');
  });

  it('gives one figure where both bounds agree', () => {
    const flat = offer({ implementationFeeCentsMin: 250000, implementationFeeCentsMax: 250000 });
    expect(describeImplementationFee(flat)).toBe('R2,500');
  });

  it('returns null where implementation is not charged, so the page can omit the line', () => {
    const free = offer({ implementationFeeCentsMin: null, implementationFeeCentsMax: null });
    expect(describeImplementationFee(free)).toBeNull();
  });
});

describe('annualSaving', () => {
  it('is a month of the new price, which is the discount the plans carry', () => {
    // R4,999 × 12 = R59,988; the annual price is R54,989.
    expect(annualSaving(offer())).toBe(499900 * 12 - 5498900);
  });

  it('is null where there is no annual price to compare', () => {
    expect(annualSaving(offer({ priceCentsAnnual: null }))).toBeNull();
  });
});

describe('describeLimit', () => {
  it('says Unlimited rather than leaving a blank', () => {
    expect(describeLimit(null)).toBe('Unlimited');
    expect(describeLimit(undefined)).toBe('Unlimited');
  });

  it('formats a ceiling', () => {
    expect(describeLimit(20)).toBe('20');
  });
});
